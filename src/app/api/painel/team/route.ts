export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { verifyAuth, safeJson, getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';

const ASSIGNABLE_ROLES = new Set(['seller', 'admin']);

// IMPORTANTE: só 'admin' pode gerenciar a equipe, não 'seller'.
// Se qualquer seller pudesse promover outros sellers, uma única conta
// de seller comprometida (senha vazada, sessão roubada) viraria uma
// porta pra criar contas ilimitadas com acesso ao painel. Restringir a
// admin mantém a superfície de escalonamento de privilégio pequena e
// auditável — só quem já é admin pode conceder mais acesso.
async function requireAdmin(req: NextRequest) {
  return verifyAuth(req, { roles: ['admin'] });
}

/** Lista quem hoje tem acesso ao painel (seller/admin). Só pra exibição — a
 *  autorização de verdade em cada rota sempre vem do custom claim do token,
 *  nunca deste documento Firestore. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const snap = await adminDb.collection('team').orderBy('addedAt', 'desc').get();
  const members = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return NextResponse.json({ members });
}

/** Promove uma conta já cadastrada (login prévio) a seller ou admin. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const ip = getClientIp(req);
  const key = `team-add:${auth.decoded.uid}`;
  if (!rateLimit(key, 10, 60_000) || !rateLimit(`team-add-ip:${ip}`, 20, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const body = await safeJson<{ email?: string; role?: string }>(req);
  if (!body.ok) return body.response;

  const email = (body.data.email ?? '').trim().toLowerCase();
  const role = (body.data.role ?? '').trim();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  }
  if (!ASSIGNABLE_ROLES.has(role)) {
    return NextResponse.json({ error: 'Role inválida' }, { status: 400 });
  }

  let targetUser;
  try {
    targetUser = await adminAuth.getUserByEmail(email);
  } catch {
    return NextResponse.json(
      { error: 'Essa conta ainda não existe. A pessoa precisa criar uma conta (ou fazer login) no site antes de ser adicionada à equipe.' },
      { status: 404 }
    );
  }

  // Preserva outros custom claims que eventualmente existam, só troca a role.
  const existingClaims = (targetUser.customClaims ?? {}) as Record<string, unknown>;
  await adminAuth.setCustomUserClaims(targetUser.uid, { ...existingClaims, role });

  // Revoga tokens antigos: a próxima requisição do usuário força refresh
  // e já vem com a role nova — sem isso a promoção só valeria depois que
  // o token dele expirasse sozinho (até 1h).
  await adminAuth.revokeRefreshTokens(targetUser.uid);

  await adminDb.collection('team').doc(targetUser.uid).set({
    email: targetUser.email ?? email,
    displayName: targetUser.displayName ?? null,
    role,
    addedBy: auth.decoded.uid,
    addedByEmail: (auth.decoded as { email?: string }).email ?? null,
    addedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return NextResponse.json({
    uid: targetUser.uid,
    email: targetUser.email,
    displayName: targetUser.displayName ?? null,
    role,
  });
}

/** Revoga o acesso de alguém ao painel (volta pra 'buyer'). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await safeJson<{ uid?: string }>(req);
  if (!body.ok) return body.response;

  const uid = (body.data.uid ?? '').trim();
  if (!uid) return NextResponse.json({ error: 'uid é obrigatório' }, { status: 400 });

  if (uid === auth.decoded.uid) {
    return NextResponse.json({ error: 'Você não pode remover seu próprio acesso.' }, { status: 400 });
  }

  let targetUser;
  try {
    targetUser = await adminAuth.getUser(uid);
  } catch {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const existingClaims = (targetUser.customClaims ?? {}) as Record<string, unknown>;
  await adminAuth.setCustomUserClaims(uid, { ...existingClaims, role: 'buyer' });
  await adminAuth.revokeRefreshTokens(uid);
  await adminDb.collection('team').doc(uid).delete();

  return NextResponse.json({ ok: true });
}
