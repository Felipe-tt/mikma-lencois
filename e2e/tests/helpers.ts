import { createHmac } from 'node:crypto';
import type { Page, BrowserContext } from '@playwright/test';

export const ABACATE = 'http://127.0.0.1:4010';
const WEBHOOK_SECRET = 'e2e_webhook_secret';

let visitors = 0;

/**
 * Aceite de cookies e tema fixo, para nenhum banner atrapalhar o clique.
 * Cada navegador de teste é um visitante com IP próprio, como chega pela
 * Cloudflare em produção: os limites por IP (10 logins em 15 minutos, por
 * exemplo) valem por pessoa, e a suíte inteira não esgota o de um IP só.
 */
export async function prepare(ctx: BrowserContext) {
  visitors = (visitors % 250) + 1;
  await ctx.setExtraHTTPHeaders({ 'x-mikma-edge': 'e2e-edge', 'cf-connecting-ip': `203.0.113.${visitors}` });
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

/** Coloca um produto no carrinho pela página dele. */
export async function addToCart(page: Page, productId: string) {
  await page.goto(`/produtos/${productId}`);
  await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
  await page.getByText(/adicionado|no carrinho/i).first().waitFor();
}

/**
 * Abre o checkout e avança até o pagamento. Com dados e endereço já salvos
 * o checkout avança sozinho; clica em "Continuar" só enquanto aparecer.
 * Devolve o botão de pagar com PIX (no celular ele aparece no formulário e
 * na barra fixa: qualquer um serve).
 */
export async function goToPayment(page: Page) {
  await page.goto('/checkout');
  await page.getByRole('heading', { name: 'Finalizar compra' }).waitFor();
  const payPixButton = page.getByRole('button', { name: /Pagar .* com PIX/ }).first();
  for (let i = 0; i < 40 && !(await payPixButton.isVisible()); i++) {
    const next = page.getByRole('button', { name: /^Continuar para/ }).first();
    if (await next.isVisible()) await next.click({ timeout: 1_500 }).catch(() => {});
    else await page.waitForTimeout(500);
  }
  await payPixButton.waitFor();
  return payPixButton;
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
  // O texto do botão muda enquanto espera o aparelho: o sinal de que entrou
  // é a tela obrigatória (com as etapas do acesso) sumir.
  await page.getByRole('list', { name: 'Etapas do acesso' }).waitFor({ state: 'detached', timeout: 30_000 });
}
