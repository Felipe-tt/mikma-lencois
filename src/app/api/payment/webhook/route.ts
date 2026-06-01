import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const WEBHOOK_SECRET = process.env.ABACATEPAY_WEBHOOK_SECRET!;

function verifySignature(payload: string, signature: string): boolean {
  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return `sha256=${expected}` === signature;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-abacatepay-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    console.warn('Invalid webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, data } = event as { type: string; data: Record<string, unknown> };

  if (type === 'PIX_PAID') {
    const txId = data.id as string;
    const metadata = data.metadata as { orderId: string; userId: string };

    if (!metadata?.orderId) {
      return NextResponse.json({ error: 'Missing orderId in metadata' }, { status: 400 });
    }

    const orderRef = adminDb.collection('orders').doc(metadata.orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orderSnap.data()!;

    if (order.status !== 'pending_payment') {
      // Already processed — idempotent
      return NextResponse.json({ ok: true });
    }

    const batch = adminDb.batch();

    // Update order status
    batch.update(orderRef, {
      status: 'paid',
      'payment.paidAt': FieldValue.serverTimestamp(),
      'payment.txId': txId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Release inventory reservation → confirm deduction
    for (const item of order.items as Array<{ sku: string; quantity: number }>) {
      const invRef = adminDb.collection('inventory').doc(item.sku);
      batch.update(invRef, {
        reserved: FieldValue.increment(-item.quantity),
        quantity: FieldValue.increment(-item.quantity),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Create notification for seller
    const notifRef = adminDb
      .collection('notifications')
      .doc('seller')
      .collection('items')
      .doc();
    batch.set(notifRef, {
      type: 'new_order',
      orderId: metadata.orderId,
      message: `Novo pedido pago: #${metadata.orderId}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log(`Order ${metadata.orderId} confirmed — PIX paid`);
  }

  return NextResponse.json({ ok: true });
}
