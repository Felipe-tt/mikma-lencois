import { adminDb } from '@/lib/firebase/admin';
import { ProductCard } from '@/components/product/ProductCard';
import { CategoryFilter } from '@/components/product/CategoryFilter';
import type { Product } from '@/types';

export const dynamic = 'force-dynamic';

interface Props { searchParams: { categoria?: string }; }

async function getCategories(): Promise<string[]> {
  const snap = await adminDb.collection('products').where('active', '==', true).select('category').get();
  return Array.from(new Set(snap.docs.map(d => d.data().category as string))).sort();
}

async function getProducts(categoria?: string): Promise<Product[]> {
  let q = adminDb.collection('products').where('active', '==', true).orderBy('createdAt', 'desc');
  if (categoria) q = q.where('category', '==', categoria) as typeof q;
  const snap = await q.limit(48).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
}

export default async function ProdutosPage({ searchParams }: Props) {
  const [products, categories] = await Promise.all([
    getProducts(searchParams.categoria),
    getCategories(),
  ]);

  return (
    <div className="bg-paper">
      {/* Header */}
      <div className="border-b border-cream-dark bg-cream py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="section-label mb-2">Catálogo</p>
          <h1 className="font-display font-light text-[38px] text-ink">
            {searchParams.categoria ?? 'Todos os produtos'}
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 pb-20">
        <div className="flex gap-12 items-start">
          {/* Sidebar */}
          <aside className="hidden md:block w-40 shrink-0 sticky top-24">
            <CategoryFilter categories={categories} active={searchParams.categoria} />
          </aside>

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {products.length === 0 ? (
              <div className="py-20 text-center text-[14px] text-ink-light">
                Nenhum produto encontrado.
              </div>
            ) : (
              <>
                <p className="text-[12px] text-ink-light mb-5 tracking-[0.04em]">
                  {products.length} produto{products.length !== 1 ? 's' : ''}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-px bg-cream-dark">
                  {products.map(p => <ProductCard key={p.id} product={p} />)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
