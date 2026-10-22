'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { setReturnTo } from '@/lib/auth/returnTo';
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
    if (!user) { setReturnTo('/favoritos'); router.replace('/entrar'); return; }
  }, [user, loading, router]);

  // Produtos já buscados ficam guardados: desfavoritar um card só tira ele
  // da grade, sem rebuscar todos e sem piscar o skeleton na página toda.
  const cacheRef = useRef(new Map<string, Product | null>());

  useEffect(() => {
    if (wishlistLoading) return;
    const cache = cacheRef.current;
    const show = () => setProducts(
      productIds.map(id => cache.get(id)).filter((p): p is Product => !!p && p.active !== false)
    );
    const missing = productIds.filter(id => !cache.has(id));
    if (missing.length === 0) { show(); setFetching(false); return; }
    let cancelled = false;
    Promise.all(missing.map(id =>
      fetch(`/api/products/${id}`)
        .then(async r => {
          // Só guarda "não existe" pra 404; falha de rede tenta de novo depois
          // (antes o item sumia da lista até recarregar a página).
          if (r.ok) cache.set(id, await r.json() as Product);
          else if (r.status === 404) cache.set(id, null);
        })
        .catch(() => {})
    )).finally(() => {
      if (cancelled) return;
      show();
      setFetching(false);
    });
    return () => { cancelled = true; };
  }, [productIds, wishlistLoading]);

  const isLoading = loading || wishlistLoading || fetching;

  return (
    <div>
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-8 sm:py-12">
          <Link href="/conta" className="group relative before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] inline-flex items-center gap-1.5 text-[12px] font-medium text-mid hover:text-ink transition-colors duration-150 mb-5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
            Área do cliente
          </Link>
          <div className="flex items-end justify-between gap-4">
            <h1 className="font-display font-normal text-ink text-[2.2rem] sm:text-5xl leading-[1.05] tracking-[-0.015em]">Favoritos</h1>
            {!isLoading && products.length > 0 && (
              <p className="text-[13px] text-mid mb-1 tabular-nums">{products.length} {products.length === 1 ? 'produto salvo' : 'produtos salvos'}</p>
            )}
          </div>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-9 sm:gap-x-5 sm:gap-y-12">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[4/5] rounded-2xl bg-warm" />
                <div className="h-3 rounded-full bg-warm mt-3 w-3/4" />
                <div className="h-4 rounded-full bg-warm mt-2 w-1/3" />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-9 sm:gap-x-5 sm:gap-y-12">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
