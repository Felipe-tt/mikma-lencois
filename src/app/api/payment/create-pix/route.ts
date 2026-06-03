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

    const { items, address, amountCents, customerName, customerEmail, customerCpf } = await req.json();

    if (!items || !amountCents || !customerName || !customerEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const orderId = `${uid}_${Date.now()}`;
    const orderRef = adminDb.collection('orders').doc(orderId);
    await orderRef.set({
      userId: uid,
      items,
      address,
      status: 'pending_payment',
      totalCents: amountCents,
      payment: { method: 'pix' },
      delivery: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const payload = {
      method: 'PIX',
      data: {
        amount: amountCents,
        description: `Pedido Mikma Lencois #${orderId}`,
        expiresIn: 900,
        externalId: orderId,
        customer: {
          name: customerName,
          email: customerEmail,
          ...(customerCpf ? { taxId: customerCpf } : {}),
        },
        metadata: { orderId, userId: uid },
      },
    };

    console.log('AbacatePay key prefix:', ABACATEPAY_KEY?.slice(0, 12) ?? 'KEY_MISSING');
    console.log('AbacatePay payload:', JSON.stringify(payload));

    const pixRes = await fetch(`${ABACATEPAY_BASE}/transparents/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABACATEPAY_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const pixText = await pixRes.text();
    console.log('AbacatePay response status:', pixRes.status, 'body:', pixText);

    if (!pixRes.ok) {
      return NextResponse.json({ error: 'Payment provider error', detail: pixText }, { status: 502 });
    }

    const pixJson = JSON.parse(pixText);
    const pix = pixJson.data;

    await orderRef.update({
      'payment.txId': pix.id,
      'payment.qrCode': pix.brCodeBase64,
      'payment.copyPaste': pix.brCode,
      'payment.expiresAt': new Date(pix.expiresAt),
      status: 'pending_payment',
      updatedAt: new Date(),
    });

    return NextResponse.json({
      orderId,
      txId: pix.id,
      qrCode: pix.brCodeBase64,
      copyPaste: pix.brCode,
      expiresAt: pix.expiresAt,
    });
  } catch (err) {
    console.error('create-pix error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
