import { adminDb } from '@/lib/firebase/admin';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Product, InventoryItem } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { VariantSelector } from '@/components/product/VariantSelector';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface Props { params: { slug: string }; }

async function getProduct(id: string): Promise<Product | null> {
  const snap = await adminDb.collection('products').doc(id).get();
  if (!snap.exists || !snap.data()?.active) return null;
  return { id: snap.id, ...snap.data() } as Product;
}

async function getInventory(productId: string): Promise<InventoryItem[]> {
  const snap = await adminDb.collection('inventory').where('productId', '==', productId).get();
  return snap.docs.map(d => ({ sku: d.id, ...d.data() } as InventoryItem));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.slug);
  if (!product) return { title: 'Produto não encontrado' };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    openGraph: { images: product.images[0] ? [{ url: product.images[0] }] : [] },
  };
}

export default async function ProductPage({ params }: Props) {
  const [product, inventory] = await Promise.all([getProduct(params.slug), getInventory(params.slug)]);
  if (!product) notFound();

  return (
    <div style={{ background: 'var(--white)' }}>
      {/* Breadcrumb */}
      <div style={{ borderBottom: '1px solid var(--cream-d)', padding: '12px 0' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--ink-l)' }}>
            <Link href="/" style={{ color: 'var(--ink-l)', textDecoration: 'none' }}>Início</Link>
            <span>/</span>
            <Link href="/produtos" style={{ color: 'var(--ink-l)', textDecoration: 'none' }}>Produtos</Link>
            <span>/</span>
            <span style={{ color: 'var(--ink)' }}>{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'start' }}>

          {/* Images */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {product.images.length > 0 ? (
              <>
                <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', background: 'var(--mist)' }}>
                  <Image src={product.images[0]} alt={product.name} fill priority sizes="50vw" style={{ objectFit: 'cover' }} />
                </div>
                {product.images.length > 1 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {product.images.slice(1).map((img, i) => (
                      <div key={i} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: 'var(--mist)' }}>
                        <Image src={img} alt={`${product.name} ${i + 2}`} fill sizes="12vw" style={{ objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ aspectRatio: '4/5', background: 'var(--mist)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-l)' }}>Sem imagem</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ position: 'sticky', top: 100 }}>
            {product.category && (
              <p className="section-label" style={{ marginBottom: 12 }}>{product.category}</p>
            )}
            <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 36, fontWeight: 300, color: 'var(--ink)', lineHeight: 1.2, marginBottom: 16 }}>
              {product.name}
            </h1>
            <p style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 28, color: 'var(--ink)', fontWeight: 400, marginBottom: 20 }}>
              {formatCurrency(product.price)}
            </p>

            {product.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
                {product.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
              </div>
            )}

            <p style={{ fontSize: 14, color: 'var(--ink-l)', lineHeight: 1.8, marginBottom: 32 }}>
              {product.description}
            </p>

            <div style={{ borderTop: '1px solid var(--cream-d)', paddingTop: 28 }}>
              <VariantSelector product={product} inventory={inventory} />
            </div>

            {/* Delivery info */}
            <div style={{ marginTop: 28, padding: '16px 20px', background: 'var(--cream)', border: '1px solid var(--cream-d)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                '◎ Entrega local em Blumenau em até 1h',
                '◎ Frete para todo o Brasil via PAC/SEDEX',
                '◎ Pagamento via PIX com confirmação imediata',
              ].map(t => (
                <p key={t} style={{ fontSize: 12, color: 'var(--ink-m)', letterSpacing: '0.02em' }}>{t}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
