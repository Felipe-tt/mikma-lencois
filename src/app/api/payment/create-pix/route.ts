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
import { sanitizePixDescription } from '@/lib/abacatepay';
import { normalizeAddressKey } from '@/lib/fraudSignals';
import { expandStockLines } from '@/lib/orderStockLines';
import { sanitizeSwaps, type ProductLookup } from '@/lib/fronhaSwap';
import { StockError } from '@/lib/errors';
import { releaseCouponUse } from '@/lib/orders/couponUsage';
import { carrierName } from '@/lib/carriers';
import { notifySeller } from '@/lib/push/notifySeller';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { summarizeOrderItems } from '@/lib/push/summarizeOrderItems';
import { computeProductsCents, validateCoupon, computePixDiscountCents, computePixTotalCents } from '@/lib/orderPricing';
import { z } from 'zod';
import type { Coupon } from '@/types';
import { createPixSchema } from './schema';
import { sendEmail, emailEnabled } from '@/lib/email';
import { buildPixPending } from '@/lib/email/orderStatusEmails';
import { CONTACT_EMAIL } from '@/lib/email/layout';
import { guardGuestPayment, guestUnitsBlock } from '@/lib/guestGuard';


const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';

async function createPixWithRetry(call: () => Promise<Response>): Promise<Response> {
  try {
    const res = await call();
    if (res.status < 500 && res.status !== 429) return res;
  } catch { /* timeout/rede: tenta de novo abaixo */ }
  await new Promise(r => setTimeout(r, 800));
  // Segunda falha de rede vira resposta de erro: quem chama já sabe desfazer
  // o pedido (liberar estoque e cupom) em vez de deixar tudo reservado.
  return call().catch(() => new Response(JSON.stringify({ error: 'timeout' }), { status: 504 }));
}
/** Máximo de pedidos "aguardando pagamento" simultâneos por cliente. */
const MAX_PENDING_ORDERS_PER_USER = 3;
// Ambiente da AbacatePay é decidido por qual API key é usada (chave de Dev
// Mode vs produção), não por outra base URL. settings.abacatePaySandboxMode
// (editável em /painel/configuracoes) escolhe qual env var usar, sem
// precisar de novo deploy — mesmo padrão do toggle uberDirectSandboxMode.
function abacatePayKey(sandbox: boolean): string {
  return (sandbox ? process.env.ABACATEPAY_SANDBOX_API_KEY : process.env.ABACATEPAY_API_KEY) ?? '';
}

