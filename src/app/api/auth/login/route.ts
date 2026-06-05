export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit } from '@/lib/rateLimit';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

// Generic error — never reveal whether email exists or password is wrong
const INVALID = NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });

export async function POST(req: NextRequest) {
  // Rate limit: 10 attempts per IP per 15 minutes
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return INVALID;

    const { email, password } = parsed.data;

    const userRecord = await adminAuth.getUserByEmail(email).catch(() => null);
    if (!userRecord) return INVALID;

    const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
    if (!userDoc.exists) return INVALID;

    const { passwordHash } = userDoc.data() as { passwordHash?: string };

    if (!passwordHash) {
      // Google-only account — same generic error to avoid account enumeration
      return INVALID;
    }

    const { verify } = await import('@node-rs/argon2');
    const valid = await verify(passwordHash, password);
    if (!valid) return INVALID;

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
