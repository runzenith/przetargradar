import { industries } from '../../../packages/contracts/src/discovery.js';
import { DateTime } from 'luxon';
import { resolvePlace, resolveLocationText } from '../../../packages/core/src/geography.js';
import Fastify, { type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Prisma, type PrismaClient, type Tender } from '@prisma/client';
import { z } from 'zod';
import {
  analysisSchema,
  listQuerySchema,
  tenderRowSchema,
  tenderListSchema,
  tenderDetailSchema,
  systemStatusSchema,
  type TenderRow,
  type ListQuery,
} from '../../../packages/contracts/src/index.js';
import type { Config } from '../../../packages/core/src/config.js';
import { quotaKey, providerKey } from '../../../packages/core/src/config.js';
import { analysisModel, cacheKeyFor } from '../../../packages/core/src/ingest.js';
import { accountRoutes, profileInput, scoreTender } from './accounts.js';
export function effectiveStatus(tender: Pick<Tender, 'status' | 'deadline'>) {
  return tender.status === 'closed'
    ? 'closed'
    : tender.deadline
      ? tender.deadline > new Date()
        ? 'active'
        : 'closed'
      : tender.status;
}
function serialize(t: Tender): TenderRow {
  return tenderRowSchema.parse({
    ...t,
    publishedAt: t.publishedAt.toISOString(),
    deadline: t.deadline?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
    status: effectiveStatus(t),
    estimatedValue: t.estimatedValue?.toFixed(2) ?? null,
  });
}
const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
  },
};
const queryJson = z.toJSONSchema(listQuerySchema, {
  io: 'input',
  target: 'draft-7',
});
export function tenderFilters(q: ListQuery): Prisma.TenderWhereInput {
  const active: Prisma.TenderWhereInput = {
    deadline: { gt: new Date() },
    status: { not: 'closed' },
  };
  const statusFilter: Prisma.TenderWhereInput =
    q.status === 'active'
      ? active
      : q.status === 'closed'
        ? { OR: [{ status: 'closed' }, { deadline: { lte: new Date() } }] }
        : q.status === 'unknown'
          ? { status: 'unknown', deadline: null }
          : {};
  return {
    ...(q.q
      ? {
          OR: [
            { title: { contains: q.q } },
            { buyer: { contains: q.q } },
            { cpv: { startsWith: q.q } },
          ],
        }
      : {}),
    AND: [
      statusFilter,
      ...(q.industry !== 'all'
        ? [
            {
              OR: (industries.find((i) => i.id === q.industry)?.prefixes ?? []).map((p) => ({
                cpv: { startsWith: p },
              })),
            },
          ]
        : []),
      ...(q.deadlineDays
        ? [
            {
              deadline: { gt: new Date(), lte: new Date(Date.now() + q.deadlineDays * 86400000) },
              status: { not: 'closed' },
            },
          ]
        : []),
    ],
    ...(q.source !== 'all'
      ? q.source === 'bzp'
        ? {
            NOT: {
              OR: ['ted:', 'bk:', 'pz:'].map((prefix) => ({ sourceKey: { startsWith: prefix } })),
            },
          }
        : { sourceKey: { startsWith: q.source + ':' } }
      : {}),
    ...(q.published !== 'all'
      ? {
          publishedAt: {
            gte:
              q.published === 'today'
                ? DateTime.now().setZone('Europe/Warsaw').startOf('day').toJSDate()
                : new Date(Date.now() - 7 * 86400000),
          },
        }
      : {}),
    ...(q.category !== 'all' ? { category: q.category } : {}),
    ...(q.region ? { buyerRegion: q.region } : {}),
    ...(q.city ? { buyerCity: q.city } : {}),
    ...(q.analysis !== 'all' ? { analysisStatus: q.analysis } : {}),
  };
}
export async function buildApp(db: PrismaClient, config: Config) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    },
    bodyLimit: 16384,
    requestTimeout: 30000,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'private, no-store');
    return payload;
  });
  const accounts = await accountRoutes(app, db, config);
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'PrzetargRadar API',
        version: '0.1.0',
        description:
          'Read-only tender and status endpoints. Account sessions, CSRF-protected profiles and saved tenders. Synchronization runs only in the worker or operator CLI.',
      },
      components: {
        securitySchemes: { adminToken: { type: 'http', scheme: 'bearer' } },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const validation = !!error.validation;
    const status = validation
      ? 400
      : error.statusCode && error.statusCode < 500
        ? error.statusCode
        : 500;
    if (status >= 500)
      request.log.error({ code: 'INTERNAL_ERROR', requestId: request.id }, 'Request failed');
    reply.code(status).send({
      error: {
        code: validation ? 'VALIDATION_ERROR' : status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR',
        message: validation
          ? 'Niepoprawne parametry żądania'
          : status === 429
            ? 'Zbyt wiele żądań. Spróbuj ponownie później.'
            : status < 500
              ? error.message
              : 'Nie udało się obsłużyć żądania',
        requestId: request.id,
      },
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Nie znaleziono zasobu',
        requestId: request.id,
      },
    }),
  );
  app.get(
    '/api/health',
    {
      schema: {
        tags: ['system'],
        response: {
          200: { type: 'object', properties: { status: { type: 'string' } } },
        },
      },
    },
    async () => ({ status: 'ok' }),
  );
  app.get(
    '/api/ready',
    { schema: { tags: ['system'], response: { 503: errorSchema } } },
    async (_request, reply) => {
      try {
        await db.$queryRaw`SELECT 1`;
        await db.syncState.count();
        return { status: 'ready', mode: config.APP_MODE };
      } catch {
        return reply.code(503).send({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Baza danych lub migracje nie są gotowe',
            requestId: _request.id,
          },
        });
      }
    },
  );
  app.get(
    '/api/tenders',
    {
      schema: {
        tags: ['tenders'],
        querystring: queryJson,
        response: {
          200: z.toJSONSchema(tenderListSchema, { target: 'draft-7' }),
          400: errorSchema,
        },
      },
    },
    async (request) => {
      const q = listQuerySchema.parse(request.query);
      const mode = { isDemo: config.APP_MODE === 'DEMO' };
      const active: Prisma.TenderWhereInput = {
        deadline: { gt: new Date() },
        status: { not: 'closed' },
      };
      const where: Prisma.TenderWhereInput = { ...mode, ...tenderFilters(q) };
      const statusFilter = tenderFilters({
        ...q,
        q: '',
        category: 'all',
        region: '',
        city: '',
        analysis: 'all',
      });
      if (q.view === 'saved' || q.view === 'recommended') {
        const session = await accounts.owner(request);
        if (q.view === 'saved')
          where.userStates = { some: { userId: session.userId, saved: true } };
        else {
          const p = await db.companyProfile.findFirst({
            where: { ownerId: session.userId },
            orderBy: { version: 'desc' },
          });
          if (!p) where.id = '__no_profile__';
          else {
            const profile = profileInput.parse(p);
            where.AND = [
              ...(Array.isArray(where.AND) ? where.AND : [statusFilter]),
              {
                OR: [
                  ...profile.cpvCodes.map((c) => ({ cpv: { startsWith: c.slice(0, 8) } })),
                  ...profile.services.map((s) => ({ title: { contains: s } })),
                ],
              },
              ...profile.exclusions.map((s) => ({ NOT: { title: { contains: s } } })),
            ];
          }
        }
      }
      const orderBy: Prisma.TenderOrderByWithRelationInput[] =
        q.sort === 'title_asc'
          ? [{ title: 'asc' }, { id: 'asc' }]
          : q.sort === 'deadline_asc'
            ? [{ deadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
            : [{ publishedAt: 'desc' }, { id: 'asc' }];
      const [items, total, all, activeCount, completed, pending, regionRows, cityRows] =
        await Promise.all([
          db.tender.findMany({
            where,
            orderBy,
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          db.tender.count({ where }),
          db.tender.count({ where: mode }),
          db.tender.count({ where: { ...mode, ...active } }),
          db.tender.count({ where: { ...mode, analysisStatus: 'completed' } }),
          db.tender.count({
            where: {
              ...mode,
              analysisStatus: { in: ['pending', 'processing', 'stale'] },
            },
          }),
          db.tender.groupBy({
            by: ['buyerRegion'],
            where: { ...mode, buyerRegion: { not: null } },
            orderBy: { buyerRegion: 'asc' },
          }),
          db.tender.groupBy({
            by: ['buyerCity'],
            where: {
              ...mode,
              ...(q.region ? { buyerRegion: q.region } : {}),
              buyerCity: { not: null },
            },
            orderBy: { buyerCity: 'asc' },
            take: 2000,
          }),
        ]);
      const session = q.view === 'recommended' ? await accounts.owner(request) : null;
      const profile = session
        ? await db.companyProfile.findFirst({
            where: { ownerId: session.userId },
            orderBy: { version: 'desc' },
          })
        : null;
      const matches = profile
        ? items.map((t) => ({ t, ...scoreTender(profileInput.parse(profile), t) }))
        : [];
      if (profile)
        await db.tenderMatch.createMany({
          data: matches.map(({ t, ...m }) => ({
            profileId: profile.id,
            tenderId: t.id,
            contentHash: t.contentHash,
            scoringVersion: 'deterministic-v1',
            ...m,
          })),
          skipDuplicates: true,
        });
      return tenderListSchema.parse({
        items: items.map(serialize),
        matches: matches.map(({ t, ...m }) => ({ tenderId: t.id, ...m })),
        total,
        page: q.page,
        pageSize: q.pageSize,
        stats: { total: all, active: activeCount, completed, pending },
        cities: cityRows.flatMap((r) => (r.buyerCity ? [r.buyerCity] : [])),
        regions: regionRows.flatMap((r) => (r.buyerRegion ? [r.buyerRegion] : [])),
      });
    },
  );
  const mapCache = new Map<
    string,
    {
      until: number;
      payload: {
        points: (NonNullable<ReturnType<typeof resolvePlace>> & {
          city: string;
          buyerRegion: string | null;
          count: number;
        })[];
        total: number;
        unmapped: number;
      };
    }
  >();
  app.get('/api/map', { schema: { querystring: queryJson } }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const cacheId = JSON.stringify([q.q, q.category, q.status, q.region, q.analysis, q.city]);
    const cached = mapCache.get(cacheId);
    if (cached && cached.until > Date.now()) return cached.payload;
    const where: Prisma.TenderWhereInput = {
      isDemo: config.APP_MODE === 'DEMO',
      ...tenderFilters(q),
    };
    const groups = await db.tender.groupBy({
      by: ['buyerCity', 'buyerRegion'],
      where,
      _count: true,
    });
    let unmapped = 0;
    const points = groups.flatMap((g) => {
      const place = resolvePlace(g.buyerCity, g.buyerRegion);
      if (!place) {
        unmapped += g._count;
        return [];
      }
      return [{ ...place, city: g.buyerCity!, buyerRegion: g.buyerRegion, count: g._count }];
    });
    const payload = { points, unmapped, total: groups.reduce((n, g) => n + g._count, 0) };
    if (mapCache.size >= 64) mapCache.delete(mapCache.keys().next().value!);
    mapCache.set(cacheId, { until: Date.now() + 15000, payload });
    return payload;
  });
  app.get(
    '/api/map/location',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['city'],
          properties: {
            city: { type: 'string', maxLength: 300 },
            region: { type: 'string', maxLength: 80 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const q = z
        .object({ city: z.string().max(300), region: z.string().max(80).optional() })
        .parse(request.query);
      return { place: resolveLocationText(q.city, q.region ?? null) };
    },
  );
  app.get<{
    Params: {
      id: string;
    };
  }>(
    '/api/tenders/:id',
    {
      schema: {
        tags: ['tenders'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
          additionalProperties: false,
        },
        response: {
          200: z.toJSONSchema(tenderDetailSchema, { target: 'draft-7' }),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const tender = await db.tender.findFirst({
        where: { id: request.params.id, isDemo: config.APP_MODE === 'DEMO' },
        include: {
          notices: {
            orderBy: [{ publishedAt: 'desc' }, { fetchedAt: 'desc' }],
            select: {
              id: true,
              sourceId: true,
              noticeNumber: true,
              noticeType: true,
              contentHash: true,
              text: true,
              publishedAt: true,
              fetchedAt: true,
              current: true,
            },
          },
          analyses: {
            where: { status: 'completed' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!tender)
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Nie znaleziono zamówienia',
            requestId: request.id,
          },
        });
      const current = await db.tenderAnalysis.findUnique({
        where: { cacheKey: cacheKeyFor(tender.contentHash, config) },
      });
      const a =
        current?.status === 'completed'
          ? current
          : ((await db.tenderAnalysis.findFirst({
              where: { tenderId: tender.id, inputHash: tender.contentHash, status: 'completed' },
              orderBy: { createdAt: 'desc' },
            })) ?? tender.analyses[0]);
      const analysisStatus = a
        ? a.inputHash !== tender.contentHash
          ? 'stale'
          : 'completed'
        : tender.analysisStatus;
      const job = await db.analysisJob.findUnique({
        where: { dedupeKey: cacheKeyFor(tender.contentHash, config) },
        select: { status: true, error: true, attempts: true, availableAt: true },
      });
      const scans =
        config.APP_MODE === 'LIVE' && config.DOCUMENTS_ENABLED
          ? await db.documentScan.findMany({
              where: { noticeId: { in: tender.notices.filter((n) => n.current).map((n) => n.id) } },
            })
          : [];
      const documents = scans.flatMap((scan) =>
        (
          scan.report as unknown as {
            url: string;
            name: string;
            status: string;
            contentHash?: string;
          }[]
        ).map((r) => ({
          name: r.name,
          url: r.url,
          status: r.status,
          sourceId: r.contentHash ? 'pdf:' + r.contentHash : null,
        })),
      );
      return tenderDetailSchema.parse({
        documents,
        documentTexts: scans.flatMap(
          (s) =>
            s.materials as unknown as {
              sourceId: string;
              text: string;
            }[],
        ),
        documentScanPending:
          config.APP_MODE === 'LIVE' &&
          config.DOCUMENTS_ENABLED &&
          tender.status !== 'closed' &&
          scans.length < tender.notices.filter((n) => n.current).length,
        ...serialize(tender),
        analysisStatus,
        analysis: a
          ? {
              ...analysisSchema.parse(a.result),
              id: a.id,
              provider: a.provider,
              model: a.model,
              durationMs: a.durationMs,
              createdAt: a.createdAt.toISOString(),
              promptVersion: a.promptVersion,
              schemaVersion: a.schemaVersion,
              inputHash: a.inputHash,
              tokens: a.tokens,
            }
          : null,
        notices: tender.notices.map((n) => ({
          ...n,
          publishedAt: n.publishedAt.toISOString(),
          fetchedAt: n.fetchedAt.toISOString(),
        })),
        analysisError: job?.status !== 'completed' ? (job?.error ?? null) : null,
        analysisJob: job
          ? {
              status: job.status,
              attempts: job.attempts,
              maxAttempts: config.AI_MAX_ATTEMPTS,
              nextAttemptAt: job.status === 'pending' ? job.availableAt.toISOString() : null,
            }
          : null,
      });
    },
  );
  let cachedSystem:
    | {
        until: number;
        value: ReturnType<typeof systemStatusSchema.parse>;
      }
    | undefined;
  app.get(
    '/api/system',
    {
      schema: {
        tags: ['system'],
        response: { 200: z.toJSONSchema(systemStatusSchema, { target: 'draft-7' }) },
      },
    },
    async () => {
      if (cachedSystem && cachedSystem.until > Date.now()) return cachedSystem.value;
      const providerState = await db.aiProviderState.findUnique({
        where: { id: quotaKey(config) },
      });
      const isDemo = config.APP_MODE === 'DEMO';
      const [tenders, notices, analyses, queued, failed, state, logs, budget] = await Promise.all([
        db.tender.count({ where: { isDemo } }),
        db.tenderNotice.count({ where: { tender: { isDemo } } }),
        db.tenderAnalysis.count({
          where: { status: 'completed', tender: { isDemo } },
        }),
        db.analysisJob.count({
          where: {
            status: { in: ['pending', 'processing'] },
            notice: { tender: { isDemo } },
          },
        }),
        db.analysisJob.count({
          where: { status: 'failed', notice: { tender: { isDemo } } },
        }),
        db.syncState.findUnique({ where: { id: config.APP_MODE } }),
        db.syncLog.findMany({ orderBy: { startedAt: 'desc' }, take: 12 }),
        db.aiBudget.findUnique({
          where: { day: new Date().toISOString().slice(0, 10) },
        }),
      ]);
      const payload = systemStatusSchema.parse({
        mode: config.APP_MODE,
        ai: {
          enabled: isDemo || config.AI_LIVE_ENABLED,
          configured: isDemo || !!providerKey(config),
          model: config.AI_AUTO_PROVIDER ? 'AUTO: Gemini / Groq' : analysisModel(config),
          dailyLimit: config.AI_DAILY_LIMIT,
          usedToday: budget?.calls ?? 0,
          pauseReason:
            !config.AI_AUTO_PROVIDER && providerState && providerState.pausedUntil > new Date()
              ? providerState.error
              : null,
        },
        counts: { tenders, notices, analyses, queued, failed },
        sync: {
          intervalSeconds: config.SYNC_INTERVAL_SECONDS,
          checkpoint: state?.checkpoint?.toISOString() ?? null,
          inProgress: !!state?.leaseUntil && state.leaseUntil > new Date(),
          resumable: !!state?.windowFrom,
          logs: logs.map((l) => ({
            ...l,
            startedAt: l.startedAt.toISOString(),
            finishedAt: l.finishedAt?.toISOString() ?? null,
            windowFrom: l.windowFrom.toISOString(),
            windowTo: l.windowTo.toISOString(),
          })),
        },
      });
      cachedSystem = { until: Date.now() + 15000, value: payload };
      return payload;
    },
  );
  return app;
}
