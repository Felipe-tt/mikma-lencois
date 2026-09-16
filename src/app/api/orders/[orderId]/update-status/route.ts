export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email';
import { extractBearer, getClientIp, validateBody } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import type { Order, OrderStatus, User } from '@/types';
import { updateStatusSchema } from './schema';
import { buildPreparing, buildShipped, buildDelivered } from '@/lib/email/orderStatusEmails';


const ALLOWED: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
};

// ─── Handler ──────────────────────────────────────────────────────────────────

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
    role = (decoded as { role?: string }).role ?? '';
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

  const ref = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

  const order = { id: snap.id, ...snap.data() } as Order;
  const next = ALLOWED[order.status];
  if (!next) return NextResponse.json({ error: `Não é possível avançar de "${order.status}"` }, { status: 400 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: next,
    updatedAt: FieldValue.serverTimestamp(),
    timeline: FieldValue.arrayUnion({ status: next, at: now }),
  };

  if (next === 'shipped') {
    if (body.trackingCode) update['delivery.trackingCode'] = body.trackingCode;
    update['delivery.dispatchedAt'] = FieldValue.serverTimestamp();
  }
  if (next === 'delivered') {
    update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
  }

  await ref.update(update);

  // Email ao cliente
  let emailError: string | null = null;
  try {
    const uSnap = await adminDb.collection('users').doc(order.userId).get();
    const userData = uSnap.data() as User | undefined;
    const customerEmail = userData?.email;
    const firstName = (userData?.name ?? '').split(' ')[0] || 'cliente';

    if (customerEmail) {
      const updatedOrder: Order = {
        ...order,
        status: next,
        delivery: {
          ...order.delivery,
          ...(next === 'shipped' && body.trackingCode ? { trackingCode: body.trackingCode } : {}),
        },
      };

      const payload =
        next === 'preparing' ? buildPreparing(updatedOrder, firstName) :
        next === 'shipped'   ? buildShipped(updatedOrder, firstName) :
        next === 'delivered' ? buildDelivered(updatedOrder, firstName) : null;

      if (payload) {
        await sendEmail({
          to: customerEmail,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          from: 'noreply',
          replyTo: 'contato@mikma.com.br',
        });
      }
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error('[update-status] email error:', emailError);
  }

  return NextResponse.json({ ok: true, newStatus: next, emailError });
}
