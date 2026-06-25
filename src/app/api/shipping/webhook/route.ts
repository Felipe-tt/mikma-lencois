/**
 * POST /api/shipping/webhook
 * Webhook do Melhor Envio para atualização de rastreio.
 *
 * Configurado em: Melhor Envio → Integrações → Área Dev. → seu app → Novo Webhook
 * URL cadastrada: https://mikma.com.br/api/shipping/webhook
 *
 * IMPORTANTE: as etiquetas só disparam webhook se forem geradas pelo MESMO
 * aplicativo (mesmo Client ID/Secret) onde esse webhook está cadastrado —
 * etiquetas criadas direto no site do Melhor Envio ou por outro app, mesmo
 * na mesma conta, não chegam aqui. https://docs.melhorenvio.com.br/docs/webhooks
 *
 * Autenticidade: o Melhor Envio assina o corpo bruto da requisição com
 * HMAC-SHA256 usando o CLIENT SECRET DO APLICATIVO como chave (não existe
 * um "webhook secret" separado), e envia o resultado no header
 * X-ME-Signature. Validamos recalculando o mesmo hash e comparando.
 *
 * Eventos reais (prefixo "order."): created, pending, released, generated,
 * received, posted, delivered, cancelled, undelivered, paused, suspended.
 *
 * O Melhor Envio também faz uma chamada de teste ao cadastrar/editar o
 * webhook para confirmar que a URL responde 2xx — essa chamada de teste
 * não necessariamente tem um payload de evento real assinável, então
 * respondemos 200 a qualquer requisição bem formada, mesmo sem reconhecer
 * o evento, e só agimos sobre os eventos que de fato conhecemos.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

interface MEOrderEventData {
  id: string;               // ID do envio no ME (= delivery.melhorEnvioOrderId salvo)
  protocol: string;
  status: string;
  tracking: string | null;
  tracking_url?: string | null;
}

interface MEWebhookPayload {
  event: string;             // ex: "order.posted"
  data: MEOrderEventData;
}

// Mapeia o status do evento (sem o prefixo "order.") para o status interno do pedido.
const STATUS_MAP: Record<string, string> = {
  released:    'shipped',    // etiqueta paga, aguardando postagem
  generated:   'shipped',    // etiqueta gerada
  posted:      'shipped',    // postado na transportadora
  received:    'shipped',    // recebido em ponto de distribuição
  delivered:   'delivered',  // entregue
  undelivered: 'shipped',    // tentativa sem sucesso — mantém shipped
  cancelled:   'cancelled',
  // created, pending, paused, suspended: não alteram o status do pedido,
  // só registram na timeline.
};

function verifySignature(rawBody: string, signature: string | null): boolean {
  const clientSecret = process.env.MELHOR_ENVIO_CLIENT_SECRET;
  if (!clientSecret || !signature) return false;
  try {
    const expected = createHmac('sha256', clientSecret).update(rawBody, 'utf8').digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-me-signature');

  let payload: Partial<MEWebhookPayload>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Corpo vazio/não-JSON: provavelmente o ping de teste do cadastro do
    // webhook. Responde 200 para não falhar o cadastro (E-WBH-0002).
    return NextResponse.json({ ok: true });
  }

  // Só processa eventos de etiqueta de verdade (event + data.id presentes).
  // Qualquer outra coisa (ping de teste, payload vazio) recebe 200 sem ação.
  if (!payload.event || !payload.data?.id) {
    return NextResponse.json({ ok: true, note: 'no-op' });
  }

  // A partir daqui é um evento real — exige assinatura válida.
  if (!verifySignature(rawBody, signature)) {
    console.warn('[shipping/webhook] assinatura inválida ou ausente');
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
  }

  const { event, data } = payload as MEWebhookPayload;
  const status = event.startsWith('order.') ? event.slice('order.'.length) : event;
  const { id: meOrderId, tracking, tracking_url: trackingUrl } = data;

  try {
    const snap = await adminDb
      .collection('orders')
      .where('delivery.melhorEnvioOrderId', '==', meOrderId)
      .limit(1)
      .get();

    if (snap.empty) {
      // Pedido não encontrado (pode ser etiqueta de teste/sandbox antiga) — ignora.
      return NextResponse.json({ ok: true, note: 'order not found' });
    }

    const orderDoc = snap.docs[0];
    const newStatus = STATUS_MAP[status];

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (newStatus) update.status = newStatus;
    if (tracking) update['delivery.trackingCode'] = tracking;
    if (trackingUrl) update['delivery.trackingUrl'] = trackingUrl;
    if (status === 'delivered') update['delivery.deliveredAt'] = FieldValue.serverTimestamp();

    const timelineEvent = {
      event: status,
      at: new Date().toISOString(),
      note: `Melhor Envio: ${status}${tracking ? ` · ${tracking}` : ''}`,
    };

    await orderDoc.ref.update({
      ...update,
      timeline: FieldValue.arrayUnion(timelineEvent),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[shipping/webhook]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
