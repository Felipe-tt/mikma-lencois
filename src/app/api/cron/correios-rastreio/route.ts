import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { deliveredAt, postedAt, trackObjects } from '@/lib/correiosRastro';
import { advanceOrderStatus, StatusError } from '@/lib/orders/advanceStatus';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { notifySeller } from '@/lib/push/notifySeller';
import type { Order, ReturnRequest } from '@/types';
import type { ReversaInfo } from '@/lib/correiosReversa';

/**
 * Acompanha os pedidos dos Correios pelo rastreio do contrato, sem ninguém
 * precisar clicar:
 * - "Separando" com etiqueta gerada no painel: quando os Correios pegam o
 *   pacote (coleta ou postagem), o pedido vira "Enviado" e o cliente recebe
 *   o e-mail com o código.
 * - "Enviado": quando o pacote é entregue, vira "Entregue".
 * Chamado a cada 30 minutos pelo Worker de rotinas (workers/cron).
 */
type CorreiosOrder = Order & { delivery: Order['delivery'] & { prePostagem?: { codigoObjeto?: string } } };

const CARRIERS = new Set(['correios_pac', 'correios_sedex']);

function authorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  return !!secret && !!expected && secret.length === expected.length && timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await adminDb.collection('orders').where('status', 'in', ['preparing', 'shipped']).limit(500).get();
  const orders = snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as CorreiosOrder)
    .filter(o => CARRIERS.has(o.delivery?.carrier ?? ''));

  // Código de cada pedido: o da etiqueta gerada no painel (separando) ou o
  // informado no despacho (enviado).
  const codeOf = (o: CorreiosOrder) => (o.status === 'preparing' ? o.delivery.prePostagem?.codigoObjeto : o.delivery.trackingCode)?.trim().toUpperCase() ?? '';
  const tracked = orders.filter(o => codeOf(o));
  // Devoluções com código dos Correios ainda a caminho da loja.
  const retSnap = await adminDb.collection('returns').where('status', '==', 'aprovada').limit(200).get();
  const devolucoes = retSnap.docs
    .map(d => ({ id: d.id, ...d.data() }) as ReturnRequest & { reversa?: ReversaInfo })
    .filter(r => r.reversa?.codigoObjeto && !r.reversa.entregueEm);
  const result = { checked: tracked.length + devolucoes.length, shipped: 0, delivered: 0, returned: 0, errors: 0 };
  // Registro da última rodada: a checagem diária (correios-cws.yml) avisa
  // se a rotina parar de rodar (Worker fora do ar, segredo trocado...).
  const done = async (body: typeof result & { error?: string }, status = 200) => {
    await adminDb.collection('ops').doc('correios-rastreio').set({ lastRunAt: new Date().toISOString(), ...body }).catch(() => {});
    return NextResponse.json(body, { status });
  };
  if (!result.checked) return done(result);

  let objects;
  try {
    objects = await trackObjects([...tracked.map(codeOf), ...devolucoes.map(r => r.reversa!.codigoObjeto)]);
  } catch (err) {
    console.error('[correios-rastreio]', err);
    return done({ ...result, error: 'rastreio dos Correios indisponível' }, 502);
  }

  for (const o of tracked) {
    const code = codeOf(o);
    const sro = objects.get(code);
    try {
      if (o.status === 'preparing' && postedAt(sro)) {
        await advanceOrderStatus(o.id, { fromStatus: 'preparing', trackingCode: code, note: 'Recebido pelos Correios' });
        result.shipped++;
        const short = o.id.slice(-8).toUpperCase();
        await notifyInApp({ type: 'correios_pickup', message: `Os Correios pegaram o pedido ${short} (${code}). O cliente recebeu o rastreio.`, orderId: o.id });
        await notifySeller({ title: 'Pedido com os Correios', body: `#${short} · ${code} · o cliente recebeu o rastreio`, url: `/painel/pedidos/${o.id}`, data: { orderId: o.id, event: 'correios_pickup' } });
      } else if (o.status === 'shipped' && deliveredAt(sro)) {
        await advanceOrderStatus(o.id, { fromStatus: 'shipped', note: 'Entregue pelos Correios' });
        result.delivered++;
      }
    } catch (err) {
      // 409: alguém mexeu no pedido no meio (ou está segurado): fica para a
      // próxima rodada, sem barulho.
      if (!(err instanceof StatusError && err.status === 409)) {
        result.errors++;
        console.error(`[correios-rastreio] pedido ${o.id}:`, err);
      }
    }
  }
  for (const r of devolucoes) {
    const chegou = deliveredAt(objects.get(r.reversa!.codigoObjeto.toUpperCase()));
    if (!chegou) continue;
    try {
      await adminDb.collection('returns').doc(r.id).update({ 'reversa.entregueEm': chegou, updatedAt: new Date().toISOString() });
      result.returned++;
      const short = r.orderId.slice(-8).toUpperCase();
      await notifyInApp({ type: 'correios_pickup', message: `A devolução do pedido ${short} chegou na loja pelos Correios. Confira as peças e conclua a troca.`, orderId: r.orderId });
      await notifySeller({ title: 'Devolução chegou', body: `#${short} · confira as peças e conclua a troca`, url: '/painel/trocas', data: { orderId: r.orderId, event: 'correios_return' } });
    } catch (err) {
      result.errors++;
      console.error(`[correios-rastreio] devolução ${r.id}:`, err);
    }
  }
  return done(result);
}
