import { describe, expect, it } from 'vitest';
import {
  DAY,
  formatDateTime,
  formatDuration,
  formatKb,
  formatMb,
  formatNumber,
  formatRelative,
  fromLocalInput,
  HOUR,
  MINUTE,
  SECOND,
  toLocalInput,
} from './format';

const TZ = 'Asia/Jakarta';
/** Saturday 21 November 2026, 23.59 in Jakarta (UTC+7). */
const SAT_2359 = Date.UTC(2026, 10, 21, 16, 59);
/** Monday 16 November 2026, 10.00 in Jakarta. */
const NOW = Date.UTC(2026, 10, 16, 3, 0);

describe('formatDateTime', () => {
  it('uses the short Indonesian day, day, month and a 24-hour time with a dot', () => {
    expect(formatDateTime(SAT_2359, { now: NOW, timeZone: TZ })).toBe('Sab, 21 Nov 23.59');
  });

  it('can spell the day out or leave it away', () => {
    expect(formatDateTime(SAT_2359, { weekday: 'long', now: NOW, timeZone: TZ })).toBe('Sabtu, 21 Nov 23.59');
    expect(formatDateTime(SAT_2359, { weekday: 'none', now: NOW, timeZone: TZ })).toBe('21 Nov 23.59');
  });

  it('prints midnight as 00.00', () => {
    const midnight = Date.UTC(2026, 10, 16, 17, 0);
    expect(formatDateTime(midnight, { weekday: 'none', now: NOW, timeZone: TZ })).toBe('17 Nov 00.00');
  });

  it('adds the year only when it is not the current one', () => {
    const nextYear = Date.UTC(2027, 0, 2, 2, 5);
    expect(formatDateTime(nextYear, { now: NOW, timeZone: TZ })).toBe('Sab, 2 Jan 2027 09.05');
  });
});

describe('formatDuration', () => {
  it('shows the two largest units, rounded down', () => {
    expect(formatDuration(2 * DAY + 3 * HOUR + 59 * MINUTE)).toBe('2 hari 3 jam');
    expect(formatDuration(5 * HOUR + 20 * MINUTE + 30 * SECOND)).toBe('5 jam 20 menit');
    expect(formatDuration(12 * MINUTE + 59 * SECOND)).toBe('12 menit');
    expect(formatDuration(45 * SECOND)).toBe('45 detik');
  });

  it('drops a zero second unit', () => {
    expect(formatDuration(3 * DAY)).toBe('3 hari');
    expect(formatDuration(4 * HOUR)).toBe('4 jam');
  });

  it('never goes below zero', () => {
    expect(formatDuration(-5 * MINUTE)).toBe('0 detik');
  });
});

describe('formatRelative', () => {
  it('says "baru saja" for the last minute and "sebentar lagi" for the next', () => {
    expect(formatRelative(NOW - 20 * SECOND, NOW)).toBe('baru saja');
    expect(formatRelative(NOW, NOW)).toBe('baru saja');
    expect(formatRelative(NOW + 20 * SECOND, NOW)).toBe('sebentar lagi');
  });

  it('counts minutes, hours and days in both directions', () => {
    expect(formatRelative(NOW - 5 * MINUTE, NOW)).toBe('5 menit lalu');
    expect(formatRelative(NOW + 2 * HOUR + 10 * MINUTE, NOW)).toBe('2 jam lagi');
    expect(formatRelative(NOW - 3 * DAY, NOW)).toBe('3 hari lalu');
  });

  it('shows the date from a month away', () => {
    expect(formatRelative(NOW - 40 * DAY, NOW, TZ)).toBe('7 Okt 10.00');
  });
});

describe('numbers and sizes', () => {
  it('uses Indonesian separators', () => {
    expect(formatNumber(1234)).toBe('1.234');
    expect(formatNumber(1.25, 1)).toBe('1,3');
  });

  it('shows the database in KB below 1 MB, otherwise in MB with one decimal', () => {
    expect(formatKb(512)).toBe('512 KB');
    expect(formatKb(1536)).toBe('1,5 MB');
    expect(formatKb(2048)).toBe('2 MB');
  });

  it('rounds memory to whole megabytes', () => {
    expect(formatMb(84.4)).toBe('84 MB');
  });
});

describe('datetime-local values', () => {
  it('round-trips a local time to the minute', () => {
    const t = new Date(2026, 10, 21, 23, 59).getTime();
    expect(toLocalInput(t)).toBe('2026-11-21T23:59');
    expect(fromLocalInput('2026-11-21T23:59')).toBe(t);
  });

  it('accepts seconds', () => {
    expect(fromLocalInput('2026-11-21T23:59:30')).toBe(new Date(2026, 10, 21, 23, 59, 30).getTime());
  });

  it('rejects empty, malformed and impossible dates', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('besok')).toBeNull();
    expect(fromLocalInput('2026-02-31T10:00')).toBeNull();
    expect(fromLocalInput('2026-11-21T25:00')).toBeNull();
  });
});
