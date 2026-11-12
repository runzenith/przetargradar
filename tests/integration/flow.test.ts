import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { configSchema } from '../../packages/core/src/config.js';
import { DemoSource, demoNotices } from '../../packages/core/src/demo.js';
import { ingestNotice } from '../../packages/core/src/ingest.js';
import { synchronize } from '../../packages/core/src/sync.js';
import { claimJob, processOneJob, reserveAiCall } from '../../packages/core/src/jobs.js';
import { buildApp } from '../../apps/api/src/app.js';
import { normalizePz } from '../../packages/core/src/public-feeds.js';
const db = new PrismaClient();
const config = configSchema.parse(process.env);
if (!new URL(config.DATABASE_URL).pathname.endsWith('_test'))
  throw new Error('Refusing to clean a non-test database');
beforeAll(async () => {
  await db.$connect();
});
beforeEach(async () => {
  await db.userTender.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.aiProviderState.deleteMany();
  await db.tenderMatch.deleteMany();
  await db.companyProfile.deleteMany();
  await db.analysisJob.deleteMany();
  await db.tenderAnalysis.deleteMany();
  await db.documentScan.deleteMany();
  await db.documentAsset.deleteMany();
  await db.tenderNotice.deleteMany();
  await db.tender.deleteMany();
  await db.syncRejectedRecord.deleteMany();
  await db.syncLog.deleteMany();
  await db.syncState.deleteMany();
  await db.aiBudget.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});
