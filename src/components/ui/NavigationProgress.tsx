'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Barra fina no topo enquanto uma navegação carrega. Sem ela, um clique
 * em página que ainda não estava pronta deixava a tela parada, sem sinal
 * nenhum. Começa no clique de um link interno (ou por startNavigation, para
 * quem navega por código) e termina quando o Next troca a URL, que ele só
 * faz depois de montar a página nova. Só aparece se passar de 150 ms: a
 * navegação instantânea não pisca nada.
 */

interface NavState { visible: boolean; to: URL | null }

let state: NavState = { visible: false, to: null };
const listeners = new Set<() => void>();
let showTimer: ReturnType<typeof setTimeout> | null = null;
let giveUpTimer: ReturnType<typeof setTimeout> | null = null;

function emit(next: NavState) {
  state = next;
  listeners.forEach(l => l());
}

function finish() {
  if (showTimer) clearTimeout(showTimer);
  if (giveUpTimer) clearTimeout(giveUpTimer);
  showTimer = giveUpTimer = null;
  if (state.visible || state.to) emit({ visible: false, to: null });
}

/** Para navegações por código (router.push): mostra a barra até a página chegar. */
export function startNavigation(href: string) {
  if (typeof window === 'undefined') return;
  let to: URL;
  try { to = new URL(href, window.location.href); } catch { return; }
  if (to.origin !== window.location.origin) return;
  if (to.pathname === window.location.pathname && to.search === window.location.search) return;
  finish();
  state = { visible: false, to };
  showTimer = setTimeout(() => emit({ visible: true, to }), 150);
  // Navegação que nunca termina (erro, aba em segundo plano): some sozinha.
  giveUpTimer = setTimeout(finish, 12_000);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const SERVER: NavState = { visible: false, to: null };

/** Navegação em andamento (já visível), com o destino. */
export function useNavigationPending(): NavState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export function NavigationProgress() {
  const { visible } = useNavigationPending();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      // Botão dentro do link (ex.: detalhe do preço no cartão do produto) não navega.
      const inner = target?.closest?.('button, [role="button"]');
      if (inner && inner !== a && a.contains(inner)) return;
      const href = a.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      startNavigation(a.href);
    };
    // Captura: o Link do Next cancela o clique (preventDefault) para navegar sozinho.
    document.addEventListener('click', onClick, true);

    // O Next troca a URL quando a página nova já está montada: é o fim.
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History['pushState']>) => { push(...args); finish(); };
    history.replaceState = (...args: Parameters<History['replaceState']>) => { replace(...args); if (state.to && sameUrl(state.to)) finish(); };
    const onPop = () => finish();
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
      history.pushState = push;
      history.replaceState = replace;
    };
  }, []);

  return (
    <div aria-hidden="true" className={`nav-progress ${visible ? 'is-on' : ''}`}>
      <span />
    </div>
  );
}

function sameUrl(to: URL) {
  return to.pathname === window.location.pathname && to.search === window.location.search;
}
