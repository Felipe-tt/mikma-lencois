'use client';
import Image from 'next/image';
import { BrandLogo } from '@/components/BrandLogo';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { useState } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { useWishlist } from '@/lib/hooks/useWishlist';
import { useAuthModal } from '@/lib/auth/AuthModalContext';

interface Props {
  product: Product;
  priority?: boolean;
  lowStock?: boolean;
}

export function ProductCard({ product, priority = false, lowStock = false }: Props) {
  const img0 = product.images?.[0] ?? null;
  const img1 = product.images?.[1] ?? null;
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { isFavorite, toggle } = useWishlist();
  const { requireAuth } = useAuthModal();
  const favorite = isFavorite(product.id);
  // Só anima o coração quando a pessoa toca: sem isso, todos os favoritos
  // "pulavam" juntos quando a lista carregava.
  const [pops, setPops] = useState(0);

  const isNew        = product.tags?.includes('novo') || product.tags?.includes('new');
  const isBestSeller = product.tags?.includes('bestseller') || product.tags?.includes('mais vendido');
  const badge        = isNew ? 'Novo' : isBestSeller ? 'Destaque' : null;

  function handleFavoriteClick() {
    requireAuth(() => { setPops(n => n + 1); void toggle(product.id); }, 'Entre para salvar nos favoritos.');
  }

  // O botão de favoritar fica como irmão do link (não dentro dele): botão
  // dentro de <a> é interativo aninhado, e leitor de tela/teclado se perdiam.
  // Meta e cores pra dar hierarquia ao card (antes era só nome + preço em
  // 12px, todos iguais): categoria · tecido em cima, bolinhas das cores.
  const fabric = product.variants?.[0]?.fabric;
  const meta = [product.category, fabric].filter(Boolean).join(' · ');
  const swatches = Array.from(new Set(
    (product.variants ?? []).map(v => v.color).filter((c): c is string => !!c && c.startsWith('#')),
  )).slice(0, 4);

  return (
    <div
      className="group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NavLink
        href={`/produtos/${product.id}`}
        className="block focus-visible:outline-offset-4"
      >
        {/* Imagem */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-warm [transform:translateZ(0)]">
          {img0 && !imgError ? (
            <>
              <Image
                src={img0} alt={product.name} fill priority={priority}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className={`object-cover transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
                  img1 && hovered ? 'opacity-0 scale-[1.03]' : hovered ? 'scale-[1.04]' : 'scale-100'
                }`}
                onError={() => setImgError(true)}
              />
              {img1 && (
                <Image
                  src={img1} alt="" fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className={`object-cover transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
                    hovered ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]'
                  }`}
                />
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center bg-warm">
              <BrandLogo alt="" className="w-28 h-auto opacity-[0.12]" />
            </div>
          )}

          {/* Selos: theme-locked porque ficam sobre a foto (no escuro o "Destaque" virava creme e sumia) */}
          {(badge || lowStock) && (
            <div className="theme-locked absolute top-3 left-3 flex flex-col items-start gap-1.5 z-10">
              {badge && (
                <span className={`text-[9px] font-semibold tracking-[0.16em] uppercase px-2.5 py-[5px] leading-none rounded-full ${
                  isNew ? 'bg-paper/95 text-ink' : 'bg-ink text-paper'
                }`}>{badge}</span>
              )}
              {lowStock && (
                <span className="bg-paper/95 text-clay text-[9px] font-semibold tracking-[0.16em] uppercase px-2.5 py-[5px] leading-none rounded-full">
                  Últimas peças
                </span>
              )}
            </div>
          )}

          {/* "Ver produto" que sobe no hover (só em quem tem mouse) */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-3 hidden [@media(hover:hover)]:flex items-center justify-between bg-paper/90 backdrop-blur-sm rounded-full px-4 py-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-ink opacity-0 translate-y-2 transition-[opacity,transform] duration-300 ease-out group-hover:opacity-100 group-hover:translate-y-0">
            Ver produto
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </div>
        </div>

        {/* Info */}
        <div className="pt-3.5 pb-1">
          {meta && (
            <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-faint mb-1.5 truncate">{meta}</p>
          )}
          <p className="text-[13.5px] sm:text-[14px] text-ink leading-snug line-clamp-2 underline-offset-[5px] decoration-mist-d decoration-1 group-hover:underline">
            {product.name}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <p className="font-display text-[1.15rem] text-ink font-normal leading-none tracking-[-0.01em] tabular-nums">
              {formatCurrency(product.price)}
            </p>
            {swatches.length > 0 && (
              <span role="img" className="flex items-center -space-x-1" aria-label={`${swatches.length} ${swatches.length === 1 ? 'cor' : 'cores'}`}>
                {swatches.map(c => (
                  <span key={c} className="w-3 h-3 rounded-full ring-1 ring-ink/15 ring-offset-1 ring-offset-paper" style={{ backgroundColor: c }} />
                ))}
              </span>
            )}
          </div>
        </div>
      </NavLink>

      {/* Favoritar */}
      <button
        type="button"
        onClick={handleFavoriteClick}
        aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        aria-pressed={favorite}
        className={`theme-locked absolute top-2.5 right-2.5 z-10 w-10 h-10 flex items-center justify-center bg-paper/85 backdrop-blur-sm rounded-full transition-[opacity,transform] duration-200 hover:scale-110 active:scale-90 focus-visible:opacity-100 ${
          favorite ? '' : '[@media(hover:hover)]:opacity-0 group-hover:opacity-100'
        }`}
      >
        <svg key={pops} width="16" height="16" viewBox="0 0 24 24"
          fill={favorite ? '#b45744' : 'none'}
          stroke={favorite ? '#b45744' : 'currentColor'}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={favorite ? (pops > 0 ? 'animate-heart-pop' : '') : 'text-ink/70'}
        >
          <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" />
        </svg>
      </button>
    </div>
  );
}
