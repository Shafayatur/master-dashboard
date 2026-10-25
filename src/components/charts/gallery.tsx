import { CalendarClock, Hourglass, Ticket, UserPlus, Users, Wallet, XCircle } from 'lucide-react';
import { BarChart } from '@/components/dashboard/bar-chart';
import { CountUp } from '@/components/dashboard/count-up';
import type { MoneyUnit } from '@/lib/format/money';
import { formatMoney } from '@/lib/format/money';
import { AreaChart } from './area-chart';
import { CHART_COLORS } from './chart-colors';
import { ChartCard } from './chart-card';
import { DonutChart, DonutLegend } from './donut-chart';
import { ExportBar } from './export-bar';
import { HBarList } from './hbar-list';
import { Heatmap } from './heatmap';
import { KpiCard } from './kpi-card';
import { Sparkline } from './sparkline';

/** Sample data is generated with fixed formulas (no randomness) so the page looks the same on every load. */
const DAYS = 30;
const dayLabel = (i: number) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
const labels = Array.from({ length: DAYS }, (_, i) => dayLabel(i));
const sales = Array.from({ length: DAYS }, (_, i) => Math.round(1_400_000 + 600_000 * Math.sin(i / 3) + i * 22_000));
const previous = sales.map((v, i) => Math.round(v * (0.82 + 0.1 * Math.cos(i / 4))));
const payouts = Array.from({ length: DAYS }, (_, i) => Math.round(900_000 + 450_000 * Math.sin(i / 2.2 + 1)));
const spark = (base: number, amp: number, drift: number) => Array.from({ length: 14 }, (_, i) => Math.round(base + amp * Math.sin(i / 2) + i * drift));

const projects = [
  { key: 'p1', label: 'Riverside Agro Fund', value: 18_400_000 },
  { key: 'p2', label: 'Metro Logistics Note', value: 12_900_000 },
  { key: 'p3', label: 'Textile Export Line', value: 9_600_000 },
  { key: 'p4', label: 'Solar Rooftop Pool', value: 6_100_000 },
  { key: 'p5', label: 'Poultry Cooperative', value: 4_300_000 },
  { key: 'others', label: 'Others', value: 7_700_000 },
];
const categories = [
  { key: 'c1', label: 'Agriculture', value: 41 },
  { key: 'c2', label: 'Trade finance', value: 27 },
  { key: 'c3', label: 'Energy', value: 19 },
  { key: 'c4', label: 'Others', value: 13 },
];
const segments = [
  { key: 'active', label: 'Active', value: 1180 },
  { key: 'recent', label: 'Recently active', value: 410 },
  { key: 'cooling', label: 'Cooling', value: 320 },
  { key: 'inactive', label: 'Inactive', value: 606 },
];
const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const stacked = months.map((label, i) => ({
  label,
  values: [
    { value: 38_000_000 + i * 2_500_000 + (i % 2) * 3_000_000, color: CHART_COLORS[0] ?? '', name: 'Other deposits' },
    { value: 700_000 + i * 150_000, color: CHART_COLORS[3] ?? '', name: 'Reinvest' },
  ],
}));
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const bookingMatrix = weekdays.map((_, d) =>
  hours.map((_, h) => Math.max(0, Math.round(9 * Math.exp(-((h - 11) ** 2) / 30) * (d < 5 ? 1 : 0.45) + ((h * 7 + d * 3) % 4)))),
);
const cohortRows = ['Apr 26', 'May 26', 'Jun 26', 'Jul 26', 'Aug 26'];
const cohortCols = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'];
const cohortMatrix = cohortRows.map((_, r) => cohortCols.map((_, c) => (c + r > 5 ? 0 : Math.round(100 * Math.pow(0.78, c) - r * 2))));

const sum = (values: { value: number }[]) => values.reduce((a, b) => a + b.value, 0);

