/**
 * Lógica pura por trás do grid de "toque pra vender/repor" do estoque
 * (NovaVendaSheet). Extraída pra poder testar sem precisar montar React —
 * é exatamente a conta que decide quanto soma/tira a cada toque e quando
 * para pra confirmar (toque rápido demais no mesmo produto).
 */

export const RAPID_CONFIRM_THRESHOLD = 5;

export type SaleMode = 'venda' | 'reposicao';

/** Próximo delta acumulado pro item depois de um toque, dado o modo atual. */
export function nextTapDelta(mode: SaleMode, current: number): number {
  return mode === 'venda' ? current - 1 : current + 1;
}

/**
 * Diz se esse toque deveria parar e confirmar com o vendedor antes de
 * aplicar — dispara a cada múltiplo do threshold (5, 10, 15...), só quando
 * o toque está aumentando a magnitude (não quando tá corrigindo de volta
 * pra 0, já que aí a pessoa claramente está desfazendo, não errando de novo).
 */
export function shouldConfirmRapidTap(current: number, next: number): boolean {
  const crossingUp = Math.abs(next) > Math.abs(current);
  return crossingUp && Math.abs(next) >= RAPID_CONFIRM_THRESHOLD && Math.abs(next) % RAPID_CONFIRM_THRESHOLD === 0;
}

/** Remove entradas zeradas do mapa de deltas — é isso que faz o item sair
 *  do "pendente de confirmar" quando a pessoa desfaz um toque até voltar a 0. */
export function applyTapDelta(deltas: Record<string, number>, itemId: string, next: number): Record<string, number> {
  if (next === 0) {
    const { [itemId]: _omit, ...rest } = deltas;
    return rest;
  }
  return { ...deltas, [itemId]: next };
}
