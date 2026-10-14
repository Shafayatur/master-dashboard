'use client';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-lg rounded-xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">This page could not load its data</h2>
      <p className="mt-2 text-sm text-muted">
        The database may be unreachable or the connection settings may be wrong. Check the server log, then try again.
      </p>
      <button type="button" onClick={reset} className="mt-4 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-ink-fg">
        Try again
      </button>
    </div>
  );
}
