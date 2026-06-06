import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ShopLoading() {
  return (
    <div>
      {/* Hero skeleton */}
      <section className="bg-warm">
        <div className="container-shop">
          <div className="py-16 lg:py-32 max-w-lg">
            <Skeleton className="h-3 w-24 mb-5" />
            <Skeleton className="h-16 w-full mb-3" />
            <Skeleton className="h-16 w-3/4 mb-6" />
            <Skeleton className="h-4 w-80 mb-2" />
            <Skeleton className="h-4 w-64 mb-10" />
            <div className="flex gap-4">
              <Skeleton className="h-12 w-36" />
              <Skeleton className="h-12 w-32" />
            </div>
          </div>
        </div>
      </section>

      {/* Features skeleton */}
      <section className="border-y border-mist">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-mist">
            {[1,2,3].map(i => (
              <div key={i} className="px-7 py-8 flex gap-5">
                <Skeleton className="h-8 w-8 shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products skeleton */}
      <section className="py-16 sm:py-24">
        <div className="container-shop">
          <div className="mb-10 sm:mb-14">
            <Skeleton className="h-2.5 w-20 mb-3" />
            <Skeleton className="h-10 w-72" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-mist border border-mist">
            {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
