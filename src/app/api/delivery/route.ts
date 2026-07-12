/**
 * POST /api/delivery
 * Despacha um pedido via Melhor Envio:
 * 1. Monta endereços remetente/destinatário
 * 2. Adiciona ao carrinho ME → compra → gera etiqueta → obtém PDF
 * 3. Atualiza order no Firestore com status 'shipped' + URL da etiqueta
 * 4. Retorna { labelUrl, trackingCode, meOrderId }
 *
 * Para retirada na loja: apenas avança o status para 'shipped'
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, validateBody } from '@/lib/security';
import { z } from 'zod';
import type { Order } from '@/types';

const dispatchSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  carrier: z.string().trim().min(1).max(60).optional(),
});

const cancelDeliverySchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(500),
});
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';
import {
  meDispatch,
  meCancel,
  meBalance,
  ME_SERVICES,
  type MEAddress,
  type MEProduct,
  type MEPackage,
} from '@/lib/melhorenvio';
import { recordShippingSpent } from '@/lib/shipping-ledger';
import {
  uberCreateDelivery,
  uberCancelDelivery,
  uberDirectConfigured,
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
    if (!rateLimit(rlKey, 30, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(rlKey));

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

    // Prioridade: body (painel) → selectedShipping (escolha do cliente) → delivery.carrier → fallback
    const orderAny = order as unknown as { selectedShipping?: { carrier?: string } };
    const carrier = bodyCarrier
      ?? orderAny.selectedShipping?.carrier
      ?? order.delivery?.carrier
      ?? 'correios_pac';

    // ── Retirada na loja: sem Melhor Envio ──────────────────────────────────
    if (carrier === 'pickup') {
      await adminDb.collection('orders').doc(orderId).update({
        status: 'shipped',
        'delivery.carrier': 'pickup',
        'delivery.trackingCode': null,
        'delivery.dispatchedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({
          status: 'shipped',
          at: new Date().toISOString(),
          note: 'Cliente retirou na loja',
        }),
      });
      return NextResponse.json({ carrier: 'pickup', trackingCode: null, labelUrl: null });
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

      // manifest_items é OBRIGATÓRIO — array com cada item do pedido
      const manifestItems: UberManifestItem[] = order.items.map(i => ({
        name:     `${i.productName}${i.variant ? ` (${i.variant.size} ${i.variant.colorName ?? i.variant.color})` : ''}`.slice(0, 80),
        quantity: i.quantity,
        size:     'medium' as const,
        price:    i.unitPrice,
      }));

      const uberDelivery = await uberCreateDelivery({
        orderId:             orderId,
        pickupName:          settings.storeName || 'Mikma Lençóis',
        pickupAddress,
        pickupPhoneNumber:   formatPhone(settings.storePhone || '47000000000'),
        dropoffName:         customerName,
        dropoffAddress,
        dropoffPhoneNumber:  customerPhone,
        manifestItems,
        manifestTotalValue:  order.totalCents,
        // Garante o preço cotado — evita divergência se a tarifa mudar entre cotação e despacho
        quoteId:             order.delivery?.uberQuoteId,
      }, uberSandbox);

      await adminDb.collection('orders').doc(orderId).update({
        status: 'shipped',
        'delivery.carrier':               'uber_direct',
        'delivery.uberDirectDeliveryId':  uberDelivery.deliveryId,
        'delivery.uberSandbox':           uberSandbox,
        'delivery.trackingUrl':           uberDelivery.trackingUrl,
        'delivery.trackingCode':          null,
        'delivery.dispatchedAt':          FieldValue.serverTimestamp(),
        updatedAt:                        FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({
          status: 'shipped',
          at:     new Date().toISOString(),
          note:   `Despachado via Uber Direct · status: ${uberDelivery.status}`,
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

    // ── Envio via Melhor Envio ───────────────────────────────────────────────
    if (!process.env.MELHOR_ENVIO_TOKEN) {
      return NextResponse.json(
        { error: 'MELHOR_ENVIO_TOKEN não configurado. Configure em Configurações, Entrega.' },
        { status: 500 }
      );
    }

    const serviceId = ME_SERVICES[carrier];
    if (!serviceId) {
      return NextResponse.json(
        { error: `Carrier "${carrier}" não suportado pelo Melhor Envio. Use: ${Object.keys(ME_SERVICES).join(', ')}` },
        { status: 400 }
      );
    }

    // Monta dados do remetente (sua loja)
    const storeCnpj = (settings.storeCnpj ?? '').replace(/\D/g, '');
    const from: MEAddress = {
      name:             settings.storeName || 'Mikma Lençóis',
      phone:            (settings.storePhone || '').replace(/\D/g, '').slice(0, 11),
      email:            settings.storeEmail || 'contato@mikma.com.br',
      document:         storeCnpj.length === 14 ? storeCnpj : storeCnpj,
      company_document: storeCnpj.length === 14 ? storeCnpj : undefined,
      address:          settings.storeAddress || '',
      number:           settings.storeNumber || 'S/N',
      complement:       settings.storeComplement || '',
      district:         settings.storeNeighborhood || '',
      city:             settings.storeCity?.split(',')[0].trim() || '',
      country_id:       'BR',
      postal_code:      (settings.originCep || '').replace(/\D/g, ''),
      state_abbr:       settings.storeState || 'SC',
    };

    // Monta dados do destinatário (cliente)
    const addr = order.address;
    if (!addr?.cep || !addr?.street) {
      return NextResponse.json({ error: 'Endereço do cliente incompleto' }, { status: 400 });
    }

    // Busca dados do cliente
    const userSnap = await adminDb.collection('users').doc(order.userId).get();
    const userData = userSnap.data() ?? {};
    const cpf = (userData.cpf ?? '').replace(/\D/g, '');

    // Email com fallback para Auth (igual ao webhook)
    let customerEmail = (userData.email as string | undefined) ?? '';
    if (!customerEmail) {
      try {
        const authUser = await adminAuth.getUser(order.userId);
        customerEmail = authUser.email ?? '';
      } catch {
        console.warn(`[delivery] não foi possível obter email do Auth para uid=${order.userId}`);
      }
    }

    const to: MEAddress = {
      name:        userData.name || 'Cliente',
      phone:       (userData.phone || '').replace(/\D/g, '').slice(0, 11) || '47999999999',
      email:       customerEmail,
      document:    cpf || '00000000000', // CPF obrigatório no ME
      address:     addr.street,
      number:      addr.number || 'S/N',
      complement:  addr.complement || '',
      district:    addr.neighborhood || '',
      city:        addr.city,
      country_id:  'BR',
      postal_code: addr.cep.replace(/\D/g, ''),
      state_abbr:  addr.state,
    };

    // Monta produtos
    const products: MEProduct[] = order.items.map(item => ({
      name:           item.productName.slice(0, 50),
      quantity:       item.quantity,
      unitary_value:  item.unitPrice / 100,
    }));

    // Busca pesos individuais dos produtos no Firestore
    const productIds = Array.from(new Set(order.items.map(i => i.productId)));
    const productDocs = await Promise.all(productIds.map(id => adminDb.collection('products').doc(id).get()));
    const productWeightMap: Record<string, number> = {};
    for (const snap of productDocs) {
      if (snap.exists) {
        productWeightMap[snap.id] = (snap.data()!.weightKg as number | undefined) ?? (settings.defaultItemWeightKg || 0.8);
      }
    }

    // Monta pacote (peso e dimensões)
    const totalWeightKg = order.items.reduce(
      (acc, i) => acc + (productWeightMap[i.productId] ?? settings.defaultItemWeightKg ?? 0.8) * i.quantity,
      0
    );

    const volumes: MEPackage[] = [{
      weight: Math.max(0.3, totalWeightKg),
      width:  40,
      height: 20,
      length: 50,
    }];

    const insuranceValue = order.totalCents / 100;

    // ── Trava de segurança: confere saldo real na Melhor Envio antes de
    // comprar a etiqueta. Nunca deixa a compra ser tentada sem saldo — evita
    // conta negativa e falha no meio do fluxo. Isso é 100% interno: o
    // cliente já pagou, essa checagem não aparece pra ele em nenhum momento,
    // só bloqueia o botão de despacho no painel do seller.
    const expectedCostCents = order.delivery?.realPriceCents ?? order.delivery?.priceCents ?? 0;
    if (expectedCostCents > 0) {
      try {
        const balanceCents = await meBalance();
        // 5% de margem de segurança pra repesagem/variação de tarifa
        const requiredCents = Math.ceil(expectedCostCents * 1.05);
        if (balanceCents < requiredCents) {
          return NextResponse.json(
            {
              error: `Saldo insuficiente na Melhor Envio (R$ ${(balanceCents / 100).toFixed(2)} disponível, R$ ${(expectedCostCents / 100).toFixed(2)} necessário). Adicione saldo em melhorenvio.com.br antes de despachar.`,
            },
            { status: 402 }
          );
        }
      } catch (err) {
        console.error('[delivery] falha ao consultar saldo Melhor Envio, bloqueando despacho por segurança:', err);
        return NextResponse.json(
          { error: 'Não foi possível confirmar o saldo na Melhor Envio agora. Tente novamente em instantes.' },
          { status: 502 }
        );
      }
    }

    // ── Despacha via Melhor Envio ────────────────────────────────────────────
    const { meOrderId, trackingCode, labelUrl } = await meDispatch({
      serviceId,
      orderId,
      from,
      to,
      products,
      volumes,
      insuranceValue,
    });

    // Registra o custo real no caixa de frete (best-effort, nunca desfaz o despacho já feito)
    try { await recordShippingSpent(expectedCostCents); }
    catch (err) { console.warn(`[shipping-ledger] falha ao registrar gasto ME do pedido ${orderId}:`, err); }

    // ── Atualiza pedido no Firestore ─────────────────────────────────────────
    await adminDb.collection('orders').doc(orderId).update({
      status: 'shipped',
      'delivery.carrier':          carrier,
      'delivery.trackingCode':     trackingCode,
      'delivery.melhorEnvioOrderId': meOrderId,
      'delivery.labelUrl':         labelUrl,
      'delivery.dispatchedAt':     FieldValue.serverTimestamp(),
      updatedAt:                   FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: 'shipped',
        at:    new Date().toISOString(),
        note:  `Despachado via Melhor Envio · ${carrier} · ${trackingCode ?? 'sem rastreio ainda'}`,
      }),
    });

    return NextResponse.json({ carrier, trackingCode, meOrderId, labelUrl });
  } catch (err) {
    console.error('[delivery/dispatch]', err);
    return NextResponse.json({ error: 'Erro ao despachar o pedido. Tente novamente.' }, { status: 500 });
  }
}

/**
 * DELETE /api/delivery
 * Cancela uma entrega já despachada via Melhor Envio.
 * Apenas seller/admin — nunca o cliente.
 *
 * Cancela a etiqueta no Melhor Envio, reverte o pedido para
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
    if (!rateLimit(rlKey, 30, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(rlKey));

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

    const meOrderId           = order.delivery?.melhorEnvioOrderId;
    const uberDirectDeliveryId = order.delivery?.uberDirectDeliveryId;
    // Usa o ambiente em que a entrega foi DE FATO criada — não as settings
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

    // ── Melhor Envio — Retirada na loja não tem nada a cancelar ─────────────────────────
    if (meOrderId) {
      try {
        await meCancel(meOrderId, `Cancelado pelo vendedor: ${reason}`);
      } catch (err) {
        console.error('[delivery/cancel] meCancel falhou:', err);
        return NextResponse.json(
          { error: 'Não foi possível cancelar a etiqueta no Melhor Envio. Verifique o status diretamente no painel deles antes de tentar novamente.' },
          { status: 502 }
        );
      }
    }

    await adminDb.collection('orders').doc(orderId).update({
      status: 'preparing',
      'delivery.carrier':              null,
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
