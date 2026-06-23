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

  // Rate limit: 10 tentativas por IP por 15 min (mais generoso que antes,
  // já que não há mais digitação manual sujeita a erro de dedo — só
  // protege contra tentativas de adivinhar/forçar o token).
  const ipKey = `verify-code:${ip}`;
  if (!rateLimit(ipKey, 10, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json(
      { error: `Muitas tentativas. Aguarde ${wait} minuto(s).` },
      { status: 429 }
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 400 });
  }

  const { email, token } = parsed.data;

  const ref = adminDb.collection('email_verifications').doc(email);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 });
  }

  const data = snap.data()!;

  // Expirado
  if (Date.now() > data.expiresAt) {
    await ref.delete();
    return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 });
  }

  // Limite de tentativas por documento (proteção contra força bruta —
  // token tem 256 bits de entropia, então isso é só uma rede extra de segurança)
  if (data.attempts >= 10) {
    await ref.delete();
    return NextResponse.json(
      { error: 'Link inválido. Solicite um novo.' },
      { status: 429 }
    );
  }

  // Token errado
  if (data.token !== token) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return NextResponse.json({ error: 'Link inválido ou já utilizado.' }, { status: 400 });
  }

  // ✅ Token correto — marca como verificado
  await ref.update({ verified: true, verifiedAt: new Date().toISOString(), ip });

  return NextResponse.json({ ok: true, name: data.name });
}
