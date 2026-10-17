import { Skeleton, ProductGridSkeleton } from '@/components/ui/Skeleton';

// Mesmo cabeçalho da página (faixa clara, link de volta, título) + grade.
export default function FavoritosLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando favoritos">
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-8 sm:py-12">
          <Skeleton className="h-3 w-28 mb-5" />
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
      <div className="container-shop py-8 sm:py-12 pb-20">
        <ProductGridSkeleton count={4} />
      </div>
    </div>
  );
}
