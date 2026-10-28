'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PainelSidebar, NAV, TABBAR_NAV } from './PainelSidebar';
import { NotificationBell } from './NotificationBell';
import { IconSettings } from '@/components/ui/Icon';
import { useOverlayBehavior } from '@/lib/hooks/useOverlay';

// Gesto de abrir o menu arrastando da esquerda para a direita, de
// qualquer ponto da tela (a borda de 24px de antes brigava com o "voltar"
// do Android e do iPhone e quase nunca funcionava). Para contar como
// intencional: andar pelo menos 70px na horizontal, bem mais na
// horizontal que na vertical (não é rolagem) e num gesto rápido.
const SWIPE_MIN_DX = 70;
const SWIPE_RATIO = 2;
const SWIPE_MAX_MS = 700;

// Começou em algo que já arrasta de lado (carrossel, tabela larga, campo
// de texto, mapa): o gesto é dele, não do menu.
function startsInHorizontalScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe], [data-nav-editing]')) return true;
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function PainelSidebarWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  // Drawer fica sempre montado (desliza com transform); aqui só trava o
  // scroll, fecha com Esc e prende o foco enquanto está aberto.
  useOverlayBehavior({ active: open, onClose: () => setOpen(false), panelRef: drawerRef });

  // Swipe no celular: fechado, arrastar para a direita abre; aberto,
  // arrastar para a esquerda fecha. Ver SWIPE_* acima.
  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;

    function onTouchStart(e: TouchEvent) {
      start = null;
      if (e.touches.length !== 1 || window.innerWidth >= 1024) return;
      if (startsInHorizontalScroller(e.target)) return;
      // Outra janela (modal, confirmação) aberta por cima do painel.
      if (!open && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: performance.now() };
    }

    function onTouchEnd(e: TouchEvent) {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const quick = performance.now() - start.t <= SWIPE_MAX_MS;
      start = null;
      if (!quick || Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
      if (!open && dx > 0) setOpen(true);
      if (open && dx < 0) setOpen(false);
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [open]);

  // Teclado aberto no celular: a barra de baixo some enquanto um campo de
  // texto tem foco. Com o teclado, topo + barra de salvar + barra de baixo
  // ocupavam ~40% da tela e sobrava pouco espaço pro formulário.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isTextField = (el: Element | null) => {
      if (!el) return false;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
      if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden'].includes(el.type);
      return (el as HTMLElement).isContentEditable === true;
    };
    let frame = 0;
    // Espera um quadro no focusout: pular de um campo pro outro não pode
    // fazer a barra piscar.
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTyping(isTextField(document.activeElement)));
    };
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', sync);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', sync);
    };
  }, []);

  // Título vem da lista completa (antes só da barra inferior, e Cupons,
  // Trocas etc. apareciam como "Painel").
  const isActive = (n: { href: string; exact?: boolean }) => n.exact ? pathname === n.href : pathname.startsWith(n.href);
  const currentTitle = NAV.find(isActive)?.label ?? 'Painel';
  // Rotas fora da barra inferior marcam o "Mais" como ativo.
  const moreActive = !TABBAR_NAV.some(isActive);

  return (
    <div className="painel-scope flex min-h-screen bg-warm" data-typing={typing ? '' : undefined}>
      {/* Sidebar desktop */}
      <div data-no-print className="hidden lg:block sticky top-0 h-screen self-start overflow-hidden">
        <PainelSidebar />
      </div>

      {/* Overlay mobile */}
      <div
        data-no-print
        aria-hidden
        data-state={open ? 'open' : 'closed'}
        className={`overlay-backdrop fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`}
        onClick={() => setOpen(false)}
      />

      {/* Drawer mobile */}
      <div
        ref={drawerRef}
        data-no-print
        tabIndex={-1}
        role="dialog"
        aria-modal={open}
        aria-label="Menu do painel"
        inert={!open}
        data-variant="drawer-left"
        data-state={open ? 'open' : 'closed'}
        className="overlay-panel fixed top-0 left-0 z-50 h-full lg:hidden shadow-modal rounded-r-3xl overflow-hidden"
      >
        <PainelSidebar onClose={() => setOpen(false)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar — vidro fosco, gruda no topo */}
        <header data-no-print className="panel-topbar lg:hidden flex items-center gap-3 px-4 h-14">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-10 h-10 -ml-2 flex items-center justify-center text-mid hover:text-ink hover:bg-warm active:scale-90 transition-[color,background-color,transform] duration-150 rounded-xl"
            aria-label="Abrir menu"
            aria-expanded={open}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
          <span className="font-display text-base text-ink">{currentTitle}</span>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>

        {/* overflow-x-clip e não overflow-y-auto: o documento é que rola, e
            um main com overflow virava o contêiner das barras "sticky"
            (Confirmar venda, Salvar contagem), que por isso nunca grudavam.
            O clip só corta sobra horizontal sem criar contêiner de rolagem. */}
        <main className="flex-1 p-5 sm:p-8 pb-[calc(var(--panel-tabbar-h)+env(safe-area-inset-bottom)+1rem)] lg:pb-8 overflow-x-clip animate-fade-in">
          {children}
        </main>

        {/* Barra inferior mobile — navegação tipo app nativo. Some (com fade)
            quando o drawer está aberto, senão fica "por cima" do overlay e
            parece que há dois menus ao mesmo tempo. */}
        <nav
          data-no-print
          aria-label="Navegação principal"
          inert={open}
          className={`panel-tabbar lg:hidden transition-[opacity,translate] duration-200 ${open ? 'opacity-0 translate-y-3 pointer-events-none' : ''}`}
        >
            {TABBAR_NAV.map(({ href, label, exact, Icon }) => {
              const active = isActive({ href, exact });
              return (
                <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`panel-tabbar-item ${active ? 'is-active' : ''}`}>
                  <Icon size={19} />
                  <span className="text-[10px] font-semibold leading-none">{label}</span>
                  <span className="panel-tabbar-dot" />
                </Link>
              );
            })}
            <button onClick={() => setOpen(true)} className={`panel-tabbar-item ${moreActive ? 'is-active' : ''}`} aria-label="Mais opções">
              <IconSettings size={19} />
              <span className="text-[10px] font-semibold leading-none">Mais</span>
              <span className="panel-tabbar-dot" />
            </button>
        </nav>
      </div>
    </div>
  );
}
