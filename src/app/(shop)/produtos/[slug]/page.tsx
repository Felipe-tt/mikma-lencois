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
  const p = await getProduct(params.slug);
  if (!p) return { title: 'Produto não encontrado' };
  return {
    title: p.name,
    description: p.description?.slice(0, 160),
    openGraph: { images: p.images?.[0] ? [{ url: p.images[0] }] : [] },
  };
}

export default async function ProductPage({ params }: Props) {
  const [product, inventory] = await Promise.all([
    getProduct(params.slug),
    getInventory(params.slug),
  ]);
  if (!product) notFound();

  return (
    <div>
      {/* Breadcrumb */}
      <div className="border-b border-stone-200 bg-stone-50">
        <nav className="container-shop py-3 flex gap-2 text-xs text-stone-400 items-center">
          <Link href="/" className="hover:text-stone-700 transition-colors">Início</Link>
          <span>/</span>
          <Link href="/produtos" className="hover:text-stone-700 transition-colors">Produtos</Link>
          {product.category && (
            <>
              <span>/</span>
              <Link href={`/produtos?categoria=${product.category}`} className="hover:text-stone-700 transition-colors">
                {product.category}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="text-stone-600 truncate max-w-[180px]">{product.name}</span>
        </nav>
      </div>

      <div className="container-shop py-10 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-start">

          {/* ── Galeria ── */}
          <div className="flex gap-3">
            {/* Thumbnails verticais */}
            {product.images?.length > 1 && (
              <div className="hidden sm:flex flex-col gap-2 w-16 shrink-0">
                {product.images.slice(0, 5).map((img, i) => (
                  <div key={i} className={`relative aspect-square bg-stone-200 overflow-hidden border-2 ${i === 0 ? 'border-stone-900' : 'border-transparent'}`}>
                    <Image src={img} alt="" fill sizes="64px" className="object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Imagem principal */}
            <div className="relative aspect-[3/4] flex-1 bg-stone-200 overflow-hidden">
              {product.images?.[0] ? (
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="font-display text-6xl text-stone-300">M</span>
                </div>
              )}

              {/* Tags */}
              {product.tags?.[0] && (
                <span className="absolute top-4 left-4 bg-stone-900 text-stone-50 text-2xs font-semibold tracking-widest uppercase px-2.5 py-1">
                  {product.tags[0]}
                </span>
              )}
            </div>
          </div>

          {/* ── Info + CTA ── */}
          <div className="lg:sticky lg:top-24 flex flex-col gap-6">
            {/* Cabeçalho */}
            <div>
              {product.category && (
                <span className="eyebrow mb-2 block">{product.category}</span>
              )}
              <h1 className="font-display text-4xl font-light text-stone-900 leading-tight mb-3">
                {product.name}
              </h1>
              <p className="font-display text-3xl text-stone-900">
                {formatCurrency(product.price)}
              </p>
            </div>

            {/* Variantes e add-to-cart */}
            <div className="border-t border-stone-200 pt-6">
              <VariantSelector product={product} inventory={inventory} />
            </div>

            {/* Descrição */}
            {product.description && (
              <div className="border-t border-stone-200 pt-5">
                <p className="text-sm font-semibold text-stone-900 mb-2">Sobre o produto</p>
                <p className="text-sm text-stone-500 leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Sinais de confiança */}
            <div className="border border-stone-200 bg-stone-100 p-4 flex flex-col gap-3">
              {[
                { icon: <TruckIcon />, label: 'Entrega em Blumenau em até 1h' },
                { icon: <PackageIcon />, label: 'Frete para todo o Brasil com rastreio' },
                { icon: <PixIcon />, label: 'PIX confirmado na hora' },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-gold-600 shrink-0">{icon}</span>
                  <span className="text-sm text-stone-600">{label}</span>
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
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function PackageIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function PixIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v10M7 12h10"/></svg>;
}
