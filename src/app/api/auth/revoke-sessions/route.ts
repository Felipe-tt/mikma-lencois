import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/security';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSession';

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

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
