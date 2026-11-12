import { beforeEach, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { configSchema } from '../../packages/core/src/config';
import { normalizeNotice, type NoticeSource } from '../../packages/core/src/bzp';
import { synchronize, synchronizeCycle } from '../../packages/core/src/sync';
const write = vi.hoisted(() => vi.fn(async () => 'created' as const));
vi.mock('../../packages/core/src/ingest.js', () => ({ ingestNotice: write }));
beforeEach(() => write.mockReset().mockResolvedValue('created'));
const config = configSchema.parse({
  DATABASE_URL: 'mysql://test',
  ADMIN_TOKEN: '123456789012345678901234',
  APP_MODE: 'LIVE',
  LOG_LEVEL: 'silent',
  SYNC_WINDOW_HOURS: 2,
});
const raw = (id: number, when = new Date(Date.now() - 10000)) => ({
  objectId: String(id),
  noticeType: 'ContractNotice',
  publicationDate: when.toISOString(),
  orderObject: 'Testowe zamówienie',
  organizationName: 'Urząd testowy',
  htmlBody: '<p>Pełne ogłoszenie.</p>',
});
function memory(checkpoint: Date | null = null) {
  const states = new Map<string, any>();
  const logs: any[] = [];
  const rejected = new Map<string, any>();
  const db = {
    syncState: {
      upsert: vi.fn(async ({ where, create }: any) => {
        if (!states.has(where.id))
          states.set(where.id, {
            ...create,
            checkpoint,
            windowFrom: null,
            windowTo: null,
            cursors: {},
            leaseOwner: null,
            leaseUntil: null,
          });
        return states.get(where.id);
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => states.get(where.id)),
      update: vi.fn(async ({ where, data }: any) => Object.assign(states.get(where.id), data)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const s = states.get(where.id);
        if (!s || (where.leaseOwner && where.leaseOwner !== s.leaseOwner)) return { count: 0 };
        Object.assign(s, data);
        return { count: 1 };
      }),
    },
    syncLog: {
      create: vi.fn(async ({ data }: any) => {
        const l = { ...data, id: String(logs.length + 1), startedAt: new Date() };
        logs.push(l);
        return l;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      update: vi.fn(async ({ where, data }: any) =>
        Object.assign(
          logs.find((l) => l.id === where.id),
          data,
        ),
      ),
    },
    syncRejectedRecord: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const p = rejected.get(where.recordKey);
        if (p) {
          p.attempts++;
          p.code = update.code;
        } else rejected.set(where.recordKey, { ...create, attempts: 1, resolvedAt: null });
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  } as unknown as PrismaClient;
  return { db, states, logs, rejected };
}
function source(items: unknown[]): NoticeSource {
  return {
    id: 'bzp',
    noticeTypes: ['ContractNotice'],
    strictWindow: false,
    normalize: normalizeNotice,
    page: vi.fn(async (_t, _f, _to, cursor, size) => {
      const start = Number(cursor ?? 0);
      return {
        items: items.slice(start, start + size),
        nextCursor: start + size < items.length ? String(start + size) : null,
      };
    }),
  };
}
it('drains beyond the legacy 50-record cap without creating partial runs', async () => {
  const m = memory();
  const s = source(Array.from({ length: 120 }, (_, i) => raw(i + 1)));
  const result = await synchronizeCycle(m.db, s, { ...config, SYNC_MAX_RECORDS: 50 });
  expect(result).toMatchObject({ status: 'completed', fetched: 120, created: 120, errors: 0 });
  expect(m.logs.every((l) => l.status === 'completed')).toBe(true);
  expect(write).toHaveBeenCalledTimes(120);
});
it('filters out-of-window BZP results and still reaches the next page and checkpoint', async () => {
  const m = memory();
  const cutoff = new Date();
  const s = {
    ...source([
      raw(1, new Date(cutoff.getTime() - 1000)),
      raw(2, new Date(cutoff.getTime() - 4 * 3600000)),
      raw(3, new Date(cutoff.getTime() + 3600000)),
    ]),
    strictWindow: true,
    filterWindow: true,
  };
  const result = await synchronize(m.db, s, config, undefined, cutoff);
  expect(result).toMatchObject({ status: 'completed', created: 1, filtered: 2, errors: 0 });
  expect(m.states.get('LIVE').checkpoint).toEqual(cutoff);
});
it('persists malformed source data for retry and imports the following valid record', async () => {
  const m = memory();
  const result = await synchronize(m.db, source([raw(1), { objectId: 'broken' }, raw(3)]), config);
  expect(result).toMatchObject({ status: 'completed', created: 2, errors: 1 });
  expect(m.rejected.size).toBe(1);
  expect([...m.rejected.values()][0].raw.payload).toEqual({ objectId: 'broken' });
  expect(m.states.get('LIVE').checkpoint).not.toBeNull();
});
it('retains a page cursor on storage failure instead of quarantining a database error', async () => {
  const m = memory();
  write.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(synchronize(m.db, source([raw(1)]), config)).rejects.toThrow('checkpoint retained');
  expect(m.rejected.size).toBe(0);
  expect(m.states.get('LIVE').checkpoint).toBeNull();
  expect(m.states.get('LIVE').cursors).toEqual({});
});
it('catches up overdue windows immediately to one fixed cutoff', async () => {
  const m = memory(new Date(Date.now() - 7 * 3600000));
  const result = await synchronizeCycle(m.db, source([]), config);
  expect(result.status).toBe('completed');
  expect(result.windows).toBeGreaterThanOrEqual(4);
  expect(m.logs.every((l) => l.status === 'completed')).toBe(true);
});
