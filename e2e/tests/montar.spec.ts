import { test, expect, type Page } from '@playwright/test';
import { addToCart, login, prepare } from './helpers';
import { db, emptyCart } from './db';

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/demo-mikma/databases/(default)/documents`;

/** Lê o carrinho direto no Firestore com a sessão de quem abriu o link (as regras valem). */
async function readCart(idToken: string, uid: string) {
  return (await fetch(`${FIRESTORE}/carts/${uid}`, { headers: { Authorization: `Bearer ${idToken}` } })).status;
}

/** Quadro "Montar junto" do carrinho, com o link ligado. */
const painel = (page: Page) => page.getByRole('region', { name: 'Montar junto' });

/** Cria o link no carrinho e devolve o caminho /montar/<token>. */
async function createLink(page: Page) {
  const criar = page.getByRole('button', { name: 'Criar link' });
  if (!await criar.isVisible()) await page.getByRole('button', { name: 'Montar junto com alguém' }).click();
  await criar.click();
  const href = await painel(page).getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
  return new URL(decodeURIComponent(href!).match(/https?:\/\/\S+\/montar\/[\w-]+/)![0]).pathname;
}

test.beforeEach(async ({ context }) => { await prepare(context); });

test('montar junto: quem abre o link vê o carrinho, e o link trocado corta quem tinha o antigo', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await emptyCart('junto@e2e.mikma');
  await login(page, 'junto@e2e.mikma', 'senha-e2e-123');
  await addToCart(page, 'p1');
  await page.goto('/carrinho');
  const path = await createLink(page);
  const uid = (await db().collection('sharedCarts').doc(path.split('/').pop()!).get()).get('uid') as string;

  // A amiga abre o link em outro aparelho, sem conta, e vê o carrinho ao vivo.
  const other = await browser.newContext();
  await prepare(other);
  const friend = await other.newPage();
  await friend.goto(path);
  await expect(friend.getByText('Júlia te chamou pra montar o pedido junto')).toBeVisible();
  await friend.getByPlaceholder('Seu nome').fill('Rita');
  await friend.getByRole('button', { name: 'Entrar no carrinho' }).click();
  await expect(friend.getByText('Carrinho de Júlia').filter({ visible: true }).first()).toBeVisible();
  await expect(friend.getByText('Lençol Casal Malha Branco').filter({ visible: true }).first()).toBeVisible();
  const session = await friend.evaluate(() => localStorage.getItem('mikma-guest-token'));
  expect(session).toBeTruthy();
  expect(await readCart(session!, uid)).toBe(200);

  // O dono desliga e cria outro link. Ela guardou o uid, mas não lê mais o
  // carrinho (nem o token novo que está nele).
  await painel(page).getByRole('button', { name: 'desligar link' }).click();
  await expect(painel(page)).toHaveCount(0);
  const novo = await createLink(page);
  expect(novo).not.toBe(path);
  expect(await readCart(session!, uid)).toBe(403);
  await friend.reload();
  await expect(friend.getByText(/expirou|desligado/i).first()).toBeVisible();
  await other.close();
});
