'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Pergunta antes de sair de uma tela com alterações não salvas.
 *
 * Só beforeunload não bastava: ele não dispara na navegação interna do
 * Next (barra de baixo, menu, links), e a contagem de estoque ou as
 * configurações sumiam ao tocar em "Pedidos". Aqui um listener de clique
 * em fase de captura no document segura qualquer <a href> interno antes do
 * <Link> do Next, pergunta e, confirmando, navega com router.push.
 */
export function useUnsavedGuard(
  dirty: boolean,
  { message = 'Sair sem salvar?', detail = 'As alterações que você fez nesta tela vão se perder.' }: { message?: string; detail?: string } = {},
) {
  const router = useRouter();
  const leaving = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    leaving.current = false;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = '';
    }

    function onClick(e: MouseEvent) {
      if (leaving.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // nova aba/janela
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Âncora na mesma página não sai da tela.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      const href = url.pathname + url.search + url.hash;
      confirmDialog({ message, detail, confirmLabel: 'Sair sem salvar', cancelLabel: 'Continuar editando', variant: 'danger' })
        .then(({ confirmed }) => {
          if (!confirmed) return;
          leaving.current = true;
          router.push(href);
        });
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, message, detail, router]);
}
