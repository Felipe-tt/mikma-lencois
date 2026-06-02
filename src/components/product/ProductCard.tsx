import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

export function ProductCard({ product }: { product: Product }) {
  const img = product.images[0] ?? null;

  return (
    <Link href={`/produtos/${product.id}`} className="group card-product no-underline">
      {/* Imagem */}
      <div className="relative aspect-[4/5] overflow-hidden bg-mist">
        {img ? (
          <Image
            src={img}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-display text-[13px] text-ink-light">Sem imagem</span>
          </div>
        )}

        {/* Tag */}
        {product.tags?.length > 0 && (
          <span className="tag absolute top-3 left-3">{product.tags[0]}</span>
        )}

        {/* Overlay hover */}
        <div className="absolute inset-0 bg-ink/40 flex items-end justify-center pb-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="bg-paper text-ink text-[12px] font-semibold tracking-[0.1em] uppercase px-5 py-2.5 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            Ver produto
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-4 bg-paper flex flex-col gap-1">
        <p className="text-[14px] font-medium text-ink leading-snug line-clamp-2">{product.name}</p>
        {product.category && (
          <p className="text-[10px] text-ink-light tracking-[0.07em] uppercase">{product.category}</p>
        )}
        <p className="font-display text-[18px] text-ink mt-1">{formatCurrency(product.price)}</p>
      </div>
    </Link>
  );
}
