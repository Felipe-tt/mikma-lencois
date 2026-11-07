import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login, prepare } from './helpers';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-mikma' }));
const setPaused = (on: boolean) => db().collection('settings').doc('store').set({ salesPaused: on, salesPausedUntil: on ? '2027-01-15' : '' }, { merge: true });

test.beforeEach(async ({ context }) => { await prepare(context); });
test.afterEach(async () => { await setPaused(false); });

test('vendas pausadas: monta o carrinho, mas não finaliza', async ({ page }) => {
  await setPaused(true);
  await login(page, 'cliente@e2e.mikma', 'senha-e2e-123');
  await page.goto('/produtos/p1');
  await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
  await expect(page.getByText(/adicionado|no carrinho/i).first()).toBeVisible();

  await page.goto('/carrinho');
  await expect(page.getByText('Compras pausadas no momento').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/voltamos em 15\/01/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Finalizar compra/ })).toHaveCount(0);

  // O servidor também recusa, mesmo indo direto para a API.
  const res = await page.request.post('/api/payment/create-pix', { headers: { 'content-type': 'application/json' }, data: {} });
  expect([401, 503]).toContain(res.status());
});
