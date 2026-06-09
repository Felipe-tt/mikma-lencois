import { adminDb } from '@/lib/firebase/admin';
import Link from 'next/link';
import { ProductCard } from '@/components/product/ProductCard';
import { CategoryFilter } from '@/components/product/CategoryFilter';
import { MobileFilterSheet } from '@/components/product/MobileFilterSheet';
import type { Product } from '@/types';
import { serialize } from '@/lib/utils/serialize';

export const dynamic = 'force-dynamic';

interface Props { searchParams: Promise<{ categoria?: string; q?: string }> }

async function getCategories(): Promise<string[]> {
  const snap = await adminDb.collection('products').where('active','==',true).select('category').get();
  return Array.from(new Set(snap.docs.map(d => d.data().category as string).filter(Boolean))).sort();
}
async function getProducts(cat?: string): Promise<Product[]> {
  let q = adminDb.collection('products').where('active','==',true).orderBy('createdAt','desc');
  if (cat) q = q.where('category','==',cat) as typeof q;
  const snap = await q.limit(48).get();
  return snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
}

export default async function ProdutosPage({ searchParams }: Props) {
  const { categoria, q } = await searchParams;
  const [products, categories] = await Promise.all([getProducts(categoria), getCategories()]);

  const title = q ? `"${q}"` : (categoria ?? 'Todos os produtos');

  return (
    <div>
      {/* ── Page header ── */}
      <div className="bg-warm border-b border-mist">
        <div className="container-shop py-10 md:py-14">
          <span className="eyebrow mb-3 block">Catálogo</span>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
                {title}
              </h1>
              <p className="text-sm text-mid mt-2">
                {products.length} produto{products.length !== 1 ? 's' : ''} encontrado{products.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="lg:hidden pb-1">
              <MobileFilterSheet categories={categories} active={categoria} />
            </div>
          </div>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20">
        <div className="flex gap-12 items-start">
          {/* Sidebar */}
          {categories.length > 0 && (
            <aside className="hidden lg:block w-48 shrink-0 sticky top-24">
              <p className="text-2xs font-semibold tracking-[0.2em] uppercase text-faint mb-5">Categorias</p>
              <CategoryFilter categories={categories} active={categoria} />
            </aside>
          )}

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {products.length === 0 ? (
              <div className="py-24 text-center border border-mist">
                <p className="font-display text-2xl text-faint font-normal">Nenhum produto encontrado.</p>
                <Link href="/produtos" className="text-sm text-mid hover:text-clay transition-colors mt-4 inline-block">
                  Limpar filtros
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-px bg-mist border border-mist">
                {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
