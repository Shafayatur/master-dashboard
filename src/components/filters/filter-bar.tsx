'use client';

import { useState } from 'react';
import { CalendarDays, Check, ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { COMPARE_LABELS, COMPARE_MODES, PRESETS, PRESET_LABELS, isValidYmd, type CompareMode } from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import {
  DEPOSIT_STATUSES, INVESTOR_KINDS, ORDER_STATUSES, PAYMENT_METHODS, RETURN_TYPES, SEGMENTS, SHARIAH,
  activeFilterCount, type FilterPatch, type Filters,
} from '@/lib/filters/schema';
import { cn } from '@/components/ui/cn';
import { Popover, triggerClass } from '@/components/ui/popover';
import { useFilters } from './use-filters';

const LABELS = {
  deposit: { approved: 'Approved', pending: 'Pending', rejected: 'Rejected' },
  order: { invested: 'Invested', closed: 'Closed', booked: 'Booked', verifying: 'Verifying', cancelled: 'Cancelled' },
  payment: { bank_deposit: 'Bank deposit', cash: 'Cash', cheque: 'Cheque', reinvest: 'Reinvest' },
  returnType: { 'percentage-range': 'Percentage range', percentage: 'Percentage', fixed: 'Fixed amount' },
  segment: { active: 'Active', recently_active: 'Recently active', cooling: 'Cooling', inactive: 'Inactive', prospect: 'Prospect' },
  investorKind: { all: 'All', new: 'New', old: 'Returning' },
  shariah: { all: 'All', yes: 'Shariah only', no: 'Non-Shariah' },
} as const;

const TENURES = Array.from({ length: 36 }, (_, i) => i + 1);

function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function summarize(selected: readonly string[], labels: Record<string, string>, none: string): string {
  if (selected.length === 0) return none;
  if (selected.length === 1) return labels[selected[0] as string] ?? selected[0]!;
  return `${selected.length} selected`;
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-canvas"
    >
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-muted/50')}>
        {checked && <Check className="h-3 w-3" aria-hidden />}
      </span>
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, labels, onChange, name }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-lg border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cn('rounded-md px-2.5 py-1 text-sm transition-colors', value === o ? 'bg-ink text-white dark:bg-emerald-600' : 'text-muted hover:text-fg')}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function MultiSelect<T extends string>({ title, options, labels, selected, onChange, none }: { title: string; options: readonly T[]; labels: Record<T, string>; selected: readonly T[]; onChange: (v: T[]) => void; none: string }) {
  return (
    <Popover
      active={selected.length > 0 && none !== 'Approved'}
      label={
        <>
          <span className="text-muted">{title}</span>
          <span className="font-medium">{summarize(selected, labels, none)}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        </>
      }
    >
      <div className="w-52">
        {options.map((o) => (
          <CheckRow key={o} checked={selected.includes(o)} onChange={() => onChange(toggle(selected, o))}>
            {labels[o]}
          </CheckRow>
        ))}
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-muted hover:text-fg">
            Clear
          </button>
        )}
      </div>
    </Popover>
  );
}

