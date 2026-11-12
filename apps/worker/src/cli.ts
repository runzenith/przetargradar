import { db } from '../../../packages/database/src/client.js';
import { getConfig } from '../../../packages/core/src/config.js';
import { createSources } from '../../../packages/core/src/source.js';
import { synchronizeCycle } from '../../../packages/core/src/sync.js';
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());
try {
  const config = getConfig();
  for (const source of createSources(config, db))
    console.log(source.id, await synchronizeCycle(db, source, config, abort.signal));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Synchronization failed');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
