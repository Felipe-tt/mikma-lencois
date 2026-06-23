export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';

const schema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  code: z.string().length(6).regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit: 5 tentativas por IP por 15 min
  const ipKey = `verify-code:${ip}`;
  if (!rateLimit(ipKey, 5, 15 * 60 * 1000)) {
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
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }

  const { email, code } = parsed.data;

  const ref = adminDb.collection('email_verifications').doc(email);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Código expirado. Solicite um novo.' }, { status: 400 });
  }

  const data = snap.data()!;

  // Expirado
  if (Date.now() > data.expiresAt) {
    await ref.delete();
    return NextResponse.json({ error: 'Código expirado. Solicite um novo.' }, { status: 400 });
  }

  // Limite de tentativas por documento
  if (data.attempts >= 5) {
    await ref.delete();
    return NextResponse.json(
      { error: 'Muitas tentativas incorretas. Solicite um novo código.' },
      { status: 429 }
    );
  }

  // Código errado
  if (data.code !== code) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 });
    const left = 5 - (data.attempts + 1);
    return NextResponse.json(
      { error: left > 0 ? `Código incorreto. ${left} tentativa(s) restante(s).` : 'Código incorreto.' },
      { status: 400 }
    );
  }

  // ✅ Código correto — marca como verificado
  await ref.update({ verified: true, verifiedAt: new Date().toISOString(), ip });

  return NextResponse.json({ ok: true, name: data.name });
}
