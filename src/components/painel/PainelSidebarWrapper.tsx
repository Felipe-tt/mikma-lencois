'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { PainelSidebar } from './PainelSidebar';

export function PainelSidebarWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="flex min-h-screen bg-[#F0EAE1]">
      {/* Sidebar desktop */}
      <div className="hidden lg:block sticky top-0 h-screen self-start">
        <PainelSidebar />
      </div>

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#1E1208]/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer mobile */}
      <div className={`fixed top-0 left-0 z-50 h-full lg:hidden transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <PainelSidebar onClose={() => setOpen(false)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-[60px] border-b border-[#E6DFD5] bg-[#FAF8F5] sticky top-0 z-30">
          <button
            onClick={() => setOpen(true)}
            className="p-2 -ml-2 text-[#705A48] hover:text-[#1E1208] hover:bg-[#F0EBE1] transition-colors rounded-sm"
            aria-label="Abrir menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
          <span className="font-display text-base text-[#1E1208]">Painel</span>
        </div>

        <main className="flex-1 p-5 sm:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
