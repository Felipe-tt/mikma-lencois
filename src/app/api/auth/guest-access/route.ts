import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, validateBody } from '@/lib/security';
import { readGuestAccessToken } from '@/lib/guestAccess';

const schema = z.object({ token: z.string().min(20).max(600) });

/**
 * Troca o link de acesso do convidado (lib/guestAccess.ts) por uma sessão:
 * devolve um custom token do próprio convidado, com a marca `guest`, e o
 * navegador entra com signInWithCustomToken.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `guest-access-login:ip:${ip}`;
  if (!await rateLimit(key, 20, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));
  const body = await validateBody(req, schema);
  if (!body.ok) return body.response;

  const access = readGuestAccessToken(body.data.token);
  if (!access) {
    return NextResponse.json({ error: 'Este link venceu ou não vale mais. Peça outro na página do pedido.' }, { status: 400 });
  }
  // O pedido pode ter ido para uma conta (o convidado criou conta depois).
  const uid = (await adminDb.collection('orders').doc(access.orderId).get()).get('userId');
  const owner = uid === access.uid ? await adminAuth.getUser(uid).catch(() => null) : null;
  if (!owner || owner.email || owner.providerData.length > 0) {
    return NextResponse.json({ error: 'Este pedido agora está numa conta. Entre com o seu e-mail.', code: 'account' }, { status: 409 });
  }
  if (owner.disabled) return NextResponse.json({ error: 'Não foi possível abrir este pedido.' }, { status: 403 });

  try {
    return NextResponse.json({ token: await adminAuth.createCustomToken(access.uid, { guest: true }) });
  } catch (err) {
    console.error('[guest-access] custom token falhou:', err);
    return NextResponse.json({ error: 'Não deu para abrir o pedido agora. Tente de novo em alguns minutos.' }, { status: 500 });
  }
}
