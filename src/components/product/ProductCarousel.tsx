'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import type { Product } from '@/types';
import { ProductCard } from './ProductCard';

interface Props {
  products: Product[];
}

/**
 * Carrossel horizontal de produtos com setas, snap-scroll e fade nas bordas
 * pra indicar que tem mais conteúdo. Scroll nativo (funciona com swipe no
 * touch e trackpad) — as setas só dão um empurrão de "uma tela" por vez.
 */
export function ProductCarousel({ products }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, products.length]);

  const scrollByStep = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>('[data-carousel-item]');
    const step = item ? item.offsetWidth + 12 : el.clientWidth * 0.85;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  if (products.length === 0) return null;

  return (
    <div className="relative">
      {/* Setas — desktop, alinhadas com o título da seção */}
      <div className="hidden sm:flex absolute -top-[60px] right-0 gap-2">
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          disabled={!canPrev}
          aria-label="Ver produtos anteriores"
          className="w-9 h-9 flex items-center justify-center border border-mist text-mid transition-colors duration-150 hover:border-ink hover:text-ink disabled:opacity-25 disabled:pointer-events-none"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button
          type="button"
          onClick={() => scrollByStep(1)}
          disabled={!canNext}
          aria-label="Ver mais produtos"
          className="w-9 h-9 flex items-center justify-center border border-mist text-mid transition-colors duration-150 hover:border-ink hover:text-ink disabled:opacity-25 disabled:pointer-events-none"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      <div className="relative">
        {/* Fades nas bordas — só aparecem quando há mais conteúdo pra esse lado */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 bottom-0 w-10 sm:w-16 z-10 bg-gradient-to-r from-paper to-transparent transition-opacity duration-200 ${canPrev ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute right-0 top-0 bottom-0 w-10 sm:w-16 z-10 bg-gradient-to-l from-paper to-transparent transition-opacity duration-200 ${canNext ? 'opacity-100' : 'opacity-0'}`}
        />

        <div
          ref={trackRef}
          className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-pl-1 pb-1"
        >
          {products.map((p, i) => (
            <div
              key={p.id}
              data-carousel-item
              className="snap-start shrink-0 w-[44%] sm:w-[30%] lg:w-[22.5%]"
            >
              <ProductCard product={p} priority={i < 2} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
