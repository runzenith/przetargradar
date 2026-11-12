import { materialSet } from './documents.js';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { providerKey, quotaKey, providerModel } from './config.js';
import {
  analyzeDemo,
  analyzeGemini,
  analyzeGroq,
  fitGroq,
  groqTokenReservation,
  prepareMaterials,
} from './ai.js';
import {
  aggregateHash,
  analysisModel,
  cacheKeyFor,
  PROMPT_VERSION,
  SCHEMA_VERSION,
} from './ingest.js';
import { analysisSchema } from '../../contracts/src/index.js';
import { AnalysisFailure, describeAiError } from './ai-errors.js';
import { reserveProviderCall, QuotaWait } from './ai-quota.js';
import pino from 'pino';
export class BudgetExceeded extends Error {}
export async function reserveAiCall(db: PrismaClient, limit: number, intervalMs = 0) {
  const day = new Date().toISOString().slice(0, 10);
  await db.aiBudget.upsert({ where: { day }, create: { day }, update: {} });
  const result = await db.aiBudget.updateMany({
    where: {
      day,
      calls: { lt: limit },
      OR: [{ nextCallAt: null }, { nextCallAt: { lte: new Date() } }],
    },
    data: { calls: { increment: 1 }, nextCallAt: new Date(Date.now() + intervalMs) },
  });
  if (!result.count) throw new BudgetExceeded('Daily AI call budget reached');
}
export async function claimJob(db: PrismaClient, config: Config, owner: string, leaseMs = 120000) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string;
      }[]
    >(
      Prisma.sql`SELECT id FROM analysis_jobs WHERE attempts < ${config.AI_MAX_ATTEMPTS} AND ((status='pending' AND availableAt <= UTC_TIMESTAMP(3)) OR (status='processing' AND leaseUntil < UTC_TIMESTAMP(3))) ORDER BY availableAt, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!rows[0]) return null;
    return tx.analysisJob.update({
      where: { id: rows[0].id },
      data: {
        status: 'processing',
        leaseOwner: owner,
        leaseUntil: new Date(Date.now() + leaseMs),
        attempts: { increment: 1 },
      },
      include: { notice: { include: { tender: true } } },
    });
  });
}
export async function processOneJob(db: PrismaClient, config: Config, signal?: AbortSignal) {
  const jobConfig = config;
  if (config.APP_MODE === 'LIVE' && (!config.AI_LIVE_ENABLED || !providerKey(config))) return false;
  if (config.APP_MODE === 'LIVE') {
    const state = await db.aiProviderState.findUnique({ where: { id: quotaKey(config) } });
    if (!config.AI_AUTO_PROVIDER && state && state.pausedUntil > new Date()) return false;
    const budget = await db.aiBudget.findUnique({
      where: { day: new Date().toISOString().slice(0, 10) },
    });
    if (
      budget &&
      (budget.calls >= config.AI_DAILY_LIMIT ||
        (budget.nextCallAt && budget.nextCallAt > new Date()))
    )
      return false;
  }
  await db.$transaction(async (tx) => {
    const expired = await tx.analysisJob.findMany({
      where: {
        status: 'processing',
        leaseUntil: { lt: new Date() },
        attempts: { gte: config.AI_MAX_ATTEMPTS },
      },
      include: { notice: { include: { tender: true } } },
      take: 100,
    });
    for (const j of expired) {
      const updated = await tx.analysisJob.updateMany({
        where: {
          id: j.id,
          status: 'processing',
          leaseUntil: { lt: new Date() },
        },
        data: {
          status: 'failed',
          error: 'Maximum attempts reached after lease expiration',
          leaseOwner: null,
          leaseUntil: null,
        },
      });
      if (updated.count && cacheKeyFor(j.notice.tender.contentHash, jobConfig) === j.dedupeKey) {
        const previous = await tx.tenderAnalysis.count({
          where: { tenderId: j.notice.tenderId, status: 'completed' },
        });
        await tx.tender.updateMany({
          where: {
            id: j.notice.tenderId,
            contentHash: j.notice.tender.contentHash,
          },
          data: { analysisStatus: previous ? 'stale' : 'failed' },
        });
      }
    }
  });
  const owner = randomUUID();
  const job = await claimJob(db, config, owner);
  if (!job) return false;
  const abort = new AbortController();
  const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  const heartbeat = setInterval(() => {
    void db.analysisJob
      .updateMany({
        where: { id: job.id, leaseOwner: owner, status: 'processing' },
        data: { leaseUntil: new Date(Date.now() + 120000) },
      })
      .then((r) => {
        if (!r.count) abort.abort();
      })
      .catch(() => abort.abort());
  }, 20000);
  heartbeat.unref();
  const started = Date.now();
  let callId: string | undefined;
  const log = pino({ level: config.LOG_LEVEL });
  try {
    const notices = await db.tenderNotice.findMany({
      where: { tenderId: job.notice.tenderId, current: true },
      orderBy: [{ publishedAt: 'asc' }, { sourceId: 'asc' }],
    });
    if (
      config.APP_MODE === 'LIVE' &&
      config.DOCUMENTS_ENABLED &&
      job.notice.tender.status !== 'closed'
    ) {
      const scanned = await db.documentScan.count({
        where: { noticeId: { in: notices.map((n) => n.id) }, status: 'completed' },
      });
      if (scanned < notices.length)
        throw new QuotaWait(new Date(Date.now() + 60000), 'DOCUMENTS_PENDING');
    }
    const { inputHash, materials } = await materialSet(db, notices, config);
    if (cacheKeyFor(inputHash, jobConfig) !== job.dedupeKey) {
      await db.analysisJob.updateMany({
        where: { id: job.id, leaseOwner: owner },
        data: { status: 'obsolete', leaseOwner: null, leaseUntil: null },
      });
      return true;
    }
    let prepared = prepareMaterials(
      materials,
      config.APP_MODE === 'LIVE' ? Number.MAX_SAFE_INTEGER : config.AI_MAX_INPUT_CHARS,
    );
    const cached = await db.tenderAnalysis.findUnique({
      where: { cacheKey: job.dedupeKey },
    });
    if (
      config.APP_MODE === 'LIVE' &&
      !config.AI_AUTO_PROVIDER &&
      config.ANALYSIS_PROVIDER === 'groq' &&
      cached?.status !== 'completed'
    )
      prepared = fitGroq(config, prepared.materials, prepared.truncated);
    await db.tender.updateMany({
      where: {
        id: job.notice.tenderId,
        contentHash: inputHash,
        analysisStatus: { not: 'stale' },
      },
      data: { analysisStatus: 'processing' },
    });
    let result: Prisma.InputJsonValue;
    let tokens: number | null = null;
    if (cached?.status === 'completed' && cached.result)
      result = analysisSchema.parse(cached.result) as unknown as Prisma.InputJsonValue;
    else if (config.APP_MODE === 'DEMO')
      result = analyzeDemo(
        prepared.materials,
        prepared.truncated,
      ) as unknown as Prisma.InputJsonValue;
    else {
      const original = prepared;
      let candidates: Config[] = [config];
      if (config.AI_AUTO_PROVIDER) {
        const lastFailed = await db.aiCall.findFirst({
          where: { jobId: job.id, status: 'failed' },
          orderBy: { startedAt: 'desc' },
        });
        const last = lastFailed ?? (await db.aiCall.findFirst({ orderBy: { startedAt: 'desc' } }));
        const order: ('gemini' | 'groq')[] = last
          ? last.model.startsWith('groq:')
            ? ['gemini', 'groq']
            : ['groq', 'gemini']
          : config.ANALYSIS_PROVIDER === 'groq'
            ? ['groq', 'gemini']
            : ['gemini', 'groq'];
        candidates = order
          .map((provider) => ({ ...config, AI_AUTO_PROVIDER: false, ANALYSIS_PROVIDER: provider }))
          .filter((c) => !!providerKey(c));
      }
      let wait: QuotaWait | undefined;
      for (const candidate of candidates) {
        const state = await db.aiProviderState.findUnique({ where: { id: quotaKey(candidate) } });
        if (state && state.pausedUntil > new Date()) {
          const paused = new QuotaWait(
            state.pausedUntil,
            'Przerwa dostawcy ' + candidate.ANALYSIS_PROVIDER,
          );
          if (!wait || paused.until < wait.until) wait = paused;
          continue;
        }
        try {
          if (
            original.materials.reduce((n, m) => n + m.text.length, 0) > candidate.AI_MAX_INPUT_CHARS
          )
            throw new AnalysisFailure(
              'AI_INPUT_TOO_LARGE',
              'Całe ogłoszenie przekracza AI_MAX_INPUT_CHARS; treści nie skrócono.',
            );
          const input =
            candidate.ANALYSIS_PROVIDER === 'groq'
              ? fitGroq(candidate, original.materials, original.truncated)
              : original;
          const reservation = await reserveProviderCall(
            db,
            candidate,
            job.id,
            candidate.ANALYSIS_PROVIDER === 'groq'
              ? groqTokenReservation(candidate, input.materials, input.truncated)
              : Buffer.byteLength(JSON.stringify(input.materials), 'utf8') +
                  4096 +
                  candidate.AI_MAX_OUTPUT_TOKENS,
          );
          config = candidate;
          prepared = input;
          callId = reservation.id;
          break;
        } catch (error) {
          if (error instanceof QuotaWait) {
            if (!wait || error.until < wait.until) wait = error;
          } else if (jobConfig.AI_AUTO_PROVIDER && error instanceof AnalysisFailure) {
            wait ??= new QuotaWait(new Date(Date.now() + 60000), error.code);
          } else throw error;
        }
      }
      if (!callId)
        throw wait ?? new QuotaWait(new Date(Date.now() + 60000), 'Brak dostępnego dostawcy');
      log.info(
        {
          event: 'ai.request',
          provider: config.ANALYSIS_PROVIDER,
          callId,
          jobId: job.id,
          model: providerModel(config),
          inputChars: prepared.materials.reduce((n, m) => n + m.text.length, 0),
        },
        'AI request started',
      );
      const output = await (config.ANALYSIS_PROVIDER === 'groq' ? analyzeGroq : analyzeGemini)(
        config,
        prepared.materials,
        prepared.truncated,
        combined,
      );
      result = output.result as unknown as Prisma.InputJsonValue;
      tokens = output.tokens;
      await db.aiCall.update({
        where: { id: callId },
        data: { status: 'completed', finishedAt: new Date(), tokens },
      });
      log.info(
        { event: 'ai.response', callId, jobId: job.id, durationMs: Date.now() - started, tokens },
        'AI response validated',
      );
    }
    const parsed = analysisSchema.parse(result);
    if (
      parsed.deadline &&
      (!job.notice.tender.deadline ||
        new Date(parsed.deadline.value).getTime() !== job.notice.tender.deadline.getTime())
    ) {
      parsed.missingInformation.push(
        'Termin wyodrębniony przez AI pominięto: brak zgodności z potwierdzonymi danymi strukturalnymi BZP.',
      );
      parsed.deadline = null;
    }
    result = parsed as unknown as Prisma.InputJsonValue;
    combined.throwIfAborted();
    await db.$transaction(async (tx) => {
      const owned = await tx.analysisJob.updateMany({
        where: {
          id: job.id,
          leaseOwner: owner,
          status: 'processing',
          leaseUntil: { gt: new Date() },
        },
        data: {
          status: 'completed',
          leaseUntil: null,
          leaseOwner: null,
          error: null,
        },
      });
      if (!owned.count) throw new Error('Job lease lost');
      const scope = {
        materials: 'notice_only',
        sourceIds: prepared.materials.map((m) => m.sourceId),
        truncated: prepared.truncated,
      };
      await tx.tenderAnalysis.upsert({
        where: { cacheKey: job.dedupeKey },
        create: {
          tenderId: job.notice.tenderId,
          cacheKey: job.dedupeKey,
          status: 'completed',
          provider: config.APP_MODE === 'DEMO' ? 'demo' : config.ANALYSIS_PROVIDER,
          model: analysisModel(config),
          promptVersion: PROMPT_VERSION,
          schemaVersion: SCHEMA_VERSION,
          inputHash,
          result,
          scope,
          durationMs: Date.now() - started,
          tokens,
        },
        update:
          cached?.status === 'completed'
            ? {}
            : {
                status: 'completed',
                result,
                scope,
                error: null,
                durationMs: Date.now() - started,
                tokens,
              },
      });
      const value = (
        result as unknown as {
          estimatedValue: {
            amount: string;
            currency: string;
            basis: string;
          } | null;
        }
      ).estimatedValue;
      await tx.tender.updateMany({
        where: { id: job.notice.tenderId, contentHash: inputHash },
        data: {
          analysisStatus: 'completed',
          estimatedValue: value?.amount ?? null,
          currency: value?.currency ?? null,
          valueBasis: value?.basis ?? null,
        },
      });
    });
  } catch (error) {
    const quota = error instanceof QuotaWait;
    const diagnosis = describeAiError(error);
    const budget = error instanceof BudgetExceeded || quota;
    const interrupted = combined.aborted;
    const exhausted =
      !budget && !interrupted && (!diagnosis.retry || job.attempts >= config.AI_MAX_ATTEMPTS);
    const message = quota
      ? 'Oczekiwanie na limit: ' + error.message
      : budget
        ? 'Dzienny limit AI został wykorzystany'
        : interrupted
          ? 'Analiza przerwana; zadanie zostanie ponowione'
          : diagnosis.message;
    if (callId) {
      await db.aiCall.update({
        where: { id: callId },
        data: { status: 'failed', finishedAt: new Date(), code: message },
      });
      log.warn(
        {
          event: 'ai.error',
          callId,
          jobId: job.id,
          durationMs: Date.now() - started,
          code: message,
        },
        'AI request failed',
      );
    }
    if (
      config.APP_MODE === 'LIVE' &&
      !budget &&
      !interrupted &&
      diagnosis.pause &&
      !/^AI_(SCHEMA|JSON|EVIDENCE):/.test(diagnosis.message)
    )
      await db.aiProviderState.upsert({
        where: { id: quotaKey(config) },
        create: {
          id: quotaKey(config),
          error: message,
          pausedUntil: new Date(Date.now() + diagnosis.pause),
        },
        update: { error: message, pausedUntil: new Date(Date.now() + diagnosis.pause) },
      });
    const nextDay = new Date();
    nextDay.setUTCHours(24, 0, 0, 0);
    await db.$transaction(async (tx) => {
      const fenced = await tx.analysisJob.updateMany({
        where: { id: job.id, leaseOwner: owner, status: 'processing' },
        data: {
          status: exhausted ? 'failed' : 'pending',
          leaseOwner: null,
          leaseUntil: null,
          error: message,
          availableAt: quota
            ? error.until
            : budget
              ? nextDay
              : new Date(
                  Date.now() +
                    Math.max(diagnosis.pause, 2000 * 2 ** job.attempts) +
                    Math.random() * 1000,
                ),
          ...(budget || interrupted ? { attempts: { decrement: 1 } } : {}),
        },
      });
      if (!fenced.count) return;
      const previous = await tx.tenderAnalysis.count({
        where: { tenderId: job.notice.tenderId, status: 'completed' },
      });
      const sameInput = await tx.tenderAnalysis.count({
        where: {
          tenderId: job.notice.tenderId,
          status: 'completed',
          inputHash: job.notice.tender.contentHash,
        },
      });
      await tx.tender.updateMany({
        where: {
          id: job.notice.tenderId,
          contentHash: job.notice.tender.contentHash,
        },
        data: {
          analysisStatus: sameInput
            ? 'completed'
            : previous
              ? 'stale'
              : exhausted
                ? 'failed'
                : 'pending',
        },
      });
      if (exhausted)
        await tx.tenderAnalysis.upsert({
          where: { cacheKey: job.dedupeKey },
          create: {
            tenderId: job.notice.tenderId,
            cacheKey: job.dedupeKey,
            status: 'failed',
            provider: config.APP_MODE === 'DEMO' ? 'demo' : config.ANALYSIS_PROVIDER,
            model: analysisModel(config),
            promptVersion: PROMPT_VERSION,
            schemaVersion: SCHEMA_VERSION,
            inputHash: job.notice.tender.contentHash,
            scope: { materials: 'notice_only' },
            durationMs: Date.now() - started,
            error: message,
          },
          update: {},
        });
    });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
