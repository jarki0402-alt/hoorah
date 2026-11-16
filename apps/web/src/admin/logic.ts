/** Pure rules behind the admin dashboard (end times, statuses, filters, memory levels). */
import {
  type AdminEvent,
  type AdminEventKind,
  type AdminPass,
  PASS_MAX_DURATION_MS,
  type PassStatus,
} from '@hoorah/protocol';
import { DAY, HOUR, MINUTE } from './format';

export type CreatePreset = '3h' | '1d' | '3d' | '7d' | '30d';
export const CREATE_PRESET_IDS: readonly CreatePreset[] = ['3h', '1d', '3d', '7d', '30d'];
export const DEFAULT_CREATE_PRESET: CreatePreset = '1d';

export type ExtendStep = '3h' | '1d' | '7d';
export const EXTEND_STEP_IDS: readonly ExtendStep[] = ['3h', '1d', '7d'];
const EXTEND_MS: Record<ExtendStep, number> = { '3h': 3 * HOUR, '1d': DAY, '7d': 7 * DAY };

/** The server wants at least this much time left on a new end. */
export const MIN_REMAINING_MS = MINUTE;

const ceilToMinute = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE;

/** 23.59 local time, `days` calendar days after `now`. */
export function endOfDay(now: number, days: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

/**
 * End time for a "Berlaku" chip. Hours run exactly that long (to the next whole minute); days run to
 * 23.59 of the last day, so "3 hari" on Monday afternoon lasts until Thursday night.
 */
export function presetEnd(preset: CreatePreset, now: number): number {
  switch (preset) {
    case '3h':
      return ceilToMinute(now + 3 * HOUR);
    case '1d':
      return endOfDay(now, 1);
    case '3d':
      return endOfDay(now, 3);
    case '7d':
      return endOfDay(now, 7);
    case '30d':
      return endOfDay(now, 30);
  }
}

/** Extends from the current end, or from now when the pass has already run out. */
export function extendEnd(expiresAt: number, step: ExtendStep, now: number): number {
  return Math.max(now, expiresAt) + EXTEND_MS[step];
}

/** Same window the server accepts: at least a minute ahead, at most 366 days. */
export function isValidEnd(end: number, now: number): boolean {
  return Number.isFinite(end) && end >= now + MIN_REMAINING_MS && end <= now + PASS_MAX_DURATION_MS;
}

/** The server's status, corrected for passes that ran out since the last refresh. */
export function effectiveStatus(p: Pick<AdminPass, 'status' | 'expiresAt'>, now: number): PassStatus {
  return p.status === 'active' && p.expiresAt <= now ? 'expired' : p.status;
}

export type PassFilter = PassStatus | 'all';
export const PASS_FILTERS: readonly PassFilter[] = ['active', 'expired', 'revoked', 'all'];

export function filterPasses(passes: readonly AdminPass[], filter: PassFilter, now: number): AdminPass[] {
  return filter === 'all' ? [...passes] : passes.filter((p) => effectiveStatus(p, now) === filter);
}

export function countByStatus(passes: readonly AdminPass[], now: number): Record<PassStatus, number> {
  const out: Record<PassStatus, number> = { active: 0, expired: 0, revoked: 0 };
  for (const p of passes) out[effectiveStatus(p, now)]++;
  return out;
}

/** Replaces the pass with the same id, or puts a new one first (the list is newest first). */
export function upsertPass(passes: readonly AdminPass[], pass: AdminPass): AdminPass[] {
  const at = passes.findIndex((p) => p.id === pass.id);
  if (at < 0) return [pass, ...passes];
  const next = [...passes];
  next[at] = pass;
  return next;
}

export const MEMORY_TARGET_MB = 300;
export const MEMORY_WARN_MB = 250;
export type MemoryLevel = 'ok' | 'warn' | 'over';

export function memoryLevel(rssMb: number): MemoryLevel {
  if (rssMb > MEMORY_TARGET_MB) return 'over';
  if (rssMb > MEMORY_WARN_MB) return 'warn';
  return 'ok';
}

/** Bar fill (0 to 1) of memory against the target. */
export function memoryFill(rssMb: number): number {
  return Math.min(1, Math.max(0, rssMb / MEMORY_TARGET_MB));
}

/** Live monitor levels (RAM, CPU, disk): Normal up to 75%, Tinggi up to 90%, Kritis above. */
export const LEVEL_WARN = 0.75;
export const LEVEL_OVER = 0.9;

export function usageLevel(fraction: number): MemoryLevel {
  if (fraction > LEVEL_OVER) return 'over';
  if (fraction > LEVEL_WARN) return 'warn';
  return 'ok';
}

/** Bar fill (0 to 1). */
export function clampFill(fraction: number): number {
  return Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
}

export interface Reading {
  at: number;
  value: number;
}

/** About half an hour of 30-second readings for the live sparklines. */
export const READINGS_MAX = 60;

/** Appends a reading (replacing one taken within the last 10 seconds) and keeps the newest `max`. */
export function pushReading(list: readonly Reading[], r: Reading, max = READINGS_MAX): Reading[] {
  const last = list[list.length - 1];
  const kept = last && r.at - last.at < 10_000 ? list.slice(0, -1) : [...list];
  kept.push(r);
  return kept.length > max ? kept.slice(kept.length - max) : kept;
}

/** Usage "x dari y" share; 0 when the whole is unknown. */
export function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** The busiest cell of a weekday x hour grid; null when it is all zero. */
export function busiestSlot(
  grid: readonly (readonly number[])[],
): { day: number; hour: number; value: number } | null {
  let best: { day: number; hour: number; value: number } | null = null;
  for (let day = 0; day < grid.length; day++) {
    const row = grid[day] ?? [];
    for (let hour = 0; hour < row.length; hour++) {
      const value = row[hour] ?? 0;
      if (value > 0 && (!best || value > best.value)) best = { day, hour, value };
    }
  }
  return best;
}

/** Weekday of a "2026-11-16" date, Monday = 0 (no time zone involved). */
export function weekdayOfKey(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Total, average and the biggest point of a series (for the figures under a chart). */
export function seriesFigures(values: readonly number[]): {
  total: number;
  average: number;
  peakIndex: number;
} {
  let total = 0;
  let peakIndex = 0;
  values.forEach((v, i) => {
    total += v;
    if (v > (values[peakIndex] ?? 0)) peakIndex = i;
  });
  return { total, average: values.length ? total / values.length : 0, peakIndex };
}

/** Security log entries of these kinds in the last day, counting folded repeats. */
export function recentCount(
  events: readonly AdminEvent[],
  kinds: readonly AdminEventKind[],
  now: number,
): number {
  let n = 0;
  for (const e of events) if (kinds.includes(e.kind) && now - e.at < DAY) n += e.count;
  return n;
}

/** Rounds up to 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * exp >= v) return f * exp;
  return 10 * exp;
}

/**
 * Top of a chart scale with `steps` gridlines above zero, each a clean step (counts: whole numbers),
 * so the axis reads 0 / 25% / 50%, 0 / 2 MB / 4 MB or 0 / 1 / 2 / 3 / 4.
 */
export type ScaleKind = 'number' | 'integer' | 'bytes';

export function niceScale(v: number, steps: number, kind: ScaleKind = 'number'): number {
  if (kind === 'bytes' && v >= 1024) {
    // Steps in the unit the top value is written in (1024-based), so labels read 0,5 GB, 1 GB...
    const unit = 1024 ** Math.floor(Math.log(v) / Math.log(1024));
    return niceMax(v / unit / steps) * steps * unit;
  }
  let step = niceMax(v / steps);
  if (kind === 'integer') step = Math.max(1, Math.ceil(step));
  return step * steps;
}
