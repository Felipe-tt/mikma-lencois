import { Skeleton } from '@/components/ui/Skeleton';

export default function ProductLoading() {
  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop py-3.5">
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="container-shop py-10 sm:py-14 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20">
          <div className="flex flex-col gap-3">
            <Skeleton className="aspect-[4/5] w-full" />
            <div className="grid grid-cols-4 gap-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-square" />)}
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <Skeleton className="h-2.5 w-20" />
            <div>
              <Skeleton className="h-10 w-full mb-2" />
              <Skeleton className="h-10 w-3/4 mb-4" />
              <Skeleton className="h-9 w-32" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <div className="border-t border-mist pt-6 flex flex-col gap-3">
              <Skeleton className="h-2.5 w-32 mb-1" />
              <div className="flex gap-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-20" />)}
              </div>
              <Skeleton className="h-14 w-full mt-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
