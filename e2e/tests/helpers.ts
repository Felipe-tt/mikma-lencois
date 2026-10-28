import { createHmac } from 'node:crypto';
import type { Page, BrowserContext } from '@playwright/test';

export const ABACATE = 'http://127.0.0.1:4010';
const WEBHOOK_SECRET = 'e2e_webhook_secret';

/** Aceite de cookies e tema fixo, para nenhum banner atrapalhar o clique. */
export async function prepare(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    localStorage.setItem('mikma-cookie-consent', JSON.stringify({ necessary: true, analytics: false, date: new Date().toISOString() }));
    localStorage.setItem('mikma-theme', 'light');
  });
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/entrar');
  await page.fill('#login-email', email);
  await page.fill('input[type=password]', password);
  await page.locator('form button[type=submit]').last().click();
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'), { timeout: 30_000 });
}

/** Cobranças criadas na AbacatePay simulada (a mais nova por último). */
export async function charges(): Promise<Array<{ id: string; status: string; externalId?: string; amount: number }>> {
  return (await (await fetch(`${ABACATE}/__e2e/charges`)).json()).data;
}

/** Simula o pagamento: marca paga na "AbacatePay" e manda o webhook assinado. */
export async function payPix(baseURL: string, chargeId: string, orderId: string, amount: number) {
  await fetch(`${ABACATE}/__e2e/pay?id=${chargeId}`, { method: 'POST' });
  const body = JSON.stringify({ event: 'transparent.completed', devMode: false, data: { transparent: { id: chargeId, externalId: orderId, status: 'PAID', amount } } });
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('base64');
  return fetch(`${baseURL}/api/payment/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-abacatepay-signature': signature, 'x-mikma-edge': 'e2e-edge' },
    body,
  });
}
