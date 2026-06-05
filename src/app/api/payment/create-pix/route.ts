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

    const { items, address, amountCents } = await req.json();

    if (!items?.length || !amountCents) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!ABACATEPAY_KEY) {
      console.error('ABACATEPAY_API_KEY not set');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500 });
    }

    // Create order first via Admin SDK (bypasses Firestore client rules)
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

    // AbacatePay v2 — POST /transparents/create
    // Campos suportados em data: amount (obrigatório), description, expiresIn, customer, metadata
    // NÃO há campo "method" no root — só transparents já implica PIX
    const pixPayload = {
      data: {
        amount: amountCents,
        description: `Pedido #${orderId.slice(-8).toUpperCase()}`,
        expiresIn: 900, // 15 minutos
        metadata: { orderId, userId: uid },
      },
    };

    console.log('AbacatePay payload:', JSON.stringify(pixPayload));

    const pixRes = await fetch(`${ABACATEPAY_BASE}/transparents/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABACATEPAY_KEY}`,
      },
      body: JSON.stringify(pixPayload),
    });

    const pixText = await pixRes.text();
    console.log('AbacatePay status:', pixRes.status, 'body:', pixText);

    if (!pixRes.ok) {
      await orderRef.delete(); // cleanup orphan order
      return NextResponse.json({ error: 'Payment provider error', detail: pixText }, { status: 502 });
    }

    // Response envelope: { data: { id, brCode, brCodeBase64, expiresAt, ... }, success: true }
    const pixJson = JSON.parse(pixText);
    const pix = pixJson.data;

    await orderRef.update({
      'payment.txId': pix.id,
      'payment.pixQrCode': pix.brCodeBase64,   // imagem PNG base64
      'payment.pixCopyPaste': pix.brCode,        // copia-e-cola
      'payment.expiresAt': pix.expiresAt ? new Date(pix.expiresAt) : null,
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
