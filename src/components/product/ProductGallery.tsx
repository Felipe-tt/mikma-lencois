'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import 'photoswipe/style.css';

interface Props { images: string[]; name: string; tag?: string; }

// Tamanho usado como "fallback" pra abrir na hora, sem esperar carregar as
// dimensões reais da imagem. Assim que a imagem real carrega, o PhotoSwipe
// já reajusta sozinho — na prática o usuário nunca percebe.
const FALLBACK_SIZE = { w: 1600, h: 1600 };

export function ProductGallery({ images, name, tag }: Props) {
  const [active, setActive] = useState(0);
  const lightboxRef = useRef<import('photoswipe/lightbox').default | null>(null);
  const dimsRef = useRef<Record<string, { w: number; h: number }>>({});

  // Descobre a dimensão real de cada foto em segundo plano (só um <img> na
  // memória, não vai pra tela) — o PhotoSwipe usa isso pra calcular até
  // onde dá pra ampliar e não deixar a foto "vazando" da tela.
  useEffect(() => {
    images.forEach(src => {
      if (dimsRef.current[src]) return;
      const img = new window.Image();
      img.onload = () => { dimsRef.current[src] = { w: img.naturalWidth, h: img.naturalHeight }; };
      img.src = src;
    });
  }, [images]);

  // PhotoSwipe só existe no navegador (mexe com DOM/touch direto) — import
  // dinâmico dentro do useEffect garante que nunca roda no servidor.
  useEffect(() => {
    if (images.length === 0) return;
    let disposed = false;

    (async () => {
      const { default: PhotoSwipeLightbox } = await import('photoswipe/lightbox');
      if (disposed) return;

      const lightbox = new PhotoSwipeLightbox({
        pswpModule: () => import('photoswipe'),
        dataSource: images.map(src => {
          const dims = dimsRef.current[src];
          return { src, width: dims?.w ?? FALLBACK_SIZE.w, height: dims?.h ?? FALLBACK_SIZE.h, alt: name };
        }),
        bgOpacity: 0.96,
        showHideAnimationType: 'zoom',
        zoomAnimationDuration: 250,
        wheelToZoom: true,
      });

      // Mantém a foto ativa da página sincronizada com a que tá aberta no
      // visualizador — se o usuário navegar lá dentro e fechar, a miniatura
      // certa continua selecionada por trás.
      lightbox.on('change', () => {
        const idx = lightbox.pswp?.currIndex;
        if (typeof idx === 'number') setActive(idx);
      });

      lightbox.init();
      lightboxRef.current = lightbox;
    })();

    return () => {
      disposed = true;
      lightboxRef.current?.destroy();
      lightboxRef.current = null;
    };
  }, [images, name]);

  function openAt(index: number) {
    lightboxRef.current?.loadAndOpen(index);
  }

  const hasImages = images.length > 0;
  const prev = () => setActive(a => (a - 1 + images.length) % images.length);
  const next = () => setActive(a => (a + 1) % images.length);

  return (
    <div className="flex gap-3 sm:gap-4">
      {/* Trilha de miniaturas — desktop */}
      {images.length > 1 && (
        <div className="hidden sm:flex flex-col gap-2 w-[64px] shrink-0 max-h-[560px] overflow-y-auto scrollbar-none">
          {images.slice(0, 10).map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative aspect-square shrink-0 overflow-hidden bg-warm border transition-colors duration-150 focus:outline-none ${
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
          className={`group relative aspect-square overflow-hidden bg-warm select-none ${hasImages ? 'cursor-zoom-in' : ''}`}
          onClick={() => hasImages && openAt(active)}
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
                  className="object-contain transition-transform duration-300 group-hover:scale-105"
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
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-paper/85 backdrop-blur-sm flex items-center justify-center text-ink/70 sm:hidden"
                onClick={e => { e.stopPropagation(); prev(); }}
                aria-label="Foto anterior"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-paper/85 backdrop-blur-sm flex items-center justify-center text-ink/70 sm:hidden"
                onClick={e => { e.stopPropagation(); next(); }}
                aria-label="Próxima foto"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </>
          )}

          {hasImages && (
            <div className="absolute bottom-3 right-3 flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto sm:gap-1.5 bg-ink/70 backdrop-blur-sm sm:px-2.5 sm:py-1.5 rounded-full sm:rounded-none text-[10px] text-paper font-medium pointer-events-none">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              <span className="hidden sm:inline">Toque para ampliar</span>
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex sm:hidden gap-2 overflow-x-auto scrollbar-none">
            {images.slice(0, 10).map((img, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`relative aspect-square w-14 shrink-0 overflow-hidden bg-warm border transition-colors duration-150 ${
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
  );
}
