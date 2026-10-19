import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatInt } from '@/lib/format/money';
import type { ExplorerParams, ExplorerResult } from '@/lib/queries/explorer';

interface Props {
  data: ExplorerResult;
  params: ExplorerParams;
  searchParams: Record<string, string | string[] | undefined>;
}

type SearchValue = string | string[] | undefined;

const moneyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const statusTone: Record<string, string> = {
  approved: 'bg-emerald-500/10 text-emerald-700',
  completed: 'bg-emerald-500/10 text-emerald-700',
  closed: 'bg-emerald-500/10 text-emerald-700',
  pending: 'bg-amber-500/10 text-amber-700',
  initiated: 'bg-amber-500/10 text-amber-700',
  booked: 'bg-amber-500/10 text-amber-700',
  verifying: 'bg-amber-500/10 text-amber-700',
  rejected: 'bg-rose-500/10 text-rose-700',
  cancelled: 'bg-rose-500/10 text-rose-700',
  invested: 'bg-sky-500/10 text-sky-700',
};

const tableStatuses: Record<ExplorerParams['table'], string[]> = {
  deposits: ['approved', 'pending', 'rejected'],
  orders: ['closed', 'cancelled', 'invested', 'booked', 'verifying'],
  payouts: ['completed', 'initiated'],
  investors: [],
};

function firstValue(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function ExplorerView({ data, params, searchParams }: Props) {
  const currentQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const first = firstValue(value);
    if (first !== undefined) currentQuery.set(key, first);
  }

  const href = (overrides: Record<string, string | undefined>) => {
    const query = new URLSearchParams(currentQuery);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === '') query.delete(key);
      else query.set(key, value);
    }
    const queryString = query.toString();
    return queryString ? `/explorer?${queryString}` : '/explorer';
  };

  const exportQuery = new URLSearchParams(currentQuery);
  exportQuery.delete('page');
  const exportUrl = `/api/export/explorer?${exportQuery.toString()}`;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = Math.min(data.page * data.pageSize, data.total);

  return (
    <div className="space-y-5">
      <div className="animate-rise">
        <h2 className="text-xl font-semibold tracking-tight">Data Explorer</h2>
        <p className="mt-1 text-sm text-muted">
          Raw records for the selected date range. Filter, sort, and export what you see.
        </p>
      </div>

      <nav aria-label="Explorer tables" className="group inline-flex rounded-md border border-line">
        {([
          ['deposits', 'Deposits'],
          ['orders', 'Orders'],
          ['payouts', 'Payouts'],
          ['investors', 'Investors'],
        ] as const).map(([table, label]) => (
          <Link
            key={table}
            href={href({ t: table, page: '', sort: '', dir: '', st: '' })}
            className={`rounded-md px-3 py-1.5 text-sm ${
              params.table === table ? 'bg-ink text-ink-fg' : 'text-muted hover:text-fg'
            }`}
            aria-current={params.table === table ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" action="/explorer" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="t" value={params.table} />
          {Object.entries(searchParams)
            .filter(([key, value]) => key !== 't' && key !== 'q' && key !== 'st' && key !== 'page' && value !== undefined)
            .flatMap(([key, value]) =>
              (Array.isArray(value) ? value : [value]).map((item, index) => (
                <input key={`${key}-${index}`} type="hidden" name={key} value={item} />
              )),
            )}
          <label className="space-y-1 text-xs text-muted">
            <span className="sr-only">Search records</span>
            <input
              type="search"
              name="q"
              defaultValue={params.search}
              placeholder="Search name, phone, email or id"
              title="Enter at least 2 characters to search"
              minLength={2}
              className="w-72 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-muted"
            />
          </label>
          {tableStatuses[params.table].length > 0 && (
            <select
              name="st"
              defaultValue={params.status[0] ?? ''}
              aria-label="Status"
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg"
            >
              <option value="">All statuses</option>
              {tableStatuses[params.table].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="rounded-md bg-ink px-3 py-1.5 text-sm text-ink-fg">
            Apply
          </button>
        </form>
        <Link
          href={exportUrl}
          download
          className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          Export CSV
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <p>
          {formatInt(data.total)} records
          {data.total > 0 && <span className="ml-2">Showing {formatInt(from)}-{formatInt(to)}</span>}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href={href({ page: String(Math.max(1, data.page - 1)) })}
            aria-disabled={data.page <= 1}
            className={data.page <= 1 ? 'pointer-events-none opacity-50' : 'hover:text-fg'}
          >
            Previous
          </Link>
          <span>Page {formatInt(data.page)} of {formatInt(pages)}</span>
          <Link
            href={href({ page: String(Math.min(pages, data.page + 1)) })}
            aria-disabled={data.page >= pages}
            className={data.page >= pages ? 'pointer-events-none opacity-50' : 'hover:text-fg'}
          >
            Next
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        {data.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">No records for these filters.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line">
                {data.columns.map((column) => {
                  const active = data.sort === column.key;
                  const next = active && data.dir === 'desc' ? 'asc' : 'desc';
                  const SortIcon = data.dir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={`whitespace-nowrap px-3 py-2 font-medium text-muted ${
                        column.kind === 'money' || column.kind === 'int' ? 'text-right' : 'text-left'
                      }`}
                    >
                      <Link
                        href={href({ sort: column.key, dir: next, page: '' })}
                        className="inline-flex items-center gap-1 hover:text-fg"
                      >
                        {column.label}
                        {active && <SortIcon className="h-3.5 w-3.5" aria-hidden />}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIndex) => (
                <tr key={`${String(row.id ?? rowIndex)}-${rowIndex}`} className="border-b border-line last:border-0">
                  {data.columns.map((column) => {
                    const value = row[column.key];
                    const numeric = column.kind === 'money' || column.kind === 'int';
                    const cellClass = `whitespace-nowrap px-3 py-2 ${
                      numeric ? 'text-right tabular-nums' : 'text-left'
                    }`;
                    if (value === null || value === undefined || value === '') {
                      return <td key={column.key} className={cellClass}>-</td>;
                    }
                    if (column.kind === 'status') {
                      const status = String(value);
                      return (
                        <td key={column.key} className={cellClass}>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[status] ?? 'bg-line/60 text-muted'}`}>
                            {status}
                          </span>
                        </td>
                      );
                    }
                    let content: React.ReactNode = String(value);
                    if (column.kind === 'int') content = formatInt(Number(value));
                    if (column.kind === 'money') content = moneyFormatter.format(Number(value));
                    if ((column.key === 'investor' || column.key === 'name') && typeof row.userId === 'number' && row.userId > 0) {
                      content = (
                        <Link href={`/investors/${row.userId}`} className="font-medium hover:underline">
                          {String(value)}
                        </Link>
                      );
                    }
                    return <td key={column.key} className={cellClass}>{content}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
