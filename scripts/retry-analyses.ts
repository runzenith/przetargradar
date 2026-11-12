import { db } from '../packages/database/src/client.js';
import { quotaKey, getConfig } from '../packages/core/src/config.js';
const c = getConfig();
try {
  if (!process.argv.includes('--confirm'))
    throw new Error(
      'Use --confirm after fixing provider configuration. This requeues failed jobs; daily budget remains unchanged.',
    );
  await db.aiProviderState.deleteMany({ where: { id: quotaKey(c) } });
  const result = await db.analysisJob.updateMany({
    where: { status: 'failed', notice: { tender: { isDemo: c.APP_MODE === 'DEMO' } } },
    data: {
      status: 'pending',
      attempts: 0,
      error: null,
      availableAt: new Date(),
      leaseOwner: null,
      leaseUntil: null,
    },
  });
  await db.tender.updateMany({
    where: { isDemo: c.APP_MODE === 'DEMO', analysisStatus: 'failed' },
    data: { analysisStatus: 'pending' },
  });
  console.log({ requeued: result.count });
} finally {
  await db.$disconnect();
}
