import { test, expect, type APIRequestContext } from '@playwright/test';
import { login, prepare } from './helpers';
import { db, forgetTrustedLogins } from './db';
import { createHash } from 'node:crypto';

/**
 * Senha vazada não abre o CPF. O Firebase Auth aceita a senha direto, com a
 * chave pública do site, pulando reCAPTCHA, limites e a confirmação por
 * e-mail da senha vazada. CPF, exportar e apagar a conta só valem para o
 * login que passou pela checagem do site (lib/auth/loginTicket.ts).
 */
const EMAIL = 'seguro@e2e.mikma';
const SENHA = 'senha-e2e-123';
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;

let ip = 0;
/** Cada chamada como um visitante com IP próprio (os limites são por IP). */
const visitor = () => ({ 'x-mikma-edge': 'e2e-edge', 'cf-connecting-ip': `198.51.100.${++ip}` });

/** Entra direto no Firebase Auth (emulador), sem passar pelo site. */
async function directSignIn(request: APIRequestContext, password = SENHA): Promise<string> {
  const res = await request.post(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e-fake-api-key`, {
    data: { email: EMAIL, password, returnSecureToken: true },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()).idToken;
}

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/${process.env.GCLOUD_PROJECT || 'demo-mikma'}/databases/(default)/documents`;
const uidOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).user_id as string;
/** Lê o próprio perfil (com endereço) direto no Firestore, como o SDK do navegador faz. */
const readProfile = (request: APIRequestContext, token: string) =>
  request.get(`${FIRESTORE}/users/${uidOf(token)}`, { headers: { Authorization: `Bearer ${token}` } });

const bearer = (token: string) => ({ ...visitor(), Authorization: `Bearer ${token}` });

// Cada teste começa sem login confiável da conta (ver forgetTrustedLogins).
test.beforeEach(async () => { await forgetTrustedLogins(EMAIL); });

test('senha usada direto no Firebase não abre CPF, exportar nem apagar a conta', async ({ request }) => {
  const token = await directSignIn(request);
  expect((await request.post('/api/auth/trust', { headers: bearer(token) })).ok()).toBe(true);
  for (const [method, path] of [['GET', '/api/user/pii'], ['GET', '/api/user/export'], ['DELETE', '/api/user/delete']] as const) {
    const res = await request.fetch(path, { method, headers: bearer(token) });
    expect(res.status(), `${method} ${path}`).toBe(403);
    expect((await res.json()).code).toBe('login_check');
  }
});

test('senha usada direto no Firebase não lê endereço pelo Firestore', async ({ request }) => {
  const token = await directSignIn(request);
  expect((await readProfile(request, token)).status()).toBe(403);
});

test('ticket tirado com senha errada não vale para a senha certa', async ({ request }) => {
  const pre = await request.post('/api/auth/login', { headers: visitor(), data: { email: EMAIL, password: 'outra-senha-qualquer' } });
  expect(pre.status()).toBe(400);
  const token = await directSignIn(request);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(token) })).json()).toEqual({ trusted: false });
  expect((await request.get('/api/user/pii', { headers: bearer(token) })).status()).toBe(403);
});

test('login que passou pela checagem do site abre o CPF', async ({ request }) => {
  const pre = await (await request.post('/api/auth/login', { headers: visitor(), data: { email: EMAIL, password: SENHA } })).json();
  expect(pre).toEqual({ ok: true, ticket: expect.any(String) });
  const token = await directSignIn(request);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(token), data: { ticket: pre.ticket } })).json()).toEqual({ trusted: true });
  const pii = await request.get('/api/user/pii', { headers: bearer(token) });
  expect(pii.status()).toBe(200);
  expect((await pii.json()).cpf).toBe('31870459601');
  expect((await readProfile(request, token)).status()).toBe(200);
});

test('entrando pela tela, o perfil mostra o CPF', async ({ page }) => {
  await prepare(page.context());
  await login(page, EMAIL, SENHA);
  await page.goto('/perfil');
  await expect(page.getByText('***.704.596-**')).toBeVisible();
});

