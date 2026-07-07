export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/security';
import { signBypassCookie, MAINTENANCE_BYPASS_COOKIE } from '@/lib/auth/maintenanceBypass';

// Só admin — seller não deve furar a manutenção da loja pública, só o
// próprio painel (que já é isento por rota, independente disso).
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['admin'] });
  if (!auth.ok) return auth.response;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sem o secret configurado, não tem como assinar o cookie com segurança.
    // Falha de forma visível em vez de deixar a manutenção quebrada
    // silenciosamente pra todo admin.
    return NextResponse.json({ error: 'Bypass não configurado' }, { status: 500 });
  }

  const cookieValue = await signBypassCookie(auth.decoded.uid, secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(MAINTENANCE_BYPASS_COOKIE, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 6 * 60 * 60, // 6h — mesmo TTL assinado no valor do cookie
  });
  return res;
}

// Logout / desativar bypass (best-effort, chamado ao deslogar)
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(MAINTENANCE_BYPASS_COOKIE);
  return res;
}