export async function POST(req: NextRequest) {
  // Rate limit duplo: por IP e por usuário (aplicado após auth)
  const ip = getClientIp(req);
  if (!await rateLimit(`pix:ip:${ip}`, 20, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`pix:ip:${ip}`));
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true); // checkRevoked
    const uid = decoded.uid;

    // Convidado: precisa ter feito o registro com reCAPTCHA; limite por IP.
    const guestBlock = await guardGuestPayment(decoded, ip);
    if (guestBlock) return guestBlock;

    // Rate limit por usuário (mais restrito, 5 PIX por hora)
    if (!await rateLimit(`pix:uid:${uid}`, 5, 60 * 60 * 1000)) {
      return tooManyRequests(rateLimitRetryAfter(`pix:uid:${uid}`));
    }

    const settings = await getSettings();
    const abacateSandbox = !!settings.abacatePaySandboxMode;
    const ABACATEPAY_KEY = abacatePayKey(abacateSandbox);

    const parsedBody = await validateBody(req, createPixSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { address, shipping } = parsedBody.data;
    // NOTA DE SEGURANÇA: nada do frete é confiado do cliente além de QUAL
    // carrier ele escolheu. O preço, label, prazo e quoteId são sempre
    // recalculados aqui via computeShippingOptions(), a mesma função usada
    // em /api/shipping/quote, e só aceitamos o carrier se ele aparecer na
    // lista recém-computada para esse endereço/carrinho exatos. Isso fecha
    // a brecha de alguém mandar priceCents: 0 direto pela API e não pagar frete.

    if (!ABACATEPAY_KEY) {
      console.error(abacateSandbox ? 'ABACATEPAY_SANDBOX_API_KEY not set' : 'ABACATEPAY_API_KEY not set');
      return NextResponse.json({ error: 'Pagamento indisponível no momento. Tente em alguns minutos.' }, { status: 500 });
    }

    // ── Load cart from Firestore (server-side, trusted) ──────────────────────
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
    // ── Load product prices/pesos from Firestore (nunca confia no cliente) ───
    // Inclui também os produtos referenciados só via swapSku (troca de
    // fronha em Jogo de Cama) — precisa deles pra validar o swap abaixo,
    // não só pra preço/peso do item principal.
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

    // ── Build verified order items ────────────────────────────────────────────
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

    const productsCents = computeProductsCents(verifiedItems.map(i => ({ unitPrice: i.unitPrice, quantity: i.quantity })));

    const totalWeightKg = cartItems.reduce(
      (s, ci) => s + (productMap[ci.productId]?.weightKg ?? settings.defaultItemWeightKg ?? 0.8) * ci.quantity,
      0
    );

    // ── Desconto PIX (calculado no servidor, lido das configurações) ──────────
    const pixDiscountCents = computePixDiscountCents(productsCents, settings);

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

    // ── Validar cupom server-side (lido do carrinho, nunca do cliente) ────────
    // IMPORTANTE: leitura + checagem de maxUses + incremento de usedCount
    // TÊM que acontecer dentro da MESMA transação. Antes, a leitura/checagem
    // rodava solta aqui e o incremento acontecia bem depois, sem transação
    // ("best-effort"). Isso é uma race condition clássica: requisições
    // concorrentes (ex: alguém automatizando cliques, ou só um duplo-clique
    // rápido) todas liam usedCount desatualizado, todas passavam da checagem
    // de maxUses, e todas incrementavam, um cupom de uso único podia acabar
    // sendo aplicado dezenas de vezes. runTransaction serializa isso: só uma
    // das chamadas concorrentes vence o incremento, as outras recomeçam e já
    // veem o usedCount atualizado.
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

    const amountCents = computePixTotalCents({ productsCents, pixDiscountCents, couponDiscountCents, shippingCents });

    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    // ── Idempotência: evita pedido duplicado por duplo-clique/duas abas ──────
    // Sem isso, dois cliques rápidos geravam dois pedidos "pending_payment"
    // independentes, cada um reservando estoque do mesmo carrinho — o
    // segundo só seria liberado quando o cron de expiração rodasse.
    // Só reaproveita se: mesmo usuário, PIX, criado há pouco (evita reusar
    // um pedido antigo esquecido) E com o MESMO valor calculado agora
    // (evita devolver um PIX de valor desatualizado se o carrinho mudou
    // entre as duas tentativas).
    {
      const recentCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const existingSnap = await adminDb.collection('orders')
        .where('userId', '==', uid)
        .where('status', '==', 'pending_payment')
        .where('payment.method', '==', 'pix')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      const existing = existingSnap.docs[0]?.data();
      if (
        existing &&
        existing.createdAt > recentCutoff &&
        existing.totalCents === amountCents &&
        existing.payment?.pixQrCode
      ) {
        return NextResponse.json({
          orderId: existingSnap.docs[0].id,
          txId: existing.payment.txId,
          qrCode: existing.payment.pixQrCode,
          copyPaste: existing.payment.pixCopyPaste,
          // Gravado como Date (vira Timestamp no Firestore): mandar o objeto
          // cru virava {_seconds,...} no JSON e o modal não contava o prazo.
          expiresAt: existing.payment.expiresAt?.toDate?.().toISOString() ?? existing.payment.expiresAt ?? undefined,
          totalCents: amountCents,
        });
      }
    }

    // ── Teto de pedidos aguardando pagamento por cliente ─────────────────────
    // Cada pedido pendente RESERVA estoque até pagar ou expirar (48h). Sem
    // teto, uma conta (ou várias) gera pedidos em série e "segura" o estoque
    // inteiro da loja sem nunca pagar. Cliente real tem 1, no máximo 2.
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
    // Antes: check e reserve eram dois passos separados, dois pedidos simultâneos
    // podiam ambos "ver" a última unidade livre e ambos reservarem. Agora tudo
    // acontece dentro de uma única transação do Firestore, que serializa
    // automaticamente escritas concorrentes no mesmo documento (retry interno).
    //
    // expandStockLines soma as linhas de estoque de fronha trocada (Jogo de
    // Cama) às linhas normais, pra reservar a fronha escolhida junto e não
    // deixar vender ela duas vezes sem perceber.
    const stockLines = expandStockLines(sanitizedCartItems);
    // O ID do documento de estoque é o próprio SKU. Antes buscava pelo
    // campo `sku`, que produtos importados por CSV não tinham: o checkout
    // não achava o estoque e vendia sem reservar.
    const inventorySnaps = await Promise.all(
      stockLines.map(line => adminDb.collection('inventory').doc(line.sku).get())
    );
    const invDocRefs = inventorySnaps.map(snap => (snap.exists ? snap.ref : null));

    try {
      await adminDb.runTransaction(async tx => {
        // Firestore exige todas as leituras antes de qualquer escrita na transação
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
          if (!snap) continue; // item sem controle de estoque passa
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
    // ── Load user profile for customer data ──────────────────────────────────
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.data() ?? {};

    // ── Create order ─────────────────────────────────────────────────────────
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
      discountCents: pixDiscountCents + couponDiscountCents,
      pixDiscountCents,
      couponDiscountCents,
      ...(couponCode ? { couponCode } : {}),
      totalCents: amountCents,
      clientIp: ip,
      addressKey: normalizeAddressKey(address),
      payment: { method: 'pix', abacateSandbox },
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // usedCount do cupom já foi incrementado atomicamente acima, dentro
    // da transação da reserva de estoque, nada a fazer aqui.

    // Avisa o vendor que alguém iniciou um pagamento PIX (ainda não confirmado).
    // Best-effort: nunca deve bloquear ou falhar o checkout do cliente.
    // IMPORTANTE: await de propósito. Em Cloud Run, sem "CPU always
    // allocated", a CPU é pausada assim que a resposta é enviada, uma
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


    // ── AbacatePay v2, POST /transparents/create ─────────────────────────────
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
        // Sanitiza pra nunca mandar caractere fora do que a AbacatePay aceita
        // (bug real: "·" travava o PIX; nomes com acento tem o mesmo risco).
        description: sanitizePixDescription(
          `Pedido #${orderId.slice(-8).toUpperCase()} - frete ${carrierName(matchedShipping.carrier)}${abacateSandbox ? ' - TESTE' : ''}`
        ),
        expiresIn: 900,
        externalId: orderId,
        ...(customerData ? { customer: customerData } : {}),
      },
    };

    // Timeout e uma nova tentativa em falha de rede/5xx: com o mesmo externalId
    // a AbacatePay devolve o PIX pendente já criado em vez de outro (docs v2),
    // então repetir não gera cobrança dupla.
    const pixRes = await createPixWithRetry(() => fetch(`${ABACATEPAY_BASE}/transparents/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABACATEPAY_KEY}`,
      },
      body: JSON.stringify(pixPayload),
      signal: AbortSignal.timeout(20_000),
    }));

    const pixText = await pixRes.text();
    // Só o status: o corpo traz o código PIX e dados do cliente, que não
    // devem ir pro log (em erro ele vai pro Sentry, logo abaixo).
    console.log('AbacatePay status:', pixRes.status);

    if (!pixRes.ok) {
      // Sem isso, o motivo real (o que a AbacatePay respondeu) só ia pro
      // console.log do servidor — invisível pra qualquer pessoa fora de
      // quem tem acesso ao Cloud Run. Próxima vez que isso acontecer,
      // aparece no Sentry com o status e o corpo da resposta.
      Sentry.captureMessage('AbacatePay recusou create PIX', {
        level: 'error',
        tags: { route: 'create-pix', abacatePayStatus: String(pixRes.status) },
        extra: { orderId, responseBody: pixText.slice(0, 1000) },
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
      return NextResponse.json({ error: 'Não foi possível iniciar o pagamento. Tente de novo.' }, { status: 502 });
    }

    const pix = JSON.parse(pixText).data;

    await orderRef.update({
      'payment.txId': pix.id,
      'payment.pixQrCode': pix.brCodeBase64,
      'payment.pixCopyPaste': pix.brCode,
      'payment.expiresAt': pix.expiresAt ? new Date(pix.expiresAt) : null,
      updatedAt: new Date().toISOString(),
    });

    // "Recebemos seu pedido, falta o PIX": só aqui, na criação do pedido (o
    // caminho de reaproveitar um PIX recente retorna antes e não reenvia).
    // Best-effort: falha de e-mail não pode impedir o cliente de pagar.
    const pendingEmailTo = (userData.email as string | undefined) || decoded.email;
    if (emailEnabled() && pendingEmailTo && pix.brCode) {
      const firstName = String(userData.name ?? userData.displayName ?? '').split(' ')[0] || 'cliente';
      const payload = buildPixPending(
        { id: orderId, items: verifiedItems, totalCents: amountCents, productsCents, shippingCents, pixDiscountCents, couponDiscountCents, couponCode: couponCode ?? undefined },
        firstName,
        { copyPaste: pix.brCode, expiresAt: pix.expiresAt, qrCode: pix.brCodeBase64 },
      );
      await sendEmail({
        to: pendingEmailTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: payload.attachments,
        from: 'noreply',
        replyTo: CONTACT_EMAIL,
      }).catch(err => console.error('[create-pix] falha ao enviar e-mail de pedido recebido (ignorado):', err));
    }

    return NextResponse.json({
      orderId,
      txId: pix.id,
      qrCode: pix.brCodeBase64,
      copyPaste: pix.brCode,
      expiresAt: pix.expiresAt,
      totalCents: amountCents,
    });
  } catch (err) {
    console.error('create-pix error:', err);
    Sentry.captureException(err, { tags: { route: 'create-pix' } });
    return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo.' }, { status: 500 });
  }
}
