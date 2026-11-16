/** Pure formatting helpers for the admin dashboard (Indonesian, 24-hour clock). */
import { TIME } from './strings';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const LOCALE = 'id-ID';

export type WeekdayStyle = 'short' | 'long' | 'none';

export interface DateOptions {
  /** 'short' gives "Sab", 'long' gives "Sabtu", 'none' leaves the day name out. */
  weekday?: WeekdayStyle;
  /** The year is shown only when it differs from the year of `now`. */
  now?: number;
  /** Defaults to the browser's zone; tests pin one. */
  timeZone?: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(weekday: WeekdayStyle, timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `${weekday}|${timeZone ?? ''}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, {
      ...(weekday === 'none' ? {} : { weekday }),
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

type Parts = Partial<Record<Intl.DateTimeFormatPartTypes, string>>;

function partsOf(f: Intl.DateTimeFormat, ms: number): Parts {
  const out: Parts = {};
  for (const p of f.formatToParts(ms)) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}

/** "Sab, 21 Nov 23.59" (or "Sabtu, 21 Nov 23.59", "21 Nov 23.59"); adds the year when it is not this year. */
export function formatDateTime(ms: number, opts: DateOptions = {}): string {
  const weekday = opts.weekday ?? 'short';
  const f = dateFormatter(weekday, opts.timeZone);
  const p = partsOf(f, ms);
  const thisYear = partsOf(f, opts.now ?? Date.now()).year;
  // Some engines print midnight as "24" even with h23.
  const hour = p.hour === '24' ? '00' : (p.hour ?? '00');
  const date = `${p.day ?? ''} ${p.month ?? ''}${p.year && p.year !== thisYear ? ` ${p.year}` : ''}`;
  const time = `${hour}.${p.minute ?? '00'}`;
  return weekday === 'none' || !p.weekday ? `${date} ${time}` : `${p.weekday}, ${date} ${time}`;
}

/**
 * A span of time in its two largest units: "2 hari 3 jam", "5 jam 20 menit", "12 menit", "45 detik".
 * Rounds down, so "Sisa 2 jam" never promises more than is left.
 */
export function formatDuration(ms: number): string {
  const span = Math.max(0, ms);
  if (span < MINUTE) return TIME.seconds(Math.floor(span / SECOND));
  if (span < HOUR) return TIME.minutes(Math.floor(span / MINUTE));
  if (span < DAY) {
    const h = Math.floor(span / HOUR);
    const m = Math.floor((span % HOUR) / MINUTE);
    return m ? `${TIME.hours(h)} ${TIME.minutes(m)}` : TIME.hours(h);
  }
  const d = Math.floor(span / DAY);
  const h = Math.floor((span % DAY) / HOUR);
  return h ? `${TIME.days(d)} ${TIME.hours(h)}` : TIME.days(d);
}

/** "baru saja", "5 menit lalu", "2 jam lagi", "3 hari lalu"; a month or more away shows the date. */
export function formatRelative(ms: number, now: number, timeZone?: string): string {
  const diff = ms - now;
  const span = Math.abs(diff);
  if (span < MINUTE) return diff <= 0 ? TIME.justNow : TIME.soon;
  if (span >= 30 * DAY)
    return formatDateTime(ms, { weekday: 'none', now, ...(timeZone ? { timeZone } : {}) });
  let text: string;
  if (span < HOUR) text = TIME.minutes(Math.floor(span / MINUTE));
  else if (span < DAY) text = TIME.hours(Math.floor(span / HOUR));
  else text = TIME.days(Math.floor(span / DAY));
  return diff < 0 ? TIME.ago(text) : TIME.ahead(text);
}

const numberFormats = new Map<number, Intl.NumberFormat>();

/** Indonesian digits: "1.234", "1,5". */
export function formatNumber(n: number, fractionDigits = 0): string {
  let f = numberFormats.get(fractionDigits);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: fractionDigits });
    numberFormats.set(fractionDigits, f);
  }
  return f.format(n);
}

/** Database size from kilobytes: "512 KB", "1,5 MB". */
export function formatKb(kb: number): string {
  if (kb < 1024) return `${formatNumber(Math.max(0, Math.round(kb)))} KB`;
  return `${formatNumber(kb / 1024, 1)} MB`;
}

/** "84 MB". */
export function formatMb(mb: number): string {
  return `${formatNumber(Math.round(mb))} MB`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Value for `<input type="datetime-local">` in the browser's zone: "2026-11-21T23:59". */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Reads a `datetime-local` value (seconds optional) as local time; null when it is not a real date. */
export function fromLocalInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => (v === undefined ? 0 : Number(v))) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(y, mo - 1, d, h, mi, s, 0);
  // Reject values the Date constructor silently rolls over (31 Feb, 25:00).
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  if (date.getHours() !== h || date.getMinutes() !== mi) return null;
  return date.getTime();
}

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/** Sizes in 1024 steps: "512 B", "1,5 KB", "84 MB", "2,3 GB" (one decimal below 10, none above). */
export function formatBytes(bytes: number): string {
  let v = Math.max(0, bytes);
  if (v < 1024) return `${formatNumber(Math.round(v))} B`;
  let unit: (typeof BYTE_UNITS)[number] = 'KB';
  for (const u of BYTE_UNITS) {
    v /= 1024;
    unit = u;
    if (v < 1024) break;
  }
  return `${formatNumber(v, v < 10 ? 1 : 0)} ${unit}`;
}

/** "1,5 KB/dtk". */
export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/dtk`;
}

/** A 0 to 1 share as "42%"; a sliver above zero shows "<1%" rather than "0%". */
export function formatPercent(fraction: number): string {
  const pct = Math.max(0, fraction) * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${formatNumber(Math.round(pct))}%`;
}

/** Hour on a chart axis: "14.00". */
export function formatHour(ms: number, timeZone?: string): string {
  const d = partsOf(timeFormatter(timeZone), ms);
  const hour = d.hour === '24' ? '00' : (d.hour ?? '00');
  return `${hour}.${d.minute ?? '00'}`;
}

/** Day on a chart axis: "16 Nov". */
export function formatDay(ms: number, timeZone?: string): string {
  const d = partsOf(dayFormatter(timeZone), ms);
  return `${d.day ?? ''} ${d.month ?? ''}`;
}

function timeFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `time|${timeZone ?? ''}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

function dayFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `day|${timeZone ?? ''}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, {
      day: 'numeric',
      month: 'short',
      ...(timeZone ? { timeZone } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

const keyFormats = new Map<string, Intl.DateTimeFormat>();

/** "2026-11-16": the date `ms` falls on in `timeZone` (browser zone when left out). */
export function dayKeyOf(ms: number, timeZone?: string): string {
  const k = timeZone ?? '';
  let f = keyFormats.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    });
    keyFormats.set(k, f);
  }
  const p = partsOf(f, ms);
  return `${p.year ?? ''}-${p.month ?? ''}-${p.day ?? ''}`;
}

/** Axis label in the unit of the scale's top value, so one axis never mixes "512 MB" and "1 GB". */
export function formatBytesAt(bytes: number, top: number): string {
  if (bytes <= 0) return '0';
  if (top < 1024) return `${formatNumber(Math.round(bytes))} B`;
  const k = Math.min(BYTE_UNITS.length, Math.floor(Math.log(top) / Math.log(1024)));
  const unit = BYTE_UNITS[k - 1] ?? 'KB';
  return `${formatNumber(bytes / 1024 ** k, 1)} ${unit}`;
}
