import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        fg: token('fg'),
        muted: token('muted'),
        line: token('line'),
        ink: { DEFAULT: token('ink'), line: token('ink-line'), fg: token('ink-fg') },
      },
      keyframes: {
        draw: { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        draw: 'draw 2.4s cubic-bezier(.22,.7,.2,1) 0.2s both',
        rise: 'rise .35s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
