import { buildInvestorInsights } from '@/lib/dashboard/investor-insights';
import { formatInt, type MoneyUnit } from '@/lib/format/money';
import type { InvestorsData } from '@/lib/queries/investors';
import { CohortTable } from './cohort-table';
import { PageTools } from './page-tools';
import { SegmentCard } from './segment-card';
import { TierCard } from './tier-card';

interface Props {
  data: InvestorsData;
  unit: MoneyUnit;
}

const card = 'rounded-xl border border-line bg-surface p-4';
const toneColor = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  info: 'bg-sky-500',
} as const;

export function InvestorsView({ data, unit }: Props) {
  const insights = buildInvestorInsights(data, unit);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Investors</h2>
          <p className="mt-1 text-sm text-muted">{formatInt(data.totalInvestors)} registered investors. Snapshot as of now.</p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      {insights.length > 0 && (
        <section className={card}>
          <h3 className="text-sm font-medium">What to act on</h3>
          <ul className="mt-3 space-y-2">
            {insights.map((insight) => (
              <li key={insight.text} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneColor[insight.tone]}`} aria-hidden />
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <SegmentCard segments={data.segments} unit={unit} />
        <TierCard tiers={data.tiers} concentration={data.concentration} unit={unit} />
      </div>

      <CohortTable cohorts={data.cohorts} medianDaysToFirst={data.medianDaysToFirst} />
    </div>
  );
}
