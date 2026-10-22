'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '@/lib/hooks/useOverlay';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** URL/rota real que esse preview representa, ex: "/" ou "/sobre", mostrado na barra do "navegador" */
  routeLabel: string;
  children: React.ReactNode;
}

type Viewport = 'desktop' | 'mobile';

const VIEWPORTS: { id: Viewport; label: string; icon: React.ReactNode }[] = [
  {
    id: 'desktop',
    label: 'Desktop',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>,
  },
  {
    id: 'mobile',
    label: 'Mobile',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>,
  },
];

export function PreviewModal({ open, onClose, title, routeLabel, children }: Props) {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const panelRef = useRef<HTMLDivElement>(null);
  const { mounted, state } = useOverlay({ open, onClose, panelRef });

  if (!mounted) return null;

  return createPortal(
    <div
      className="overlay-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      data-state={state}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Pré-visualização: ${title}`}
        data-variant="dialog"
        className={`overlay-panel bg-paper w-full max-h-full flex flex-col shadow-2xl rounded-2xl overflow-hidden ${viewport === 'mobile' ? 'max-w-[480px]' : 'max-w-[1180px]'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-ink shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E6553C]/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E8B339]/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#4FAE6E]/70" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-paper truncate">{title}</p>
              <p className="text-[10px] text-paper/40 font-mono truncate">mikma.com.br{routeLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Viewport toggle */}
            <div className="flex items-center bg-paper/10 p-0.5 rounded-lg">
              {VIEWPORTS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={viewport === id}
                  onClick={() => setViewport(id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-[background-color,color] duration-150 ${
                    viewport === id ? 'bg-paper text-ink' : 'text-paper/60 hover:text-paper'
                  }`}
                >
                  {icon}
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              type="button"
              className="w-8 h-8 flex items-center justify-center text-paper/60 hover:text-paper hover:bg-paper/10 active:scale-90 rounded-lg transition-[color,background-color,transform] duration-150"
              aria-label="Fechar pré-visualização"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* ── Frame ── */}
        <div className="flex-1 overflow-auto bg-mist max-h-[78vh]">
          <div
            className={`mx-auto bg-white dark:bg-warm transition-[max-width] duration-200 ${viewport === 'mobile' ? 'max-w-[420px]' : 'max-w-full'}`}
          >
            {children}
          </div>
        </div>

        {/* ── Footer hint ── */}
        <div className="px-4 py-2.5 bg-paper border-t border-mist flex items-center justify-between shrink-0">
          <p className="text-[10px] text-faint">Pré-visualização ao vivo, reflete o que você digitou, ainda não salvo</p>
          <button type="button" onClick={onClose} className="text-[11px] font-semibold text-mid hover:text-ink transition-colors">
            Fechar
          </button>
        </div>
      </div>

    </div>,
    document.body
  );
}

/** Botão padrão "Visualizar" usado dentro de cada Section do painel */
export function PreviewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-[11px] font-semibold text-clay hover:text-ink transition-colors shrink-0"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Visualizar
    </button>
  );
}