function DatePicker({ filters, update }: { filters: Filters; update: (p: FilterPatch) => void }) {
  const [from, setFrom] = useState(filters.range.from);
  const [to, setTo] = useState(filters.range.to);
  const valid = isValidYmd(from) && isValidYmd(to);
  return (
    <Popover
      label={
        <>
          <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
          <span className="font-medium">{filters.preset === 'custom' ? 'Custom' : PRESET_LABELS[filters.preset]}</span>
          <span className="text-muted">{formatRange(filters.range)}</span>
        </>
      }
      panelClassName="w-[20rem]"
    >
      {(close) => (
        <div className="grid grid-cols-2 gap-3">
          <ul className="space-y-0.5">
            {PRESETS.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => {
                    update({ date: { preset: p } });
                    close();
                  }}
                  className={cn('w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-canvas', filters.preset === p && 'bg-canvas font-medium')}
                >
                  {PRESET_LABELS[p]}
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-l border-line pl-3">
            <label className="block text-xs text-muted">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2 text-sm" />
            </label>
            <label className="block text-xs text-muted">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2 text-sm" />
            </label>
            <button
              type="button"
              disabled={!valid}
              onClick={() => {
                update({ date: { preset: 'custom', range: { from, to } } });
                close();
              }}
              className="h-9 w-full rounded-md bg-ink text-sm font-medium text-white disabled:opacity-40 dark:bg-emerald-600"
            >
              Apply range
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

function MoreFilters({ filters, update }: { filters: Filters; update: (p: FilterPatch) => void }) {
  const extra = [filters.tenures.length > 0, filters.returnTypes.length > 0, filters.shariah !== 'all', filters.investorKind !== 'all', filters.segments.length > 0].filter(Boolean).length;
  return (
    <Popover
      active={extra > 0}
      label={
        <>
          <SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden />
          <span className="font-medium">More filters</span>
          {extra > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-xs text-white">{extra}</span>}
        </>
      }
      panelClassName="w-[22rem] space-y-4 p-4"
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Investors</legend>
        <Segmented name="Investors" value={filters.investorKind} options={INVESTOR_KINDS} labels={LABELS.investorKind} onChange={(investorKind) => update({ investorKind })} />
        <p className="mt-1 text-xs text-muted">New means first approved investment falls in the period.</p>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Shariah</legend>
        <Segmented name="Shariah" value={filters.shariah} options={SHARIAH} labels={LABELS.shariah} onChange={(shariah) => update({ shariah })} />
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Tenure (months)</legend>
        <div className="grid grid-cols-9 gap-1">
          {TENURES.map((t) => {
            const on = filters.tenures.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => update({ tenures: toggle(filters.tenures, t).sort((a, b) => a - b) })}
                className={cn('h-7 rounded text-xs', on ? 'bg-emerald-600 text-white' : 'bg-canvas text-muted hover:text-fg')}
              >
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Return type</legend>
        {RETURN_TYPES.map((r) => (
          <CheckRow key={r} checked={filters.returnTypes.includes(r)} onChange={() => update({ returnTypes: toggle(filters.returnTypes, r) })}>
            {LABELS.returnType[r]}
          </CheckRow>
        ))}
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Investor segment</legend>
        {SEGMENTS.map((s) => (
          <CheckRow key={s} checked={filters.segments.includes(s)} onChange={() => update({ segments: toggle(filters.segments, s) })}>
            {LABELS.segment[s]}
          </CheckRow>
        ))}
      </fieldset>
    </Popover>
  );
}

export function FilterBar() {
  const { filters, update, reset, pending } = useFilters();
  const count = activeFilterCount(filters);
  const dirty = count > 0 || filters.preset !== 'mtd' || filters.compare !== 'lastMonth';

  return (
    <div className="relative z-20 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur sm:px-6 print:hidden" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker key={`${filters.range.from}_${filters.range.to}`} filters={filters} update={update} />
        <label className={cn(triggerClass, 'relative gap-1.5 pr-2')}>
          <span className="text-muted">vs</span>
          <select
            aria-label="Compare with"
            value={filters.compare}
            onChange={(e) => update({ compare: e.target.value as CompareMode })}
            className="cursor-pointer bg-transparent pr-1 text-sm font-medium outline-none"
          >
            {COMPARE_MODES.map((m) => (
              <option key={m} value={m}>
                {COMPARE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
        <MultiSelect title="Deposits" none="Approved" options={DEPOSIT_STATUSES} labels={LABELS.deposit} selected={filters.depositStatus.length === 1 && filters.depositStatus[0] === 'approved' ? [] : filters.depositStatus} onChange={(depositStatus) => update({ depositStatus })} />
        <MultiSelect title="Orders" none="All" options={ORDER_STATUSES} labels={LABELS.order} selected={filters.orderStatus} onChange={(orderStatus) => update({ orderStatus })} />
        <MultiSelect title="Payment" none="All" options={PAYMENT_METHODS} labels={LABELS.payment} selected={filters.paymentMethod} onChange={(paymentMethod) => update({ paymentMethod })} />
        <button
          type="button"
          role="switch"
          aria-checked={filters.excludeReinvest}
          onClick={() => update({ excludeReinvest: !filters.excludeReinvest })}
          className={cn(triggerClass, filters.excludeReinvest && 'border-emerald-600/50 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200')}
        >
          Exclude reinvest
        </button>
        <MoreFilters filters={filters} update={update} />
        {dirty && (
          <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:text-fg">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </button>
        )}
      </div>
      {filters.compareRange && <p className="mt-2 text-xs text-muted">Compared with {formatRange(filters.compareRange)}</p>}
    </div>
  );
}
