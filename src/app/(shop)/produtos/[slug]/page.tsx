import { adminDb } from '@/lib/firebase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Product, InventoryItem } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { VariantSelector } from '@/components/product/VariantSelector';
import { ProductGallery } from '@/components/product/ProductGallery';
import { ProductCard } from '@/components/product/ProductCard';
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
async function getRelated(product: Product): Promise<Product[]> {
  try {
    const snap = await adminDb.collection('products')
      .where('active','==',true)
      .where('category','==',product.category)
      .limit(6).get();
    return snap.docs
      .map(d => serialize<Product>({ id: d.id, ...d.data() }))
      .filter(p => p.id !== product.id)
      .slice(0, 4);
  } catch { return []; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p) return { title: 'Produto não encontrado' };
  return {
    title: p.name,
    description: p.description?.slice(0, 160),
    openGraph: { images: p.images[0] ? [{ url: p.images[0] }] : [] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, inventory] = await Promise.all([getProduct(slug), getInventory(slug)]);
  if (!product) notFound();
  const related = await getRelated(product);

  // Extract specs from tags (thread count, fabric composition, etc.)
  const specTags = product.tags?.filter(t =>
    /\d+\s*fios|percal|misto|microfibra|algodão|poliéster|bamboo|cetim/i.test(t)
  ) ?? [];

  return (
    <div>
      <div className="container-shop pt-5 pb-0">
        {/* Breadcrumb — integrated, no bg */}
        <nav className="flex items-center gap-1.5 text-[11px] text-faint overflow-x-auto whitespace-nowrap scrollbar-none mb-8">
          <Link href="/" className="hover:text-clay transition-colors shrink-0">Início</Link>
          <span className="text-mist">/</span>
          <Link href="/produtos" className="hover:text-clay transition-colors shrink-0">Produtos</Link>
          {product.category && (
            <>
              <span className="text-mist">/</span>
              <Link href={`/produtos?categoria=${encodeURIComponent(product.category)}`}
                className="hover:text-clay transition-colors shrink-0">
                {product.category}
              </Link>
            </>
          )}
          <span className="text-mist">/</span>
          <span className="text-mid truncate max-w-[180px]">{product.name}</span>
        </nav>
      </div>

      <div className="container-shop pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 xl:gap-24 items-start">

          {/* ── Gallery ── */}
          <ProductGallery images={product.images} name={product.name} tag={product.tags?.[0]} />

          {/* ── Info ── */}
          <div className="lg:sticky lg:top-24 flex flex-col gap-5">

            {product.category && <span className="eyebrow">{product.category}</span>}

            <div>
              <h1 className="font-display font-normal text-ink leading-[1.08] text-[2rem] sm:text-[2.4rem] lg:text-[2.6rem] mb-4">
                {product.name}
              </h1>
              <p className="font-display text-[1.75rem] text-ink font-normal">
                {formatCurrency(product.price)}
              </p>
            </div>

            {product.description && (
              <p className="text-[14px] text-mid leading-relaxed pt-1">
                {product.description}
              </p>
            )}

            {/* Specs from tags */}
            {specTags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {specTags.map(tag => (
                  <span key={tag} className="text-[11px] font-medium text-mid bg-warm border border-mist px-3 py-1.5 uppercase tracking-[0.08em]">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Variant selector */}
            <div className="border-t border-mist pt-5">
              <VariantSelector product={product} inventory={inventory} />
            </div>

            {/* Trust signals — inline, no box */}
            <div className="flex flex-col gap-2.5 border-t border-mist pt-4">
              {[
                { icon: <TruckIcon />, text: 'Entrega local em Blumenau em até 1h' },
                { icon: <PackageIcon />, text: 'Frete para todo o Brasil com rastreio' },
                { icon: <PixIcon />, text: 'Pagamento PIX com confirmação imediata' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-[13px] text-mid">
                  <span className="text-clay/80 shrink-0">{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            {/* Size guide */}
            <SizeGuide />
          </div>
        </div>
      </div>

      {/* ── Produtos relacionados ── */}
      {related.length > 0 && (
        <section className="border-t border-mist section-md">
          <div className="container-shop">
            <div className="flex items-end justify-between mb-10">
              <div>
                <span className="eyebrow mb-3 block">Você também pode gostar</span>
                <h2 className="font-display font-normal text-ink text-3xl">Mais em {product.category}</h2>
              </div>
              <Link
                href={`/produtos?categoria=${encodeURIComponent(product.category)}`}
                className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-mid hover:text-ink transition-colors group pb-0.5"
              >
                Ver tudo
                <svg className="transition-transform duration-150 group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-mist border border-mist">
              {related.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SizeGuide() {
  return (
    <details className="group border-t border-mist pt-4">
      <summary className="flex items-center justify-between cursor-pointer list-none text-[12px] font-semibold text-mid tracking-[0.08em] uppercase hover:text-ink transition-colors">
        Guia de tamanhos
        <svg className="w-3.5 h-3.5 transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </summary>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="border-b border-mist">
              {['Tamanho', 'Cama', 'Comprimento', 'Largura'].map(h => (
                <th key={h} className="text-left font-semibold text-[10px] tracking-[0.12em] uppercase text-faint pb-2 pr-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Solteiro', '0,88m', '2,20m', '1,40m'],
              ['Solteiro Plus', '1,00m', '2,20m', '1,50m'],
              ['Casal', '1,38m', '2,28m', '1,80m'],
              ['Queen', '1,58m', '2,28m', '2,10m'],
              ['King', '1,93m', '2,28m', '2,40m'],
            ].map(([size, bed, length, width]) => (
              <tr key={size} className="border-b border-mist/50 last:border-0">
                <td className="py-2 pr-4 font-medium text-ink">{size}</td>
                <td className="py-2 pr-4 text-mid">{bed}</td>
                <td className="py-2 pr-4 text-mid">{length}</td>
                <td className="py-2 pr-4 text-mid">{width}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function TruckIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function PackageIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function PixIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v10M7 12h10"/></svg>;
}
