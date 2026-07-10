export function PainelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="h-3 w-16 bg-mist rounded mb-2" />
          <div className="h-7 w-48 bg-mist rounded" />
        </div>
        <div className="h-9 w-28 bg-mist rounded" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border border-mist p-4 flex items-center gap-4">
          <div className="w-8 h-8 bg-mist rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3.5 bg-mist rounded w-1/3" />
            <div className="h-3 bg-warm rounded w-1/2" />
          </div>
          <div className="h-6 w-20 bg-mist rounded" />
        </div>
      ))}
    </div>
  );
}

export function PainelDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-7 w-48 bg-mist rounded" />
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="border border-mist p-5">
            <div className="h-3 w-20 bg-warm rounded mb-3" />
            <div className="h-8 w-28 bg-mist rounded" />
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="flex flex-col gap-3 mt-2">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="border border-mist p-4 flex items-center gap-4">
            <div className="flex-1 h-3.5 bg-mist rounded w-1/3" />
            <div className="h-3 w-20 bg-warm rounded" />
            <div className="h-6 w-16 bg-mist rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PainelFormSkeleton() {
  return (
    <div className="flex flex-col gap-5 animate-pulse max-w-2xl">
      <div className="h-7 w-48 bg-mist rounded mb-2" />
      {[1,2,3].map(i => (
        <div key={i} className="border border-mist p-5 flex flex-col gap-4">
          <div className="h-4 w-32 bg-mist rounded" />
          <div className="h-10 bg-warm rounded" />
          <div className="h-10 bg-warm rounded" />
        </div>
      ))}
    </div>
  );
}
