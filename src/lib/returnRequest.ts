/**
 * Pedido de troca ou devolução feito pelo próprio cliente, no pedido.
 * Política da loja (/trocas-e-devolucoes), contada da entrega:
 *  - troca ou devolução (tamanho, cor, desistência): até 7 dias, com as
 *    peças sem lavar e sem usar;
 *  - defeito: até 90 dias (CDC art. 26).
 */
import type { Order } from '@/types';
import { isBusinessDay } from '@/lib/deliveryDate';

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

/**
 * Último instante do prazo, contado como manda o Código Civil (art. 132):
 * dias corridos sem o dia da entrega, até o fim do último dia (horário de
 * Brasília); caindo em fim de semana ou feriado, vai até o próximo dia útil.
 * Antes contava horas exatas: entregue às 10h, o 7º dia acabava às 10h.
 */
export function fimDoPrazo(entrega: Date, dias: number): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(entrega).split('-').map(Number);
  // Meio-dia UTC cai no mesmo dia em Brasília.
  const dia = new Date(Date.UTC(y, m - 1, d + dias, 12));
  while (!isBusinessDay(dia)) dia.setUTCDate(dia.getUTCDate() + 1);
  // 23:59:59,999 em Brasília (UTC-3; sem horário de verão desde 2019).
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate() + 1, 3) - 1);
}

export const TROCA_FORA_DO_PRAZO = `Troca e devolução valem até ${DIAS_TROCA} dias depois da entrega. Se veio com defeito, escolha "Defeito".`;

export type ReturnWindow =
  | { ok: true; /** Ainda dá troca ou devolução (7 dias). */ troca: boolean; trocaAte: Date; defeitoAte: Date }
  | { ok: false; reason: string };

/** O que ainda dá para pedir. Devolve o motivo quando não dá nada. */
export function returnWindow(order: Pick<Order, 'status' | 'delivery' | 'createdAt'>, now = new Date()): ReturnWindow {
  if (order.status !== 'delivered') return { ok: false, reason: 'A troca é pedida depois que o pedido é entregue.' };
  const d = deliveredDate(order) ?? now;
  const trocaAte = fimDoPrazo(d, DIAS_TROCA);
  const defeitoAte = fimDoPrazo(d, DIAS_DEFEITO);
  // Defeito que só aparece com o uso conta de quando foi percebido (CDC,
  // art. 26, § 3º): passado o prazo do site, o atendimento resolve.
  if (now.getTime() > defeitoAte.getTime()) return { ok: false, reason: `Pelo site, defeito vale até ${DIAS_DEFEITO} dias depois da entrega. Se o defeito só apareceu agora, fale com a gente pelo WhatsApp.` };
  return { ok: true, troca: now.getTime() <= trocaAte.getTime(), trocaAte, defeitoAte };
}

/** Motivos prontos que o cliente toca no pedido; "Outro..." pede texto. */
export const MOTIVOS = {
  troca: ['Não coube no colchão', 'Ficou folgado', 'Quero outro tamanho', 'Quero outra cor', 'Outro motivo'],
  devolucao: ['Não coube no colchão', 'Cor diferente da foto', 'Não gostei do tecido', 'Desisti da compra', 'Outro motivo'],
  defeito: ['Costura aberta ou furo', 'Mancha ou sujeira', 'Elástico com problema', 'Peça errada ou faltando', 'Outro defeito'],
} as const;
export type TipoPedido = keyof typeof MOTIVOS;

/** "Outro motivo" e "Outro defeito" pedem que o cliente escreva. */
export const motivoPedeTexto = (motivo: string) => motivo.startsWith('Outro');

/**
 * Confere motivo e texto do pedido. Devolve o erro para o cliente, ou o
 * texto final gravado na troca ("Não coube no colchão: era king, quero queen").
 */
export function motivoFinal(tipo: TipoPedido, motivo: string | undefined, texto: string): { ok: true; reason: string } | { ok: false; error: string } {
  const t = texto.trim();
  if (!motivo) return { ok: false, error: 'Escolha o motivo.' };
  if (!(MOTIVOS[tipo] as readonly string[]).includes(motivo)) return { ok: false, error: 'Motivo inválido.' };
  if (motivoPedeTexto(motivo) && t.length < 10) return { ok: false, error: tipo === 'defeito' ? 'Conte qual é o defeito.' : 'Conte em poucas palavras o que aconteceu.' };
  return { ok: true, reason: motivoPedeTexto(motivo) ? t : t ? `${motivo}: ${t}` : motivo };
}

/**
 * Por onde as peças voltam: do mesmo jeito que o pedido chegou (Correios ou
 * Uber), ou o cliente entrega na loja. Retirada na loja volta na loja.
 */
export type DevolverPor = 'correios' | 'uber' | 'loja';

type ComEntrega = { delivery?: { carrier?: string | null } | null; selectedShipping?: { carrier?: string } };

export function devolucaoPadrao(order: ComEntrega): DevolverPor {
  const carrier = order.delivery?.carrier ?? order.selectedShipping?.carrier;
  return carrier === 'uber_direct' ? 'uber' : carrier === 'pickup' ? 'loja' : 'correios';
}

/** Opções que o cliente vê no pedido: o jeito da entrega e a loja. */
export function opcoesDevolucao(order: ComEntrega): DevolverPor[] {
  const padrao = devolucaoPadrao(order);
  return padrao === 'loja' ? ['loja'] : [padrao, 'loja'];
}
