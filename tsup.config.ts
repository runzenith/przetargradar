import { defineConfig } from 'tsup';
export default defineConfig({
  entry: {
    'check-documents': 'scripts/check-documents.ts',
    'retry-imports': 'scripts/retry-imports.ts',
    'check-ted': 'scripts/check-ted.ts',
    'check-feeds': 'scripts/check-public-feeds.ts',
    'route-auto': 'scripts/route-auto.ts',
    'ai-log': 'scripts/ai-log.ts',
    retry: 'scripts/retry-analyses.ts',
    'check-gemini': 'scripts/check-gemini.ts',
    api: 'apps/api/src/main.ts',
    worker: 'apps/worker/src/main.ts',
    sync: 'apps/worker/src/cli.ts',
    seed: 'packages/database/src/seed.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
});
