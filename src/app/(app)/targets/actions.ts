'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/require-session';
import { queryConfig } from '@/lib/db/config';
import { parseMonthKey, parseTargetInput, type TargetFormState } from '@/lib/targets/input';
import { deleteTarget, upsertTarget } from '@/lib/queries/targets';
import type { Row } from '@/lib/queries/sql-filters';
import { todayDhaka } from '@/lib/time';

const cq = (sql: string, params?: unknown[]) => queryConfig<Row>(sql, params);
const field = (f: FormData, k: string) => String(f.get(k) ?? '');
const FAILED: TargetFormState = { ok: false, message: 'Could not reach the database. Nothing was changed.' };

/** Server action. Next.js rejects cross-origin calls; the session is re-checked here as well. */
export async function saveTarget(_prev: TargetFormState, formData: FormData): Promise<TargetFormState> {
  await requireSession();
  const parsed = parseTargetInput({ month: field(formData, 'month'), amount: field(formData, 'amount'), note: field(formData, 'note') }, todayDhaka());
  if (!parsed.ok) return { ok: false, message: parsed.error };
  try {
    await upsertTarget(cq, parsed.value.month, parsed.value.amount, parsed.value.note);
  } catch (e) {
    console.error('[targets] save failed:', (e as Error).message);
    return FAILED;
  }
  revalidatePath('/targets');
  revalidatePath('/');
  return { ok: true, message: `Saved the target for ${parsed.value.month.slice(0, 7)}.` };
}

export async function removeTarget(_prev: TargetFormState, formData: FormData): Promise<TargetFormState> {
  await requireSession();
  const month = parseMonthKey(field(formData, 'month'));
  if (!month) return { ok: false, message: 'Unknown month.' };
  try {
    await deleteTarget(cq, month);
  } catch (e) {
    console.error('[targets] delete failed:', (e as Error).message);
    return FAILED;
  }
  revalidatePath('/targets');
  revalidatePath('/');
  return { ok: true, message: `Removed the target for ${month.slice(0, 7)}.` };
}
