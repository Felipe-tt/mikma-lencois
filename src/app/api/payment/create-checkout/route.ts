export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getSettings } from '@/lib/settings';
import { computeShippingOptions } from '@/lib/shipping-pricing';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { randomBytes } from 'crypto';
import { tooManyRequests } from '@/lib/security';
import { StockError } from '@/lib/errors';
import { notifySeller } from '@/lib/push/notifySeller';

const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';
const ABACATEPAY_KEY = process.env.ABACATEPAY_API_KEY!;

// Tabela de parcelamento: juros a partir de X parcelas
// Ajuste conforme as taxas que você paga à AbacatePay/adquirente
const INSTALLMENT_FEES: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0.0199,
  5: 0.0249,
  6: 0.0299,
  7: 0.0349,
  8: 0.0399,
  9: 0.0449,
  10: 0.0499,
  11: 0.0549,
  12: 0.0599,
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`checkout:ip:${ip}`, 20, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`checkout:ip:${ip}`));
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true);
    const uid = decoded.uid;

    if (!rateLimit(`checkout:uid:${uid}`, 5, 60 * 60 * 1000)) {
      return tooManyRequests(rateLimitRetryAfter(`checkout:uid:${uid}`));
    }

    const { address, installments = 1, shipping } = await req.json();

    // NOTA DE SEGURANÇA: nada do frete é confiado do cliente além de QUAL
    // carrier ele escolheu — preço, label, prazo e quoteId são sempre
    // recalculados via computeShippingOptions() (mesma fonte usada em
    // /api/shipping/quote), e só aceitamos o carrier se ele aparecer na
    // lista recém-computada para esse endereço/carrinho exatos.

    if (!address?.cep) {
      return NextResponse.json({ error: 'Endereço obrigatório' }, { status: 400 });
    }
    if (!shipping || typeof shipping.carrier !== 'string' || !shipping.carrier) {
      return NextResponse.json({ error: 'Forma de envio inválida' }, { status: 400 });
    }

    const parsedInstallments = Math.max(1, Math.min(12, parseInt(installments, 10) || 1));

    if (!ABACATEPAY_KEY) {
      console.error('ABACATEPAY_API_KEY not set');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500 });
    }

    // Mínimo fixo de R$100 para cartão
    const creditMinCents = 10000;

    // ── Load cart from Firestore ──────────────────────────────────────────────
    const cartSnap = await adminDb.collection('carts').doc(uid).get();
    if (!cartSnap.exists || !cartSnap.data()?.items?.length) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    }
    const cartData = cartSnap.data()!;
    const cartItems: Array<{ sku: string; productId: string; quantity: number }> = cartData.items;
    const cartCouponCode: string | null = cartData.couponCode ?? null;

    // ── Load product prices/pesos from Firestore (never trust client) ─────────
    const productIds = Array.from(new Set(cartItems.map(i => i.productId)));
    const productDocs = await Promise.all(
      productIds.map(id => adminDb.collection('products').doc(id).get())
    );
    const productMap: Record<string, { price: number; name: string; weightKg?: number }> = {};
    for (const snap of productDocs) {
      if (snap.exists) {
        productMap[snap.id] = {
          price: snap.data()!.price as number,
          name: snap.data()!.name as string,
          weightKg: snap.data()!.weightKg as number | undefined,
        };
      }
    }

    // ── Build verified items & total ──────────────────────────────────────────
    const verifiedItems = cartItems.map(ci => {
      const prod = productMap[ci.productId];
      if (!prod) throw new Error(`Produto ${ci.productId} não encontrado`);
      return { ...ci, unitPrice: prod.price, productName: prod.name };
    });

    const subtotalCents = verifiedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const productsCents = subtotalCents;

    if (subtotalCents < creditMinCents) {
      return NextResponse.json(
        { error: `Pagamento por cartão disponível a partir de R$ ${(creditMinCents / 100).toFixed(2)}` },
        { status: 422 }
      );
    }

    if (subtotalCents <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    const settings = await getSettings();

    const totalWeightKg = cartItems.reduce(
      (s, ci) => s + (productMap[ci.productId]?.weightKg ?? settings.defaultItemWeightKg ?? 0.8) * ci.quantity,
      0
    );

    // ── Frete — recalculado do zero, nunca confiado do cliente ────────────────
    const shippingResult = await computeShippingOptions(address.cep, settings, productsCents, totalWeightKg);
    const matchedShipping = shippingResult.options.find(o => o.carrier === shipping.carrier);
    if (!matchedShipping) {
      return NextResponse.json(
        { error: 'Opção de frete indisponível para este endereço. Recalcule o frete e tente novamente.' },
        { status: 400 }
      );
    }
    const shippingCents = matchedShipping.priceCents;

    // ── Validar cupom server-side ─────────────────────────────────────────────
    let couponDiscountCents = 0;
    let couponCode: string | null = null;
    if (cartCouponCode) {
      const couponSnap = await adminDb.collection('coupons').doc(cartCouponCode).get();
      if (couponSnap.exists) {
        const c = couponSnap.data()!;
        const now2 = new Date();
        const valid =
          c.active &&
          (!c.expiresAt || new Date(c.expiresAt) > now2) &&
          (!c.maxUses || (c.usedCount ?? 0) < c.maxUses) &&
          (!c.minOrderCents || productsCents >= c.minOrderCents);
        if (valid) {
          couponDiscountCents = c.type === 'percent'
            ? Math.round(productsCents * c.value / 100)
            : c.value;
          couponCode = cartCouponCode;
        }
      }
    }

    // ── Aplica juros de parcelamento (se houver) ──────────────────────────────
    const feeRate = INSTALLMENT_FEES[parsedInstallments] ?? 0;
    const totalCents = Math.max(0, Math.round((productsCents - couponDiscountCents + shippingCents) * (1 + feeRate)));
    const installmentCents = Math.round(totalCents / parsedInstallments);

    // ── Checar e reservar estoque ATOMICAMENTE (evita oversell por concorrência) ──
    // Ver mesmo fix em create-pix/route.ts: check e reserve unidos numa transação
    // do Firestore em vez de dois passos separados (que permitiam duas compras
    // simultâneas "verem" a mesma última unidade livre).
    const inventoryQueries = await Promise.all(
      cartItems.map(ci =>
        adminDb.collection('inventory').where('sku', '==', ci.sku).limit(1).get()
      )
    );
    const invDocRefs = inventoryQueries.map(snap => snap.docs[0]?.ref ?? null);

    try {
      await adminDb.runTransaction(async tx => {
        const invSnaps = await Promise.all(
          invDocRefs.map(ref => (ref ? tx.get(ref) : null))
        );
        for (let i = 0; i < cartItems.length; i++) {
          const snap = invSnaps[i];
          if (!snap) continue;
          const inv = snap.data()!;
          const available = (inv.quantity ?? 0) - (inv.reserved ?? 0);
          if (available < cartItems[i].quantity) {
            const ci = cartItems[i];
            const name = productMap[ci.productId]?.name ?? ci.sku;
            throw new StockError(`"${name}" não tem estoque suficiente. Disponível: ${available}`);
          }
        }
        for (let i = 0; i < cartItems.length; i++) {
          const ref = invDocRefs[i];
          if (!ref) continue;
          tx.update(ref, {
            reserved: FieldValue.increment(cartItems[i].quantity),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (err) {
      if (err instanceof StockError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    // ── Create order ──────────────────────────────────────────────────────────
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
      discountCents: couponDiscountCents,
      couponDiscountCents,
      ...(couponCode ? { couponCode } : {}),
      totalCents,
      payment: {
        method: 'card',
        installments: parsedInstallments,
        installmentCents,
      },
      delivery: {
        carrier: matchedShipping.carrier,
        label: matchedShipping.label,
        priceCents: shippingCents,
        estimatedDays: matchedShipping.estimatedDays,
        uberSandbox: shippingResult.uberSandbox,
        ...(matchedShipping.quoteId ? { uberQuoteId: matchedShipping.quoteId } : {}),
      },
      selectedShipping: {
        carrier: matchedShipping.carrier,
        label: matchedShipping.label,
        priceCents: shippingCents,
        estimatedDays: matchedShipping.estimatedDays,
        ...(matchedShipping.quoteId ? { quoteId: matchedShipping.quoteId } : {}),
      },
      timeline: [
        { status: 'created', at: now, note: 'Pedido criado' },
        { status: 'payment_initiated', at: now, note: `Checkout cartão iniciado (${parsedInstallments}x)` },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Incrementa usedCount do cupom atomicamente (best-effort)
    if (couponCode) {
      adminDb.collection('coupons').doc(couponCode).update({
        usedCount: FieldValue.increment(1),
      }).catch(() => {});
    }

    // Avisa o vendor que alguém iniciou um pagamento (ainda não confirmado).
    // Best-effort: nunca deve bloquear ou falhar o checkout do cliente.
    notifySeller({
      title: 'Pagamento iniciado',
      body: `Pedido de R$ ${(totalCents / 100).toFixed(2)} · Frete: ${matchedShipping.label}`,
      url: `/painel/pedidos/${orderId}`,
      data: { orderId, event: 'payment_initiated' },
    }).catch(() => {});

    // ── Upsert product on AbacatePay (one per order, single-use) ─────────────
    // AbacatePay /checkouts/create precisa de um produto existente.
    // Criamos um produto temporário com externalId = orderId.
    const productRes = await fetch(`${ABACATEPAY_BASE}/products/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABACATEPAY_KEY}`,
      },
      body: JSON.stringify({
        externalId: orderId,
        name: `Pedido #${orderId.slice(-8).toUpperCase()}`,
        description: verifiedItems.map(i => `${i.quantity}x ${i.productName}`).join(', '),
        price: totalCents,
        currency: 'BRL',
      }),
    });

    const productText = await productRes.text();
    console.log('AbacatePay product status:', productRes.status, 'body:', productText);

    if (!productRes.ok) {
      await orderRef.delete();
      for (let i = 0; i < cartItems.length; i++) {
        const ref = invDocRefs[i];
        if (!ref) continue;
        ref.update({
          reserved: FieldValue.increment(-cartItems[i].quantity),
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
      return NextResponse.json({ error: 'Erro ao criar produto no gateway de pagamento' }, { status: 502 });
    }

    const abacateProduct = JSON.parse(productText).data;

    // ── Load user profile ─────────────────────────────────────────────────────
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.data() ?? {};

    // ── Upsert customer on AbacatePay ─────────────────────────────────────────
    let customerId: string | undefined;
    if (userData.email && userData.cpf) {
      try {
        const custRes = await fetch(`${ABACATEPAY_BASE}/customers/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ABACATEPAY_KEY}`,
          },
          body: JSON.stringify({
            email: userData.email,
            taxId: userData.cpf,
            name: userData.displayName ?? userData.name ?? '',
            cellphone: userData.phone ?? '',
          }),
        });
        if (custRes.ok) {
          const custData = (await custRes.json()).data;
          customerId = custData?.id;
        }
      } catch {
        // customer optional — continue without it
      }
    }

    // ── Create AbacatePay checkout (hosted page) ──────────────────────────────
    const origin = req.headers.get('origin') ?? 'https://mikma.com.br';
    const checkoutPayload: Record<string, unknown> = {
      items: [{ id: abacateProduct.id, quantity: 1 }],
      methods: ['CARD'],
      externalId: orderId,
      returnUrl: `${origin}/pedidos/${orderId}`,
      completionUrl: `${origin}/pedidos/${orderId}?pago=1`,
      metadata: { installments: parsedInstallments },
      ...(customerId ? { customerId } : {}),
    };

    const checkRes = await fetch(`${ABACATEPAY_BASE}/checkouts/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABACATEPAY_KEY}`,
      },
      body: JSON.stringify(checkoutPayload),
    });

    const checkText = await checkRes.text();
    console.log('AbacatePay checkout status:', checkRes.status, 'body:', checkText);

    if (!checkRes.ok) {
      await orderRef.delete();
      // Liberar reserva de estoque
      for (let i = 0; i < cartItems.length; i++) {
        const ref = invDocRefs[i];
        if (!ref) continue;
        ref.update({
          reserved: FieldValue.increment(-cartItems[i].quantity),
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
      // Clean up temp product (best-effort)
      fetch(`${ABACATEPAY_BASE}/products/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ABACATEPAY_KEY}` },
        body: JSON.stringify({ id: abacateProduct.id }),
      }).catch(() => {});
      return NextResponse.json({ error: 'Erro no provedor de pagamento' }, { status: 502 });
    }

    const checkout = JSON.parse(checkText).data;

    await orderRef.update({
      'payment.checkoutId': checkout.id,
      'payment.checkoutUrl': checkout.url,
      'payment.abacateProductId': abacateProduct.id,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      orderId,
      checkoutUrl: checkout.url,
      totalCents,
      installments: parsedInstallments,
      installmentCents,
    });
  } catch (err) {
    console.error('create-checkout error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
