'use client';
import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Props { images: string[]; name: string; tag?: string; }

export function ProductGallery({ images, name, tag }: Props) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const justSwiped = useRef(false);

  const prev = useCallback(() => setActive(a => (a - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setActive(a => (a + 1) % images.length), [images.length]);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
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

  const hasImages = images.length > 0;

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {/* Foto principal — fundo neutro chapado, sem blur/efeito */}
        <div
          className={`group relative aspect-square sm:aspect-[4/5] overflow-hidden bg-[#FAF8F4] border border-mist select-none ${hasImages ? 'cursor-zoom-in' : ''}`}
          onClick={() => {
            if (!hasImages) return;
            if (justSwiped.current) { justSwiped.current = false; return; }
            setLightbox(true);
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {hasImages ? (
            <Image
              src={images[active]}
              alt={`${name} — foto ${active + 1}`}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain p-6 sm:p-10"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="font-display text-6xl text-faint select-none">M</span>
            </div>
          )}

          {tag && (
            <span className="absolute top-3 left-3 bg-ink text-paper text-[9px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 pointer-events-none">
              {tag}
            </span>
          )}

          {images.length > 1 && (
            <span className="absolute bottom-3 right-3 sm:hidden bg-ink/75 text-paper text-[11px] font-medium tabular-nums px-2 py-1 pointer-events-none">
              {active + 1}/{images.length}
            </span>
          )}

          {images.length > 1 && (
            <>
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-paper/90 border border-mist flex items-center justify-center text-ink/70 opacity-0 group-hover:opacity-100 sm:transition-opacity hover:text-ink"
                onClick={e => { e.stopPropagation(); prev(); }}
                aria-label="Foto anterior"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-paper/90 border border-mist flex items-center justify-center text-ink/70 opacity-0 group-hover:opacity-100 sm:transition-opacity hover:text-ink"
                onClick={e => { e.stopPropagation(); next(); }}
                aria-label="Próxima foto"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </>
          )}
        </div>

        {/* Thumbnails — visíveis em qualquer tela, scroll horizontal no mobile */}
        {images.length > 1 && (
          <div className="flex sm:grid sm:grid-cols-4 gap-2 overflow-x-auto sm:overflow-visible scrollbar-none -mx-1 px-1 sm:mx-0 sm:px-0">
            {images.slice(0, 8).map((img, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`relative shrink-0 w-16 h-16 sm:w-auto sm:aspect-square sm:h-auto overflow-hidden bg-[#FAF8F4] border transition-colors duration-150 focus:outline-none ${
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

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-[#151210] flex items-center justify-center"
          onClick={() => setLightbox(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={e => {
            if (touchStartX.current === null || touchStartY.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
            touchStartX.current = null;
          }}
        >
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

          <div className="relative w-full h-full flex items-center justify-center px-6 py-16 sm:px-20 sm:py-14 z-[1] pointer-events-none">
            <Image
              src={images[active]}
              alt={`${name} — foto ${active + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
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
