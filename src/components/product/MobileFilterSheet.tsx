'use client';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CategoryFilter } from './CategoryFilter';
import { useOverlay } from '@/lib/hooks/useOverlay';

interface Props { categories: string[]; active?: string; }

export function MobileFilterSheet({ categories, active }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { mounted, state } = useOverlay({ open, onClose: () => setOpen(false), panelRef });

  if (categories.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="h-10 inline-flex items-center gap-2 rounded-full border border-mist-d bg-paper px-4 text-[12.5px] font-medium text-ink hover:bg-warm active:scale-[0.98] transition-[background-color,transform] duration-150"
      >
        <FilterIcon />
        Filtrar
        {active && <span className="w-1.5 h-1.5 rounded-full bg-clay shrink-0" />}
      </button>

      {mounted && createPortal(
        <div className="overlay-backdrop fixed inset-0 z-50 flex items-end" data-state={state} onClick={() => setOpen(false)}>
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-sheet-title"
            data-variant="sheet"
            className="overlay-panel w-full bg-paper border-t border-mist rounded-t-3xl overflow-hidden shadow-2xl max-h-[75dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
            onClick={e => e.stopPropagation()}
          >
            <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-mist-d shrink-0" />
            <div className="flex items-center justify-between px-6 pt-3 pb-4 border-b border-mist shrink-0">
              <p id="filter-sheet-title" className="font-display font-normal text-ink text-[1.3rem] leading-none">Filtrar produtos</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar filtros"
                className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-faint hover:text-ink hover:bg-warm active:scale-90 transition-[color,background-color,transform] duration-150"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto overscroll-contain flex-1">
              <CategoryFilter categories={categories} active={active} onClose={() => setOpen(false)} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}
