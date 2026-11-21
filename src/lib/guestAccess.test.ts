import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => 'del' } }));

beforeAll(() => { process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); });

const { guestAccessToken, readGuestAccessToken, isGuestToken, GUEST_ACCESS_TTL_MS } = await import('./guestAccess');

const ORDER = 'ord_0123456789abcdef';
const UID = 'aB3dE5gH7jK9mN1pQ3sT5vX7zA1c';

describe('link de acesso do convidado', () => {
  it('abre o pedido e o convidado do link', () => {
    expect(readGuestAccessToken(guestAccessToken(ORDER, UID))).toEqual({ orderId: ORDER, uid: UID });
  });

  it('vence em 24 horas', () => {
    const now = Date.UTC(2026, 10, 21, 12);
    const token = guestAccessToken(ORDER, UID, now);
    expect(readGuestAccessToken(token, now + GUEST_ACCESS_TTL_MS - 1000)).not.toBeNull();
    expect(readGuestAccessToken(token, now + GUEST_ACCESS_TTL_MS + 1000)).toBeNull();
  });

  it('recusa link alterado: outro pedido, outro convidado ou prazo esticado', () => {
    const token = guestAccessToken(ORDER, UID);
    const [, mac] = token.split('.');
    const forge = (body: string) => `${Buffer.from(body).toString('base64url')}.${mac}`;
    expect(readGuestAccessToken(forge(`ord_ffffffffffffffff.${UID}.${Date.now() + 1e9}`))).toBeNull();
    expect(readGuestAccessToken(forge(`${ORDER}.outroUid.${Date.now() + 1e9}`))).toBeNull();
    expect(readGuestAccessToken(forge(`${ORDER}.${UID}.${Date.now() + 1e12}`))).toBeNull();
    expect(readGuestAccessToken(`${token}x`)).toBeNull();
    expect(readGuestAccessToken('qualquer.coisa')).toBeNull();
    expect(readGuestAccessToken('')).toBeNull();
  });

  it('conta como convidado o login anônimo e a volta pelo link, nada mais', () => {
    expect(isGuestToken({ firebase: { sign_in_provider: 'anonymous' } } as never)).toBe(true);
    expect(isGuestToken({ firebase: { sign_in_provider: 'custom' }, guest: true } as never)).toBe(true);
    expect(isGuestToken({ firebase: { sign_in_provider: 'custom' }, passkey: true } as never)).toBe(false);
    expect(isGuestToken({ firebase: { sign_in_provider: 'password' }, guest: true } as never)).toBe(false);
    expect(isGuestToken({ firebase: { sign_in_provider: 'google.com' } } as never)).toBe(false);
  });
});

describe('link do pedido nos e-mails de pagamento', () => {
  it('convidado recebe o link que já abre o pedido', async () => {
    const { guestOrderLink } = await import('./guestAccess');
    const link = guestOrderLink(ORDER, UID, { guest: true })!;
    expect(link).toMatch(new RegExp(`/pedidos/${ORDER}\\?acesso=`));
    expect(readGuestAccessToken(new URL(link).searchParams.get('acesso')!)).toEqual({ orderId: ORDER, uid: UID });
  });

  it('conta de verdade fica com o link normal', async () => {
    const { guestOrderLink } = await import('./guestAccess');
    expect(guestOrderLink(ORDER, UID, { guest: false })).toBeUndefined();
    expect(guestOrderLink(ORDER, UID, {})).toBeUndefined();
    expect(guestOrderLink(ORDER, UID, undefined)).toBeUndefined();
  });
});
