import { test, expect, type Page } from '@playwright/test';
import { prepare } from './helpers';

test.beforeEach(async ({ context }) => { await prepare(context); });

const shots = process.env.E2E_SHOTS;
// Bloco do tamanho (seletor + medidas), só o que está visível: a transição
// de página deixa a anterior na tela por um instante.
const sizeBlock = (page: Page) => page.getByTestId('medidas').filter({ visible: true });

// Medidas do cartão da embalagem, embaixo do tamanho escolhido (seed: p1 =
// lençol Casal, p3 = Jogo King, p4 = fronha avulsa).
test('a compra mostra o que vem no pacote do tamanho escolhido', async ({ page }) => {
  await page.goto('/produtos/p3');
  const jogo = sizeBlock(page);
  await expect(jogo.getByText('Lençol com elástico')).toBeVisible();
  await expect(jogo.getByText('colchão de até 40 cm de altura')).toBeVisible();
  await expect(jogo.getByText('193 × 198')).toBeVisible();
  await expect(jogo.getByText('2 Fronhas')).toBeVisible();
  await expect(jogo.getByText('50 × 70')).toBeVisible();
  if (shots) await jogo.locator('..').screenshot({ path: `${shots}/compra-jogo.png` });

  await page.goto('/produtos/p1');
  const lencol = sizeBlock(page);
  await expect(lencol.getByText('138 × 188')).toBeVisible();
  await expect(lencol.getByText(/fronha/i)).toHaveCount(0);

  await page.goto('/produtos/p4');
  const fronha = sizeBlock(page);
  await expect(fronha.getByText('2 Fronhas')).toBeVisible();
  await expect(fronha.getByText(/lençol/i)).toHaveCount(0);
  if (shots) await fronha.locator('..').screenshot({ path: `${shots}/compra-fronha.png` });

  if (shots) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/produtos/p3');
    await page.screenshot({ path: `${shots}/compra-desktop.png` });
  }
});
