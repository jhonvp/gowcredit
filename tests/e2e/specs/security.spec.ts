import { expect, type Page, test } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/**
 * Stored XSS through an uploaded "XML": a supplier controls the file bytes, and the analyst view used
 * to show XML in a same-origin iframe (blob: URL), where an XHTML <script> runs with access to the
 * analyst's session token. The document must be shown as inert text.
 */
test('an uploaded XML with a script never runs in the analyst view', async ({ page, request }) => {
  const auth = await request.post('/api/auth/login', {
    data: { email: 'supplier@demo.mx', password: 'demo1234' },
  });
  const { accessToken } = (await auth.json()) as { accessToken: string };
  const payload =
    '<?xml version="1.0"?>\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
    '<script>try { top.__xss = sessionStorage.length + 1 } catch (e) { top.__xss = -1 }</script>' +
    'factura</body></html>';
  const upload = await request.post('/api/documents', {
    headers: { Authorization: `Bearer ${accessToken}` },
    multipart: {
      file: { name: 'factura.xml', mimeType: 'application/xml', buffer: Buffer.from(payload) },
    },
  });
  expect(upload.status()).toBe(202);
  const { caseId } = (await upload.json()) as { caseId: string };

  await login(page, 'analyst@demo.mx');
  await page.goto(`/analyst/cases/${caseId}`);
  await expect(page.getByRole('button', { name: 'factura.xml' })).toBeVisible();
  await page.waitForTimeout(2000); // let the document viewer load whatever it renders
  const ran = await page.evaluate(() => (globalThis as { __xss?: number }).__xss);
  expect(ran, 'script from the uploaded file ran in the app origin').toBeUndefined();
  // Shown as inert text instead, script tag included.
  await expect(page.getByText('<script>', { exact: false })).toBeVisible();
});
