import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { Concentration, TierRow } from '@/lib/queries/investors';

interface Props {
  tiers: TierRow[];
  concentration: Concentration;
  unit: MoneyUnit;
}

const card = 'rounded-xl border border-line bg-surface p-4';

function tierLabel(tier: TierRow, index: number, count: number, unit: MoneyUnit): string {
  if (index === 0) return `Under ${formatMoney(tier.max ?? tier.min, unit)}`;
  if (index === count - 1) return `${formatMoney(tier.min, unit)} and above`;
  return `${formatMoney(tier.min, unit)} to ${formatMoney(tier.max ?? tier.min, unit)}`;
}

export function TierCard({ tiers, concentration, unit }: Props) {
  return (
    <section className={card}>
      <h3 className="text-sm font-medium">Investors by lifetime value</h3>
      <div className="mt-4 space-y-4">
        {tiers.map((tier, index) => (
          <div key={tier.min}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">{tierLabel(tier, index, tiers.length, unit)}</span>
              <span className="shrink-0 text-xs text-muted">{formatInt(tier.investors)} investors</span>
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${tier.investorShare}%` }} />
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${tier.valueShare}%` }} />
              </div>
              <p className="flex justify-between text-xs text-muted tabular-nums">
                <span>Investors {tier.investorShare.toFixed(1)}%</span>
                <span>Value {tier.valueShare.toFixed(1)}%</span>
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-4 text-xs text-muted" aria-label="Bar legend">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />Investors</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />Value</span>
      </div>
      <p className="mt-3 text-xs text-muted">
        Top 10 investors hold {concentration.top10Share.toFixed(0)}% of lifetime investment; the top 20% hold {concentration.top20PctShare.toFixed(0)}%.
      </p>
    </section>
  );
}
