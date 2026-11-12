import { DateTime } from 'luxon';
import type { PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { quotaKey } from './config.js';
import { AnalysisFailure } from './ai-errors.js';
export class QuotaWait extends Error {
  constructor(
    public until: Date,
    reason: string,
  ) {
    super(reason);
  }
}
export async function reserveProviderCall(
  db: PrismaClient,
  c: Config,
  jobId: string,
  reservedTokens: number,
) {
  const groq = c.ANALYSIS_PROVIDER === 'groq';
  const key = quotaKey(c);
  await db.aiQuotaLock.upsert({
    where: { id: key },
    create: { id: key },
    update: {},
  });
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM AiQuotaLock WHERE id=${key} FOR UPDATE`;
    const now = new Date(),
      day = DateTime.fromJSDate(now, { zone: 'America/Los_Angeles' }).toISODate()!;
    const minute = await tx.aiCall.aggregate({
      where: { model: key, startedAt: { gt: new Date(now.getTime() - 61000) } },
      _count: true,
      _sum: { reservedTokens: true },
    });
    const dailyWhere = groq
      ? { model: key, startedAt: { gt: new Date(now.getTime() - 86401000) } }
      : { model: key, pacificDay: day };
    const daily = await tx.aiCall.count({ where: dailyWhere });
    const dailyTokens = groq
      ? await tx.aiCall.aggregate({ where: dailyWhere, _sum: { reservedTokens: true } })
      : null;
    const rpm = Math.max(1, Math.floor((groq ? c.GROQ_RPM : c.GEMINI_RPM) * 0.8)),
      tpm = Math.floor((groq ? c.GROQ_TPM : c.GEMINI_TPM) * 0.8),
      rpd = Math.max(1, Math.floor((groq ? c.GROQ_RPD : c.GEMINI_RPD) * 0.8));
    if (reservedTokens > tpm)
      throw new AnalysisFailure(
        'AI_INPUT_TOO_LARGE',
        'Zmniejsz AI_MAX_INPUT_CHARS względem GEMINI_TPM.',
      );
    if (
      groq &&
      (dailyTokens?._sum.reservedTokens ?? 0) + reservedTokens > Math.floor(c.GROQ_TPD * 0.8)
    )
      throw new QuotaWait(new Date(now.getTime() + 86401000), 'GROQ_TPD');
    if (daily >= rpd)
      throw new QuotaWait(
        groq
          ? new Date(now.getTime() + 86401000)
          : DateTime.fromJSDate(now, { zone: 'America/Los_Angeles' })
              .plus({ days: 1 })
              .startOf('day')
              .toJSDate(),
        groq ? 'GROQ_RPD' : 'GEMINI_RPD',
      );
    if (minute._count >= rpm || (minute._sum.reservedTokens ?? 0) + reservedTokens > tpm)
      throw new QuotaWait(
        new Date(now.getTime() + 61000),
        groq ? 'GROQ_RPM_TPM' : 'GEMINI_RPM_TPM',
      );
    const utcDay = now.toISOString().slice(0, 10);
    await tx.aiBudget.upsert({ where: { day: utcDay }, create: { day: utcDay }, update: {} });
    const budget = await tx.aiBudget.findUniqueOrThrow({ where: { day: utcDay } });
    if (budget.calls >= c.AI_DAILY_LIMIT)
      throw new QuotaWait(
        DateTime.utc().plus({ days: 1 }).startOf('day').toJSDate(),
        'AI_DAILY_LIMIT',
      );
    if (budget.nextCallAt && budget.nextCallAt > now)
      throw new QuotaWait(budget.nextCallAt, 'AI_PACING');
    const spacing = Math.max(c.AI_REQUEST_INTERVAL_MS, Math.ceil(60000 / rpm));
    const claimed = await tx.aiBudget.updateMany({
      where: {
        day: utcDay,
        calls: { lt: c.AI_DAILY_LIMIT },
        OR: [{ nextCallAt: null }, { nextCallAt: { lte: now } }],
      },
      data: { calls: { increment: 1 }, nextCallAt: new Date(now.getTime() + spacing) },
    });
    if (!claimed.count) throw new QuotaWait(new Date(now.getTime() + spacing), 'AI_PACING');
    return tx.aiCall.create({
      data: { model: key, jobId, pacificDay: day, reservedTokens, startedAt: now },
    });
  });
}
