export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, validateBody } from '@/lib/security';
import { LEGAL_VERSION } from '@/lib/legal';
import { verifyRecaptcha } from '@/lib/recaptcha';

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  acceptTerms: z.literal(true),
  recaptchaToken: z.string().max(4096).optional(),
});

// "Comprar sem cadastro": grava o e-mail e o aceite dos termos do convidado
// (login anônimo). São campos que só o servidor grava (regra do Firestore),
// e os pedidos e e-mails do pagamento leem daqui. Só para convidado: conta
// de verdade troca de e-mail pelo login, não por aqui.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `guest-profile:ip:${ip}`;
  if (!await rateLimit(key, 10, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(authHeader.slice(7)); } catch {
    return NextResponse.json({ error: 'Sessão expirada. Recarregue a página.' }, { status: 401 });
  }
  if (decoded.firebase?.sign_in_provider !== 'anonymous') {
    return NextResponse.json({ error: 'Só para compra sem cadastro' }, { status: 403 });
  }

  const body = await validateBody(req, schema);
  if (!body.ok) return NextResponse.json({ error: 'Confira o e-mail e aceite os termos.' }, { status: 400 });

  // Sessão anônima é de graça: o reCAPTCHA e o limite por e-mail seguram
  // robôs e e-mails da loja mandados para terceiros.
  if (!await verifyRecaptcha(body.data.recaptchaToken, 'guest_checkout')) {
    return NextResponse.json({ error: 'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.' }, { status: 403 });
  }
  const emailKey = `guest-profile:email:${body.data.email}`;
  if (!await rateLimit(emailKey, 10, 24 * 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(emailKey));

  const ref = adminDb.collection('users').doc(decoded.uid);
  const snap = await ref.get();
  await ref.set({
    uid: decoded.uid,
    email: body.data.email,
    role: 'buyer',
    guest: true,
    lgpdConsent: { date: new Date().toISOString(), version: LEGAL_VERSION, ip },
    ...(snap.exists ? {} : { createdAt: new Date().toISOString() }),
  }, { merge: true });
  return NextResponse.json({ ok: true });
}
