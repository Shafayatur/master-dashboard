import type { CashFlowMonth } from '@/lib/queries/money-flow';
import { toCsv, type Column } from './csv';

type ExportRow = Omit<CashFlowMonth, 'month'> & { month: string };

const COLUMNS: Column<ExportRow>[] = [
  { header: 'Month', value: (row) => row.month, kind: 'text' },
  { header: 'Money in', value: (row) => row.moneyIn, kind: 'money' },
  { header: 'Of which reinvest', value: (row) => row.reinvest, kind: 'money' },
  { header: 'Money out', value: (row) => row.moneyOut, kind: 'money' },
  { header: 'Net', value: (row) => row.net, kind: 'money' },
];

export interface CashFlowExport {
  rowCount: number;
  toCsv: () => string;
  toXlsx: () => Promise<Buffer>;
}

export function cashFlowExport(months: CashFlowMonth[]): CashFlowExport {
  const totals = months.reduce(
    (total, month) => ({
      moneyIn: total.moneyIn + month.moneyIn,
      reinvest: total.reinvest + month.reinvest,
      moneyOut: total.moneyOut + month.moneyOut,
      net: total.net + month.net,
    }),
    { moneyIn: 0, reinvest: 0, moneyOut: 0, net: 0 },
  );
  const rows: ExportRow[] = [...months, { month: 'Total', ...totals }];
  return {
    rowCount: months.length,
    toCsv: () => toCsv(COLUMNS, rows),
    toXlsx: async () => (await import('./xlsx')).toXlsx('Cash flow by month', COLUMNS, rows),
  };
}
