'use client';
import Image from 'next/image';
import { useEffect, useRef, useState, ViewTransition } from 'react';
import 'photoswipe/style.css';

// productId: liga a foto grande à foto do cartão do produto (transição).
interface Props { images: string[]; name: string; tag?: string; productId?: string; }

// Tamanho usado como "fallback" pra abrir na hora, sem esperar carregar as
// dimensões reais da imagem. Assim que a imagem real carrega, o PhotoSwipe
// já reajusta sozinho, na prática o usuário nunca percebe.
const FALLBACK_SIZE = { w: 1600, h: 1600 };

export function ProductGallery({ images, name, tag, productId }: Props) {
  const [active, setActive] = useState(0);
  const lightboxRef = useRef<import('photoswipe/lightbox').default | null>(null);
  const dimsRef = useRef<Record<string, { w: number; h: number }>>({});

  // Descobre a dimensão real de cada foto em segundo plano (só um <img> na
  // memória, não vai pra tela), o PhotoSwipe usa isso pra calcular até
  // onde dá pra ampliar e não deixar a foto "vazando" da tela.
  useEffect(() => {
    images.forEach(src => {
      if (dimsRef.current[src]) return;
      const img = new window.Image();
      img.onload = () => { dimsRef.current[src] = { w: img.naturalWidth, h: img.naturalHeight }; };
      img.src = src;
    });
  }, [images]);

  // PhotoSwipe só existe no navegador (mexe com DOM/touch direto), import
  // dinâmico dentro do useEffect garante que nunca roda no servidor.
  useEffect(() => {
    if (images.length === 0) return;
    let disposed = false;

    (async () => {
      const { default: PhotoSwipeLightbox } = await import('photoswipe/lightbox');
      if (disposed) return;

      const icon = (d: string) =>
        `<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 24 24" width="22" height="22"><path d="${d}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const lightbox = new PhotoSwipeLightbox({
        pswpModule: () => import('photoswipe'),
        dataSource: images.map(src => {
          const dims = dimsRef.current[src];
          return { src, width: dims?.w ?? FALLBACK_SIZE.w, height: dims?.h ?? FALLBACK_SIZE.h, alt: name };
        }),
        // Visual da loja (fundo claro, botões redondos, nome do produto e
        // miniaturas) no lugar do tema padrão preto do PhotoSwipe, que
        // parecia genérico. Estilos em globals.css (.mk-pswp).
        mainClass: 'mk-pswp',
        // Opaco: com 0.96 o cabeçalho e a barra de compra da página apareciam
        // por trás da foto, poluindo a visualização.
        bgOpacity: 1,
        showHideAnimationType: 'zoom',
        zoomAnimationDuration: 250,
        wheelToZoom: true,
        // Sem a lupa e o contador "1 / 3": ampliar é tocar/clicar na foto,
        // e a posição aparece nos pontinhos/miniaturas.
        zoom: false,
        counter: false,
        closeTitle: 'Fechar',
        arrowPrevTitle: 'Foto anterior',
        arrowNextTitle: 'Próxima foto',
        closeSVG: icon('M6 6l12 12M18 6L6 18'),
        arrowPrevSVG: icon('M15 5l-7 7 7 7'),
        // A biblioteca espelha o ícone da seta seguinte: mesmo desenho da anterior.
        arrowNextSVG: icon('M15 5l-7 7 7 7'),
        errorMsg: 'Não foi possível carregar esta foto.',
        // Espaço para o topo (nome e fechar) e a base (pontinhos/miniaturas).
        paddingFn: (viewport) => viewport.x >= 1024
          ? { top: 76, bottom: images.length > 1 ? 104 : 32, left: 88, right: 88 }
          : { top: 64, bottom: images.length > 1 ? 44 : 16, left: 0, right: 0 },
      });

      lightbox.on('uiRegister', () => {
        const pswp = lightbox.pswp;
        if (!pswp) return;
        // Nome do produto e posição ("2 de 3") no topo.
        pswp.ui?.registerElement({
          name: 'mk-title',
          appendTo: 'bar',
          order: 5,
          onInit: (el, p) => {
            el.className = 'mk-pswp-title';
            const update = () => {
              el.innerHTML = '';
              const t = document.createElement('span');
              t.className = 'mk-pswp-name';
              t.textContent = name;
              el.appendChild(t);
              if (p.getNumItems() > 1) {
                const c = document.createElement('span');
                c.className = 'mk-pswp-count';
                c.textContent = `${p.currIndex + 1} de ${p.getNumItems()}`;
                el.appendChild(c);
              }
            };
            p.on('change', update);
            update();
          },
        });
        if (images.length < 2) return;
        // Celular: pontinhos. Computador: miniaturas clicáveis.
        pswp.ui?.registerElement({
          name: 'mk-thumbs',
          appendTo: 'root',
          onInit: (el, p) => {
            el.className = 'mk-pswp-thumbs';
            const btns = images.map((src, i) => {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'mk-pswp-thumb';
              b.setAttribute('aria-label', `Ver foto ${i + 1}`);
              const img = document.createElement('img');
              img.src = src; img.alt = ''; img.loading = 'lazy';
              b.appendChild(img);
              b.addEventListener('click', () => p.goTo(i));
              el.appendChild(b);
              return b;
            });
            const update = () => btns.forEach((b, i) => {
              const on = i === p.currIndex;
              b.classList.toggle('is-active', on);
              if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
            });
            p.on('change', update);
            update();
          },
        });
      });

      // Mantém a foto ativa da página sincronizada com a que tá aberta no
      // visualizador, se o usuário navegar lá dentro e fechar, a miniatura
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

  // Swipe no celular: arrastar a foto pro lado troca de foto (antes só
  // dava pelas setinhas). Um arrasto não conta como toque pra ampliar.
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch' || images.length < 2) return;
    swipe.current = { x: e.clientX, y: e.clientY, moved: false };
  }
  function onPointerUp(e: React.PointerEvent) {
    const start = swipe.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      start.moved = true;
      if (dx < 0) next(); else prev();
    }
  }
  function onZoomClick() {
    if (swipe.current?.moved) { swipe.current = null; return; }
    swipe.current = null;
    if (hasImages) openAt(active);
  }

  return (
    <div className="flex gap-3 sm:gap-4">
      {/* Trilha de miniaturas, desktop */}
      {images.length > 1 && (
        <div className="hidden lg:flex flex-col gap-2.5 w-[72px] shrink-0 max-h-[600px] overflow-y-auto scrollbar-none p-1 -m-1">
          {images.slice(0, 10).map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`relative aspect-[4/5] shrink-0 overflow-hidden rounded-xl bg-warm transition-[opacity,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                active === i ? 'opacity-100 ring-1 ring-ink ring-offset-2 ring-offset-paper' : 'opacity-55 hover:opacity-100'
              }`}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={active === i ? 'true' : undefined}
            >
              <Image src={img} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Mesmo nome da foto do cartão (ProductCard): a foto do cartão cresce
            até aqui ao abrir o produto. Só com productId, para não colidir. */}
        <ViewTransition name={productId ? `produto-${productId}` : undefined} share="morph" default="none">
        <div
          className={`sd-zoom-scope group relative aspect-[4/5] overflow-hidden rounded-2xl bg-warm [transform:translateZ(0)] select-none touch-pan-y ${hasImages ? 'cursor-zoom-in' : ''}`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipe.current = null; }}
        >
          {hasImages && (
            // Botão cobrindo a foto: ampliar também pelo teclado (antes era
            // só onClick numa div, inacessível sem mouse).
            <button
              type="button"
              onClick={onZoomClick}
              aria-label={`Ampliar foto ${active + 1} de ${images.length}`}
              className="absolute inset-0 z-[1] cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-4"
            />
          )}
          {hasImages ? (
            <div className="absolute inset-0">
              {/* Zoom no tecido enquanto a foto sai da tela (CSS .sd-zoom). */}
              <div className="sd-zoom relative w-full h-full">
                <Image
                  src={images[active]}
                  alt={`${name}, foto ${active + 1}`}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 45vw"
                  className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover:scale-[1.03]"
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="font-display text-6xl text-faint select-none">M</span>
            </div>
          )}

          {tag && (
            <span className="absolute top-4 left-4 bg-ink text-paper text-[10px] font-semibold tracking-[0.14em] uppercase px-2.5 py-[5px] rounded-full pointer-events-none">
              {tag}
            </span>
          )}

          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none lg:hidden">
              {images.slice(0, 8).map((_, i) => (
                <div key={i} className={`rounded-full transition-all duration-200 ${i === active ? 'bg-ink w-5 h-1.5' : 'bg-ink/25 w-1.5 h-1.5'}`} />
              ))}
            </div>
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute z-[2] left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-paper/85 backdrop-blur-sm flex items-center justify-center text-ink/70 active:scale-90 transition-transform duration-150 lg:hidden"
                onClick={prev}
                aria-label="Foto anterior"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button
                type="button"
                className="absolute z-[2] right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-paper/85 backdrop-blur-sm flex items-center justify-center text-ink/70 active:scale-90 transition-transform duration-150 lg:hidden"
                onClick={next}
                aria-label="Próxima foto"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </>
          )}

          {hasImages && (
            <div className="absolute bottom-3 right-3 flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto sm:gap-1.5 bg-ink/70 backdrop-blur-sm sm:px-2.5 sm:py-1.5 rounded-full text-[10px] text-paper font-medium pointer-events-none">
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              <span className="hidden sm:inline">Ampliar</span>
            </div>
          )}
        </div>
        </ViewTransition>

        {images.length > 1 && (
          <div className="flex lg:hidden gap-2.5 overflow-x-auto scrollbar-none p-1 -m-1">
            {images.slice(0, 10).map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={`relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-lg bg-warm transition-[opacity,box-shadow] duration-200 ${
                  active === i ? 'opacity-100 ring-1 ring-ink ring-offset-2 ring-offset-paper' : 'opacity-55'
                }`}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={active === i ? 'true' : undefined}
              >
                <Image src={img} alt="" fill sizes="56px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
