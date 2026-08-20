export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { computeFraudSignals } from '@/lib/fraudSignals';
import type { Order } from '@/types';

// Sinaliza padrões leves de fraude cruzando o pedido com outros pedidos
// que compartilham endereço de entrega ou IP de quem comprou. Não bloqueia
// nada sozinho, só dá contexto extra pro vendedor decidir antes de
// despachar (ver src/lib/fraudSignals.ts pros critérios).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    role = (decoded as { role?: string }).role ?? '';
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const snap = await adminDb.collection('orders').doc(orderId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const order = { id: snap.id, ...snap.data() } as Order;

  const candidateSnaps = await Promise.all([
    order.addressKey
      ? adminDb.collection('orders').where('addressKey', '==', order.addressKey).limit(20).get()
      : null,
    order.clientIp
      ? adminDb.collection('orders').where('clientIp', '==', order.clientIp).limit(20).get()
      : null,
  ]);

  const seen = new Map<string, Order>();
  for (const qs of candidateSnaps) {
    if (!qs) continue;
    for (const doc of qs.docs) {
      seen.set(doc.id, { id: doc.id, ...doc.data() } as Order);
    }
  }

  const signals = computeFraudSignals(order, Array.from(seen.values()));

  return NextResponse.json({ signals });
}
