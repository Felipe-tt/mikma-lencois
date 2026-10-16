export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { expandStockLines } from '@/lib/orderStockLines';
import { releaseCouponUse } from '@/lib/orders/couponUsage';

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.split('Bearer ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token, true); // checkRevoked=true
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Rate limit: 3 tentativas por usuário por hora (evita loop de delete/recriação)
  const key = `delete:${uid}`;
  if (!await rateLimit(key, 3, 60 * 60 * 1000)) {
    const retryAfter = Math.ceil(rateLimitRetryAfter(key) / 1000);
    return NextResponse.json(
      { error: 'Muitas tentativas.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    // Cancela pedidos pendentes
    const pendingOrders = await adminDb
      .collection('orders')
      .where('userId', '==', uid)
      .where('status', '==', 'pending_payment')
      .get();

    // Cada pedido pendente é cancelado na própria transação, relendo o
    // status, igual a /api/orders/[id]/cancel. Antes era um batch sem
    // checar: se o webhook confirmasse o pagamento no meio, o pedido pago
    // virava cancelado e a reserva era descontada duas vezes.
    for (const orderDoc of pendingOrders.docs) {
      try {
        const cancelled = await adminDb.runTransaction(async tx => {
          const snap = await tx.get(orderDoc.ref);
          const data = snap.data();
          if (!data || data.status !== 'pending_payment') return null;
          const lines = expandStockLines((data.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
          const invRefs = lines.map(l => adminDb.collection('inventory').doc(l.sku));
          const invSnaps = await Promise.all(invRefs.map(r => tx.get(r)));
          const now = new Date().toISOString();
          tx.update(orderDoc.ref, {
            status: 'cancelled',
            cancelledAt: now,
            updatedAt: FieldValue.serverTimestamp(),
            timeline: FieldValue.arrayUnion({ status: 'cancelled', at: now, note: 'Conta excluída pelo cliente' }),
          });
          lines.forEach((line, i) => {
            if (!invSnaps[i].exists) return;
            tx.update(invRefs[i], {
              reserved: FieldValue.increment(-line.quantity),
              updatedAt: FieldValue.serverTimestamp(),
            });
          });
          return data;
        });
        if (cancelled) await releaseCouponUse(cancelled.couponCode as string | undefined);
      } catch (err) {
        console.error('[user/delete] falha ao cancelar pedido', orderDoc.id, err);
      }
    }

    const batch = adminDb.batch();
    batch.delete(adminDb.doc(`users/${uid}`));
    batch.delete(adminDb.doc(`carts/${uid}`));

    const notifSnap = await adminDb.collection(`notifications/${uid}/items`).get();
    for (const d of notifSnap.docs) batch.delete(d.ref);

    await batch.commit();

    // Revoga tokens antes de deletar, evita uso de token após exclusão
    await adminAuth.revokeRefreshTokens(uid);
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[user/delete]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
