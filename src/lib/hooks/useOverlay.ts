'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Base comum de todos os overlays (modais, sheets e drawers).
 *
 * Antes cada modal travava o scroll do body por conta própria (e o
 * primeiro a fechar destravava os outros), só alguns fechavam com Esc,
 * nenhum prendia o foco e todos sumiam de uma vez ao fechar. Aqui fica
 * num lugar só:
 *
 * - presença: mantém o overlay montado durante a animação de saída e
 *   expõe `state` ('open' | 'closed') pra ir no `data-state` das classes
 *   `.overlay-backdrop` / `.overlay-panel` (globals.css);
 * - trava de scroll contada: só destrava quando o último overlay fecha;
 * - Esc fecha só o overlay do topo da pilha;
 * - foco preso dentro do painel e devolvido a quem abriu ao fechar.
 */

/** Precisa bater com --overlay-out em globals.css (+ folga). */
export const OVERLAY_EXIT_MS = 220;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const stack: symbol[] = [];
let lockCount = 0;

function lockScroll() {
  // overflow no <html>, não no <body>: o html já reserva a calha da
  // barra de rolagem (scrollbar-gutter), então a página não pula.
  if (lockCount++ === 0) document.documentElement.style.overflow = 'hidden';
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.documentElement.style.overflow = '';
}

function focusables(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => el.getClientRects().length > 0);
}

type BehaviorOptions = {
  /** Overlay aberto (trava scroll, escuta teclado, prende foco). */
  active: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  /** Elemento que recebe o foco ao abrir (padrão: [autofocus] ou o painel). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** false: Esc não fecha (ex.: alert sem botão de cancelar). */
  dismissible?: boolean;
};

/** Trava de scroll, Esc e foco, sem cuidar de montar/desmontar. */
export function useOverlayBehavior({
  active, onClose, panelRef, initialFocusRef, dismissible = true,
}: BehaviorOptions) {
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    if (!active) return;
    const id = Symbol('overlay');
    stack.push(id);
    lockScroll();

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // O painel pode ainda não estar no DOM no primeiro frame (useOverlay
    // monta no render seguinte ao `open`): tenta por alguns frames.
    let raf = 0;
    let tries = 0;
    const focusInitial = () => {
      const panel = panelRef.current;
      if (!panel) {
        if (++tries < 10) raf = requestAnimationFrame(focusInitial);
        return;
      }
      if (panel.contains(document.activeElement)) return;
      const target = initialFocusRef?.current
        ?? panel.querySelector<HTMLElement>('[autofocus]')
        ?? panel;
      target.focus({ preventScroll: true });
    };
    raf = requestAnimationFrame(focusInitial);

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        if (!dismissibleRef.current) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusables(panel);
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === panel || !panel.contains(current))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (current === last || !panel.contains(current))) {
        e.preventDefault(); first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      const i = stack.indexOf(id);
      if (i !== -1) stack.splice(i, 1);
      unlockScroll();
      // Devolve o foco a quem abriu, se ele ainda existe na página
      // (ex.: o botão some quando o modal navega pra outra rota).
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, panelRef, initialFocusRef]);
}

type OverlayOptions = Omit<BehaviorOptions, 'active'> & { open: boolean };

/**
 * Presença + comportamento. Renderize o overlay só quando `mounted` e
 * passe `state` pro data-state do backdrop e do painel.
 */
export function useOverlay({ open, ...rest }: OverlayOptions) {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<'open' | 'closed'>('closed');

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Dois frames: o primeiro pinta o estado fechado, o segundo dispara
      // a transição de entrada (sem isso o navegador pula direto pro fim).
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setState('open'));
      });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }
    setState('closed');
    const t = setTimeout(() => setMounted(false), OVERLAY_EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useOverlayBehavior({ active: open, ...rest });

  return { mounted, state };
}
