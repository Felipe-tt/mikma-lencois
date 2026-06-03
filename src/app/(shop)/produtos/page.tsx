import { adminDb } from '@/lib/firebase/admin';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import { MobileFilterSheet } from '@/components/product/MobileFilterSheet';

export const dynamic = 'force-dynamic';

interface Props { searchParams: { categoria?: string }; }

async function getCategories(): Promise<string[]> {
  const snap = await adminDb.collection('products').where('active', '==', true).select('category').get();
  return [...new Set(snap.docs.map(d => d.data().category as string).filter(Boolean))].sort();
}

async function getProducts(categoria?: string): Promise<Product[]> {
  let q = adminDb.collection('products').where('active', '==', true).orderBy('createdAt', 'desc');
  if (categoria) q = q.where('category', '==', categoria) as typeof q;
  const snap = await q.limit(48).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
}

export default async function ProdutosPage({ searchParams }: Props) {
  const [products, categories] = await Promise.all([getProducts(searchParams.categoria), getCategories()]);

  return (
    <div>
      {/* Page hero */}
      <div className="page-hero">
        <div className="container-shop">
          <span className="eyebrow mb-2 block">Catálogo</span>
          <h1 className="font-display text-4xl font-light text-stone-900">
            {searchParams.categoria ?? 'Todos os produtos'}
          </h1>
        </div>
      </div>

      <div className="container-shop py-8 pb-20">

        {/* Barra de controles */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-stone-200">
          <p className="text-sm text-stone-500">
            {products.length} produto{products.length !== 1 ? 's' : ''}
            {searchParams.categoria ? ` em "${searchParams.categoria}"` : ''}
          </p>
          {/* Filtro mobile */}
          <MobileFilterSheet categories={categories} active={searchParams.categoria} />
        </div>

        <div className="flex gap-10 items-start">
          {/* Sidebar — só desktop */}
          <aside className="hidden lg:block w-44 shrink-0 sticky top-24">
            <FilterSidebar categories={categories} active={searchParams.categoria} />
          </aside>

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {products.length === 0 ? (
              <div className="py-24 text-center">
                <p className="font-display text-2xl font-light text-stone-400 mb-4">Nenhum produto encontrado</p>
                <a href="/produtos" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">
                  Limpar filtros →
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-px bg-stone-200">
                {products.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline sidebar (server, sem estado)
function FilterSidebar({ categories, active }: { categories: string[]; active?: string }) {
  const items = [{ label: 'Todos', value: '' }, ...categories.map(c => ({ label: c, value: c }))];
  return (
    <div>
      <p className="eyebrow text-stone-500 mb-4">Categoria</p>
      <ul className="flex flex-col gap-0.5">
        {items.map(({ label, value }) => {
          const isActive = value === (active ?? '');
          const href = value ? `/produtos?categoria=${encodeURIComponent(value)}` : '/produtos';
          return (
            <li key={label}>
              <a href={href} className={`block px-3 py-2.5 text-sm border-l-2 transition-colors
                ${isActive
                  ? 'border-l-gold-600 text-stone-900 font-semibold bg-stone-100'
                  : 'border-l-transparent text-stone-500 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
