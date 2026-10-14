import { ArrowDownRight, ArrowUpRight, CalendarClock, Clock, Hourglass, Minus, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { buildInsights } from '@/lib/dashboard/insights';
import type { CommandCenterData } from '@/lib/dashboard/types';
import { COMPARE_LABELS, PRESET_LABELS } from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import type { Filters } from '@/lib/filters/schema';
import { deltaPct, formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';
import { TrendChart } from './trend-chart';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const rate = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const card = 'rounded-xl border border-line bg-surface p-4';

function Delta({ pct }: { pct: number | null | undefined }) {
  if (pct === undefined) return null;
  if (pct === null) return <span className="text-xs text-muted">new</span>;
  const up = pct > 0.05;
  const down = pct < -0.05;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', up && 'text-emerald-600 dark:text-emerald-400', down && 'text-rose-600 dark:text-rose-400', !up && !down && 'text-muted')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Kpi({ label, delta, hint, i, children }: { label: string; delta?: number | null; hint: string; i: number; children: ReactNode }) {
  return (
    <div className={cn(card, 'animate-rise')} style={{ animationDelay: `${i * 40}ms` }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <Delta pct={delta} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{children}</p>
      <p className="mt-1 truncate text-xs text-muted">{hint}</p>
    </div>
  );
}

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
        Target: {MONTHS[Number(m) - 1]} {y}
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

export function CommandCenterView({ data, filters, unit }: { data: CommandCenterData; filters: Filters; unit: MoneyUnit }) {
  const { current: c, previous: p } = data;
  const insights = buildInsights(data, unit);
  const d = (cur: number, prev: number | undefined) => (p ? deltaPct(cur, prev ?? 0) : undefined);
  const avg = (s: { sales: number; ticketsInvested: number }) => (s.ticketsInvested > 0 ? s.sales / s.ticketsInvested : 0);
  const cancelRate = rate(c.ticketsCancelled, c.ticketsBooked);
  const statuses = `${filters.depositStatus.join(' + ')} deposits${filters.excludeReinvest ? ', no reinvest' : ''}`;

  return (
    <div className="space-y-5">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi i={0} label="Investment value" delta={d(c.sales, p?.sales)} hint={statuses}><CountUp value={c.sales} kind="money" unit={unit} /></Kpi>
        <Kpi i={1} label="Tickets invested" delta={d(c.ticketsInvested, p?.ticketsInvested)} hint={`Average ticket ${formatMoney(avg(c), unit)}`}><CountUp value={c.ticketsInvested} kind="int" /></Kpi>
        <Kpi i={2} label="Unique investors" delta={d(c.uniqueInvestors, p?.uniqueInvestors)} hint={`${formatInt(c.newInvestors)} new, ${formatInt(c.oldInvestors)} returning`}><CountUp value={c.uniqueInvestors} kind="int" /></Kpi>
        <Kpi i={3} label="Registrations" delta={d(c.registrations, p?.registrations)} hint="new investor accounts"><CountUp value={c.registrations} kind="int" /></Kpi>
        <Kpi i={4} label="New investors" delta={d(c.newInvestors, p?.newInvestors)} hint="first-ever investment in the period"><CountUp value={c.newInvestors} kind="int" /></Kpi>
        <Kpi i={5} label="Returning investors" delta={d(c.oldInvestors, p?.oldInvestors)} hint="invested before this period"><CountUp value={c.oldInvestors} kind="int" /></Kpi>
        <Kpi i={6} label="Tickets booked" delta={d(c.ticketsBooked, p?.ticketsBooked)} hint={`${cancelRate.toFixed(1)}% cancelled`}><CountUp value={c.ticketsBooked} kind="int" /></Kpi>
        <Kpi i={7} label="Average ticket" delta={d(avg(c), p ? avg(p) : undefined)} hint="investment value per ticket"><CountUp value={avg(c)} kind="money" unit={unit} /></Kpi>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={cn(card, 'xl:col-span-2')}>
          <h3 className="mb-2 text-sm font-medium">Investment value over time</h3>
          <TrendChart points={data.series} bucket={data.bucket} unit={unit} />
          {data.compareRange && <p className="mt-1 text-xs text-muted">Dashed line: {COMPARE_LABELS[filters.compare].toLowerCase()}.</p>}
        </div>
        <TargetCard data={data} unit={unit} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Funnel data={data} />
        <Attention data={data} unit={unit} />
      </div>

      {insights.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-medium">What changed</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {insights.map((i) => (
              <li key={i.text} className="flex gap-2">
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.tone === 'good' && 'bg-emerald-500', i.tone === 'warn' && 'bg-amber-500', i.tone === 'info' && 'bg-sky-500')} aria-hidden />
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
