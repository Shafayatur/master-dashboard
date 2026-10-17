import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { ScorecardRow } from '@/lib/queries/projects';

interface Props {
  rows: ScorecardRow[];
  unit: MoneyUnit;
}

const card = 'rounded-xl border border-line bg-surface p-4';
const numericCell = 'whitespace-nowrap px-3 py-3 text-right tabular-nums';
const headingCell = 'whitespace-nowrap px-3 py-2 text-right text-xs font-medium uppercase text-muted';

export function ProjectScorecard({ rows, unit }: Props) {
  return (
    <section className={card}>
      <div className="mb-4">
        <h3 className="text-sm font-medium">Project scorecard</h3>
        <p className="mt-1 text-xs text-muted">Top 15 by investment value</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data for these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase text-muted">Project</th>
                <th className={headingCell}>Tenure</th>
                <th className={headingCell}>Return type</th>
                <th className={headingCell}>Value</th>
                <th className={headingCell}>Share</th>
                <th className={headingCell}>Deposits</th>
                <th className={headingCell}>Investors</th>
                <th className={headingCell}>Returning</th>
                <th className={headingCell}>Avg ticket</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-line">
                  <td className="max-w-56 truncate px-3 py-3 font-medium">{row.label}</td>
                  <td className={numericCell}>{row.tenureMonths} mo</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">{row.returnType}</td>
                  <td className={numericCell}>{formatMoney(row.value, unit)}</td>
                  <td className={numericCell}>
                    <div>{row.share.toFixed(1)}%</div>
                    <div className="ml-auto mt-1 h-0.5 w-16 rounded-full bg-line">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, row.share)}%` }} />
                    </div>
                  </td>
                  <td className={numericCell}>{formatInt(row.deposits)}</td>
                  <td className={numericCell}>{formatInt(row.investors)}</td>
                  <td className={numericCell}>
                    {Math.round(row.returningShare)}% <span className="text-muted">({formatInt(row.returningInvestors)})</span>
                  </td>
                  <td className={numericCell}>{formatMoney(row.avgTicket, unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
