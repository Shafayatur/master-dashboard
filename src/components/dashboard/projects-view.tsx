import type { Filters } from '@/lib/filters/schema';
import { COMPARE_LABELS, PRESET_LABELS } from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import type { MoneyUnit } from '@/lib/format/money';
import { buildProjectInsights } from '@/lib/dashboard/project-insights';
import type { ProjectsData } from '@/lib/queries/projects';
import { PageTools } from './page-tools';
import { ProjectScorecard } from './project-scorecard';
import { TenureCard } from './tenure-card';

interface Props {
  data: ProjectsData;
  filters: Filters;
  unit: MoneyUnit;
}

const card = 'rounded-xl border border-line bg-surface p-4';
const toneColor = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  info: 'bg-sky-500',
} as const;

export function ProjectsView({ data, filters, unit }: Props) {
  const insights = buildProjectInsights(data, unit);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Projects &amp; Tenure</h2>
          <p className="mt-1 text-sm text-muted">
            {filters.preset === 'custom' ? 'Custom' : PRESET_LABELS[filters.preset]}: {formatRange(data.range)}
            {data.compareRange ? ` · vs ${COMPARE_LABELS[filters.compare]} (${formatRange(data.compareRange)})` : ''}
          </p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      {insights.length > 0 && (
        <section className={card}>
          <h3 className="text-sm font-medium">What to launch next</h3>
          <ul className="mt-3 space-y-2">
            {insights.map((insight, index) => (
              <li key={`${insight.tone}-${index}`} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneColor[insight.tone]}`} aria-hidden />
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <TenureCard
          title="Preferred tenure"
          rows={data.tenure}
          unit={unit}
          compare={data.compareRange !== null}
          note="Ranked by number of investors"
        />
        <TenureCard
          title="Categories"
          rows={data.category}
          unit={unit}
          compare={data.compareRange !== null}
          note="A product in several categories counts in each"
        />
      </div>

      <ProjectScorecard rows={data.scorecard} unit={unit} />
    </div>
  );
}
