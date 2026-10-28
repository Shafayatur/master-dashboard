import { describe, expect, it } from 'vitest';
import { formatBucketLabel } from './labels';

describe('formatBucketLabel', () => {
  it('formats daily labels', () => {
    expect(formatBucketLabel('2026-10-12', 'day')).toBe('12 Oct');
  });

  it('formats monthly labels', () => {
    expect(formatBucketLabel('2026-10-01', 'month')).toBe('Oct 26');
  });

  it('returns an unrecognized label unchanged', () => {
    expect(formatBucketLabel('not-a-date', 'day')).toBe('not-a-date');
  });
});
