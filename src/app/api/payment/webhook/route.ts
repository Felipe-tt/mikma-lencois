export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const ABACATEPAY_PUBLIC_KEY = process.env.ABACATEPAY_PUBLIC_KEY!;

function verifySignature(payload: string, signature: string): boolean {
  if (!ABACATEPAY_PUBLIC_KEY) return false;
  try {
    const expected = createHmac('sha256', ABACATEPAY_PUBLIC_KEY)
      .update(Buffer.from(payload, 'utf8'))
      .digest('base64');
    const a = Buffer.from(expected);
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

  // Rejeita payloads muito grandes (webhook legítimo não passa de 8KB)
  if (rawBody.length > 8192) {
    return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // AbacatePay v2 envelope: { event, apiVersion, data: { transparent: { id, externalId, ... }, customer, ... } }
  const { event: eventType, data } = parsed as {
    event: string;
    data: { transparent: Record<string, unknown>; customer?: Record<string, unknown> };
  };

  console.log('Webhook received:', eventType);

  // ── Helper: confirm an order as paid ─────────────────────────────────────
  async function confirmOrder(orderId: string, txId: string, note: string) {
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      console.error('Order not found:', orderId);
      return;
    }

    const order = orderSnap.data()!;

    if (order.status !== 'pending_payment') {
      console.log('Order already processed:', orderId, '— status:', order.status);
      return;
    }

    const now = new Date().toISOString();
    const batch = adminDb.batch();

    batch.update(orderRef, {
      status: 'paid',
      'payment.paidAt': FieldValue.serverTimestamp(),
      'payment.txId': txId,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({ status: 'paid', at: now, note }),
    });

    for (const item of order.items as Array<{ sku: string; quantity: number }>) {
      const invRef = adminDb.collection('inventory').doc(item.sku);
      // NOTE: only 'quantity' is decremented here, not 'reserved'.
      // Nothing in this codebase currently increments 'reserved' when
      // an order is created — decrementing it on every paid order with
      // no matching increment anywhere drives it permanently negative,
      // which inflates available stock (available = quantity - reserved)
      // a little more with every single sale. If/when proper stock
      // reservation is added at order-creation time, this should also
      // decrement 'reserved' by item.quantity to match.
      batch.update(invRef, {
        quantity: FieldValue.increment(-item.quantity),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const notifRef = adminDb
      .collection('notifications')
      .doc('seller')
      .collection('items')
      .doc();
    batch.set(notifRef, {
      type: 'new_order',
      orderId,
      message: `Novo pedido pago: #${orderId.slice(-8).toUpperCase()}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log(`Order ${orderId} confirmed — ${note}`);
  }

  if (eventType === 'transparent.completed') {
    const transparent = data.transparent;
    const txId = transparent.id as string;
    const orderId = transparent.externalId as string | undefined;

    if (!orderId) {
      console.error('transparent.completed missing externalId — txId:', txId);
      return NextResponse.json({ ok: true });
    }

    await confirmOrder(orderId, txId, `PIX confirmado · txId: ${txId.slice(-8)}`);
  }

  if (eventType === 'checkout.completed') {
    // Card checkout — data envelope has { checkout: { id, externalId, ... } }
    const checkoutData = (data as Record<string, unknown>).checkout as Record<string, unknown> | undefined;
    const txId = (checkoutData?.id ?? '') as string;
    const orderId = checkoutData?.externalId as string | undefined;

    if (!orderId) {
      console.error('checkout.completed missing externalId — txId:', txId);
      return NextResponse.json({ ok: true });
    }

    await confirmOrder(orderId, txId, `Cartão confirmado · checkoutId: ${txId.slice(-8)}`);
  }

  // Always 200 for other event types (transparent.refunded, subscription.*, etc.)
  return NextResponse.json({ ok: true });
}
