import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'discovery.mock.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: {
    command: 'pnpm exec vite --config apps/web/vite.config.ts',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  timeout: 30000,
});
