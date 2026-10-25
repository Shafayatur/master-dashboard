import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Clock,
  Hourglass,
  Lightbulb,
  Send,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { AreaChart } from '@/components/charts/area-chart';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { ExportBar } from '@/components/charts/export-bar';
import { HBarList } from '@/components/charts/hbar-list';
import { KpiCard } from '@/components/charts/kpi-card';
import { Sparkline } from '@/components/charts/sparkline';
import { cn } from '@/components/ui/cn';
import { buildInsights, type Insight } from '@/lib/dashboard/insights';
import type { CommandCenterData } from '@/lib/dashboard/types';
import { COMPARE_LABELS, PRESET_LABELS } from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import type { Filters } from '@/lib/filters/schema';
import { deltaPct, formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { HomeData } from '@/lib/queries/home';
import { BarChart } from './bar-chart';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const card = 'rounded-xl border border-line bg-surface p-4';
const rate = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

/** Short month label from a YYYY-MM-DD string. */
function monthLabel(ymd: string): string {
  const m = Number(ymd.slice(5, 7));
  return SHORT_MONTHS[m - 1] ?? ymd.slice(5, 7);
}

/** Sparkline tone derived from a delta percentage. */
function sparkTone(pct: number | null | undefined): 'up' | 'down' | 'flat' {
  if (pct === undefined || pct === null) return 'flat';
  return pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
}

/** Relative time like "2 hours ago" computed from an ISO string to `now`. */
function relativeTime(isoAt: string, nowMs: number): string {
  const diff = nowMs - new Date(isoAt).getTime();
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// Segment colours for the donut
// ---------------------------------------------------------------------------

const SEGMENT_COLORS: Record<string, string> = {
  active: 'rgb(var(--chart-1))',        // emerald
  recently_active: 'rgb(var(--chart-2))', // blue
  cooling: 'rgb(var(--chart-3))',        // amber
  inactive: 'rgb(var(--chart-5))',       // rose
  prospect: 'rgb(var(--chart-6))',       // slate
};

// ---------------------------------------------------------------------------
// Existing sections (kept from previous build)
// ---------------------------------------------------------------------------

function TargetCard({ data, unit }: { data: CommandCenterData; unit: MoneyUnit }) {
  const t = data.target;
  if (!t) {
    return (
      <div className={cn(card, 'flex flex-col justify-center')}>
        <h3 className="text-sm font-medium">Monthly target</h3>
        <p className="mt-2 text-sm text-muted">No target is set for this month yet. Until the Targets tab ships, add a row to the monthly_targets table and it will appear here.</p>
      </div>
    );
  }
  const [y = '', m = '1'] = t.month.split('-');
  const frac = Math.min(1, t.pct / 100);
  const r = 44;
  return (
    <div className={card}>
      <h3 className="text-sm font-medium">
        Target: {FULL_MONTHS[Number(m) - 1]} {y}
      </h3>
      <div className="mt-3 flex items-center gap-5">
        <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${t.pct.toFixed(0)} percent of target`}>
          <circle cx="56" cy="56" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="10" />
          <circle cx="56" cy="56" r={r} fill="none" stroke="rgb(var(--focus))" strokeWidth="10" strokeLinecap="round" transform="rotate(-90 56 56)" pathLength={1} strokeDasharray={`${frac} 1`} className="animate-draw" />
          <text x="56" y="62" textAnchor="middle" fontSize="20" fontWeight="600" fill="rgb(var(--fg))">
            {t.pct.toFixed(0)}%
          </text>
        </svg>
        <dl className="space-y-1 text-sm">
          <div><dt className="inline text-muted">Achieved </dt><dd className="inline font-medium">{formatMoney(t.actual, unit)}</dd></div>
          <div><dt className="inline text-muted">Target </dt><dd className="inline font-medium">{formatMoney(t.target, unit)}</dd></div>
          <div><dt className="inline text-muted">Projected </dt><dd className="inline font-medium">{formatMoney(t.projected, unit)}</dd></div>
          {t.requiredPerDay !== null && (
            <div><dt className="inline text-muted">Needed per day </dt><dd className="inline font-medium">{formatMoney(t.requiredPerDay, unit)}</dd></div>
          )}
          <p className="pt-1 text-xs text-muted">Day {t.daysElapsed} of {t.daysInMonth}</p>
        </dl>
      </div>
      {/* thin progress bar under the ring */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-focus" style={{ width: `${Math.min(100, t.pct).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

function Funnel({ data }: { data: CommandCenterData }) {
  const c = data.current;
  const stages = [
    { label: 'Registered', n: c.registrations },
    { label: 'Tickets booked', n: c.ticketsBooked },
    { label: 'Tickets invested', n: c.ticketsInvested },
  ];
  const top = Math.max(1, ...stages.map((s) => s.n));
  return (
    <div className={card}>
      <h3 className="text-sm font-medium">Funnel (period activity)</h3>
      <div className="mt-3 space-y-3">
        {stages.map((s) => (
          <div key={s.label}>
            <div className="flex justify-between text-sm">
              <span className="text-muted">{s.label}</span>
              <span className="font-medium">{formatInt(s.n)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, (s.n / top) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Invested per booked ticket: {rate(c.ticketsInvested, c.ticketsBooked).toFixed(0)}%. These are counts of activity in the period, not one cohort of people.
      </p>
    </div>
  );
}

function Attention({ data, unit }: { data: CommandCenterData; unit: MoneyUnit }) {
  const a = data.attention;
  const tiles = [
    { Icon: Hourglass, label: 'Deposits awaiting approval', n: a.pendingDeposits.count, sub: formatMoney(a.pendingDeposits.amount, unit) },
    { Icon: Clock, label: `Bookings open over ${a.stuckBookings.olderThanDays} days`, n: a.stuckBookings.count, sub: 'not yet invested' },
    { Icon: Send, label: 'Payouts in flight', n: a.payoutsInFlight.count, sub: formatMoney(a.payoutsInFlight.amount, unit) },
    { Icon: CalendarClock, label: `Maturing in ${a.maturingSoon.withinDays} days`, n: a.maturingSoon.count, sub: formatMoney(a.maturingSoon.amount, unit) },
  ];
  return (
    <div className={card}>
      <h3 className="text-sm font-medium">Needs attention <span className="font-normal text-muted">(right now)</span></h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {tiles.map(({ Icon, label, n, sub }) => (
          <div key={label} className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="truncate">{label}</span>
            </div>
            <p className={cn('mt-1 text-xl font-semibold', n > 0 && 'text-amber-600 dark:text-amber-400')}>{formatInt(n)}</p>
            <p className="text-xs text-muted">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right-rail components
// ---------------------------------------------------------------------------

const INSIGHT_ICONS: Record<Insight['tone'], { Icon: typeof TrendingUp; cls: string }> = {
  good: { Icon: TrendingUp, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  warn: { Icon: AlertTriangle, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  info: { Icon: Lightbulb, cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
};

function QuickInsightsCard({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className={card}>
      <h3 className="text-sm font-medium">Quick insights</h3>
      <ul className="mt-3 space-y-2.5">
        {insights.map((i) => {
          const { Icon, cls } = INSIGHT_ICONS[i.tone];
          return (
            <li key={i.text} className="flex gap-2.5 text-sm">
              <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg', cls)}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span>{i.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ACTIVITY_FALLBACK = { Icon: Wallet, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' } as const;
const ACTIVITY_ICONS: Record<string, { Icon: typeof Wallet; cls: string }> = {
  deposit: ACTIVITY_FALLBACK,
  payout: { Icon: Send, cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  registration: { Icon: UserPlus, cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  booking: { Icon: ClipboardList, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
};

function RecentActivityCard({ items, unit, nowMs }: { items: HomeData['recent']; unit: MoneyUnit; nowMs: number }) {
  if (items.length === 0) return null;
  return (
    <div className={card}>
      <h3 className="text-sm font-medium">Recent activity</h3>
      <ul className="mt-3 space-y-3">
        {items.map((item, idx) => {
          const { Icon, cls } = ACTIVITY_ICONS[item.kind] ?? ACTIVITY_FALLBACK;
          return (
            <li key={`${item.kind}-${item.at}-${idx}`} className="flex gap-2.5 text-sm">
              <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cls)}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted">
                  {item.userId !== null ? (
                    <Link href={`/investors/${item.userId}`} className="underline decoration-line hover:text-fg">{item.name || 'Investor'}</Link>
                  ) : (
                    <span>{item.name || '—'}</span>
                  )}
                  {item.amount !== null && <span className="ml-1.5">{formatMoney(item.amount, unit)}</span>}
                </p>
                <p className="text-xs text-muted">{relativeTime(item.at, nowMs)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function CommandCenterView({ data, filters, unit }: { data: HomeData; filters: Filters; unit: MoneyUnit }) {
  const { current: c, previous: p } = data;
  const insights = buildInsights(data, unit);
  const d = (cur: number, prev: number | undefined) => (p ? deltaPct(cur, prev ?? 0) : undefined);
  const avg = (s: { sales: number; ticketsInvested: number }) => (s.ticketsInvested > 0 ? s.sales / s.ticketsInvested : 0);

  const nowMs = new Date(data.generatedAt).getTime();

  // Payout sum for KPI
  const payoutsTotal = data.payouts.reduce((a, b) => a + b, 0);

  // Project donut total
  const projectTotal = data.byProject.reduce((a, b) => a + b.value, 0);

  // Segment donut slices with fixed colours
  const segmentSlices = data.segments.map((s) => ({
    key: s.key,
    label: s.key.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase()),
    value: s.investors,
    color: SEGMENT_COLORS[s.key],
  }));
  const segmentTotal = data.segments.reduce((a, b) => a + b.investors, 0);

  // Sales vs Reinvest bar items
  const barItems = data.salesVsReinvest.map((m) => ({
    label: monthLabel(m.month),
    values: [
      { value: m.other, color: CHART_COLORS[0] ?? '', name: 'Other deposits' },
      { value: m.reinvest, color: CHART_COLORS[3] ?? '', name: 'Reinvested' },
    ],
  }));

  // AreaChart series
  const areaLabels = data.series.map((s) => s.label);
  const areaSeries: { key: string; label: string; color?: string; values: number[]; dashed?: boolean }[] = [
    { key: 'deposits', label: 'Deposits', values: data.series.map((s) => s.value) },
    { key: 'payouts', label: 'Payouts', values: data.payouts, color: CHART_COLORS[1] },
  ];
  if (data.compareRange) {
    areaSeries.push({
      key: 'prev',
      label: 'Previous period',
      values: data.series.map((s) => s.compare ?? 0),
      dashed: true,
      color: CHART_COLORS[5],
    });
  }

  // Export URLs
  const exportBase = `/api/export/explorer?t=deposits&from=${encodeURIComponent(data.range.from)}&to=${encodeURIComponent(data.range.to)}&p=custom`;
  const csvHref = `${exportBase}&fmt=csv`;
  const xlsxHref = `${exportBase}&fmt=xlsx`;

  // Delta helpers for row-2 KPIs
  const dSales = d(c.sales, p?.sales);
  const dTickets = d(c.ticketsInvested, p?.ticketsInvested);
  const dUnique = d(c.uniqueInvestors, p?.uniqueInvestors);
  const dRegs = d(c.registrations, p?.registrations);
  const dAvg = d(avg(c), p ? avg(p) : undefined);

  return (
    <div className="space-y-5">
      {/* Header ------------------------------------------------------------ */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Command Center</h2>
          <p className="mt-1 text-sm text-muted">
            {filters.preset === 'custom' ? 'Custom' : PRESET_LABELS[filters.preset]}: {formatRange(data.range)}
            {data.compareRange ? ` · vs ${COMPARE_LABELS[filters.compare]} (${formatRange(data.compareRange)})` : ''}
          </p>
          {filters.segments.length > 0 && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">The segment filter is applied on the Investors tab, not here yet.</p>}
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      {/* Two-column layout ------------------------------------------------- */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main area */}
        <div className="space-y-4">
          {/* Row 1: four primary KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard i={0} icon={Wallet} tone="blue" label="Investment value" delta={dSales} spark={<Sparkline values={data.kpiSpark.sales} tone={sparkTone(dSales)} />}>
              <CountUp value={c.sales} kind="money" unit={unit} />
            </KpiCard>
            <KpiCard i={1} icon={Users} tone="emerald" label="Investors" hint={`${formatInt(data.investorTotals.everInvested)} have invested, ${formatInt(data.investorTotals.active)} active now`}>
              <CountUp value={data.investorTotals.registered} kind="int" />
            </KpiCard>
            <KpiCard i={2} icon={Send} tone="violet" label="Payouts completed" hint="in this period" spark={<Sparkline values={data.payouts} tone={sparkTone(undefined)} />}>
              <CountUp value={payoutsTotal} kind="money" unit={unit} />
            </KpiCard>
            <KpiCard i={3} icon={Hourglass} tone="amber" label="Pending deposits" hint={formatMoney(data.attention.pendingDeposits.amount, unit)}>
              <CountUp value={data.attention.pendingDeposits.count} kind="int" />
            </KpiCard>
          </div>

          {/* Row 2: four secondary KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard i={4} icon={Wallet} tone="blue" label="Tickets invested" delta={dTickets} spark={<Sparkline values={data.kpiSpark.ticketsInvested} tone={sparkTone(dTickets)} />}>
              <CountUp value={c.ticketsInvested} kind="int" />
            </KpiCard>
            <KpiCard i={5} icon={Users} tone="emerald" label="Unique investors" delta={dUnique} hint={`${formatInt(c.newInvestors)} new / ${formatInt(c.oldInvestors)} returning`} spark={<Sparkline values={data.kpiSpark.uniqueInvestors} tone={sparkTone(dUnique)} />}>
              <CountUp value={c.uniqueInvestors} kind="int" />
            </KpiCard>
            <KpiCard i={6} icon={UserPlus} tone="blue" label="Registrations" delta={dRegs} spark={<Sparkline values={data.kpiSpark.registrations} tone={sparkTone(dRegs)} />}>
              <CountUp value={c.registrations} kind="int" />
            </KpiCard>
            <KpiCard i={7} icon={Wallet} tone="violet" label="Average ticket" delta={dAvg} hint="investment value per ticket" spark={<Sparkline values={data.kpiSpark.avgTicket} tone={sparkTone(dAvg)} />}>
              <CountUp value={avg(c)} kind="money" unit={unit} />
            </KpiCard>
          </div>

          {/* Row 3: Deposits vs Payouts (2/3) + Investment by project (1/3) */}
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="Deposits vs payouts" subtitle={data.compareRange ? `Dashed: ${COMPARE_LABELS[filters.compare].toLowerCase()}` : undefined}>
              <AreaChart labels={areaLabels} series={areaSeries} bucket={data.bucket} unit={unit} />
            </ChartCard>
            <ChartCard title="Investment by project">
              <div className="flex flex-wrap items-center gap-4">
                <DonutChart slices={data.byProject} centerValue={formatMoney(projectTotal, unit)} centerLabel="Total investment" />
                <DonutLegend slices={data.byProject} format="value" valueText={(key) => formatMoney(data.byProject.find((p) => p.key === key)?.value ?? 0, unit)} />
              </div>
            </ChartCard>
          </div>

          {/* Row 4: three equal charts */}
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Sales vs reinvested">
              <BarChart items={barItems} unit={unit} />
            </ChartCard>
            <ChartCard title="Investor segments">
              <div className="flex flex-wrap items-center gap-4">
                <DonutChart slices={segmentSlices} centerValue={formatInt(segmentTotal)} centerLabel="Total investors" size={140} />
                <DonutLegend slices={segmentSlices} format="value" />
              </div>
            </ChartCard>
            <ChartCard title="Payouts by category">
              <HBarList items={data.payoutsByCategory.map((r) => ({ key: r.key, label: r.label, value: r.value }))} kind="money" unit={unit} />
            </ChartCard>
          </div>

          {/* Row 5: Funnel + Target + Export */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Funnel data={data} />
            <TargetCard data={data} unit={unit} />
            <div className={cn(card, 'flex flex-col justify-between')}>
              <div>
                <h3 className="text-sm font-medium">Export data</h3>
                <p className="mt-2 text-sm text-muted">Deposits in the selected period. PDF prints this page.</p>
              </div>
              <div className="mt-4">
                <ExportBar csvHref={csvHref} xlsxHref={xlsxHref} />
              </div>
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <QuickInsightsCard insights={insights} />
          <RecentActivityCard items={data.recent} unit={unit} nowMs={nowMs} />
          <Attention data={data} unit={unit} />
        </div>
      </div>
    </div>
  );
}
