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
  const [product, inventory] = await Promise.all([
    getProduct(params.slug),
    getInventory(params.slug),
  ]);
  if (!product) notFound();

  return (
    <div className="bg-paper">
      {/* Breadcrumb */}
      <div className="border-b border-cream-dark py-3">
        <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex gap-2 text-[12px] text-ink-light">
          <Link href="/" className="text-ink-light no-underline hover:text-ink transition-colors">Início</Link>
          <span>/</span>
          <Link href="/produtos" className="text-ink-light no-underline hover:text-ink transition-colors">Produtos</Link>
          <span>/</span>
          <span className="text-ink">{product.name}</span>
        </nav>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">

          {/* Galeria */}
          <div className="flex flex-col gap-2">
            <div className="relative aspect-[4/5] overflow-hidden bg-mist">
              {product.images[0] ? (
                <Image src={product.images[0]} alt={product.name} fill priority sizes="(max-width:1024px)100vw,50vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="font-display text-[13px] text-ink-light">Sem imagem</span>
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.slice(1).map((img, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden bg-mist">
                    <Image src={img} alt={`${product.name} ${i + 2}`} fill sizes="15vw" className="object-cover hover:scale-105 transition-transform duration-300" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="lg:sticky lg:top-24 flex flex-col gap-0">
            {product.category && <p className="section-label mb-3">{product.category}</p>}

            <h1 className="font-display font-light text-[clamp(28px,4vw,40px)] text-ink leading-tight mb-4">
              {product.name}
            </h1>

            <p className="font-display text-[28px] text-ink mb-5">
              {formatCurrency(product.price)}
            </p>

            {product.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-6">
                {product.tags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            )}

            <p className="text-[14px] text-ink-light leading-relaxed mb-8">
              {product.description}
            </p>

            <div className="border-t border-cream-dark pt-7">
              <VariantSelector product={product} inventory={inventory} />
            </div>

            {/* Entrega */}
            <div className="mt-7 bg-cream border border-cream-dark p-5 flex flex-col gap-2.5">
              {[
                { icon: '→', text: 'Entrega local em Blumenau em até 1h' },
                { icon: '→', text: 'Frete para todo o Brasil via PAC/SEDEX' },
                { icon: '→', text: 'Pagamento PIX com confirmação imediata' },
              ].map(({ icon, text }) => (
                <p key={text} className="text-[12px] text-ink-mid flex gap-2 items-start">
                  <span className="text-warm-dark mt-px shrink-0">{icon}</span>
                  {text}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
