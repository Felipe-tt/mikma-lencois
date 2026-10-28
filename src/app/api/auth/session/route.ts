import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, verifyAuth } from '@/lib/security';
import { signStaffSession, STAFF_SESSION_COOKIE, STAFF_SESSION_MAX_AGE_SECONDS } from '@/lib/staffSession';
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, newDeviceId, noteStaffDevice } from '@/lib/staffDevices';
import type { MfaClaims } from '@/lib/staffMfa';

/**
 * Chamada pelo AuthContext no cliente sempre que o estado de auth do
 * Firebase muda (login, refresh de token) e a pessoa é seller/admin.
 * Emite um cookie HttpOnly enxuto que o middleware usa só pra decidir se
 * pula a tela de manutenção, não concede nenhum acesso a rota de API,
 * essas continuam exigindo o Bearer token normalmente.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) {
    // Sem o secret configurado no ambiente, não tem como assinar com
    // segurança, melhor não emitir cookie nenhum do que emitir um sem
    // proteção de verdade contra forjar.
    return NextResponse.json({ ok: false, reason: 'not_configured' });
  }

  const role = (auth.decoded as { role?: string }).role;
  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const exp = Math.floor(Date.now() / 1000) + STAFF_SESSION_MAX_AGE_SECONDS;
  const token = await signStaffSession({ uid: auth.decoded.uid, role, exp }, secret);

  // Aparelho novo da equipe: avisa por e-mail (ver lib/staffDevices.ts).
  // Falha aqui não pode impedir a pessoa de usar o painel.
  const deviceId = req.cookies.get(DEVICE_COOKIE)?.value || newDeviceId();
  try {
    await noteStaffDevice({
      uid: auth.decoded.uid,
      email: auth.decoded.email,
      role,
      claims: auth.decoded as MfaClaims,
      deviceId,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
      city: req.headers.get('cf-ipcity'),
      country: req.headers.get('cf-ipcountry'),
    });
  } catch (err) {
    console.error('staff device alert failed:', err);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
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
