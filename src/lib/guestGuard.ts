import type { DecodedIdToken } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { tooManyRequests } from '@/lib/security';

/**
 * Pagamento de convidado ("comprar sem cadastro", login anônimo). Qualquer
 * um consegue uma sessão anônima nova, então o limite por usuário não segura
 * nada: aqui o convidado precisa ter passado pelo registro (e-mail e termos,
 * com reCAPTCHA, em /api/auth/guest-profile) e há um limite próprio por IP
 * para pagamentos pendentes, que reservam estoque.
 * Devolve uma resposta de erro, ou null para seguir.
 */
export async function guardGuestPayment(decoded: DecodedIdToken, ip: string): Promise<NextResponse | null> {
  if (decoded.firebase?.sign_in_provider !== 'anonymous') return null;
  const key = `pay:guest-ip:${ip}`;
  if (!await rateLimit(key, 5, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));
  const snap = await adminDb.collection('users').doc(decoded.uid).get();
  if (!snap.data()?.guest || typeof snap.data()?.email !== 'string') {
    return NextResponse.json({ error: 'Informe seu e-mail na identificação para continuar.' }, { status: 403 });
  }
  return null;
}
