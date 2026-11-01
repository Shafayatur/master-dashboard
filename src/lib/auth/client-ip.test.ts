import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';

describe('clientIp', () => {
  it('prefers platform headers and uses the last forwarded address as fallback', () => {
    expect(clientIp(new Headers({
      'x-real-ip': ' 203.0.113.1 ',
      'x-vercel-forwarded-for': '203.0.113.2',
      'x-forwarded-for': '198.51.100.1, 198.51.100.2',
    }))).toBe('203.0.113.1');
    expect(clientIp(new Headers({
      'x-vercel-forwarded-for': '203.0.113.2',
      'x-forwarded-for': '198.51.100.1, 198.51.100.2',
    }))).toBe('203.0.113.2');
    expect(clientIp(new Headers({
      'x-forwarded-for': '198.51.100.1, 198.51.100.2 ',
    }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
