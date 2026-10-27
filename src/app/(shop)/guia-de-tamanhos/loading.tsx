import { Skeleton } from '@/components/ui/Skeleton';

// Mesmo topo centralizado da página e o bloco da calculadora.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="max-w-3xl mx-auto px-4 py-10 sm:py-14 flex flex-col items-center">
      <Skeleton className="h-3 w-32 mb-4" />
      <Skeleton className="h-10 sm:h-12 w-[85%] mb-2" />
      <Skeleton className="h-10 sm:h-12 w-[60%] mb-4" />
      <Skeleton className="h-4 w-[70%] mb-10" />
      <div className="w-full rounded-2xl border border-mist p-5 sm:p-6 flex flex-col gap-4">
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
        <Skeleton className="h-12 w-full !rounded-full" />
      </div>
    </div>
  );
}
