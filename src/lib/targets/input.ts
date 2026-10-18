import { z } from 'zod';
import { addMonths, startOfMonth } from '@/lib/filters/dates';

export const MAX_TARGET = 1_000_000_000_000;
const PAST_MONTHS = 36;
const FUTURE_MONTHS = 24;

export interface TargetFormState {
  ok: boolean;
  message: string;
}

/** 'YYYY-MM' or 'YYYY-MM-01' -> 'YYYY-MM-01'; anything else -> null. */
export function parseMonthKey(v: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/** "30,000,000" or "30000000.50" -> number. Positive, at most 2 decimals, below MAX_TARGET. */
export function parseAmount(v: string): number | null {
  const s = v.replace(/[,\s_]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= MAX_TARGET ? n : null;
}

const noteSchema = z.string().trim().max(200);

export type TargetInput = { ok: true; value: { month: string; amount: number; note: string | null } } | { ok: false; error: string };

export function parseTargetInput(raw: { month: string; amount: string; note?: string }, today: string): TargetInput {
  const month = parseMonthKey(raw.month);
  if (!month) return { ok: false, error: 'Choose a month.' };
  const thisMonth = startOfMonth(today);
  if (month < addMonths(thisMonth, -PAST_MONTHS) || month > addMonths(thisMonth, FUTURE_MONTHS)) {
    return { ok: false, error: 'That month is too far in the past or future.' };
  }
  const amount = parseAmount(raw.amount);
  if (amount === null) return { ok: false, error: 'Enter a positive amount, for example 30,000,000.' };
  const note = noteSchema.safeParse(raw.note ?? '');
  if (!note.success) return { ok: false, error: 'The note can be at most 200 characters.' };
  return { ok: true, value: { month, amount, note: note.data === '' ? null : note.data } };
}
