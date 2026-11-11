import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { notifySeller } from '@/lib/push/notifySeller';
import { TROCA_FORA_DO_PRAZO, devolucaoPadrao, motivoFinal, opcoesDevolucao, returnWindow } from '@/lib/returnRequest';
import { getSettings } from '@/lib/settings';
import { calcularTroca } from '@/lib/returns/reenvio';
import { novosSchema } from '@/lib/returns/novosSchema';
import type { Order, ReturnItem } from '@/types';

/**
 * POST /api/orders/[orderId]/troca: o próprio cliente pede troca ou
 * devolução de um pedido entregue (dentro do prazo da política). Cria a
 * solicitação em `returns` para a loja aprovar no painel. As peças voltam
 * do jeito que o pedido chegou (código dos Correios ou entregador da Uber)
 * ou o cliente entrega na loja.
 */
const schema = z.object({
  type: z.enum(['troca', 'devolucao']),
  /** Motivo pronto escolhido no pedido (MOTIVOS). */
  motivo: z.string().max(40).optional(),
  /** Texto do cliente: obrigatório só em "Outro...". */
  reason: z.string().trim().max(600),
  /** Defeito: até 90 dias, sem exigir peça sem uso. */
  defeito: z.boolean().optional(),
  /** Troca ou devolução comum: o cliente confirma que não lavou nem usou. */
  semUso: z.boolean().optional(),
  /** Fotos já enviadas pelo navegador para returns/{uid}/ (Storage). */
  fotos: z.array(z.string().max(200)).max(4).optional(),
  /** Por onde as peças voltam: o jeito da entrega (Correios ou Uber) ou a loja. */
  devolverPor: z.enum(['correios', 'uber', 'loja']).optional(),
  /** Troca: a peça que o cliente quer no lugar de cada uma devolvida. */
  novos: novosSchema.optional(),
  items: z.array(z.object({ sku: z.string().min(1).max(120), quantity: z.number().int().min(1).max(50) })).min(1).max(30),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(bearer.token, true)).uid;
  } catch {
    return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
  }
  if (!await rateLimit(`troca:${uid}`, 5, 60 * 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Tente de novo mais tarde.' }, { status: 429 });
  const parsed = await validateBody(req, schema, 24_576);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const order = { id: orderSnap.id, ...orderSnap.data() } as Order;
  if (order.userId !== uid) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const window = returnWindow(order);
  if (!window.ok) return NextResponse.json({ error: window.reason }, { status: 409 });
  const defeito = body.defeito === true;
  if (!defeito && !window.troca) return NextResponse.json({ error: TROCA_FORA_DO_PRAZO }, { status: 409 });
  if (!defeito && body.semUso !== true) return NextResponse.json({ error: 'Confirme que as peças não foram lavadas nem usadas.' }, { status: 400 });
  const motivo = motivoFinal(defeito ? 'defeito' : body.type, body.motivo, body.reason);
  if (!motivo.ok) return NextResponse.json({ error: motivo.error }, { status: 400 });

  const devolverPor = body.devolverPor ?? devolucaoPadrao(order);
  if (!opcoesDevolucao(order).includes(devolverPor)) return NextResponse.json({ error: 'Escolha como devolver as peças.' }, { status: 400 });

  const fotos = body.fotos ?? [];
  const pastaOk = new RegExp(`^returns/${uid.replace(/[^A-Za-z0-9_-]/g, '')}/[A-Za-z0-9_-]+\\.jpg$`);
  if (fotos.some(f => !pastaOk.test(f))) return NextResponse.json({ error: 'Foto inválida. Envie de novo.' }, { status: 400 });

  // Itens: só os do pedido, até a quantidade comprada.
  const items: ReturnItem[] = [];
  for (const it of body.items) {
    const bought = order.items.find(i => i.sku === it.sku);
    if (!bought) return NextResponse.json({ error: 'Esse item não é deste pedido.' }, { status: 400 });
    items.push({
      sku: bought.sku, productId: bought.productId, productName: bought.productName, variant: bought.variant,
      quantity: Math.min(it.quantity, bought.quantity),
      ...(bought.swapSku ? { swapSku: bought.swapSku, swapQtyPerUnit: bought.swapQtyPerUnit } : {}),
    });
  }

  // Troca: a peça nova, a diferença de preço e o frete do novo envio.
  let troca: Record<string, unknown> = {};
  if (body.type === 'troca') {
    const novos = body.novos ?? [];
    if (!novos.length || items.some(i => !novos.some(n => n.no === i.sku))) return NextResponse.json({ error: 'Escolha a peça nova de cada peça que vai trocar.' }, { status: 400 });
    if (novos.some(n => !items.some(i => i.sku === n.no))) return NextResponse.json({ error: 'Peça nova sem a peça devolvida correspondente.' }, { status: 400 });
    // Defeito: a mesma peça, sem defeito.
    if (defeito && novos.some(n => `${n.productId}_${n.variantId}` !== n.no)) return NextResponse.json({ error: 'No defeito, a troca é pela mesma peça.' }, { status: 400 });
    const r = await calcularTroca(order, items.map(i => ({ unitPrice: order.items.find(b => b.sku === i.sku)!.unitPrice, quantity: i.quantity })), novos, defeito, await getSettings());
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    const c = r.calculo;
    troca = {
      novos: c.novos.map((it, k) => ({ ...it, no: novos[k].no })),
      freteNovo: c.frete, freteCents: c.freteCents, diferencaCents: c.diferencaCents, saldoCents: c.saldoCents,
    };
  }

  // Uma solicitação em aberto por pedido.
  // (filtro do status aqui, sem índice composto: são poucas por pedido)
  const previous = await adminDb.collection('returns').where('orderId', '==', orderId).get();
  if (previous.docs.some(d => ['solicitada', 'aprovada'].includes(d.get('status')))) return NextResponse.json({ error: 'Já existe um pedido de troca em andamento para esta compra.' }, { status: 409 });

  const now = new Date().toISOString();
  const ref = await adminDb.collection('returns').add({
    orderId, userId: uid, customerName: order.customerName ?? '', type: body.type,
    reason: motivo.reason, ...(body.motivo ? { motivo: body.motivo } : {}), ...(defeito ? { defeito: true } : { semUsoConfirmado: true }), ...(fotos.length ? { fotos } : {}), devolverPor, items, ...troca, status: 'solicitada', restocked: false,
    createdAt: now, updatedAt: now, createdBy: 'cliente',
  });
  const short = orderId.slice(-8).toUpperCase();
  const label = defeito ? 'troca por defeito' : body.type === 'troca' ? 'troca' : 'devolução';
  await notifyInApp({ type: 'new_order', message: `${order.customerName || 'Cliente'} pediu ${label} do pedido ${short}: "${motivo.reason.slice(0, 80)}"`, orderId, url: '/painel/trocas' }).catch(() => {});
  await notifySeller({ title: `Pedido de ${label}`, body: `#${short} · ${motivo.reason.slice(0, 80)}`, url: '/painel/trocas', data: { orderId, event: 'return_requested' } });
  return NextResponse.json({ id: ref.id, status: 'solicitada' });
}
