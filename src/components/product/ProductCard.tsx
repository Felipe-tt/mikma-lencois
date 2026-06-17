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
  const badge        = isNew ? 'Novo' : isBestSeller ? 'Destaque' : null;

  return (
    <NavLink
      href={`/produtos/${product.id}`}
      className="group block bg-[#F9F6F1] relative overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Imagem */}
      <div className="relative aspect-[3/4] overflow-hidden bg-[#F0EAE1]">
        {img0 && !imgError ? (
          <>
            <Image
              src={img0} alt={product.name} fill priority={priority}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={`object-cover transition-all duration-700 ${
                hovered ? 'scale-[1.04] opacity-0' : 'scale-100 opacity-100'
              }`}
              onError={() => setImgError(true)}
            />
            {img1 && (
              <Image
                src={img1} alt="" fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className={`object-cover transition-all duration-700 ${
                  hovered ? 'scale-100 opacity-100' : 'scale-[1.04] opacity-0'
                }`}
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-[#F0EAE1]">
            <Image src="/logo-dark.png" alt="" width={800} height={242}
              className="w-28 h-auto opacity-[0.12]" />
          </div>
        )}

        {/* Badge */}
        {(badge || lowStock) && (
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
            {badge && (
              <span className={`text-[9px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 leading-none ${
                isNew ? 'bg-[#7C5C3E] text-[#F9F6F1]' : 'bg-[#1E1208] text-[#F9F6F1]'
              }`}>{badge}</span>
            )}
            {lowStock && (
              <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[9px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 leading-none">
                Últimas
              </span>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-4 pt-4 pb-5">
        <p className="text-[12px] font-medium text-[#1E1208] leading-snug line-clamp-2 mb-3 group-hover:text-[#7C5C3E] transition-colors duration-200">
          {product.name}
        </p>
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[1.2rem] text-[#1E1208] font-normal leading-none tracking-[-0.01em]">
            {formatCurrency(product.price)}
          </p>
          {product.variants && product.variants.length > 1 && (
            <p className="font-mono text-[10px] text-[#B09C8C]">
              {product.variants.length} tam.
            </p>
          )}
        </div>
      </div>
    </NavLink>
  );
}
