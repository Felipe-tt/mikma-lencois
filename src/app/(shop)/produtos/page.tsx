import { adminDb } from '@/lib/firebase/admin';
import { ProductCard } from '@/components/product/ProductCard';
import { CategoryFilter } from '@/components/product/CategoryFilter';
import type { Product } from '@/types';

interface Props {
  searchParams: { categoria?: string; busca?: string };
}

async function getCategories(): Promise<string[]> {
  const snap = await adminDb
    .collection('products')
    .where('active', '==', true)
    .select('category')
    .get();
  const set = new Set(snap.docs.map((d) => d.data().category as string));
  return Array.from(set).sort();
}

async function getProducts(categoria?: string): Promise<Product[]> {
  let query = adminDb
    .collection('products')
    .where('active', '==', true)
    .orderBy('createdAt', 'desc');

  if (categoria) {
    query = query.where('category', '==', categoria) as typeof query;
  }

  const snap = await query.limit(48).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Product));
}

export default async function ProdutosPage({ searchParams }: Props) {
  const [products, categories] = await Promise.all([
    getProducts(searchParams.categoria),
    getCategories(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Produtos</h1>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:w-48">
          <CategoryFilter
            categories={categories}
            active={searchParams.categoria}
          />
        </aside>

        {/* Grid */}
        <div className="flex-1">
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-gray-400">Nenhum produto encontrado.</p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-500">
                {products.length} produto{products.length !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
