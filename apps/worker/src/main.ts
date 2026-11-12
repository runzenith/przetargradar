import { processOneDocumentScan } from '../../../packages/core/src/documents.js';
import pino from 'pino';
import { writeFile } from 'node:fs/promises';
import { db } from '../../../packages/database/src/client.js';
import { getConfig } from '../../../packages/core/src/config.js';
import { createSources } from '../../../packages/core/src/source.js';
import { synchronizeCycle } from '../../../packages/core/src/sync.js';
import { processOneJob } from '../../../packages/core/src/jobs.js';
import { sleep, ExternalError } from '../../../packages/core/src/utils.js';
const config = getConfig();
const log = pino({ level: config.LOG_LEVEL });
const abort = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    log.info({ signal }, 'Stopping worker');
    abort.abort();
  });
const sources = createSources(config, db);
const interval = (id: string) =>
  id === 'pz' ? config.PZ_SYNC_INTERVAL_SECONDS : config.SYNC_INTERVAL_SECONDS;
const healthTimer = setInterval(() => {
  void db.$queryRaw`SELECT 1`
    .then(() =>
      writeFile(
        process.platform === 'win32' ? '.tools/worker-health' : '/tmp/przetargradar-worker',
        String(Date.now()),
      ),
    )
    .catch(() => {});
}, 10000);
healthTimer.unref();
log.info(
  { mode: config.APP_MODE, intervalSeconds: config.SYNC_INTERVAL_SECONDS },
  'Worker started (analysis concurrency: 1)',
);
async function sourceLoop(source: (typeof sources)[number]) {
  const id = source.id ?? 'bzp';
  const stateId = id === 'bzp' ? config.APP_MODE : config.APP_MODE + ':' + id;
  const last = await db.syncLog.findFirst({
    where: { sourceId: id },
    orderBy: { startedAt: 'desc' },
  });
  let next =
    last && last.status === 'completed'
      ? (last.finishedAt ?? last.startedAt).getTime() + interval(id) * 1000
      : 0;
  while (!abort.signal.aborted) {
    try {
      const state = await db.syncState.findUnique({ where: { id: stateId } });
      if (Date.now() >= next || state?.requested) {
        const result = await synchronizeCycle(db, source, config, abort.signal);
        next = Date.now() + (result.status === 'locked' ? 3000 : interval(id) * 1000);
        log.info({ source: id, ...result }, 'Synchronization cycle finished');
      }
      await sleep(1500, abort.signal);
    } catch (error) {
      if (abort.signal.aborted) break;
      const delay =
        error instanceof ExternalError
          ? Math.max(
              error.retryAfterMs ?? 0,
              error.status === 403 ? 3600000 : error.status === 429 ? 900000 : 60000,
            )
          : 60000;
      next = Date.now() + delay;
      log.error(
        {
          source: id,
          code:
            error instanceof ExternalError
              ? error.status
              : error instanceof Error && /^TED_[A-Z_]+$/.test(error.message)
                ? error.message
                : 'SYNC_ERROR',
          retryInSeconds: delay / 1000,
        },
        'Source synchronization failed; inspect sync logs',
      );
      try {
        await sleep(1500, abort.signal);
      } catch {
        break;
      }
    }
  }
}
async function analysisLoop() {
  while (!abort.signal.aborted) {
    try {
      if (await processOneJob(db, config, abort.signal)) continue;
      await sleep(1500, abort.signal);
    } catch {
      if (abort.signal.aborted) break;
      log.error('Analysis worker iteration failed; retrying');
      try {
        await sleep(3000, abort.signal);
      } catch {
        break;
      }
    }
  }
}
async function documentLoop() {
  while (!abort.signal.aborted) {
    try {
      if (await processOneDocumentScan(db, config, abort.signal))
        log.info({ event: 'documents.scan' }, 'Document scan completed');
      await sleep(3000, abort.signal);
    } catch {
      if (abort.signal.aborted) break;
      log.error({ event: 'documents.error' }, 'Document scan failed; retrying');
      try {
        await sleep(10000, abort.signal);
      } catch {
        break;
      }
    }
  }
}
const tasks = [...sources.map(sourceLoop), analysisLoop(), documentLoop()];
try {
  await Promise.all(tasks);
} catch {
  process.exitCode = 1;
  abort.abort();
  await Promise.allSettled(tasks);
} finally {
  clearInterval(healthTimer);
  await db.$disconnect();
  log.info('Worker stopped');
}
