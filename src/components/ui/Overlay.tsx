'use client';

import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay, OVERLAY_EXIT_MS } from '@/lib/hooks/useOverlay';

type Props = {
  /** Chamado depois da animação de saída (o pai desmonta o modal aqui). */
  onClose: () => void;
  variant?: 'dialog' | 'responsive' | 'sheet';
  /** Nome acessível: id do título (preferível) ou texto. */
  labelledBy?: string;
  label?: string;
  /** false: Esc e clique fora não fecham. */
  dismissible?: boolean;
  backdropClassName?: string;
  className?: string;
  /** Recebe `close`, que anima a saída antes de chamar onClose. */
  children: ReactNode | ((close: () => void) => ReactNode);
};

/**
 * Modal montado direto pelo componente pai ({aberto && <Modal/>}).
 * Cuida de portal, fundo, animação de entrada e saída, trava de scroll,
 * Esc e foco (ver useOverlay). Para fechar com animação, use o `close`
 * passado aos filhos em vez de chamar onClose direto.
 */
export function Overlay({
  onClose, variant = 'dialog', labelledBy, label, dismissible = true,
  backdropClassName = '', className = '', children,
}: Props) {
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    if (!open) return;
    setOpen(false);
    setTimeout(onClose, OVERLAY_EXIT_MS);
  };

  const { mounted, state } = useOverlay({ open, onClose: close, panelRef, dismissible });
  if (!mounted || typeof document === 'undefined') return null;

  const align = variant === 'dialog'
    ? 'items-center p-4'
    : variant === 'responsive' ? 'items-end sm:items-center sm:p-4' : 'items-end';

  return createPortal(
    <div
      className={`overlay-backdrop fixed inset-0 z-[80] flex justify-center ${align} ${backdropClassName}`}
      data-state={state}
      onClick={() => { if (dismissible) close(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        data-variant={variant}
        className={`overlay-panel ${variant !== 'dialog' ? 'pb-[env(safe-area-inset-bottom)] sm:pb-0' : ''} ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>,
    document.body
  );
}
