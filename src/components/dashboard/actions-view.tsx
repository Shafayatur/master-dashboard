'use client';

import { AlertTriangle, CalendarClock, Clock, Hourglass, Snowflake } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KpiCard } from '@/components/charts/kpi-card';
import { formatRange } from '@/lib/filters/format';
import { addDays, type DateRange } from '@/lib/filters/dates';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { ActionListsData, Contact } from '@/lib/queries/action-lists';
import { ActionListCard } from './action-list-card';
import { CountUp } from './count-up';
import { InlineDateRangePopover } from './inline-date-range-popover';
import { PageTools } from './page-tools';

const windows = [7, 14, 30] as const;
const SHOW_OVERDUE_UI = true;

function InvestorCell({ investor }: { investor: Contact }) {
  return (
    <div>
      <p>
        <Link href={`/investors/${investor.userId}`} className="font-medium hover:underline">
          {investor.name}
        </Link>
      </p>
      <div className="mt-0.5 space-y-0.5 text-xs text-muted">
        {investor.phone && (
          <p>
            <a href={`tel:${investor.phone}`} className="hover:text-fg">{investor.phone}</a>
          </p>
        )}
        {investor.email && <p>{investor.email}</p>}
      </div>
    </div>
  );
}

export function ActionsView({
  data,
  unit,
  today,
  maturityRange,
}: {
  data: ActionListsData;
  unit: MoneyUnit;
  today: string;
  maturityRange: DateRange | null;
}) {
  const router = useRouter();
  const maturityExportQuery = maturityRange
    ? new URLSearchParams({ from: maturityRange.from, to: maturityRange.to }).toString()
    : `days=${data.maturingDays}`;
  const kpis = [
    { label: 'Maturing soon', total: data.maturing.total, amount: data.maturing.amount, icon: CalendarClock, tone: 'blue' as const },
    ...(SHOW_OVERDUE_UI
      ? [{ label: 'Overdue: status needs update', total: data.overdue.total, amount: data.overdue.amount, icon: AlertTriangle, tone: 'rose' as const }]
      : []),
    { label: 'Cooling investors', total: data.cooling.total, amount: data.cooling.amount, icon: Snowflake, tone: 'amber' as const },
    { label: 'Stuck bookings', total: data.stuck.total, amount: data.stuck.amount, icon: Clock, tone: 'violet' as const },
    { label: 'Pending deposits', total: data.pending.total, amount: data.pending.amount, icon: Hourglass, tone: 'rose' as const },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Action Lists</h2>
          <p className="mt-1 text-sm text-muted">Who to contact today. Live data, no filters apply.</p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      <div className={`grid gap-4 sm:grid-cols-2 ${SHOW_OVERDUE_UI ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
        {kpis.map(({ label, total, amount, icon, tone }, index) => (
          <KpiCard
            key={label}
            i={index}
            icon={icon}
            tone={tone}
            label={label}
            hint={formatMoney(amount, unit)}
          >
            <CountUp value={total} kind="int" />
          </KpiCard>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted">Maturing within</span>
        <div className="inline-flex overflow-hidden rounded-md border border-line" aria-label="Maturity window">
          {windows.map((days) => (
            <Link
              key={days}
              href={`/actions?days=${days}`}
              aria-current={data.maturingDays === days ? 'page' : undefined}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                data.maturingDays === days ? 'bg-ink text-ink-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {days}
            </Link>
          ))}
        </div>
        <span className="text-xs text-muted">days</span>
        {maturityRange && <span className="text-xs font-medium text-fg">{formatRange(maturityRange)}</span>}
        <InlineDateRangePopover
          from={maturityRange?.from ?? today}
          to={maturityRange?.to ?? addDays(today, data.maturingDays)}
          isCustomActive={maturityRange !== null}
          onApply={(from, to) => {
            const params = new URLSearchParams({ from, to });
            router.push(`/actions?${params.toString()}`);
          }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ActionListCard
          title={maturityRange ? `Maturing ${formatRange(maturityRange)}` : 'Maturing soon'}
          description={maturityRange
            ? `Active orders with maturity dates from ${formatRange(maturityRange)}.`
            : `Active orders maturing within ${data.maturingDays} days, plus orders in the 5-day disbursement grace period.`}
          total={data.maturing.total}
          amountLabel={`Invested amount: ${formatMoney(data.maturing.amount, unit)}`}
          shown={data.maturing.rows.length}
          exportHref={`/api/export/actions?list=maturing&${maturityExportQuery}`}
          excelHref={`/api/export/actions?list=maturing&${maturityExportQuery}&fmt=xlsx`}
          headers={['Investor', 'Project', 'Amount', 'Matures', 'Days left', 'Lifetime value', 'Investments']}
          rows={data.maturing.rows.map((row) => [
            <InvestorCell key={`investor-${row.orderId}`} investor={row} />,
            row.project,
            formatMoney(row.amount, unit),
            row.maturity,
            String(row.daysLeft),
            formatMoney(row.lifetimeValue, unit),
            formatInt(row.investments),
          ])}
          emptyText="No investments are in the selected maturity window or grace period."
        />
        {SHOW_OVERDUE_UI && (
        <ActionListCard
          title="Overdue: status needs update"
          description="Invested orders more than 5 days past maturity (1–30, 31–90, and 90+ days). Follow up on payout or update the stale order status."
          total={data.overdue.total}
          amountLabel={`Invested amount: ${formatMoney(data.overdue.amount, unit)}`}
          shown={data.overdue.rows.length}
          exportHref="/api/export/actions?list=overdue"
          excelHref="/api/export/actions?list=overdue&fmt=xlsx"
          headers={['Investor', 'Order ID', 'Project', 'Amount', 'Matured on', 'Days overdue', 'Bucket', 'Lifetime value', 'Investments']}
          rows={data.overdue.rows.map((row) => [
            <InvestorCell key={`investor-${row.orderId}`} investor={row} />,
            formatInt(row.orderId),
            row.project,
            formatMoney(row.amount, unit),
            row.maturity,
            String(row.daysOverdue),
            row.bucket,
            formatMoney(row.lifetimeValue, unit),
            formatInt(row.investments),
          ])}
          emptyText="No investments are more than 5 days past maturity."
        />
        )}
        <ActionListCard
          title="Cooling investors"
          description="Nothing running; the last project matured 30 to 60 days ago. Reach out before they turn inactive."
          total={data.cooling.total}
          amountLabel={`Lifetime value: ${formatMoney(data.cooling.amount, unit)}`}
          shown={data.cooling.rows.length}
          exportHref="/api/export/actions?list=cooling"
          excelHref="/api/export/actions?list=cooling&fmt=xlsx"
          headers={['Investor', 'Last project', 'Matured on', 'Days since', 'Lifetime value', 'Investments']}
          rows={data.cooling.rows.map((row) => [
            <InvestorCell key={`investor-${row.userId}`} investor={row} />,
            row.lastProject,
            row.lastMaturity,
            String(row.daysSince),
            formatMoney(row.lifetimeValue, unit),
            formatInt(row.investments),
          ])}
          emptyText="No cooling investors right now."
        />
        <ActionListCard
          title="Stuck bookings"
          description="Booked or verifying for more than 3 days without becoming an investment."
          total={data.stuck.total}
          amountLabel={`Booked amount: ${formatMoney(data.stuck.amount, unit)}`}
          shown={data.stuck.rows.length}
          exportHref="/api/export/actions?list=stuck"
          excelHref="/api/export/actions?list=stuck&fmt=xlsx"
          headers={['Investor', 'Project', 'Status', 'Amount', 'Booked on', 'Days open']}
          rows={data.stuck.rows.map((row) => [
            <InvestorCell key={`investor-${row.orderId}`} investor={row} />,
            row.project,
            row.status,
            formatMoney(row.amount, unit),
            row.created,
            String(row.daysOpen),
          ])}
          emptyText="No bookings have been stuck for more than 3 days."
        />
        <ActionListCard
          title="Pending deposits"
          description="Deposits waiting for approval, oldest first."
          total={data.pending.total}
          amountLabel={`Pending amount: ${formatMoney(data.pending.amount, unit)}`}
          shown={data.pending.rows.length}
          exportHref="/api/export/actions?list=pending"
          excelHref="/api/export/actions?list=pending&fmt=xlsx"
          headers={['Investor', 'Amount', 'Method', 'Deposit date', 'Days waiting']}
          rows={data.pending.rows.map((row) => [
            <InvestorCell key={`investor-${row.depositId}`} investor={row} />,
            formatMoney(row.amount, unit),
            row.method,
            row.date,
            String(row.daysWaiting),
          ])}
          emptyText="No deposits are waiting for approval."
        />
      </div>
    </div>
  );
}
