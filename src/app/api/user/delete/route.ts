export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { expandStockLines } from '@/lib/orderStockLines';

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

    const batch = adminDb.batch();

    for (const orderDoc of pendingOrders.docs) {
      batch.update(orderDoc.ref, {
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    batch.delete(adminDb.doc(`users/${uid}`));
    batch.delete(adminDb.doc(`carts/${uid}`));

    const notifSnap = await adminDb.collection(`notifications/${uid}/items`).get();
    for (const d of notifSnap.docs) batch.delete(d.ref);

    await batch.commit();

    // Libera o estoque reservado dos pedidos que acabaram de virar
    // 'cancelled' — IMPORTANTE fazer isso, senão fica preso pra sempre:
    // o cron de expiração só olha pedidos 'pending_payment', e esse
    // pedido já não é mais isso a partir daqui. expandStockLines inclui
    // a fronha trocada (Jogo de Cama) na liberação também.
    for (const orderDoc of pendingOrders.docs) {
      const items = (orderDoc.data().items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>;
      for (const line of expandStockLines(items)) {
        const invSnap = await adminDb.collection('inventory').where('sku', '==', line.sku).limit(1).get();
        if (!invSnap.empty) {
          adminDb.collection('inventory').doc(invSnap.docs[0].id).update({
            reserved: FieldValue.increment(-line.quantity),
            updatedAt: FieldValue.serverTimestamp(),
          }).catch(() => {});
        }
      }
    }

    // Revoga tokens antes de deletar, evita uso de token após exclusão
    await adminAuth.revokeRefreshTokens(uid);
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[user/delete]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
