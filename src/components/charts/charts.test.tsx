import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Wallet } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AreaChart } from './area-chart';
import { chartColor, CHART_COLORS } from './chart-colors';
import { ChartCard } from './chart-card';
import { DonutChart, DonutLegend } from './donut-chart';
import { ExportBar } from './export-bar';
import { ChartGallery } from './gallery';
import { HBarList } from './hbar-list';
import { Heatmap } from './heatmap';
import { KpiCard } from './kpi-card';
import { Sparkline } from './sparkline';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const count = (s: string, needle: string) => s.split(needle).length - 1;
const clean = (s: string) => {
  expect(s).not.toMatch(/NaN|undefined|Infinity/);
};

describe('palette', () => {
  it('has six CSS variable colours that cycle', () => {
    expect(CHART_COLORS).toHaveLength(6);
    expect(CHART_COLORS[0]).toBe('rgb(var(--chart-1))');
    expect(CHART_COLORS[5]).toBe('rgb(var(--chart-6))');
    expect(chartColor(6)).toBe(chartColor(0));
    expect(chartColor(-1)).toBe(chartColor(5));
  });

  it('defines every chart variable for light and dark', () => {
    const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
    const light = /:root\s*{[^}]*}/.exec(css)?.[0] ?? '';
    const dark = /\.dark\s*{[^}]*}/.exec(css)?.[0] ?? '';
    for (let n = 1; n <= 6; n += 1) {
      expect(light).toMatch(new RegExp(`--chart-${n}:\\s*\\d+ \\d+ \\d+;`));
      expect(dark).toMatch(new RegExp(`--chart-${n}:\\s*\\d+ \\d+ \\d+;`));
    }
  });
});

describe('ChartCard', () => {
  it('renders title, subtitle and action', () => {
    const out = html(<ChartCard title="Sales" subtitle="Last 30 days" action={<button>Go</button>}>body</ChartCard>);
    expect(out).toContain('Sales');
    expect(out).toContain('Last 30 days');
    expect(out).toContain('<button>Go</button>');
    expect(out).toContain('body');
  });

  it('omits the subtitle and action when not given', () => {
    const out = html(<ChartCard title="Sales">body</ChartCard>);
    expect(out).not.toContain('mt-0.5');
    expect(out).not.toContain('shrink-0');
  });
});

describe('Sparkline', () => {
  it('draws the exact path and a dot on the last point', () => {
    const out = html(<Sparkline values={[1, 2, 3]} tone="up" />);
    expect(out).toContain('d="M3.0,29.0 L48.0,16.0 L93.0,3.0"');
    expect(out).toContain('cx="93.0"');
    expect(out).toContain('cy="3.0"');
    expect(out).toContain('stroke="rgb(var(--chart-1))"');
    expect(out).toContain('role="img"');
    expect(out).toContain('rising');
    expect(count(out, '<path')).toBe(1);
  });

  it('uses rose for down and slate for flat', () => {
    expect(html(<Sparkline values={[3, 1]} tone="down" />)).toContain('rgb(var(--chart-5))');
    expect(html(<Sparkline values={[3, 1]} />)).toContain('rgb(var(--chart-6))');
  });

  it('draws a centred line for constant values', () => {
    expect(html(<Sparkline values={[5, 5, 5]} />)).toContain('d="M3.0,16.0 L48.0,16.0 L93.0,16.0"');
  });

  it('handles fewer than two points and bad numbers', () => {
    for (const values of [[], [4]]) {
      const out = html(<Sparkline values={values} />);
      expect(out).toContain('not enough data');
      expect(out).not.toContain('<path');
      clean(out);
    }
    clean(html(<Sparkline values={[1, Number.NaN, Number.POSITIVE_INFINITY, 3]} />));
  });
});

