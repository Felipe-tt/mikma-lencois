import { adminDb } from '@/lib/firebase/admin';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Product, InventoryItem } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { VariantSelector } from '@/components/product/VariantSelector';
import type { Metadata } from 'next';
import { serialize } from '@/lib/utils/serialize';

export const dynamic = 'force-dynamic';
interface Props { params: Promise<{ slug: string }> }

async function getProduct(id: string): Promise<Product | null> {
  const snap = await adminDb.collection('products').doc(id).get();
  if (!snap.exists || !snap.data()?.active) return null;
  return serialize<Product>({ id: snap.id, ...snap.data() });
}
async function getInventory(id: string): Promise<InventoryItem[]> {
  const snap = await adminDb.collection('inventory').where('productId','==',id).get();
  return snap.docs.map(d => serialize<InventoryItem>({ sku: d.id, ...d.data() }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p) return { title: 'Produto não encontrado' };
  return { title: p.name, description: p.description?.slice(0,160), openGraph: { images: p.images[0] ? [{ url: p.images[0] }] : [] } };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, inventory] = await Promise.all([getProduct(slug), getInventory(slug)]);
  if (!product) notFound();

  return (
    <div>
      {/* Breadcrumb */}
      <div className="border-b border-mist bg-paper">
        <div className="container-shop py-3">
          <nav className="flex items-center gap-2 text-xs text-faint overflow-x-auto whitespace-nowrap">
            <Link href="/" className="hover:text-clay transition-colors shrink-0">Início</Link>
            <span>/</span>
            <Link href="/produtos" className="hover:text-clay transition-colors shrink-0">Produtos</Link>
            {product.category && (
              <>
                <span>/</span>
                <Link href={`/produtos?categoria=${encodeURIComponent(product.category)}`} className="hover:text-clay transition-colors shrink-0">{product.category}</Link>
              </>
            )}
            <span>/</span>
            <span className="text-mid font-medium truncate max-w-[160px]">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 lg:py-16 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 xl:gap-20 items-start">

          {/* Galeria */}
          <div className="flex flex-col gap-2.5">
            {/* Imagem principal */}
            <div className="relative aspect-[4/5] sm:aspect-[3/4] overflow-hidden bg-warm">
              {product.images[0] ? (
                <Image src={product.images[0]} alt={product.name} fill priority
                  sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-warm/50">
                  <span className="font-display text-4xl text-faint">M</span>
                </div>
              )}
              {product.tags?.[0] && (
                <span className="absolute top-3 left-3 bg-ink text-paper text-2xs font-semibold tracking-widest uppercase px-2.5 py-1">
                  {product.tags[0]}
                </span>
              )}
            </div>
            {/* Thumbnails — scroll horizontal no mobile */}
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible">
                {product.images.slice(1).map((img, i) => (
                  <div key={i} className="relative aspect-square w-20 sm:w-auto shrink-0 sm:shrink overflow-hidden bg-warm">
                    <Image src={img} alt={`${product.name} ${i+2}`} fill sizes="15vw" className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="lg:sticky lg:top-28 flex flex-col gap-5">
            {product.category && <span className="eyebrow">{product.category}</span>}

            <div>
              <h1 className="font-display font-normal text-ink leading-tight text-3xl sm:text-4xl lg:text-5xl mb-3">
                {product.name}
              </h1>
              <p className="font-display text-2xl sm:text-3xl text-ink">{formatCurrency(product.price)}</p>
            </div>

            {product.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.tags.map(tag => (
                  <span key={tag} className="bg-warm text-mid text-xs font-medium tracking-wide px-3 py-1">{tag}</span>
                ))}
              </div>
            )}

            {product.description && (
              <p className="text-sm text-mid leading-relaxed">{product.description}</p>
            )}

            <div className="border-t border-mist pt-6">
              <VariantSelector product={product} inventory={inventory} />
            </div>

            {/* Trust signals */}
            <div className="flex flex-col gap-2.5 mt-1">
              {[
                { icon: <TruckIcon />, text: 'Entrega local em Blumenau em até 1h' },
                { icon: <PackageIcon />, text: 'Frete para todo o Brasil com rastreio' },
                { icon: <PixIcon />, text: 'Pagamento PIX com confirmação imediata' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-mid bg-warm px-4 py-3">
                  <span className="text-clay shrink-0">{icon}</span>
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

function TruckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function PackageIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function PixIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v10M7 12h10"/></svg>;
}
