import { industries } from './discovery.js';
import { z } from 'zod';
export const evidenceSchema = z.object({
  sourceId: z.string(),
  quote: z.string().min(8).max(700),
  location: z.string().nullable(),
});
export const findingSchema = z.object({
  text: z.string().min(1),
  evidence: evidenceSchema,
});
export const moneySchema = z.object({
  amount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  basis: z.enum(['net', 'gross', 'unspecified']),
  evidence: evidenceSchema,
});
export const analysisSchema = z.object({
  category: z.enum(['services', 'supplies', 'works', 'other']),
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(2500),
  requirements: z.array(findingSchema).max(25),
  risks: z.array(findingSchema).max(15),
  estimatedValue: moneySchema.nullable(),
  bidBond: moneySchema.nullable(),
  deadline: z
    .object({
      value: z.iso.datetime({ offset: true }),
      evidence: evidenceSchema,
    })
    .nullable(),
  executionLocation: z.object({ value: z.string(), evidence: evidenceSchema }).nullable(),
  missingInformation: z.array(z.string()).max(25),
  scope: z.object({
    sourceIds: z.array(z.string()),
    materials: z.enum(['notice_only', 'notice_and_documents']),
    truncated: z.boolean(),
  }),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export const actionSchema = z.object({
  summary: z.string(),
  advantages: z.array(findingSchema),
  discrepancies: z.array(findingSchema),
  toVerify: z.array(z.string()),
  missingInformation: z.array(z.string()),
  verdict: z.enum(['consider', 'clarify', 'mismatch']),
});
export type GoNoGo = z.infer<typeof actionSchema>;
export const listQuerySchema = z.object({
  industry: z.enum(['all', ...industries.map((i) => i.id)]).default('all'),
  source: z.enum(['all', 'bzp', 'ted', 'bk', 'pz']).default('all'),
  published: z.enum(['all', 'today', 'week']).default('all'),
  deadlineDays: z.coerce.number().int().min(1).max(365).optional(),
  view: z.enum(['all', 'saved', 'recommended']).default('all'),
  q: z.string().max(200).default(''),
  category: z.enum(['all', 'services', 'supplies', 'works', 'other']).default('all'),
  status: z.enum(['all', 'active', 'closed', 'unknown']).default('all'),
  region: z.string().max(80).default(''),
  city: z.string().max(150).default(''),
  analysis: z.enum(['all', 'completed', 'pending', 'processing', 'failed', 'stale']).default('all'),
  sort: z.enum(['published_desc', 'deadline_asc', 'title_asc']).default('published_desc'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
export type TenderRow = {
  id: string;
  title: string;
  sourceKey: string;
  buyer: string;
  buyerCity: string | null;
  buyerRegion: string | null;
  category: string;
  cpv: string | null;
  publishedAt: string;
  deadline: string | null;
  sourceUrl: string | null;
  status: string;
  statusBasis: string;
  analysisStatus: string;
  estimatedValue: string | null;
  currency: string | null;
  valueBasis: string | null;
  updatedAt: string;
  contentHash: string;
  isDemo: boolean;
};
export type TenderDetail = TenderRow & {
  documents?: {
    name: string;
    url: string;
    status: string;
    sourceId: string | null;
  }[];
  documentScanPending?: boolean;
  documentTexts?: {
    sourceId: string;
    text: string;
  }[];
  analysis:
    | (Analysis & {
        id: string;
        provider: string;
        model: string;
        durationMs: number | null;
        createdAt: string;
        promptVersion: string;
        schemaVersion: string;
        inputHash: string;
        tokens: number | null;
      })
    | null;
  notices: {
    id: string;
    sourceId: string;
    noticeNumber: string | null;
    noticeType: string;
    contentHash: string;
    text: string;
    publishedAt: string;
    fetchedAt: string;
    current: boolean;
  }[];
  analysisError: string | null;
  analysisJob: {
    status: string;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: string | null;
  } | null;
};
export type TenderList = {
  items: TenderRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    total: number;
    active: number;
    completed: number;
    pending: number;
  };
  regions: string[];
  cities?: string[];
};
export type SystemStatus = {
  mode: 'DEMO' | 'LIVE';
  ai: {
    enabled: boolean;
    configured: boolean;
    model: string;
    dailyLimit: number;
    usedToday: number;
    pauseReason?: string | null;
  };
  counts: {
    tenders: number;
    notices: number;
    analyses: number;
    queued: number;
    failed: number;
  };
  sync: {
    intervalSeconds: number;
    checkpoint: string | null;
    inProgress: boolean;
    resumable: boolean;
    logs: SyncLog[];
  };
};
export type SyncLog = {
  filtered?: number;
  sourceId?: string;
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  windowFrom: string;
  windowTo: string;
  pages: number;
  fetched: number;
  created: number;
  changed: number;
  skipped: number;
  errors: number;
  errorSummary: string | null;
  correlationId: string;
};
export const tenderRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  sourceKey: z.string(),
  buyer: z.string(),
  buyerCity: z.string().nullable(),
  buyerRegion: z.string().nullable(),
  category: z.enum(['services', 'supplies', 'works', 'other']),
  cpv: z.string().nullable(),
  publishedAt: z.iso.datetime(),
  deadline: z.iso.datetime().nullable(),
  sourceUrl: z.url().nullable(),
  status: z.enum(['active', 'closed', 'unknown']),
  statusBasis: z.string(),
  analysisStatus: z.enum(['pending', 'processing', 'completed', 'failed', 'stale']),
  estimatedValue: z
    .string()
    .regex(/^\d+\.\d{2}$/)
    .nullable(),
  currency: z.string().nullable(),
  valueBasis: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  contentHash: z.string().length(64),
  isDemo: z.boolean(),
}) satisfies z.ZodType<TenderRow>;
export const tenderDetailSchema = tenderRowSchema.extend({
  documents: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
        status: z.string(),
        sourceId: z.string().nullable(),
      }),
    )
    .optional(),
  documentScanPending: z.boolean().optional(),
  documentTexts: z.array(z.object({ sourceId: z.string(), text: z.string() })).optional(),
  analysis: analysisSchema
    .extend({
      id: z.uuid(),
      provider: z.string(),
      model: z.string(),
      durationMs: z.number().int().nullable(),
      createdAt: z.iso.datetime(),
      promptVersion: z.string(),
      schemaVersion: z.string(),
      inputHash: z.string(),
      tokens: z.number().int().nullable(),
    })
    .nullable(),
  notices: z.array(
    z.object({
      id: z.uuid(),
      sourceId: z.string(),
      noticeNumber: z.string().nullable(),
      noticeType: z.string(),
      contentHash: z.string(),
      text: z.string(),
      publishedAt: z.iso.datetime(),
      fetchedAt: z.iso.datetime(),
      current: z.boolean(),
    }),
  ),
  analysisError: z.string().nullable(),
  analysisJob: z
    .object({
      status: z.string(),
      attempts: z.number().int(),
      maxAttempts: z.number().int(),
      nextAttemptAt: z.iso.datetime().nullable(),
    })
    .nullable(),
}) satisfies z.ZodType<TenderDetail>;
export const tenderListSchema = z.object({
  matches: z
    .array(
      z.object({
        tenderId: z.string(),
        score: z.number(),
        explanation: z.string(),
        missingInformation: z.array(z.string()),
        components: z.object({
          cpv: z.number(),
          services: z.number(),
          region: z.number(),
          excluded: z.boolean(),
        }),
      }),
    )
    .optional(),
  items: z.array(tenderRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  stats: z.object({
    total: z.number().int(),
    active: z.number().int(),
    completed: z.number().int(),
    pending: z.number().int(),
  }),
  regions: z.array(z.string()),
  cities: z.array(z.string()).optional(),
}) satisfies z.ZodType<TenderList>;
export const syncLogSchema = z.object({
  filtered: z.number().int().default(0),
  sourceId: z.string().default('bzp'),
  id: z.uuid(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  status: z.string(),
  windowFrom: z.iso.datetime(),
  windowTo: z.iso.datetime(),
  pages: z.number().int(),
  fetched: z.number().int(),
  created: z.number().int(),
  changed: z.number().int(),
  skipped: z.number().int(),
  errors: z.number().int(),
  errorSummary: z.string().nullable(),
  correlationId: z.string(),
}) satisfies z.ZodType<SyncLog>;
export const systemStatusSchema = z.object({
  mode: z.enum(['DEMO', 'LIVE']),
  ai: z.object({
    enabled: z.boolean(),
    configured: z.boolean(),
    model: z.string(),
    dailyLimit: z.number().int(),
    usedToday: z.number().int(),
    pauseReason: z.string().nullable().optional(),
  }),
  counts: z.object({
    tenders: z.number().int(),
    notices: z.number().int(),
    analyses: z.number().int(),
    queued: z.number().int(),
    failed: z.number().int(),
  }),
  sync: z.object({
    intervalSeconds: z.number().int(),
    checkpoint: z.iso.datetime().nullable(),
    inProgress: z.boolean(),
    resumable: z.boolean(),
    logs: z.array(syncLogSchema),
  }),
}) satisfies z.ZodType<SystemStatus>;