describe('KpiCard', () => {
  const card = (props: { delta?: number | null; deltaInverse?: boolean }) =>
    html(
      <KpiCard icon={Wallet} tone="emerald" label="Investment value" hint="vs last month" {...props}>
        21.11M
      </KpiCard>,
    );

  it('shows label, value, hint and the sparkline slot', () => {
    const out = html(
      <KpiCard icon={Wallet} tone="blue" label="Tickets" hint="1,284 deposits" spark={<Sparkline values={[1, 2]} />}>
        1,160
      </KpiCard>,
    );
    expect(out).toContain('Tickets');
    expect(out).toContain('1,160');
    expect(out).toContain('1,284 deposits');
    expect(out).toContain('Trend sparkline');
    expect(out).toContain('bg-blue-500/15');
    clean(out);
  });

  it('marks an increase as up and green', () => {
    const out = card({ delta: 12.34 });
    expect(out).toContain('data-trend="up"');
    expect(out).toContain('12.3%');
    expect(out).toContain('text-emerald-700');
    expect(out).toContain('Up ');
  });

  it('marks a decrease as down and rose', () => {
    const out = card({ delta: -5 });
    expect(out).toContain('data-trend="down"');
    expect(out).toContain('5.0%');
    expect(out).toContain('text-rose-700');
  });

  it('flips the colours but not the arrow when inverse', () => {
    const down = card({ delta: -5, deltaInverse: true });
    expect(down).toContain('data-trend="down"');
    expect(down).toContain('text-emerald-700');
    const up = card({ delta: 5, deltaInverse: true });
    expect(up).toContain('data-trend="up"');
    expect(up).toContain('text-rose-700');
  });

  it('shows flat for tiny changes, "new" for null and nothing when undefined', () => {
    expect(card({ delta: 0.01 })).toContain('data-trend="flat"');
    const fresh = card({ delta: null });
    expect(fresh).toContain('data-trend="new"');
    expect(fresh).toContain('new');
    expect(card({ delta: Number.NaN })).toContain('data-trend="new"');
    expect(card({})).not.toContain('data-trend');
    clean(card({ delta: Number.NaN }));
  });

  it('staggers the entrance animation by position', () => {
    const out = html(
      <KpiCard icon={Wallet} tone="rose" label="X" i={3}>
        1
      </KpiCard>,
    );
    expect(out).toContain('animation-delay:120ms');
  });
});

