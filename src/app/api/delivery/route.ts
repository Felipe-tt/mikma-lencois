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
import { getClientIp, tooManyRequests } from '@/lib/security';
import type { Order } from '@/types';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';
import {
  meDispatch,
  ME_SERVICES,
  type MEAddress,
  type MEProduct,
  type MEPackage,
} from '@/lib/melhorenvio';

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

    const body = await req.json().catch(() => null);
    const orderId: string = body?.orderId;
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'orderId inválido' }, { status: 400 });
    }

    const [orderSnap, settings] = await Promise.all([
      adminDb.collection('orders').doc(orderId).get(),
      getStoreSettings(),
    ]);

    if (!orderSnap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

    const order = { id: orderSnap.id, ...orderSnap.data() } as Order;

    if (!['paid', 'preparing'].includes(order.status)) {
      return NextResponse.json({ error: `Pedido não pode ser despachado no status "${order.status}"` }, { status: 409 });
    }

    const carrier = order.delivery?.carrier ?? body?.carrier ?? 'correios_pac';

    // ── Retirada na loja: sem Melhor Envio ──────────────────────────────────
    if (carrier === 'pickup') {
      await adminDb.collection('orders').doc(orderId).update({
        status: 'shipped',
        'delivery.carrier': 'pickup',
        'delivery.trackingCode': null,
        'delivery.dispatchedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({
          event: 'shipped',
          at: new Date().toISOString(),
          note: 'Cliente retirou na loja',
        }),
      });
      return NextResponse.json({ carrier: 'pickup', trackingCode: null, labelUrl: null });
    }

    // ── Envio via Melhor Envio ───────────────────────────────────────────────
    if (!process.env.MELHOR_ENVIO_TOKEN) {
      return NextResponse.json(
        { error: 'MELHOR_ENVIO_TOKEN não configurado. Configure em Configurações → Entrega.' },
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
    const cpf = (userData.cpf ?? order.customer?.cpf ?? '').replace(/\D/g, '');

    const to: MEAddress = {
      name:        order.customer?.name || userData.name || 'Cliente',
      phone:       (order.customer?.phone || userData.phone || '').replace(/\D/g, '').slice(0, 11) || '47999999999',
      email:       order.customer?.email || userData.email || '',
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

    // Monta pacote (peso e dimensões)
    const totalWeightKg = order.items.reduce(
      (acc, i) => acc + (settings.defaultItemWeightKg || 0.8) * i.quantity,
      0
    );

    const volumes: MEPackage[] = [{
      weight: Math.max(0.3, totalWeightKg),
      width:  40,
      height: 20,
      length: 50,
    }];

    const insuranceValue = order.totalCents / 100;

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
        event: 'shipped',
        at:    new Date().toISOString(),
        note:  `Despachado via Melhor Envio · ${carrier} · ${trackingCode ?? 'sem rastreio ainda'}`,
      }),
    });

    return NextResponse.json({ carrier, trackingCode, meOrderId, labelUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    console.error('[delivery/dispatch]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
