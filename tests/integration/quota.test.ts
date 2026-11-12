import { beforeEach, afterAll, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { configSchema } from '../../packages/core/src/config.js';
import { reserveProviderCall, QuotaWait } from '../../packages/core/src/ai-quota.js';
const db = new PrismaClient(),
  c = configSchema.parse({ ...process.env, ANALYSIS_PROVIDER: 'gemini' });
if (!new URL(c.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Test database required');
beforeEach(async () => {
  await db.aiCall.deleteMany();
  await db.aiQuotaLock.deleteMany();
  await db.aiBudget.deleteMany();
});
afterAll(() => db.$disconnect());
it('serializes competing workers and reserves exactly one request', async () => {
  const config = { ...c, GEMINI_RPM: 1, AI_DAILY_LIMIT: 100 };
  const results = await Promise.allSettled([
    reserveProviderCall(db, config, 'job-a', 1000),
    reserveProviderCall(db, config, 'job-b', 1000),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await db.aiCall.count()).toBe(1);
  expect((await db.aiBudget.findFirstOrThrow()).calls).toBe(1);
});
it('keeps the application budget atomic even across different providers', async () => {
  const config = { ...c, AI_DAILY_LIMIT: 1 };
  const results = await Promise.allSettled([
    reserveProviderCall(db, config, 'gemini-job', 1000),
    reserveProviderCall(db, { ...config, ANALYSIS_PROVIDER: 'groq' }, 'groq-job', 1000),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await db.aiBudget.findFirstOrThrow()).calls).toBe(1);
  expect(await db.aiCall.count()).toBe(1);
});
it('defers oversized minute usage without spending another request', async () => {
  const config = { ...c, AI_DAILY_LIMIT: 100, GEMINI_TPM: 10000 };
  await reserveProviderCall(db, config, 'job-a', 6000);
  await db.aiBudget.updateMany({ data: { nextCallAt: null } });
  await expect(reserveProviderCall(db, config, 'job-b', 6000)).rejects.toBeInstanceOf(QuotaWait);
  expect(await db.aiCall.count()).toBe(1);
});
it('uses Pacific calendar for provider RPD and delays until next Pacific midnight', async () => {
  const config = { ...c, AI_DAILY_LIMIT: 100, GEMINI_RPD: 1 };
  const first = await reserveProviderCall(db, config, 'job-a', 1000);
  await db.aiBudget.updateMany({ data: { nextCallAt: null } });
  expect(first.pacificDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(reserveProviderCall(db, config, 'job-b', 1000)).rejects.toMatchObject({
    message: 'GEMINI_RPD',
  });
  expect((await db.aiBudget.findFirstOrThrow()).calls).toBe(1);
});
