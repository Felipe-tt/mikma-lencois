export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  // Rate limit: 10 tentativas por IP por 15 minutos
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const key = `google-verify:${ip}`;
  if (!rateLimit(key, 10, 15 * 60 * 1000)) {
    const retryAfter = Math.ceil(rateLimitRetryAfter(key) / 1000);
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
    }

    const { idToken } = body as Record<string, unknown>;

    // Valida presença e tamanho do token (tokens Google têm ~1-4KB)
    if (!idToken || typeof idToken !== 'string' || idToken.length > 8192) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email_verified || !payload.email) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Garante que o token não está expirado (verifyIdToken já verifica, mas checagem extra)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return NextResponse.json({ error: 'Token expirado' }, { status: 401 });
    }

    const { email, name, picture } = payload;

    let uid: string;
    try {
      const existing = await adminAuth.getUserByEmail(email);
      uid = existing.uid;
      // Só atualiza campos não-sensíveis
      await adminAuth.updateUser(uid, {
        displayName: name ?? existing.displayName,
        photoURL: picture ?? existing.photoURL,
      });
    } catch {
      // Usuário não existe — cria
      const newUser = await adminAuth.createUser({
        email,
        displayName: name,
        photoURL: picture,
        emailVerified: true,
      });
      uid = newUser.uid;
      await adminAuth.setCustomUserClaims(uid, { role: 'buyer' });
      await adminDb.collection('users').doc(uid).set({
        uid,
        name: name ?? '',
        email,
        photoURL: picture ?? '',
        role: 'buyer',
        createdAt: new Date().toISOString(),
      });
    }

    const customToken = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ customToken });
  } catch (err) {
    console.error('[google-verify]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
