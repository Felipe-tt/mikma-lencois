export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
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
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const order = snap.data()!;
  if (order.userId !== uid) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  if (order.status !== 'pending_payment') {
    return NextResponse.json({ error: 'Só é possível cancelar pedidos aguardando pagamento' }, { status: 400 });
  }

  await ref.update({ status: 'cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
