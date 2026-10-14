import { FilterSummary } from '@/components/filters/filter-summary';
import { parseFilters } from '@/lib/filters/schema';
import { todayDhaka } from '@/lib/time';

interface Props {
  title: string;
  phase: string;
  intro: string;
  searchParams: Record<string, string | string[] | undefined>;
}

/** Stand-in until the tab is built. It also proves the URL filters reach the server. */
export function PlaceholderPage({ title, phase, intro, searchParams }: Props) {
  const filters = parseFilters(searchParams, todayDhaka());
  return (
    <div className="max-w-3xl animate-rise">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted">
        {intro} Planned for {phase}.
      </p>
      <section className="mt-6 border-t border-line pt-5">
        <h3 className="mb-3 text-sm font-medium">Filters this page will apply</h3>
        <FilterSummary filters={filters} />
      </section>
    </div>
  );
}
