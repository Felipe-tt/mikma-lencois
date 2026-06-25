/**
 * POST /api/shipping/webhook
 * Webhook do Melhor Envio para atualização de rastreio.
 *
 * Configurar em: https://melhorenvio.com.br/painel/gerenciar/tokens
 * URL: https://mikma.com.br/api/shipping/webhook
 *
 * Eventos relevantes:
 * - released: etiqueta gerada
 * - posted: postado nos Correios/Jadlog
 * - delivered: entregue ao destinatário
 * - undelivered: tentativa sem sucesso
 * - canceled: cancelado
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

interface MEWebhookPayload {
  order_id:     string;   // ID do envio no ME
  status:       string;   // released | posted | delivered | undelivered | canceled
  tracking:     string | null;
  tracking_url: string | null;
  message?:     string;
}

const STATUS_MAP: Record<string, string> = {
  released:    'shipped',    // etiqueta gerada, aguardando postagem
  posted:      'shipped',    // postado na transportadora
  delivered:   'delivered',  // entregue
  undelivered: 'shipped',    // tentativa sem sucesso — mantém shipped
  canceled:    'cancelled',
};

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-melhor-envio-secret');
    if (secret !== process.env.MELHOR_ENVIO_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: MEWebhookPayload = await req.json();
    const { order_id, status, tracking, tracking_url, message } = body;

    if (!order_id || !status) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    // Busca o pedido pelo meOrderId
    const snap = await adminDb
      .collection('orders')
      .where('delivery.melhorEnvioOrderId', '==', order_id)
      .limit(1)
      .get();

    if (snap.empty) {
      // Pode ser um pedido de outro sistema — ignora silenciosamente
      return NextResponse.json({ ok: true, note: 'order not found' });
    }

    const orderDoc = snap.docs[0];
    const newStatus = STATUS_MAP[status];

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (newStatus) update.status = newStatus;
    if (tracking)    update['delivery.trackingCode'] = tracking;
    if (tracking_url) update['delivery.trackingUrl'] = tracking_url;

    // Marca data de entrega
    if (status === 'delivered') {
      update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
    }

    // Adiciona à timeline
    const timelineEvent = {
      event: status,
      at:    new Date().toISOString(),
      note:  message ?? `Melhor Envio: ${status}${tracking ? ` · ${tracking}` : ''}`,
    };

    await orderDoc.ref.update({
      ...update,
      timeline: FieldValue.arrayUnion(timelineEvent),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[shipping/webhook]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
