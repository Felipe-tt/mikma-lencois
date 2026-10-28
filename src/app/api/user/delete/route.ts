import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { expandStockLines } from '@/lib/orderStockLines';
import { releaseCouponUse } from '@/lib/orders/couponUsage';

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.split('Bearer ')[1];
  if (!token) return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token, true); // checkRevoked=true
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
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
    // Cancela pedidos não pagos (pendentes e com PIX vencido: este último
    // ficava parado até o cron, sem o cliente que poderia pagar).
    const pendingOrders = await adminDb
      .collection('orders')
      .where('userId', '==', uid)
      .where('status', 'in', ['pending_payment', 'payment_expired'])
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
          if (!data || (data.status !== 'pending_payment' && data.status !== 'payment_expired')) return null;
          // Só pending_payment ainda tem reserva (a do PIX vencido já foi liberada).
          const lines = data.status !== 'pending_payment' ? [] : expandStockLines((data.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
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
    // Link do "Montar junto", se ligado: apontava para a conta apagada.
    const shareToken = (await adminDb.doc(`carts/${uid}`).get()).data()?.share?.token as string | undefined;
    if (shareToken) batch.delete(adminDb.doc(`sharedCarts/${shareToken}`));
    batch.delete(adminDb.doc(`carts/${uid}`));
    batch.delete(adminDb.doc(`wishlists/${uid}`));
    // Tokens de notificação do painel (conta de equipe).
    const pushSnap = await adminDb.collection('pushTokens').where('uid', '==', uid).get();
    for (const d of pushSnap.docs) batch.delete(d.ref);

    const notifSnap = await adminDb.collection(`notifications/${uid}/items`).get();
    for (const d of notifSnap.docs) batch.delete(d.ref);

    // E-mail da conta, lido antes de apagá-la, para limpar os avisos abaixo.
    const accountEmail = (await adminAuth.getUser(uid).catch(() => null))?.email?.toLowerCase();

    await batch.commit();

    // Pedidos de "avise-me quando chegar" pendentes com esse e-mail. Em
    // separado e sem derrubar a exclusão: o essencial já foi apagado acima.
    if (accountEmail) {
      try {
        const reqSnap = await adminDb.collection('restockRequests').where('email', '==', accountEmail).limit(400).get();
        if (!reqSnap.empty) {
          const b2 = adminDb.batch();
          reqSnap.docs.forEach(d => b2.delete(d.ref));
          await b2.commit();
        }
      } catch (err) {
        console.error('[user/delete] falha ao limpar avisos de estoque', err);
      }
    }

    // Revoga tokens antes de deletar, evita uso de token após exclusão
    await adminAuth.revokeRefreshTokens(uid);
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[user/delete]', err);
    return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo.' }, { status: 500 });
  }
}
