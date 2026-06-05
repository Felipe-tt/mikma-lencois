'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { PainelSidebar } from './PainelSidebar';

export function PainelSidebarWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Fecha ao navegar
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock scroll quando drawer aberto
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Sidebar desktop */}
      <div className="hidden lg:block">
        <PainelSidebar />
      </div>

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer mobile */}
      <div className={`fixed top-0 left-0 z-50 h-full lg:hidden transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <PainelSidebar onClose={() => setOpen(false)} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar mobile */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-mist bg-paper sticky top-0 z-30">
          <button
            onClick={() => setOpen(true)}
            className="btn-ghost p-2 -ml-2"
            aria-label="Abrir menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
          <span className="font-display text-lg text-ink">Painel</span>
        </div>

        <main className="flex-1 p-5 sm:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
