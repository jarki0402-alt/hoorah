import { describe, expect, it } from 'vitest';
import { formatUntil } from './when';

describe('formatUntil', () => {
  const now = new Date(2026, 10, 16, 14, 5).getTime();

  it('says today and tomorrow in words', () => {
    expect(formatUntil(new Date(2026, 10, 16, 23, 59).getTime(), now)).toBe('hari ini 23.59');
    expect(formatUntil(new Date(2026, 10, 17, 9, 0).getTime(), now)).toBe('besok 09.00');
  });

  it('names the day and date further ahead', () => {
    expect(formatUntil(new Date(2026, 10, 21, 23, 59).getTime(), now)).toBe('Sab, 21 Nov 23.59');
    expect(formatUntil(new Date(2027, 0, 3, 7, 30).getTime(), now)).toBe('Min, 3 Jan 07.30');
  });
});
