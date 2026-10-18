'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveTarget } from '@/app/(app)/targets/actions';
import type { TargetFormState } from '@/lib/targets/input';

const INITIAL_STATE: TargetFormState = { ok: false, message: '' };
const inputClassName = 'w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus';
const labelClassName = 'text-xs font-medium uppercase tracking-wide text-muted';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-ink-fg disabled:opacity-60"
    >
      {pending ? 'Saving...' : 'Save target'}
    </button>
  );
}

export function TargetForm({ defaultMonth }: { defaultMonth: string }) {
  const [state, formAction] = useFormState(saveTarget, INITIAL_STATE);

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-medium">Set a monthly target</h3>
      <p className="mt-1 text-xs text-muted">Saving a month that already has a target replaces it.</p>
      <form action={formAction} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="target-month" className={labelClassName}>Month</label>
          <input
            id="target-month"
            className={inputClassName}
            type="month"
            name="month"
            required
            defaultValue={defaultMonth}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="target-amount" className={labelClassName}>Amount</label>
          <input
            id="target-amount"
            className={inputClassName}
            type="text"
            name="amount"
            inputMode="decimal"
            required
            placeholder="30,000,000"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="target-note" className={labelClassName}>Note</label>
          <input
            id="target-note"
            className={inputClassName}
            type="text"
            name="note"
            maxLength={200}
          />
        </div>
        <SubmitButton />
      </form>
      {state.message && (
        <p
          role="status"
          className={`mt-3 text-sm ${state.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
