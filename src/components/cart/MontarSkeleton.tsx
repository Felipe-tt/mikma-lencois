import Image from 'next/image';
import { Skeleton } from '@/components/ui/Skeleton';

/** Mesmo desenho da tela do "Montar junto" (cabeçalho, catálogo e carrinho) enquanto ela abre. */
export function MontarSkeleton() {
  return (
    <div className="h-dvh flex flex-col overflow-hidden" aria-busy="true" aria-label="Abrindo o carrinho">
      <header className="shrink-0 border-b border-mist bg-paper">
        <div className="px-4 md:px-6 h-14 flex items-center gap-3">
          <Image src="/logo-clay.png" alt="Mikma Lençóis" width={76} height={28} className="h-7 w-auto shrink-0" priority />
          <span className="h-6 w-px bg-mist shrink-0" aria-hidden="true" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-2 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </header>
      <div className="md:hidden shrink-0 flex gap-1 p-1.5 mx-3 my-2 rounded-full bg-warm">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-9 flex-1 !rounded-full" />)}
      </div>
      <div className="flex-1 min-h-0 md:grid md:grid-cols-[minmax(0,1fr)_360px] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="hidden md:flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-11 w-full !rounded-full" />
          <div className="flex gap-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-24 !rounded-full" />)}</div>
          <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-square !rounded-xl" />)}
          </div>
        </div>
        <aside className="flex flex-col gap-3 p-4 md:border-l border-mist md:bg-warm/20">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-14 h-14 !rounded-lg shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
