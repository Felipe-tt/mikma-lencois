import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyRecaptcha, checkRecaptchaScore } from './recaptcha';

const okResponse = (body: object) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

describe('reCAPTCHA', () => {
  const original = process.env.RECAPTCHA_SECRET_KEY;
  beforeEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (original === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
    else process.env.RECAPTCHA_SECRET_KEY = original;
  });

  it('sem secret configurada: passa (dev/CI)', async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    expect(await verifyRecaptcha(undefined, 'register')).toBe(true);
    expect(await checkRecaptchaScore(undefined, 'login')).toBe('pass');
  });

  it('token ausente com secret configurada: NÃO passa (bot omitindo o campo)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyRecaptcha(undefined, 'register')).toBe(false);
    expect(await verifyRecaptcha('', 'register')).toBe(false);
    expect(await checkRecaptchaScore(undefined, 'login')).toBe('challenge');
    expect(spy).not.toHaveBeenCalled(); // nem precisa chamar o Google
  });

  it('token válido, ação certa e score alto: passa', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      okResponse({ success: true, score: 0.9, action: 'register' }),
    );
    expect(await verifyRecaptcha('tok', 'register')).toBe(true);
  });

  it('ação diferente, score baixo ou success=false: bloqueia', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    f.mockImplementationOnce(() => okResponse({ success: true, score: 0.9, action: 'outra' }));
    expect(await verifyRecaptcha('tok', 'register')).toBe(false);
    f.mockImplementationOnce(() => okResponse({ success: true, score: 0.1, action: 'register' }));
    expect(await verifyRecaptcha('tok', 'register')).toBe(false);
    f.mockImplementationOnce(() => okResponse({ success: false }));
    expect(await verifyRecaptcha('tok', 'register')).toBe(false);
  });

  it('falha de rede do Google: fail-open (não derruba o cadastro)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    expect(await verifyRecaptcha('tok', 'register')).toBe(true);
    expect(await checkRecaptchaScore('tok', 'login')).toBe('pass');
  });

  it('login em degraus: pass / challenge / block', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    f.mockImplementationOnce(() => okResponse({ success: true, score: 0.8, action: 'login' }));
    expect(await checkRecaptchaScore('tok', 'login')).toBe('pass');
    f.mockImplementationOnce(() => okResponse({ success: true, score: 0.4, action: 'login' }));
    expect(await checkRecaptchaScore('tok', 'login')).toBe('challenge');
    f.mockImplementationOnce(() => okResponse({ success: true, score: 0.1, action: 'login' }));
    expect(await checkRecaptchaScore('tok', 'login')).toBe('block');
  });
});
