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
import { releaseCouponUse } from '@/lib/orders/couponUsage';
import { notifySeller } from '@/lib/push/notifySeller';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { summarizeOrderItems } from '@/lib/push/summarizeOrderItems';
import { computeProductsCents, validateCoupon, computeCardTotalCents, installmentFeeRate, cardMinCents, maxInstallments } from '@/lib/orderPricing';
import { MAX_PENDING_ORDERS_PER_USER } from '@/lib/orders/pendingLimit';
import { z } from 'zod';
import type { Coupon } from '@/types';
import { createCheckoutSchema } from './schema';
import { guardGuestPayment, guestUnitsBlock } from '@/lib/guestGuard';
import { sanitizeSwaps, type ProductLookup } from '@/lib/fronhaSwap';
import { createCardCharge } from '@/lib/abacatepayApi';
import { confirmOrderPaid } from '@/lib/orders/confirmPayment';


const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';
// Ver nota equivalente em create-pix/route.ts.
function abacatePayKey(sandbox: boolean): string {
  return (sandbox ? process.env.ABACATEPAY_SANDBOX_API_KEY : process.env.ABACATEPAY_API_KEY) ?? '';
}


// Timeout ou erro de rede viram uma resposta 504: os ramos de erro do POST já
// desfazem o pedido (apagam, liberam estoque e cupom). Antes a exceção caía
// no catch geral, que só respondia 500 e deixava tudo reservado.
const networkError = () => new Response(JSON.stringify({ error: 'timeout' }), { status: 504 });

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!await rateLimit(`checkout:ip:${ip}`, 20, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`checkout:ip:${ip}`));
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true);
    const uid = decoded.uid;

    // Convidado: precisa ter feito o registro com reCAPTCHA; limite por IP.
    const guestBlock = await guardGuestPayment(decoded, ip);
    if (guestBlock) return guestBlock;

    // 10/h: no cartão no site, cada cartão recusado é uma nova tentativa.
    if (!await rateLimit(`checkout:uid:${uid}`, 10, 60 * 60 * 1000)) {
      return tooManyRequests(rateLimitRetryAfter(`checkout:uid:${uid}`));
    }

    const settings = await getSettings();
    const abacateSandbox = !!settings.abacatePaySandboxMode;
    const ABACATEPAY_KEY = abacatePayKey(abacateSandbox);

    const parsedBody = await validateBody(req, createCheckoutSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { address, installments, shipping, cardToken, expectedTotalCents, customer } = parsedBody.data;

    // NOTA DE SEGURANÇA: nada do frete é confiado do cliente além de QUAL
    // carrier ele escolheu, preço, label, prazo e quoteId são sempre
    // recalculados via computeShippingOptions() (mesma fonte usada em
    // /api/shipping/quote), e só aceitamos o carrier se ele aparecer na
    // lista recém-computada para esse endereço/carrinho exatos.

    const parsedInstallments = installments;

    if (!ABACATEPAY_KEY) {
      console.error(abacateSandbox ? 'ABACATEPAY_SANDBOX_API_KEY not set' : 'ABACATEPAY_API_KEY not set');
      return NextResponse.json({ error: 'Pagamento indisponível no momento. Tente em alguns minutos.' }, { status: 500 });
    }

    // ── Load cart from Firestore ──────────────────────────────────────────────
    const cartSnap = await adminDb.collection('carts').doc(uid).get();
    if (!cartSnap.exists || !cartSnap.data()?.items?.length) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    }
    const cartData = cartSnap.data()!;
    const cartItems: Array<{ sku: string; productId: string; quantity: number; note?: string; swapSku?: string; swapQtyPerUnit?: number }> = cartData.items;
    const cartCouponCode: string | null = cartData.couponCode ?? null;
    const guestUnits = guestUnitsBlock(decoded, cartItems);
    if (guestUnits) return guestUnits;

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
    const productMap: Record<string, { price: number; name: string; weightKg?: number; active: boolean; category: string; fronhaCount?: number; variantSize?: string }> = {};
    for (const snap of productDocs) {
      if (snap.exists) {
        productMap[snap.id] = {
          price: snap.data()!.price as number,
          name: snap.data()!.name as string,
          weightKg: snap.data()!.weightKg as number | undefined,
          active: snap.data()!.active as boolean,
          category: snap.data()!.category as string,
          fronhaCount: snap.data()!.fronhaCount as number | undefined,
          variantSize: (snap.data()!.variants as Array<{ size?: string }> | undefined)?.[0]?.size,
        };
      }
    }

    // ── Nunca confia no swapSku/swapQtyPerUnit/note vindo do carrinho
    // (escrito direto pelo client SDK, sem passar por API) ─────────────────
    const productLookup = new Map<string, ProductLookup>(
      Object.entries(productMap).map(([id, p]) => [id, { id, name: p.name, active: p.active, category: p.category, fronhaCount: p.fronhaCount, variantSize: p.variantSize }])
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
        // Produto pode ter sido excluído de verdade do catálogo (não só
        // desativado) depois de já estar no carrinho de alguém — sem essa
        // checagem, virava um erro 500 não tratado em vez de avisar o
        // cliente pra remover o item.
        if (!prod) {
          throw new StockError('Um dos produtos do seu carrinho não existe mais. Remova-o do carrinho e tente novamente.');
        }
        // Produto pode ter sido desativado depois de já estar no carrinho de
        // alguém (removido do catálogo pelo vendedor) — sem essa checagem,
        // dava pra comprar um produto que não deveria mais estar à venda.
        if (!prod.active) {
          throw new StockError(`"${prod.name}" não está mais disponível. Remova do carrinho e tente novamente.`);
        }
        // O SKU vem do carrinho (client SDK): sem isso dava pra pagar o
        // preço de um produto e reservar/baixar o estoque de outro.
        if (!ci.sku.startsWith(`${ci.productId}_`)) {
          throw new StockError('Um item do seu carrinho está inválido. Remova-o e adicione de novo.');
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

    if (subtotalCents <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

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
      // Só calcula o desconto aqui. O incremento de usedCount (com nova
      // checagem de maxUses) acontece na transação da reserva de estoque,
      // mais abaixo: antes ele vinha aqui e saídas antecipadas (pedido
      // idêntico recente, limite de pendentes, sem estoque) gastavam um uso
      // do cupom sem criar pedido nenhum.
      const discount = await couponRef.get().then(couponSnap => {
        if (!couponSnap.exists) return 0;
        const result = validateCoupon(couponSnap.data()! as Coupon, productsCents);
        return result.valid ? result.discountCents : 0;
      }).catch(() => 0);
      if (discount > 0) {
        couponDiscountCents = discount;
        couponCode = cartCouponCode;
      }
    }

    // ── Mínimo do cartão e parcelas: mesma regra do checkout (lib/orderPricing),
    // sobre o valor à vista. Antes o servidor usava R$ 100 fixo sobre os
    // produtos e ignorava o mínimo do painel; o checkout comparava com o total
    // com frete e oferecia cartão que o servidor recusava.
    const cardBaseCents = computeCardTotalCents({ productsCents, couponDiscountCents, shippingCents, feeRate: 0 });
    const minCard = cardMinCents(settings.creditMinOrderCents);
    if (cardBaseCents < minCard) {
      return NextResponse.json(
        { error: `Pagamento por cartão disponível a partir de R$ ${(minCard / 100).toFixed(2)}` },
        { status: 422 }
      );
    }
    if (parsedInstallments > maxInstallments(cardBaseCents)) {
      return NextResponse.json(
        { error: `Para este valor, o parcelamento vai até ${maxInstallments(cardBaseCents)}x.` },
        { status: 422 }
      );
    }

    // ── Aplica juros de parcelamento (se houver) ──────────────────────────────
    const feeRate = installmentFeeRate(parsedInstallments);
    const totalCents = computeCardTotalCents({ productsCents, couponDiscountCents, shippingCents, feeRate });
    const installmentCents = Math.round(totalCents / parsedInstallments);

    // O token do cartão foi gerado para um valor exato: se o carrinho, o
    // frete ou o cupom mudou no meio do caminho, a página refaz o formulário.
    if (cardToken && expectedTotalCents !== totalCents) {
      return NextResponse.json(
        { error: 'O valor do pedido mudou. Confira o total e tente de novo.', code: 'AMOUNT_CHANGED', totalCents },
        { status: 409 }
      );
    }

    // ── Idempotência: evita pedido duplicado por duplo-clique/duas abas ──────
    // Ver mesmo mecanismo em create-pix/route.ts. Só reaproveita se: mesmo
    // usuário, cartão, criado há pouco, e com o MESMO valor calculado agora.
    if (!cardToken) {
      const recentCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const existingSnap = await adminDb.collection('orders')
        .where('userId', '==', uid)
        .where('status', '==', 'pending_payment')
        .where('payment.method', '==', 'card')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      const existing = existingSnap.docs[0]?.data();
      if (
        existing &&
        existing.createdAt > recentCutoff &&
        existing.totalCents === totalCents &&
        existing.payment?.installments === parsedInstallments &&
        existing.payment?.checkoutUrl
      ) {
        return NextResponse.json({
          orderId: existingSnap.docs[0].id,
          checkoutUrl: existing.payment.checkoutUrl,
          totalCents: existing.totalCents,
          installments: existing.payment.installments,
          installmentCents: existing.payment.installmentCents,
        });
      }
    }

    // ── Teto de pedidos aguardando pagamento (mesmo do PIX) ─────────────────
    // Pedido de cartão pendente também reserva estoque até pagar ou ser
    // cancelado (48h): sem teto, dava para segurar o estoque da loja.
    {
      const pendingSnap = await adminDb.collection('orders')
        .where('userId', '==', uid)
        .where('status', '==', 'pending_payment')
        .limit(MAX_PENDING_ORDERS_PER_USER)
        .get();
      if (pendingSnap.size >= MAX_PENDING_ORDERS_PER_USER) {
        return NextResponse.json(
          { error: 'Você já tem pedidos aguardando pagamento. Conclua ou cancele um deles para criar outro.' },
          { status: 409 }
        );
      }
    }

    // ── Checar e reservar estoque ATOMICAMENTE (evita oversell por concorrência) ──
    // Ver mesmo fix em create-pix/route.ts: check e reserve unidos numa transação
    // do Firestore em vez de dois passos separados (que permitiam duas compras
    // simultâneas "verem" a mesma última unidade livre).
    //
    // expandStockLines soma a linha da fronha trocada (Jogo de Cama) às linhas
    // normais — reutilizada também nos dois pontos de liberação mais abaixo,
    // pra soltar a reserva da fronha junto se o pagamento falhar.
    const stockLines = expandStockLines(sanitizedCartItems);
    // O ID do documento de estoque é o próprio SKU. Antes buscava pelo
    // campo `sku`, que produtos importados por CSV não tinham: o checkout
    // não achava o estoque e vendia sem reservar.
    const inventorySnaps = await Promise.all(
      stockLines.map(line => adminDb.collection('inventory').doc(line.sku).get())
    );
    const invDocRefs = inventorySnaps.map(snap => (snap.exists ? snap.ref : null));
    // Sem documento de estoque = indisponível, como a página do produto já
    // mostra (antes passava sem checar nem reservar: variação removida num
    // carrinho antigo era vendida sem controle).
    const missingStock = inventorySnaps.findIndex(snap => !snap.exists);
    if (missingStock >= 0) {
      const name = productMap[stockLines[missingStock].productId]?.name ?? 'Um item';
      return NextResponse.json(
        { error: `"${name}" nesta opção não está mais disponível. Remova do carrinho e tente novamente.` },
        { status: 409 }
      );
    }
    const releaseReservation = () => {
      for (let i = 0; i < stockLines.length; i++) {
        const ref = invDocRefs[i];
        if (!ref) continue;
        ref.update({
          reserved: FieldValue.increment(-stockLines[i].quantity),
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
    };

    try {
      await adminDb.runTransaction(async tx => {
        const invSnaps = await Promise.all(
          invDocRefs.map(ref => (ref ? tx.get(ref) : null))
        );
        const couponRef = couponCode ? adminDb.collection('coupons').doc(couponCode) : null;
        const couponSnap = couponRef ? await tx.get(couponRef) : null;
        if (couponRef) {
          const result = couponSnap?.exists
            ? validateCoupon(couponSnap.data()! as Coupon, productsCents)
            : { valid: false, discountCents: 0 };
          if (!result.valid || result.discountCents !== couponDiscountCents) {
            throw new StockError('O cupom aplicado não está mais disponível. Atualize o carrinho e tente novamente.');
          }
        }
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
        if (couponRef) tx.update(couponRef, { usedCount: FieldValue.increment(1) });
      });
    } catch (err) {
      if (err instanceof StockError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    // ── (lido antes de criar o pedido: nome/e-mail vão no próprio pedido)
    // ── Load user profile ─────────────────────────────────────────────────────
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.data() ?? {};

    // ── Create order ──────────────────────────────────────────────────────────
    const orderId = `ord_${randomBytes(8).toString('hex')}`;
    const orderRef = adminDb.collection('orders').doc(orderId);
    const now = new Date().toISOString();
    await orderRef.set({
      userId: uid,
      // Cópia do nome/e-mail: a lista de pedidos do painel lia o cadastro
      // de cada cliente, uma leitura por pedido.
      customerName: ((userData.name ?? userData.displayName ?? '') as string).slice(0, 120),
      customerEmail: ((userData.email ?? '') as string).slice(0, 200),
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
        abacateSandbox,
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
        { status: 'payment_initiated', at: now, note: cardToken ? `Cartão no site (${parsedInstallments}x)` : `Checkout cartão iniciado (${parsedInstallments}x)` },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // usedCount do cupom já foi incrementado atomicamente acima, dentro
    // da transação da reserva de estoque, nada a fazer aqui.

    // Avisa o vendor que alguém iniciou um pagamento (ainda não confirmado).
    // No cartão no site o resultado sai na hora: o aviso é o de pago.
    // Best-effort: nunca deve bloquear ou falhar o checkout do cliente.
    // IMPORTANTE: await de propósito, ver nota em create-pix/route.ts
    // sobre CPU throttling do Cloud Run em chamadas fire-and-forget.
    if (!cardToken) await notifySeller({
      title: 'Pagamento iniciado',
      body: `${summarizeOrderItems(verifiedItems)} · R$ ${(totalCents / 100).toFixed(2)} · ${matchedShipping.label}`,
      url: `/painel/pedidos/${orderId}`,
      data: { orderId, event: 'payment_initiated' },
    });
    if (!cardToken) await notifyInApp({
      type: 'payment_initiated',
      message: `Checkout de cartão iniciado: ${summarizeOrderItems(verifiedItems)} · R$ ${(totalCents / 100).toFixed(2)}`,
      orderId,
      url: `/painel/pedidos/${orderId}`,
    });

    if (cardToken && customer) {
      return chargeCardOnSite({
        orderId, orderRef, uid, cardToken, totalCents, installments: parsedInstallments,
        customer: { ...customer, email: ((userData.email ?? decoded.email ?? '') as string) },
        sandbox: abacateSandbox,
        rollback: async () => {
          await orderRef.delete();
          await releaseCouponUse(couponCode);
          releaseReservation();
        },
      });
    }

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
      signal: AbortSignal.timeout(15_000),
    }).catch(networkError);

    const productText = await productRes.text();
    console.log('AbacatePay product status:', productRes.status, 'body:', productText);

    if (!productRes.ok) {
      await orderRef.delete();
      await releaseCouponUse(couponCode);
      for (let i = 0; i < stockLines.length; i++) {
        const ref = invDocRefs[i];
        if (!ref) continue;
        ref.update({
          reserved: FieldValue.increment(-stockLines[i].quantity),
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
      return NextResponse.json({ error: 'Não foi possível iniciar o pagamento. Tente de novo.' }, { status: 502 });
    }

    const abacateProduct = JSON.parse(productText).data;


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
          signal: AbortSignal.timeout(8_000),
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
      // Parcelas de verdade vão em card.maxInstallments (docs v2): só no
      // metadata a página da AbacatePay ignorava a escolha do cliente. Cada
      // parcela precisa ser de pelo menos R$ 10.
      card: { maxInstallments: Math.max(1, Math.min(parsedInstallments, 12, Math.floor(totalCents / 1000))) },
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
      signal: AbortSignal.timeout(15_000),
    }).catch(networkError);

    const checkText = await checkRes.text();
    console.log('AbacatePay checkout status:', checkRes.status, 'body:', checkText);

    if (!checkRes.ok) {
      Sentry.captureMessage('AbacatePay recusou create checkout', {
        level: 'error',
        tags: { route: 'create-checkout', abacatePayStatus: String(checkRes.status) },
        extra: { orderId, responseBody: checkText.slice(0, 1000) },
      });
      await orderRef.delete();
      await releaseCouponUse(couponCode);
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
      return NextResponse.json({ error: 'Não foi possível iniciar o pagamento. Tente de novo.' }, { status: 502 });
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
    return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo.' }, { status: 500 });
  }
}

// Mensagens da AbacatePay (docs: Criar cobrança Cartão) para o cliente.
function cardErrorMessage(error: string): { message: string; code: string } {
  const e = error.toLowerCase();
  if (e.includes('token')) return { code: 'TOKEN_EXPIRED', message: 'Os dados do cartão expiraram. Confira e toque em pagar de novo.' };
  if (e.includes('amount')) return { code: 'AMOUNT_CHANGED', message: 'O valor do pedido mudou. Confira o total e tente de novo.' };
  if (e.includes('card_transparents') || e.includes('not available')) {
    return { code: 'UNAVAILABLE', message: 'O pagamento com cartão no site está indisponível agora. Use a página de pagamento.' };
  }
  return { code: 'DECLINED', message: 'Não foi possível processar o pagamento com este cartão. Confira os dados ou tente outro cartão.' };
}

async function chargeCardOnSite(input: {
  orderId: string;
  orderRef: FirebaseFirestore.DocumentReference;
  uid: string;
  cardToken: string;
  totalCents: number;
  installments: number;
  customer: { name: string; email: string; taxId: string; cellphone: string };
  sandbox: boolean;
  rollback: () => Promise<void>;
}) {
  const { orderId, orderRef } = input;
  const res = await createCardCharge({
    token: input.cardToken,
    amount: input.totalCents,
    installments: input.installments,
    customer: {
      name: input.customer.name,
      email: input.customer.email,
      taxId: input.customer.taxId.replace(/\D/g, ''),
      cellphone: input.customer.cellphone.replace(/\D/g, ''),
    },
    metadata: { orderId, uid: input.uid },
    sandbox: input.sandbox,
  });

  if (!res.ok) {
    // Sem resposta (timeout/rede) ou erro do lado deles: a cobrança pode ter
    // passado. Nada de desfazer nem tentar de novo; o pedido fica aguardando
    // e o webhook (metadata.orderId) confirma se foi aprovado.
    if (res.status === 0 || res.status >= 500) {
      Sentry.captureMessage('Cartão no site sem resposta da AbacatePay', {
        level: 'warning',
        tags: { route: 'create-checkout', abacatePayStatus: String(res.status) },
        extra: { orderId, error: res.error.slice(0, 500) },
      });
      const at = new Date().toISOString();
      await orderRef.update({
        updatedAt: at,
        timeline: FieldValue.arrayUnion({ status: 'payment_processing', at, note: 'Cartão em análise: sem resposta imediata da AbacatePay' }),
      }).catch(() => {});
      return NextResponse.json({ orderId, status: 'processing' }, { status: 202 });
    }
    await input.rollback();
    const { code, message } = cardErrorMessage(res.error);
    if (res.status === 401 || res.status === 403 || code === 'UNAVAILABLE') {
      Sentry.captureMessage('AbacatePay recusou cartão no site (configuração)', {
        level: 'error',
        tags: { route: 'create-checkout', abacatePayStatus: String(res.status) },
        extra: { orderId, error: res.error.slice(0, 500) },
      });
      return NextResponse.json({ error: 'O pagamento com cartão no site está indisponível agora. Use a página de pagamento.', code: 'UNAVAILABLE' }, { status: 503 });
    }
    return NextResponse.json({ error: message, code }, { status: 402 });
  }

  const charge = res.data;
  const at = new Date().toISOString();
  await orderRef.update({
    'payment.txId': charge.id,
    ...(charge.brand ? { 'payment.cardBrand': String(charge.brand).slice(0, 20) } : {}),
    ...(charge.lastFour ? { 'payment.cardLastFour': String(charge.lastFour).slice(-4) } : {}),
    updatedAt: at,
  });

  if (charge.status === 'APPROVED' || charge.status === 'PAID') {
    const card = charge.lastFour ? ` · final ${String(charge.lastFour).slice(-4)}` : '';
    try {
      await confirmOrderPaid(orderId, charge.id, `Cartão aprovado no site (${input.installments}x)${card}`);
    } catch (err) {
      // Cobrança aprovada: o webhook confirma de novo (idempotente).
      Sentry.captureException(err, { tags: { route: 'create-checkout', step: 'confirm-card' }, extra: { orderId } });
    }
    return NextResponse.json({ orderId, status: 'paid' });
  }

  if (charge.status === 'PENDING') {
    return NextResponse.json({ orderId, status: 'pending' });
  }

  // FAILED (ou outro estado final) já na criação: recusa.
  await input.rollback();
  return NextResponse.json({ error: cardErrorMessage('').message, code: 'DECLINED' }, { status: 402 });
}
