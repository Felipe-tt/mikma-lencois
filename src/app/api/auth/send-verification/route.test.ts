import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUserByEmail = vi.fn();
const setDoc = vi.fn(async (_data?: unknown) => undefined);
const sendEmail = vi.fn(async (_args?: unknown) => undefined);

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { getUserByEmail: (e: string) => getUserByEmail(e) },
  adminDb: { collection: () => ({ doc: () => ({ set: setDoc }) }) },
}));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: async () => true, rateLimitRetryAfter: () => 0 }));
vi.mock('@/lib/security', () => ({ getClientIp: () => '203.0.113.9' }));
vi.mock('@/lib/email', () => ({ sendEmail: (a: unknown) => sendEmail(a) }));
vi.mock('@/lib/auth-token', () => ({ generateActionToken: () => 'tok123' }));
vi.mock('@/lib/email-templates', () => ({ actionButtonEmailHtml: () => '<p>x</p>' }));
vi.mock('@/lib/recaptcha', () => ({ verifyRecaptcha: async () => true }));
vi.mock('@/lib/validation/emailDeliverability', () => ({ checkEmailDeliverability: async () => ({ ok: true }) }));

import { POST } from './route';

const call = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/auth/send-verification', { method: 'POST', body: JSON.stringify(body) }));
const valid = { name: 'Felipe Ittner', email: 'teste@gmail.com' };

describe('POST /api/auth/send-verification', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('e-mail novo: Admin SDK 14.x lanca { code } sem errorInfo e o cadastro segue (regressao do 500)', async () => {
    getUserByEmail.mockRejectedValue(Object.assign(new Error('no user'), { code: 'auth/user-not-found' }));
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('e-mail novo: formato antigo { errorInfo.code } tambem funciona', async () => {
    getUserByEmail.mockRejectedValue({ errorInfo: { code: 'auth/user-not-found' } });
    expect((await call(valid)).status).toBe(200);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('e-mail ja cadastrado: mesma resposta, avisa por e-mail e nao gera token', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'u1' });
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setDoc).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('erro desconhecido do Admin SDK: 500 e registra o motivo no log', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getUserByEmail.mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'auth/insufficient-permission' }));
    const res = await call(valid);
    expect(res.status).toBe(500);
    expect(setDoc).not.toHaveBeenCalled();
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).toContain('auth/insufficient-permission');
    expect(logged).toContain('permission denied');
    expect(logged).not.toContain('teste@gmail.com'); // sem e-mail do usuario no log
    spy.mockRestore();
  });

  it('rejeita nome com numeros e e-mail invalido com mensagem especifica', async () => {
    const a = await call({ name: 'Felipe 123', email: 'teste@gmail.com' });
    expect(a.status).toBe(400);
    expect((await a.json()).error).toMatch(/letras/i);
    const b = await call({ name: 'Felipe Ittner', email: 'teste@gmail' });
    expect(b.status).toBe(400);
    expect(getUserByEmail).not.toHaveBeenCalled();
  });
});
