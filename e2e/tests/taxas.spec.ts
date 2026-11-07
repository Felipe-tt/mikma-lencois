import { test, expect } from '@playwright/test';
import { login, prepare, staffLogin } from './helpers';

test.beforeEach(async ({ context }) => { await prepare(context); });

test('carrinho: parcela sem juros já com a taxa do cartão, igual ao checkout', async ({ page }) => {
  await login(page, 'cliente@e2e.mikma', 'senha-e2e-123');
  await page.goto('/produtos/p2');
  await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
  await expect(page.getByText(/adicionado|no carrinho/i).first()).toBeVisible();
  await page.goto('/carrinho');
  // R$ 259,90 em 2x: (25990 + 60) / 0,96 = 27136, parcela de R$ 135,68.
  await expect(page.getByText(/até 2x de R\$\s?135,68 sem juros/).filter({ visible: true }).first()).toBeVisible();
});

test('painel: taxas da AbacatePay nas Configurações', async ({ page }) => {
  await staffLogin(page, 'admin@e2e.mikma', 'senha-e2e-123');
  await page.goto('/painel/configuracoes');
  await page.getByRole('button', { name: /Produtos/ }).first().click();
  await expect(page.getByText('Taxas da AbacatePay')).toBeVisible();
  await expect(page.getByRole('switch', { name: /Incluir no preço de cada produto/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/sai R\$\s?207,88, e a loja recebe R\$\s?200,00/)).toBeVisible();
});
