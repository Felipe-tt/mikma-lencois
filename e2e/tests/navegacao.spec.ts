import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

test.beforeEach(async ({ context }) => { await prepare(context); });

test('visitante navega pela loja sem erros', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/Mikma/);

  await page.goto('/produtos');
  const first = page.locator('a[href^="/produtos/p"]').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Adicionar ao carrinho/ }).first()).toBeVisible();

  for (const path of ['/sobre', '/guia-de-tamanhos', '/trocas-e-devolucoes']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
  expect(errors).toEqual([]);
});

test('páginas de máquina respondem (feed, llms.txt, catálogo)', async ({ request }) => {
  for (const [path, type] of [['/feed/google.xml', 'xml'], ['/llms.txt', 'text/plain'], ['/catalogo.json', 'json']]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type'], path).toContain(type);
  }
});
