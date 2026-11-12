import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const target =
  process.env.DATABASE_URL_TEST ?? 'mysql://radar:radar_local@127.0.0.1:3306/przetargradar_test';
const url = new URL(target);
const applicationDatabase = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).pathname
  : null;
if (!url.pathname.endsWith('_test') || url.pathname === applicationDatabase)
  throw new Error('Integration tests require a separate *_test database');
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run integration tests through pnpm test:integration');
const env = {
  ...process.env,
  DATABASE_URL: target,
  APP_MODE: 'DEMO',
  LOG_LEVEL: 'silent',
  ADMIN_TOKEN: 'integration-token-123456789012345678',
  DOCUMENTS_ENABLED: 'false',
  AI_LIVE_ENABLED: 'false',
  AI_DAILY_LIMIT: '0',
};
for (const args of [
  ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'packages/database/prisma/schema.prisma'],
  ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts'],
]) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    stdio: 'inherit',
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
