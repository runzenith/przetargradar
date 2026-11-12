import { db } from './client.js';
import { getConfig } from '../../core/src/config.js';
import { DemoSource } from '../../core/src/demo.js';
import { synchronize } from '../../core/src/sync.js';
import { processOneJob } from '../../core/src/jobs.js';
const config = getConfig();
try {
  if (config.APP_MODE !== 'DEMO') throw new Error('Demo seed is allowed only with APP_MODE=DEMO');
  console.log(await synchronize(db, new DemoSource(), config));
  while (await processOneJob(db, config)) {}
  console.log('DEMO ready: example notices and deterministic analyses persisted in MySQL');
} finally {
  await db.$disconnect();
}
