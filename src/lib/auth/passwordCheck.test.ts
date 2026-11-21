import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPasswordServerSide } from './passwordCheck';

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('conferir a senha pelo servidor', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('senha certa, errada, limite do Firebase e rede fora', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'k');
    vi.stubGlobal('fetch', reply(200, { localId: 'u1' }));
    expect(await checkPasswordServerSide('a@x.com', 's')).toBe('ok');
    vi.stubGlobal('fetch', reply(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }));
    expect(await checkPasswordServerSide('a@x.com', 's')).toBe('wrong');
    vi.stubGlobal('fetch', reply(400, { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled' } }));
    expect(await checkPasswordServerSide('a@x.com', 's')).toBe('unavailable');
    vi.stubGlobal('fetch', reply(400, { error: { message: 'USER_DISABLED' } }));
    expect(await checkPasswordServerSide('a@x.com', 's')).toBe('unavailable');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
    expect(await checkPasswordServerSide('a@x.com', 's')).toBe('unavailable');
  });

  it('nos testes vai ao emulador do Auth', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'k');
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
    const f = reply(200, {});
    vi.stubGlobal('fetch', f);
    await checkPasswordServerSide('a@x.com', 's');
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/^http:\/\/127\.0\.0\.1:9099\/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/);
  });

  it('sem chave não confere', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', '');
    expect(await checkPasswordServerSide('a@x.com', 's')).toBe('unavailable');
  });
});
