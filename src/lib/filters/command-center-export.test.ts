import { describe, expect, it } from 'vitest';
import { parseFilters } from './schema';
import { commandCenterExportHref } from './command-center-export';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };
const TODAY = '2026-10-14';

describe('commandCenterExportHref', () => {
  it('includes explorer-supported filters and maps deposit status to explorer status', () => {
    const filters = parseFilters(
      new URLSearchParams('p=custom&from=2026-08-01&to=2026-08-31&prod=12,34&cat=5,9&ten=6,12&rt=fixed,percentage-range&sh=yes&pm=cash,reinvest&ds=approved'),
      TODAY,
    );
    const href = commandCenterExportHref(filters, RANGE, 'csv');
    const params = new URLSearchParams(href.split('?')[1]);

    expect(params.get('t')).toBe('deposits');
    expect(params.get('p')).toBe('custom');
    expect(params.get('from')).toBe(RANGE.from);
    expect(params.get('to')).toBe(RANGE.to);
    expect(params.get('prod')).toBe('12,34');
    expect(params.get('cat')).toBe('5,9');
    expect(params.get('ten')).toBe('6,12');
    expect(params.get('rt')).toBe('percentage-range,fixed');
    expect(params.get('sh')).toBe('yes');
    expect(params.get('pm')).toBe('cash,reinvest');
    expect(params.get('st')).toBe('approved');
    expect(params.get('fmt')).toBe('csv');
    expect(href).toContain('prod=12%2C34');
    expect(href).toContain('rt=percentage-range%2Cfixed');
  });

  it('omits Explorer status when all deposit statuses are selected', () => {
    const filters = parseFilters(
      new URLSearchParams('ds=approved,pending,rejected'),
      TODAY,
    );
    const params = new URLSearchParams(commandCenterExportHref(filters, RANGE, 'xlsx').split('?')[1]);

    expect(params.has('st')).toBe(false);
    expect(params.get('fmt')).toBe('xlsx');
    expect(params.get('p')).toBe('custom');
  });
});
