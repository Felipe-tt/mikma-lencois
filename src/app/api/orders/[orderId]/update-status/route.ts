import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer, getClientIp, validateBody } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { updateStatusSchema } from './schema';
import { effectiveRole } from '@/lib/staffMfa';
import { advanceOrderStatus, StatusError } from '@/lib/orders/advanceStatus';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    // IMPORTANTE: o role vem do custom claim do token (setado via Admin SDK),
    // NUNCA de um campo do Firestore, o próprio usuário pode escrever no
    // próprio documento /users/{uid} (regra allow update: if isSelf(uid)),
    // então ler o role de lá permitiria qualquer comprador se autopromover
    // a seller e alterar status/cancelar pedidos de qualquer cliente.
    role = effectiveRole(decoded);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const ip = getClientIp(req);
  const key = `update-status:${uid}`;
  if (!await rateLimit(key, 40, 60_000) || !await rateLimit(`update-status-ip:${ip}`, 80, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const parsedBody = await validateBody(req, updateStatusSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  try {
    const { next, emailError } = await advanceOrderStatus(orderId, { fromStatus: body.fromStatus, trackingCode: body.trackingCode });
    return NextResponse.json({ ok: true, newStatus: next, emailError });
  } catch (err) {
    if (err instanceof StatusError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
