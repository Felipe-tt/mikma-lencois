import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {}, adminAuth: {} }));
const { relyingParty, deviceLabel, consumeChallenge } = await import('./passkeys');

describe('relyingParty', () => {
  it('usa o domínio do site, aceitando com e sem www', () => {
    expect(relyingParty('https://mikma.com.br')).toEqual({
      rpID: 'mikma.com.br',
      rpName: 'Mikma Lençóis',
      origins: ['https://mikma.com.br', 'https://www.mikma.com.br'],
    });
    expect(relyingParty('https://www.mikma.com.br').rpID).toBe('mikma.com.br');
  });

  it('funciona em localhost (testes)', () => {
    expect(relyingParty('http://localhost:3200')).toMatchObject({ rpID: 'localhost', origins: ['http://localhost:3200'] });
  });
});

describe('deviceLabel', () => {
  it('nomeia aparelho e navegador', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Windows · Edge');
    expect(deviceLabel(null)).toBe('Aparelho');
  });
});

describe('consumeChallenge', () => {
  it('recusa id malformado sem tocar no banco', async () => {
    expect(await consumeChallenge('../x', 'login')).toBeNull();
    expect(await consumeChallenge(123, 'login')).toBeNull();
  });
});
