'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { PainelSidebar } from './PainelSidebar';
import { NotificationBell } from './NotificationBell';

// Distância mínima (px) pro gesto contar como swipe intencional, e não
// um toque acidental ou scroll vertical.
const SWIPE_THRESHOLD = 60;
// Só considera abrir o menu se o toque começar perto da borda esquerda
// da tela — evita conflito com swipes de conteúdo (carrossel, etc).
const EDGE_ZONE = 24;

export function PainelSidebarWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Gesto de swipe pra abrir/fechar o menu no mobile. Aberto: swipe pra
  // qualquer lugar do drawer fecha ao arrastar pra esquerda. Fechado:
  // só abre se o gesto começar perto da borda esquerda da tela (evita
  // interceptar swipes horizontais de outros elementos, tipo carrosséis).
  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!open && t.clientX > EDGE_ZONE) {
        touchStart.current = null;
        return;
      }
      touchStart.current = { x: t.clientX, y: t.clientY };
    }

    function onTouchEnd(e: TouchEvent) {
      if (!touchStart.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.current.x;
      const dy = t.clientY - touchStart.current.y;
      touchStart.current = null;

      // Ignora se o movimento vertical dominar (é scroll, não swipe lateral)
      if (Math.abs(dy) > Math.abs(dx)) return;

      if (!open && dx > SWIPE_THRESHOLD) setOpen(true);
      if (open && dx < -SWIPE_THRESHOLD) setOpen(false);
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [open]);

  return (
    <div className="flex min-h-screen bg-warm">
      {/* Sidebar desktop */}
      <div className="hidden lg:block sticky top-0 h-screen self-start overflow-hidden">
        <PainelSidebar />
      </div>

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(30,18,8,0.5)] backdrop-blur-sm lg:hidden"
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
        <div className="lg:hidden flex items-center gap-3 px-4 h-[60px] border-b border-mist bg-paper sticky top-0 z-30">
          <button
            onClick={() => setOpen(true)}
            className="p-2 -ml-2 text-mid hover:text-ink hover:bg-warm transition-colors rounded-sm"
            aria-label="Abrir menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
          <span className="font-display text-base text-ink">Painel</span>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>

        <main className="flex-1 p-5 sm:p-8 overflow-y-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
