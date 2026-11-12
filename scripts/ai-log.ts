import { db } from '../packages/database/src/client.js';
try {
  const calls = await db.aiCall.findMany({ orderBy: { startedAt: 'desc' }, take: 30 });
  for (const c of calls)
    console.log(
      JSON.stringify({
        callId: c.id,
        jobId: c.jobId,
        provider: c.model.startsWith('groq:') ? 'groq' : 'gemini',
        model: c.model.startsWith('groq:') ? c.model.slice(5) : c.model,
        startedAt: c.startedAt,
        status: c.status,
        durationMs: c.finishedAt ? c.finishedAt.getTime() - c.startedAt.getTime() : null,
        reservedTokenUpperBound: c.reservedTokens,
        tokens: c.tokens,
        code: c.code,
      }),
    );
} finally {
  await db.$disconnect();
}
