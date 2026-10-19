import type { ReactNode } from 'react';

interface Props {
  title: string;
  description: string;
  total: number;
  amountLabel: string;
  shown: number;
  exportHref: string;
  excelHref?: string;
  headers: string[];
  rows: ReactNode[][];
  emptyText: string;
}

const isNumericCell = (cell: ReactNode): boolean =>
  typeof cell === 'string' && /^(?:[-+]?[$€£¥৳]\s*)?[-\d]/.test(cell);

export function ActionListCard({
  title,
  description,
  total,
  amountLabel,
  shown,
  exportHref,
  excelHref,
  headers,
  rows,
  emptyText,
}: Props) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            <span className="rounded-full border border-line px-2 text-xs">{total}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{description}</p>
          <p className="mt-1 text-xs text-muted">{amountLabel}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={exportHref}
            download
            className="rounded-md border border-line px-2 py-1 text-xs hover:text-fg"
          >
            Export CSV
          </a>
          {excelHref && (
            <a
              href={excelHref}
              download
              className="rounded-md border border-line px-2 py-1 text-xs hover:text-fg"
            >
              Export Excel
            </a>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="mt-4 max-h-96 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-surface text-xs uppercase text-muted">
              <tr>
                {headers.map((header, column) => (
                  <th
                    key={header}
                    scope="col"
                    className={`px-2 py-2 font-medium first:pl-0 last:pr-0 ${rows.every((row) => isNumericCell(row[column])) ? 'text-right' : ''}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-line text-sm">
                  {headers.map((header, column) => (
                    <td
                      key={`${header}-${column}`}
                      className={`px-2 py-2 first:pl-0 last:pr-0 ${isNumericCell(row[column]) ? 'text-right tabular-nums' : ''}`}
                    >
                      {row[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown < total && (
        <p className="mt-3 text-xs text-muted">
          Showing the first {shown} of {total}. Export the CSV for the full list.
        </p>
      )}
    </section>
  );
}
