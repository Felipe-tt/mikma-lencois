import { test, expect, type APIRequestContext } from '@playwright/test';
import { login, prepare } from './helpers';

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

const bearer = (token: string) => ({ ...visitor(), Authorization: `Bearer ${token}` });

test('senha usada direto no Firebase não abre CPF, exportar nem apagar a conta', async ({ request }) => {
  const token = await directSignIn(request);
  expect((await request.post('/api/auth/trust', { headers: bearer(token) })).ok()).toBe(true);
  for (const [method, path] of [['GET', '/api/user/pii'], ['GET', '/api/user/export'], ['DELETE', '/api/user/delete']] as const) {
    const res = await request.fetch(path, { method, headers: bearer(token) });
    expect(res.status(), `${method} ${path}`).toBe(403);
    expect((await res.json()).code).toBe('login_check');
  }
});

test('ticket tirado com senha errada não vale para a senha certa', async ({ request }) => {
  const pre = await request.post('/api/auth/login', { headers: visitor(), data: { email: EMAIL, password: 'outra-senha-qualquer' } });
  expect(pre.status()).toBe(400);
  const token = await directSignIn(request);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(token) })).json()).toEqual({ trusted: false });
  expect((await request.get('/api/user/pii', { headers: bearer(token) })).status()).toBe(403);
});

test('login que passou pela checagem do site abre o CPF', async ({ request }) => {
  const pre = await request.post('/api/auth/login', { headers: visitor(), data: { email: EMAIL, password: SENHA } });
  expect(await pre.json()).toEqual({ ok: true });
  const token = await directSignIn(request);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(token) })).json()).toEqual({ trusted: true });
  const pii = await request.get('/api/user/pii', { headers: bearer(token) });
  expect(pii.status()).toBe(200);
  expect((await pii.json()).cpf).toBe('31870459601');
});

test('entrando pela tela, o perfil mostra o CPF', async ({ page }) => {
  await prepare(page.context());
  await login(page, EMAIL, SENHA);
  await page.goto('/perfil');
  await expect(page.getByText('***.704.596-**')).toBeVisible();
});

test('monitor: o servidor consegue conferir senha no Firebase', async ({ request }) => {
  // É o que scripts/site-health.mjs confere no site publicado depois de cada deploy.
  const headers = { 'x-cron-secret': 'e2e_cron_secret_0123456789' };
  expect((await (await request.get('/api/cron/health?login=1', { headers })).json()).login).toBe(true);
  // O monitor de minutos (Cloudflare) não passa o parâmetro e não chama o Firebase.
  expect((await (await request.get('/api/cron/health', { headers })).json())).not.toHaveProperty('login');
});
