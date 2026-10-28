import { describe, expect, it } from 'vitest';
import { hasSecondFactor } from './staffMfa';

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
