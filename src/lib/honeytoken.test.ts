import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminAuth: {}, adminDb: {} }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

const { HONEY_LOGIN_EMAILS, honeyApiKey, isHoneyApiKey } = await import('./honeytoken');

describe('armadilhas', () => {
  it('a chave falsa é estável para o mesmo segredo e muda com outro', () => {
    expect(honeyApiKey('segredo-a')).toBe(honeyApiKey('segredo-a'));
    expect(honeyApiKey('segredo-a')).not.toBe(honeyApiKey('segredo-b'));
    expect(honeyApiKey('segredo-a')).toMatch(/^mk_live_[0-9a-f]{40}$/);
  });

  it('reconhece só a chave falsa', () => {
    const key = honeyApiKey('segredo-a');
    expect(isHoneyApiKey(key, 'segredo-a')).toBe(true);
    expect(isHoneyApiKey(` ${key} `, 'segredo-a')).toBe(true);
    expect(isHoneyApiKey(key, 'segredo-b')).toBe(false);
    expect(isHoneyApiKey('mk_live_' + '0'.repeat(40), 'segredo-a')).toBe(false);
    expect(isHoneyApiKey(null, 'segredo-a')).toBe(false);
    expect(isHoneyApiKey(key, undefined)).toBe(false);
  });

  it('os e-mails de isca não incluem contas reais da loja', () => {
    expect(HONEY_LOGIN_EMAILS.has('contato@mikma.com.br')).toBe(false);
    for (const e of HONEY_LOGIN_EMAILS) expect(e).toBe(e.toLowerCase());
  });
});
