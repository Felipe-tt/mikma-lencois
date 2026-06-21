import { cn } from '@/lib/utils/cn';

interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

export function Skeleton({ className, rounded }: SkeletonProps) {
  return (
    <div className={cn('skeleton', rounded && 'rounded-full', className)} />
  );
}

/* ─── Product Card Skeleton ────────────────────────────────────── */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col bg-paper border border-mist">
      {/* Imagem 4:5 */}
      <div className="skeleton aspect-[4/5] w-full" />
      {/* Info */}
      <div className="px-3 py-4 flex flex-col gap-2">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-5 w-20 mt-1" />
      </div>
    </div>
  );
}

/* ─── Product Grid Skeleton ─────────────────────────────────────── */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-px bg-mist">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ─── Product Detail Skeleton ───────────────────────────────────── */
export function ProductDetailSkeleton() {
  return (
    <div className="container-shop py-12 lg:py-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
        {/* Galeria */}
        <div className="flex flex-col gap-3">
          <Skeleton className="aspect-[3/4] w-full" />
          <div className="grid grid-cols-4 gap-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-square" />)}
          </div>
        </div>
        {/* Info */}
        <div className="flex flex-col gap-5">
          <Skeleton className="h-3 w-20" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-8 w-3/5" />
          </div>
          <Skeleton className="h-7 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
          <div className="border-t border-mist pt-6 flex flex-col gap-3">
            <Skeleton className="h-3 w-20" />
            <div className="flex gap-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-11 w-14" />)}
            </div>
            <Skeleton className="h-14 w-full mt-2" />
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Cart Skeleton ─────────────────────────────────────────────── */
export function CartSkeleton() {
  return (
    <div className="container-shop py-12">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12 items-start">
        {/* Items */}
        <div className="flex flex-col divide-y divide-mist">
          {[1,2,3].map(i => (
            <div key={i} className="flex gap-5 py-6">
              <Skeleton className="w-24 h-28 shrink-0" />
              <div className="flex-1 flex flex-col gap-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-6 w-20 mt-1" />
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
          ))}
        </div>
        {/* Summary */}
        <div className="border border-mist p-7 flex flex-col gap-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
          <div className="border-t border-mist pt-4">
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    </div>
  );
}

/* ─── Orders List Skeleton ──────────────────────────────────────── */
export function OrdersListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[1,2,3].map(i => (
        <div key={i} className="border border-mist bg-paper p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="border-t border-mist pt-4 flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Dashboard Skeleton ────────────────────────────────────────── */
export function DashboardSkeleton() {
  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="h-2.5 w-16 mb-2" />
        <Skeleton className="h-8 w-32" />
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="bg-warm border border-mist px-4 py-4 flex flex-col gap-3">
            <Skeleton className="h-4 w-4" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
      {/* Table header */}
      <div className="flex justify-between items-center mb-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-16" />
      </div>
      {/* Table */}
      <div className="bg-warm border border-mist overflow-hidden">
        <div className="bg-warm-d px-5 py-3 border-b border-mist">
          <Skeleton className="h-2.5 w-48" />
        </div>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-6 px-5 py-3.5 border-b border-mist last:border-0">
            <Skeleton className="h-3 w-24 font-mono" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-24 ml-auto" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Checkout Skeleton ─────────────────────────────────────────── */
export function CheckoutSkeleton() {
  return (
    <div className="container-shop py-10 pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-12 items-start">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-8" /><Skeleton className="h-12 w-full" /></div>
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-12" /><Skeleton className="h-12 w-full" /></div>
          </div>
          <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-12 w-full" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-12" /><Skeleton className="h-12 w-full" /></div>
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-12 w-full" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-10" /><Skeleton className="h-12 w-full" /></div>
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-10" /><Skeleton className="h-12 w-full" /></div>
          </div>
          <Skeleton className="h-14 w-full mt-2" />
        </div>
        <div className="border border-mist p-7 flex flex-col gap-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
          <div className="border-t border-mist pt-3">
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Produtos Page Skeleton ────────────────────────────────────── */
export function ProdutosPageSkeleton() {
  return (
    <div>
      {/* Page header */}
      <div className="border-b border-mist">
        <div className="container-shop">
          <Skeleton className="h-2.5 w-14 mb-3" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-3 w-24 mt-2" />
        </div>
      </div>
      <div className="container-shop py-12">
        <div className="flex gap-12 items-start">
          {/* Sidebar */}
          <aside className="hidden lg:flex w-44 shrink-0 flex-col gap-2">
            <Skeleton className="h-2.5 w-20 mb-2" />
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}
          </aside>
          <div className="flex-1 min-w-0">
            <Skeleton className="h-3 w-28 mb-5" />
            <ProductGridSkeleton count={8} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Perfil Skeleton ───────────────────────────────────────────── */
export function PerfilSkeleton() {
  return (
    <div className="container-shop py-12 max-w-lg">
      <Skeleton className="h-8 w-40 mb-8" />
      <div className="flex flex-col gap-5">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
        <Skeleton className="h-12 w-full mt-2" />
      </div>
    </div>
  );
}

/* ─── Account Page Skeleton ─────────────────────────────────────── */
export function AccountSkeleton() {
  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop">
          <Skeleton className="h-2.5 w-24 mb-3" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-3 w-40 mt-2" />
        </div>
      </div>
      <div className="container-shop py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 max-w-2xl border border-mist">
          {[1, 2].map(i => (
            <div key={i} className="bg-paper px-6 py-7 flex items-start gap-5">
              <Skeleton className="w-6 h-6 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-16 mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Order Detail Skeleton ─────────────────────────────────────── */
export function OrderDetailSkeleton() {
  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop">
          <Skeleton className="h-2.5 w-16 mb-3" />
          <Skeleton className="h-9 w-48" />
        </div>
      </div>
      <div className="container-shop py-10 max-w-3xl">
        {/* Progress bar */}
        <div className="flex items-start gap-0 mb-10">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <Skeleton className="w-6 h-6 rounded-full" rounded />
              <Skeleton className="h-2.5 w-14" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-8">
          {/* Items */}
          <div className="border border-mist p-5 flex flex-col gap-4">
            <Skeleton className="h-2.5 w-24" />
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between py-3 border-t border-mist first:border-0 first:pt-0">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
            <div className="flex justify-between pt-3 border-t border-mist">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            {[80, 80, 60].map((h, i) => (
              <div key={i} className="border border-mist p-5 flex flex-col gap-2">
                <Skeleton className="h-2.5 w-20 mb-1" />
                <Skeleton className={`h-3.5 w-full`} />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