describe('DonutChart and DonutLegend', () => {
  const slices = [
    { key: 'a', label: 'Alpha', value: 50 },
    { key: 'b', label: 'Beta', value: 30 },
    { key: 'c', label: 'Gamma', value: 20, color: '#123456' },
  ];

  it('draws one titled segment per slice with auto colours', () => {
    const out = html(<DonutChart slices={slices} centerValue="100" centerLabel="Total" />);
    expect(count(out, 'data-slice=')).toBe(3);
    expect(count(out, '<title>')).toBe(3);
    expect(out).toContain('<title>Alpha: 50.0%</title>');
    expect(out).toContain('stroke="rgb(var(--chart-1))"');
    expect(out).toContain('stroke="rgb(var(--chart-2))"');
    expect(out).toContain('stroke="#123456"');
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Donut chart, Total 100: Alpha 50.0%, Beta 30.0%, Gamma 20.0%"');
    expect(out).toContain('>100<');
    expect(out).toContain('>Total<');
    clean(out);
  });

  it('links clickable slices in the ring and matching legend', () => {
    const linked = [{ key: 'a', label: 'Alpha', value: 5, href: '/explorer?t=deposits&prod=1' }];
    const ring = html(<DonutChart slices={linked} centerValue="5" />);
    const legend = html(<DonutLegend slices={linked} />);
    expect(ring).toContain('<a href="/explorer?t=deposits&amp;prod=1"');
    expect(ring).toContain('data-slice="a"');
    expect(ring).toContain('<title>Alpha: 100.0%</title>');
    expect(ring).toContain('focus-visible:outline');
    expect(legend).toContain('<a href="/explorer?t=deposits&amp;prod=1"');
    expect(legend).toContain('data-legend="a"');
    expect(legend).toContain('hover:underline');
    clean(ring);
    clean(legend);
  });

  it('keeps slices without href unlinked and renders the optional hint', () => {
    const unlinked = [{ key: 'a', label: 'Alpha', value: 5 }];
    const ring = html(<DonutChart slices={unlinked} centerValue="5" />);
    const legend = html(<DonutLegend slices={unlinked} />);
    expect(ring).not.toContain('<a ');
    expect(legend).not.toContain('<a ');
    const withHint = html(
      <DonutChart slices={[{ ...unlinked[0]!, href: '/explorer?t=deposits' }]} centerValue="5" hint="Click a slice to see the records" />,
    );
    expect(withHint).toContain('Click a slice to see the records');
    clean(ring);
    clean(legend);
    clean(withHint);
  });

  it('leaves gaps between segments and none for a single slice', () => {
    const out = html(<DonutChart slices={slices} centerValue="100" />);
    expect(out).toContain('stroke-dasharray="48.800 51.200"');
    expect(out).toContain('stroke-dashoffset="-0.600"');
    const single = html(<DonutChart slices={[{ key: 'a', label: 'A', value: 5 }]} centerValue="5" />);
    expect(single).toContain('stroke-dasharray="100.000 0.000"');
  });

  it('skips zero, negative and non-finite slices in the ring but keeps them in the legend', () => {
    const odd = [
      { key: 'a', label: 'A', value: 10 },
      { key: 'b', label: 'B', value: 0 },
      { key: 'c', label: 'C', value: -4 },
      { key: 'd', label: 'D', value: Number.NaN },
    ];
    const ring = html(<DonutChart slices={odd} centerValue="10" />);
    expect(count(ring, 'data-slice=')).toBe(1);
    clean(ring);
    const legend = html(<DonutLegend slices={odd} />);
    expect(count(legend, 'data-legend=')).toBe(4);
    expect(legend).toContain('100.0%');
    expect(legend).toContain('0.0%');
    clean(legend);
  });

  it('shows an empty state instead of a ring', () => {
    for (const empty of [[], [{ key: 'a', label: 'A', value: 0 }]]) {
      const out = html(<DonutChart slices={empty} centerValue="0" />);
      expect(out).toContain('No data in this period.');
      expect(out).not.toContain('<svg');
    }
    expect(html(<DonutLegend slices={[]} />)).toBe('');
  });

  it('legend shows share by default and the value text when asked', () => {
    const pct = html(<DonutLegend slices={slices} />);
    expect(pct).toContain('Alpha');
    expect(pct).toContain('50.0%');
    expect(pct).toContain('background-color:rgb(var(--chart-1))');
    const withValue = html(<DonutLegend slices={slices} format="value" valueText={(key) => `BDT ${key}`} />);
    expect(withValue).toContain('BDT a');
    expect(withValue).toContain('30.0%');
    const fallback = html(<DonutLegend slices={[{ key: 'a', label: 'A', value: 1234.4 }]} format="value" />);
    expect(fallback).toContain('1,234');
  });
});

