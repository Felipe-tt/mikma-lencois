import { test, expect } from '@playwright/test';
import { addToCart, charges, goToPayment, login, payPix, prepare } from './helpers';
import { db, emptyCart } from './db';

test.beforeEach(async ({ context }) => { await prepare(context); });

test('cupom de 1 uso por cliente: vale na primeira compra e depois não', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const code = `UMAVEZ${Date.now().toString(36).toUpperCase()}`;
  await db().collection('coupons').doc(code).set({
    code, type: 'percent', value: 10, minOrderCents: 0, maxUses: 100, usedCount: 0,
    active: true, expiresAt: null, maxUsesPerCustomer: 1, firstPurchaseOnly: false,
  });
  await emptyCart('cliente@e2e.mikma');
  await login(page, 'cliente@e2e.mikma', 'senha-e2e-123');

  async function aplicar() {
    await page.goto('/carrinho');
    await page.getByRole('button', { name: /Adicionar cupom/ }).click();
    await page.getByPlaceholder('Código do cupom').fill(code);
    await page.getByRole('button', { name: 'Aplicar' }).click();
  }

  // Primeira vez: o cupom entra e o PIX sai com desconto.
  await addToCart(page, 'p1');
  await aplicar();
  await expect(page.getByText(code).first()).toBeVisible();
  const payPixButton = await goToPayment(page);
  await page.getByRole('radio', { name: /PIX/ }).first().check();
  const before = (await charges()).length;
  await payPixButton.click();
  await expect.poll(async () => (await charges()).length).toBeGreaterThan(before);
  const charge = (await charges()).at(-1)!;
  expect((await payPix(baseURL!, charge.id, charge.externalId!, charge.amount)).status).toBe(200);
  await expect(page.getByText('Pagamento confirmado').first()).toBeVisible();

  const order = (await db().collection('orders').doc(charge.externalId!).get()).data()!;
  expect(order.couponCode).toBe(code);
  expect(order.couponDiscountCents).toBeGreaterThan(0);
  const coupon = await db().collection('coupons').doc(code).get();
  expect(coupon.get('usedCount')).toBe(1);
  const uso = await db().collection('coupons').doc(code).collection('clientes').doc(order.userId).get();
  expect(uso.get('usos')).toBe(1);
  // O cupom usado sai do carrinho.
  expect((await db().collection('carts').doc(order.userId).get()).get('couponCode')).toBeUndefined();

  // Segunda compra: o mesmo cliente não consegue usar de novo.
  await addToCart(page, 'p1');
  await aplicar();
  await expect(page.getByText('Você já usou este cupom')).toBeVisible();
});
