export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';
const ABACATEPAY_KEY = process.env.ABACATEPAY_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { orderId, amountCents, customerName, customerEmail, customerCpf } = await req.json();

    if (!orderId || !amountCents || !customerName || !customerEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify order belongs to user
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.userId !== uid) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Create PIX QR Code via AbacatePay
    const pixRes = await fetch(`${ABACATEPAY_BASE}/pixQrCode/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABACATEPAY_KEY}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        description: `Pedido Mikma Lençóis #${orderId}`,
        expiresIn: 900, // 15 minutes
        customer: {
          name: customerName,
          email: customerEmail,
          ...(customerCpf && { taxId: customerCpf }),
        },
        metadata: { orderId, userId: uid },
      }),
    });

    if (!pixRes.ok) {
      const err = await pixRes.text();
      console.error('AbacatePay error:', err);
      return NextResponse.json({ error: 'Payment provider error' }, { status: 502 });
    }

    const pix = await pixRes.json();

    // Save PIX transaction ID to order
    await orderRef.update({
      'payment.txId': pix.id,
      'payment.qrCode': pix.qrCode,
      'payment.copyPaste': pix.brCode,
      'payment.expiresAt': new Date(Date.now() + 900_000),
      status: 'pending_payment',
      updatedAt: new Date(),
    });

    return NextResponse.json({
      txId: pix.id,
      qrCode: pix.qrCode,
      copyPaste: pix.brCode,
      expiresAt: pix.expiresAt,
    });
  } catch (err) {
    console.error('create-pix error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
