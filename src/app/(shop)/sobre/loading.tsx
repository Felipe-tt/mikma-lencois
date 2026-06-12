import { Skeleton } from '@/components/ui/Skeleton';

export default function SobreLoading() {
  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop">
          <Skeleton className="h-2.5 w-24 mb-3" />
          <Skeleton className="h-12 w-56 mb-2" />
          <Skeleton className="h-12 w-48" />
        </div>
      </div>
      <div className="container-shop py-16 sm:py-24">
        <div className="grid lg:grid-cols-[1fr_380px] gap-16 lg:gap-24">
          <div className="flex flex-col gap-5">
            {[100,90,85,80,75].map((w,i) => <Skeleton key={i} className={`h-4 w-[${w}%]`} />)}
            <div className="mt-2 flex flex-col gap-4">
              {[95,88,92,80].map((w,i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="border border-mist px-6 py-5">
                <Skeleton className="h-2.5 w-20 mb-3" />
                <Skeleton className="h-7 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
