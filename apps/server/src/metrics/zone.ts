/**
 * Calendar maths in a named time zone with only `Intl` (no library): where a day or a month starts
 * for Google's billing (Pacific time) and for the players (Asia/Jakarta). Every function takes the
 * zone by name, so results never depend on the machine's own zone.
 */

/** Google cuts the billing month in Pacific time. */
export const BILLING_TZ = 'America/Los_Angeles';
/** Days, heatmaps and "hari ini" follow the players' clock. */
export const LOCAL_TZ = 'Asia/Jakarta';
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export interface ZonedParts {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Monday ... 6 = Sunday. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The wall clock in `tz` at instant `ms`. */
export function zonedParts(ms: number, tz: string): ZonedParts {
  const raw: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(ms)) if (p.type !== 'literal') raw[p.type] = p.value;
  const num = (k: string) => Number(raw[k] ?? 0);
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    // Some engines print midnight as "24" even with h23.
    hour: num('hour') % 24,
    minute: num('minute'),
    second: num('second'),
    weekday: WEEKDAYS[raw.weekday ?? ''] ?? 0,
  };
}

/** How far `tz` is ahead of UTC at instant `ms`, in ms (Jakarta: +7 h). */
export function zoneOffset(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant the clock in `tz` shows that date and hour. Month and day may overflow (month 13 is
 * January next year, day 0 the last day of the month before), as with `Date.UTC`.
 */
export function zonedTime(year: number, month: number, day: number, tz: string, hour = 0): number {
  const wall = Date.UTC(year, month - 1, day, hour);
  const first = wall - zoneOffset(wall, tz);
  // A second pass settles a daylight-saving change between the guess and the answer.
  return wall - zoneOffset(first, tz);
}

/** Midnight in `tz` of the day `ms` falls on, moved by `offsetDays` days. */
export function startOfDay(ms: number, tz: string, offsetDays = 0): number {
  const p = zonedParts(ms, tz);
  return zonedTime(p.year, p.month, p.day + offsetDays, tz);
}

/** Midnight in `tz` on the 1st of the month `ms` falls in, moved by `offsetMonths` months. */
export function startOfMonth(ms: number, tz: string, offsetMonths = 0): number {
  const p = zonedParts(ms, tz);
  return zonedTime(p.year, p.month + offsetMonths, 1, tz);
}

/** "2026-11-16": the date `ms` falls on in `tz`. */
export function dayKey(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Start of the UTC hour (every zone used here is a whole number of hours from UTC). */
export function floorHour(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}
