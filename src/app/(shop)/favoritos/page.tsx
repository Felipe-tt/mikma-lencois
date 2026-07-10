'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { useWishlist } from '@/lib/hooks/useWishlist';
import { ProductCard } from '@/components/product/ProductCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Product } from '@/types';

export default function FavoritosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { productIds, loading: wishlistLoading } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (wishlistLoading) return;
    if (productIds.length === 0) { setProducts([]); setFetching(false); return; }
    setFetching(true);
    Promise.all(
      productIds.map(id => fetch(`/api/products/${id}`).then(r => (r.ok ? r.json() : null)))
    ).then((results) => {
      setProducts(results.filter((p): p is Product => !!p && p.active !== false));
      setFetching(false);
    });
  }, [productIds, wishlistLoading]);

  const isLoading = loading || wishlistLoading || fetching;

  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop py-8 sm:py-10">
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">Favoritos</h1>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] bg-warm" />
                <div className="h-3 bg-warm mt-3 w-3/4" />
                <div className="h-4 bg-warm mt-2 w-1/3" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" /></svg>}
            title="Nenhum favorito ainda"
            description="Toque no coração de um produto para guardá-lo aqui."
            actions={[{ label: 'Ver produtos', href: '/produtos' }]}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
