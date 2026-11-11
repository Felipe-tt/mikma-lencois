/**
 * Gera a etiqueta (pré-postagem) de um pedido pelo contrato dos Correios e
 * grava no pedido. Usado pelo botão do pedido e pelo lote da lista de
 * pedidos. Só servidor (Admin SDK).
 */
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { shippingBlockReason } from '@/lib/orders/shippingBlock';
import {
  buildPrePostagem, createPrePostagem, CorreiosError, prePostagemProblems, remetenteFrom, type PrePostagemInfo,
} from '@/lib/correiosPrepostagem';
import type { Order } from '@/types';

export type OrderWithLabel = Order & { delivery: Order['delivery'] & { prePostagem?: PrePostagemInfo; prePostagemLock?: number } };

export async function loadOrder(orderId: string) {
  const ref = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();
  return { ref, order: snap.exists ? ({ id: snap.id, ...snap.data() } as OrderWithLabel) : null };
}

/**
 * Cria a etiqueta do pedido (ou devolve a que já existe). Lança
 * CorreiosError com a mensagem para o painel quando não dá.
 */
export async function generateLabel(orderId: string, coleta: boolean): Promise<PrePostagemInfo> {
  const { ref, order } = await loadOrder(orderId);
  if (!order) throw new CorreiosError('Pedido não encontrado', 404);
  if (order.delivery?.prePostagem) return order.delivery.prePostagem;
  if (order.status !== 'preparing') {
    throw new CorreiosError('Gere a etiqueta com o pedido em separação (clique em "Comecei a separar o pedido").', 409);
  }
  const blocked = shippingBlockReason(order);
  if (blocked) throw new CorreiosError(blocked, 409);

  const settings = await getSettings();
  const remetente = remetenteFrom(settings);
  const problems = prePostagemProblems(order, remetente);
  if (problems.length) throw new CorreiosError(problems.join(' '), 400);

  // Peso pelo cadastro atual dos produtos (o mesmo usado no frete).
  const ids = [...new Set(order.items.map(i => i.productId))];
  const snaps = await Promise.all(ids.map(id => adminDb.collection('products').doc(id).get()));
  const fallback = settings.defaultItemWeightKg || 0.8;
  const weight = new Map(snaps.map(s => [s.id, (s.get('weightKg') as number | undefined) ?? fallback]));
  const weightKg = order.items.reduce((sum, i) => sum + (weight.get(i.productId) ?? fallback) * i.quantity, 0);

  // Trava o pedido enquanto fala com os Correios: dois cliques (ou duas
  // pessoas, ou o lote junto com o botão do pedido) não geram duas
  // etiquetas. A trava vence em 1 minuto.
  const locked = await adminDb.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() as OrderWithLabel;
    if (cur.delivery?.prePostagem) return 'existe';
    if ((cur.delivery?.prePostagemLock ?? 0) > Date.now() - 60_000) return 'gerando';
    tx.update(ref, { 'delivery.prePostagemLock': Date.now() });
    return 'ok';
  });
  if (locked === 'existe') {
    const pre = (await loadOrder(orderId)).order?.delivery?.prePostagem;
    if (pre) return pre;
  }
  if (locked === 'gerando') throw new CorreiosError('A etiqueta deste pedido já está sendo gerada. Aguarde alguns segundos.', 409);

  try {
    const created = await createPrePostagem(buildPrePostagem(order, remetente, { weightKg, coleta }));
    const prePostagem: PrePostagemInfo = { ...created, coleta, createdAt: new Date().toISOString() };
    await ref.update({ 'delivery.prePostagem': prePostagem, 'delivery.prePostagemLock': FieldValue.delete(), updatedAt: new Date().toISOString() });
    return prePostagem;
  } catch (err) {
    await ref.update({ 'delivery.prePostagemLock': FieldValue.delete() }).catch(() => {});
    throw err;
  }
}
