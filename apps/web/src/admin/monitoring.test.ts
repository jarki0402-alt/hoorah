import type { AdminEvent } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import {
  dayKeyOf,
  formatBytes,
  formatBytesAt,
  formatDay,
  formatHour,
  formatPercent,
  formatRate,
} from './format';
import {
  busiestSlot,
  clampFill,
  niceMax,
  niceScale,
  pushReading,
  READINGS_MAX,
  recentCount,
  seriesFigures,
  share,
  usageLevel,
  weekdayOfKey,
} from './logic';

const TZ = 'Asia/Jakarta';
/** Monday 16 November 2026, 10.00 in Jakarta. */
const NOW = Date.UTC(2026, 10, 16, 3, 0);

describe('monitoring formats', () => {
  it('writes sizes in 1024 steps with an Indonesian comma', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(84 * 1024 * 1024)).toBe('84 MB');
    expect(formatBytes(2.34 * 1024 ** 3)).toBe('2,3 GB');
    expect(formatBytes(200 * 1024 ** 3)).toBe('200 GB');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatRate(2048)).toBe('2 KB/dtk');
    // Axis labels keep the unit of the top of the scale.
    expect(formatBytesAt(0.5 * 1024 ** 3, 2 * 1024 ** 3)).toBe('0,5 GB');
    expect(formatBytesAt(2 * 1024 ** 3, 2 * 1024 ** 3)).toBe('2 GB');
    expect(formatBytesAt(0, 2 * 1024 ** 3)).toBe('0');
    expect(formatBytesAt(300, 400)).toBe('300 B');
  });

  it('writes shares as whole percents, with a sliver above zero as <1%', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.004)).toBe('<1%');
    expect(formatPercent(0.425)).toBe('43%');
    expect(formatPercent(1.5)).toBe('150%');
  });

  it('labels chart axes in the given zone', () => {
    expect(formatHour(NOW, TZ)).toBe('10.00');
    expect(formatDay(NOW, TZ)).toBe('16 Nov');
    expect(dayKeyOf(Date.UTC(2026, 10, 15, 17, 30), TZ)).toBe('2026-11-16');
    expect(dayKeyOf(Date.UTC(2026, 10, 15, 17, 30), 'UTC')).toBe('2026-11-15');
  });
});

describe('monitoring logic', () => {
  it('rates RAM and CPU as Normal up to 75%, Tinggi up to 90%, Kritis above', () => {
    expect(usageLevel(0.75)).toBe('ok');
    expect(usageLevel(0.76)).toBe('warn');
    expect(usageLevel(0.9)).toBe('warn');
    expect(usageLevel(0.91)).toBe('over');
    expect(usageLevel(1.8)).toBe('over');
  });

  it('keeps the newest readings and replaces one taken moments ago', () => {
    let list = pushReading([], { at: 0, value: 0.1 });
    list = pushReading(list, { at: 5_000, value: 0.2 });
    expect(list).toEqual([{ at: 5_000, value: 0.2 }]);
    for (let i = 1; i <= READINGS_MAX + 5; i++)
      list = pushReading(list, { at: 5_000 + i * 30_000, value: i });
    expect(list).toHaveLength(READINGS_MAX);
    expect(list.at(-1)?.value).toBe(READINGS_MAX + 5);
  });

  it('finds the busiest weekday and hour, and nothing in an empty grid', () => {
    const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    expect(busiestSlot(grid)).toBeNull();
    (grid[5] as number[])[20] = 4;
    (grid[0] as number[])[8] = 2;
    expect(busiestSlot(grid)).toEqual({ day: 5, hour: 20, value: 4 });
  });

  it('names weekdays from Monday and sums series', () => {
    expect(weekdayOfKey('2026-11-16')).toBe(0);
    expect(weekdayOfKey('2026-11-22')).toBe(6);
    expect(seriesFigures([1, 5, 3])).toEqual({ total: 9, average: 3, peakIndex: 1 });
    expect(seriesFigures([])).toEqual({ total: 0, average: 0, peakIndex: 0 });
  });

  it('rounds chart scales to clean steps', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(0.62)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(1.2)).toBe(2);
    expect(niceMax(2.2)).toBe(2.5);
    expect(niceMax(37)).toBe(50);
    expect(niceMax(7_400_000)).toBe(10_000_000);
    expect(niceScale(1, 4)).toBe(1);
    expect(niceScale(0.62, 4)).toBe(0.8);
    expect(niceScale(2, 4, 'integer')).toBe(4);
    expect(niceScale(37, 4, 'integer')).toBe(40);
    expect(niceScale(1.8 * 1024 ** 3, 4, 'bytes')).toBe(2 * 1024 ** 3);
    expect(niceScale(19 * 1024 ** 2, 4, 'bytes')).toBe(20 * 1024 ** 2);
    expect(niceScale(300, 4, 'bytes')).toBe(400);
    expect(niceScale(7_400_000, 4)).toBe(8_000_000);
  });

  it('guards shares and fills', () => {
    expect(share(1, 0)).toBe(0);
    expect(share(1, 4)).toBe(0.25);
    expect(clampFill(1.4)).toBe(1);
    expect(clampFill(Number.NaN)).toBe(0);
  });

  it('counts the last day of security entries with their repeats', () => {
    const e = (kind: AdminEvent['kind'], ago: number, count = 1): AdminEvent => ({
      id: ago,
      at: NOW - ago,
      kind,
      ip: '9.9.9.9',
      count,
      detail: null,
    });
    const events = [
      e('pass_wrong', 60_000, 4),
      e('pass_limited', 120_000, 2),
      e('login_failed', 3_600_000),
      e('pass_wrong', 2 * 86_400_000, 9),
    ];
    expect(recentCount(events, ['pass_wrong', 'pass_limited'], NOW)).toBe(6);
    expect(recentCount(events, ['login_failed', 'login_limited'], NOW)).toBe(1);
  });
});
