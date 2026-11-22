import { test, expect, type APIRequestContext } from '@playwright/test';
import { db } from './db';

/**
 * O Firebase deixa quem entrou com a senha trocar a senha e o e-mail da
 * conta direto, sem passar pelo site. A troca feita por fora não pode virar
 * login confiável pelo site (lib/auth/authStamp.ts).
 */
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1`;
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-mikma';
const SENHA = 'senha-e2e-123';

let ip = 0;
const visitor = () => ({ 'x-mikma-edge': 'e2e-edge', 'cf-connecting-ip': `198.51.102.${++ip}` });

async function uidOf(email: string): Promise<string> {
  const snap = await db().collection('users').where('email', '==', email).limit(1).get();
  expect(snap.docs[0], `conta ${email} no seed`).toBeTruthy();
  return snap.docs[0].id;
}

/** Como a equipe do Firebase faria pelo console: deixa a conta como no cadastro. */
async function restore(request: APIRequestContext, uid: string, email: string) {
  const res = await request.post(`${AUTH}/projects/${PROJECT}/accounts:update`, {
    headers: { Authorization: 'Bearer owner' },
    data: { localId: uid, email, password: SENHA },
  });
  expect(res.ok()).toBe(true);
  await db().collection('auth_stamps').doc(uid).delete();
  await db().collection('login_challenges').doc(email).delete();
}

/** Quem tem a senha entra direto no Firebase e muda a conta por lá. */
async function changeOutside(request: APIRequestContext, email: string, change: { password?: string; email?: string }) {
  const signIn = await request.post(`${AUTH}/accounts:signInWithPassword?key=e2e-fake-api-key`, { data: { email, password: SENHA, returnSecureToken: true } });
  expect(signIn.ok()).toBe(true);
  const res = await request.post(`${AUTH}/accounts:update?key=e2e-fake-api-key`, { data: { idToken: (await signIn.json()).idToken, ...change, returnSecureToken: true } });
  expect(res.ok()).toBe(true);
}

const siteLogin = (request: APIRequestContext, email: string, password: string) =>
  request.post('/api/auth/login', { headers: visitor(), data: { email, password } });

test('senha trocada direto no Firebase: entrar pelo site com a nova não dá ticket, pede confirmação no e-mail', async ({ request }) => {
  const EMAIL = 'troca-senha@e2e.mikma';
  const uid = await uidOf(EMAIL);
  await restore(request, uid, EMAIL);
  try {
    // A dona entra pelo site: a conta ganha a marca.
    expect(await (await siteLogin(request, EMAIL, SENHA)).json()).toEqual({ ok: true, ticket: expect.any(String) });
    // O Firebase guarda a hora da mudança em segundos: a troca tem de cair
    // depois do segundo em que a conta foi arrumada acima.
    await new Promise(r => setTimeout(r, 1100));
    // Quem tem a senha vazada troca por uma nova, que não está em vazamento nenhum.
    await changeOutside(request, EMAIL, { password: 'Nova-senha-do-invasor-9' });
    const res = await siteLogin(request, EMAIL, 'Nova-senha-do-invasor-9');
    expect((await res.json()).ticket).toBeUndefined();
    // O pedido de confirmação foi para o e-mail da conta, com o motivo certo.
    const challenge = await db().collection('login_challenges').doc(EMAIL).get();
    expect(challenge.get('reason')).toBe('changed');
  } finally {
    await restore(request, uid, EMAIL);
  }
});

test('e-mail trocado direto no Firebase: com o e-mail novo não entra nem recebe senha nova', async ({ request }) => {
  const EMAIL = 'troca-email@e2e.mikma';
  const NOVO = 'invasor-e2e@exemplo.com';
  const uid = await uidOf(EMAIL);
  await restore(request, uid, EMAIL);
  try {
    expect(await (await siteLogin(request, EMAIL, SENHA)).json()).toEqual({ ok: true, ticket: expect.any(String) });
    await changeOutside(request, EMAIL, { email: NOVO });
    const res = await siteLogin(request, NOVO, SENHA);
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe('account_locked');
    // "Esqueci minha senha" com o e-mail novo responde igual, mas não gera link.
    const reset = await request.post('/api/auth/send-reset', { headers: visitor(), data: { email: NOVO } });
    expect(reset.ok()).toBe(true);
    expect((await db().collection('password_resets').doc(NOVO).get()).exists).toBe(false);
  } finally {
    await restore(request, uid, EMAIL);
    await db().collection('password_resets').doc(NOVO).delete();
  }
});

test('conta sem mudança por fora segue entrando com ticket, e a senha nova pelo site não trava nada', async ({ request }) => {
  const EMAIL = 'troca-senha@e2e.mikma';
  const uid = await uidOf(EMAIL);
  await restore(request, uid, EMAIL);
  try {
    expect(await (await siteLogin(request, EMAIL, SENHA)).json()).toEqual({ ok: true, ticket: expect.any(String) });
    // Senha nova pelo "esqueci minha senha" do site (o link que o e-mail traria).
    const token = 'r'.repeat(43);
    await db().collection('password_resets').doc(EMAIL).set({ email: EMAIL, token, expiresAt: Date.now() + 15 * 60_000, attempts: 0, ip: 'x', createdAt: new Date().toISOString() });
    const reset = await request.post('/api/auth/reset-password', { headers: visitor(), data: { email: EMAIL, token, newPassword: 'Outra-Senha-Boa-42' } });
    expect(reset.ok()).toBe(true);
    expect(await (await siteLogin(request, EMAIL, 'Outra-Senha-Boa-42')).json()).toEqual({ ok: true, ticket: expect.any(String) });
  } finally {
    await restore(request, uid, EMAIL);
  }
});

/** Entrada pelo Google no emulador: o id_token de teste é um JSON com sub e e-mail. */
const googlePostBody = (sub: string, email: string) =>
  `id_token=${encodeURIComponent(JSON.stringify({ sub, email, email_verified: true }))}&providerId=google.com`;
async function signInWithGoogle(request: APIRequestContext, sub: string, email: string, linkTo?: string): Promise<string> {
  const res = await request.post(`${AUTH}/accounts:signInWithIdp?key=e2e-fake-api-key`, {
    data: { postBody: googlePostBody(sub, email), requestUri: 'http://localhost', returnSecureToken: true, ...(linkTo ? { idToken: linkTo } : {}) },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).idToken;
}
const bearer = (token: string) => ({ ...visitor(), Authorization: `Bearer ${token}` });

test('Google de outra pessoa vinculado com a senha da conta não abre a conta', async ({ request }) => {
  const EMAIL = 'vinculo@e2e.mikma';
  const uid = await uidOf(EMAIL);
  const unlink = () => request.post(`${AUTH}/projects/${PROJECT}/accounts:update`, {
    headers: { Authorization: 'Bearer owner' }, data: { localId: uid, deleteProvider: ['google.com'] },
  });
  await unlink();
  await restore(request, uid, EMAIL);
  try {
    // Quem tem a senha entra direto e vincula o próprio Google à conta.
    const signIn = await request.post(`${AUTH}/accounts:signInWithPassword?key=e2e-fake-api-key`, { data: { email: EMAIL, password: SENHA, returnSecureToken: true } });
    await signInWithGoogle(request, 'google-do-invasor', 'invasor-google@exemplo.com', (await signIn.json()).idToken);
    // Depois entra pelo Google dele, já na conta da pessoa.
    const token = await signInWithGoogle(request, 'google-do-invasor', 'invasor-google@exemplo.com');
    expect(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).user_id).toBe(uid);
    expect(await (await request.post('/api/auth/trust', { headers: bearer(token) })).json()).toEqual({ trusted: false });
    const pii = await request.get('/api/user/pii', { headers: bearer(token) });
    expect(pii.status()).toBe(403);
    expect((await pii.json()).code).toBe('login_check');
  } finally {
    await unlink();
    await restore(request, uid, EMAIL);
  }
});

test('Google da própria pessoa entra normalmente', async ({ request }) => {
  const token = await signInWithGoogle(request, `google-${Date.now()}`, `google-${Date.now()}@exemplo.com`);
  expect(await (await request.post('/api/auth/trust', { headers: bearer(token) })).json()).toEqual({ trusted: true });
  expect((await request.get('/api/user/pii', { headers: bearer(token) })).status()).toBe(200);
});
