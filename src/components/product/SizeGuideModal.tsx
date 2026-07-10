'use client';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  columns: string[];
  rows: Record<string, string>[];
  note: string;
  whatsappUrl?: string;
}

export function SizeGuideModal({ columns, rows, note, whatsappUrl }: Props) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [open, close]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
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

      {/* Backdrop — portal pro body para evitar bug com transform de ancestral */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[80] bg-[rgba(30,18,8,0.5)] backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={close}
        >
          {/* Panel */}
          <div
            className="w-full sm:max-w-xl bg-paper sm:mx-4 sm:rounded-sm overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-mist">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint mb-1">Produto</p>
                <h3 className="font-display font-normal text-ink text-xl leading-none">Guia de medidas</h3>
              </div>
              <button
                onClick={close}
                className="w-9 h-9 flex items-center justify-center text-faint hover:text-ink transition-colors"
                aria-label="Fechar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Table */}
            {rows.length > 0 && columns.length > 0 ? (
              <div className="overflow-x-auto">
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
              <div className="px-6 py-4 border-t border-mist bg-warm/50">
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
