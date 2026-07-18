export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/security';
import { signStaffSession, STAFF_SESSION_COOKIE, STAFF_SESSION_MAX_AGE_SECONDS } from '@/lib/staffSession';

/**
 * Chamada pelo AuthContext no cliente sempre que o estado de auth do
 * Firebase muda (login, refresh de token) e a pessoa é seller/admin.
 * Emite um cookie HttpOnly enxuto que o middleware usa só pra decidir se
 * pula a tela de manutenção — não concede nenhum acesso a rota de API,
 * essas continuam exigindo o Bearer token normalmente.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) {
    // Sem o secret configurado no ambiente, não tem como assinar com
    // segurança — melhor não emitir cookie nenhum do que emitir um sem
    // proteção de verdade contra forjar.
    return NextResponse.json({ ok: false, reason: 'not_configured' });
  }

  const role = (auth.decoded as { role?: string }).role;
  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const exp = Math.floor(Date.now() / 1000) + STAFF_SESSION_MAX_AGE_SECONDS;
  const token = await signStaffSession({ uid: auth.decoded.uid, role, exp }, secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

/** Chamada no logout, pra não deixar o cookie de bypass vivo depois que a pessoa sai. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STAFF_SESSION_COOKIE);
  return res;
}
