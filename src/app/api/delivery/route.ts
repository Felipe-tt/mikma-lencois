/**
 * POST /api/delivery
 * Despacha um pedido que não depende de código de rastreio manual:
 * - Retirada na loja: o pedido vai direto para 'delivered'
 * - Uber Direct: solicita o entregador
 *
 * Correios e Jadlog são postados na agência e marcados como despachados
 * pelo painel informando o código de rastreio (update-status).
 */
import { shippingBlockReason } from '@/lib/orders/shippingBlock';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, validateBody } from '@/lib/security';
import { z } from 'zod';
import type { Order } from '@/types';
import { sendEmail } from '@/lib/email';
import { buildDelivered } from '@/lib/email/orderStatusEmails';
import { CONTACT_EMAIL } from '@/lib/email/layout';

import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';
import { recordShippingSpent } from '@/lib/shipping-ledger';
import { dispatchSchema, cancelDeliverySchema } from './schema';
import {
  uberCreateDelivery,
  uberCancelDelivery,
  uberDirectConfigured,
  uberQuote,
  buildUberAddress,
  formatPhone,
  type UberManifestItem,
} from '@/lib/uber-direct';

async function getStoreSettings(): Promise<StoreSettings> {
  const snap = await adminDb.collection('settings').doc('store').get();
  return { ...STORE_DEFAULTS, ...(snap.exists ? snap.data() : {}) } as StoreSettings;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true);
    if (!['seller', 'admin'].includes((decoded as { role?: string }).role ?? '')) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const ip    = getClientIp(req);
    const rlKey = `delivery:${ip}`;
    if (!await rateLimit(rlKey, 30, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(rlKey));

    const parsedBody = await validateBody(req, dispatchSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { orderId, carrier: bodyCarrier } = parsedBody.data;

    const [orderSnap, settings] = await Promise.all([
      adminDb.collection('orders').doc(orderId).get(),
      getStoreSettings(),
    ]);

    if (!orderSnap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

    const order = { id: orderSnap.id, ...orderSnap.data() } as Order;

    if (!['paid', 'preparing'].includes(order.status)) {
      return NextResponse.json({ error: `Pedido não pode ser despachado no status "${order.status}"` }, { status: 409 });
    }
    const blocked = shippingBlockReason(order);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

    // Prioridade: body (painel) → selectedShipping (escolha do cliente) → delivery.carrier → fallback
    const orderAny = order as unknown as { selectedShipping?: { carrier?: string } };
    const carrier = bodyCarrier
      ?? orderAny.selectedShipping?.carrier
      ?? order.delivery?.carrier
      ?? 'correios_pac';

    // ── Retirada na loja ────────────────────────────────────────────────────
    if (carrier === 'pickup') {
      // A retirada é a própria entrega: vai direto pra 'delivered'. Antes
      // parava em 'shipped' ("A caminho") e dependia de um segundo clique
      // que, esquecido, deixava o pedido a caminho pra sempre.
      const orderRef = adminDb.collection('orders').doc(orderId);
      const ok = await adminDb.runTransaction(async tx => {
        const fresh = await tx.get(orderRef);
        if (!['paid', 'preparing'].includes(fresh.data()?.status)) return false;
        const at = new Date().toISOString();
        tx.update(orderRef, {
          status: 'delivered',
          'delivery.carrier': 'pickup',
          'delivery.trackingCode': null,
          'delivery.dispatchedAt': FieldValue.serverTimestamp(),
          'delivery.deliveredAt': FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          timeline: FieldValue.arrayUnion({ status: 'delivered', at, note: 'Cliente retirou na loja' }),
        });
        return true;
      });
      if (!ok) return NextResponse.json({ error: 'Este pedido já foi despachado. Atualize a página.' }, { status: 409 });

      // E-mail de entregue (best-effort, o pedido já foi atualizado).
      try {
        const uSnap = await adminDb.collection('users').doc(order.userId).get();
        const userData = uSnap.data() as { email?: string; name?: string } | undefined;
        if (userData?.email) {
          const firstName = (userData.name ?? '').split(' ')[0] || 'cliente';
          const payload = buildDelivered({ ...order, status: 'delivered' }, firstName);
          await sendEmail({
            to: userData.email,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            from: 'noreply',
            replyTo: CONTACT_EMAIL,
          });
        }
      } catch (err) {
        console.error('[delivery] e-mail de retirada falhou:', err);
      }
      return NextResponse.json({ carrier: 'pickup', trackingCode: null, labelUrl: null, status: 'delivered' });
    }

    // ── Entrega Uber Direct ──────────────────────────────────────────────────
    if (carrier === 'uber_direct') {
      const uberSandbox = !!settings.uberDirectSandboxMode;
      if (!uberDirectConfigured(uberSandbox)) {
        return NextResponse.json(
          {
            error: uberSandbox
              ? 'UBER_DIRECT_SANDBOX_CLIENT_ID / SECRET / CUSTOMER_ID não configurados.'
              : 'UBER_DIRECT_CLIENT_ID / SECRET / CUSTOMER_ID não configurados.',
          },
          { status: 500 }
        );
      }

      const addr = order.address;
      if (!addr?.street || !addr?.number) {
        return NextResponse.json({ error: 'Endereço do cliente incompleto para Uber Direct' }, { status: 400 });
      }

      // Busca dados do cliente (nome + telefone)
      const userSnap   = await adminDb.collection('users').doc(order.userId).get();
      const userData   = userSnap.data() ?? {};
      const customerName  = (userData.name as string | undefined) || 'Cliente';
      const customerPhone = formatPhone((userData.phone as string | undefined) || '47999999999');

      // Monta endereços no formato JSON string exigido pela API Uber Direct
      const pickupAddress = buildUberAddress({
        street:  settings.storeAddress ?? '',
        number:  settings.storeNumber  ?? '',
        city:    settings.storeCity    ?? '',
        state:   settings.storeState   ?? '',
        zipCode: settings.originCep    ?? '',
      });

      const dropoffAddress = buildUberAddress({
        street:     addr.street      ?? '',
        number:     addr.number      ?? '',
        complement: addr.complement,
        city:       addr.city        ?? '',
        state:      addr.state       ?? '',
        zipCode:    addr.cep         ?? '',
      });

      // manifest_items é OBRIGATÓRIO, array com cada item do pedido
      const manifestItems: UberManifestItem[] = order.items.map(i => ({
        name:     `${i.productName}${i.variant ? ` (${i.variant.size} ${i.variant.colorName ?? i.variant.color})` : ''}`.slice(0, 80),
        quantity: i.quantity,
        size:     'medium' as const,
        price:    i.unitPrice,
      }));

      // ── Recotação obrigatória no momento do despacho ──────────────────────
      // O quoteId salvo no checkout expira em minutos (ver uber-direct.ts).
      // Como o despacho normalmente acontece horas/dias depois, esse quoteId
      // já está vencido e a Uber ignoraria o preço antigo, cobrando o valor
      // atual do cartão sem aviso. Por isso sempre recotamos aqui e
      // comparamos com o que o cliente já pagou, ANTES de criar a entrega
      // (que é o momento em que o cartão é cobrado de verdade).
      let freshQuoteId: string | undefined;
      let currentFeeCents: number;
      try {
        const freshQuote = await uberQuote(pickupAddress, dropoffAddress, uberSandbox);
        freshQuoteId = freshQuote.quoteId;
        currentFeeCents = freshQuote.feeCents;
      } catch (err) {
        return NextResponse.json(
          { error: `Não foi possível recotar o frete Uber Direct antes do despacho: ${err instanceof Error ? err.message : String(err)}` },
          { status: 502 }
        );
      }

      const chargedCents = order.delivery?.priceCents ?? 0;
      const marginCents = Math.max(
        settings.uberOverspendMarginCents ?? 0,
        Math.round(chargedCents * ((settings.uberOverspendMarginPct ?? 0) / 100))
      );
      const overspendCents = currentFeeCents - chargedCents;

      if (overspendCents > marginCents && !parsedBody.data.forceOverspend) {
        return NextResponse.json(
          {
            error: 'overspend_confirmation_required',
            message: `O custo atual da Uber Direct (R$ ${(currentFeeCents / 100).toFixed(2)}) é maior do que o frete cobrado do cliente (R$ ${(chargedCents / 100).toFixed(2)}), acima da margem tolerada (R$ ${(marginCents / 100).toFixed(2)}). Confirme para despachar mesmo assim.`,
            chargedCents,
            currentFeeCents,
            marginCents,
            overspendCents,
          },
          { status: 409 }
        );
      }

      // Trava o despacho antes de chamar a Uber: dois toques (ou duas
      // pessoas da equipe) criavam duas corridas, e as duas eram cobradas.
      const orderRef = adminDb.collection('orders').doc(orderId);
      const LOCK_MS = 2 * 60 * 1000;
      const locked = await adminDb.runTransaction(async tx => {
        const fresh = await tx.get(orderRef);
        const data = fresh.data() ?? {};
        if (!['paid', 'preparing'].includes(data.status)) return false;
        const lockAt = (data.delivery as { dispatchLockAt?: number } | undefined)?.dispatchLockAt ?? 0;
        if (Date.now() - lockAt < LOCK_MS) return false;
        tx.update(orderRef, { 'delivery.dispatchLockAt': Date.now() });
        return true;
      });
      if (!locked) {
        return NextResponse.json({ error: 'Este pedido já está sendo despachado. Atualize a página em instantes.' }, { status: 409 });
      }

      let uberDelivery: Awaited<ReturnType<typeof uberCreateDelivery>>;
      try {
      uberDelivery = await uberCreateDelivery({
        orderId:             orderId,
        pickupName:          settings.storeName || 'Mikma Lençóis',
        pickupAddress,
        pickupPhoneNumber:   formatPhone(settings.storePhone || '47000000000'),
        dropoffName:         customerName,
        dropoffAddress,
        dropoffPhoneNumber:  customerPhone,
        manifestItems,
        manifestTotalValue:  order.totalCents,
        // Usa a cotação FRESCA feita agora mesmo (linhas acima), não a do
        // checkout, essa já expirou. Garante que o valor cobrado é
        // exatamente o que acabamos de checar contra a margem tolerada.
        quoteId:             freshQuoteId,
      }, uberSandbox);
      } catch (err) {
        await orderRef.update({ 'delivery.dispatchLockAt': FieldValue.delete() }).catch(() => {});
        throw err;
      }

      // Transação: o pedido pode ter sido cancelado durante a chamada à Uber
      // (2-10s). Antes o update cego trazia de volta um pedido cancelado,
      // com o estoque já devolvido e um motoboy a caminho.
      const uberOrderRef = adminDb.collection('orders').doc(orderId);
      const stillDispatchable = await adminDb.runTransaction(async tx => {
        const fresh = await tx.get(uberOrderRef);
        if (['paid', 'preparing'].includes(fresh.data()?.status)) return true;
        tx.update(uberOrderRef, { 'delivery.dispatchLockAt': FieldValue.delete() });
        return false;
      });
      if (!stillDispatchable) {
        try { await uberCancelDelivery(uberDelivery.deliveryId, 'other', 'Pedido cancelado durante o despacho', uberSandbox); }
        catch (err) { console.error('[delivery] corrida Uber órfã não cancelada:', uberDelivery.deliveryId, err); }
        return NextResponse.json({ error: 'O pedido foi cancelado enquanto o motoboy era chamado. A corrida foi cancelada.' }, { status: 409 });
      }

      await uberOrderRef.update({
        status: 'shipped',
        'delivery.carrier':               'uber_direct',
        'delivery.uberDirectDeliveryId':  uberDelivery.deliveryId,
        'delivery.uberSandbox':           uberSandbox,
        'delivery.trackingUrl':           uberDelivery.trackingUrl,
        'delivery.trackingCode':          null,
        'delivery.dispatchedAt':          FieldValue.serverTimestamp(),
        'delivery.dispatchLockAt':        FieldValue.delete(),
        updatedAt:                        FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({
          status: 'shipped',
          at:     new Date().toISOString(),
          note:   overspendCents > marginCents
            ? `Despachado via Uber Direct · status: ${uberDelivery.status} · ATENÇÃO: custo R$ ${(currentFeeCents/100).toFixed(2)} acima do frete cobrado (R$ ${(chargedCents/100).toFixed(2)}), confirmado manualmente pelo vendedor (diferença R$ ${(overspendCents/100).toFixed(2)})`
            : `Despachado via Uber Direct · status: ${uberDelivery.status}`,
        }),
      });

      // Registra o custo real no caixa de frete (best-effort, nunca trava o despacho já feito)
      try { await recordShippingSpent(uberDelivery.feeCents); }
      catch (err) { console.warn(`[shipping-ledger] falha ao registrar gasto Uber do pedido ${orderId}:`, err); }

      return NextResponse.json({
        carrier:     'uber_direct',
        deliveryId:  uberDelivery.deliveryId,
        trackingUrl: uberDelivery.trackingUrl,
        feeCents:    uberDelivery.feeCents,
        labelUrl:    null,
      });
    }

    // ── Correios / Jadlog: despacho manual ──────────────────────────────────
    // A compra automática de etiqueta pelo Melhor Envio foi removida (exigia
    // saldo pré-pago na conta deles). Agora o lojista posta na agência e
    // informa o código de rastreio no painel, que usa
    // /api/orders/[id]/update-status pra marcar como despachado.
    return NextResponse.json(
      { error: 'Envios por Correios/Jadlog são despachados informando o código de rastreio no painel.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[delivery/dispatch]', err);
    return NextResponse.json({ error: 'Erro ao despachar o pedido. Tente novamente.' }, { status: 500 });
  }
}

/**
 * DELETE /api/delivery
 * Cancela uma entrega já despachada (Uber Direct é cancelado na Uber;
 * Correios/Jadlog manual só volta de status). Apenas seller/admin.
 *
 * Reverte o pedido para
 * 'preparing' (volta pra fila de despacho) e limpa os dados de
 * entrega, deixando o seller livre para redespachar com outro
 * carrier ou corrigir o que precisar.
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true);
    if (!['seller', 'admin'].includes((decoded as { role?: string }).role ?? '')) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const ip    = getClientIp(req);
    const rlKey = `delivery-cancel:${ip}`;
    if (!await rateLimit(rlKey, 30, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(rlKey));

    const parsedBody = await validateBody(req, cancelDeliverySchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { orderId, reason } = parsedBody.data;

    const orderSnap = await adminDb.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

    const order = { id: orderSnap.id, ...orderSnap.data() } as Order;

    if (order.status !== 'shipped') {
      return NextResponse.json(
        { error: `Só é possível cancelar entregas com status "shipped" (atual: "${order.status}")` },
        { status: 409 }
      );
    }

    const uberDirectDeliveryId = order.delivery?.uberDirectDeliveryId;
    // Usa o ambiente em que a entrega foi DE FATO criada, não as settings
    // atuais, que podem ter sido trocadas no painel entre o despacho e agora.
    const uberSandboxAtDispatch = !!order.delivery?.uberSandbox;

    // ── Uber Direct ────────────────────────────────────────────────────────────────────────────
    if (uberDirectDeliveryId) {
      try {
        await uberCancelDelivery(uberDirectDeliveryId, 'customer_called_to_cancel', undefined, uberSandboxAtDispatch);
      } catch (err) {
        console.error('[delivery/cancel] uberCancelDelivery falhou:', err);
        return NextResponse.json(
          { error: 'Não foi possível cancelar a entrega no Uber Direct. Verifique o status no painel do Uber antes de tentar novamente.' },
          { status: 502 }
        );
      }
    }

    // Correios/Jadlog (despacho manual) e retirada não têm nada a cancelar
    // fora daqui: só volta o pedido pra fila de despacho.

    await adminDb.collection('orders').doc(orderId).update({
      status: 'preparing',
      // Volta pra transportadora que o cliente escolheu. Antes ficava null e
      // o novo despacho saía sem nome de transportadora nem link de rastreio
      // (e-mail, página do pedido) e fora do caixa de frete.
      'delivery.carrier': (order as unknown as { selectedShipping?: { carrier?: string } }).selectedShipping?.carrier ?? null,
      'delivery.trackingCode':         null,
      'delivery.trackingUrl':          null,
      'delivery.melhorEnvioOrderId':   null,
      'delivery.uberDirectDeliveryId': null,
      'delivery.labelUrl':             null,
      'delivery.dispatchedAt':         null,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: 'delivery_cancelled',
        at:    new Date().toISOString(),
        note:  `Entrega cancelada por ${decoded.email ?? decoded.uid} · Motivo: ${reason}`,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[delivery/cancel]', err);
    return NextResponse.json({ error: 'Erro ao cancelar a entrega. Tente novamente.' }, { status: 500 });
  }
}
