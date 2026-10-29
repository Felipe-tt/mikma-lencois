import { describe, expect, it } from 'vitest';
import { effectiveRole, hasSecondFactor } from './staffMfa';

describe('hasSecondFactor', () => {
  it('aceita código do app autenticador', () => {
    expect(hasSecondFactor({ firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } })).toBe(true);
  });
  it('aceita passkey (token próprio do servidor)', () => {
    expect(hasSecondFactor({ passkey: true, firebase: { sign_in_provider: 'custom' } })).toBe(true);
  });
  it('recusa só senha, só Google ou claim passkey fora do token próprio', () => {
    expect(hasSecondFactor({ firebase: { sign_in_provider: 'password' } })).toBe(false);
    expect(hasSecondFactor({ firebase: { sign_in_provider: 'google.com' } })).toBe(false);
    expect(hasSecondFactor({ passkey: true, firebase: { sign_in_provider: 'password' } })).toBe(false);
    expect(hasSecondFactor({ passkey: 'true', firebase: { sign_in_provider: 'custom' } })).toBe(false);
  });
});

describe('effectiveRole', () => {
  it('equipe com segunda etapa mantém o papel', () => {
    expect(effectiveRole({ role: 'admin', firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } })).toBe('admin');
    expect(effectiveRole({ role: 'seller', passkey: true, firebase: { sign_in_provider: 'custom' } })).toBe('seller');
  });
  it('equipe só com senha fica sem papel', () => {
    expect(effectiveRole({ role: 'admin', firebase: { sign_in_provider: 'password' } })).toBe('');
    expect(effectiveRole({ role: 'seller', firebase: { sign_in_provider: 'google.com' } })).toBe('');
  });
  it('cliente e token sem papel não mudam', () => {
    expect(effectiveRole({ role: 'buyer', firebase: { sign_in_provider: 'password' } })).toBe('buyer');
    expect(effectiveRole({ firebase: { sign_in_provider: 'password' } })).toBe('');
  });
});
