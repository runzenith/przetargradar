import { db } from '../packages/database/src/client.js';
import { getConfig } from '../packages/core/src/config.js';
import { ensureAnalysis, cacheKeyFor } from '../packages/core/src/ingest.js';
const config = getConfig();
try {
  if (!process.argv.includes('--confirm') || !config.AI_AUTO_PROVIDER || config.APP_MODE !== 'LIVE')
    throw new Error('Requires LIVE, AI_AUTO_PROVIDER=true and --confirm. Stop worker first.');
  if (await db.analysisJob.count({ where: { status: 'processing' } }))
    throw new Error('Processing jobs remain. Stop worker gracefully before routing the queue.');
  const tenders = await db.tender.findMany({
    where: { isDemo: false },
    select: {
      id: true,
      contentHash: true,
      notices: { where: { current: true }, take: 1, select: { id: true } },
    },
  });
  for (const t of tenders) {
    if (!t.notices[0]) continue;
    await db.$transaction(async (tx) => {
      await tx.analysisJob.updateMany({
        where: {
          notice: { tenderId: t.id },
          status: 'pending',
          dedupeKey: { not: cacheKeyFor(t.contentHash, config) },
        },
        data: { status: 'obsolete' },
      });
      await ensureAnalysis(tx, t.id, t.notices[0]!.id, t.contentHash, config);
    });
  }
  console.log({ routed: tenders.length, budgetReset: false });
} finally {
  await db.$disconnect();
}
