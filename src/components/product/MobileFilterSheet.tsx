'use client';
import { useState } from 'react';
import { CategoryFilter } from './CategoryFilter';

interface Props { categories: string[]; active?: string; }

export function MobileFilterSheet({ categories, active }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-outline lg:hidden text-xs py-2 px-4 flex items-center gap-2"
      >
        <FilterIcon />
        Filtrar
        {active && <span className="w-1.5 h-1.5 rounded-full bg-gold-600" />}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-stone-900/40 animate-fade-in"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-stone-50 rounded-t-xl p-6 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between mb-6">
              <p className="text-base font-semibold text-stone-900">Filtrar</p>
              <button onClick={() => setOpen(false)} className="btn-ghost p-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <CategoryFilter categories={categories} active={active} onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}
