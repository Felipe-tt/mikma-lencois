export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const WEBHOOK_SECRET = process.env.ABACATEPAY_WEBHOOK_SECRET!;

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  try {
    const expected = createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
    // timingSafeEqual prevents timing attacks
    const a = Buffer.from(`sha256=${expected}`);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-abacatepay-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    console.warn('Invalid webhook signature — received:', signature.slice(0, 20));
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Doc: event type is "transparent.completed" (not "PIX_PAID")
  // Envelope: { type: "transparent.completed", data: { id, metadata, ... } }
  const { type, data } = event as {
    type: string;
    data: Record<string, unknown>;
  };

  console.log('Webhook received:', type);

  if (type === 'transparent.completed') {
    const txId = data.id as string;
    // metadata was stored in data.metadata when creating the transparent
    const metadata = data.metadata as { orderId?: string; userId?: string } | undefined;

    if (!metadata?.orderId) {
      console.error('transparent.completed missing metadata.orderId — txId:', txId);
      // Still return 200 so AbacatePay doesn't keep retrying
      return NextResponse.json({ ok: true });
    }

    const orderRef = adminDb.collection('orders').doc(metadata.orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      console.error('Order not found:', metadata.orderId);
      return NextResponse.json({ ok: true });
    }

    const order = orderSnap.data()!;

    // Idempotent — skip if already processed
    if (order.status !== 'pending_payment') {
      console.log('Order already processed:', metadata.orderId, '— status:', order.status);
      return NextResponse.json({ ok: true });
    }

    const batch = adminDb.batch();

    // 1. Mark order as paid
    batch.update(orderRef, {
      status: 'paid',
      'payment.paidAt': FieldValue.serverTimestamp(),
      'payment.txId': txId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 2. Confirm inventory deduction (reserved → sold)
    for (const item of order.items as Array<{ sku: string; quantity: number }>) {
      const invRef = adminDb.collection('inventory').doc(item.sku);
      batch.update(invRef, {
        reserved: FieldValue.increment(-item.quantity),
        quantity: FieldValue.increment(-item.quantity),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // 3. Seller notification
    const notifRef = adminDb
      .collection('notifications')
      .doc('seller')
      .collection('items')
      .doc();
    batch.set(notifRef, {
      type: 'new_order',
      orderId: metadata.orderId,
      message: `Novo pedido pago: #${metadata.orderId.slice(-8).toUpperCase()}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log(`Order ${metadata.orderId} confirmed — transparent.completed`);
  }

  // Always 200 for other event types (transparent.refunded, etc.)
  return NextResponse.json({ ok: true });
}
