import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const firstImage = product.images[0] ?? null;

  return (
    <Link
      href={`/produtos/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
        {firstImage ? (
          <Image
            src={firstImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-xs text-gray-400">Sem imagem</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-sm font-medium text-gray-900">{product.name}</p>

        {product.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {product.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <p className="mt-auto pt-2 text-sm font-semibold text-gray-900">
          {formatCurrency(product.price)}
        </p>
      </div>
    </Link>
  );
}
