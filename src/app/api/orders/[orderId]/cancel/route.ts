export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { extractBearer, tooManyRequests } from '@/lib/security';
import { expandStockLines } from '@/lib/orderStockLines';

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

  if (!await rateLimit(`cancel:${uid}`, 10, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`cancel:${uid}`));
  }

  const ref = adminDb.collection('orders').doc(orderId);

  // Transação: lê e escreve o status atomicamente. Sem isso, o pagamento
  // confirmado pelo webhook poderia chegar entre o get() e o update()
  // abaixo, o cliente cancelaria um pedido que acabou de ser pago, e
  // reserved seria decrementado duas vezes (uma aqui, outra em
  // confirmOrder no webhook).
  let order: FirebaseFirestore.DocumentData;
  try {
    order = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const data = snap.data()!;
      if (data.userId !== uid) throw new Error('FORBIDDEN');
      if (data.status !== 'pending_payment' && data.status !== 'payment_expired') throw new Error('NOT_CANCELLABLE');

      // Só pending_payment ainda tem reserva (payment_expired já foi liberado
      // pelo webhook). Liberada aqui dentro, junto com o status; antes era
      // um update sem await fora da transação, que podia se perder.
      const lines = data.status === 'pending_payment'
        ? expandStockLines((data.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>)
        : [];
      const invRefs = lines.map(l => adminDb.collection('inventory').doc(l.sku));
      const invSnaps = await Promise.all(invRefs.map(r => tx.get(r)));

      const now = new Date().toISOString();
      tx.update(ref, {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
        timeline: FieldValue.arrayUnion({ status: 'cancelled', at: now, note: 'Cancelado pelo cliente' }),
      });
      for (let i = 0; i < lines.length; i++) {
        if (!invSnaps[i].exists) continue;
        tx.update(invRefs[i], {
          reserved: FieldValue.increment(-lines[i].quantity),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
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

  return NextResponse.json({ ok: true });
}
