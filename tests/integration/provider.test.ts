import { vi, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { configSchema } from '../../packages/core/src/config.js';
import { demoNotices } from '../../packages/core/src/demo.js';
import { ingestNotice } from '../../packages/core/src/ingest.js';
import { processOneJob } from '../../packages/core/src/jobs.js';
import { analyzeDemo } from '../../packages/core/src/ai.js';
import { normalizeNotice } from '../../packages/core/src/bzp.js';
import { buildApp } from '../../apps/api/src/app.js';
const generate = vi.hoisted(() => vi.fn());
const groqGenerate = vi.hoisted(() => vi.fn());
vi.mock('groq-sdk', () => ({
  default: class {
    chat = { completions: { create: groqGenerate } };
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generate };
  },
}));
const db = new PrismaClient();
const config = configSchema.parse({
  ...process.env,
  APP_MODE: 'LIVE',
  ANALYSIS_PROVIDER: 'gemini',
  AI_LIVE_ENABLED: 'true',
  GEMINI_API_KEY: 'test-key',
  AI_DAILY_LIMIT: 20,
});
if (!new URL(config.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Test DB required');
beforeEach(async () => {
  generate.mockReset();
  groqGenerate.mockReset();
  await db.userTender.deleteMany();
  await db.tenderMatch.deleteMany();
  await db.analysisJob.deleteMany();
  await db.tenderAnalysis.deleteMany();
  await db.tenderNotice.deleteMany();
  await db.tender.deleteMany();
  await db.aiBudget.deleteMany();
  await db.aiProviderState.deleteMany();
  await db.aiCall.deleteMany();
});
afterAll(() => db.$disconnect());
it('routes a full notice to Gemini when Groq cannot fit it, without truncating or calling Groq', async () => {
  const c = {
    ...config,
    AI_AUTO_PROVIDER: true,
    ANALYSIS_PROVIDER: 'groq' as const,
    GROQ_API_KEY: 'test-key',
    GROQ_TPM: 8000,
  };
  const raw = {
    ...demoNotices()[0]!,
    htmlBody:
      demoNotices()[0]!.htmlBody + '<p>' + 'Dodatkowy materiał źródłowy. '.repeat(400) + '</p>',
  };
  const source = normalizeNotice(raw);
  generate.mockResolvedValue({
    candidates: [{ finishReason: 'STOP' }],
    text: JSON.stringify(analyzeDemo([{ sourceId: source.sourceId, text: source.text }], false)),
    modelVersion: c.GEMINI_MODEL,
    usageMetadata: { totalTokenCount: 80 },
  });
  await ingestNotice(db, raw, c);
  await processOneJob(db, c);
  expect(groqGenerate).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalledTimes(1);
  expect(JSON.parse(generate.mock.calls[0]![0].contents).materials[0].text).toBe(source.text);
  expect((await db.tenderAnalysis.findFirstOrThrow()).result).toMatchObject({
    scope: { truncated: false },
  });
});
it('automatically uses Groq when Gemini is paused, caches success and respects both quotas', async () => {
  const c = {
    ...config,
    AI_AUTO_PROVIDER: true,
    GROQ_API_KEY: 'test-key',
    GROQ_TPM: 100000,
    GROQ_TPD: 1000000,
  };
  const n = normalizeNotice(demoNotices()[0]);
  groqGenerate.mockResolvedValue({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify(analyzeDemo([{ sourceId: n.sourceId, text: n.text }], false)),
        },
      },
    ],
    usage: { total_tokens: 80 },
  });
  await db.aiProviderState.create({
    data: { id: c.GEMINI_MODEL, pausedUntil: new Date(Date.now() + 3600000), error: 'AI_HTTP_403' },
  });
  await ingestNotice(db, demoNotices()[0], c);
  await processOneJob(db, c);
  expect(generate).not.toHaveBeenCalled();
  expect(groqGenerate).toHaveBeenCalledTimes(1);
  expect((await db.tenderAnalysis.findFirstOrThrow()).provider).toBe('groq');
  await ingestNotice(db, demoNotices()[0], c);
  expect((await db.tender.findFirstOrThrow()).analysisStatus).toBe('completed');
  await db.aiBudget.updateMany({ data: { nextCallAt: null } });
  await ingestNotice(db, demoNotices()[1], c);
  await db.aiProviderState.create({
    data: {
      id: 'groq:' + c.GROQ_MODEL,
      pausedUntil: new Date(Date.now() + 3600000),
      error: 'AI_RATE_LIMIT',
    },
  });
  await processOneJob(db, c);
  expect(groqGenerate).toHaveBeenCalledTimes(1);
  const waiting = await db.analysisJob.findFirstOrThrow({ where: { status: 'pending' } });
  expect(waiting.attempts).toBe(0);
  expect(waiting.availableAt.getTime()).toBeGreaterThan(Date.now());
});
it('retries malformed output after a minute, exposes its schedule, and stops at the attempt limit', async () => {
  const c = { ...config, AI_MAX_ATTEMPTS: 2, GEMINI_TPM: 1000000 };
  await ingestNotice(db, demoNotices()[0], c);
  generate.mockResolvedValue({ candidates: [{ finishReason: 'STOP' }], text: '{}' });
  const before = Date.now();
  await processOneJob(db, c);
  const job = await db.analysisJob.findFirstOrThrow();
  expect(job.status).toBe('pending');
  expect(job.availableAt.getTime()).toBeGreaterThanOrEqual(before + 60000);
  expect(await db.aiProviderState.count()).toBe(0);
  await processOneJob(db, c);
  expect(generate).toHaveBeenCalledTimes(1);
  const app = await buildApp(db, c);
  const tender = await db.tender.findFirstOrThrow();
  const response = await app.inject({ method: 'GET', url: '/api/tenders/' + tender.id });
  expect(response.json().analysisJob).toMatchObject({
    status: 'pending',
    attempts: 1,
    maxAttempts: 2,
  });
  expect(response.json().analysisJob.nextAttemptAt).toBe(job.availableAt.toISOString());
  await app.close();
  await db.analysisJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
  await db.aiBudget.updateMany({ data: { nextCallAt: new Date(0) } });
  await processOneJob(db, c);
  expect(generate).toHaveBeenCalledTimes(2);
  expect((await db.analysisJob.findFirstOrThrow()).status).toBe('failed');
});
it('pauses the entire provider after first access error instead of spending the budget on every record', async () => {
  await ingestNotice(db, demoNotices()[0], config);
  await ingestNotice(db, demoNotices()[1], config);
  generate.mockRejectedValue({ status: 404, message: 'secret provider body' });
  await processOneJob(db, config);
  await processOneJob(db, config);
  await processOneJob(db, config);
  expect(generate).toHaveBeenCalledTimes(1);
  expect((await db.aiBudget.findFirstOrThrow()).calls).toBe(1);
  expect((await db.aiProviderState.findFirstOrThrow()).error).toContain('AI_HTTP_404');
  expect(
    (await db.analysisJob.findFirstOrThrow({ where: { error: { not: null } } })).error,
  ).not.toContain('secret');
});
it('does not repeatedly pay for a truncated response', async () => {
  await ingestNotice(db, demoNotices()[0], config);
  generate.mockResolvedValue({ candidates: [{ finishReason: 'MAX_TOKENS' }], text: '' });
  await processOneJob(db, config);
  expect(generate).toHaveBeenCalledTimes(1);
  expect((await db.analysisJob.findFirstOrThrow()).status).toBe('failed');
  expect((await db.analysisJob.findFirstOrThrow()).error).toContain('MAX_TOKENS');
});
it('persists a validated provider result and reuses it without another call', async () => {
  const source = normalizeNotice(demoNotices()[0]);
  const result = analyzeDemo([{ sourceId: source.sourceId, text: source.text }], false);
  const providerResult = {
    ...result,
    scope: { materials: 'pełna dokumentacja', sourceIds: ['invented'], truncated: true },
    deadline: { value: '18.11.2026 09:00' },
  };
  generate.mockResolvedValue({
    candidates: [{ finishReason: 'STOP' }],
    text: JSON.stringify(providerResult),
    modelVersion: config.GEMINI_MODEL,
    usageMetadata: { totalTokenCount: 42 },
  });
  await ingestNotice(db, demoNotices()[0], config);
  await processOneJob(db, config);
  expect((await db.tenderAnalysis.findFirstOrThrow()).status).toBe('completed');
  expect((await db.tenderAnalysis.findFirstOrThrow()).tokens).toBe(42);
  expect((await db.tenderAnalysis.findFirstOrThrow()).result).toMatchObject({
    scope: { materials: 'notice_only', sourceIds: [source.sourceId], truncated: false },
  });
  await ingestNotice(db, demoNotices()[0], config);
  await processOneJob(db, config);
  expect(generate).toHaveBeenCalledTimes(1);
  expect((await db.aiBudget.findFirstOrThrow()).calls).toBe(1);
  expect(await db.analysisJob.count()).toBe(1);
  const sent = generate.mock.calls[0]![0].config.responseJsonSchema;
  expect(sent.properties.title.type).toBe('string');
  expect(sent.required).toContain('requirements');
  expect(sent.properties.scope).toBeUndefined();
  expect(sent.properties.deadline).toBeUndefined();
  expect(JSON.stringify(sent)).not.toMatch(/"(?:pattern|maxItems|minLength|format)":/);
  const app = await buildApp(db, { ...config, GEMINI_MODEL: 'different-model' });
  const tender = await db.tender.findFirstOrThrow();
  const unchanged = await app.inject({ method: 'GET', url: '/api/tenders/' + tender.id });
  expect(unchanged.json().analysisStatus).toBe('completed');
  expect(unchanged.json().analysis.inputHash).toBe(unchanged.json().contentHash);
  await db.tender.update({ where: { id: tender.id }, data: { contentHash: 'a'.repeat(64) } });
  const changed = await app.inject({ method: 'GET', url: '/api/tenders/' + tender.id });
  expect(changed.json().analysisStatus).toBe('stale');
  await app.close();
});
it('runs Groq only when selected, with its own quota namespace and provider cache', async () => {
  const c = {
    ...config,
    ANALYSIS_PROVIDER: 'groq' as const,
    GROQ_API_KEY: 'test-key',
    GROQ_TPM: 100000,
    GROQ_TPD: 1000000,
  };
  const n = normalizeNotice(demoNotices()[0]);
  const result = analyzeDemo([{ sourceId: n.sourceId, text: n.text }], false);
  groqGenerate.mockResolvedValue({
    choices: [
      {
        finish_reason: 'stop',
        message: { content: JSON.stringify({ ...result, deadline: { value: 'nonsense' } }) },
      },
    ],
    usage: { total_tokens: 80 },
  });
  await ingestNotice(db, demoNotices()[0], c);
  await processOneJob(db, c);
  expect(generate).not.toHaveBeenCalled();
  expect(groqGenerate).toHaveBeenCalledTimes(1);
  expect((await db.tenderAnalysis.findFirstOrThrow()).provider).toBe('groq');
  expect((await db.aiCall.findFirstOrThrow()).model).toBe('groq:' + c.GROQ_MODEL);
  await ingestNotice(db, demoNotices()[0], c);
  await processOneJob(db, c);
  expect(groqGenerate).toHaveBeenCalledTimes(1);
});
