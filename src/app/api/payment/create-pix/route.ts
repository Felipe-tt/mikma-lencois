export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { randomBytes } from 'crypto';
import { tooManyRequests } from '@/lib/security';

const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';
const ABACATEPAY_KEY = process.env.ABACATEPAY_API_KEY!;

export async function POST(req: NextRequest) {
  // Rate limit: 10 PIX requests per user per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`pix:${ip}`, 10, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`pix:${ip}`));
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true); // checkRevoked
    const uid = decoded.uid;

    const { items, address } = await req.json();
    // NOTE: amountCents is NOT trusted from client — calculated server-side from Firestore prices

    if (!address) {
      return NextResponse.json({ error: 'Endereço obrigatório' }, { status: 400 });
    }

    if (!ABACATEPAY_KEY) {
      console.error('ABACATEPAY_API_KEY not set');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500 });
    }

    // ── Load cart from Firestore (server-side, trusted) ──────────────────────
    const cartSnap = await adminDb.collection('carts').doc(uid).get();
    if (!cartSnap.exists || !cartSnap.data()?.items?.length) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    }
    const cartItems: Array<{ sku: string; productId: string; quantity: number }> =
      cartSnap.data()!.items;

    // ── Load product prices from Firestore (never trust client prices) ───────
    const productIds = Array.from(new Set(cartItems.map(i => i.productId)));
    const productDocs = await Promise.all(
      productIds.map(id => adminDb.collection('products').doc(id).get())
    );
    const priceMap: Record<string, number> = {};
    for (const snap of productDocs) {
      if (snap.exists) priceMap[snap.id] = snap.data()!.price as number;
    }

    // ── Build verified order items ────────────────────────────────────────────
    const verifiedItems = cartItems.map(ci => {
      const price = priceMap[ci.productId];
      if (!price) throw new Error(`Produto ${ci.productId} não encontrado`);
      return { ...ci, unitPrice: price };
    });

    const amountCents = verifiedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    // ── Create order ─────────────────────────────────────────────────────────
    const orderId = `ord_${randomBytes(8).toString('hex')}`; // não expõe uid nem timestamp
    const orderRef = adminDb.collection('orders').doc(orderId);
    await orderRef.set({
      userId: uid,
      items: verifiedItems,
      address,
      status: 'pending_payment',
      totalCents: amountCents,
      payment: { method: 'pix' },
      delivery: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // ── Load user profile for customer data ──────────────────────────────────
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.data() ?? {};

    // ── AbacatePay v2 — POST /transparents/create ─────────────────────────────
    // Only include customer if we have at least email; metadata must be omitted
    // if not needed (API rejects unknown object shapes with 422)
    // For PIX, customer requires ALL fields (name, email, taxId, cellphone)
    // Only include customer if we have everything; otherwise omit entirely
    const hasAllCustomerFields = userData.email && userData.cpf && userData.phone &&
      (userData.displayName ?? userData.name);
    const customerData = hasAllCustomerFields ? {
      name: userData.displayName ?? userData.name,
      email: userData.email,
      taxId: userData.cpf,
      cellphone: userData.phone,
    } : undefined;

    const pixPayload: Record<string, unknown> = {
      method: 'PIX',
      data: {
        amount: amountCents,
        description: `Pedido #${orderId.slice(-8).toUpperCase()}`,
        expiresIn: 900,
        externalId: orderId,
        ...(customerData ? { customer: customerData } : {}),
      },
    };

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
      await orderRef.delete();
      return NextResponse.json({ error: 'Payment provider error', detail: pixText }, { status: 502 });
    }

    const pix = JSON.parse(pixText).data;

    await orderRef.update({
      'payment.txId': pix.id,
      'payment.pixQrCode': pix.brCodeBase64,
      'payment.pixCopyPaste': pix.brCode,
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
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
