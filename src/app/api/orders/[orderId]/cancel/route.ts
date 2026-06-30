export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { extractBearer, tooManyRequests } from '@/lib/security';

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  if (!rateLimit(`cancel:${uid}`, 10, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`cancel:${uid}`));
  }

  const ref = adminDb.collection('orders').doc(orderId);

  // Transação: lê e escreve o status atomicamente. Sem isso, o pagamento
  // confirmado pelo webhook poderia chegar entre o get() e o update()
  // abaixo — o cliente cancelaria um pedido que acabou de ser pago, e
  // reserved seria decrementado duas vezes (uma aqui, outra em
  // confirmOrder no webhook).
  let order: FirebaseFirestore.DocumentData;
  try {
    order = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const data = snap.data()!;
      if (data.userId !== uid) throw new Error('FORBIDDEN');
      if (data.status !== 'pending_payment') throw new Error('NOT_CANCELLABLE');

      const now = new Date().toISOString();
      tx.update(ref, {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
        timeline: FieldValue.arrayUnion({ status: 'cancelled', at: now, note: 'Cancelado pelo cliente' }),
      });
      return data;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    if (message === 'FORBIDDEN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (message === 'NOT_CANCELLABLE') {
      return NextResponse.json({ error: 'Só é possível cancelar pedidos aguardando pagamento' }, { status: 400 });
    }
    throw err;
  }

  // Pedido pendente sempre tem estoque reservado (reservado na criação do PIX/checkout) — liberar agora
  const items = (order.items ?? []) as Array<{ sku: string; quantity: number }>;
  for (const item of items) {
    const invSnap = await adminDb.collection('inventory').where('sku', '==', item.sku).limit(1).get();
    if (!invSnap.empty) {
      adminDb.collection('inventory').doc(invSnap.docs[0].id).update({
        reserved: FieldValue.increment(-item.quantity),
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
