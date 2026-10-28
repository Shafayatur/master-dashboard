import { describe, expect, it } from 'vitest';
import {
  ALL_TIME,
  confirmedReinvestmentHref,
  depositSliceHref,
  explorerHref,
  investorSegmentHref,
} from './drilldown';

describe('explorerHref', () => {
  it('keeps date and global filters, overrides table, applies extras, and drops table controls', () => {
    const href = explorerHref({
      table: 'deposits',
      params: new URLSearchParams(
        't=orders&p=custom&from=2026-10-01&to=2026-10-28&prod=2&pm=reinvest&sh=yes&page=4&sort=amount&dir=asc&q=ignored&bv=month',
      ),
      extra: { prod: 7, st: 'approved' },
    });
    const query = new URL(href, 'https://example.test').searchParams;

    expect(href.startsWith('/explorer?')).toBe(true);
    expect(query.get('t')).toBe('deposits');
    expect(query.get('p')).toBe('custom');
    expect(query.get('from')).toBe('2026-10-01');
    expect(query.get('to')).toBe('2026-10-28');
    expect(query.get('prod')).toBe('7');
    expect(query.get('pm')).toBe('reinvest');
    expect(query.get('sh')).toBe('yes');
    expect(query.get('st')).toBe('approved');
    expect(query.has('page')).toBe(false);
    expect(query.has('sort')).toBe(false);
    expect(query.has('dir')).toBe(false);
    expect(query.has('q')).toBe(false);
    expect(query.has('bv')).toBe(false);
  });

  it('preserves canonical filters provided as a record', () => {
    const href = explorerHref({
      table: 'orders',
      params: { p: 'last30', cat: '3,4', ten: '6', page: '2', dir: 'desc' },
    });
    const query = new URL(href, 'https://example.test').searchParams;
    expect(query.get('p')).toBe('last30');
    expect(query.get('cat')).toBe('3,4');
    expect(query.get('ten')).toBe('6');
    expect(query.get('t')).toBe('orders');
    expect(query.has('page')).toBe(false);
    expect(query.has('dir')).toBe(false);
  });
});

describe('donut drill-down mappings', () => {
  it('maps deposit breakdown slices to their Explorer filter and skips empty and Others slices', () => {
    const params = 'p=custom&from=2026-10-01&to=2026-10-28';
    expect(depositSliceHref(params, 'prod', '42', 20)).toContain('prod=42');
    expect(depositSliceHref(params, 'cat', '7', 20)).toContain('cat=7');
    expect(depositSliceHref(params, 'ten', '6', 20)).toContain('ten=6');
    expect(depositSliceHref(params, 'rt', 'fixed', 20)).toContain('rt=fixed');
    expect(depositSliceHref(params, 'pm', 'reinvest', 20)).toContain('pm=reinvest');
    expect(depositSliceHref(params, 'st', 'approved', 20)).toContain('st=approved');
    expect(depositSliceHref(params, 'prod', 'others', 20)).toBeUndefined();
    expect(depositSliceHref(params, 'cat', '4', 0)).toBeUndefined();
    expect(depositSliceHref(params, 'prod', '1', Number.NaN)).toBeUndefined();
  });

  it('maps investor segment snapshots to the all-time Explorer range', () => {
    const href = investorSegmentHref(
      'p=last30&from=2026-09-29&to=2026-10-28&prod=2&page=3',
      'cooling',
      '2026-10-28',
      4,
    );
    expect(ALL_TIME).toEqual({ from: '2015-01-01' });
    const query = new URL(href ?? '', 'https://example.test').searchParams;
    expect(query.get('t')).toBe('investors');
    expect(query.get('p')).toBe('custom');
    expect(query.get('from')).toBe('2015-01-01');
    expect(query.get('to')).toBe('2026-10-28');
    expect(query.has('prod')).toBe(false);
    expect(query.get('seg')).toBe('cooling');
    expect(investorSegmentHref('', 'unknown', '2026-10-28', 1)).toBeUndefined();
    expect(investorSegmentHref('', 'cooling', '2026-10-28', 0)).toBeUndefined();
  });

  it('maps only confirmed reinvestment to approved reinvest deposits', () => {
    const href = confirmedReinvestmentHref(
      'p=custom&from=2026-10-01&to=2026-10-28&prod=2&pm=cash&ds=rejected',
      120,
    );
    const query = new URL(href ?? '', 'https://example.test').searchParams;
    expect(query.get('t')).toBe('deposits');
    expect(query.get('from')).toBe('2026-10-01');
    expect(query.get('to')).toBe('2026-10-28');
    expect(query.get('pm')).toBe('reinvest');
    expect(query.get('st')).toBe('approved');
    expect(query.has('prod')).toBe(false);
    expect(query.has('ds')).toBe(false);
    expect(confirmedReinvestmentHref('', 0)).toBeUndefined();
  });
});
