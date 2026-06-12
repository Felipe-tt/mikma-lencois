import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ProdutosLoading() {
  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop">
          <Skeleton className="h-2.5 w-16 mb-3" />
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-3.5 w-24 mt-3" />
        </div>
      </div>
      <div className="container-shop py-8 sm:py-12 pb-20">
        <div className="flex gap-10 items-start">
          <aside className="hidden lg:flex flex-col gap-3 w-44 shrink-0">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}
          </aside>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-px bg-mist border border-mist">
            {Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
