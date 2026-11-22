import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/security';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSession';
import { restampAccount } from '@/lib/auth/authStamp';

/**
 * "Sair de todos os aparelhos": invalida todos os logins da pessoa. As APIs
 * conferem a revogação no token (checkRevoked), então qualquer outro
 * aparelho perde o acesso na próxima chamada, sem esperar o token expirar.
 * Vale também sem a segunda etapa: sair nunca concede acesso.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { allowWithoutSecondFactor: true });
  if (!auth.ok) return auth.response;

  await adminAuth.revokeRefreshTokens(auth.decoded.uid);
  // Mudança feita pelo site: a marca da conta acompanha (lib/auth/authStamp.ts).
  await restampAccount(adminDb, adminAuth, auth.decoded.uid).catch(err => console.error('[revoke-sessions] marca', err));

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