test('ticket da dona da conta não serve para quem entra direto com a senha', async ({ request }) => {
  // A dona passa pela checagem; o ticket fica no navegador dela.
  const dona = await (await request.post('/api/auth/login', { headers: visitor(), data: { email: EMAIL, password: SENHA } })).json();
  // Quem tem a senha entra direto e tenta trocar sem o ticket, ou com um inventado.
  const intruso = await directSignIn(request);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(intruso) })).json()).toEqual({ trusted: false });
  expect(await (await request.post('/api/auth/trust', { headers: bearer(intruso), data: { ticket: 'A'.repeat(43) } })).json()).toEqual({ trusted: false });
  expect((await request.get('/api/user/pii', { headers: bearer(intruso) })).status()).toBe(403);
  // A dona, com o ticket dela, entra normalmente.
  const dela = await directSignIn(request);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(dela), data: { ticket: dona.ticket } })).json()).toEqual({ trusted: true });
});

test('confirmação por e-mail: o andamento e a entrada são só da aba que pediu', async ({ request }) => {
  const challenge = 'c'.repeat(43);
  const linkToken = 'l'.repeat(43);
  await db().collection('login_challenges').doc(EMAIL).set({
    email: EMAIL, token: linkToken, challengeHash: createHash('sha256').update(challenge).digest('hex'),
    expiresAt: Date.now() + 10 * 60_000, attempts: 0, confirmed: false, ip: 'x', createdAt: new Date().toISOString(),
  });
  const status = async (c?: string) => (await (await request.get(
    `/api/auth/login-challenge-status?email=${encodeURIComponent(EMAIL)}${c ? `&challenge=${c}` : ''}`, { headers: visitor() },
  )).json()).confirmed;
  // A dona clica no link do e-mail.
  expect((await request.post('/api/auth/login-confirm-challenge', { headers: visitor(), data: { email: EMAIL, token: linkToken } })).ok()).toBe(true);
  // Quem só sabe o e-mail não descobre que ela confirmou; a aba que pediu, sim.
  expect(await status()).toBe(false);
  expect(await status('d'.repeat(43))).toBe(false);
  expect(await status(challenge)).toBe(true);
  // E é a aba que pediu que entra com o login confiável (o id do desafio vira o ticket).
  const intruso = await directSignIn(request);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(intruso) })).json()).toEqual({ trusted: false });
  const aba = await directSignIn(request);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(aba), data: { ticket: challenge } })).json()).toEqual({ trusted: true });
  await db().collection('login_challenges').doc(EMAIL).delete();
});

test('login que perdeu a confiança mostra o aviso e leva para entrar de novo', async ({ page }) => {
  await prepare(page.context());
  await login(page, EMAIL, SENHA);
  await page.goto('/perfil');
  await expect(page.getByText('***.704.596-**')).toBeVisible();
  await expect(page.getByText('Por segurança, entre de novo')).toHaveCount(0);
  // Como um login com a senha usada direto no Firebase: sem o registro de confiança.
  const uid = (await db().collection('users').where('email', '==', EMAIL).limit(1).get()).docs[0].id;
  const trusted = await db().collection('trusted_logins').where('uid', '==', uid).get();
  await Promise.all(trusted.docs.map(d => d.ref.delete()));
  await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mikma-trust:')).forEach(k => localStorage.removeItem(k)));
  await page.reload();
  await expect(page.getByText('Por segurança, entre de novo na sua conta')).toBeVisible();
  await page.getByRole('button', { name: 'Entrar de novo' }).click();
  await page.waitForURL(u => u.pathname === '/entrar');
});

test('monitor: o servidor consegue conferir senha no Firebase', async ({ request }) => {
  // É o que scripts/site-health.mjs confere no site publicado depois de cada deploy.
  const headers = { 'x-cron-secret': 'e2e_cron_secret_0123456789' };
  expect((await (await request.get('/api/cron/health?login=1', { headers })).json()).login).toBe(true);
  // O monitor de minutos (Cloudflare) não passa o parâmetro e não chama o Firebase.
  expect((await (await request.get('/api/cron/health', { headers })).json())).not.toHaveProperty('login');
});
