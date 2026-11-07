'use client';

import { useNavigationPending } from '@/components/ui/NavigationProgress';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';

/**
 * Resultados do catálogo. Trocar aba, tamanho ou ordem é navegação para a
 * mesma página: o loading.tsx não aparece e a lista antiga ficava parada até
 * a nova chegar. Enquanto carrega, a grade vira skeleton.
 */
export function CatalogResults({ children }: { children: React.ReactNode }) {
  const { visible, to } = useNavigationPending();
  if (visible && to?.pathname === '/produtos') {
    return (
      <div role="status" aria-label="Carregando produtos" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-9">
        {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    );
  }
  return <>{children}</>;
}