describe('durable MySQL pipeline', () => {
  it('ingests a public feed idempotently and retains another source running log', async () => {
    const raw = {
      id_zapytania: '20',
      nazwa: 'Usługa testowa',
      firma_wystawiajaca: 'Urząd testowy',
      data_rozpoczecia: '2026-11-10 10:00:00',
      data_zakonczenia: '2026-12-01 12:00:00',
      opis_i_specyfikacja: 'Pełny opis usługi testowej.',
    };
    expect(await ingestNotice(db, raw, config, normalizePz)).toBe('created');
    expect(await ingestNotice(db, raw, config, normalizePz)).toBe('skipped');
    expect(await db.tender.count()).toBe(1);
    expect(await db.analysisJob.count()).toBe(1);
    const other = await db.syncLog.create({
      data: {
        sourceId: 'ted',
        status: 'running',
        windowFrom: new Date(),
        windowTo: new Date(),
        correlationId: 'another-source-running',
      },
    });
    await synchronize(db, new DemoSource([]), config);
    expect((await db.syncLog.findUniqueOrThrow({ where: { id: other.id } })).status).toBe(
      'running',
    );
    expect(await db.syncLog.count({ where: { sourceId: 'bzp', status: 'completed' } })).toBe(1);
  });
  it('maps all database results, shares list filters and accounts for unresolved places without AI calls', async () => {
    const notices = demoNotices();
    await ingestNotice(db, notices[0], config);
    await ingestNotice(db, { ...notices[1], organizationCity: 'Nieznana miejscowość 123' }, config);
    const app = await buildApp(db, config);
    try {
      const result = (await app.inject('/api/map')).json();
      expect(result.total).toBe(2);
      expect(result.unmapped).toBe(1);
      expect(
        result.points.reduce(
          (
            n: number,
            p: {
              count: number;
            },
          ) => n + p.count,
          0,
        ),
      ).toBe(1);
      const city = result.points[0].city;
      const cityList = (await app.inject('/api/tenders?city=' + encodeURIComponent(city))).json();
      expect(cityList.total).toBe(1);
      for (const filter of ['status=active', 'status=closed', 'q=systemu', 'category=services']) {
        const map = (await app.inject('/api/map?' + filter)).json();
        const list = (await app.inject('/api/tenders?' + filter)).json();
        expect(map.total).toBe(list.total);
      }
      expect(await db.analysisJob.count({ where: { status: 'completed' } })).toBe(0);
      expect(
        await db.aiCall.count({
          where: {
            jobId: {
              in: (await db.analysisJob.findMany({ select: { id: true } })).map((j) => j.id),
            },
          },
        }),
      ).toBe(0);
    } finally {
      await app.close();
    }
  });
  it('rejects out-of-window LIVE records without advancing the checkpoint', async () => {
    const n = demoNotices()[0]!;
    const inRange = { ...n, publicationDate: new Date(Date.now() - 60000).toISOString() };
    const outside = {
      ...demoNotices()[1]!,
      publicationDate: new Date(Date.now() + 86400000).toISOString(),
    };
    await expect(
      synchronize(db, new DemoSource([inRange, outside]), { ...config, APP_MODE: 'LIVE' }),
    ).rejects.toThrow('outside the requested window');
    expect(await db.tender.count()).toBe(1);
    expect((await db.syncState.findUniqueOrThrow({ where: { id: 'LIVE' } })).checkpoint).toBeNull();
    expect((await db.syncLog.findFirstOrThrow()).errors).toBe(1);
  });
  it('imports and analyzes idempotently, preserving exact decimal strings', async () => {
    const source = new DemoSource(demoNotices().slice(0, 2));
    await synchronize(db, source, config);
    while (await processOneJob(db, config)) {}
    const initial = await db.tenderAnalysis.findMany();
    expect(initial).toHaveLength(2);
    await synchronize(db, source, config);
    while (await processOneJob(db, config)) {}
    expect(await db.tender.count()).toBe(2);
    expect(await db.tenderNotice.count()).toBe(2);
    expect(await db.analysisJob.count()).toBe(2);
    expect((await db.tenderAnalysis.findMany()).map((a) => a.id).sort()).toEqual(
      initial.map((a) => a.id).sort(),
    );
    const first = await db.tender.findUniqueOrThrow({
      where: { sourceKey: 'bzp:demo-procedure-1' },
    });
    expect(first.estimatedValue?.toFixed(2)).toBe('280000.00');
  });
  it('versions updated content without destroying the earlier successful analysis', async () => {
    const notice = demoNotices()[0]!;
    await ingestNotice(db, notice, config);
    await processOneJob(db, config);
    await ingestNotice(
      db,
      {
        ...notice,
        htmlBody: notice.htmlBody + '<p>Dodatkowe wyjaśnienie.</p>',
      },
      config,
    );
    expect(await db.tenderNotice.count()).toBe(2);
    expect(await db.tenderAnalysis.count({ where: { status: 'completed' } })).toBe(1);
    expect((await db.tender.findFirstOrThrow()).analysisStatus).toBe('stale');
    await processOneJob(db, config);
    expect(await db.tenderAnalysis.count({ where: { status: 'completed' } })).toBe(2);
  });
  it('resumes a capped window without advancing its checkpoint past unimported pages', async () => {
    const source = new DemoSource(demoNotices().slice(0, 3));
    const capped = { ...config, BZP_PAGE_SIZE: 2, SYNC_MAX_RECORDS: 2 };
    expect((await synchronize(db, source, capped)).status).toBe('partial');
    const state = await db.syncState.findUniqueOrThrow({
      where: { id: 'DEMO' },
    });
    expect(state.checkpoint).toBeNull();
    expect(state.windowFrom).not.toBeNull();
    expect((await synchronize(db, source, capped)).status).toBe('completed');
    expect(await db.tender.count()).toBe(3);
    expect(
      (await db.syncState.findUniqueOrThrow({ where: { id: 'DEMO' } })).checkpoint,
    ).not.toBeNull();
  });
  it('keeps data and a safe cursor after external failure, then resumes', async () => {
    const real = new DemoSource(demoNotices().slice(0, 3));
    let calls = 0;
    const broken = {
      page: async (...args: Parameters<DemoSource['page']>) => {
        if (++calls === 2) throw new Error('provider down');
        return real.page(...args);
      },
    };
    await expect(synchronize(db, broken, { ...config, BZP_PAGE_SIZE: 2 })).rejects.toThrow(
      'checkpoint retained',
    );
    expect(await db.tender.count()).toBe(2);
    expect((await db.syncState.findUniqueOrThrow({ where: { id: 'DEMO' } })).checkpoint).toBeNull();
    await synchronize(db, real, config);
    expect(await db.tender.count()).toBe(3);
    expect(await db.syncLog.count({ where: { status: 'failed' } })).toBe(1);
  });
  it('quarantines malformed records without blocking later pages or losing the source payload', async () => {
    const result = await synchronize(
      db,
      new DemoSource([
        demoNotices()[0],
        { noticeType: 'ContractNotice', objectId: 'broken' },
        demoNotices()[1],
      ]),
      config,
    );
    expect(result.status).toBe('completed');
    expect(await db.tender.count()).toBe(2);
    const bad = await db.syncRejectedRecord.findFirstOrThrow();
    expect(bad.raw).toMatchObject({ payload: { objectId: 'broken' } });
    expect(bad.mode).toBe(config.APP_MODE);
    expect(
      (await db.syncState.findUniqueOrThrow({ where: { id: 'DEMO' } })).checkpoint,
    ).not.toBeNull();
    expect((await db.syncLog.findFirstOrThrow()).errors).toBe(1);
  });
  it('locks overlapping synchronizations', async () => {
    await db.syncState.create({
      data: {
        id: 'DEMO',
        leaseOwner: 'another-worker',
        leaseUntil: new Date(Date.now() + 60000),
      },
    });
    expect((await synchronize(db, new DemoSource(), config)).status).toBe('locked');
    expect(await db.tender.count()).toBe(0);
  });
  it('atomically claims once and recovers an expired lease', async () => {
    await ingestNotice(db, demoNotices()[0], config);
    const claims = await Promise.all([
      claimJob(db, config, 'worker-a'),
      claimJob(db, config, 'worker-b'),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claimed = claims.find(Boolean)!;
    await db.analysisJob.update({
      where: { id: claimed.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    expect((await claimJob(db, config, 'recovery'))?.leaseOwner).toBe('recovery');
  });
  it('obsoletes a job whose input changed before claim', async () => {
    const n = demoNotices()[0]!;
    await ingestNotice(db, n, config);
    await ingestNotice(db, { ...n, htmlBody: n.htmlBody + '<p>Zmiana.</p>' }, config);
    while (await processOneJob(db, config)) {}
    expect(await db.analysisJob.count({ where: { status: 'obsolete' } })).toBe(1);
    expect(await db.tenderAnalysis.count()).toBe(1);
  });
  it('reuses an earlier cache entry after source content reverts', async () => {
    const n = demoNotices()[0]!;
    await ingestNotice(db, n, config);
    await processOneJob(db, config);
    const original = await db.tenderAnalysis.findFirstOrThrow();
    await ingestNotice(db, { ...n, htmlBody: n.htmlBody + '<p>Zmiana.</p>' }, config);
    await processOneJob(db, config);
    await ingestNotice(db, n, config);
    expect((await db.tender.findFirstOrThrow()).analysisStatus).toBe('completed');
    expect(await db.tenderAnalysis.count()).toBe(2);
    const app = await buildApp(db, config);
    try {
      const id = (await db.tender.findFirstOrThrow()).id;
      const result = (await app.inject('/api/tenders/' + id)).json();
      expect(result.analysis.id).toBe(original.id);
    } finally {
      await app.close();
    }
  });
  it('marks an exhausted crashed job and its tender as failed', async () => {
    await ingestNotice(db, demoNotices()[0], config);
    const job = await claimJob(db, config, 'crashed');
    await db.analysisJob.update({
      where: { id: job!.id },
      data: {
        attempts: config.AI_MAX_ATTEMPTS,
        leaseUntil: new Date(Date.now() - 1000),
      },
    });
    await processOneJob(db, config);
    expect((await db.analysisJob.findFirstOrThrow()).status).toBe('failed');
    expect((await db.tender.findFirstOrThrow()).analysisStatus).toBe('failed');
  });
  it('keeps a successful analysis when all attempts on updated content fail validation', async () => {
    const n = demoNotices()[0]!;
    await ingestNotice(db, n, config);
    await processOneJob(db, config);
    const previous = await db.tenderAnalysis.findFirstOrThrow();
    await ingestNotice(db, { ...n, htmlBody: '<p>' + 'A'.repeat(500) + '</p>' }, config);
    for (let i = 0; i < config.AI_MAX_ATTEMPTS; i++) {
      await db.analysisJob.updateMany({
        where: { status: 'pending' },
        data: { availableAt: new Date(Date.now() - 1000) },
      });
      await processOneJob(db, config);
    }
    expect(await db.tenderAnalysis.count({ where: { status: 'completed' } })).toBe(1);
    expect(
      (
        await db.tenderAnalysis.findUniqueOrThrow({
          where: { id: previous.id },
        })
      ).result,
    ).toEqual(previous.result);
    expect((await db.tender.findFirstOrThrow()).analysisStatus).toBe('stale');
    expect(await db.analysisJob.count({ where: { status: 'failed' } })).toBe(1);
  });
  it('does not overwrite a deadline after an uncertain correction', async () => {
    const n = demoNotices()[0]!;
    await ingestNotice(db, n, config);
    await ingestNotice(
      db,
      {
        ...n,
        objectId: 'correction-1',
        noticeType: 'NoticeUpdateNotice',
        submittingOffersDate: null,
        htmlBody: '<p>Zmieniono termin, sprawdź ogłoszenie.</p>',
      },
      config,
    );
    const t = await db.tender.findFirstOrThrow();
    expect(t.deadline).toBeNull();
    expect(t.status).toBe('unknown');
    expect(t.statusBasis).toContain('sprostowanie');
  });
  it('enforces the daily budget atomically across processes', async () => {
    const calls = await Promise.allSettled([reserveAiCall(db, 1), reserveAiCall(db, 1)]);
    expect(calls.filter((c) => c.status === 'fulfilled')).toHaveLength(1);
    expect((await db.aiBudget.findFirstOrThrow()).calls).toBe(1);
  });
});
describe('API on real database', () => {
  it('filters and paginates in the database, validates sorting and protects admin sync', async () => {
    await synchronize(db, new DemoSource(), config);
    while (await processOneJob(db, config)) {}
    const app = await buildApp(db, config);
    try {
      const response = await app.inject('/api/tenders?category=services&pageSize=2&page=2');
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(9);
      expect(body.items.every((t: { category: string }) => t.category === 'services')).toBe(true);
      const q = (await app.inject('/api/tenders?q=obiegu')).json();
      expect(q.total).toBe(1);
      expect(q.items[0].estimatedValue).toBe('280000.00');
      const detail = await app.inject('/api/tenders/' + q.items[0].id);
      expect(detail.json().analysis.requirements).toHaveLength(1);
      expect(detail.json().notices[0].text).toContain('Wartość szacunkowa');
      expect((await app.inject('/api/tenders?sort=DROP_TABLE')).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/admin/sync' })).statusCode).toBe(404);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/admin/sync',
            headers: { authorization: 'Bearer ' + config.ADMIN_TOKEN },
          })
        ).statusCode,
      ).toBe(404);
      expect((await db.syncState.findUniqueOrThrow({ where: { id: 'DEMO' } })).requested).toBe(
        false,
      );
      expect((await app.inject('/api/ready')).statusCode).toBe(200);
      expect((await app.inject('/api/docs/json')).json().paths['/api/tenders']).toBeDefined();
    } finally {
      await app.close();
    }
  });
  it('keeps DEMO records out of a LIVE read API', async () => {
    await ingestNotice(db, demoNotices()[0], config);
    const app = await buildApp(db, { ...config, APP_MODE: 'LIVE' });
    try {
      const body = (await app.inject('/api/tenders')).json();
      expect(body.total).toBe(0);
      const id = (await db.tender.findFirstOrThrow()).id;
      expect((await app.inject('/api/tenders/' + id)).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
