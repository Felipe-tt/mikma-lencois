import { adminDb } from '@/lib/firebase/admin';
import { ProductCard } from '@/components/product/ProductCard';
import { CategoryFilter } from '@/components/product/CategoryFilter';
import { MobileFilterSheet } from '@/components/product/MobileFilterSheet';
import type { Product } from '@/types';
import { serialize } from '@/lib/utils/serialize';

export const dynamic = 'force-dynamic';

interface Props { searchParams: Promise<{ categoria?: string }> }

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
  const { categoria } = await searchParams;
  const [products, categories] = await Promise.all([getProducts(categoria), getCategories()]);

  return (
    <div>
      <div className="page-header">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Catálogo</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">
            {categoria ?? 'Todos os produtos'}
          </h1>
          <div className="flex items-center justify-between mt-3">
            <p className="text-sm text-mid">
              {products.length} produto{products.length !== 1 ? 's' : ''}
            </p>
            {/* Filtro mobile — só aparece em telas pequenas */}
            <div className="lg:hidden">
              <MobileFilterSheet categories={categories} active={categoria} />
            </div>
          </div>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20">
        <div className="flex gap-10 items-start">
          {/* Sidebar — só desktop */}
          {categories.length > 0 && (
            <aside className="hidden lg:block w-44 shrink-0 sticky top-24">
              <CategoryFilter categories={categories} active={categoria} />
            </aside>
          )}

          <div className="flex-1 min-w-0">
            {products.length === 0 ? (
              <div className="py-24 text-center">
                <p className="font-display text-2xl text-faint font-normal">Nenhum produto encontrado.</p>
                <a href="/produtos" className="text-sm text-mid hover:text-clay transition-colors mt-4 block">
                  Limpar filtros →
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-px bg-mist">
                {products.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
