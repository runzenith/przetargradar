import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Config } from './config.js';
import { normalizeNotice, type NoticeSource } from './bzp.js';
import { ingestNotice } from './ingest.js';
import { z } from 'zod';
import { ExternalError, hash, stableJson } from './utils.js';
export function recordExternalId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const id = r.objectId ?? r.ND ?? r['publication-number'] ?? r.id_zapytania ?? r.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id).slice(0, 191) : null;
}
async function quarantine(
  db: PrismaClient,
  sourceId: string,
  type: string,
  raw: unknown,
  code: string,
  mode: string,
) {
  const recordKey = hash(mode + ':' + sourceId + ':' + stableJson(raw));
  await db.syncRejectedRecord.upsert({
    where: { recordKey },
    create: {
      recordKey,
      mode,
      sourceId,
      noticeType: type,
      externalId: recordExternalId(raw),
      raw: { payload: JSON.parse(JSON.stringify(raw ?? null)) },
      code,
    },
    update: { code, attempts: { increment: 1 }, resolvedAt: null },
  });
}
const cursorSchema = z.record(z.string(), z.string().nullable());
const LEASE_MS = 90000;
export async function synchronize(
  db: PrismaClient,
  source: NoticeSource,
  config: Config,
  signal?: AbortSignal,
  until?: Date,
) {
  const owner = randomUUID();
  const sourceId = source.id ?? 'bzp';
  const noticeTypes = source.noticeTypes ?? [
    'ContractNotice',
    'NoticeUpdateNotice',
    'TenderResultNotice',
  ];
  const normalize = source.normalize ?? normalizeNotice;
  const stateId = sourceId === 'bzp' ? config.APP_MODE : `${config.APP_MODE}:${sourceId}`;
  await db.syncState.upsert({
    where: { id: stateId },
    create: { id: stateId },
    update: {},
  });
  const acquired = await db.syncState.updateMany({
    where: {
      id: stateId,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: {
      leaseOwner: owner,
      leaseUntil: new Date(Date.now() + LEASE_MS),
      requested: false,
    },
  });
  if (!acquired.count) return { status: 'locked' as const };
  const abort = new AbortController();
  const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  const heartbeat = setInterval(() => {
    void db.syncState
      .updateMany({
        where: { id: stateId, leaseOwner: owner },
        data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
      })
      .then((r) => {
        if (!r.count) abort.abort();
      })
      .catch(() => abort.abort());
  }, 20000);
  heartbeat.unref();
  let logId: string | undefined;
  let outsideWindow = false;
  const counters = {
    pages: 0,
    fetched: 0,
    created: 0,
    changed: 0,
    skipped: 0,
    filtered: 0,
    errors: 0,
  };
  try {
    await db.syncLog.updateMany({
      where: { status: 'running', sourceId },
      data: {
        status: 'interrupted',
        finishedAt: new Date(),
        errorSummary: 'Poprzedni proces zakończył się przed zwolnieniem blokady',
      },
    });
    const state = await db.syncState.findUniqueOrThrow({
      where: { id: stateId },
    });
    const now = until ?? new Date();
    const from =
      state.windowFrom ??
      new Date(
        state.checkpoint
          ? state.checkpoint.getTime() - config.SYNC_OVERLAP_MINUTES * 60000
          : now.getTime() - config.SYNC_WINDOW_HOURS * 3600000,
      );
    const to = source.isSnapshot
      ? now
      : (state.windowTo ??
        new Date(
          Math.min(
            now.getTime(),
            (state.checkpoint?.getTime() ?? from.getTime()) +
              (source.windowHours ?? config.SYNC_WINDOW_HOURS) * 3600000,
          ),
        ));
    const cursors = state.cursors ? cursorSchema.parse(state.cursors) : {};
    await db.syncState.update({
      where: { id: stateId, leaseOwner: owner },
      data: { windowFrom: from, windowTo: to, cursors },
    });
    const log = await db.syncLog.create({
      data: {
        status: 'running',
        sourceId,
        windowFrom: from,
        windowTo: to,
        correlationId: owner,
      },
    });
    logId = log.id;
    let lastProgress = 0;
    const progress = async () => {
      if (Date.now() - lastProgress >= 2000) {
        await db.syncLog.update({ where: { id: log.id }, data: counters });
        lastProgress = Date.now();
      }
    };
    let partial = false;
    for (const type of noticeTypes) {
      if (cursors[type] === '__done__') continue;
      while (true) {
        combined.throwIfAborted();
        const remaining =
          config.SYNC_MAX_RECORDS > 0
            ? config.SYNC_MAX_RECORDS - counters.fetched
            : Number.MAX_SAFE_INTEGER;
        if (remaining <= 0) {
          partial = true;
          break;
        }
        const size = Math.min(config.BZP_PAGE_SIZE, remaining);
        const cursor = cursors[type] ?? null;
        const result = await source.page(type, from, to, cursor, size, combined);
        const page = Array.isArray(result) ? result : result.items;
        const nextCursor = Array.isArray(result)
          ? page.length
            ? (recordExternalId(page.at(-1)) ?? normalize(page.at(-1)).sourceId)
            : null
          : result.nextCursor;
        counters.pages++;
        for (const input of page) {
          combined.throwIfAborted();
          counters.fetched++;
          await progress();
          let raw = input;
          if (source.hydrate) {
            try {
              raw = await source.hydrate(input, combined);
            } catch (error) {
              if (
                error instanceof z.ZodError ||
                error instanceof SyntaxError ||
                (error instanceof ExternalError && error.status === 404) ||
                (error instanceof Error &&
                  /^(TED_(XML|NOTICE)_[A-Z_]+|BK detail identifier mismatch)$/.test(error.message))
              ) {
                await quarantine(db, sourceId, type, input, 'HYDRATION_INVALID', config.APP_MODE);
                counters.errors++;
                continue;
              }
              throw error;
            }
          }
          let normalized;
          try {
            normalized = normalize(raw);
          } catch {
            await quarantine(db, sourceId, type, raw, 'NORMALIZATION_FAILED', config.APP_MODE);
            counters.errors++;
            continue;
          }
          if (
            config.APP_MODE === 'LIVE' &&
            source.strictWindow !== false &&
            (normalized.publishedAt < from || normalized.publishedAt > to)
          ) {
            if (source.filterWindow) {
              counters.filtered++;
              continue;
            }
            outsideWindow = true;
            throw new Error('Publication date outside requested window');
          }
          counters[await ingestNotice(db, raw, config, normalize)]++;
          await db.syncRejectedRecord.updateMany({
            where: {
              sourceId,
              mode: config.APP_MODE,
              resolvedAt: null,
              OR: [
                { externalId: normalized.sourceId },
                ...(recordExternalId(input) ? [{ externalId: recordExternalId(input) }] : []),
                { recordKey: hash(config.APP_MODE + ':' + sourceId + ':' + stableJson(raw)) },
              ],
            },
            data: { resolvedAt: new Date() },
          });
          await progress();
        }
        const next = nextCursor;
        if (next && next === cursor)
          throw new Error(`${sourceId} returned the same pagination cursor`);
        cursors[type] = !next || (Array.isArray(result) && page.length < size) ? '__done__' : next;
        const saved = await db.syncState.updateMany({
          where: { id: stateId, leaseOwner: owner },
          data: { cursors: cursors as Prisma.InputJsonValue },
        });
        if (!saved.count) throw new Error('Synchronization lease lost');
        await db.syncLog.update({ where: { id: logId }, data: counters });
        if (cursors[type] === '__done__') break;
      }
      if (partial) break;
    }
    const complete = noticeTypes.every((type) => cursors[type] === '__done__');
    if (complete)
      await db.syncState.update({
        where: { id: stateId, leaseOwner: owner },
        data: { checkpoint: to, windowFrom: null, windowTo: null, cursors: {} },
      });
    const status: 'completed' | 'partial' = complete ? 'completed' : 'partial';
    await db.syncLog.update({
      where: { id: logId },
      data: {
        ...counters,
        status,
        finishedAt: new Date(),
        errorSummary: counters.errors
          ? 'Odłożono ' +
            counters.errors +
            ' niepoprawnych rekordów do ponownego importu; pozostałe zapisano.'
          : null,
      },
    });
    return { status, ...counters };
  } catch (error) {
    const message = outsideWindow
      ? `${sourceId} returned publication dates outside the requested window; checkpoint retained`
      : combined.aborted
        ? 'Synchronization interrupted; window retained'
        : error instanceof Error && /^(External HTTP \d+|TED_[A-Z_]+)$/.test(error.message)
          ? error.message
          : 'Synchronization failed; checkpoint retained, next run replays the incomplete page';
    if (logId)
      await db.syncLog.update({
        where: { id: logId },
        data: {
          ...counters,
          errors: Math.max(1, counters.errors),
          status: 'failed',
          finishedAt: new Date(),
          errorSummary: message,
        },
      });
    throw error instanceof ExternalError ? error : new Error(message);
  } finally {
    clearInterval(heartbeat);
    await db.syncState.updateMany({
      where: { id: stateId, leaseOwner: owner },
      data: { leaseOwner: null, leaseUntil: null },
    });
  }
}
export async function synchronizeCycle(
  db: PrismaClient,
  source: NoticeSource,
  config: Config,
  signal?: AbortSignal,
) {
  const cutoff = new Date();
  const stateId =
    (source.id ?? 'bzp') === 'bzp' ? config.APP_MODE : config.APP_MODE + ':' + source.id;
  const totals = {
    pages: 0,
    fetched: 0,
    created: 0,
    changed: 0,
    skipped: 0,
    filtered: 0,
    errors: 0,
    windows: 0,
  };
  while (!signal?.aborted) {
    const result = await synchronize(
      db,
      source,
      { ...config, SYNC_MAX_RECORDS: 0 },
      signal,
      cutoff,
    );
    if (result.status === 'locked') return { status: 'locked' as const, ...totals };
    for (const k of [
      'pages',
      'fetched',
      'created',
      'changed',
      'skipped',
      'filtered',
      'errors',
    ] as const)
      totals[k] += result[k];
    totals.windows++;
    const state = await db.syncState.findUniqueOrThrow({ where: { id: stateId } });
    if (state.checkpoint && state.checkpoint >= cutoff)
      return { status: 'completed' as const, ...totals };
    if (result.status === 'completed' && !state.checkpoint)
      throw new Error('Missing completed checkpoint');
  }
  signal?.throwIfAborted();
  return { status: 'interrupted' as const, ...totals };
}
