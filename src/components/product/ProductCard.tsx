'use client';
import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { useState } from 'react';

interface Props {
  product: Product;
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: Props) {
  const img = product.images?.[0] ?? null;
  const [imgError, setImgError] = useState(false);
  const isNew = product.tags?.includes('novo') || product.tags?.includes('new');
  const isBestSeller = product.tags?.includes('bestseller') || product.tags?.includes('mais vendido');

  return (
    <Link href={`/produtos/${product.id}`} className="product-card group">
      {/* ── Image ── */}
      <div className="relative aspect-[3/4] overflow-hidden bg-warm">
        {img && !imgError ? (
          <Image
            src={img}
            alt={product.name}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-warm">
            <Image
              src="/logo-dark.png"
              alt="Mikma Lençóis"
              width={60}
              height={30}
              className="w-10 h-auto object-contain opacity-15"
            />
          </div>
        )}

        {/* Dark overlay on hover */}
        <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/8 transition-colors duration-400" />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {isNew && (
            <span className="bg-clay text-paper text-3xs font-bold tracking-[0.18em] uppercase px-2.5 py-1 leading-none">
              Novo
            </span>
          )}
          {isBestSeller && (
            <span className="bg-ink text-paper text-3xs font-bold tracking-[0.18em] uppercase px-2.5 py-1 leading-none">
              Top
            </span>
          )}
          {!isNew && !isBestSeller && product.tags?.[0] && (
            <span className="bg-warm-d text-ink text-3xs font-semibold tracking-[0.14em] uppercase px-2.5 py-1 leading-none border border-mist">
              {product.tags[0]}
            </span>
          )}
        </div>

        {/* Quick-add bar — slides up on hover */}
        <div className="absolute bottom-0 inset-x-0 translate-y-full group-hover:translate-y-0
                        transition-transform duration-300 ease-out">
          <div className="bg-paper/95 backdrop-blur-sm border-t border-mist px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink tracking-wide">Ver produto</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Info ── */}
      <div className="px-3 py-3.5 flex flex-col gap-1 border-t border-mist/70">
        {product.category && (
          <p className="text-3xs font-semibold tracking-[0.2em] uppercase text-faint">{product.category}</p>
        )}
        <p className="text-sm font-medium text-ink leading-snug line-clamp-2 min-h-[2.5em]">
          {product.name}
        </p>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="font-display text-base text-ink font-normal">
            {formatCurrency(product.price)}
          </p>
          {product.variants && product.variants.length > 1 && (
            <p className="text-3xs text-faint">{product.variants.length} opções</p>
          )}
        </div>
      </div>
    </Link>
  );
}
