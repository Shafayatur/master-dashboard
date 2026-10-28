import { Receipt, UserPlus, Users, Wallet } from 'lucide-react';
import type { Filters } from '@/lib/filters/schema';
import { PRESET_LABELS } from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import { formatBucketLabel } from '@/lib/format/labels';
import type { SalesData, BreakdownRow } from '@/lib/queries/sales';
import type { SalesExtras } from '@/lib/queries/tabs-extra';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { HBarList } from '@/components/charts/hbar-list';
import { Heatmap } from '@/components/charts/heatmap';
import { KpiCard } from '@/components/charts/kpi-card';
import { BarChart } from './bar-chart';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';

interface Props {
  data: SalesData;
  extras: SalesExtras;
  filters: Filters;
  unit: MoneyUnit;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_COLORS: Record<string, string> = {
  approved: CHART_COLORS[0] ?? 'rgb(var(--chart-1))',
  pending: CHART_COLORS[2] ?? 'rgb(var(--chart-3))',
  rejected: CHART_COLORS[4] ?? 'rgb(var(--chart-5))',
};

function bucketLabel(label: string, bucket: SalesExtras['bucket']): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(label);
  if (!match) return label;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return label;
  return bucket === 'month' ? `${month} '${match[1]?.slice(2)}` : `${Number(match[3] ?? '1')} ${month}`;
}

function breakdownSlices(rows: BreakdownRow[]) {
  return rows.map((row, index) => ({
    key: row.key,
    label: row.label,
    value: row.value,
    color: CHART_COLORS[index % CHART_COLORS.length] ?? 'rgb(var(--chart-1))',
  }));
}

function breakdownTotal(rows: BreakdownRow[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0);
}

function BreakdownChart({
  title,
  rows,
  unit,
  note,
  statusColors = false,
}: {
  title: string;
  rows: BreakdownRow[];
  unit: MoneyUnit;
  note?: string;
  statusColors?: boolean;
}) {
  const statusRows = statusColors
    ? (['approved', 'pending', 'rejected'] as const).map(
        (key) => rows.find((row) => row.key === key) ?? { key, label: key, value: 0, deposits: 0, investors: 0, share: 0 },
      )
    : rows;
  const slices = statusColors
    ? statusRows.map((row) => ({
        key: row.key,
        label: row.label,
        value: row.value,
        color: STATUS_COLORS[row.key],
      }))
    : breakdownSlices(rows);
  const total = breakdownTotal(statusRows);
  const values = new Map(slices.map((slice) => [slice.key, slice.value]));

  return (
    <ChartCard title={title} subtitle={note}>
      <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
        <DonutChart slices={slices} centerValue={formatMoney(total, unit)} centerLabel="Investment value" />
        <DonutLegend
          slices={slices}
          format="value"
          valueText={(key) => formatMoney(values.get(key) ?? 0, unit)}
        />
      </div>
    </ChartCard>
  );
}

export function SalesView({ data, extras, filters, unit }: Props) {
  const newVsReturningItems = extras.newVsReturning.map((row) => ({
    label: bucketLabel(row.label, extras.bucket),
    values: [
      { value: row.newInvestors, color: CHART_COLORS[0] ?? '', name: 'New' },
      { value: row.returning, color: CHART_COLORS[1] ?? '', name: 'Returning' },
    ],
  }));
  const weekdayItems = extras.weekday.map((row) => ({
    key: String(row.day),
    label: row.label,
    value: row.amount,
    hint: `${formatInt(row.deposits)} deposits`,
  }));
  const statusRows = (['approved', 'pending', 'rejected'] as const).map(
    (key) => data.breakdowns.depositStatus.find((row) => row.key === key) ?? { key, label: key, value: 0, deposits: 0, investors: 0, share: 0 },
  );
  const seriesTotal = data.series.points.reduce((sum, point) => sum + point.value, 0);
  const seriesAverage = data.series.points.length > 0 ? seriesTotal / data.series.points.length : 0;
  const bucketName = data.series.bucket === 'month' ? 'month' : 'day';
  const investmentItems = data.series.points.map((point) => ({
    label: formatBucketLabel(point.label, data.series.bucket),
    values: [
      { value: point.value - point.reinvest, color: 'emerald-500', name: 'Other payment methods' },
      { value: point.reinvest, color: 'amber-500', name: 'Reinvest' },
    ],
  }));
  const cards = [
    {
      label: 'Investment value',
      icon: Wallet,
      tone: 'blue' as const,
      value: <CountUp kind="money" unit={unit} value={data.total.sales} />,
    },
    {
      label: 'Deposits',
      icon: Receipt,
      tone: 'emerald' as const,
      value: <CountUp kind="int" value={data.total.deposits} />,
    },
    {
      label: 'Unique investors',
      icon: Users,
      tone: 'violet' as const,
      value: <CountUp kind="int" value={data.total.uniqueInvestors} />,
    },
    {
      label: 'New vs returning',
      icon: UserPlus,
      tone: 'amber' as const,
      value: `${formatInt(data.total.newInvestors)} / ${formatInt(data.total.oldInvestors)}`,
      hint: 'new / returning',
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
          {filters.segments.length > 0 && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              The segment filter is applied on the Investors tab, not here yet.
            </p>
          )}
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, icon, tone, value, hint }, i) => (
          <KpiCard key={label} i={i} icon={icon} tone={tone} label={label} hint={hint}>
            {value}
          </KpiCard>
        ))}
      </div>

      <ChartCard
        title={`Investment by ${bucketName}`}
        subtitle={`Total ${formatMoney(seriesTotal, unit)} - average ${formatMoney(seriesAverage, unit)} per ${bucketName}`}
      >
        <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Other payment methods
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            Reinvest
          </span>
        </div>
        <BarChart items={investmentItems} unit={unit} kind="money" height={260} />
      </ChartCard>

      <ChartCard title="New vs returning investors">
        <BarChart
          items={newVsReturningItems}
          unit={unit}
          kind="int"
          height={260}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownChart title="Product" rows={data.breakdowns.product} unit={unit} note="Top 10" />
        <BreakdownChart
          title="Category"
          rows={data.breakdowns.category}
          unit={unit}
          note="A product in several categories counts in each"
        />
        <BreakdownChart title="Tenure" rows={data.breakdowns.tenure} unit={unit} />
        <BreakdownChart title="Return type" rows={data.breakdowns.returnType} unit={unit} />
        <BreakdownChart title="Payment method" rows={data.breakdowns.paymentMethod} unit={unit} />
        <BreakdownChart
          title="Deposit status"
          rows={statusRows}
          unit={unit}
          note="Always shows every status; ignores the deposit-status filter"
          statusColors
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Deposits by weekday">
          <HBarList items={weekdayItems} kind="money" unit={unit} color={CHART_COLORS[0]} />
        </ChartCard>
        <ChartCard
          title="Booking activity by weekday and hour"
          subtitle="Bookings, Dhaka time. Use it to time campaigns."
        >
          <Heatmap
            rows={extras.bookingHeat.rows}
            cols={extras.bookingHeat.cols}
            matrix={extras.bookingHeat.matrix}
          />
        </ChartCard>
      </div>
    </div>
  );
}
