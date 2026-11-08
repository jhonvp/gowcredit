import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E against the running Docker stack (`make up`, then `make test-e2e`).
 * Runs inside the official Playwright image; reaches services by compose name.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://web:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