describe('AreaChart', () => {
  const labels = ['2026-09-30', '2026-10-01', '2026-10-02'];
  const base = { labels, bucket: 'day' as const, unit: 'm' as const };

  it('draws a path per series, a legend and an accessible summary', () => {
    const out = html(
      <AreaChart
        {...base}
        series={[
          { key: 'sales', label: 'Sales', values: [1_000_000, 2_000_000, 3_000_000] },
          { key: 'payout', label: 'Payouts', values: [500_000, 500_000, 500_000], color: '#abcdef' },
        ]}
      />,
    );
    expect(count(out, 'data-series=')).toBe(2);
    expect(count(out, 'data-legend=')).toBe(2);
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Area chart, 3 days. Sales total 6.00M; Payouts total 1.50M"');
    expect(out).toContain('stroke="rgb(var(--chart-1))"');
    expect(out).toContain('stroke="#abcdef"');
    expect(out).toContain('url(#area-');
    expect(out).toContain('>30 Sep<');
    expect(out).toContain('>2 Oct<');
    expect(out).toContain('>2.50M<');
    expect(out).toContain('>5.00M<');
    clean(out);
  });

  it('dashes a comparison series and keeps the draw-in only on solid lines', () => {
    const out = html(
      <AreaChart
        {...base}
        series={[
          { key: 'a', label: 'A', values: [1, 2, 3] },
          { key: 'b', label: 'B', values: [1, 1, 1], dashed: true },
        ]}
      />,
    );
    expect(count(out, 'stroke-dasharray="4 4"')).toBe(1);
    expect(count(out, 'animate-draw')).toBe(1);
  });

  it('renders at most three series', () => {
    const series = ['a', 'b', 'c', 'd'].map((key) => ({ key, label: key.toUpperCase(), values: [1, 2, 3] }));
    expect(count(html(<AreaChart {...base} series={series} />), 'data-series=')).toBe(3);
  });

  it('formats month labels and uses the lakh unit on the axis', () => {
    const out = html(<AreaChart labels={['2026-08-01', '2026-09-01']} bucket="month" unit="lakh" series={[{ key: 'a', label: 'A', values: [5_000_000, 20_000_000] }]} />);
    expect(out).toContain('>Aug 26<');
    expect(out).toContain('>Sep 26<');
    expect(out).toContain('2.00 Cr');
    expect(out).toContain('Area chart, 2 months');
  });

  it('survives one point, short value arrays and bad numbers', () => {
    const one = html(<AreaChart labels={['2026-10-01']} bucket="day" unit="m" series={[{ key: 'a', label: 'A', values: [7] }]} />);
    expect(one).toContain('<circle');
    clean(one);
    const odd = html(<AreaChart {...base} series={[{ key: 'a', label: 'A', values: [1, Number.NaN] }]} />);
    clean(odd);
    clean(html(<AreaChart {...base} series={[{ key: 'a', label: 'A', values: [0, 0, 0] }]} />));
    expect(html(<AreaChart labels={['x', 'y']} bucket="day" unit="m" series={[{ key: 'a', label: 'A', values: [1, 2] }]} />)).toContain('>x<');
  });

  it('shows an empty state without labels or series', () => {
    expect(html(<AreaChart {...base} labels={[]} series={[]} />)).toContain('No data in this period.');
    expect(html(<AreaChart {...base} series={[]} />)).toContain('No data in this period.');
  });
});

describe('HBarList', () => {
  it('makes the longest bar 100% wide and shows shares', () => {
    const out = html(
      <HBarList
        kind="money"
        items={[
          { key: 'a', label: 'Alpha', value: 2_000_000, hint: '12 investors' },
          { key: 'b', label: 'Beta', value: 1_000_000 },
          { key: 'c', label: 'Gamma', value: 500_000 },
        ]}
      />,
    );
    expect(count(out, 'data-bar=')).toBe(3);
    expect(out).toContain('width:100%');
    expect(out).toContain('width:50%');
    expect(out).toContain('width:25%');
    expect(out).toContain('2.00M');
    expect(out).toContain('500.0K');
    expect(out).toContain('57.1%');
    expect(out).toContain('28.6%');
    expect(out).toContain('14.3%');
    expect(out).toContain('12 investors');
    expect(out).toContain('title="Alpha: 2.00M (57.1%)"');
    expect(out).toContain('aria-label="Ranked bars, 3 items, total 3.50M"');
    clean(out);
  });

  it('formats counts, honours the colour prop and keeps tiny bars visible', () => {
    const out = html(
      <HBarList
        kind="int"
        color="#ff0000"
        items={[
          { key: 'a', label: 'A', value: 12_345 },
          { key: 'b', label: 'B', value: 1 },
        ]}
      />,
    );
    expect(out).toContain('12,345');
    expect(out).toContain('background-color:#ff0000');
    expect(out).toContain('width:1.5%');
  });

  it('copes with all-zero and non-finite values and has an empty state', () => {
    const zero = html(<HBarList kind="int" items={[{ key: 'a', label: 'A', value: 0 }, { key: 'b', label: 'B', value: Number.NaN }]} />);
    expect(zero).toContain('width:0%');
    expect(zero).toContain('0.0%');
    clean(zero);
    expect(html(<HBarList kind="int" items={[]} />)).toContain('No data in this period.');
  });
});

