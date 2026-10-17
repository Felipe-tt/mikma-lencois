import { Skeleton } from '@/components/ui/Skeleton';

// Cartão centralizado, no formato das telas de confirmação/senha.
export default function AuthStatusLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="w-full max-w-[420px] mx-auto py-10 flex flex-col items-center">
      <Skeleton className="h-9 w-28 mb-10" />
      <div className="w-full flex flex-col items-center gap-4">
        <Skeleton className="w-20 h-20 !rounded-full" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-full mt-4 !rounded-full" />
      </div>
    </div>
  );
}
