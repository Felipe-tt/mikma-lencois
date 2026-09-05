export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';

const schema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  token: z.string().min(20).max(100),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipKey = `login-confirm:${ip}`;
  if (!await rateLimit(ipKey, 10, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json({ error: `Muitas tentativas. Aguarde ${wait} minuto(s).` }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

  const { email, token } = parsed.data;
  const ref = adminDb.collection('login_challenges').doc(email);
  const snap = await ref.get();

  if (!snap.exists) return NextResponse.json({ error: 'Link expirado. Faça login novamente.' }, { status: 400 });

  const data = snap.data()!;
  if (Date.now() > data.expiresAt) {
    await ref.delete();
    return NextResponse.json({ error: 'Link expirado. Faça login novamente.' }, { status: 400 });
  }
  if (data.attempts >= 10) {
    await ref.delete();
    return NextResponse.json({ error: 'Link inválido. Faça login novamente.' }, { status: 429 });
  }
  if (data.token !== token) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return NextResponse.json({ error: 'Link inválido ou já utilizado.' }, { status: 400 });
  }

  // Não deleta o doc aqui: a aba original ainda precisa fazer uma última
  // checagem (login-challenge-status) pra saber que pode prosseguir com
  // o signInWithEmailAndPassword. Só marca confirmado; o próprio TTL de
  // expiresAt cuida da limpeza (o doc nunca é reaproveitado, o próximo
  // login gera um token novo e sobrescreve).
  await ref.update({ confirmed: true, confirmedAt: new Date().toISOString() });

  return NextResponse.json({ ok: true });
}
