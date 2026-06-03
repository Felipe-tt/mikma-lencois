import { adminDb } from '@/lib/firebase/admin';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Product, InventoryItem } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { VariantSelector } from '@/components/product/VariantSelector';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
interface Props { params: { slug: string } }

async function getProduct(id: string): Promise<Product | null> {
  const snap = await adminDb.collection('products').doc(id).get();
  if (!snap.exists || !snap.data()?.active) return null;
  return { id: snap.id, ...snap.data() } as Product;
}
async function getInventory(id: string): Promise<InventoryItem[]> {
  const snap = await adminDb.collection('inventory').where('productId','==',id).get();
  return snap.docs.map(d => ({ sku: d.id, ...d.data() } as InventoryItem));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct(params.slug);
  if (!p) return { title: 'Produto não encontrado' };
  return { title: p.name, description: p.description.slice(0,160), openGraph: { images: p.images[0] ? [{ url: p.images[0] }] : [] } };
}

export default async function ProductPage({ params }: Props) {
  const [product, inventory] = await Promise.all([getProduct(params.slug), getInventory(params.slug)]);
  if (!product) notFound();

  return (
    <div>
      {/* Breadcrumb */}
      <div className="border-b border-mist bg-paper">
        <div className="container-shop py-3">
          <nav className="flex items-center gap-2 text-xs text-faint">
            <Link href="/" className="hover:text-clay transition-colors">Início</Link>
            <span>/</span>
            <Link href="/produtos" className="hover:text-clay transition-colors">Produtos</Link>
            <span>/</span>
            <span className="text-mid font-medium truncate max-w-[200px]">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="container-shop py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">

          {/* Images */}
          <div className="flex flex-col gap-3">
            <div className="relative aspect-[3/4] overflow-hidden bg-warm">
              {product.images[0] ? (
                <Image src={product.images[0]} alt={product.name} fill priority sizes="(max-width:1024px) 100vw, 50vw"
                  className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="font-display text-6xl text-mist">M</span>
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.slice(1).map((img, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden bg-warm">
                    <Image src={img} alt={`${product.name} ${i+2}`} fill sizes="15vw" className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="lg:sticky lg:top-28">
            {product.category && <span className="eyebrow mb-4 block">{product.category}</span>}
            <h1 className="font-display font-normal text-ink mb-3 leading-tight" style={{fontSize:'clamp(1.75rem,4vw,2.75rem)'}}>
              {product.name}
            </h1>
            <p className="font-display text-3xl text-ink mb-5">{formatCurrency(product.price)}</p>

            {product.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {product.tags.map(tag => (
                  <span key={tag} className="bg-warm text-mid text-xs font-medium tracking-wide px-3 py-1">{tag}</span>
                ))}
              </div>
            )}

            <p className="text-sm text-mid leading-relaxed mb-8">{product.description}</p>

            <div className="border-t border-mist pt-8">
              <VariantSelector product={product} inventory={inventory} />
            </div>

            {/* Trust signals */}
            <div className="mt-8 grid grid-cols-1 gap-3">
              {[
                { icon:'🚀', text:'Entrega local em Blumenau em até 1h' },
                { icon:'📦', text:'Frete para todo o Brasil com rastreio' },
                { icon:'⚡', text:'Pagamento PIX com confirmação imediata' },
              ].map(({icon,text}) => (
                <div key={text} className="flex items-center gap-3 text-sm text-mid bg-warm px-4 py-3">
                  <span className="text-base">{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
