import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests: real Postgres (gowcredit_test), migrations applied in global setup. Run with `make test-integration`.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.spec.ts'],
    environment: 'node',
    globalSetup: ['test/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
