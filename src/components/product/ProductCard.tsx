'use client';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { useState } from 'react';
import { NavLink } from '@/components/ui/NavLink';

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

  const isNew        = product.tags?.includes('novo') || product.tags?.includes('new');
  const isBestSeller = product.tags?.includes('bestseller') || product.tags?.includes('mais vendido');
  const badgeLabel   = isNew ? 'Novo' : isBestSeller ? 'Destaque' : null;

  return (
    <NavLink
      href={`/produtos/${product.id}`}
      className="product-card group bg-paper"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Image ── */}
      <div className="relative aspect-[3/4] overflow-hidden bg-[#F2EDE6]">
        {img0 && !imgError ? (
          <>
            <Image
              src={img0}
              alt={product.name}
              fill
              priority={priority}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={`object-cover absolute inset-0 transition-opacity duration-500 ${hovered && img1 ? 'opacity-0' : 'opacity-100'}`}
              onError={() => setImgError(true)}
            />
            {img1 && (
              <Image
                src={img1}
                alt={`${product.name} — detalhe`}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className={`object-cover absolute inset-0 transition-opacity duration-500 ${hovered ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
            {/* Subtle overlay on hover */}
            <div className={`absolute inset-0 bg-ink transition-opacity duration-300 ${hovered ? 'opacity-[0.03]' : 'opacity-0'}`} />
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-[#F2EDE6]">
            <Image src="/logo-dark.png" alt="Mikma" width={60} height={30} className="w-10 h-auto opacity-10" />
          </div>
        )}

        {/* Badges */}
        {(badgeLabel || lowStock) && (
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {badgeLabel && (
              <span className={`text-[9px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 leading-none ${
                isNew ? 'bg-clay text-paper' : 'bg-ink text-paper'
              }`}>
                {badgeLabel}
              </span>
            )}
            {lowStock && (
              <span className="bg-amber-50 text-amber-700 border border-amber-200/70 text-[9px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 leading-none">
                Últimas unidades
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Info ── */}
      <div className="px-4 pt-3.5 pb-4 flex flex-col gap-2.5">
        <p className="text-[12px] font-medium text-ink leading-snug line-clamp-2 min-h-[2.6em] group-hover:text-clay transition-colors duration-200">
          {product.name}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-[19px] text-ink font-normal leading-none tracking-[-0.01em]">
            {formatCurrency(product.price)}
          </p>
          {product.variants && product.variants.length > 1 && (
            <p className="text-[10px] text-faint">
              {product.variants.length} tamanhos
            </p>
          )}
        </div>
      </div>
    </NavLink>
  );
}
