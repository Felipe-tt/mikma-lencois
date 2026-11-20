import { adminDb } from '@/lib/firebase/admin';
import { revalidateTag } from 'next/cache';

/** Pago e ainda não entregue: a loja precisa do telefone e do endereço. */
const ORDER_IN_PROGRESS = ['paid', 'preparing', 'shipped'];

/**
 * O que impede excluir a conta agora (a mensagem para o cliente), ou null.
 *
 * Com pedido a caminho ou troca em aberto, os dados ainda servem para cumprir
 * a compra (LGPD, art. 7º, V): o telefone vai para o entregador e o CPF, para
 * o PIX da devolução. Antes a conta sumia e o entregador da Uber recebia um
 * telefone qualquer. Mesma regra de marketplaces grandes: sem compra em
 * andamento para encerrar a conta.
 */
export async function deletionBlocker(uid: string): Promise<string | null> {
  const [orders, returns] = await Promise.all([
    adminDb.collection('orders').where('userId', '==', uid).where('status', 'in', ORDER_IN_PROGRESS).limit(1).get(),
    adminDb.collection('returns').where('userId', '==', uid).limit(100).get(),
  ]);
  if (!orders.empty) return 'Você tem um pedido a caminho. Dá para excluir a conta depois que ele chegar.';
  for (const d of returns.docs) {
    const r = d.data() as { status?: string; type?: string; saldoCents?: number; estorno?: { status?: string } };
    if (r.status === 'solicitada' || r.status === 'aprovada') {
      return 'Você tem uma troca ou devolução em andamento. Dá para excluir a conta depois que ela terminar.';
    }
    const devolveDinheiro = r.type === 'devolucao' || (r.saldoCents ?? 0) < 0;
    if (r.status === 'concluida' && devolveDinheiro && r.estorno?.status !== 'feito') {
      return 'Ainda falta devolvermos o seu dinheiro de uma devolução. Dá para excluir a conta depois disso.';
    }
  }
  return null;
}

/**
 * Avaliações da conta excluída saem do site (nome, nota e comentário eram
 * dela). A página de cada produto é atualizada na hora. Devolve quantas.
 */
export async function deleteUserReviews(uid: string): Promise<number> {
  const snap = await adminDb.collection('reviews').where('userId', '==', uid).limit(400).get();
  if (snap.empty) return 0;
  const batch = adminDb.batch();
  const products = new Set<string>();
  for (const d of snap.docs) {
    batch.delete(d.ref);
    const productId = d.data().productId;
    if (typeof productId === 'string') products.add(productId);
  }
  await batch.commit();
  for (const id of products) {
    try { revalidateTag(`avaliacoes-${id}`, { expire: 0 }); } catch { /* best-effort */ }
  }
  return snap.size;
}
