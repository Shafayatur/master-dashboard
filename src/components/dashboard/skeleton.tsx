const block = 'animate-pulse rounded-xl bg-line/60';

export function CommandCenterSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className={`${block} h-10 w-72`} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main area */}
        <div className="space-y-4">
          {/* KPI row 1 */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={`k1-${i}`} className={`${block} h-[120px]`} />)}
          </div>
          {/* KPI row 2 */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={`k2-${i}`} className={`${block} h-[120px]`} />)}
          </div>
          {/* Big chart block */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`${block} h-80 lg:col-span-2`} />
            <div className={`${block} h-80`} />
          </div>
          {/* Three chart blocks */}
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <div key={`c-${i}`} className={`${block} h-64`} />)}
          </div>
        </div>
        {/* Right rail */}
        <div className="space-y-4">
          <div className={`${block} h-64`} />
          <div className={`${block} h-80`} />
        </div>
      </div>
    </div>
  );
}
