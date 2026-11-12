import 'dotenv/config';
import { z } from 'zod';
const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
export const configSchema = z
  .object({
    APP_MODE: z.enum(['DEMO', 'LIVE']).default('DEMO'),
    PUBLIC_ORIGIN: z.url().default('http://127.0.0.1:5173'),
    AI_REQUEST_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),
    GEMINI_RPM: z.coerce.number().int().min(1).default(15),
    GEMINI_TPM: z.coerce.number().int().min(1000).default(250000),
    GEMINI_RPD: z.coerce.number().int().min(1).default(500),
    AI_AUTO_PROVIDER: bool,
    ANALYSIS_PROVIDER: z.enum(['gemini', 'groq']).default('gemini'),
    GROQ_RPM: z.coerce.number().int().min(1).default(30),
    GROQ_TPM: z.coerce.number().int().min(1000).default(8000),
    GROQ_RPD: z.coerce.number().int().min(1).default(1000),
    GROQ_TPD: z.coerce.number().int().min(1000).default(200000),
    GROQ_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(512).max(8192).default(2048),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().startsWith('mysql://'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).default(3001),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
    ADMIN_TOKEN: z.string().min(24),
    SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(3600),
    SYNC_WINDOW_HOURS: z.coerce.number().min(0.01).max(24).default(2),
    SYNC_OVERLAP_MINUTES: z.coerce.number().int().min(0).max(60).default(10),
    SYNC_MAX_RECORDS: z.coerce.number().int().min(0).max(10000).default(0),
    BZP_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(100),
    BZP_REQUEST_INTERVAL_MS: z.coerce.number().int().min(3100).default(3100),
    AI_LIVE_ENABLED: bool,
    AI_DAILY_LIMIT: z.coerce.number().int().min(0).max(10000).default(0),
    AI_MAX_INPUT_CHARS: z.coerce.number().int().min(500).max(200000).default(200000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(512).max(16000).default(8192),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
    AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
    GEMINI_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().default('openai/gpt-oss-20b'),
    GROQ_API_KEY: z.string().optional(),
    DOCUMENTS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    DOCUMENT_OCR_PAGES: z.coerce.number().int().min(0).max(30).default(12),
    DOCUMENT_STORAGE_MB: z.coerce.number().int().min(100).max(100000).default(2048),
    DOCUMENT_MAX_FILES: z.coerce.number().int().min(1).max(20).default(6),
    DOCUMENT_MAX_BYTES: z.coerce.number().int().min(100000).max(20000000).default(10000000),
    ENABLE_TED: bool,
    TED_REQUEST_INTERVAL_MS: z.coerce.number().int().min(1000).default(3100),
    ENABLE_BK: bool,
    BK_REQUEST_INTERVAL_MS: z.coerce.number().int().min(2000).default(3000),
    PZ_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(300).max(1800).default(900),
    ENABLE_PLATFORMAZAKUPOWA: bool,
    PZ_REQUEST_INTERVAL_MS: z.coerce.number().int().min(5000).default(10000),
  })
  .superRefine((v, ctx) => {
    if (
      v.APP_MODE === 'LIVE' &&
      v.AI_LIVE_ENABLED &&
      (!(v.AI_AUTO_PROVIDER
        ? v.GROQ_API_KEY || v.GEMINI_API_KEY
        : v.ANALYSIS_PROVIDER === 'groq'
          ? v.GROQ_API_KEY
          : v.GEMINI_API_KEY) ||
        v.AI_DAILY_LIMIT < 1)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'LIVE AI requires the selected provider API key and a positive AI_DAILY_LIMIT',
      });
  });
export type Config = z.infer<typeof configSchema>;
export const getConfig = () => configSchema.parse(process.env);
export const providerModel = (c: Config) =>
  c.ANALYSIS_PROVIDER === 'groq' ? c.GROQ_MODEL : c.GEMINI_MODEL;
export const providerKey = (c: Config) =>
  c.AI_AUTO_PROVIDER
    ? c.GEMINI_API_KEY || c.GROQ_API_KEY
    : c.ANALYSIS_PROVIDER === 'groq'
      ? c.GROQ_API_KEY
      : c.GEMINI_API_KEY;
export const quotaKey = (c: Config) =>
  c.ANALYSIS_PROVIDER === 'groq' ? 'groq:' + c.GROQ_MODEL : c.GEMINI_MODEL;
