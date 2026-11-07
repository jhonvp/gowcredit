import { expect, test } from '@playwright/test';

test('web app loads and renders decision outcomes from shared contracts', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/GowCredit/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('GowCredit — Pronto pago');
  await expect(page.getByText('QUALIFIES · DOES_NOT_QUALIFY · NEEDS_INFO')).toBeVisible();
});

test('web proxies /api to the API container', async ({ request }) => {
  // /health is outside the /api prefix, so a proxied /api/health must be answered by Nest (JSON 404), not Vite.
  const res = await request.get('/api/health');
  expect(res.status()).toBe(404);
  expect(res.headers()['content-type']).toContain('application/json');
});
