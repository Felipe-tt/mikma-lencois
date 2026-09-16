'use client';

import { IconAlert } from '@/components/ui/Icon';

/**
 * Mostrado quando uma consulta em tempo real falha (sem internet, sessão
 * expirada, índice faltando no Firestore).
 *
 * Existe porque várias telas do painel só tratavam o caminho feliz do
 * onSnapshot: sem callback de erro, `loading` nunca virava false e a
 * pessoa ficava olhando o esqueleto de carregamento para sempre, sem
 * nenhuma pista do que aconteceu nem o que fazer. Um erro visível e com
 * saída é sempre melhor que um carregamento infinito.
 *
 * A mensagem fala do efeito ("não deu para carregar os pedidos"), não da
 * causa técnica — quem usa o painel está atendendo cliente, não
 * depurando Firestore. O detalhe técnico vai para o console.
 */
export function PanelErrorState({
  message = 'Não foi possível carregar agora.',
  hint = 'Verifique sua conexão. Se continuar, recarregue a página.',
  onRetry,
}: {
  message?: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel-card panel-empty" role="alert">
      <span className="panel-empty-icon text-amber-600 bg-amber-50 dark:bg-amber-500/10">
        <IconAlert size={20} />
      </span>
      <p className="text-[13px] font-medium text-ink">{message}</p>
      <p className="text-[12px] text-faint mt-1 max-w-[42ch]">{hint}</p>
      <button
        onClick={onRetry ?? (() => window.location.reload())}
        className="mt-4 btn-outline text-[12px] px-4 py-2"
      >
        {onRetry ? 'Tentar de novo' : 'Recarregar página'}
      </button>
    </div>
  );
}
