import { test, expect, type Page } from '@playwright/test';
import { prepare } from './helpers';

test.beforeEach(async ({ context }) => { await prepare(context); });

const shots = process.env.E2E_SHOTS;
// Bloco do tamanho (seletor + medidas), só o que está visível: a transição
// de página deixa a anterior na tela por um instante.
const sizeBlock = (page: Page) => page.getByTestId('medidas').filter({ visible: true });

// Medidas do cartão da embalagem, embaixo do tamanho do produto (seed: p1 =
// lençol Casal, p3 = Jogo King, p4 = fronha avulsa; cada produto tem um tamanho).
test('a compra mostra o que vem no pacote do tamanho escolhido', async ({ page }) => {
  await page.goto('/produtos/p3');
  const jogo = sizeBlock(page);
  await expect(jogo.getByText('1 lençol', { exact: true })).toBeVisible();
  await expect(jogo.getByText(/para colchão de até 40 cm de altura/)).toBeVisible();
  await expect(jogo.getByText('193 × 198')).toBeVisible();
  await expect(jogo.getByText('2 Fronhas')).toBeVisible();
  await expect(jogo.getByText('50 × 70')).toBeVisible();

  await page.goto('/produtos/p1');
  const lencol = sizeBlock(page);
  await expect(lencol.getByText('138 × 188')).toBeVisible();
  await expect(lencol.getByText(/fronha/i)).toHaveCount(0);

  await page.goto('/produtos/p4');
  const fronha = sizeBlock(page);
  await expect(fronha.getByText('2 Fronhas')).toBeVisible();
  await expect(fronha.getByText(/lençol/i)).toHaveCount(0);
  if (shots) await fronha.locator('..').screenshot({ path: `${shots}/compra-fronha.png` });

});

test('produto de um tamanho só mostra o tamanho como texto, sem botão de escolha', async ({ page }) => {
  await page.goto('/produtos/p3');
  const block = sizeBlock(page).locator('..');
  await expect(block.getByText('Tamanho', { exact: true })).toBeVisible();
  await expect(block.getByText('King', { exact: true })).toBeVisible();
  await expect(block.getByText('Cinza', { exact: true })).toBeVisible();
  await expect(block.getByRole('button', { name: /King/ })).toHaveCount(0);
  if (shots) {
    await block.screenshot({ path: `${shots}/compra-jogo.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/produtos/p3');
    await page.screenshot({ path: `${shots}/compra-desktop.png` });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await sizeBlock(page).locator('..').screenshot({ path: `${shots}/compra-escuro.png` });
  }
});
