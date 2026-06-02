import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

interface ProductCardProps { product: Product; }

export function ProductCard({ product }: ProductCardProps) {
  const firstImage = product.images[0] ?? null;

  return (
    <Link href={`/produtos/${product.id}`} className="card-product" style={{ textDecoration: 'none' }}>
      <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', background: 'var(--mist)' }}>
        {firstImage ? (
          <Image
            src={firstImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            style={{ objectFit: 'cover', transition: 'transform 0.5s ease' }}
            className="group-hover:scale-105"
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 13, color: 'var(--ink-l)' }}>Sem imagem</span>
          </div>
        )}
        {product.tags.length > 0 && (
          <span className="tag" style={{ position: 'absolute', top: 12, left: 12 }}>
            {product.tags[0]}
          </span>
        )}
      </div>

      <div style={{ padding: '16px 18px 20px', background: 'var(--white)' }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.4 }}
          className="line-clamp-2">{product.name}</p>
        {product.category && (
          <p style={{ fontSize: 11, color: 'var(--ink-l)', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>{product.category}</p>
        )}
        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, fontWeight: 500, color: 'var(--ink)' }}>
          {formatCurrency(product.price)}
        </p>
      </div>
    </Link>
  );
}
