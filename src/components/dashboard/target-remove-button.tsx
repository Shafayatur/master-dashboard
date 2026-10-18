'use client';

import { useFormState } from 'react-dom';
import { removeTarget } from '@/app/(app)/targets/actions';
import type { TargetFormState } from '@/lib/targets/input';

const INITIAL_STATE: TargetFormState = { ok: false, message: '' };

export function TargetRemoveButton({ month }: { month: string }) {
  const [, formAction] = useFormState(removeTarget, INITIAL_STATE);

  return (
    <form action={formAction}>
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        onClick={(event) => {
          if (!window.confirm('Remove this target?')) event.preventDefault();
        }}
        className="text-xs text-muted hover:text-rose-600"
      >
        Remove
      </button>
    </form>
  );
}
