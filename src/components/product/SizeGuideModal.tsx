'use client';
import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '@/lib/hooks/useOverlay';

interface Props {
  columns: string[];
  rows: Record<string, string>[];
  note: string;
  whatsappUrl?: string;
}

export function SizeGuideModal({ columns, rows, note, whatsappUrl }: Props) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const { mounted, state } = useOverlay({ open, onClose: close, panelRef });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 text-[11px] font-semibold text-clay hover:text-clay-d transition-colors uppercase tracking-[0.1em]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18"/>
          <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="8" cy="18" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
        Guia de medidas
      </button>

      {/* Backdrop, portal pro body para evitar bug com transform de ancestral */}
      {mounted && createPortal(
        <div
          className="overlay-backdrop fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
          data-state={state}
          onClick={close}
        >
          {/* Panel */}
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="size-guide-title"
            data-variant="responsive"
            className="overlay-panel w-full sm:max-w-xl bg-paper sm:mx-4 overflow-hidden shadow-2xl max-h-[88dvh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-mist shrink-0">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint mb-1">Produto</p>
                <h3 id="size-guide-title" className="font-display font-normal text-ink text-xl leading-none">Guia de medidas</h3>
              </div>
              <button
                onClick={close}
                type="button"
                className="w-9 h-9 -mr-2 flex items-center justify-center text-faint hover:text-ink hover:bg-warm active:scale-90 transition-[color,background-color,transform] duration-150"
                aria-label="Fechar guia de medidas"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Table */}
            {rows.length > 0 && columns.length > 0 ? (
              <div className="overflow-auto overscroll-contain">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-warm border-b border-mist">
                      {columns.map(col => (
                        <th key={col} className="text-left px-5 py-3 text-[10px] font-bold tracking-[0.16em] uppercase text-faint whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {rows.map((row, i) => (
                      <tr key={i} className="hover:bg-warm/40 transition-colors">
                        {columns.map((col, j) => (
                          <td key={col} className={`px-5 py-3.5 whitespace-nowrap ${j === 0 ? 'font-semibold text-ink' : 'text-mid font-mono text-[12px]'}`}>
                            {row[col] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-sm text-faint">
                Guia de medidas não configurado.
              </div>
            )}

            {/* Note */}
            {note && (
              <div className="px-6 py-4 border-t border-mist bg-warm/50 shrink-0">
                <p className="text-[11px] text-faint leading-relaxed">
                  {note}
                  {whatsappUrl && (
                    <> Dúvidas?{' '}
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                        className="text-clay font-medium hover:text-clay-d transition-colors">
                        Fale conosco no WhatsApp
                      </a>.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      , document.body)}
    </>
  );
}
