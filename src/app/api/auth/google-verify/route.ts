export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, validateBody } from '@/lib/security';
import { z } from 'zod';
import { googleVerifySchema } from './schema';


const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `google-verify:${ip}`;
  if (!rateLimit(key, 10, 15 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const parsedBody = await validateBody(req, googleVerifySchema, 16384);
  if (!parsedBody.ok) return parsedBody.response;
  const { idToken } = parsedBody.data;

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

    // NAO ADICIONE createCustomToken AQUI.
    //
    // createCustomToken exige iam.serviceAccounts.signBlob na service account
    // do Cloud Run. No Firebase Hosting com webframeworks, essa permissão causou
    // horas de debug e nunca funcionou de forma estável.
    //
    // O fluxo correto é: servidor valida + cria user no Firestore,
    // client autentica com signInWithCredential(GoogleAuthProvider.credential(idToken)).
    // Veja AuthContext.tsx > loginWithGoogleToken para o fluxo completo.
    return NextResponse.json({ uid, verified: true });
  } catch (err) {
    console.error('[google-verify]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
