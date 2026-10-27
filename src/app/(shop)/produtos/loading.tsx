import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ProdutosLoading() {
  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop py-6 sm:py-8">
          <Skeleton className="h-2.5 w-16 mb-2" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-3.5 w-24 mt-3" />
        </div>
      </div>
      <div className="container-shop py-6 sm:py-8 pb-20">
        <div className="flex gap-10 items-start">
          <aside className="hidden lg:flex flex-col gap-3 w-44 shrink-0">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
          </aside>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-9">
            {Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
