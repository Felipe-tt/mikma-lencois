'use client';
import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Props { images: string[]; name: string; tag?: string; }

export function ProductGallery({ images, name, tag }: Props) {
  const [active, setActive]     = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom]         = useState(false);
  const [zoomPos, setZoomPos]   = useState({ x: 50, y: 50 });
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const justSwiped   = useRef(false);

  const prev = useCallback(() => setActive(a => (a - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setActive(a => (a + 1) % images.length), [images.length]);

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

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!zoom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  }

  const hasImages = images.length > 0;

  return (
    <>
      {/* Padrão Amazon/ML: trilha de miniaturas verticais à esquerda no
          desktop, imagem principal grande ao lado. No mobile vira carrossel
          full-width com dots + swipe. */}
      <div className="flex gap-3 sm:gap-4">

        {images.length > 1 && (
          <div className="hidden sm:flex flex-col gap-2 w-[64px] shrink-0 max-h-[560px] overflow-y-auto scrollbar-none">
            {images.slice(0, 10).map((img, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`relative aspect-square shrink-0 overflow-hidden bg-[#F3EFE8] border transition-colors duration-150 focus:outline-none ${
                  active === i ? 'border-ink border-2' : 'border-mist/60 hover:border-ink/40'
                }`}
                aria-label={`Ver foto ${i + 1}`}
              >
                <Image src={img} alt="" fill sizes="64px" className="object-contain p-1" />
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div
            className={`group relative aspect-square overflow-hidden bg-[#F3EFE8] select-none ${hasImages ? 'cursor-zoom-in' : ''}`}
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
              <div className="absolute inset-0 p-6 sm:p-10">
                <div className="relative w-full h-full">
                  <Image
                    src={images[active]}
                    alt={`${name} — foto ${active + 1}`}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-contain"
                    style={zoom ? {
                      transform: 'scale(1.7)',
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

            {tag && (
              <span className="absolute top-4 left-4 bg-ink text-paper text-[9px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 pointer-events-none">
                {tag}
              </span>
            )}

            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none sm:hidden">
                {images.slice(0, 8).map((_, i) => (
                  <div key={i} className={`rounded-full transition-all duration-200 ${i === active ? 'bg-ink w-5 h-1.5' : 'bg-ink/25 w-1.5 h-1.5'}`} />
                ))}
              </div>
            )}

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

            {hasImages && !zoom && (
              <div className="absolute bottom-3 right-3 hidden sm:flex items-center gap-1.5 bg-ink/70 backdrop-blur-sm px-2.5 py-1.5 text-[10px] text-paper font-medium pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                Passe o mouse para ampliar
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex sm:hidden gap-2 overflow-x-auto scrollbar-none">
              {images.slice(0, 10).map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`relative aspect-square w-14 shrink-0 overflow-hidden bg-[#F3EFE8] border transition-colors duration-150 ${
                    active === i ? 'border-ink border-2' : 'border-mist/60'
                  }`}
                  aria-label={`Ver foto ${i + 1}`}
                >
                  <Image src={img} alt="" fill sizes="56px" className="object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-[#0c0c0c] flex items-center justify-center"
          onClick={() => setLightbox(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={e => {
            if (touchStartX.current === null || touchStartY.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
            touchStartX.current = null;
          }}
        >
          <div className="absolute inset-0 overflow-hidden">
            <Image src={images[active]} alt="" fill aria-hidden sizes="100vw" className="object-cover blur-3xl opacity-25 scale-110" />
          </div>

          <button
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setLightbox(false)}
            aria-label="Fechar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>

          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
                onClick={e => { e.stopPropagation(); prev(); }}
                aria-label="Anterior"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
                onClick={e => { e.stopPropagation(); next(); }}
                aria-label="Próxima"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </>
          )}

          <div
            className="relative w-full h-full flex items-center justify-center px-6 py-16 sm:px-20 sm:py-14 z-[1]"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={images[active]}
              alt={`${name} — foto ${active + 1}`}
              fill
              sizes="100vw"
              className="object-contain drop-shadow-[0_25px_45px_rgba(0,0,0,0.5)]"
              priority
            />
          </div>

          {images.length > 1 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-[1]">
              <div className="flex gap-1.5">
                {images.map((_, i) => (
                  <div key={i} className={`rounded-full transition-all duration-200 ${i === active ? 'bg-white w-5 h-1.5' : 'bg-white/30 w-1.5 h-1.5'}`} />
                ))}
              </div>
              <p className="text-[11px] text-white/35 font-medium tracking-[0.1em]">
                {active + 1} / {images.length}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
