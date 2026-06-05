export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: 'Token ausente' }, { status: 400 });

    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email_verified || !payload.email) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { email, name, picture } = payload;

    let uid: string;
    try {
      const existing = await adminAuth.getUserByEmail(email);
      uid = existing.uid;
      await adminAuth.updateUser(uid, { displayName: name, photoURL: picture });
    } catch {
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
