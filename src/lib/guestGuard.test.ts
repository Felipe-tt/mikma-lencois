import { describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ guest: true, email: 'a@x.com' }) }) }) }) },
  adminAuth: {},
}));
const allow = vi.fn(async (..._args: unknown[]) => true);
vi.mock('@/lib/rateLimit', () => ({ rateLimit: (...a: unknown[]) => allow(...a), rateLimitRetryAfter: () => 1000 }));

import { GUEST_MAX_UNITS, guardGuestPayment, guestUnitsBlock, isUnverifiedAccount } from './guestGuard';

const tok = (firebase: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ uid: 'u1', firebase, ...extra }) as unknown as DecodedIdToken;
const naoConfirmada = tok({ sign_in_provider: 'password' }, { email_verified: false });

describe('conta com e-mail não confirmado (cadastro direto no Firebase)', () => {
  it('só conta com senha e e-mail não confirmado; Google, convidado e e-mail confirmado não', () => {
    expect(isUnverifiedAccount(naoConfirmada)).toBe(true);
    expect(isUnverifiedAccount(tok({ sign_in_provider: 'password' }))).toBe(true);
    expect(isUnverifiedAccount(tok({ sign_in_provider: 'password' }, { email_verified: true }))).toBe(false);
    expect(isUnverifiedAccount(tok({ sign_in_provider: 'google.com' }, { email_verified: true }))).toBe(false);
    expect(isUnverifiedAccount(tok({ sign_in_provider: 'anonymous' }))).toBe(false);
    expect(isUnverifiedAccount(tok({ sign_in_provider: 'custom' }, { guest: true }))).toBe(false);
  });

  it('paga com os limites de convidado: por IP e da loja inteira', async () => {
    allow.mockClear();
    expect(await guardGuestPayment(naoConfirmada, '1.2.3.4')).toBeNull();
    expect(allow.mock.calls.map(c => c[0])).toEqual(['pay:unverified-ip:1.2.3.4', 'pay:unverified:global']);
    allow.mockResolvedValueOnce(false);
    expect((await guardGuestPayment(naoConfirmada, '1.2.3.4'))?.status).toBe(429);
    allow.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await guardGuestPayment(naoConfirmada, '1.2.3.4'))?.status).toBe(429);
  });

  it('conta com e-mail confirmado não passa por esses limites', async () => {
    allow.mockClear();
    expect(await guardGuestPayment(tok({ sign_in_provider: 'password' }, { email_verified: true }), '1.2.3.4')).toBeNull();
    expect(allow).not.toHaveBeenCalled();
  });

  it(`mais de ${GUEST_MAX_UNITS} peças: pede para falar com a loja`, async () => {
    const muitas = [{ quantity: GUEST_MAX_UNITS + 1 }];
    const res = guestUnitsBlock(naoConfirmada, muitas);
    expect(res?.status).toBe(400);
    expect((await res!.json()).error).toMatch(/WhatsApp/);
    expect(guestUnitsBlock(naoConfirmada, [{ quantity: GUEST_MAX_UNITS }])).toBeNull();
    expect(guestUnitsBlock(tok({ sign_in_provider: 'password' }, { email_verified: true }), muitas)).toBeNull();
  });
});
