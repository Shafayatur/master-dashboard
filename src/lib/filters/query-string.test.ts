import { describe, expect, it } from 'vitest';
import { mergeFilterQuery } from './query-string';

describe('mergeFilterQuery', () => {
  it('replaces global filters and keeps page-local params except pagination', () => {
    const result = new URLSearchParams(
      mergeFilterQuery(
        new URLSearchParams('t=payouts&q=rahim&st=completed&ap=open&days=30&bv=weekly&ba=2026-10-12&page=3&prod=2&pm=cash'),
        'prod=5&ds=pending&pm=reinvest',
      ),
    );

    expect(result.get('t')).toBe('payouts');
    expect(result.get('q')).toBe('rahim');
    expect(result.get('st')).toBe('completed');
    expect(result.get('ap')).toBe('open');
    expect(result.get('days')).toBe('30');
    expect(result.get('bv')).toBe('weekly');
    expect(result.get('ba')).toBe('2026-10-12');
    expect(result.get('prod')).toBe('5');
    expect(result.get('ds')).toBe('pending');
    expect(result.get('pm')).toBe('reinvest');
    expect(result.has('page')).toBe(false);
  });

  it('reset clears only global filters and pagination', () => {
    const result = new URLSearchParams(
      mergeFilterQuery(
        new URLSearchParams('t=orders&q=search&st=invested&ap=closed&days=30&bv=monthly&ba=2026-10-01&prod=4&sh=yes&page=2'),
        '',
      ),
    );

    expect(result.toString()).toBe('t=orders&q=search&st=invested&ap=closed&days=30&bv=monthly&ba=2026-10-01');
  });
});
