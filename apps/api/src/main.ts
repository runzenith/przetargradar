import { db } from '../../../packages/database/src/client.js';
import { getConfig } from '../../../packages/core/src/config.js';
import { buildApp } from './app.js';
const config = getConfig();
const app = await buildApp(db, config);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void app.close().finally(() => db.$disconnect());
  });
try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch {
  app.log.error('API failed to start');
  await db.$disconnect();
  process.exitCode = 1;
}
