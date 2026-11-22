import type { DecodedIdToken } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { tooManyRequests } from '@/lib/security';
import { isGuestToken } from '@/lib/guestAccess';

/**
 * Pagamento de convidado ("comprar sem cadastro", login anônimo). Qualquer
 * um consegue uma sessão anônima nova, então o limite por usuário não segura
 * nada: aqui o convidado precisa ter passado pelo registro (e-mail e termos,
 * com reCAPTCHA, em /api/auth/guest-profile) e há um limite próprio por IP
 * para pagamentos pendentes, que reservam estoque.
 * Devolve uma resposta de erro, ou null para seguir.
 */
/**
 * Conta com senha e e-mail não confirmado. O cadastro do site confirma o
 * e-mail por código (e grava o aceite da LGPD), mas o Firebase Auth também
 * aceita cadastro direto pela API, com a chave pública: sem código, sem
 * reCAPTCHA. Uma conta assim compra como convidado: mesmos limites, e o
 * e-mail de "aguardando pagamento" não vai para um endereço que ninguém
 * confirmou (senão a loja mandaria e-mail em nome dela para qualquer um).
 */
export function isUnverifiedAccount(decoded: Pick<DecodedIdToken, 'firebase' | 'email_verified'> & { guest?: unknown }): boolean {
  return !isGuestToken(decoded) && decoded.firebase?.sign_in_provider === 'password' && decoded.email_verified !== true;
}

export async function guardGuestPayment(decoded: DecodedIdToken, ip: string): Promise<NextResponse | null> {
  if (isUnverifiedAccount(decoded)) {
    const key = `pay:unverified-ip:${ip}`;
    if (!await rateLimit(key, 5, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));
    // Teto da loja inteira, como o do convidado: contas criadas em série
    // não seguram o estoque.
    if (!await rateLimit('pay:unverified:global', 40, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitos pedidos agora. Tente de novo em alguns minutos.' }, { status: 429 });
    }
    return null;
  }
  if (!isGuestToken(decoded)) return null;
  const key = `pay:guest-ip:${ip}`;
  if (!await rateLimit(key, 5, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));
  // Teto da loja inteira: mesmo trocando de IP, robô não consegue abrir
  // pedido de convidado em série e segurar o estoque (cada um reserva peças).
  if (!await rateLimit('pay:guest:global', 40, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitos pedidos sem cadastro agora. Crie uma conta ou tente em alguns minutos.' }, { status: 429 });
  }
  const snap = await adminDb.collection('users').doc(decoded.uid).get();
  if (!snap.data()?.guest || typeof snap.data()?.email !== 'string') {
    return NextResponse.json({ error: 'Informe seu e-mail na identificação para continuar.' }, { status: 403 });
  }
  return null;
}

/** Peças por pedido de convidado: compra grande pede conta (com e-mail confirmado). */
export const GUEST_MAX_UNITS = 10;

export function guestUnitsBlock(decoded: DecodedIdToken, items: Array<{ quantity: number }>): NextResponse | null {
  const unverified = isUnverifiedAccount(decoded);
  if (!isGuestToken(decoded) && !unverified) return null;
  const units = items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  if (units <= GUEST_MAX_UNITS) return null;
  return NextResponse.json(
    { error: unverified
      ? `Para comprar mais de ${GUEST_MAX_UNITS} peças de uma vez, fale com a gente pelo WhatsApp.`
      : `Sem cadastro, o limite é de ${GUEST_MAX_UNITS} peças por pedido. Crie uma conta para comprar mais.` },
    { status: 400 },
  );
}
