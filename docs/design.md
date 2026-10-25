# Chart toolkit

Hand-written SVG and Tailwind components for the visual layer of the dashboard. No chart library, no new dependencies.
Everything lives in `src/components/charts/`. Review all of it with static sample data at `/design` (sign-in required, not in the sidebar).

## Rules that apply to every chart
- Colours come from `--chart-1..6` in `globals.css` (emerald, blue, amber, violet, rose, slate; separate light and dark values).
  Use `CHART_COLORS` / `chartColor(i)` from `chart-colors.ts`, never hard-coded hex, so dark mode and print keep working.
- Each chart has `role="img"` with an `aria-label` summary, `<title>` text on hoverable SVG shapes, and an empty state ("No data in this period.").
- Bad numbers (NaN, Infinity, negatives where they make no sense) are treated as zero; no chart prints `NaN` or `undefined`.
- Animations use the existing `animate-rise` / `animate-draw` classes; the global `prefers-reduced-motion` rule shortens them.
- Client components accept serialisable props only. Pass a `MoneyUnit` string and let the component format. Server components
  (`KpiCard`, `DonutChart`, `DonutLegend`, `HBarList`, `Heatmap`, `ExportBar`, `Sparkline`, `ChartCard`) may take functions or
  elements (`icon`, `valueText`) but must not be rendered inside a client component.

## Components

| Component | Type | Props | Use it for |
|---|---|---|---|
| `ChartCard` | server | `title`, `subtitle?`, `action?`, `className?`, `children` | Shell for any chart: padding, title row, action slot (put `ExportBar` there). |
| `KpiCard` | server | `icon` (Lucide), `tone` (`emerald\|blue\|amber\|violet\|rose`), `label`, `delta?`, `deltaInverse?`, `hint?`, `spark?`, `i?`, `children` | Headline metric. `delta` is a percent: a number shows up/down/flat, `null` shows "new", `undefined` shows nothing. Set `deltaInverse` when a decrease is good (pending items, cancellations): colours flip, the arrow does not. `children` is the value, inline content such as text or `CountUp`. `i` staggers the entrance. |
| `Sparkline` | server | `values`, `tone?` (`up\|down\|flat`), `width?` (96), `height?` (32) | Tiny trend in a KPI card (`spark` slot). Fewer than two points draws a dashed placeholder. Pick `tone` from the delta, not from the data shape. |
| `DonutChart` | server | `slices[{key,label,value,color?}]`, `centerValue`, `centerLabel?`, `size?` (160) | Share of a whole with 2-6 parts. Zero and negative slices are not drawn. Keep the slice order identical to `DonutLegend` so colours match. |
| `DonutLegend` | server | `slices`, `format?` (`pct\|value`), `valueText?(key)` | Colour dot, label and share. With `format="value"` the right column shows `valueText(key)` (format money here, on the server) plus the share. |
| `AreaChart` | client | `labels`, `series[{key,label,color?,values,dashed?}]`, `bucket` (`day\|month`), `unit`, `height?` (260) | Time series, up to 3 lines. Gradient under the first, dashed for a comparison period, hover read-out of every series. Labels formatted from `YYYY-MM-DD` / `YYYY-MM`. All `values` arrays must align with `labels`. `trend-chart.tsx` is the older single-purpose version and is unchanged. |
| `BarChart` (existing, `components/dashboard/bar-chart.tsx`) | client | `items[{label, values[{value,color,name}]}]`, `unit`, `height?` | Stacked columns, for example sales split into reinvest and other. Pass `CHART_COLORS` entries as `color`. |
| `HBarList` | server | `items[{key,label,value,hint?}]`, `kind` (`money\|int`), `unit?`, `color?` | Ranked list: top projects, tenures, segments. Longest bar is 100%; each row also shows its share of the total. Sort items before passing them. |
| `Heatmap` | server | `rows`, `cols`, `matrix[row][col]`, `unit?`, `kind?` (`int\|money`) | Two-dimensional intensity: weekday by hour, cohort retention. Scrolls sideways on small screens. Numbers are written inside cells only up to 14 columns. All-zero or empty input shows the empty state. |
| `ExportBar` | server | `csvHref?`, `xlsxHref?` | Green CSV, blue Excel and red PDF buttons. A missing link hides its button; PDF always shows and uses `PrintButton` (browser print). Hidden when printing. |

## Choosing a chart
- One number with context: `KpiCard` (add a `Sparkline` if a trend exists).
- Change over time: `AreaChart`; composition over time: `BarChart` (stacked).
- Composition now: `DonutChart` for 6 parts or fewer, otherwise `HBarList`.
- Ranking: `HBarList`.
- Pattern across two categories: `Heatmap`.

## Typical wiring (server page)
```tsx
<ChartCard title="Sales by project" action={<ExportBar csvHref="/api/export/..." />}>
  <div className="flex flex-wrap items-center gap-4">
    <DonutChart slices={slices} centerValue={formatMoney(total, unit)} centerLabel="Total sales" />
    <DonutLegend slices={slices} format="value" valueText={(key) => formatMoney(byKey[key] ?? 0, unit)} />
  </div>
</ChartCard>
```
