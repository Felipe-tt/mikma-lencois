'use client';
import { useState, useEffect } from 'react';
import { CategoryFilter } from './CategoryFilter';

interface Props { categories: string[]; active?: string; }

export function MobileFilterSheet({ categories, active }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (categories.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-outline flex items-center gap-2 text-xs py-2 px-4"
      >
        <FilterIcon />
        Filtrar
        {active && <span className="w-1.5 h-1.5 rounded-full bg-clay shrink-0" />}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[rgba(30,18,8,0.4)] animate-fade-in"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-paper border-t border-mist rounded-t-xl shadow-2xl animate-fade-up max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-mist shrink-0">
              <p className="font-semibold text-ink text-base">Filtrar produtos</p>
              <button onClick={() => setOpen(false)} className="btn-ghost p-1.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1">
              <CategoryFilter categories={categories} active={active} onClose={() => setOpen(false)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function FilterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}
