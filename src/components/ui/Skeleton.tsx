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
    <div className="flex flex-col">
      {/* Imagem 4:5, mesmo formato do ProductCard */}
      <div className="skeleton aspect-[4/5] w-full !rounded-2xl" />
      {/* Info */}
      <div className="pt-3.5 flex flex-col gap-2">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-5 w-24 mt-1" />
      </div>
    </div>
  );
}

/* ─── Product Grid Skeleton ─────────────────────────────────────── */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-9">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
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
              <Skeleton className="w-24 h-28 shrink-0 !rounded-xl" />
              <div className="flex-1 flex flex-col gap-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-6 w-20 mt-1" />
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-9 w-28 !rounded-full" />
              </div>
            </div>
          ))}
        </div>
        {/* Summary */}
        <div className="border border-mist rounded-2xl p-7 flex flex-col gap-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
          <div className="border-t border-mist pt-4">
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="h-14 w-full !rounded-full" />
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
        <div key={i} className="border border-mist bg-paper rounded-2xl p-6">
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
          <div key={i} className="bg-warm border border-mist px-4 py-4 flex flex-col gap-3 rounded-xl">
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
      <div className="bg-warm border border-mist overflow-hidden rounded-xl">
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
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-8" /><Skeleton className="h-12 w-full !rounded-xl" /></div>
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-12" /><Skeleton className="h-12 w-full !rounded-xl" /></div>
          </div>
          <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-12 w-full !rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-12" /><Skeleton className="h-12 w-full !rounded-xl" /></div>
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-12 w-full !rounded-xl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-10" /><Skeleton className="h-12 w-full !rounded-xl" /></div>
            <div className="flex flex-col gap-1.5"><Skeleton className="h-2.5 w-10" /><Skeleton className="h-12 w-full !rounded-xl" /></div>
          </div>
          <Skeleton className="h-14 w-full mt-2 !rounded-full" />
        </div>
        <div className="border border-mist rounded-2xl p-7 flex flex-col gap-4">
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

/* ─── Perfil Skeleton ───────────────────────────────────────────── */
export function PerfilSkeleton() {
  return (
    <div>
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-8 sm:py-12">
          <Skeleton className="h-3 w-28 mb-5" />
          <div className="flex items-center gap-5">
            <Skeleton className="w-16 h-16 !rounded-full shrink-0" />
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-10 w-52" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        </div>
      </div>
      <div className="container-shop py-8 sm:py-12 grid lg:grid-cols-2 gap-4 sm:gap-5">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[260px] !rounded-3xl" />)}
      </div>
    </div>
  );
}

/* ─── Account Page Skeleton ─────────────────────────────────────── */
export function AccountSkeleton() {
  return (
    <div>
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-10 sm:py-14 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8">
          <Skeleton className="w-[72px] h-[72px] sm:w-20 sm:h-20 !rounded-full shrink-0" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      </div>
      <div className="container-shop py-8 sm:py-12 flex flex-col gap-8 sm:gap-10">
        <Skeleton className="h-[148px] w-full !rounded-3xl" />
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[88px] sm:h-[98px] !rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[82px] !rounded-2xl" />)}
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
          <div className="border border-mist rounded-2xl p-5 flex flex-col gap-4">
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
            {[80, 80, 60].map((_, i) => (
              <div key={i} className="border border-mist rounded-2xl p-5 flex flex-col gap-2">
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
