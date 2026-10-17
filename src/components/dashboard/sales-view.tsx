import type { Filters } from '@/lib/filters/schema';
import { PRESET_LABELS } from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import { formatInt, type MoneyUnit } from '@/lib/format/money';
import type { SalesData } from '@/lib/queries/sales';
import { BreakdownCard } from './breakdown-card';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';

interface Props {
  data: SalesData;
  filters: Filters;
  unit: MoneyUnit;
}

export function SalesView({ data, filters, unit }: Props) {
  const cards = [
    {
      label: 'Investment value',
      value: <CountUp kind="money" unit={unit} value={data.total.sales} />,
    },
    {
      label: 'Deposits',
      value: <CountUp kind="int" value={data.total.deposits} />,
    },
    {
      label: 'Unique investors',
      value: <CountUp kind="int" value={data.total.uniqueInvestors} />,
    },
    {
      label: 'New vs returning',
      value: `${formatInt(data.total.newInvestors)} new / ${formatInt(data.total.oldInvestors)} returning`,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Sales</h2>
          <p className="mt-1 text-sm text-muted">
            {filters.preset === 'custom' ? 'Custom' : PRESET_LABELS[filters.preset]}: {formatRange(data.range)}
          </p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard title="Product" rows={data.breakdowns.product} unit={unit} note="Top 10" />
        <BreakdownCard title="Category" rows={data.breakdowns.category} unit={unit} note="A product in several categories counts in each" />
        <BreakdownCard title="Tenure" rows={data.breakdowns.tenure} unit={unit} />
        <BreakdownCard title="Return type" rows={data.breakdowns.returnType} unit={unit} />
        <BreakdownCard title="Payment method" rows={data.breakdowns.paymentMethod} unit={unit} />
        <BreakdownCard
          title="Deposit status"
          rows={data.breakdowns.depositStatus}
          unit={unit}
          note="Always shows every status; ignores the deposit-status filter"
          statusColors
        />
      </div>
    </div>
  );
}
