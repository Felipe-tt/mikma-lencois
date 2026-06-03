import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

export function ProductCard({ product }: { product: Product }) {
  const img = product.images?.[0] ?? null;

  return (
    <Link href={`/produtos/${product.id}`} className="product-card group">
      <div className="relative aspect-[3/4] overflow-hidden bg-warm">
        {img ? (
          <Image src={img} alt={product.name} fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-display text-5xl text-mist font-light">M</span>
          </div>
        )}
        {product.tags?.[0] && (
          <span className="absolute top-3 left-3 bg-clay text-paper text-2xs font-bold tracking-[0.15em] uppercase px-2.5 py-1">
            {product.tags[0]}
          </span>
        )}
      </div>
      <div className="px-4 py-4 bg-paper flex-1 flex flex-col gap-1">
        {product.category && (
          <p className="text-2xs font-semibold tracking-[0.18em] uppercase text-faint">{product.category}</p>
        )}
        <p className="text-sm font-medium text-ink leading-snug line-clamp-2">{product.name}</p>
        <p className="font-display text-xl text-ink mt-auto pt-2">{formatCurrency(product.price)}</p>
      </div>
    </Link>
  );
}
