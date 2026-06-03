import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

export function ProductCard({ product }: { product: Product }) {
  const img = product.images?.[0] ?? null;

  return (
    <Link href={`/produtos/${product.id}`} className="product-card">
      {/* Imagem — proporção 4:5 (padrão fashion) */}
      <div className="relative aspect-[4/5] overflow-hidden bg-stone-200">
        {img ? (
          <Image
            src={img}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-display text-3xl text-stone-300">M</span>
          </div>
        )}

        {/* Tags posicionadas */}
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {product.tags?.slice(0, 2).map(tag => (
            <span key={tag} className="bg-stone-900 text-stone-50 text-2xs font-semibold tracking-widest uppercase px-2 py-1">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="px-3 py-3 flex flex-col gap-0.5">
        {product.category && (
          <p className="text-2xs font-medium tracking-widest uppercase text-stone-400">
            {product.category}
          </p>
        )}
        <p className="text-sm font-medium text-stone-800 leading-snug line-clamp-2">
          {product.name}
        </p>
        <p className="font-display text-xl text-stone-900 mt-1">
          {formatCurrency(product.price)}
        </p>
      </div>
    </Link>
  );
}
