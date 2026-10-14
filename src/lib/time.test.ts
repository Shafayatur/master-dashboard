import { describe, expect, it } from 'vitest';
import { dhakaDate, dhakaDayStartUtc, dhakaRangeToUtc, dhakaTs, formatDhaka, todayDhaka } from './time';

describe('Dhaka time helpers', () => {
  it('a Dhaka day starts at 18:00 UTC the previous day', () => {
    expect(dhakaDayStartUtc('2026-10-05').toISOString()).toBe('2026-10-04T18:00:00.000Z');
  });

  it('inclusive Dhaka range becomes a half-open UTC range', () => {
    const { start, endExclusive } = dhakaRangeToUtc('2026-10-01', '2026-10-03');
    expect(start.toISOString()).toBe('2026-09-30T18:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-10-03T18:00:00.000Z');
  });

  it('single-day range spans exactly 24h', () => {
    const { start, endExclusive } = dhakaRangeToUtc('2026-10-05', '2026-10-05');
    expect(endExclusive.getTime() - start.getTime()).toBe(24 * 3_600_000);
  });

  it('rejects bad input', () => {
    expect(() => dhakaDayStartUtc('05/10/2026')).toThrow();
    expect(() => dhakaRangeToUtc('2026-10-05', '2026-10-01')).toThrow();
  });

  it('todayDhaka rolls over at 18:00 UTC', () => {
    expect(todayDhaka(new Date('2026-10-04T17:59:00Z'))).toBe('2026-10-04');
    expect(todayDhaka(new Date('2026-10-04T18:00:00Z'))).toBe('2026-10-05');
  });

  it('formats a UTC instant as Dhaka local time', () => {
    expect(formatDhaka(new Date('2026-10-04T18:30:00Z'))).toBe('2026-10-05 00:30');
  });

  it('builds SQL fragments', () => {
    expect(dhakaTs('d."date"')).toBe(`(d."date" + interval '6 hours')`);
    expect(dhakaDate('d."date"')).toBe(`(d."date" + interval '6 hours')::date`);
  });
});
