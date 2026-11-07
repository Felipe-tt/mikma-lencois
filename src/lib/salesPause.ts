/**
 * "Não estamos atendendo": a loja continua aberta para ver produtos e
 * montar o carrinho, mas nenhuma compra é criada (férias, ou enquanto os
 * pagamentos e as entregas ainda estão em teste). Liga e desliga no painel.
 */
export interface PauseSettings { salesPaused?: boolean; salesPausedMessage?: string; salesPausedUntil?: string }

/** "15/01" a partir de "2027-01-15"; vazio se a data não vier certa. */
function dayMonth(iso?: string): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : '';
}

/** Aviso para o cliente, ou null com a loja vendendo normalmente. */
export function pauseNotice(s: PauseSettings): string | null {
  if (!s.salesPaused) return null;
  const custom = s.salesPausedMessage?.trim();
  if (custom) return custom;
  const back = dayMonth(s.salesPausedUntil);
  return `No momento não estamos atendendo${back ? `, voltamos em ${back}` : ''}. Seu carrinho fica salvo para quando voltarmos.`;
}
