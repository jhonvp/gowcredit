import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { demoStatementPdf } from '../support/demo-statement';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const CFDI = join(__dirname, '../../../samples/cfdi/factura-ppd-anchor.xml');

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  // The session is stored when the login response arrives; wait for the redirect away from /login.
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function magicLink(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const search = (await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    ).json()) as { messages: { ID: string }[] };
    const id = search.messages[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      const m = /https?:\/\/[^\s]+\/owner#([A-Za-z0-9_-]+)/.exec(msg.Text);
      if (m) return m[1] as string;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email for ${to}`);
}

test('login rejects a wrong password', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle(/GowCredit/);
  await page.getByLabel('Correo').fill('supplier@demo.mx');
  await page.getByLabel('Contraseña').fill('wrong');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos');
});

/**
 * The whole product through the browser: supplier uploads a statement and an invoice, the system
 * asks the document owner by email, the owner answers on the magic-link page, the case is decided,
 * and the analyst sees the decision, the cascade and the clarification history.
 */
test('supplier → owner clarification → decision → analyst', async ({ page }) => {
  test.setTimeout(120_000);
  const owner = `owner+e2e${Date.now()}@demo.mx`;
  // Against the production build (vite preview / CloudFront) the CSP is on: nothing may violate it.
  const cspViolations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text());
  });

  // Supplier: upload a statement.
  await login(page, 'supplier@demo.mx');
  await expect(page.getByRole('heading', { name: 'Mis solicitudes' })).toBeVisible();
  await page.getByLabel('Archivo').setInputFiles({
    name: 'estado-de-cuenta.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(demoStatementPdf()),
  });
  await page.getByLabel(/Correo del dueño/).fill(owner);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.getByRole('link', { name: 'Ver solicitud' }).click();

  // The worker extracts and decides; the page polls until the decision shows.
  await expect(page.getByRole('region', { name: 'Decisión' })).toContainText('Califica', {
    timeout: 60_000,
  });

  // Add the invoice to the same case: a CFDI has no due date, so the owner is asked.
  await page.getByLabel('Documento adicional').setInputFiles(CFDI);
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Esperando al dueño del documento')).toBeVisible({ timeout: 60_000 });
  const caseUrl = page.url();
  const caseId = caseUrl.split('/').pop() as string;

  // Owner: open the magic link from the email and answer.
  const token = await magicLink(owner);
  await page.goto(`/owner#${token}`);
  await expect(page.getByText(/fecha de vencimiento/)).toBeVisible();
  const due = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Respuesta INVOICE_DUE_DATE').fill(due);
  await page.getByRole('button', { name: 'Enviar respuestas' }).click();
  await expect(page.getByRole('status')).toContainText('Resultado: Califica');

  // The link is single-use. (Old /owner/<token> links still open: they move the token to the fragment.)
  await page.goto(`/owner/${token}`);
  await expect(page).toHaveURL(new RegExp(`/owner#${token}$`));
  await expect(page.getByRole('alert')).toHaveText('Este enlace ya fue usado o expiró.');

  // Analyst: sees the decision, the tiers and the clarification history.
  await page.goto('/login');
  await page.evaluate(() => sessionStorage.clear());
  await login(page, 'analyst@demo.mx');
  await page.goto(`/analyst/cases/${caseId}`);
  await expect(page.getByRole('region', { name: 'Decisión' })).toContainText('Califica');
  await expect(page.getByRole('region', { name: 'Decisión' })).toContainText('Adelanto sugerido');
  await expect(page.getByText('resuelto por')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Aclaraciones' })).toContainText('answered');

  // Copilot: in replay mode without fixtures it answers from the decision trace.
  await page.getByRole('button', { name: 'Preguntar' }).click();
  await expect(page.getByRole('region', { name: 'Copiloto' }).getByRole('status')).toContainText(
    'QUALIFIES',
  );
  expect(cspViolations).toEqual([]);
});

test('web proxies /api to the API container', async ({ request }) => {
  const res = await request.get('/api/cases');
  expect(res.status()).toBe(401);
  expect(res.headers()['content-type']).toContain('application/json');
});
