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

test('páginas de máquina respondem (feed, llms.txt, catálogo, security.txt)', async ({ request }) => {
  for (const [path, type] of [['/feed/google.xml', 'xml'], ['/llms.txt', 'text/plain'], ['/catalogo.json', 'json'], ['/.well-known/security.txt', 'text/plain']]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type'], path).toContain(type);
  }
  // RFC 9116: contato e validade futura.
  const sec = await (await request.get('/.well-known/security.txt')).text();
  expect(sec).toMatch(/^Contact: /m);
  expect(Date.parse(sec.match(/^Expires: (.+)$/m)![1])).toBeGreaterThan(Date.now());
});

test('busca aceita erro de digitação e medida', async ({ page }) => {
  await page.goto('/produtos?q=lencol%20kng');
  await expect(page.getByText('Jogo de Cama King Malha Cinza').filter({ visible: true }).first()).toBeVisible();
  await page.goto('/produtos?q=158x198');
  await expect(page.getByText('Lençol Queen Malha Areia').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Lençol Casal Malha Branco')).toHaveCount(0);
});

test('filtro de tamanho mostra só aquele tamanho', async ({ page }) => {
  await page.goto('/produtos');
  await page.getByRole('navigation', { name: 'Tamanho' }).getByRole('link', { name: /^Casal/ }).click();
  await expect(page).toHaveURL(/tamanho=casal/);
  await expect(page.getByText('Lençol Casal Malha Branco').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Lençol Queen Malha Areia')).toHaveCount(0);
  await expect(page.getByText('Jogo de Cama King Malha Cinza')).toHaveCount(0);
});

test('WhatsApp discreto: produto abre a conversa com o nome do produto', async ({ page }) => {
  await page.goto('/produtos/p1');
  const link = page.getByRole('link', { name: 'Dúvida? Fale no WhatsApp' }).filter({ visible: true }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toContain('https://wa.me/5547999990000');
  expect(decodeURIComponent(href!.replace(/\+/g, ' '))).toContain('Lençol Casal Malha Branco');
  // Na página do produto não tem botão flutuante (já tem o link e a barra de compra).
  await expect(page.locator('.wa-float')).toHaveCount(0);
});
