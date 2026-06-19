'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** URL/rota real que esse preview representa, ex: "/" ou "/sobre" — mostrado na barra do "navegador" */
  routeLabel: string;
  children: React.ReactNode;
}

export function PreviewModal({ open, onClose, title, routeLabel, children }: Props) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      style={{ background: 'rgba(30, 18, 8, 0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#FAF8F5] w-full max-h-full flex flex-col shadow-2xl animate-preview-in"
        style={{ maxWidth: viewport === 'mobile' ? 480 : 1180, borderRadius: '6px', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#1E1208] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E6553C]/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E8B339]/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#4FAE6E]/70" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[#FAF8F5] truncate">{title}</p>
              <p className="text-[10px] text-[#FAF8F5]/40 font-mono truncate">mikma.com.br{routeLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Viewport toggle */}
            <div className="flex items-center bg-[#FAF8F5]/10 p-0.5 rounded">
              <button
                onClick={() => setViewport('desktop')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded transition-colors ${
                  viewport === 'desktop' ? 'bg-[#FAF8F5] text-[#1E1208]' : 'text-[#FAF8F5]/60 hover:text-[#FAF8F5]'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>
                <span className="hidden sm:inline">Desktop</span>
              </button>
              <button
                onClick={() => setViewport('mobile')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded transition-colors ${
                  viewport === 'mobile' ? 'bg-[#FAF8F5] text-[#1E1208]' : 'text-[#FAF8F5]/60 hover:text-[#FAF8F5]'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
                <span className="hidden sm:inline">Mobile</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-[#FAF8F5]/60 hover:text-[#FAF8F5] hover:bg-[#FAF8F5]/10 rounded transition-colors"
              aria-label="Fechar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* ── Frame ── */}
        <div className="flex-1 overflow-auto bg-[#E6DFD5]" style={{ maxHeight: '78vh' }}>
          <div
            className="mx-auto bg-white transition-[max-width] duration-200"
            style={{ maxWidth: viewport === 'mobile' ? 420 : '100%' }}
          >
            {children}
          </div>
        </div>

        {/* ── Footer hint ── */}
        <div className="px-4 py-2.5 bg-[#FAF8F5] border-t border-[#E6DFD5] flex items-center justify-between shrink-0">
          <p className="text-[10px] text-[#B09C8C]">Pré-visualização ao vivo — reflete o que você digitou, ainda não salvo</p>
          <button onClick={onClose} className="text-[11px] font-semibold text-[#705A48] hover:text-[#1E1208] transition-colors">
            Fechar
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes preview-in {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-preview-in { animation: preview-in 0.18s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
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
      className="flex items-center gap-1.5 text-[11px] font-semibold text-[#C4714A] hover:text-[#1E1208] transition-colors shrink-0"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Visualizar
    </button>
  );
}
