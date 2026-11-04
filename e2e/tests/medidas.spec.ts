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

});

test('trocar o tamanho troca as medidas e o desenho da cama', async ({ page }) => {
  await page.goto('/produtos/p5');
  const block = sizeBlock(page);
  for (const [size, sheet, pillows] of [['Solteiro', '88 × 188', '1 fronha'], ['Casal', '138 × 188', '2 fronhas'], ['Queen', '158 × 198', '2 fronhas'], ['King', '193 × 198', '2 fronhas']] as const) {
    await page.getByRole('button', { name: new RegExp(`^${size}`) }).first().click();
    await expect(block.getByText(sheet)).toBeVisible();
    await expect(block.getByText(pillows)).toBeVisible();
    if (shots) {
      await page.waitForTimeout(600); // fim da animação do desenho
      await block.locator('..').screenshot({ path: `${shots}/tam-${size}.png` });
    }
  }
  if (shots) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /^Casal/ }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/compra-desktop.png` });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await block.locator('..').screenshot({ path: `${shots}/compra-escuro.png` });
    await page.goto('/produtos/p4');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await sizeBlock(page).locator('..').screenshot({ path: `${shots}/fronha-escuro.png` });
  }
});
