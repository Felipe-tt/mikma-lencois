import { Skeleton } from '@/components/ui/Skeleton';

/** Mesmo esqueleto do LegalPage (título, atalhos e texto), para termos, privacidade e afins. */
export function LegalSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="container-shop pt-8 sm:pt-12 pb-8 sm:pb-10">
        <Skeleton className="h-3 w-32 mb-6" />
        <Skeleton className="h-10 sm:h-12 w-3/4 max-w-xl" />
        <Skeleton className="h-3 w-44 mt-4" />
      </div>
      <div className="border-t border-mist">
        <div className="container-shop py-10 pb-20 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
          <div className="lg:hidden flex flex-wrap gap-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-28 !rounded-full" />)}
          </div>
          <div className="hidden lg:flex flex-col gap-2">
            <Skeleton className="h-2.5 w-20 mb-2" />
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-4 w-40" />)}
          </div>
          <div className="flex flex-col gap-3 max-w-[70ch]">
            {[0, 1, 2].map(s => (
              <div key={s} className="flex flex-col gap-2 mb-6">
                <Skeleton className="h-6 w-1/2 mb-2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