describe('Heatmap', () => {
  it('renders one titled cell per row and column', () => {
    const out = html(<Heatmap rows={['Mon', 'Tue']} cols={['00', '01', '02']} matrix={[[1, 2, 3], [0, 5, 10]]} />);
    expect(count(out, 'data-cell=')).toBe(6);
    expect(count(out, '<title>')).toBe(6);
    expect(out).toContain('<title>Mon, 00: 1</title>');
    expect(out).toContain('<title>Tue, 02: 10</title>');
    expect(out).toContain('aria-label="Heatmap, 2 rows by 3 columns, peak 10"');
    expect(out).toContain('overflow-x-auto');
    expect(out).toContain('fill-opacity="0.900"');
    clean(out);
  });

  it('formats money cells with the unit', () => {
    const out = html(<Heatmap rows={['A']} cols={['x']} matrix={[[21_110_000]]} kind="money" unit="lakh" />);
    expect(out).toContain('<title>A, x: 2.11 Cr</title>');
  });

  it('renders optional day labels in non-empty cells only', () => {
    const out = html(
      <Heatmap rows={['Week 1']} cols={['Mon', 'Tue']} matrix={[[2, 0]]} cellLabels={[[ '1', '' ]]} />,
    );
    expect(count(out, 'text-[10px]')).toBe(1);
    expect(out).toContain('>1</text>');
  });

  it('hides numbers inside cells when there are many columns', () => {
    const cols = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const out = html(<Heatmap rows={['Mon']} cols={cols} matrix={[cols.map((_, i) => i + 1)]} />);
    expect(count(out, 'data-cell=')).toBe(24);
    expect(count(out, 'pointer-events="none"')).toBe(0);
  });

  it('treats missing, negative and non-finite cells as zero', () => {
    const out = html(<Heatmap rows={['A', 'B']} cols={['x', 'y']} matrix={[[4, Number.NaN], []]} />);
    expect(count(out, 'data-cell=')).toBe(4);
    expect(count(out, '<title>')).toBe(4);
    expect(out).toContain('<title>B, y: 0</title>');
    clean(out);
    clean(html(<Heatmap rows={['A']} cols={['x']} matrix={[[-3]]} />));
  });

  it('shows an empty state when there is nothing to plot', () => {
    expect(html(<Heatmap rows={[]} cols={[]} matrix={[]} />)).toContain('No data in this period.');
    expect(html(<Heatmap rows={['A']} cols={['x']} matrix={[[0]]} />)).toContain('No data in this period.');
    expect(html(<Heatmap rows={['A']} cols={['x']} matrix={[]} />)).toContain('No data in this period.');
  });
});

describe('ExportBar', () => {
  it('shows CSV, Excel and PDF when both links are given', () => {
    const out = html(<ExportBar csvHref="/a.csv" xlsxHref="/a.xlsx" />);
    expect(out).toContain('href="/a.csv"');
    expect(out).toContain('href="/a.xlsx"');
    expect(count(out, 'download=""')).toBe(2);
    expect(out).toContain('>CSV<');
    expect(out).toContain('>Excel<');
    expect(out).toContain('>PDF<');
    expect(out).toContain('emerald');
    expect(out).toContain('blue');
    expect(out).toContain('rose');
  });

  it('hides a button whose link is missing but always keeps PDF', () => {
    const onlyCsv = html(<ExportBar csvHref="/a.csv" />);
    expect(onlyCsv).toContain('>CSV<');
    expect(onlyCsv).not.toContain('>Excel<');
    expect(onlyCsv).toContain('>PDF<');
    const none = html(<ExportBar />);
    expect(none).not.toContain('<a ');
    expect(none).toContain('>PDF<');
  });
});

describe('ChartGallery', () => {
  it.each(['m', 'lakh'] as const)('renders every component with clean markup (%s)', (unit) => {
    const out = html(<ChartGallery unit={unit} />);
    expect(out).toContain('Chart toolkit');
    expect(count(out, 'data-trend=')).toBe(6);
    expect(count(out, 'Trend sparkline')).toBe(6);
    expect(count(out, 'Donut chart,')).toBe(3);
    expect(count(out, 'Area chart,')).toBe(1);
    expect(count(out, 'Stacked column chart')).toBe(1);
    expect(count(out, 'Heatmap,')).toBe(2);
    expect(count(out, 'Ranked bars,')).toBe(2);
    expect(count(out, 'data-cell=')).toBe(7 * 24 + 5 * 6);
    expect(count(out, 'No data in this period.')).toBe(4);
    clean(out);
  });
});
