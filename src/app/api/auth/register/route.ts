export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit } from '@/lib/rateLimit';

const schema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(256),
  password: z.string().min(8).max(128),
  recaptchaToken: z.string().min(1).optional(),
});

async function verifyRecaptcha(token: string): Promise<boolean> {
  if (!process.env.RECAPTCHA_SECRET_KEY) return true; // skip if not configured
  try {
    const res = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
      { method: 'POST' }
    );
    const data = await res.json();
    return data.success === true && (data.score == null || data.score >= 0.5);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 registrations per IP per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em 1 hora.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const { name, email, password, recaptchaToken } = parsed.data;

    // reCAPTCHA — required when secret is configured
    if (process.env.RECAPTCHA_SECRET_KEY) {
      if (!recaptchaToken) {
        return NextResponse.json({ error: 'reCAPTCHA obrigatório' }, { status: 400 });
      }
      const captchaOk = await verifyRecaptcha(recaptchaToken);
      if (!captchaOk) {
        return NextResponse.json({ error: 'reCAPTCHA inválido' }, { status: 400 });
      }
    }

    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash(password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      outputLen: 32,
    });

    const userRecord = await adminAuth.createUser({ email, password, displayName: name });
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: 'buyer' });

    await adminDb.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      role: 'buyer',
      passwordHash,
      lgpdConsent: { date: new Date().toISOString(), version: '1.0' },
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    console.error('[register]', error);
    if (msg.includes('email-already-exists')) {
      // Don't reveal if email exists — generic message
      return NextResponse.json({ success: true }, { status: 201 });
    }
    return NextResponse.json({ error: 'Erro ao criar conta' }, { status: 500 });
  }
}
