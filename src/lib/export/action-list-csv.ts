import type { ActionListsData, Contact, ListKey } from '@/lib/queries/action-lists';
import { toCsv, type Column } from './csv';

const who = <T extends Contact>(): Column<T>[] => [
  { header: 'Name', value: (r) => r.name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Email', value: (r) => r.email },
];

/** Call-sheet CSV for one list. Dates are Dhaka dates. */
export function listToCsv(key: ListKey, d: ActionListsData): string {
  switch (key) {
    case 'maturing':
      return toCsv(
        [...who<(typeof d.maturing.rows)[number]>(), { header: 'Project', value: (r) => r.project }, { header: 'Amount', value: (r) => r.amount }, { header: 'Maturity date', value: (r) => r.maturity }, { header: 'Days left', value: (r) => r.daysLeft }, { header: 'Lifetime value', value: (r) => r.lifetimeValue }, { header: 'Investments', value: (r) => r.investments }],
        d.maturing.rows,
      );
    case 'cooling':
      return toCsv(
        [...who<(typeof d.cooling.rows)[number]>(), { header: 'Last project', value: (r) => r.lastProject }, { header: 'Matured on', value: (r) => r.lastMaturity }, { header: 'Days since', value: (r) => r.daysSince }, { header: 'Lifetime value', value: (r) => r.lifetimeValue }, { header: 'Investments', value: (r) => r.investments }],
        d.cooling.rows,
      );
    case 'stuck':
      return toCsv(
        [...who<(typeof d.stuck.rows)[number]>(), { header: 'Project', value: (r) => r.project }, { header: 'Status', value: (r) => r.status }, { header: 'Amount', value: (r) => r.amount }, { header: 'Booked on', value: (r) => r.created }, { header: 'Days open', value: (r) => r.daysOpen }],
        d.stuck.rows,
      );
    case 'pending':
      return toCsv(
        [...who<(typeof d.pending.rows)[number]>(), { header: 'Amount', value: (r) => r.amount }, { header: 'Method', value: (r) => r.method }, { header: 'Deposit date', value: (r) => r.date }, { header: 'Days waiting', value: (r) => r.daysWaiting }],
        d.pending.rows,
      );
  }
}