export function ChartGallery({ unit }: { unit: MoneyUnit }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Chart toolkit</h1>
        <p className="mt-1 text-sm text-muted">Every chart component with static sample data. Nothing here reads the database.</p>
      </header>

      <section aria-label="KPI cards" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard i={0} icon={Wallet} tone="emerald" label="Investment value" delta={12.4} hint="vs previous 30 days" spark={<Sparkline values={spark(40, 8, 3)} tone="up" />}>
          <CountUp value={sales.reduce((a, b) => a + b, 0)} kind="money" unit={unit} />
        </KpiCard>
        <KpiCard i={1} icon={Ticket} tone="blue" label="Tickets invested" delta={-3.8} hint="1,284 deposits" spark={<Sparkline values={spark(60, 6, -1.5)} tone="down" />}>
          <CountUp value={1160} kind="int" />
        </KpiCard>
        <KpiCard i={2} icon={Users} tone="violet" label="Unique investors" delta={0} hint="no change" spark={<Sparkline values={spark(30, 0, 0)} tone="flat" />}>
          <CountUp value={412} kind="int" />
        </KpiCard>
        <KpiCard i={3} icon={Hourglass} tone="amber" label="Pending deposits" delta={-18.2} deltaInverse hint="fewer is better" spark={<Sparkline values={spark(20, 5, -1)} tone="up" />}>
          <CountUp value={9} kind="int" />
        </KpiCard>
        <KpiCard i={4} icon={XCircle} tone="rose" label="Cancelled bookings" delta={22.5} deltaInverse hint="more cancellations" spark={<Sparkline values={spark(10, 3, 1.2)} tone="down" />}>
          <CountUp value={67} kind="int" />
        </KpiCard>
        <KpiCard i={5} icon={UserPlus} tone="blue" label="New investors" delta={null} hint="no previous period" spark={<Sparkline values={[4]} />}>
          <CountUp value={38} kind="int" />
        </KpiCard>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Investment value and payouts"
          subtitle="Two series plus a dashed comparison"
          action={<ExportBar csvHref="/api/export/actions?list=pending" xlsxHref="/api/export/actions?list=pending&fmt=xlsx" />}
        >
          <AreaChart
            labels={labels}
            bucket="day"
            unit={unit}
            series={[
              { key: 'sales', label: 'Investment value', values: sales },
              { key: 'payouts', label: 'Payouts', values: payouts, color: CHART_COLORS[1] },
              { key: 'prev', label: 'Previous period', values: previous, dashed: true, color: CHART_COLORS[5] },
            ]}
          />
        </ChartCard>
        <ChartCard title="Sales by project" subtitle="Top 5 plus others">
          <div className="flex flex-wrap items-center gap-4">
            <DonutChart slices={projects} centerValue={formatMoney(sum(projects), unit)} centerLabel="Total sales" />
            <DonutLegend slices={projects} format="value" valueText={(key) => formatMoney(projects.find((p) => p.key === key)?.value ?? 0, unit)} />
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Sales and reinvestment" subtitle="Last 6 months, stacked columns">
          <BarChart items={stacked} unit={unit} />
        </ChartCard>
        <ChartCard title="Sales by category">
          <div className="flex flex-wrap items-center gap-4">
            <DonutChart slices={categories} centerValue="4" centerLabel="Categories" size={140} />
            <DonutLegend slices={categories} />
          </div>
        </ChartCard>
        <ChartCard title="Investor segments">
          <div className="flex flex-wrap items-center gap-4">
            <DonutChart slices={segments} centerValue="2,516" centerLabel="Investors" size={140} />
            <DonutLegend slices={segments} format="value" />
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Top projects by value" subtitle="Money bars">
          <HBarList kind="money" unit={unit} items={projects.slice(0, 5).map((p, i) => ({ ...p, hint: `${12 - i * 2} investors` }))} />
        </ChartCard>
        <ChartCard title="Investors by tenure" subtitle="Count bars with a custom colour">
          <HBarList
            kind="int"
            color={CHART_COLORS[3]}
            items={[
              { key: '3', label: '3 months', value: 640 },
              { key: '6', label: '6 months', value: 520 },
              { key: '12', label: '12 months', value: 310 },
              { key: '4', label: '4 months', value: 190 },
            ]}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Bookings by weekday and hour" subtitle="Dhaka time">
          <Heatmap rows={weekdays} cols={hours} matrix={bookingMatrix} />
        </ChartCard>
        <ChartCard title="Cohort retention" subtitle="Share of cohort still investing">
          <Heatmap rows={cohortRows} cols={cohortCols} matrix={cohortMatrix} />
        </ChartCard>
      </div>

      <ChartCard title="Empty states" subtitle="What each chart shows when the period has no data">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AreaChart labels={[]} series={[]} bucket="day" unit={unit} />
          <DonutChart slices={[]} centerValue="0" />
          <HBarList kind="int" items={[]} />
          <Heatmap rows={weekdays} cols={hours} matrix={[]} />
        </div>
      </ChartCard>

      <p className="flex items-center gap-2 text-xs text-muted">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        Amounts use the unit chosen with the K/M and Lakh/Cr switch above.
      </p>
    </div>
  );
}
