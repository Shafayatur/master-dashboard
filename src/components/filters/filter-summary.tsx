import { COMPARE_LABELS, PRESET_LABELS } from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import type { Filters } from '@/lib/filters/schema';

const join = (xs: readonly (string | number)[], none: string) => (xs.length ? xs.join(', ') : none);

/** Plain-language read-out of exactly which filters a page is applying. Server-renderable. */
export function FilterSummary({ filters }: { filters: Filters }) {
  const rows: [string, string][] = [
    ['Period', `${filters.preset === 'custom' ? 'Custom' : PRESET_LABELS[filters.preset]}: ${formatRange(filters.range)}`],
    ['Compared with', filters.compareRange ? `${COMPARE_LABELS[filters.compare]}: ${formatRange(filters.compareRange)}` : 'Nothing'],
    ['Deposit status', join(filters.depositStatus, 'approved')],
    ['Order status', join(filters.orderStatus, 'all')],
    ['Payment method', join(filters.paymentMethod, 'all')],
    ['Reinvest deposits', filters.excludeReinvest ? 'excluded' : 'included'],
    ['Tenure (months)', join(filters.tenures, 'all')],
    ['Return type', join(filters.returnTypes, 'all')],
    ['Shariah', filters.shariah],
    ['Investors', filters.investorKind],
    ['Segment', join(filters.segments, 'all')],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
