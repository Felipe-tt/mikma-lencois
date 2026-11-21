import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('@/lib/firebase/admin', () => ({ adminAuth: {}, adminDb: {} }));
vi.mock('@/lib/settings', () => ({ getSettings: async () => ({}) }));

const { nfeDocToken, checkDocToken } = await import('./service');

const ORDER = 'ord_0123456789abcdef';
const original = process.env.STAFF_SESSION_SECRET;
afterEach(() => { process.env.STAFF_SESSION_SECRET = original; });

describe('link público da nota fiscal', () => {
  it('assina e confere com a chave configurada', () => {
    process.env.STAFF_SESSION_SECRET = 'chave-de-teste-com-mais-de-32-caracteres';
    const t = nfeDocToken(ORDER, 'producao');
    expect(checkDocToken(ORDER, 'producao', t)).toBe(true);
    expect(checkDocToken('ord_ffffffffffffffff', 'producao', t)).toBe(false);
    expect(checkDocToken(ORDER, 'homologacao', t)).toBe(false);
  });

  it('sem a chave, nenhum link vale (nem o assinado com chave vazia)', () => {
    delete process.env.STAFF_SESSION_SECRET;
    const forjado = createHmac('sha256', '').update(`nfe-doc:${ORDER}:producao`).digest('base64url').slice(0, 32);
    expect(nfeDocToken(ORDER, 'producao')).toBe('');
    expect(checkDocToken(ORDER, 'producao', forjado)).toBe(false);
    expect(checkDocToken(ORDER, 'producao', '')).toBe(false);
  });

  it('chave curta demais também não vale', () => {
    process.env.STAFF_SESSION_SECRET = 'curta';
    const forjado = createHmac('sha256', 'curta').update(`nfe-doc:${ORDER}:producao`).digest('base64url').slice(0, 32);
    expect(checkDocToken(ORDER, 'producao', forjado)).toBe(false);
  });
});
