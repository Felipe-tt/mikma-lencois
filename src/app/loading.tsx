import { Skeleton } from '@/components/ui/Skeleton';

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-warm flex">
      <div className="hidden lg:block w-[45%] bg-ink" />
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm flex flex-col gap-5">
          <Skeleton className="h-9 w-32 mb-3" />
          <Skeleton className="h-4 w-48 mb-3" />
          <div className="flex flex-col gap-5">
            <div>
              <Skeleton className="h-2.5 w-16 mb-2" />
              <Skeleton className="h-12 w-full" />
            </div>
            <div>
              <Skeleton className="h-2.5 w-16 mb-2" />
              <Skeleton className="h-12 w-full" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
