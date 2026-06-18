export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { randomBytes } from 'crypto';
import { tooManyRequests } from '@/lib/security';

const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';
const ABACATEPAY_KEY = process.env.ABACATEPAY_API_KEY!;

export async function POST(req: NextRequest) {
  // Rate limit duplo: por IP e por usuário (aplicado após auth)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`pix:ip:${ip}`, 20, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`pix:ip:${ip}`));
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true); // checkRevoked
    const uid = decoded.uid;

    // Rate limit por usuário (mais restrito — 5 PIX por hora)
    if (!rateLimit(`pix:uid:${uid}`, 5, 60 * 60 * 1000)) {
      return tooManyRequests(rateLimitRetryAfter(`pix:uid:${uid}`));
    }

    const { address, shipping } = await req.json();
    // NOTE: product prices are NOT trusted from client — calculated server-side from Firestore prices
    // Shipping cost comes from client but carrier is validated against allowed list

    if (!address) {
      return NextResponse.json({ error: 'Endereço obrigatório' }, { status: 400 });
    }

    // Validate shipping carrier
    const VALID_CARRIERS = ['uber_direct', 'disk_tenha', 'correios_pac', 'correios_sedex', 'melhor_envio_1', 'melhor_envio_2'];
    if (!shipping || typeof shipping.carrier !== 'string' || !VALID_CARRIERS.includes(shipping.carrier)) {
      return NextResponse.json({ error: 'Opção de frete inválida' }, { status: 400 });
    }
    const shippingCents: number = typeof shipping.priceCents === 'number' && shipping.priceCents >= 0
      ? Math.round(shipping.priceCents)
      : 0;

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

    // ── Check inventory before creating order ────────────────────────────────
    const inventoryChecks = await Promise.all(
      cartItems.map(ci =>
        adminDb.collection('inventory').where('sku', '==', ci.sku).limit(1).get()
      )
    );
    for (let i = 0; i < cartItems.length; i++) {
      const inv = inventoryChecks[i].docs[0]?.data();
      if (!inv) continue; // item sem controle de estoque passa
      const available = (inv.quantity ?? 0) - (inv.reserved ?? 0);
      if (available < cartItems[i].quantity) {
        const name = cartItems[i].sku;
        return NextResponse.json(
          { error: `"${name}" não tem estoque suficiente. Disponível: ${available}` },
          { status: 409 }
        );
      }
    }

    // ── Build verified order items ────────────────────────────────────────────
    const verifiedItems = cartItems.map(ci => {
      const price = priceMap[ci.productId];
      if (!price) throw new Error(`Produto ${ci.productId} não encontrado`);
      return { ...ci, unitPrice: price };
    });

    const productsCents = verifiedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const amountCents = productsCents + shippingCents;

    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    // ── Create order ─────────────────────────────────────────────────────────
    const orderId = `ord_${randomBytes(8).toString('hex')}`;
    const orderRef = adminDb.collection('orders').doc(orderId);
    const now = new Date().toISOString();
    await orderRef.set({
      userId: uid,
      items: verifiedItems,
      address,
      status: 'pending_payment',
      productsCents,
      shippingCents,
      totalCents: amountCents,
      payment: { method: 'pix' },
      delivery: {
        carrier: shipping.carrier,
        label: shipping.label ?? '',
        priceCents: shippingCents,
        estimatedDays: shipping.estimatedDays ?? null,
      },
      timeline: [
        { status: 'created', at: now, note: 'Pedido criado' },
        { status: 'payment_initiated', at: now, note: 'PIX gerado' },
      ],
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
      data: {
        amount: amountCents,
        description: `Pedido #${orderId.slice(-8).toUpperCase()} · frete ${shipping.carrier}`,
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
