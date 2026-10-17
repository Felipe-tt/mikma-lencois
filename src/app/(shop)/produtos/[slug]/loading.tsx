import { Skeleton } from '@/components/ui/Skeleton';

// Mesmo desenho da página do produto (miniaturas + foto 4:5 à esquerda,
// nome e caixa de compra à direita), pra nada pular quando ela chega.
export default function ProductLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando produto">
      <div className="border-b border-mist bg-warm/40">
        <div className="container-shop py-4">
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="container-shop py-8 pb-28 sm:pb-16">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] gap-8 md:gap-8 lg:gap-12 items-start">
          <div className="flex gap-3 sm:gap-4 min-w-0">
            <div className="hidden lg:flex flex-col gap-2.5 w-[72px] shrink-0">
              {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-[4/5] w-full !rounded-xl" />)}
            </div>
            <Skeleton className="flex-1 aspect-[4/5] !rounded-3xl" />
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-8 w-11/12" />
              <Skeleton className="h-8 w-2/3" />
            </div>
            <div className="rounded-3xl border border-mist p-5 sm:p-7 flex flex-col gap-5">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-12 w-full !rounded-xl" />
              <div className="border-t border-mist pt-5 flex flex-col gap-3">
                <Skeleton className="h-2.5 w-28" />
                <div className="flex gap-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-28 !rounded-full" />)}
                </div>
              </div>
              <div className="border-t border-mist pt-5 hidden sm:flex flex-col gap-2">
                <Skeleton className="h-[52px] w-full !rounded-full" />
                <Skeleton className="h-[52px] w-full !rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
