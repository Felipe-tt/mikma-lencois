export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';

const schema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  password: z.string().min(8).max(128),
  phone: z.string().max(20).optional(),
  cpf: z.string().length(11).regex(/^\d+$/).optional(),
  recaptchaToken: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  if (!await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(`register:${ip}`) / 60000);
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${wait} minuto(s).` },
      { status: 429, headers: { 'Retry-After': String(wait * 60) } }
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const { email, password, phone, cpf } = parsed.data;

  // ── Exige verificação prévia do e-mail ──────────────────────────────────
  const verifyRef = adminDb.collection('email_verifications').doc(email);
  const verifySnap = await verifyRef.get();

  if (!verifySnap.exists) {
    return NextResponse.json(
      { error: 'Confirme seu e-mail antes de criar a conta.' },
      { status: 403 }
    );
  }

  const vData = verifySnap.data()!;

  if (!vData.verified) {
    return NextResponse.json(
      { error: 'E-mail não confirmado. Clique no link enviado por e-mail.' },
      { status: 403 }
    );
  }

  if (Date.now() > vData.expiresAt + 30 * 60 * 1000) {
    // Dá 30 min extras após verificar para preencher o cadastro
    await verifyRef.delete();
    return NextResponse.json(
      { error: 'Sessão expirada. Comece o cadastro novamente.' },
      { status: 403 }
    );
  }

  const name: string = vData.name;

  try {
    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash(password, {
      memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32,
    });

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true, // já verificamos por código
    });

    await adminAuth.setCustomUserClaims(userRecord.uid, { role: 'buyer' });

    await adminDb.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      role: 'buyer',
      passwordHash,
      emailVerified: true,
      ...(phone ? { phone } : {}),
      ...(cpf ? { cpf } : {}),
      lgpdConsent: { date: new Date().toISOString(), version: '1.0', ip },
      createdAt: new Date().toISOString(),
    });

    // Remove verificação usada
    await verifyRef.delete();

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('email-already-exists')) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 409 });
    }
    console.error('[register]', error);
    return NextResponse.json({ error: 'Erro ao criar conta. Tente novamente.' }, { status: 500 });
  }
}
