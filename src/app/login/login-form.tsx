'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [passkey, setPasskey] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !passkey) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey }),
      });
      if (res.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; retryAfterSeconds?: number };
      if (res.status === 429 && data.retryAfterSeconds) {
        setError(`Too many attempts. Try again in ${Math.ceil(data.retryAfterSeconds / 60)} min.`);
      } else {
        setError(data.error ?? 'Could not sign in. Try again.');
      }
      setPasskey('');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="passkey" className="mb-1.5 block text-sm font-medium">
          Passkey
        </label>
        <div className="relative">
          <input
            id="passkey"
            name="passkey"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus
            required
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
            className="h-11 w-full rounded-lg border border-line bg-surface pl-3 pr-11 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600/60 focus:border-emerald-600"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide passkey' : 'Show passkey'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-fg"
          >
            {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
      <p id="login-error" role="alert" className="min-h-5 text-sm text-rose-600 dark:text-rose-400">
        {error}
      </p>
      <button
        type="submit"
        disabled={busy || !passkey}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-emerald-600"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Sign in
      </button>
    </form>
  );
}
