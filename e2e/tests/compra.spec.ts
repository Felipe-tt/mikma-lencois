import { test, expect } from '@playwright/test';
import { charges, login, payPix, prepare, staffLogin } from './helpers';

test.beforeEach(async ({ context }) => { await prepare(context); });

test('cliente compra com PIX, o pagamento confirma e a loja vê o pedido pago', async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  await login(page, 'cliente@e2e.mikma', 'senha-e2e-123');

  // Produto → carrinho
  await page.goto('/produtos/p1');
  await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
  await expect(page.getByText(/adicionado|no carrinho/i).first()).toBeVisible();

  // Checkout: dados, endereço (já salvo), entrega e pagamento
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Finalizar compra' })).toBeVisible();
  // Com dados e endereço já salvos o checkout avança sozinho; clica em
  // "Continuar" só enquanto aparecer, até chegar no pagamento.
  // No celular o botão aparece no formulário e na barra fixa: qualquer um serve.
  const payPixButton = page.getByRole('button', { name: /Pagar .* com PIX/ }).first();
  const pixOption = page.getByRole('radio', { name: /PIX/ }).first();
  for (let i = 0; i < 40 && !(await payPixButton.isVisible()); i++) {
    const next = page.getByRole('button', { name: /^Continuar para/ }).first();
    if (await next.isVisible()) await next.click({ timeout: 1_500 }).catch(() => {});
    else await page.waitForTimeout(500);
  }
  await pixOption.check();
  await expect(payPixButton).toBeVisible();
  const before = (await charges()).length;
  await payPixButton.click();

  // PIX gerado na AbacatePay (simulada)
  await expect(page.getByText('Pague com PIX').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Copiar código PIX/ }).first()).toBeVisible();
  await expect.poll(async () => (await charges()).length).toBeGreaterThan(before);
  const charge = (await charges()).at(-1)!;
  expect(charge.externalId).toMatch(/^ord_/);
  expect(charge.amount).toBeGreaterThanOrEqual(18990); // produto + frete
  const orderId = charge.externalId!;

  // Webhook assinado: a loja confere a cobrança na "AbacatePay" e confirma
  const res = await payPix(baseURL!, charge.id, orderId, charge.amount);
  expect(res.status).toBe(200);
  await expect(page.getByText('Pagamento confirmado').first()).toBeVisible();

  // Loja: o pedido aparece pago no painel
  const staff = await browser.newContext();
  await prepare(staff);
  const panel = await staff.newPage();
  await staffLogin(panel, 'admin@e2e.mikma', 'senha-e2e-123');
  await panel.goto(`/painel/pedidos/${orderId}`);
  await expect(panel.getByText('Pago', { exact: true }).first()).toBeVisible();
  await staff.close();
});

test('webhook com assinatura falsa é recusado e não paga nada', async ({ request }) => {
  const res = await request.post('/api/payment/webhook', {
    headers: { 'content-type': 'application/json', 'x-abacatepay-signature': 'falsa' },
    data: { event: 'transparent.completed', data: { transparent: { id: 'pix_char_x', externalId: 'ord_x', status: 'PAID' } } },
  });
  expect(res.status()).toBe(401);
});
