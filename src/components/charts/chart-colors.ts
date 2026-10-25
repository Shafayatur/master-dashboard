/**
 * Categorical chart palette. Values are CSS variables defined in globals.css (light, dark and print),
 * so every chart follows the theme without JavaScript. Order: emerald, blue, amber, violet, rose, slate.
 */
export const CHART_COLORS: readonly string[] = [1, 2, 3, 4, 5, 6].map((n) => `rgb(var(--chart-${n}))`);

/** Colour for the i-th series, cycling when there are more series than colours. */
export function chartColor(index: number): string {
  const size = CHART_COLORS.length;
  return CHART_COLORS[((index % size) + size) % size] ?? 'rgb(var(--chart-1))';
}
