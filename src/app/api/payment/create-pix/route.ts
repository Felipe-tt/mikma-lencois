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
import { tooManyRequests, addressSchema, validateBody } from '@/lib/security';
import { StockError } from '@/lib/errors';
import { notifySeller } from '@/lib/push/notifySeller';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { summarizeOrderItems } from '@/lib/push/summarizeOrderItems';
import { computeProductsCents, validateCoupon, computePixDiscountCents, computePixTotalCents } from '@/lib/orderPricing';
import { z } from 'zod';
import type { Coupon } from '@/types';

export const createPixSchema = z.object({
  address: addressSchema,
  shipping: z.object({
    carrier: z.string().trim().min(1).max(60),
  }).passthrough(),
});

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

    const parsedBody = await validateBody(req, createPixSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { address, shipping } = parsedBody.data;
    // NOTA DE SEGURANÇA: nada do frete é confiado do cliente além de QUAL
    // carrier ele escolheu. O preço, label, prazo e quoteId são sempre
    // recalculados aqui via computeShippingOptions() — a mesma função usada
    // em /api/shipping/quote — e só aceitamos o carrier se ele aparecer na
    // lista recém-computada para esse endereço/carrinho exatos. Isso fecha
    // a brecha de alguém mandar priceCents: 0 direto pela API e não pagar frete.

    if (!ABACATEPAY_KEY) {
      console.error('ABACATEPAY_API_KEY not set');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500 });
    }

    // ── Load cart from Firestore (server-side, trusted) ──────────────────────
    const cartSnap = await adminDb.collection('carts').doc(uid).get();
    if (!cartSnap.exists || !cartSnap.data()?.items?.length) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    }
    const cartData = cartSnap.data()!;
    const cartItems: Array<{ sku: string; productId: string; quantity: number }> = cartData.items;
    const cartCouponCode: string | null = cartData.couponCode ?? null;

    // ── Load product prices/pesos from Firestore (nunca confia no cliente) ───
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

    // ── Build verified order items ────────────────────────────────────────────
    const verifiedItems = cartItems.map(ci => {
      const prod = productMap[ci.productId];
      if (!prod) throw new Error(`Produto ${ci.productId} não encontrado`);
      return { ...ci, unitPrice: prod.price, productName: prod.name };
    });

    const productsCents = computeProductsCents(verifiedItems.map(i => ({ unitPrice: i.unitPrice, quantity: i.quantity })));

    const settings = await getSettings();

    const totalWeightKg = cartItems.reduce(
      (s, ci) => s + (productMap[ci.productId]?.weightKg ?? settings.defaultItemWeightKg ?? 0.8) * ci.quantity,
      0
    );

    // ── Desconto PIX (calculado no servidor, lido das configurações) ──────────
    const pixDiscountCents = computePixDiscountCents(productsCents, settings);

    // ── Frete — recalculado do zero, nunca confiado do cliente ────────────────
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

    // ── Validar cupom server-side (lido do carrinho, nunca do cliente) ────────
    let couponDiscountCents = 0;
    let couponCode: string | null = null;
    if (cartCouponCode) {
      const couponSnap = await adminDb.collection('coupons').doc(cartCouponCode).get();
      if (couponSnap.exists) {
        const result = validateCoupon(couponSnap.data()! as Coupon, productsCents);
        if (result.valid) {
          couponDiscountCents = result.discountCents;
          couponCode = cartCouponCode;
        }
      }
    }

    const amountCents = computePixTotalCents({ productsCents, pixDiscountCents, couponDiscountCents, shippingCents });

    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    // ── Checar e reservar estoque ATOMICAMENTE (evita oversell por concorrência) ──
    // Antes: check e reserve eram dois passos separados — dois pedidos simultâneos
    // podiam ambos "ver" a última unidade livre e ambos reservarem. Agora tudo
    // acontece dentro de uma única transação do Firestore, que serializa
    // automaticamente escritas concorrentes no mesmo documento (retry interno).
    const inventoryQueries = await Promise.all(
      cartItems.map(ci =>
        adminDb.collection('inventory').where('sku', '==', ci.sku).limit(1).get()
      )
    );
    const invDocRefs = inventoryQueries.map(snap => snap.docs[0]?.ref ?? null);

    try {
      await adminDb.runTransaction(async tx => {
        // Firestore exige todas as leituras antes de qualquer escrita na transação
        const invSnaps = await Promise.all(
          invDocRefs.map(ref => (ref ? tx.get(ref) : null))
        );
        for (let i = 0; i < cartItems.length; i++) {
          const snap = invSnaps[i];
          if (!snap) continue; // item sem controle de estoque passa
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
      discountCents: pixDiscountCents + couponDiscountCents,
      pixDiscountCents,
      couponDiscountCents,
      ...(couponCode ? { couponCode } : {}),
      totalCents: amountCents,
      payment: { method: 'pix' },
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
      },
      timeline: [
        { status: 'created', at: now, note: 'Pedido criado' },
        { status: 'payment_initiated', at: now, note: 'PIX gerado' },
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

    // Avisa o vendor que alguém iniciou um pagamento PIX (ainda não confirmado).
    // Best-effort: nunca deve bloquear ou falhar o checkout do cliente.
    // IMPORTANTE: await de propósito. Em Cloud Run, sem "CPU always
    // allocated", a CPU é pausada assim que a resposta é enviada — uma
    // chamada "fire and forget" aqui seria interrompida no meio e o push
    // nunca chegaria a ser enviado, sem gerar nenhum log.
    await notifySeller({
      title: 'Pagamento PIX iniciado',
      body: `${summarizeOrderItems(verifiedItems)} · R$ ${(amountCents / 100).toFixed(2)} · ${matchedShipping.label}`,
      url: `/painel/pedidos/${orderId}`,
      data: { orderId, event: 'payment_initiated' },
    });
    await notifyInApp({
      type: 'payment_initiated',
      message: `PIX gerado: ${summarizeOrderItems(verifiedItems)} · R$ ${(amountCents / 100).toFixed(2)}`,
      orderId,
      url: `/painel/pedidos/${orderId}`,
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
        description: `Pedido #${orderId.slice(-8).toUpperCase()} · frete ${matchedShipping.carrier}`,
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
      // Liberar reserva de estoque
      for (let i = 0; i < cartItems.length; i++) {
        const ref = invDocRefs[i];
        if (!ref) continue;
        ref.update({
          reserved: FieldValue.increment(-cartItems[i].quantity),
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
      return NextResponse.json({ error: 'Erro no provedor de pagamento' }, { status: 502 });
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
    Sentry.captureException(err, { tags: { route: 'create-pix' } });
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
