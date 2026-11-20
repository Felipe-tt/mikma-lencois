import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { expandStockLines } from '@/lib/orderStockLines';
import { orderStockLog } from '@/lib/stockHistory';

/**
 * POST /api/painel/pedidos/[orderId]/repor-estoque (equipe): o pedido foi
 * cancelado com o pacote já com a transportadora e o pacote voltou para a
 * loja. Devolve as peças ao estoque uma vez só (a transação confere e limpa
 * `restockPending`, então clique duplo não soma em dobro).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  let uid: string;
  let who: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = effectiveRole(decoded);
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    uid = decoded.uid;
    who = decoded.email ?? decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (!await rateLimit(`repor-estoque:${uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });

  const ref = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();
  try {
    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const order = snap.data()!;
      if (order.status !== 'cancelled' || order.restockPending !== true) throw new Error('NOTHING_PENDING');
      const lines = expandStockLines((order.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
      const invRefs = lines.map(l => adminDb.collection('inventory').doc(l.sku));
      const invSnaps = invRefs.length ? await tx.getAll(...invRefs) : [];
      tx.update(ref, {
        restockPending: false,
        restockedAt: now,
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({ status: 'cancelled', at: now, note: `Pacote de volta na loja: peças devolvidas ao estoque por ${who}.` }),
      });
      lines.forEach((line, i) => {
        if (!invSnaps[i].exists) return;
        tx.update(invRefs[i], {
          quantity: FieldValue.increment(line.quantity),
          history: FieldValue.arrayUnion(orderStockLog(orderId, 'order_cancel', line.quantity, i, now)),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    if (message === 'NOTHING_PENDING') return NextResponse.json({ error: 'As peças deste pedido já voltaram ao estoque.' }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
