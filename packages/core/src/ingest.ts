import { materialSet } from './documents.js';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Config } from './config.js';
import { providerModel } from './config.js';
import { normalizeNotice, type NormalizedNotice } from './bzp.js';
import { hash, stableJson } from './utils.js';
import { analysisSchema } from '../../contracts/src/index.js';
export const PROMPT_VERSION = 'notice-full-v2';
export const SCHEMA_VERSION = '1';
export const analysisModel = (config: Config) =>
  config.APP_MODE === 'DEMO' ? 'deterministic-v1' : providerModel(config);
export const cacheKeyFor = (inputHash: string, config: Config) =>
  hash(
    [
      inputHash,
      ...(config.APP_MODE === 'LIVE' && config.AI_AUTO_PROVIDER
        ? ['auto-v1', config.GEMINI_MODEL, config.GROQ_MODEL]
        : []),
      config.APP_MODE,
      analysisModel(config),
      PROMPT_VERSION,
      SCHEMA_VERSION,
      ...(config.APP_MODE === 'LIVE' && config.ANALYSIS_PROVIDER === 'groq' ? ['groq'] : []),
    ].join(':'),
  );
export function aggregateHash(
  notices: {
    sourceId: string;
    contentHash: string;
  }[],
) {
  return hash(
    stableJson(
      notices
        .map((n) => ({ sourceId: n.sourceId, contentHash: n.contentHash }))
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    ),
  );
}
export async function ensureAnalysis(
  tx: Prisma.TransactionClient,
  tenderId: string,
  noticeId: string,
  inputHash: string,
  config: Config,
) {
  const key = cacheKeyFor(inputHash, config);
  if (config.APP_MODE === 'LIVE' && config.AI_AUTO_PROVIDER) {
    const existing = await tx.tenderAnalysis.findFirst({
      where: { tenderId, inputHash, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && !analysisSchema.parse(existing.result).scope.truncated) {
      const value = analysisSchema.parse(existing.result).estimatedValue;
      await tx.tender.update({
        where: { id: tenderId },
        data: {
          analysisStatus: 'completed',
          estimatedValue: value?.amount ?? null,
          currency: value?.currency ?? null,
          valueBasis: value?.basis ?? null,
        },
      });
      return;
    }
  }
  const cached = await tx.tenderAnalysis.findUnique({
    where: { cacheKey: key },
  });
  if (cached?.status === 'completed') {
    const value = analysisSchema.parse(cached.result).estimatedValue;
    await tx.tender.update({
      where: { id: tenderId },
      data: {
        analysisStatus: 'completed',
        estimatedValue: value?.amount ?? null,
        currency: value?.currency ?? null,
        valueBasis: value?.basis ?? null,
      },
    });
    return;
  }
  const job = await tx.analysisJob.upsert({
    where: { dedupeKey: key },
    create: { noticeId, dedupeKey: key },
    update: {},
  });
  const previous = await tx.tenderAnalysis.findFirst({
    where: { tenderId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { inputHash: true },
  });
  const sameInput = await tx.tenderAnalysis.count({
    where: { tenderId, status: 'completed', inputHash },
  });
  await tx.tender.update({
    where: { id: tenderId },
    data: {
      analysisStatus: sameInput
        ? 'completed'
        : previous
          ? 'stale'
          : job.status === 'failed'
            ? 'failed'
            : job.status === 'processing'
              ? 'processing'
              : 'pending',
    },
  });
}
export async function ingestNotice(
  db: PrismaClient,
  input: unknown,
  config: Config,
  normalize: (input: unknown) => NormalizedNotice = normalizeNotice,
): Promise<'created' | 'changed' | 'skipped'> {
  const n = normalize(input);
  return db.$transaction(async (tx) => {
    const old = await tx.tender.findUnique({
      where: { sourceKey: n.sourceKey },
    });
    const previous = await tx.tenderNotice.findFirst({
      where: { sourceId: n.sourceId, current: true },
    });
    if (old && old.isDemo !== (config.APP_MODE === 'DEMO'))
      throw new Error('Mode mismatch: use separate databases for DEMO and LIVE');
    if (previous?.contentHash === n.contentHash && old) {
      const current = await tx.tenderNotice.findMany({
        where: { tenderId: old.id, current: true },
      });
      const { inputHash } = await materialSet(tx, current, config);
      await tx.tender.update({ where: { id: old.id }, data: { contentHash: inputHash } });
      await ensureAnalysis(tx, old.id, previous.id, inputHash, config);
      return 'skipped';
    }
    const tender =
      old ??
      (await tx.tender.create({
        data: {
          sourceKey: n.sourceKey,
          procedureId: n.procedureId,
          title: n.title,
          buyer: n.buyer,
          buyerCity: n.buyerCity,
          buyerRegion: n.buyerRegion,
          cpv: n.cpv,
          category: n.category,
          publishedAt: n.publishedAt,
          deadline: n.deadline,
          sourceUrl: n.sourceUrl,
          contentHash: n.contentHash,
          statusBasis: 'Brak potwierdzonego terminu',
          isDemo: config.APP_MODE === 'DEMO',
        },
      }));
    await tx.tenderNotice.updateMany({
      where: { sourceId: n.sourceId, current: true },
      data: { current: false },
    });
    const notice = await tx.tenderNotice.upsert({
      where: {
        sourceId_contentHash: {
          sourceId: n.sourceId,
          contentHash: n.contentHash,
        },
      },
      create: {
        tenderId: tender.id,
        sourceId: n.sourceId,
        noticeNumber: n.noticeNumber,
        noticeType: n.noticeType,
        procedureId: n.procedureId,
        raw: n.raw as Prisma.InputJsonValue,
        text: n.text,
        contentHash: n.contentHash,
        publishedAt: n.publishedAt,
      },
      update: { current: true, fetchedAt: new Date() },
    });
    const current = await tx.tenderNotice.findMany({
      where: { tenderId: tender.id, current: true },
      orderBy: [{ publishedAt: 'asc' }, { sourceId: 'asc' }],
    });
    const { inputHash } = await materialSet(tx, current, config);
    const latestContract = current.filter((x) => x.noticeType === 'ContractNotice').at(-1);
    const canonical = latestContract ? normalize(latestContract.raw) : n;
    const hasUpdates = current.some((x) => x.noticeType === 'NoticeUpdateNotice');
    const hasResult = current.some((x) => x.noticeType === 'TenderResultNotice');
    const deadline = hasUpdates || !latestContract ? null : canonical.deadline;
    await tx.tender.update({
      where: { id: tender.id },
      data: {
        title: canonical.title,
        buyer: canonical.buyer,
        buyerCity: canonical.buyerCity,
        buyerRegion: canonical.buyerRegion,
        cpv: canonical.cpv,
        category: canonical.category,
        publishedAt: current.at(-1)!.publishedAt,
        deadline,
        sourceUrl: canonical.sourceUrl,
        status: hasResult
          ? 'closed'
          : deadline
            ? deadline > new Date()
              ? 'active'
              : 'closed'
            : 'unknown',
        statusBasis: hasResult
          ? 'Opublikowano ogłoszenie o wyniku; sprawdź wynik w źródle'
          : hasUpdates
            ? 'Powiązane sprostowanie — termin wymaga sprawdzenia'
            : deadline
              ? 'Termin składania ofert z danych BZP'
              : 'Brak potwierdzonego terminu; sprawdź dokumentację',
        contentHash: inputHash,
        analysisStatus: old ? 'stale' : 'pending',
        estimatedValue: null,
        currency: null,
        valueBasis: null,
      },
    });
    await ensureAnalysis(tx, tender.id, notice.id, inputHash, config);
    return old ? 'changed' : 'created';
  });
}
