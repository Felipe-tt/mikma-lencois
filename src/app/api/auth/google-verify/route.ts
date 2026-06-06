export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, safeJson, tooManyRequests } from '@/lib/security';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `google-verify:${ip}`;
  if (!rateLimit(key, 10, 15 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const body = await safeJson<{ idToken?: unknown }>(req, 16384);
  if (!body.ok) return body.response;

  const { idToken } = body.data;
  if (!idToken || typeof idToken !== 'string' || idToken.length > 8192) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  try {
    const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || !payload.email) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return NextResponse.json({ error: 'Token expirado' }, { status: 401 });
    }

    const { email, name, picture } = payload;
    let uid: string;

    try {
      const existing = await adminAuth.getUserByEmail(email);
      if (existing.disabled) {
        return NextResponse.json({ error: 'Conta desativada' }, { status: 403 });
      }
      uid = existing.uid;
      await adminAuth.updateUser(uid, {
        displayName: name ?? existing.displayName,
        photoURL: picture ?? existing.photoURL,
      });
    } catch {
      const newUser = await adminAuth.createUser({
        email, displayName: name, photoURL: picture, emailVerified: true,
      });
      uid = newUser.uid;
      await adminAuth.setCustomUserClaims(uid, { role: 'buyer' });
      await adminDb.collection('users').doc(uid).set({
        uid, name: name ?? '', email, photoURL: picture ?? '',
        role: 'buyer', createdAt: new Date().toISOString(),
        lgpdConsent: { date: new Date().toISOString(), version: '1.0', ip },
      });
    }

    const customToken = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ customToken });
  } catch (err) {
    console.error('[google-verify]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
