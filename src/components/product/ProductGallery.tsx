'use client';
import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Props { images: string[]; name: string; tag?: string; }

export function ProductGallery({ images, name, tag }: Props) {
  const [active, setActive]   = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom]       = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  // swipe
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const justSwiped   = useRef(false);

  const prev = useCallback(() => setActive(a => (a - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setActive(a => (a + 1) % images.length), [images.length]);

  // keyboard
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      setLightbox(false);
      if (e.key === 'ArrowRight')  next();
      if (e.key === 'ArrowLeft')   prev();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [lightbox, next, prev]);

  // swipe handlers
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      dx < 0 ? next() : prev();
      justSwiped.current = true;
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  // zoom on hover (desktop)
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!zoom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  }

  const hasImages = images.length > 0;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* ── Main plate ── */}
        <div
          className={`relative aspect-[4/5] overflow-hidden bg-[#F3EFE8] shadow-[0_30px_60px_-32px_rgba(26,18,10,0.28)] select-none ${hasImages ? 'cursor-zoom-in' : ''}`}
          onClick={() => {
            if (!hasImages) return;
            if (justSwiped.current) { justSwiped.current = false; return; }
            setLightbox(true);
          }}
          onMouseEnter={() => hasImages && setZoom(true)}
          onMouseLeave={() => setZoom(false)}
          onMouseMove={handleMouseMove}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {hasImages ? (
            <div className="absolute inset-0 p-7 sm:p-11">
              <div className="relative w-full h-full">
                <Image
                  src={images[active]}
                  alt={`${name} — foto ${active + 1}`}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain"
                  style={zoom ? {
                    transform: 'scale(1.6)',
                    transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                    transition: 'transform-origin 0s',
                  } : { transition: 'transform 0.4s ease' }}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="font-display text-6xl text-faint select-none">M</span>
            </div>
          )}

          {/* Cantos — moldura de prancheta, motivo repetido no lightbox */}
          <span className="pointer-events-none absolute top-4 left-4 w-3.5 h-3.5 border-t border-l border-ink/20" />
          <span className="pointer-events-none absolute top-4 right-4 w-3.5 h-3.5 border-t border-r border-ink/20" />
          <span className="pointer-events-none absolute bottom-4 left-4 w-3.5 h-3.5 border-b border-l border-ink/20" />
          <span className="pointer-events-none absolute bottom-4 right-4 w-3.5 h-3.5 border-b border-r border-ink/20" />

          {/* Tag */}
          {tag && (
            <span className="absolute top-6 left-6 bg-ink text-paper text-[9px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 pointer-events-none">
              {tag}
            </span>
          )}

          {/* Indicadores (pontos) — mobile */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none sm:hidden">
              {images.slice(0, 8).map((_, i) => (
                <div key={i} className={`rounded-full transition-all duration-200 ${i === active ? 'bg-ink w-5 h-1.5' : 'bg-ink/25 w-1.5 h-1.5'}`} />
              ))}
            </div>
          )}

          {/* Navegação lateral — mobile */}
          {images.length > 1 && (
            <>
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-paper/80 backdrop-blur-sm flex items-center justify-center text-ink/70 sm:hidden"
                onClick={e => { e.stopPropagation(); prev(); }}
                aria-label="Anterior"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-paper/80 backdrop-blur-sm flex items-center justify-center text-ink/70 sm:hidden"
                onClick={e => { e.stopPropagation(); next(); }}
                aria-label="Próxima"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </>
          )}
        </div>

        {/* ── Legenda — índice da foto + abrir ampliada ── */}
        {hasImages && (
          <div className="flex items-center justify-between px-0.5">
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-faint">
              Nº {pad(active + 1)}<span className="text-mist mx-1.5">/</span>{pad(images.length)}
            </span>
            <button
              onClick={() => setLightbox(true)}
              className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.1em] uppercase text-faint hover:text-ink transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              Ampliar
            </button>
          </div>
        )}

        {/* ── Thumbnails — desktop only ── */}
        {images.length > 1 && (
          <div className="hidden sm:grid grid-cols-4 gap-2">
            {images.slice(0, 8).map((img, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`relative aspect-square overflow-hidden bg-[#F3EFE8] border transition-colors duration-150 focus:outline-none ${
                  active === i ? 'border-ink' : 'border-mist/60 hover:border-ink/40'
                }`}
                aria-label={`Ver foto ${i + 1}`}
              >
                <Image src={img} alt="" fill sizes="15vw" className="object-contain p-1.5" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'radial-gradient(ellipse at center, #16130f 0%, #0a0908 72%)' }}
          onClick={() => setLightbox(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={e => {
            if (touchStartX.current === null || touchStartY.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
            touchStartX.current = null;
          }}
        >
          {/* Cantos — mesmo motivo da prancha principal, agora na janela inteira */}
          <span className="pointer-events-none absolute top-6 left-6 w-4 h-4 border-t border-l border-white/20" />
          <span className="pointer-events-none absolute top-6 right-6 w-4 h-4 border-t border-r border-white/20" />
          <span className="pointer-events-none absolute bottom-6 left-6 w-4 h-4 border-b border-l border-white/20" />
          <span className="pointer-events-none absolute bottom-6 right-6 w-4 h-4 border-b border-r border-white/20" />

          {/* Close */}
          <button
            className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setLightbox(false)}
            aria-label="Fechar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>

          {/* Prev / Next */}
          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
                onClick={e => { e.stopPropagation(); prev(); }}
                aria-label="Anterior"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
                onClick={e => { e.stopPropagation(); next(); }}
                aria-label="Próxima"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </>
          )}

          {/* Image */}
          <div
            className="relative w-full h-full flex items-center justify-center px-6 py-16 sm:px-20 sm:py-14"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={images[active]}
              alt={`${name} — foto ${active + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </div>

          {/* Legenda — nome em serifa + índice, estilo etiqueta de galeria */}
          <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 pointer-events-none px-6 text-center">
            {images.length > 1 && (
              <div className="flex gap-1.5">
                {images.map((_, i) => (
                  <div key={i} className={`rounded-full transition-all duration-200 ${i === active ? 'bg-white w-5 h-1.5' : 'bg-white/30 w-1.5 h-1.5'}`} />
                ))}
              </div>
            )}
            <p className="font-display italic text-white/75 text-[15px]">{name}</p>
            <p className="font-mono text-[10px] text-white/35 tracking-[0.14em] uppercase">
              Nº {pad(active + 1)} / {pad(images.length)}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
