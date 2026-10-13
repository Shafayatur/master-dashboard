import { describe, expect, it } from 'vitest';
import { addMonths, resolveCompare, resolvePreset, isValidYmd } from './dates';
import { activeFilterCount, parseFilters, serializeFilters } from './schema';

const TODAY = '2026-10-13';

describe('dates', () => {
  it('validates real calendar dates', () => {
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2028-02-29')).toBe(true);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('26-1-1')).toBe(false);
  });
  it('shifts months with clamping and keeps month-ends', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2028-03-31', -1)).toBe('2028-02-29');
    expect(addMonths('2026-02-28', 1)).toBe('2026-03-31'); // month-end stays month-end
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
    expect(addMonths('2028-02-29', -12)).toBe('2027-02-28');
  });
  it('resolves presets', () => {
    expect(resolvePreset('mtd', TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(resolvePreset('lastMonth', TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(resolvePreset('last7', TODAY)).toEqual({ from: '2026-10-07', to: TODAY });
    expect(resolvePreset('last30', TODAY)).toEqual({ from: '2026-09-14', to: TODAY });
    expect(resolvePreset('qtd', TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(resolvePreset('ytd', TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
    expect(resolvePreset('lastMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('compares: previous period has equal length and sits right before', () => {
    expect(resolveCompare({ from: '2026-10-07', to: '2026-10-13' }, 'previous')).toEqual({ from: '2026-09-30', to: '2026-10-06' });
  });
  it('compares: same period last month (MTD vs same days) and full months', () => {
    expect(resolveCompare({ from: '2026-10-01', to: '2026-10-13' }, 'lastMonth')).toEqual({ from: '2026-09-01', to: '2026-09-13' });
    expect(resolveCompare({ from: '2026-10-01', to: '2026-10-31' }, 'lastMonth')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(resolveCompare({ from: '2026-09-01', to: '2026-09-30' }, 'lastMonth')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });
  it('compares: last year and none', () => {
    expect(resolveCompare({ from: '2026-10-01', to: '2026-10-13' }, 'lastYear')).toEqual({ from: '2025-10-01', to: '2025-10-13' });
    expect(resolveCompare({ from: '2026-10-01', to: '2026-10-13' }, 'none')).toBeNull();
  });
});

describe('parseFilters', () => {
  it('defaults: this month vs same period last month, approved deposits only', () => {
    const f = parseFilters(new URLSearchParams(), TODAY);
    expect(f.preset).toBe('mtd');
    expect(f.range).toEqual({ from: '2026-10-01', to: TODAY });
    expect(f.compareRange).toEqual({ from: '2026-09-01', to: '2026-09-13' });
    expect(f.depositStatus).toEqual(['approved']);
    expect(activeFilterCount(f)).toBe(0);
  });
  it('parses custom ranges, swapping reversed dates', () => {
    const f = parseFilters(new URLSearchParams('p=custom&from=2026-09-30&to=2026-09-01'), TODAY);
    expect(f.preset).toBe('custom');
    expect(f.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
  it('falls back to defaults on junk instead of throwing', () => {
    const f = parseFilters(new URLSearchParams('p=custom&from=nope&to=2026-01-01&ds=zzz&os=cancelled,bogus&prod=3,x,-1,3,2&sh=maybe&cmp=weird'), TODAY);
    expect(f.preset).toBe('mtd');
    expect(f.depositStatus).toEqual(['approved']);
    expect(f.orderStatus).toEqual(['cancelled']);
    expect(f.products).toEqual([2, 3]);
    expect(f.shariah).toBe('all');
    expect(f.compare).toBe('lastMonth');
  });
  it('accepts Next.js searchParams objects too', () => {
    const f = parseFilters({ ds: 'approved,pending', xr: '1', ten: ['6,12', '99'] }, TODAY);
    expect(f.depositStatus).toEqual(['approved', 'pending']);
    expect(f.excludeReinvest).toBe(true);
    expect(f.tenures).toEqual([6, 12]);
  });
  it('round-trips through the URL, omitting defaults', () => {
    expect(serializeFilters(parseFilters(new URLSearchParams(), TODAY)).toString()).toBe('');
    const url = 'p=custom&from=2026-08-01&to=2026-08-31&cmp=none&ds=approved%2Cpending&os=cancelled&xr=1&prod=4%2C9&ten=6&sh=yes&ik=new&seg=cooling';
    const f = parseFilters(new URLSearchParams(url), TODAY);
    const again = parseFilters(serializeFilters(f), TODAY);
    expect(again).toEqual(f);
    expect(activeFilterCount(f)).toBe(8);
  });
  it('keeps presets rolling when bookmarked', () => {
    const q = serializeFilters(parseFilters(new URLSearchParams('p=last7'), TODAY));
    expect(q.get('p')).toBe('last7');
    expect(q.has('from')).toBe(false);
    expect(parseFilters(q, '2026-11-02').range).toEqual({ from: '2026-10-27', to: '2026-11-02' });
  });
});

import { defaultFilters, patchFilters } from './schema';
describe('patchFilters', () => {
  it('re-derives ranges when the preset or comparison changes', () => {
    const f = defaultFilters(TODAY);
    const a = patchFilters(f, { date: { preset: 'lastMonth' } }, TODAY);
    expect(a.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(a.compareRange).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    const b = patchFilters(a, { compare: 'none' }, TODAY);
    expect(b.compareRange).toBeNull();
    const c = patchFilters(f, { date: { preset: 'custom', range: { from: '2026-09-10', to: '2026-09-01' } } }, TODAY);
    expect(c.range).toEqual({ from: '2026-09-01', to: '2026-09-10' });
    expect(c.preset).toBe('custom');
  });
  it('never allows an empty deposit status selection', () => {
    expect(patchFilters(defaultFilters(TODAY), { depositStatus: [] }, TODAY).depositStatus).toEqual(['approved']);
  });
});

import { formatRange } from './format';
describe('formatRange', () => {
  it('formats compactly', () => {
    expect(formatRange({ from: '2026-10-13', to: '2026-10-13' })).toBe('13 Oct 2026');
    expect(formatRange({ from: '2026-10-01', to: '2026-10-13' })).toBe('1 – 13 Oct 2026');
    expect(formatRange({ from: '2026-09-28', to: '2026-10-13' })).toBe('28 Sep – 13 Oct 2026');
    expect(formatRange({ from: '2025-12-28', to: '2026-01-04' })).toBe('28 Dec 2025 – 4 Jan 2026');
  });
});
