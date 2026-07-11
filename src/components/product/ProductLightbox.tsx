'use client';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  images: string[];
  name: string;
  active: number;
  onActiveChange: (i: number) => void;
  onClose: () => void;
}

const ZOOM_SCALE = 2.6;

/**
 * Visualizador de foto em tela cheia com zoom de verdade — padrão tipo
 * Instagram/Mercado Livre: toca uma vez pra ampliar no ponto que tocou,
 * arrasta pra ver os detalhes, toca de novo pra voltar ao tamanho normal.
 * Enquanto não tá ampliado, arrastar pros lados troca de foto.
 */
export function ProductLightbox({ images, name, active, onActiveChange, onClose }: Props) {
  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // em %, relativo ao centro
  const [origin, setOrigin] = useState({ x: 50, y: 50 }); // ponto do toque, em %
  const frameRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const didDrag = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const prev = useCallback(() => onActiveChange((active - 1 + images.length) % images.length), [active, images.length, onActiveChange]);
  const next = useCallback(() => onActiveChange((active + 1) % images.length), [active, images.length, onActiveChange]);

  // Trava o scroll da página por trás e permite fechar/navegar pelo teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!zoomed) {
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
      }
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [onClose, next, prev, zoomed]);

  // Trocar de foto sempre volta pro tamanho normal — evita abrir a próxima já ampliada num ponto sem sentido
  useEffect(() => { setZoomed(false); setPan({ x: 0, y: 0 }); }, [active]);

  function toggleZoomAt(clientX: number, clientY: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (zoomed) {
      setZoomed(false);
      setPan({ x: 0, y: 0 });
    } else {
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      setOrigin({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
      setPan({ x: 0, y: 0 });
      setZoomed(true);
    }
  }

  function clampPan(x: number, y: number) {
    // Limite generoso o bastante pra não deixar a imagem sumir da tela arrastando demais
    const limit = (ZOOM_SCALE - 1) * 50;
    return { x: Math.min(limit, Math.max(-limit, x)), y: Math.min(limit, Math.max(-limit, y)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (zoomed) {
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      didDrag.current = false;
    } else {
      swipeStart.current = { x: e.clientX, y: e.clientY };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (zoomed && dragStart.current && rect) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag.current = true;
      const nx = dragStart.current.panX + (dx / rect.width) * 100;
      const ny = dragStart.current.panY + (dy / rect.height) * 100;
      setPan(clampPan(nx, ny));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (zoomed) {
      dragStart.current = null;
      return;
    }
    if (swipeStart.current) {
      const dx = e.clientX - swipeStart.current.x;
      const dy = e.clientY - swipeStart.current.y;
      swipeStart.current = null;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        dx < 0 ? next() : prev();
        return;
      }
    }
    if (!didDrag.current) toggleZoomAt(e.clientX, e.clientY);
    didDrag.current = false;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col" role="dialog" aria-modal aria-label={`Foto de ${name} ampliada`}>
      {/* Topo: contador + fechar — sempre visível, alvo de toque grande */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 relative z-10">
        <p className="text-[12px] text-white/50 font-medium tracking-[0.05em]">
          {images.length > 1 ? `${active + 1} / ${images.length}` : name}
        </p>
        <button
          onClick={onClose}
          className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors"
          aria-label="Fechar"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Área da foto — toca pra ampliar/reduzir, arrasta pra ver detalhe (ampliado) ou trocar de foto */}
      <div
        ref={frameRef}
        className="relative flex-1 overflow-hidden touch-none select-none"
        style={{ cursor: zoomed ? 'grab' : 'zoom-in' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragStart.current = null; swipeStart.current = null; }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: zoomed ? `scale(${ZOOM_SCALE}) translate(${pan.x}%, ${pan.y}%)` : 'scale(1)',
            transformOrigin: `${origin.x}% ${origin.y}%`,
            transition: dragStart.current ? 'none' : 'transform 0.25s ease',
          }}
        >
          <Image
            src={images[active]}
            alt={`${name} — foto ${active + 1}`}
            fill
            sizes="100vw"
            className="object-contain pointer-events-none"
            priority
          />
        </div>

        {/* Setas de navegação — só fazem sentido sem estar ampliado */}
        {images.length > 1 && !zoomed && (
          <>
            <button
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
              onClick={e => { e.stopPropagation(); prev(); }}
              aria-label="Foto anterior"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
              onClick={e => { e.stopPropagation(); next(); }}
              aria-label="Próxima foto"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </>
        )}

        {/* Dica de que dá pra ampliar — some depois da primeira interação */}
        {!zoomed && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full text-[11px] text-white/70 pointer-events-none">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            Toque na foto pra ampliar
          </div>
        )}
      </div>

      {/* Miniaturas — só quando não está ampliado, pra não competir com o gesto de arrastar */}
      {images.length > 1 && !zoomed && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-none shrink-0">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => onActiveChange(i)}
              className={`relative aspect-square w-12 shrink-0 overflow-hidden rounded-sm border transition-colors ${
                active === i ? 'border-white' : 'border-white/20'
              }`}
              aria-label={`Ver foto ${i + 1}`}
            >
              <Image src={img} alt="" fill sizes="48px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
