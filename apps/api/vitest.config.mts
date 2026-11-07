import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit tests: pure, no services. Run with `make test`.
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'], environment: 'node' },
  // SWC keeps decorator metadata, which Nest DI needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
