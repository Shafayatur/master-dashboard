import type { InvestmentDepthInvestor } from '@/lib/queries/investment-depth';
import { toCsv, type Column } from './csv';

const COLUMNS: Column<InvestmentDepthInvestor>[] = [
  { header: 'User ID', value: (row) => row.userId, kind: 'int' },
  { header: 'Name', value: (row) => row.name, kind: 'text' },
  { header: 'Phone', value: (row) => row.phone, kind: 'text' },
  { header: 'Email', value: (row) => row.email, kind: 'text' },
  { header: 'Investments', value: (row) => row.investments, kind: 'int' },
  { header: 'Lifetime value', value: (row) => row.lifetimeValue, kind: 'money' },
  { header: 'First investment date', value: (row) => row.firstInvestmentDate, kind: 'date' },
  { header: 'Latest investment date', value: (row) => row.latestInvestmentDate, kind: 'date' },
];

export interface InvestmentDepthExport {
  rowCount: number;
  toCsv: () => string;
  toXlsx: () => Promise<Buffer>;
}

export function investmentDepthExport(rows: InvestmentDepthInvestor[]): InvestmentDepthExport {
  return {
    rowCount: rows.length,
    toCsv: () => toCsv(COLUMNS, rows),
    toXlsx: async () => (await import('./xlsx')).toXlsx('Investment depth', COLUMNS, rows),
  };
}
