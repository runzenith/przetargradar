import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Config } from './config.js';
import { hash } from './utils.js';
import { documentGet, documentLinks, type DocumentLink } from './document-fetch.js';
import { aggregateHash, ensureAnalysis } from './ingest.js';
const exec = promisify(execFile);
const native = (command: string, args: string[], options: Parameters<typeof exec>[2]) =>
  process.platform === 'linux'
    ? exec(
        'prlimit',
        ['--as=536870912', '--fsize=16000000', '--cpu=30', '--', command, ...args],
        options,
      )
    : exec(command, args, options);
export type DocumentMaterial = {
  sourceId: string;
  text: string;
};
export type DocumentReport = {
  url: string;
  name: string;
  status: string;
  contentHash?: string;
};
export async function materialSet(
  tx: Prisma.TransactionClient,
  notices: {
    id: string;
    sourceId: string;
    contentHash: string;
    text: string;
  }[],
  config: Config,
) {
  const scans =
    config.APP_MODE === 'LIVE' && config.DOCUMENTS_ENABLED
      ? await tx.documentScan.findMany({
          where: { noticeId: { in: notices.map((n) => n.id) }, status: 'completed' },
          orderBy: { noticeId: 'asc' },
        })
      : [];
  const docs = scans.flatMap((s) => s.materials as unknown as DocumentMaterial[]);
  const unique = [...new Map(docs.map((d) => [d.sourceId, d])).values()];
  return {
    materials: [...notices.map((n) => ({ sourceId: n.sourceId, text: n.text })), ...unique],
    inputHash: aggregateHash([
      ...notices,
      ...unique.map((d) => ({ sourceId: d.sourceId, contentHash: hash(d.text) })),
    ]),
  };
}
export async function extractPdf(
  bytes: Buffer,
  ocrPages = 0,
  signal?: AbortSignal,
): Promise<{
  text: string;
  ocr: boolean;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'radar-pdf-'));
  try {
    const input = join(dir, 'source.pdf');
    await writeFile(input, bytes);
    await native('pdftotext', ['-layout', '-enc', 'UTF-8', input, join(dir, 'text.txt')], {
      timeout: 25000,
      maxBuffer: 1000000,
      signal,
    });
    if ((await stat(join(dir, 'text.txt'))).size > 1200000) throw Error('DOCUMENT_TEXT_LIMIT');
    const raw = await readFile(join(dir, 'text.txt'), 'utf8');
    if (raw.length > 300000) throw Error('DOCUMENT_TEXT_LIMIT');
    const pages = raw.split('\f');
    if (!pages.at(-1)?.trim()) pages.pop();
    if (!pages.length) throw Error('DOCUMENT_NEEDS_OCR');
    const empty = pages.map((p, i) => ({ p, i })).filter(({ p }) => p.trim().length < 30);
    if (empty.length > ocrPages) throw Error('DOCUMENT_OCR_LIMIT');
    for (const { i } of empty) {
      signal?.throwIfAborted();
      const image = join(dir, 'page');
      await native(
        'pdftoppm',
        [
          '-f',
          String(i + 1),
          '-l',
          String(i + 1),
          '-scale-to',
          '1800',
          '-gray',
          '-singlefile',
          '-png',
          input,
          image,
        ],
        { timeout: 25000, maxBuffer: 1000000, signal },
      );
      const result = await native('tesseract', [image + '.png', 'stdout', '-l', 'pol+eng'], {
        timeout: 25000,
        maxBuffer: 2000000,
        signal,
      });
      pages[i] = String(result.stdout);
      await rm(image + '.png', { force: true });
    }
    const text = pages.map((p, i) => `[Strona ${i + 1}]\n${p.trim()}`).join('\n\n');
    if (text.length > 300000) throw Error('DOCUMENT_TEXT_LIMIT');
    return { text, ocr: empty.length > 0 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function asset(db: PrismaClient, link: DocumentLink, c: Config, signal: AbortSignal) {
  const id = hash(link.url),
    old = await db.documentAsset.findUnique({ where: { id } });
  if (
    old &&
    Date.now() - old.checkedAt.getTime() < (old.status.startsWith('extracted') ? 86400000 : 3600000)
  )
    return old;
  let bytes: Buffer | undefined,
    text = '',
    contentHash: string | null = null,
    status = 'fetch_failed';
  try {
    const used = await db.documentAsset.aggregate({ _sum: { byteSize: true } });
    if ((used._sum.byteSize ?? 0) >= c.DOCUMENT_STORAGE_MB * 1024 * 1024)
      throw Error('DOCUMENT_STORAGE_LIMIT');
    const r = await documentGet(link.url, c.DOCUMENT_MAX_BYTES, signal);
    bytes = r.body;
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw Error('DOCUMENT_NOT_PDF');
    contentHash = hash(bytes.toString('base64'));
    const same = await db.documentAsset.findFirst({
      where: {
        contentHash,
        status: { startsWith: 'extracted' },
        bytes: { not: null },
        id: { not: id },
      },
    });
    const extracted = same
      ? { text: same.text, ocr: same.status === 'extracted_ocr' }
      : await extractPdf(bytes, c.DOCUMENT_OCR_PAGES, signal);
    text = extracted.text;
    status =
      text.replace(/\[Strona \d+\]/g, '').trim().length < 80
        ? 'needs_ocr'
        : extracted.ocr
          ? 'extracted_ocr'
          : 'extracted';
    if (same) bytes = undefined;
  } catch (e) {
    if (old?.status.startsWith('extracted')) return { ...old, status: 'cached_stale' };
    if (!contentHash) bytes = undefined;
    status =
      e instanceof Error && /^DOCUMENT_[A-Z_]+$/.test(e.message)
        ? e.message.replace('DOCUMENT_', '').toLowerCase()
        : 'fetch_or_extract_failed';
  }
  return db.documentAsset.upsert({
    where: { id },
    create: {
      id,
      url: link.url,
      bytes: bytes ? new Uint8Array(bytes) : null,
      byteSize: bytes?.length ?? 0,
      text,
      contentHash,
      status,
      checkedAt: new Date(),
    },
    update: {
      bytes: bytes ? new Uint8Array(bytes) : null,
      byteSize: bytes?.length ?? 0,
      text,
      contentHash,
      status,
      checkedAt: new Date(),
    },
  });
}
export async function processOneDocumentScan(db: PrismaClient, c: Config, signal?: AbortSignal) {
  if (c.APP_MODE !== 'LIVE' || !c.DOCUMENTS_ENABLED) return false;
  const notice = await db.tenderNotice.findFirst({
    where: {
      current: true,
      tender: { isDemo: false, status: { not: 'closed' } },
      OR: [
        { documentScan: null },
        {
          documentScan: {
            nextAt: { lte: new Date() },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
          },
        },
      ],
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    include: { tender: true },
  });
  if (!notice) return false;
  await db.documentScan.upsert({
    where: { noticeId: notice.id },
    create: { noticeId: notice.id, report: [], materials: [], nextAt: new Date() },
    update: {},
  });
  const owner = randomUUID();
  const held = await db.documentScan.updateMany({
    where: { noticeId: notice.id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 240000) },
  });
  if (!held.count) return false;
  const combined = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const report: DocumentReport[] = [],
    materials: DocumentMaterial[] = [];
  try {
    const base = notice.tender.sourceKey.startsWith('bk:')
      ? 'https://bazakonkurencyjnosci.funduszeeuropejskie.gov.pl/'
      : (notice.tender.sourceUrl ?? 'https://ezamowienia.gov.pl/');
    const found = documentLinks([notice.raw, notice.tender.sourceUrl], base);
    const files = new Map(found.files.map((f) => [f.url, f]));
    const pages = [
      ...new Set([notice.tender.sourceUrl, ...found.pages].filter(Boolean) as string[]),
    ].slice(0, 2);
    for (const page of pages) {
      if (files.size >= c.DOCUMENT_MAX_FILES) break;
      try {
        const r = await documentGet(page, 1500000, combined);
        if (r.type.includes('text/html'))
          for (const f of documentLinks(r.body.toString('utf8'), r.url).files) files.set(f.url, f);
      } catch {
        report.push({ url: page, name: 'Strona dokumentacji', status: 'discovery_failed' });
      }
    }
    const sorted = [...files.values()].sort(
      (a, b) =>
        Number(/swz|specyfik|zapytan|opis|warunk/i.test(b.name)) -
        Number(/swz|specyfik|zapytan|opis|warunk/i.test(a.name)),
    );
    let chars = notice.text.length;
    for (const [i, link] of sorted.entries()) {
      if (i >= c.DOCUMENT_MAX_FILES) {
        report.push({ ...link, status: 'file_limit' });
        continue;
      }
      if (/\.(docx?|xlsx?|zip)(?:$|[?#])/i.test(link.name + ' ' + link.url)) {
        report.push({ ...link, status: 'unsupported_format' });
        continue;
      }
      combined.throwIfAborted();
      const file = await asset(db, link, c, combined);
      let status = file.status;
      const text = `Dokument: ${link.name}\n${file.text}`;
      if (
        (status.startsWith('extracted') || status === 'cached_stale') &&
        chars + text.length > c.AI_MAX_INPUT_CHARS
      )
        status = 'analysis_size_limit';
      if (status.startsWith('extracted') || status === 'cached_stale') {
        const sourceId = 'pdf:' + file.contentHash;
        if (!materials.some((m) => m.sourceId === sourceId)) {
          materials.push({ sourceId, text });
          chars += text.length;
        }
      }
      report.push({
        ...link,
        status,
        ...(file.contentHash ? { contentHash: file.contentHash } : {}),
      });
    }
  } catch {
    report.push({ url: '', name: 'Pobieranie dokumentacji', status: 'scan_interrupted' });
  }
  combined.throwIfAborted();
  await db.$transaction(async (tx) => {
    const saved = await tx.documentScan.updateMany({
      where: { noticeId: notice.id, leaseOwner: owner },
      data: {
        status: 'completed',
        report,
        materials,
        nextAt: new Date(
          Date.now() +
            (report.some((r) => /failed|interrupted|stale/.test(r.status)) ? 3600000 : 86400000),
        ),
        leaseOwner: null,
        leaseUntil: null,
      },
    });
    if (!saved.count) return;
    await tx.$queryRaw`SELECT id FROM tenders WHERE id=${notice.tenderId} FOR UPDATE`;
    const notices = await tx.tenderNotice.findMany({
      where: { tenderId: notice.tenderId, current: true },
    });
    const set = await materialSet(tx, notices, c);
    await tx.tender.update({
      where: { id: notice.tenderId },
      data: { contentHash: set.inputHash },
    });
    await ensureAnalysis(tx, notice.tenderId, notices[0]!.id, set.inputHash, c);
  });
  return true;
}
