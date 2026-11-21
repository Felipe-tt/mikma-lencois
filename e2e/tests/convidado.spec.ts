import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { charges, prepare } from './helpers';
import { cartOf, emptyCart, readOrder } from './db';

/** Link de acesso do convidado, como o e-mail manda (chave de PII dos testes, ver e2e/run.mjs). */
function guestLink(orderId: string, uid: string) {
  const body = `${orderId}.${uid}.${Date.now() + 60 * 60_000}`;
  const mac = createHmac('sha256', Buffer.alloc(32, 1)).update(`guest-access:${body}`).digest('base64url');
  return `${Buffer.from(body).toString('base64url')}.${mac}`;
}

test.beforeEach(async ({ context }) => { await prepare(context); });

test('visitante põe no carrinho sem login e, ao entrar na conta no checkout, o carrinho vai junto', async ({ page }) => {
  await emptyCart('volta@e2e.mikma');

  // Sem tela de login no meio: o produto entra direto, como convidado.
  await page.goto('/produtos/p2');
  await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
  await expect(page.getByText(/adicionado|no carrinho/i).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Entrar na sua conta' })).toHaveCount(0);

  // No checkout, quem já tem conta entra ali mesmo.
  await page.goto('/checkout');
  await expect(page.getByText('Comprando sem cadastro.')).toBeVisible();
  await page.getByRole('button', { name: 'Já tem conta? Entrar' }).click();
  const modal = page.getByRole('dialog', { name: 'Entrar na sua conta' });
  await modal.locator('#modal-login-email').fill('volta@e2e.mikma');
  await modal.locator('#modal-login-senha').fill('senha-e2e-123');
  await modal.getByRole('button', { name: 'Entrar na minha conta' }).click();

  // Segue no checkout, já na conta, com o produto que estava no carrinho.
  await expect(modal).toHaveCount(0);
  await expect(page.getByText('Comprando sem cadastro.')).toHaveCount(0);
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByText('Lençol Queen Malha Areia').first()).toBeVisible();
  await expect.poll(async () => (await cartOf('volta@e2e.mikma')).map(i => i.sku)).toEqual(['p2_v1']);
});

test('carrinho mostra o frete pelo CEP e o total já com ele', async ({ page }) => {
  await page.goto('/produtos/p1');
  await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
  await expect(page.getByText(/adicionado|no carrinho/i).first()).toBeVisible();

  await page.goto('/carrinho');
  await page.getByRole('button', { name: 'Calcular pelo CEP' }).click();
  await page.getByRole('textbox', { name: 'CEP para calcular o frete' }).fill('01310-100');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();

  // A entrega mais barata (a que o checkout marca) e o total com ela.
  await expect(page.getByText(/Correios PAC · Chega até/)).toBeVisible();
  await expect(page.getByText(/^R\$\s?21,90$/)).toBeVisible();
  await expect(page.getByText(/^R\$\s?211,80$/)).toBeVisible();

  // No checkout, o endereço já começa pelo CEP digitado no carrinho.
  await page.goto('/checkout');
  await page.fill('#co-name', 'Rita Convidada');
  await page.fill('#co-email', 'rita.convidada@e2e.mikma');
  await page.fill('#co-cpf', '52998224725');
  await page.fill('#co-phone', '47999998888');
  await page.check('#co-terms');
  await page.getByRole('button', { name: 'Continuar para endereço' }).click();
  await expect(page.locator('#co-cep')).toHaveValue('01310-100');
});

test('convidado abre o pedido em outro aparelho pelo link do e-mail', async ({ page, browser }) => {
  test.setTimeout(120_000);
  // Compra sem cadastro neste aparelho.
  await page.goto('/produtos/p4');
  await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
  await expect(page.getByText(/adicionado|no carrinho/i).first()).toBeVisible();
  await page.goto('/checkout');
  await page.fill('#co-name', 'Joana Visitante');
  await page.fill('#co-email', 'joana.visitante@e2e.mikma');
  await page.fill('#co-cpf', '52998224725');
  await page.fill('#co-phone', '47999998888');
  await page.check('#co-terms');
  await page.getByRole('button', { name: 'Continuar para endereço' }).click();
  await page.fill('#co-cep', '01310-100');
  await page.fill('#co-street', 'Avenida Paulista');
  await page.fill('#co-number', '900');
  await page.fill('#co-neighborhood', 'Bela Vista');
  await page.fill('#co-city', 'São Paulo');
  await page.click('#co-state');
  await page.getByRole('option', { name: 'SP', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar para entrega' }).click();
  await page.getByRole('button', { name: /Pagar .* com PIX/ }).first().click();
  await expect(page.getByText('Pague com PIX').first()).toBeVisible();
  const orderId = (await charges()).at(-1)!.externalId!;
  const uid = (await readOrder(orderId)).userId!;

  // Outro aparelho, sem sessão: em vez do login impossível, o link por e-mail.
  const other = await browser.newContext();
  await prepare(other);
  const phone = await other.newPage();
  await phone.goto(`/pedidos/${orderId}`);
  await expect(phone.getByText('Abra o seu pedido')).toBeVisible();
  await phone.getByRole('button', { name: 'Receber link por e-mail' }).click();
  await expect(phone.getByText(/o link chegou no e-mail da compra/)).toBeVisible();

  // O link do e-mail (assinado com a chave de teste) abre o pedido ali.
  await phone.goto(`/pedidos/${orderId}?acesso=${guestLink(orderId, uid)}`);
  await expect(phone.getByText(`#${orderId.slice(-8).toUpperCase()}`).first()).toBeVisible();
  await expect(phone).toHaveURL(new RegExp(`/pedidos/${orderId}$`));
  await expect(phone.getByText('Abra o seu pedido')).toHaveCount(0);
  await other.close();
});
