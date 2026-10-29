import { shippingBlockReason } from '@/lib/orders/shippingBlock';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email';
import { extractBearer, getClientIp, validateBody } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import type { Order, OrderStatus, User } from '@/types';
import { updateStatusSchema } from './schema';
import { buildPreparing, buildShipped, buildDelivered } from '@/lib/email/orderStatusEmails';
import { isManualDispatch } from '@/lib/carriers';
import { recordShippingSpent } from '@/lib/shipping-ledger';
import { effectiveRole } from '@/lib/staffMfa';

const ALLOWED: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
};

// ─── Handler ──────────────────────────────────────────────────────────────────

class StatusError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

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

  const ref = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();

  // Leitura e escrita na mesma transação: antes eram separadas, e dois
  // toques seguidos faziam o pedido pular de "pago" direto pra "enviado"
  // (sem rastreio) com dois e-mails pro cliente.
  let order: Order;
  let next: OrderStatus;
  try {
    ({ order, next } = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new StatusError(404, 'Pedido não encontrado');
      const current = { id: snap.id, ...snap.data() } as Order;
      if (body.fromStatus && body.fromStatus !== current.status) {
        throw new StatusError(409, 'Este pedido já foi atualizado. Atualize a página.');
      }
      const target = ALLOWED[current.status];
      if (!target) throw new StatusError(400, `Não é possível avançar de "${current.status}"`);
      if (target === 'shipped') {
        const blocked = shippingBlockReason(current);
        if (blocked) throw new StatusError(409, blocked);
      }

      const update: Record<string, unknown> = {
        status: target,
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({ status: target, at: now }),
      };
      if (target === 'shipped') {
        if (body.trackingCode) update['delivery.trackingCode'] = body.trackingCode;
        update['delivery.dispatchedAt'] = FieldValue.serverTimestamp();
      }
      if (target === 'delivered') {
        update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
      }
      tx.update(ref, update);
      return { order: current, next: target };
    }));
  } catch (err) {
    if (err instanceof StatusError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // Despacho manual (Correios/Jadlog): registra no caixa de frete o valor
  // cotado como custo estimado. Antes isso vinha da compra da etiqueta no
  // Melhor Envio; sem registrar, o teto de prejuízo do frete grátis
  // (freeShippingMaxLossCents) nunca disparava. Best-effort.
  if (next === 'shipped') {
    const carrier = order.delivery?.carrier ?? '';
    const estimatedCost = (order.delivery as { realPriceCents?: number } | undefined)?.realPriceCents ?? 0;
    if (isManualDispatch(carrier) && estimatedCost > 0) {
      try { await recordShippingSpent(estimatedCost); }
      catch (err) { console.warn(`[shipping-ledger] falha ao registrar gasto do pedido ${orderId}:`, err); }
    }
  }

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
