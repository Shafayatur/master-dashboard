import { chartColor } from './chart-colors';

type Tone = 'up' | 'down' | 'flat';

interface Props {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
}

const TONE_COLOR: Record<Tone, string> = { up: chartColor(0), down: chartColor(4), flat: chartColor(5) };
const TONE_WORD: Record<Tone, string> = { up: 'rising', down: 'falling', flat: 'flat' };
const PAD = 3;

/** Tiny trend line for KPI cards: draw-in stroke and a dot on the last point. */
export function Sparkline({ values, tone = 'flat', width = 96, height = 32 }: Props) {
  const data = values.map((v) => (Number.isFinite(v) ? v : 0));
  const color = TONE_COLOR[tone];

  if (data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend sparkline, not enough data">
        <line x1={PAD} x2={width - PAD} y1={height / 2} y2={height / 2} stroke="rgb(var(--line))" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
      </svg>
    );
  }

  const min = Math.min(...data);
  const span = Math.max(...data) - min;
  const x = (i: number) => PAD + (i / (data.length - 1)) * (width - 2 * PAD);
  const y = (v: number) => (span === 0 ? height / 2 : PAD + (1 - (v - min) / span) * (height - 2 * PAD));
  const d = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = data[data.length - 1] ?? 0;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      aria-label={`Trend sparkline, ${data.length} points, ${TONE_WORD[tone]}`}
    >
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} className="animate-draw" />
      <circle cx={x(data.length - 1).toFixed(1)} cy={y(last).toFixed(1)} r="2.5" fill={color} className="animate-rise" style={{ animationDelay: '1.6s' }} />
    </svg>
  );
}
