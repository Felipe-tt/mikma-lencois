import { test, expect } from '@playwright/test';
import { prepare } from './helpers';
import { cartOf, emptyCart } from './db';

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
