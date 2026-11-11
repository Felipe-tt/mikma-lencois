/**
 * Pedido de troca ou devolução feito pelo próprio cliente, no pedido.
 * Política da loja (/trocas-e-devolucoes), contada da entrega:
 *  - troca ou devolução (tamanho, cor, desistência): até 7 dias, com as
 *    peças sem lavar e sem usar;
 *  - defeito: até 90 dias (CDC art. 26).
 */
import type { Order } from '@/types';

export const DIAS_TROCA = 7;
export const DIAS_DEFEITO = 90;

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

const plus = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

export const TROCA_FORA_DO_PRAZO = `Troca e devolução valem até ${DIAS_TROCA} dias depois da entrega. Se veio com defeito, escolha "Defeito".`;

export type ReturnWindow =
  | { ok: true; /** Ainda dá troca ou devolução (7 dias). */ troca: boolean; trocaAte: Date; defeitoAte: Date }
  | { ok: false; reason: string };

/** O que ainda dá para pedir. Devolve o motivo quando não dá nada. */
export function returnWindow(order: Pick<Order, 'status' | 'delivery' | 'createdAt'>, now = new Date()): ReturnWindow {
  if (order.status !== 'delivered') return { ok: false, reason: 'A troca é pedida depois que o pedido é entregue.' };
  const d = deliveredDate(order) ?? now;
  const trocaAte = plus(d, DIAS_TROCA);
  const defeitoAte = plus(d, DIAS_DEFEITO);
  if (now.getTime() > defeitoAte.getTime()) return { ok: false, reason: `O prazo para defeito (${DIAS_DEFEITO} dias depois da entrega) já passou. Fale com a gente pelo WhatsApp.` };
  return { ok: true, troca: now.getTime() <= trocaAte.getTime(), trocaAte, defeitoAte };
}
