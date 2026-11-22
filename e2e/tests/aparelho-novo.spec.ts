import { test, expect, type Page } from '@playwright/test';
import { login, prepare } from './helpers';
import { db, forgetTrustedLogins } from './db';

/**
 * Aviso por e-mail de acesso por aparelho novo (lib/userDevices.ts). O
 * aparelho fica num cookie HttpOnly; um aparelho novo numa conta que já tem
 * outro manda o aviso para a dona. Aqui o envio falha (sem chave do Resend):
 * o teste confere o registro do aviso no banco.
 */
const EMAIL = 'aparelho@e2e.mikma';
const SENHA = 'senha-e2e-123';

async function uidOf(email: string): Promise<string> {
  const snap = await db().collection('users').where('email', '==', email).limit(1).get();
  expect(snap.docs[0], `conta ${email} no seed`).toBeTruthy();
  return snap.docs[0].id;
}

const devicesDoc = async (uid: string) => (await db().collection('userDevices').doc(uid).get()).data();

/** Espera a troca do login confiável terminar (é ela que registra o aparelho). */
async function loginAndSettle(page: Page) {
  const trust = page.waitForResponse(r => r.url().endsWith('/api/auth/trust') && r.request().method() === 'POST');
  await login(page, EMAIL, SENHA);
  expect(await (await trust).json()).toEqual({ trusted: true });
}

test('o aparelho do cadastro só entra na lista; um aparelho novo gera o aviso, e o conhecido não', async ({ page, browser }) => {
  const uid = await uidOf(EMAIL);
  await db().collection('userDevices').doc(uid).delete();
  await forgetTrustedLogins(EMAIL);

  // Conta recém-criada (o seed acabou de criar): o primeiro aparelho é o do cadastro.
  await prepare(page.context());
  await loginAndSettle(page);
  const cookie = (await page.context().cookies()).find(c => c.name === 'mikma_dev');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{24}$/);
  let saved = await devicesDoc(uid);
  expect(saved?.devices).toHaveLength(1);
  expect(saved?.lastAlertAt).toBeUndefined();
  // Nada do id em claro no banco.
  expect(JSON.stringify(saved)).not.toContain(cookie!.value);

  // Outro aparelho (outro navegador, sem o cookie): aviso para a dona.
  const other = await browser.newContext();
  await prepare(other);
  const phone = await other.newPage();
  const trust = phone.waitForResponse(r => r.url().endsWith('/api/auth/trust') && r.request().method() === 'POST');
  await login(phone, EMAIL, SENHA);
  expect(await (await trust).json()).toEqual({ trusted: true });
  saved = await devicesDoc(uid);
  expect(saved?.devices).toHaveLength(2);
  const alertAt = saved?.lastAlertAt;
  expect(alertAt).toEqual(expect.any(String));
  await other.close();

  // De volta ao primeiro aparelho, num login novo: conhecido, sem aviso.
  await page.goto('/conta');
  await page.getByRole('main').getByRole('button', { name: 'Sair da conta' }).click();
  await page.waitForURL(u => u.pathname.startsWith('/entrar'));
  await loginAndSettle(page);
  saved = await devicesDoc(uid);
  expect(saved?.devices).toHaveLength(2);
  expect(saved?.lastAlertAt).toBe(alertAt);
});

test('"Criar senha nova" do aviso abre o Esqueci minha senha, mesmo com a conta aberta', async ({ page }) => {
  await prepare(page.context());
  await page.goto('/entrar?esqueci=1');
  await expect(page.getByText('Esqueceu a senha?')).toBeVisible();
  await expect(page.locator('#forgot-email')).toHaveValue('');

  await login(page, EMAIL, SENHA);
  await page.goto('/entrar?esqueci=1');
  // Já com o e-mail da conta: a tela esperou saber quem está conectado, e não
  // mandou para a loja (o que /entrar faz com quem já entrou).
  await expect(page.locator('#forgot-email')).toHaveValue(EMAIL);
  await expect(page).toHaveURL(/\/entrar\?esqueci=1$/);
  // Fechou: a conta aberta segue para a loja, como em /entrar.
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'));
});
