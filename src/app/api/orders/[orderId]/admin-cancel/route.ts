export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';

// Statuses que ainda não tiveram o estoque debitado (só reservado)
const PENDING_STATUSES = new Set(['pending_payment']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    // IMPORTANTE: role vem do custom claim do token, não do documento
    // Firestore /users/{uid} — esse campo pode ser escrito pelo próprio
    // usuário (regra allow update: if isSelf(uid)), então usá-lo aqui
    // permitiria qualquer comprador se autopromover e cancelar pedidos
    // de qualquer cliente.
    role = (decoded as { role?: string }).role ?? '';
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason = (body.reason ?? '').trim() || 'Cancelado pelo lojista';

  const ref = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

  const order = snap.data()!;

  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'Pedido já está cancelado' }, { status: 400 });
  }

  if (order.status === 'delivered') {
    return NextResponse.json({ error: 'Não é possível cancelar pedido já entregue' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const batch = adminDb.batch();

  batch.update(ref, {
    status: 'cancelled',
    cancelledAt: now,
    updatedAt: FieldValue.serverTimestamp(),
    timeline: FieldValue.arrayUnion({ status: 'cancelled', at: now, note: reason }),
  });

  const isPending = PENDING_STATUSES.has(order.status);
  const items = (order.items ?? []) as Array<{ sku: string; quantity: number }>;

  for (const item of items) {
    const invQuery = await adminDb
      .collection('inventory')
      .where('sku', '==', item.sku)
      .limit(1)
      .get();

    if (!invQuery.empty) {
      const invRef = invQuery.docs[0].ref;

      if (isPending) {
        // Ainda não debitou quantity — só libera a reserva
        batch.update(invRef, {
          reserved: FieldValue.increment(-item.quantity),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Já debitou quantity (paid, preparing, shipped) — devolve e libera reserved
        // reserved foi decrementado no confirmOrder junto com quantity, então
        // ao reverter precisamos só devolver quantity (reserved já está 0 pra esse item)
        batch.update(invRef, {
          quantity: FieldValue.increment(item.quantity),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }

  await batch.commit();

  return NextResponse.json({ ok: true });
}
