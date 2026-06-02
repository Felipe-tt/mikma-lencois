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
  let query = adminDb.collection('products').where('active', '==', true).orderBy('createdAt', 'desc');
  if (categoria) query = query.where('category', '==', categoria) as typeof query;
  const snap = await query.limit(48).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
}

export default async function ProdutosPage({ searchParams }: Props) {
  const [products, categories] = await Promise.all([getProducts(searchParams.categoria), getCategories()]);

  return (
    <div style={{ background: 'var(--white)' }}>
      {/* Page header */}
      <div style={{ borderBottom: '1px solid var(--cream-d)', background: 'var(--cream)', padding: '40px 0' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="section-label" style={{ marginBottom: 8 }}>Catálogo</p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 38, fontWeight: 300, color: 'var(--ink)' }}>
            {searchParams.categoria ?? 'Todos os produtos'}
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" style={{ paddingTop: 40, paddingBottom: 64 }}>
        <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start' }}>
          {/* Sidebar */}
          <aside style={{ width: 160, flexShrink: 0, position: 'sticky', top: 100 }}>
            <CategoryFilter categories={categories} active={searchParams.categoria} />
          </aside>

          {/* Grid */}
          <div style={{ flex: 1 }}>
            {products.length === 0 ? (
              <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--ink-l)', fontSize: 14 }}>
                Nenhum produto encontrado.
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--ink-l)', marginBottom: 20, letterSpacing: '0.04em' }}>
                  {products.length} produto{products.length !== 1 ? 's' : ''}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 1, background: 'var(--cream-d)' }}>
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
