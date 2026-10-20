export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { expandStockLines } from '@/lib/orderStockLines';
import { orderCode } from '@/lib/stockHistory';
import { releaseCouponUse } from '@/lib/orders/couponUsage';
import { uberCancelDelivery } from '@/lib/uber-direct';

const PAID_ACTIVE = new Set(['paid', 'preparing', 'shipped']);

type StockEntry = { order?: string; source?: string; type?: 'in' | 'out'; quantity?: number };

/**
 * POST /api/orders/[orderId]/admin-delete
 *
 * Só admin: apaga qualquer pedido, em qualquer status, e o rastro dele:
 * - estoque: tira do histórico as movimentações do pedido e desfaz o efeito
 *   delas (venda paga volta pro estoque; reserva de PIX em aberto é
 *   liberada). Pedido entregue é exceção: as peças saíram da loja de
 *   verdade, então a saída continua no estoque e no histórico;
 * - cupom: devolve o uso, se ainda não foi devolvido;
 * - notificações do painel e trocas/devoluções ligadas ao pedido;
 * - corrida da Uber em andamento é cancelada.
 * Sem e-mail pro cliente. O vendedor continua só podendo apagar cancelado
 * sem pagamento, pelo painel.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  try {
    // checkRevoked: admin rebaixado não apaga com token antigo.
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    if ((decoded as { role?: string }).role !== 'admin') {
      return NextResponse.json({ error: 'Só o administrador pode apagar este pedido.' }, { status: 403 });
    }
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
  }

  if (!await rateLimit(`admin-delete:${uid}`, 30, 60_000) || !await rateLimit(`admin-delete-ip:${getClientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }

  const ref = adminDb.collection('orders').doc(orderId);
  let couponCode: string | undefined;
  let uberToCancel: { id: string; sandbox: boolean } | null = null;

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const order = snap.data()!;
      const lockAt = (order.delivery as { dispatchLockAt?: number } | undefined)?.dispatchLockAt ?? 0;
      if (Date.now() - lockAt < 2 * 60_000) throw new Error('DISPATCHING');

      const delivered = order.status === 'delivered';
      const code = orderCode(orderId);
      const uberId = order.delivery?.uberDirectDeliveryId as string | undefined;
      uberToCancel = order.status === 'shipped' && uberId ? { id: uberId, sandbox: !!order.delivery?.uberSandbox } : null;
      // O uso do cupom já foi devolvido quando um pedido não pago foi
      // cancelado; nos outros casos, devolve agora.
      const couponReleased = order.status === 'cancelled' && !order.payment?.paidAt;
      couponCode = couponReleased ? undefined : (order.couponCode as string | undefined);

      // Quantidade do pedido por SKU (com a fronha trocada, se houver).
      const qtyBySku = new Map<string, number>();
      for (const l of expandStockLines((order.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>)) {
        qtyBySku.set(l.sku, (qtyBySku.get(l.sku) ?? 0) + l.quantity);
      }
      const skus = [...qtyBySku.keys()];
      // Pago e ainda na loja ou a caminho: o estoque foi debitado.
      const debited = PAID_ACTIVE.has(order.status);
      const invRefs = skus.map(sku => adminDb.collection('inventory').doc(sku));
      const invSnaps = await Promise.all(invRefs.map(r => tx.get(r)));

      invSnaps.forEach((inv, i) => {
        if (!inv.exists) return;
        const history = (inv.data()!.history ?? []) as StockEntry[];
        const mine = (e: StockEntry) => e.order === code && (e.source === 'online_sale' || e.source === 'order_cancel');
        const update: Record<string, unknown> = {};
        if (!delivered) {
          // Desfaz o líquido das movimentações do pedido (saída da venda
          // menos a volta do cancelamento) e some com elas do histórico.
          // Pedido de antes do histórico automático não tem movimentação
          // registrada: devolve pelo status.
          const net = history.some(mine)
            ? history.filter(mine).reduce((n, e) => n + (e.type === 'out' ? 1 : -1) * (e.quantity ?? 0), 0)
            : debited ? (qtyBySku.get(skus[i]) ?? 0) : 0;
          if (history.some(mine)) update.history = history.filter(e => !mine(e));
          if (net) update.quantity = FieldValue.increment(net);
        }
        // PIX em aberto: só reservado, libera a reserva.
        if (order.status === 'pending_payment') update.reserved = FieldValue.increment(-(qtyBySku.get(skus[i]) ?? 0));
        if (Object.keys(update).length) tx.update(invRefs[i], { ...update, updatedAt: FieldValue.serverTimestamp() });
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

  // Rastro fora do pedido: notificações do painel e trocas/devoluções.
  await Promise.all([
    adminDb.collection('notifications').doc('seller').collection('items').where('orderId', '==', orderId).get(),
    adminDb.collection('returns').where('orderId', '==', orderId).get(),
  ]).then(async ([notifs, returns]) => {
    const batch = adminDb.batch();
    [...notifs.docs, ...returns.docs].slice(0, 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }).catch(err => console.error('[admin-delete] falha ao limpar notificações/trocas (ignorado):', err));

  // Melhor esforço: o pedido já foi apagado; se a Uber recusar, avisa o admin.
  let uberCancelFailed = false;
  const uber = uberToCancel as { id: string; sandbox: boolean } | null;
  if (uber) {
    try { await uberCancelDelivery(uber.id, 'other', 'Pedido removido pela loja', uber.sandbox); }
    catch (err) { uberCancelFailed = true; console.error('[admin-delete] uberCancelDelivery falhou:', err); }
  }

  return NextResponse.json({ ok: true, ...(uberCancelFailed ? { uberCancelFailed: true } : {}) });
}
