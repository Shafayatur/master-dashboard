import Link from 'next/link';
import { ChartCard } from '@/components/charts/chart-card';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { ActiveProject } from '@/lib/queries/active-projects';

type ActiveProjectFilter = 'all' | 'open' | 'fully_funded' | 'running';
type SearchValue = string | string[] | undefined;

interface Props {
  projects: ActiveProject[];
  unit: MoneyUnit;
  searchParams: Record<string, SearchValue>;
}

const filters: { value: ActiveProjectFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'fully_funded', label: 'Fully funded' },
  { value: 'running', label: 'Running' },
];

const statusStyles: Record<ActiveProject['status'], string> = {
  open: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  fully_funded: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  running: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

const statusLabels: Record<ActiveProject['status'], string> = {
  open: 'Open',
  fully_funded: 'Fully funded',
  running: 'Running',
};

function isActiveProjectFilter(value: string | undefined): value is ActiveProjectFilter {
  return value === 'all' || value === 'open' || value === 'fully_funded' || value === 'running';
}

export function ActiveProjectsCard({ projects, unit, searchParams }: Props) {
  const apValue = Array.isArray(searchParams.ap) ? searchParams.ap[0] : searchParams.ap;
  const selectedFilter = isActiveProjectFilter(apValue) ? apValue : 'all';
  const currentQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) currentQuery.append(key, item);
    } else if (value !== undefined) {
      currentQuery.set(key, value);
    }
  }
  const hrefFor = (filter: ActiveProjectFilter) => {
    const query = new URLSearchParams(currentQuery);
    if (filter === 'all') query.delete('ap');
    else query.set('ap', filter);
    const queryString = query.toString();
    return queryString ? `/projects?${queryString}` : '/projects';
  };
  const visibleProjects = selectedFilter === 'all'
    ? projects
    : projects.filter((project) => project.status === selectedFilter);

  return (
    <ChartCard
      title="Active projects"
      subtitle="Snapshot as of now. Ignores the date range and filters. Funded % assumes the stock column counts units still available."
      action={
        <nav aria-label="Filter active projects" className="inline-flex rounded-md border border-line p-0.5 text-xs">
          {filters.map((filter) => (
            <Link
              key={filter.value}
              href={hrefFor(filter.value)}
              aria-current={selectedFilter === filter.value ? 'page' : undefined}
              className={`rounded px-2 py-1 ${selectedFilter === filter.value ? 'bg-line font-medium text-fg' : 'text-muted hover:text-fg'}`}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
      }
    >
      {visibleProjects.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No active projects.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Project</th>
                <th scope="col" className="px-3 py-2 font-medium">Tenure</th>
                <th scope="col" className="px-3 py-2 font-medium">Return type</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Unit price</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Units left</th>
                <th scope="col" className="px-3 py-2 font-medium">Funded %</th>
                <th scope="col" className="px-3 py-2 font-medium">Running investments</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Investors</th>
                <th scope="col" className="px-3 py-2 font-medium">Next maturity</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {visibleProjects.map((project) => {
                const funded = project.fundedPct === null ? null : Math.max(0, Math.min(project.fundedPct, 100));
                return (
                  <tr key={project.projectId}>
                    <th scope="row" className="px-3 py-3 font-medium">{project.name}</th>
                    <td className="px-3 py-3 text-muted">{project.tenureMonths} mo</td>
                    <td className="px-3 py-3 text-muted">{project.returnType}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(project.unitPrice, unit)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatInt(project.unitsLeft)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 tabular-nums text-muted">
                          {project.fundedPct === null ? '—' : `${project.fundedPct.toFixed(1)}%`}
                        </span>
                        <span
                          role="meter"
                          aria-label={`${project.name} funded`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={funded ?? 0}
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-line"
                        >
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${funded ?? 0}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {formatInt(project.runningOrders)} - {formatMoney(project.runningAmount, unit)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatInt(project.runningInvestors)}</td>
                    <td className="px-3 py-3 text-muted">{project.nextMaturity ?? '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[project.status]}`}>
                        {statusLabels[project.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
