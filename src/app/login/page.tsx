import type { Metadata } from 'next';
import { safeNextPath } from '@/lib/auth/safe-next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNextPath(searchParams.next);
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink lg:block" aria-hidden>
        <svg viewBox="0 0 600 800" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
          <g stroke="rgb(var(--ink-line))" strokeWidth="1">
            {[160, 260, 360, 460, 560, 660].map((y) => (
              <line key={y} x1="0" x2="600" y1={y} y2={y} />
            ))}
          </g>
          <path
            d="M0 690 C90 670 130 640 190 600 S300 560 350 470 S470 330 600 190"
            fill="none"
            stroke="#34d399"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            className="animate-draw"
          />
        </svg>
        <div className="relative p-12">
          <p className="text-lg font-semibold tracking-tight text-white">Master Dashboard</p>
          <p className="mt-2 max-w-xs text-sm text-ink-fg">Internal analytics for the investor relations team.</p>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Enter the team passkey to continue.</p>
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
