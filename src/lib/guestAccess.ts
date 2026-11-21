import { timingSafeEqual } from 'crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { guestAccessMac } from '@/lib/piiCrypto';
import { BASE_URL } from '@/lib/email/layout';

/**
 * Link de acesso ao pedido de quem comprou sem cadastro. O convidado não tem
 * senha: em outro aparelho, ou no navegador do app de e-mail, o "Ver pedido"
 * caía num login impossível e não dava para acompanhar nem gerar outro PIX.
 * O link vai só para o e-mail da compra, vale 24 horas e entra como o
 * convidado (custom token com a marca `guest`).
 */
export const GUEST_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
/** Nos e-mails de andamento (despacho, entrega, avaliação): abertos dias depois. */
export const GUEST_EMAIL_LINK_TTL_MS = 7 * GUEST_ACCESS_TTL_MS;

export function guestAccessToken(orderId: string, uid: string, now = Date.now(), ttlMs = GUEST_ACCESS_TTL_MS): string {
  const body = `${orderId}.${uid}.${now + ttlMs}`;
  return `${Buffer.from(body).toString('base64url')}.${guestAccessMac(body)}`;
}

/** Pedido e convidado do link, se a assinatura confere e não venceu. */
export function readGuestAccessToken(token: string, now = Date.now()): { orderId: string; uid: string } | null {
  const [encoded, mac, extra] = token.split('.');
  if (!encoded || !mac || extra !== undefined) return null;
  const body = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = Buffer.from(guestAccessMac(body));
  const got = Buffer.from(mac);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  const [orderId, uid, exp] = body.split('.');
  if (!orderId || !uid || !(Number(exp) > now)) return null;
  return { orderId, uid };
}

/**
 * Sessão de convidado: login anônimo ou a volta pelo link acima (o Firebase
 * marca essa como "custom"; quem distingue é a marca `guest`).
 */
export function isGuestToken(decoded: Pick<DecodedIdToken, 'firebase'> & { guest?: unknown }): boolean {
  const provider = decoded.firebase?.sign_in_provider;
  return provider === 'anonymous' || (provider === 'custom' && decoded.guest === true);
}

/**
 * Link do pedido nos e-mails de pagamento ("falta o PIX", "PIX expirou",
 * lembrete): para o convidado, já com o acesso, e ele gera outro PIX direto
 * do app de e-mail. Conta de verdade fica com o link normal (undefined).
 */
export function guestOrderLink(orderId: string, uid: string, profile: object | undefined, ttlMs = GUEST_ACCESS_TTL_MS): string | undefined {
  if ((profile as { guest?: unknown } | undefined)?.guest !== true) return undefined;
  return `${BASE_URL}/pedidos/${orderId}?acesso=${guestAccessToken(orderId, uid, Date.now(), ttlMs)}`;
}
