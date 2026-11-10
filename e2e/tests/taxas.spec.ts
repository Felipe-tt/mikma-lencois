import { test, expect } from '@playwright/test';
import { login, prepare, staffLogin } from './helpers';
import { forgetPasskeys } from './db';

test.beforeEach(async ({ context }) => { await prepare(context); });

test('carrinho: parcela sem juros já com a taxa do cartão, igual ao checkout', async ({ page }) => {
  await login(page, 'cliente@e2e.mikma', 'senha-e2e-123');
  await page.goto('/produtos/p2');
  await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
  await expect(page.getByText(/adicionado|no carrinho/i).first()).toBeVisible();
  await page.goto('/carrinho');
  // O carrinho pode ter itens de outros testes: a conta parte do subtotal.
  const hint = page.getByText(/até \dx de R\$\s?[\d.,]+ sem juros/).filter({ visible: true }).first();
  await expect(hint).toBeVisible();
  const subtotalText = await page.getByText(/^Subtotal/).filter({ visible: true }).first().locator('xpath=..').innerText();
  const cents = (t: string) => Number(t.replace(/[^\d,]/g, '').replace(',', '.')) * 100;
  const subtotal = Math.round(cents(subtotalText.split('\n').pop() ?? ''));
  const [, n, per] = (await hint.innerText()).match(/até (\d)x de (R\$\s?[\d.,]+)/)!;
  // Taxa do cartão à vista por padrão: 3,5% + R$ 0,60 (4% de 2x a 6x).
  const rate = Number(n) === 1 ? 0.035 : 0.04;
  const total = Math.ceil((subtotal + 60) / (1 - rate) - 1e-9);
  expect(Math.round(cents(per))).toBe(Math.round(total / Number(n)));
});

test('painel: taxas da AbacatePay nas Configurações', async ({ page }) => {
  await forgetPasskeys('admin@e2e.mikma');
  await staffLogin(page, 'admin@e2e.mikma', 'senha-e2e-123');
  await page.goto('/painel/configuracoes');
  await page.getByRole('button', { name: /Produtos/ }).first().click();
  await expect(page.getByText('Taxas da AbacatePay')).toBeVisible();
  await expect(page.getByRole('switch', { name: /Incluir no preço de cada produto/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/sai R\$\s?207,88, e a loja recebe R\$\s?200,00/)).toBeVisible();
});
