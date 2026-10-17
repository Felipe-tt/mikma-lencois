export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, getClientIp, validateBody } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { z } from 'zod';
import { adminCancelSchema } from './schema';
import { expandStockLines } from '@/lib/orderStockLines';
import { orderStockLog } from '@/lib/stockHistory';
import { releaseCouponUse } from '@/lib/orders/couponUsage';
import { uberCancelDelivery } from '@/lib/uber-direct';
import { notifyOrderCancelled } from '@/lib/email/cancelledEmail';


// Statuses que ainda não tiveram o estoque debitado (só reservado)
const PENDING_STATUSES = new Set(['pending_payment']);
// Statuses sem reserva nem débito ativo (PIX expirou, reserva já liberada)
const NO_STOCK_STATUSES = new Set(['payment_expired']);

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
    // IMPORTANTE: role vem do custom claim do token, não do documento
    // Firestore /users/{uid}, esse campo pode ser escrito pelo próprio
    // usuário (regra allow update: if isSelf(uid)), então usá-lo aqui
    // permitiria qualquer comprador se autopromover e cancelar pedidos
    // de qualquer cliente.
    role = (decoded as { role?: string }).role ?? '';
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const ip = getClientIp(req);
  const key = `admin-cancel:${uid}`;
  if (!await rateLimit(key, 20, 60_000) || !await rateLimit(`admin-cancel-ip:${ip}`, 40, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const parsedBody = await validateBody(req, adminCancelSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const reason = (parsedBody.data.reason ?? '').trim() || 'Cancelado pelo lojista';

  const ref = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();

  // Transação: relê o status na hora de escrever. Antes era get() + batch,
  // e um pagamento confirmado pelo webhook no meio fazia o estoque ser
  // tratado como "só reservado" num pedido que já tinha debitado quantity.
  let unpaidCouponCode: string | undefined;
  let uberToCancel: { id: string; sandbox: boolean } | null = null;
  // Dados pro e-mail ao cliente, enviado só depois do commit.
  let cancelled: { userId?: string; items?: unknown; totalCents?: number; wasPaid: boolean } | null = null;
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const order = snap.data()!;
      if (order.status === 'cancelled') throw new Error('ALREADY_CANCELLED');
      if (order.status === 'delivered') throw new Error('DELIVERED');
      // Motoboy sendo chamado agora: espera o despacho terminar pra não
      // cancelar no meio e deixar uma corrida órfã.
      const lockAt = (order.delivery as { dispatchLockAt?: number } | undefined)?.dispatchLockAt ?? 0;
      if (Date.now() - lockAt < 2 * 60_000) throw new Error('DISPATCHING');

      // pending_payment: só reservado, libera a reserva.
      // payment_expired: o webhook já liberou a reserva, não mexe no estoque
      //   (antes caía no ramo "pago" e SOMAVA quantity, inflando o estoque).
      // paid/preparing/shipped: quantity já foi debitado, devolve.
      const mode = PENDING_STATUSES.has(order.status)
        ? 'release'
        : NO_STOCK_STATUSES.has(order.status) ? 'none' : 'restock';

      // Corrida da Uber em andamento: cancela depois do commit. Sem isso o
      // motoboy seguia com o pacote de um pedido já cancelado e o estoque
      // já devolvido.
      const uberId = order.delivery?.uberDirectDeliveryId as string | undefined;
      uberToCancel = order.status === 'shipped' && uberId
        ? { id: uberId, sandbox: !!order.delivery?.uberSandbox }
        : null;

      cancelled = { userId: order.userId as string | undefined, items: order.items, totalCents: order.totalCents as number | undefined, wasPaid: mode === 'restock' };

      // Pedido que nunca foi pago devolve o uso do cupom (fora da transação).
      unpaidCouponCode = mode === 'restock' ? undefined : (order.couponCode as string | undefined);

      const lines = mode === 'none'
        ? []
        : expandStockLines((order.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
      const invRefs = lines.map(l => adminDb.collection('inventory').doc(l.sku));
      const invSnaps = await Promise.all(invRefs.map(r => tx.get(r)));

      tx.update(ref, {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: FieldValue.serverTimestamp(),
        // Pedido pago: fica marcado como estorno pendente até o lojista
        // confirmar no painel que devolveu o dinheiro.
        ...(mode === 'restock' ? { 'payment.refundStatus': 'pending' } : {}),
        timeline: FieldValue.arrayUnion({ status: 'cancelled', at: now, note: reason }),
      });

      for (let i = 0; i < lines.length; i++) {
        if (!invSnaps[i].exists) continue;
        tx.update(invRefs[i], mode === 'release'
          ? { reserved: FieldValue.increment(-lines[i].quantity), updatedAt: FieldValue.serverTimestamp() }
          : {
              quantity: FieldValue.increment(lines[i].quantity),
              history: FieldValue.arrayUnion(orderStockLog(orderId, 'order_cancel', lines[i].quantity, i, now)),
              updatedAt: FieldValue.serverTimestamp(),
            });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    if (message === 'ALREADY_CANCELLED') return NextResponse.json({ error: 'Pedido já está cancelado' }, { status: 400 });
    if (message === 'DISPATCHING') return NextResponse.json({ error: 'O pedido está sendo despachado pela Uber agora. Aguarde alguns segundos e tente de novo.' }, { status: 409 });
    if (message === 'DELIVERED') return NextResponse.json({ error: 'Não é possível cancelar pedido já entregue' }, { status: 400 });
    throw err;
  }

  await releaseCouponUse(unpaidCouponCode);

  // Melhor esforço: o pedido já está cancelado. Se a Uber recusar (motoboy
  // já entregou, corrida já encerrada...), fica registrado na timeline pra
  // o lojista resolver pelo app da Uber.
  let uberCancelFailed = false;
  if (uberToCancel) {
    const { id, sandbox } = uberToCancel;
    try {
      await uberCancelDelivery(id, 'other', reason.slice(0, 200), sandbox);
    } catch (err) {
      uberCancelFailed = true;
      console.error('[admin-cancel] uberCancelDelivery falhou:', err);
      await ref.update({
        timeline: FieldValue.arrayUnion({
          status: 'cancelled',
          at: new Date().toISOString(),
          note: 'Não foi possível cancelar a corrida na Uber automaticamente. Cancele pelo app da Uber.',
        }),
      }).catch(() => {});
    }
  }

  const c = cancelled as { userId?: string; items?: unknown; totalCents?: number; wasPaid: boolean } | null;
  if (c) await notifyOrderCancelled(orderId, c, { refund: c.wasPaid });

  return NextResponse.json({ ok: true, ...(uberCancelFailed ? { uberCancelFailed: true } : {}) });
}
