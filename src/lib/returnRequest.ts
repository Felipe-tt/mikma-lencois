/**
 * Pedido de troca ou devolução feito pelo próprio cliente, no pedido.
 * Prazos da política (/trocas-e-devolucoes): 7 dias para desistir (CDC art.
 * 49) e 90 dias para defeito (art. 26), contados da entrega.
 */
import type { Order } from '@/types';

export const DIAS_TROCA = 90;
export const DIAS_ARREPENDIMENTO = 7;

/** Data da entrega (ou, sem ela, do despacho ou da compra). */
export function deliveredDate(order: Pick<Order, 'delivery' | 'createdAt'>): Date | null {
  const raw = (order.delivery as { deliveredAt?: unknown; dispatchedAt?: unknown } | undefined)?.deliveredAt
    ?? (order.delivery as { dispatchedAt?: unknown } | undefined)?.dispatchedAt ?? order.createdAt;
  const d = typeof raw === 'string' ? new Date(raw)
    : raw && typeof raw === 'object' && 'toDate' in raw ? (raw as { toDate: () => Date }).toDate()
    : raw && typeof raw === 'object' && '_seconds' in raw ? new Date((raw as { _seconds: number })._seconds * 1000)
    : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Ainda dá para pedir troca? Devolve o motivo quando não dá. */
export function returnWindow(order: Pick<Order, 'status' | 'delivery' | 'createdAt'>, now = new Date()): { ok: true; arrependimento: boolean } | { ok: false; reason: string } {
  if (order.status !== 'delivered') return { ok: false, reason: 'A troca é pedida depois que o pedido é entregue.' };
  const d = deliveredDate(order);
  const dias = d ? (now.getTime() - d.getTime()) / 86_400_000 : 0;
  if (dias > DIAS_TROCA) return { ok: false, reason: `O prazo para pedir troca (${DIAS_TROCA} dias depois da entrega) já passou. Fale com a gente pelo WhatsApp.` };
  return { ok: true, arrependimento: dias <= DIAS_ARREPENDIMENTO };
}
