export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { expandStockLines } from '@/lib/orderStockLines';
import { orderStockLog } from '@/lib/stockHistory';
import { releaseCouponUse } from '@/lib/orders/couponUsage';
import { uberCancelDelivery } from '@/lib/uber-direct';

// Mesma regra de estoque e cupom do admin-cancel.
const PENDING_STATUSES = new Set(['pending_payment']);
const NO_STOCK_STATUSES = new Set(['payment_expired', 'cancelled', 'delivered']);
const UNPAID_OPEN_STATUSES = new Set(['pending_payment', 'payment_expired']);

/**
 * POST /api/orders/[orderId]/admin-delete
 *
 * Só admin: apaga qualquer pedido, em qualquer status. Pedido ainda ativo é
 * desfeito antes (devolve estoque ou reserva, cupom e corrida da Uber), sem
 * e-mail pro cliente. Fica um registro mínimo em deletedOrders (quem, quando,
 * status e total). O vendedor continua só podendo apagar cancelado sem
 * pagamento, pelo painel.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  let email: string | undefined;
  try {
    // checkRevoked: admin rebaixado não apaga com token antigo.
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    if ((decoded as { role?: string }).role !== 'admin') {
      return NextResponse.json({ error: 'Só o administrador pode apagar este pedido.' }, { status: 403 });
    }
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
  }

  if (!await rateLimit(`admin-delete:${uid}`, 30, 60_000) || !await rateLimit(`admin-delete-ip:${getClientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }

  const ref = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();
  let couponCode: string | undefined;
  let uberToCancel: { id: string; sandbox: boolean } | null = null;

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const order = snap.data()!;
      const lockAt = (order.delivery as { dispatchLockAt?: number } | undefined)?.dispatchLockAt ?? 0;
      if (Date.now() - lockAt < 2 * 60_000) throw new Error('DISPATCHING');

      // pending_payment: libera a reserva. paid/preparing/shipped: devolve o
      // que foi debitado. Cancelado, entregue ou PIX expirado: não mexe.
      const mode = PENDING_STATUSES.has(order.status)
        ? 'release'
        : NO_STOCK_STATUSES.has(order.status) ? 'none' : 'restock';

      const uberId = order.delivery?.uberDirectDeliveryId as string | undefined;
      uberToCancel = order.status === 'shipped' && uberId ? { id: uberId, sandbox: !!order.delivery?.uberSandbox } : null;
      // Pedido aberto que nunca foi pago devolve o uso do cupom (no
      // cancelamento isso já foi feito).
      couponCode = UNPAID_OPEN_STATUSES.has(order.status) ? (order.couponCode as string | undefined) : undefined;

      const lines = mode === 'none'
        ? []
        : expandStockLines((order.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
      const invRefs = lines.map(l => adminDb.collection('inventory').doc(l.sku));
      const invSnaps = await Promise.all(invRefs.map(r => tx.get(r)));

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

      tx.set(adminDb.collection('deletedOrders').doc(orderId), {
        orderId,
        deletedAt: now,
        deletedBy: uid,
        deletedByEmail: email ?? null,
        status: order.status ?? null,
        totalCents: order.totalCents ?? null,
        paidAt: order.payment?.paidAt ?? null,
        customerEmail: order.customerEmail ?? null,
        stock: mode,
      });
      tx.delete(ref);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    if (message === 'DISPATCHING') return NextResponse.json({ error: 'O pedido está sendo despachado pela Uber agora. Aguarde alguns segundos e tente de novo.' }, { status: 409 });
    console.error('[admin-delete]', err);
    return NextResponse.json({ error: 'Não foi possível apagar o pedido. Tente de novo.' }, { status: 500 });
  }

  await releaseCouponUse(couponCode);

  // Melhor esforço: o pedido já foi apagado; se a Uber recusar, avisa o admin.
  let uberCancelFailed = false;
  const uber = uberToCancel as { id: string; sandbox: boolean } | null;
  if (uber) {
    try { await uberCancelDelivery(uber.id, 'other', 'Pedido removido pela loja', uber.sandbox); }
    catch (err) { uberCancelFailed = true; console.error('[admin-delete] uberCancelDelivery falhou:', err); }
  }

  return NextResponse.json({ ok: true, ...(uberCancelFailed ? { uberCancelFailed: true } : {}) });
}
