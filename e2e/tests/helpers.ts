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

/**
 * Autenticador virtual do Chromium (faz o papel do Face ID/digital) para
 * criar e usar passkey nos testes.
 */
export async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

/**
 * Equipe entrando no painel: senha, e na primeira vez a tela obrigatória
 * pede a passkey (a segunda etapa que o painel e as regras exigem).
 */
export async function staffLogin(page: Page, email: string, password: string) {
  await virtualAuthenticator(page);
  await login(page, email, password);
  await page.goto('/painel');
  await page.getByRole('button', { name: /Criar passkey e entrar|Entrar com minha passkey/ }).click();
  await page.getByRole('heading', { name: 'Proteja sua conta da equipe' }).waitFor({ state: 'detached', timeout: 30_000 });
}
