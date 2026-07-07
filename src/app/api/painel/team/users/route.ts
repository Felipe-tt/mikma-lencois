export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { verifyAuth, getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';

// Admin SDK não tem "buscar por texto" nativo — lista até 1000 contas
// (suficiente pra uma loja pequena/média) e filtra em memória por
// e-mail/nome. Nunca expõe nada além de uid/e-mail/nome/foto/role.
const MAX_USERS_SCANNED = 1000;
const MAX_RESULTS = 20;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['admin'] });
  if (!auth.ok) return auth.response;

  const ip = getClientIp(req);
  const key = `team-search:${auth.decoded.uid}`;
  if (!rateLimit(key, 30, 60_000) || !rateLimit(`team-search-ip:${ip}`, 60, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas buscas. Aguarde um pouco.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();

  const { users } = await adminAuth.listUsers(MAX_USERS_SCANNED);

  const filtered = users
    .filter(u => !u.disabled)
    .filter(u => {
      if (!q) return true;
      const email = (u.email ?? '').toLowerCase();
      const name = (u.displayName ?? '').toLowerCase();
      return email.includes(q) || name.includes(q);
    })
    .slice(0, MAX_RESULTS)
    .map(u => ({
      uid: u.uid,
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
      role: ((u.customClaims as { role?: string } | undefined)?.role) ?? 'buyer',
    }));

  return NextResponse.json({ users: filtered, scanned: users.length, truncated: users.length >= MAX_USERS_SCANNED });
}
