export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getSettings } from '@/lib/settings';
import { computeShippingOptions } from '@/lib/shipping-pricing';
import { getShippingLedgerBalanceCents } from '@/lib/shipping-ledger';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { randomBytes } from 'crypto';
import { tooManyRequests, addressSchema, validateBody, getClientIp, isValidCartQuantity } from '@/lib/security';
import { normalizeAddressKey } from '@/lib/fraudSignals';
import { expandStockLines } from '@/lib/orderStockLines';
import { StockError } from '@/lib/errors';
import { notifySeller } from '@/lib/push/notifySeller';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { summarizeOrderItems } from '@/lib/push/summarizeOrderItems';
import { computeProductsCents, validateCoupon, computeCardTotalCents } from '@/lib/orderPricing';
import { z } from 'zod';
import type { Coupon } from '@/types';
import { createCheckoutSchema } from './schema';
import { sanitizeSwaps, type ProductLookup } from '@/lib/fronhaSwap';


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
  const ip = getClientIp(req);
  if (!await rateLimit(`checkout:ip:${ip}`, 20, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`checkout:ip:${ip}`));
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true);
    const uid = decoded.uid;

    if (!await rateLimit(`checkout:uid:${uid}`, 5, 60 * 60 * 1000)) {
      return tooManyRequests(rateLimitRetryAfter(`checkout:uid:${uid}`));
    }

    const parsedBody = await validateBody(req, createCheckoutSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { address, installments, shipping } = parsedBody.data;

    // NOTA DE SEGURANÇA: nada do frete é confiado do cliente além de QUAL
    // carrier ele escolheu, preço, label, prazo e quoteId são sempre
    // recalculados via computeShippingOptions() (mesma fonte usada em
    // /api/shipping/quote), e só aceitamos o carrier se ele aparecer na
    // lista recém-computada para esse endereço/carrinho exatos.

    const parsedInstallments = installments;

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
    const cartItems: Array<{ sku: string; productId: string; quantity: number; note?: string; swapSku?: string; swapQtyPerUnit?: number }> = cartData.items;
    const cartCouponCode: string | null = cartData.couponCode ?? null;

    // Carrinho é escrito direto pelo client SDK, quantity é dado não
    // confiável — quantidade negativa passaria ilesa pela checagem de
    // estoque e ainda diminuiria o total pago (ver isValidCartQuantity).
    if (cartItems.length === 0 || !cartItems.every(ci => isValidCartQuantity(ci.quantity))) {
      return NextResponse.json({ error: 'Carrinho inválido' }, { status: 400 });
    }

    // ── Load product prices/pesos from Firestore (never trust client) ─────────
    // Inclui também os produtos referenciados só via swapSku (troca de
    // fronha em Jogo de Cama) — precisa deles pra validar o swap abaixo.
    const swapProductIds = cartItems
      .map(i => i.swapSku?.split('_')[0])
      .filter((id): id is string => !!id);
    const productIds = Array.from(new Set([...cartItems.map(i => i.productId), ...swapProductIds]));
    const productDocs = await Promise.all(
      productIds.map(id => adminDb.collection('products').doc(id).get())
    );
    const productMap: Record<string, { price: number; name: string; weightKg?: number; active: boolean; category: string }> = {};
    for (const snap of productDocs) {
      if (snap.exists) {
        productMap[snap.id] = {
          price: snap.data()!.price as number,
          name: snap.data()!.name as string,
          weightKg: snap.data()!.weightKg as number | undefined,
          active: snap.data()!.active as boolean,
          category: snap.data()!.category as string,
        };
      }
    }

    // ── Nunca confia no swapSku/swapQtyPerUnit/note vindo do carrinho
    // (escrito direto pelo client SDK, sem passar por API) ─────────────────
    const productLookup = new Map<string, ProductLookup>(
      Object.entries(productMap).map(([id, p]) => [id, { id, name: p.name, active: p.active, category: p.category }])
    );
    const sanitizedCartItems = sanitizeSwaps(cartItems, productLookup);

    // ── Build verified items & total ──────────────────────────────────────────
    // note já vem confiável de sanitizeSwaps (gerada pelo servidor a
    // partir do produto validado, ou removida) — não precisa mais
    // sanitizar aqui, só repassar.
    let verifiedItems: Array<{ sku: string; productId: string; quantity: number; note?: string; swapSku?: string; swapQtyPerUnit?: number; unitPrice: number; productName: string }>;
    try {
      verifiedItems = sanitizedCartItems.map(ci => {
        const prod = productMap[ci.productId];
        if (!prod) throw new Error(`Produto ${ci.productId} não encontrado`);
        // Produto pode ter sido desativado depois de já estar no carrinho de
        // alguém (removido do catálogo pelo vendedor) — sem essa checagem,
        // dava pra comprar um produto que não deveria mais estar à venda.
        if (!prod.active) {
          throw new StockError(`"${prod.name}" não está mais disponível. Remova do carrinho e tente novamente.`);
        }
        return { ...ci, unitPrice: prod.price, productName: prod.name };
      });
    } catch (err) {
      if (err instanceof StockError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    const subtotalCents = computeProductsCents(verifiedItems.map(i => ({ unitPrice: i.unitPrice, quantity: i.quantity })));
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

    // ── Frete, recalculado do zero, nunca confiado do cliente ────────────────
    const ledgerBalanceCents = await getShippingLedgerBalanceCents();
    const shippingResult = await computeShippingOptions(address.cep, settings, productsCents, totalWeightKg, ledgerBalanceCents);
    const matchedShipping = shippingResult.options.find(o => o.carrier === shipping.carrier);
    if (!matchedShipping) {
      return NextResponse.json(
        { error: 'Opção de frete indisponível para este endereço. Recalcule o frete e tente novamente.' },
        { status: 400 }
      );
    }
    const shippingCents = matchedShipping.priceCents;

    // ── Validar cupom server-side ─────────────────────────────────────────────
    // Leitura + checagem de maxUses + incremento de usedCount na MESMA
    // transação, veja o comentário equivalente em create-pix/route.ts pro
    // porquê (sem isso, requisições concorrentes conseguiam burlar o
    // limite de usos de um cupom).
    let couponDiscountCents = 0;
    let couponCode: string | null = null;
    if (cartCouponCode) {
      const couponRef = adminDb.collection('coupons').doc(cartCouponCode);
      const discount = await adminDb.runTransaction(async (tx) => {
        const couponSnap = await tx.get(couponRef);
        if (!couponSnap.exists) return 0;
        const result = validateCoupon(couponSnap.data()! as Coupon, productsCents);
        if (!result.valid) return 0;
        tx.update(couponRef, { usedCount: FieldValue.increment(1) });
        return result.discountCents;
      }).catch(() => 0);
      if (discount > 0) {
        couponDiscountCents = discount;
        couponCode = cartCouponCode;
      }
    }

    // ── Aplica juros de parcelamento (se houver) ──────────────────────────────
    const feeRate = INSTALLMENT_FEES[parsedInstallments] ?? 0;
    const totalCents = computeCardTotalCents({ productsCents, couponDiscountCents, shippingCents, feeRate });
    const installmentCents = Math.round(totalCents / parsedInstallments);

    // ── Checar e reservar estoque ATOMICAMENTE (evita oversell por concorrência) ──
    // Ver mesmo fix em create-pix/route.ts: check e reserve unidos numa transação
    // do Firestore em vez de dois passos separados (que permitiam duas compras
    // simultâneas "verem" a mesma última unidade livre).
    //
    // expandStockLines soma a linha da fronha trocada (Jogo de Cama) às linhas
    // normais — reutilizada também nos dois pontos de liberação mais abaixo,
    // pra soltar a reserva da fronha junto se o pagamento falhar.
    const stockLines = expandStockLines(sanitizedCartItems);
    const inventoryQueries = await Promise.all(
      stockLines.map(line =>
        adminDb.collection('inventory').where('sku', '==', line.sku).limit(1).get()
      )
    );
    const invDocRefs = inventoryQueries.map(snap => snap.docs[0]?.ref ?? null);

    try {
      await adminDb.runTransaction(async tx => {
        const invSnaps = await Promise.all(
          invDocRefs.map(ref => (ref ? tx.get(ref) : null))
        );
        for (let i = 0; i < stockLines.length; i++) {
          const snap = invSnaps[i];
          if (!snap) continue;
          const inv = snap.data()!;
          const available = (inv.quantity ?? 0) - (inv.reserved ?? 0);
          if (available < stockLines[i].quantity) {
            const name = productMap[stockLines[i].productId]?.name ?? stockLines[i].sku;
            throw new StockError(`"${name}" não tem estoque suficiente. Disponível: ${available}`);
          }
        }
        for (let i = 0; i < stockLines.length; i++) {
          const ref = invDocRefs[i];
          if (!ref) continue;
          tx.update(ref, {
            reserved: FieldValue.increment(stockLines[i].quantity),
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
      clientIp: ip,
      addressKey: normalizeAddressKey(address),
      payment: {
        method: 'card',
        installments: parsedInstallments,
        installmentCents,
      },
      delivery: {
        carrier: matchedShipping.carrier,
        label: matchedShipping.label,
        priceCents: shippingCents,
        realPriceCents: matchedShipping.realPriceCents ?? shippingCents,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // usedCount do cupom já foi incrementado atomicamente acima, dentro
    // da transação de validação, nada a fazer aqui.

    // Avisa o vendor que alguém iniciou um pagamento (ainda não confirmado).
    // Best-effort: nunca deve bloquear ou falhar o checkout do cliente.
    // IMPORTANTE: await de propósito, ver nota em create-pix/route.ts
    // sobre CPU throttling do Cloud Run em chamadas fire-and-forget.
    await notifySeller({
      title: 'Pagamento iniciado',
      body: `${summarizeOrderItems(verifiedItems)} · R$ ${(totalCents / 100).toFixed(2)} · ${matchedShipping.label}`,
      url: `/painel/pedidos/${orderId}`,
      data: { orderId, event: 'payment_initiated' },
    });
    await notifyInApp({
      type: 'payment_initiated',
      message: `Checkout de cartão iniciado: ${summarizeOrderItems(verifiedItems)} · R$ ${(totalCents / 100).toFixed(2)}`,
      orderId,
      url: `/painel/pedidos/${orderId}`,
    });

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
      for (let i = 0; i < stockLines.length; i++) {
        const ref = invDocRefs[i];
        if (!ref) continue;
        ref.update({
          reserved: FieldValue.increment(-stockLines[i].quantity),
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
        // customer optional, continue without it
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
      for (let i = 0; i < stockLines.length; i++) {
        const ref = invDocRefs[i];
        if (!ref) continue;
        ref.update({
          reserved: FieldValue.increment(-stockLines[i].quantity),
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
      updatedAt: new Date().toISOString(),
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
    Sentry.captureException(err, { tags: { route: 'create-checkout' } });
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
