import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Master Dashboard', template: '%s | Master Dashboard' },
  description: 'Investor relations analytics',
  robots: { index: false, follow: false },
};

// Runs before first paint so there is no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('md-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={GeistSans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
