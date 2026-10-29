import type { ActionListsData, Contact, ListKey } from '@/lib/queries/action-lists';
import { toCsv, type Column } from './csv';

const TITLES: Record<ListKey, string> = {
  maturing: 'Maturing soon',
  overdue: 'Overdue: status needs update',
  cooling: 'Cooling investors',
  stuck: 'Stuck bookings',
  pending: 'Pending deposits',
};

const who = <T extends Contact>(): Column<T>[] => [
  { header: 'Name', value: (r) => r.name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Email', value: (r) => r.email },
];

export interface ListExport {
  title: string;
  rowCount: number;
  toCsv: () => string;
  /** Loads the Excel library on demand, so the CSV path stays light. */
  toXlsx: () => Promise<Buffer>;
}

function build<T extends Contact>(key: ListKey, rows: T[], extra: Column<T>[]): ListExport {
  const columns = [...who<T>(), ...extra];
  return {
    title: TITLES[key],
    rowCount: rows.length,
    toCsv: () => toCsv(columns, rows),
    toXlsx: async () => (await import('./xlsx')).toXlsx(TITLES[key], columns, rows),
  };
}

/** Call-sheet export for one list. Dates are Dhaka dates. */
export function listExport(key: ListKey, d: ActionListsData): ListExport {
  switch (key) {
    case 'maturing':
      return build(key, d.maturing.rows, [
        { header: 'Project', value: (r) => r.project },
        { header: 'Amount', value: (r) => r.amount, kind: 'money' },
        { header: 'Maturity date', value: (r) => r.maturity, kind: 'date' },
        { header: 'Days left', value: (r) => r.daysLeft, kind: 'int' },
        { header: 'Lifetime value', value: (r) => r.lifetimeValue, kind: 'money' },
        { header: 'Investments', value: (r) => r.investments, kind: 'int' },
      ]);
    case 'cooling':
      return build(key, d.cooling.rows, [
        { header: 'Last project', value: (r) => r.lastProject },
        { header: 'Matured on', value: (r) => r.lastMaturity, kind: 'date' },
        { header: 'Days since', value: (r) => r.daysSince, kind: 'int' },
        { header: 'Lifetime value', value: (r) => r.lifetimeValue, kind: 'money' },
        { header: 'Investments', value: (r) => r.investments, kind: 'int' },
      ]);
    case 'overdue':
      return build(key, d.overdue.rows, [
        { header: 'Project', value: (r) => r.project },
        { header: 'Amount', value: (r) => r.amount, kind: 'money' },
        { header: 'Maturity date', value: (r) => r.maturity, kind: 'date' },
        { header: 'Days overdue', value: (r) => r.daysOverdue, kind: 'int' },
        { header: 'Bucket', value: (r) => r.bucket },
        { header: 'Lifetime value', value: (r) => r.lifetimeValue, kind: 'money' },
        { header: 'Investments', value: (r) => r.investments, kind: 'int' },
      ]);
    case 'stuck':
      return build(key, d.stuck.rows, [
        { header: 'Project', value: (r) => r.project },
        { header: 'Status', value: (r) => r.status },
        { header: 'Amount', value: (r) => r.amount, kind: 'money' },
        { header: 'Booked on', value: (r) => r.created, kind: 'date' },
        { header: 'Days open', value: (r) => r.daysOpen, kind: 'int' },
      ]);
    case 'pending':
      return build(key, d.pending.rows, [
        { header: 'Amount', value: (r) => r.amount, kind: 'money' },
        { header: 'Method', value: (r) => r.method },
        { header: 'Deposit date', value: (r) => r.date, kind: 'date' },
        { header: 'Days waiting', value: (r) => r.daysWaiting, kind: 'int' },
      ]);
  }
}

export const listToCsv = (key: ListKey, d: ActionListsData): string => listExport(key, d).toCsv();
