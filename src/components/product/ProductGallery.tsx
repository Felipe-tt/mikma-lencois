'use client';
import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';

interface Props {
  images: string[];
  name: string;
  tag?: string;
}

export function ProductGallery({ images, name, tag }: Props) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  // Close lightbox on Escape
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setLightbox(false);
    if (e.key === 'ArrowRight') setActive(a => (a + 1) % images.length);
    if (e.key === 'ArrowLeft')  setActive(a => (a - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (lightbox) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [lightbox, handleKey]);

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Main image — click to open lightbox */}
        <div
          className="relative aspect-[4/5] overflow-hidden bg-warm cursor-zoom-in group"
          onClick={() => images[active] && setLightbox(true)}
        >
          {images[active] ? (
            <Image
              src={images[active]}
              alt={name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-warm">
              <span className="font-display text-5xl text-faint select-none">M</span>
            </div>
          )}

          {/* Badge */}
          {tag && (
            <span className="absolute top-4 left-4 bg-ink text-paper text-[9px] font-bold tracking-[0.16em] uppercase px-3 py-1.5">
              {tag}
            </span>
          )}

          {/* Zoom hint */}
          {images[active] && (
            <div className="absolute bottom-4 right-4 bg-paper/80 backdrop-blur-sm px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink/60">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {images.slice(0, 8).map((img, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`relative aspect-square overflow-hidden bg-warm border-2 transition-all duration-150 ${
                  active === i ? 'border-ink' : 'border-transparent hover:border-mist'
                }`}
              >
                <Image src={img} alt={`${name} ${i + 1}`} fill sizes="15vw" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-ink/92 flex items-center justify-center animate-fade-in"
          onClick={() => setLightbox(false)}
        >
          {/* Close */}
          <button
            className="absolute top-5 right-5 text-paper/60 hover:text-paper transition-colors p-2"
            onClick={() => setLightbox(false)}
            aria-label="Fechar"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>

          {/* Prev / Next */}
          {images.length > 1 && (
            <>
              <button
                className="absolute left-5 top-1/2 -translate-y-1/2 text-paper/50 hover:text-paper transition-colors p-3"
                onClick={e => { e.stopPropagation(); setActive(a => (a - 1 + images.length) % images.length); }}
                aria-label="Anterior"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button
                className="absolute right-14 top-1/2 -translate-y-1/2 text-paper/50 hover:text-paper transition-colors p-3"
                onClick={e => { e.stopPropagation(); setActive(a => (a + 1) % images.length); }}
                aria-label="Próxima"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </>
          )}

          {/* Main image */}
          <div
            className="relative max-w-3xl max-h-[85vh] w-full mx-16"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={images[active]}
              alt={name}
              width={900}
              height={1125}
              className="object-contain max-h-[85vh] w-auto mx-auto"
            />
          </div>

          {/* Counter */}
          {images.length > 1 && (
            <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] text-paper/40 font-medium tracking-[0.12em]">
              {active + 1} / {images.length}
            </p>
          )}
        </div>
      )}
    </>
  );
}
