import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

test.beforeEach(async ({ context }) => { await prepare(context); });

// "Esta embalagem contém": o mesmo texto do cartão que vai dentro do pacote,
// só com os tamanhos do produto (seed: p3 = Jogo King, p4 = fronha avulsa).
test('página do produto mostra o conteúdo da embalagem igual ao cartão', async ({ page }) => {
  await page.goto('/produtos/p3');
  const box = page.locator('#medidas');
  await expect(box.getByText('Esta embalagem contém')).toBeVisible();
  await expect(box.getByText('King', { exact: true })).toBeVisible();
  await expect(box.getByText('01 Lençol (193 × 198 × 40 cm) / 02 fronhas (50 × 70 cm)')).toBeVisible();
  await expect(box.getByText('Serve em colchão de 193 × 198 cm, até 40 cm de altura')).toBeVisible();
  await expect(box.getByText('Casal', { exact: true })).toHaveCount(0);
  if (process.env.E2E_SHOTS) await box.screenshot({ path: `${process.env.E2E_SHOTS}/medidas-jogo.png` });

  await page.goto('/produtos/p4');
  await expect(page.locator('#medidas').getByText('02 fronhas (50 × 70 cm)')).toBeVisible();
  if (process.env.E2E_SHOTS) await page.locator('#medidas').screenshot({ path: `${process.env.E2E_SHOTS}/medidas-fronha.png` });
});
