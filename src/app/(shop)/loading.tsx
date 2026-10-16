import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { Skeleton } from '@/components/ui/Skeleton';

// Espelha o layout atual da home (topo tipográfico + selos + grade), que é
// a rota mais acessada a cair aqui. Antes desenhava um hero antigo com uma
// faixa de 3 diferenciais que a home não tem mais, e a página "pulava"
// quando o conteúdo de verdade chegava.
export default function ShopLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <section className="border-b border-mist bg-paper">
        <div className="container-shop pt-16 sm:pt-24 pb-14 sm:pb-20">
          <Skeleton className="h-3 w-56 mb-10 sm:mb-14" />
          <Skeleton className="h-[clamp(2.4rem,8.5vw,8rem)] w-[85%] mb-3" />
          <Skeleton className="h-[clamp(2.4rem,8.5vw,8rem)] w-[70%] mb-3" />
          <Skeleton className="h-[clamp(2.4rem,8.5vw,8rem)] w-[60%]" />
          <div className="mt-8 sm:mt-10 flex flex-col gap-7">
            <div className="flex flex-col gap-2 max-w-[42ch]">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-12 w-44" />
          </div>
          <div className="mt-12 pt-8 border-t border-mist-d/70 grid grid-cols-2 sm:flex gap-4 sm:gap-10">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-4 w-36" />)}
          </div>
        </div>
      </section>

      <section className="bg-paper">
        <div className="container-shop pt-14 sm:pt-20 pb-8 flex items-baseline justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="container-shop pb-20">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-mist border border-mist">
            {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
