/**
 * POST /api/shipping/webhook
 * Webhook do Melhor Envio para atualização de rastreio automático.
 *
 * Configurado em: Melhor Envio → Gerenciar → Webhooks → Novo Webhook
 * URL cadastrada: https://mikma.com.br/api/shipping/webhook
 *
 * Autenticidade: o Melhor Envio assina o corpo bruto da requisição com
 * HMAC-SHA256 usando o MELHOR_ENVIO_TOKEN como chave e envia o resultado
 * (em base64) no header X-ME-Signature.
 *
 * Eventos possíveis (prefixo "order."): created, pending, released,
 * generated, received, posted, delivered, cancelled, undelivered,
 * paused, suspended.
 *
 * O Melhor Envio faz uma requisição de teste ao cadastrar o webhook para
 * confirmar que a URL responde 2xx. Esse ping pode chegar sem payload
 * real ou sem assinatura — respondemos 200 sem processar nada.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { mePayloadSchema } from './schema';


interface MEOrderEventData {
  id: string;               // ID do envio no ME (= delivery.melhorEnvioOrderId)
  protocol: string;
  status: string;
  tracking: string | null;
  tracking_url?: string | null;
}

interface MEWebhookPayload {
  event: string;            // ex: "order.posted"
  data: MEOrderEventData;
}

// Mapeia o evento ME → status interno do pedido.
// Eventos não listados (created, pending, paused, suspended) só registram
// na timeline sem alterar o status do pedido.
const STATUS_MAP: Record<string, string> = {
  released:    'shipped',    // etiqueta comprada, aguardando postagem
  generated:   'shipped',    // etiqueta gerada (PDF disponível)
  posted:      'shipped',    // postado na transportadora
  received:    'shipped',    // recebido em centro de distribuição
  delivered:   'delivered',  // entregue ao destinatário
  undelivered: 'shipped',    // tentativa de entrega malsucedida
  cancelled:   'cancelled',
};

// Legenda legível para exibir na timeline
const EVENT_LABEL: Record<string, string> = {
  created:     'Envio criado',
  pending:     'Aguardando pagamento',
  released:    'Etiqueta paga — aguardando postagem',
  generated:   'Etiqueta gerada',
  posted:      'Postado na transportadora',
  received:    'Recebido em centro de distribuição',
  delivered:   'Entregue',
  undelivered: 'Tentativa de entrega sem sucesso',
  cancelled:   'Envio cancelado',
  paused:      'Envio pausado',
  suspended:   'Envio suspenso',
};

function verifySignature(rawBody: string, signature: string | null): boolean {
  // O Melhor Envio usa o token da conta (Bearer token) como chave HMAC.
  const secret = process.env.MELHOR_ENVIO_TOKEN;
  if (!secret || !signature) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Defesa contra flood — o Melhor Envio manda poucos eventos por minuto
  // em operação normal; isso só protege contra abuso/DoS na URL pública.
  const ip = getClientIp(req);
  if (!rateLimit(`me-webhook-ip:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-me-signature');

  // Tenta parsear — ping de teste pode chegar vazio ou como "{}"
  let payload: Partial<MEWebhookPayload> = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    // JSON inválido: provavelmente ping de cadastro — responde 200
    return NextResponse.json({ ok: true, note: 'invalid-json' });
  }

  // Ping de teste: sem event ou sem data.id — responde 200 sem processar
  if (!payload.event || !payload.data?.id) {
    return NextResponse.json({ ok: true, note: 'no-op' });
  }

  // Evento real — valida assinatura
  if (!verifySignature(rawBody, signature)) {
    console.warn('[shipping/webhook] assinatura inválida ou ausente', { signature: signature?.slice(0, 20) });
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
  }

  const validated = mePayloadSchema.safeParse(payload);
  if (!validated.success) {
    console.warn('[shipping/webhook] payload inválido:', validated.error.issues[0]?.message);
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const { event, data } = validated.data;
  const meEvent = event.startsWith('order.') ? event.slice('order.'.length) : event;
  const { id: meOrderId, tracking, tracking_url: trackingUrl } = data;

  console.info(`[shipping/webhook] evento=${meEvent} meOrderId=${meOrderId} tracking=${tracking ?? '-'}`);

  try {
    const snap = await adminDb
      .collection('orders')
      .where('delivery.melhorEnvioOrderId', '==', meOrderId)
      .limit(1)
      .get();

    if (snap.empty) {
      // Etiqueta gerada fora do sistema ou em sandbox — ignora silenciosamente
      console.warn(`[shipping/webhook] meOrderId=${meOrderId} não encontrado nos pedidos`);
      return NextResponse.json({ ok: true, note: 'order not found' });
    }

    const orderDoc = snap.docs[0];
    const newStatus = STATUS_MAP[meEvent];

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (newStatus)    update.status = newStatus;
    if (tracking)     update['delivery.trackingCode'] = tracking;
    if (trackingUrl)  update['delivery.trackingUrl'] = trackingUrl;
    if (meEvent === 'delivered') {
      update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
    }

    // Timeline usa o mesmo formato que update-status/route.ts (campo "status")
    const label = EVENT_LABEL[meEvent] ?? meEvent;
    const timelineEvent = {
      status: newStatus ?? 'shipped',   // status interno compatível com OrderStatus
      at: new Date().toISOString(),
      note: `Melhor Envio: ${label}${tracking ? ` · ${tracking}` : ''}`,
    };

    await orderDoc.ref.update({
      ...update,
      timeline: FieldValue.arrayUnion(timelineEvent),
    });

    console.info(`[shipping/webhook] pedido ${orderDoc.id} atualizado → status=${newStatus ?? '(sem mudança)'}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[shipping/webhook] erro interno:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
