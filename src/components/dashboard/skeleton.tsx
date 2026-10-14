const block = 'animate-pulse rounded-xl bg-line/60';

export function CommandCenterSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className={`${block} h-10 w-72`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className={`${block} h-28`} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className={`${block} h-80 xl:col-span-2`} />
        <div className={`${block} h-80`} />
      </div>
    </div>
  );
}
