'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { InvestorProfile } from '@/lib/queries/investor-profile';

interface Props {
  p: InvestorProfile;
  unit: MoneyUnit;
}

const card = 'rounded-xl border border-line bg-surface p-4';
type ProfileTab = 'investments' | 'deposits' | 'payouts';

const segmentStyle = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  recently_active: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  cooling: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  inactive: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  prospect: 'bg-line text-muted',
} as const;
const segmentLabel = {
  active: 'Active',
  recently_active: 'Recently active',
  cooling: 'Cooling',
  inactive: 'Inactive',
  prospect: 'Prospect',
} as const;
const statusStyle: Record<string, string> = {
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  closed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  initiated: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  booked: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  verifying: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rejected: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  cancelled: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  invested: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusStyle[status] ?? 'bg-line text-muted'}`}>
      {status}
    </span>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={card}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

interface ProfileColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** The one column that soaks up spare width. Every other column hugs its content. */
  flex?: boolean;
}

interface ProfileRow {
  key: number;
  values: Record<string, ReactNode>;
}

function ProfileTable({
  columns,
  rows,
}: {
  columns: ProfileColumn[];
  rows: ProfileRow[];
}) {
  const cell = (c: ProfileColumn) =>
    [
      'px-4',
      c.align === 'right' ? 'text-right tabular-nums' : 'text-left',
      c.flex ? 'w-full max-w-0' : 'w-px whitespace-nowrap',
    ].join(' ');

  return (
    <div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No records.</p>
      ) : (
        // -mx-4 lets the dividers run edge to edge; px-4 on cells puts the text
        // back on the same left/right edge as the card title.
        <div className="-mx-4 mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={`${cell(c)} py-2.5 font-medium`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-b-0">
                  {columns.map((c) => (
                    <td key={`${row.key}-${c.key}`} className={`${cell(c)} py-3 ${c.flex ? 'truncate' : ''}`}>
                      {row.values[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function InvestorProfileView({ p, unit }: Props) {
  const [activeTab, setActiveTab] = useState<ProfileTab>('investments');
  const nextMaturity = p.nextMaturity;
  const daysDescription = nextMaturity
    ? nextMaturity.daysLeft < 0
      ? `${Math.abs(nextMaturity.daysLeft)} days overdue`
      : `${nextMaturity.daysLeft} days`
    : '';

  return (
    <div className="space-y-5">
      <Link href="/investors" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Investors
      </Link>

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${segmentStyle[p.segment]}`}>
                {segmentLabel[p.segment]}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {p.phone && <a href={`tel:${p.phone}`} className="hover:text-fg">{p.phone}</a>}
              {p.email && <a href={`mailto:${p.email}`} className="hover:text-fg">{p.email}</a>}
            </div>
            <p className="mt-2 text-xs text-muted">Registered {p.registered}</p>
          </div>
          <div className="flex gap-2">
            <span className={`rounded-full px-2 py-1 text-xs ${p.emailVerified ? segmentStyle.active : 'bg-line text-muted'}`}>
              Email verified
            </span>
            <span className={`rounded-full px-2 py-1 text-xs ${p.phoneVerified ? segmentStyle.active : 'bg-line text-muted'}`}>
              Phone verified
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Lifetime value"
          value={formatMoney(p.lifetimeValue, unit)}
        />
        <Kpi
          label="Approved deposits"
          value={formatInt(p.approvedDeposits)}
          hint={`First ${p.firstInvestment ?? '-'}, latest ${p.lastInvestment ?? '-'}`}
        />
        <Kpi
          label="Reinvested"
          value={`${formatInt(p.reinvestDeposits)} deposits`}
          hint={formatMoney(p.reinvestAmount, unit)}
        />
        <Kpi label="Paid out" value={formatMoney(p.totalPaidOut, unit)} />
        <Kpi
          label="Preferred tenure"
          value={p.preferredTenureMonths === null ? '-' : `${p.preferredTenureMonths} months`}
        />
        <Kpi
          label="Next maturity"
          value={nextMaturity ? `${nextMaturity.date} · ${daysDescription}` : '-'}
          hint={nextMaturity?.project}
        />
      </div>


      <section className={card}>
        <div role="tablist" aria-label="Investor records" className="mb-4 inline-flex rounded-lg border border-line p-0.5 text-xs">
          {([
            { id: 'investments', label: 'Investments', count: p.orders.length },
            { id: 'deposits', label: 'Deposits', count: p.deposits.length },
            { id: 'payouts', label: 'Payouts', count: p.payouts.length },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              id={`profile-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`profile-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                const tabIds: ProfileTab[] = ['investments', 'deposits', 'payouts'];
                const currentIndex = tabIds.indexOf(tab.id);
                const nextIndex = event.key === 'ArrowRight'
                  ? (currentIndex + 1) % tabIds.length
                  : event.key === 'ArrowLeft'
                    ? (currentIndex - 1 + tabIds.length) % tabIds.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabIds.length - 1
                        : -1;
                if (nextIndex < 0) return;
                event.preventDefault();
                const nextTab = tabIds[nextIndex];
                if (nextTab) {
                  setActiveTab(nextTab);
                  document.getElementById(`profile-tab-${nextTab}`)?.focus();
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
                activeTab === tab.id ? 'bg-line font-medium text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {tab.label}
              <span className="rounded-full bg-surface px-1.5 py-0.5 tabular-nums text-muted">{formatInt(tab.count)}</span>
            </button>
          ))}
        </div>

        <div
          id={`profile-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`profile-tab-${activeTab}`}
          tabIndex={0}
          className="focus-visible:outline-none"
        >
          {activeTab === 'investments' && (
            <ProfileTable
              columns={[
                { key: 'project', label: 'Project', flex: true },
                { key: 'status', label: 'Status' },
                { key: 'order', label: 'Order' },
                { key: 'booked', label: 'Booked' },
                { key: 'invested', label: 'Invested' },
                { key: 'matures', label: 'Matures' },
                { key: 'amount', label: 'Amount', align: 'right' },
              ]}
              rows={p.orders.map((order) => ({
                key: order.orderId,
                values: {
                  order: formatInt(order.orderId),
                  project: order.project,
                  status: <StatusPill key={`order-status-${order.orderId}`} status={order.status} />,
                  amount: formatMoney(order.amount, unit),
                  booked: order.created,
                  invested: order.investmentDate ?? '-',
                  matures: order.maturity ?? '-',
                },
              }))}
            />
          )}
          {activeTab === 'deposits' && (
            <ProfileTable
              columns={[
                { key: 'date', label: 'Date' },
                { key: 'method', label: 'Method', flex: true },
                { key: 'status', label: 'Status' },
                { key: 'order', label: 'Order' },
                { key: 'amount', label: 'Amount', align: 'right' },
              ]}
              rows={p.deposits.map((deposit) => ({
                key: deposit.depositId,
                values: {
                  date: deposit.date,
                  order: formatInt(deposit.orderId),
                  amount: formatMoney(deposit.amount, unit),
                  method: deposit.method,
                  status: <StatusPill key={`deposit-status-${deposit.depositId}`} status={deposit.status} />,
                },
              }))}
            />
          )}
          {activeTab === 'payouts' && (
            <ProfileTable
              columns={[
                { key: 'date', label: 'Date', flex: true },
                { key: 'status', label: 'Status' },
                { key: 'order', label: 'Order' },
                { key: 'amount', label: 'Amount', align: 'right' },
              ]}
              rows={p.payouts.map((payout) => ({
                key: payout.payoutId,
                values: {
                  date: payout.date,
                  order: formatInt(payout.orderId),
                  amount: formatMoney(payout.amount, unit),
                  status: <StatusPill key={`payout-status-${payout.payoutId}`} status={payout.status} />,
                },
              }))}
            />
          )}
        </div>
      </section>
    </div>
  );
}