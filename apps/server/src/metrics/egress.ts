/**
 * Everything the VM sends out, for the dashboard's "Data keluar VM". Read from the host's network
 * card counters (host.ts), the same number Google meters: relay frames, web pages if they are ever
 * served from the VM, TLS and TCP framing all count. The last raw counter is kept with the kernel's
 * boot id, so a server restart loses nothing and a VM reboot (counters back to 0) never makes a
 * negative or a double count. Deltas are booked per UTC hour; Jakarta and Pacific are both whole
 * hours from UTC, so hour rows add up exactly to their days and billing months.
 *
 * Why it matters: the Standard tier's free internet egress is 200 GiB a month per billing account.
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { AdminEgress } from '@hoorah/protocol';
import { BILLING_TZ, DAY_MS, dayKey, floorHour, HOUR_MS, LOCAL_TZ, startOfDay, startOfMonth } from './zone';

const GIB = 1024 ** 3;
export const FREE_EGRESS_BYTES = 200 * GIB;
/**
 * Always Free covers one e2-micro (1 GB RAM) with up to 30 GB of standard disk; a little slack for
 * what the kernel and filesystem report (an e2-micro shows about 0.95 GiB, a 30 GB disk about 29 GiB).
 */
export const FREE_RAM_MAX_BYTES = 1.25 * GIB;
export const FREE_DISK_MAX_BYTES = 31 * GIB;
/** Hour rows kept: long enough for last month and a year-on-year look. */
export const NET_KEEP_DAYS = 400;
const DAILY_DAYS = 14;
const PACE_DAYS = 7;

export interface CounterReading {
  boot: string;
  iface: string;
  value: number;
}

/** How far a byte counter moved since the previous reading. */
export function counterDelta(previous: CounterReading | null, current: CounterReading): number {
  // Nothing to compare with (first reading ever, or another card): start measuring from here.
  if (!previous || previous.iface !== current.iface) return 0;
  // After a reboot the counter restarted from 0: everything on it was sent since then.
  if (previous.boot !== current.boot) return current.value;
  // Same boot but lower: the card was re-created or the counter wrapped. Count from 0 again.
  return current.value >= previous.value ? current.value - previous.value : current.value;
}

export interface HourTraffic {
  hour: number;
  tx: number;
  rx: number;
}

export type EgressNumbers = Pick<
  AdminEgress,
  'month' | 'previous' | 'perDayBytes' | 'paceDays' | 'projectedBytes' | 'today' | 'yesterday' | 'daily'
>;

/** Totals, pace and daily series from the hour rows (pure; `rows` must reach back to last month). */
export function summarizeEgress(
  rows: readonly HourTraffic[],
  now: number,
  measuredSince: number | null,
): EgressNumbers {
  const sum = (from: number, to: number, pick: (r: HourTraffic) => number) => {
    let n = 0;
    for (const r of rows) if (r.hour >= from && r.hour < to) n += pick(r);
    return n;
  };
  const tx = (r: HourTraffic) => r.tx;
  const rx = (r: HourTraffic) => r.rx;

  const monthStart = startOfMonth(now, BILLING_TZ);
  const monthEnd = startOfMonth(now, BILLING_TZ, 1);
  const prevStart = startOfMonth(now, BILLING_TZ, -1);
  const monthTx = sum(monthStart, monthEnd, tx);

  // The pace for the rest of the month: the last 7 days, or since measuring began when shorter.
  const paceFrom = Math.max(now - PACE_DAYS * DAY_MS, measuredSince ?? now);
  const paceMs = Math.max(0, now - paceFrom);
  const perDay = paceMs >= HOUR_MS ? (sum(floorHour(paceFrom), Infinity, tx) / paceMs) * DAY_MS : 0;

  const todayStart = startOfDay(now, LOCAL_TZ);
  const yesterdayStart = startOfDay(now, LOCAL_TZ, -1);
  const daily: AdminEgress['daily'] = [];
  for (let i = DAILY_DAYS - 1; i >= 0; i--) {
    const start = startOfDay(now, LOCAL_TZ, -i);
    const end = startOfDay(now, LOCAL_TZ, -i + 1);
    daily.push({
      day: dayKey(start, LOCAL_TZ),
      start,
      txBytes: sum(start, end, tx),
      rxBytes: sum(start, end, rx),
    });
  }

  return {
    month: { start: monthStart, end: monthEnd, txBytes: monthTx, rxBytes: sum(monthStart, monthEnd, rx) },
    previous: {
      start: prevStart,
      end: monthStart,
      txBytes: sum(prevStart, monthStart, tx),
      complete: measuredSince !== null && measuredSince <= prevStart,
    },
    perDayBytes: perDay,
    paceDays: paceMs / DAY_MS,
    projectedBytes: monthTx + perDay * (Math.max(0, monthEnd - now) / DAY_MS),
    today: { txBytes: sum(todayStart, Infinity, tx), rxBytes: sum(todayStart, Infinity, rx) },
    yesterday: { txBytes: sum(yesterdayStart, todayStart, tx) },
    daily,
  };
}

/** Earliest hour `summarizeEgress` looks at. */
export function egressRowsFrom(now: number): number {
  return Math.min(startOfMonth(now, BILLING_TZ, -1), startOfDay(now, LOCAL_TZ, -(DAILY_DAYS - 1)));
}

export interface NetReading {
  boot: string;
  iface: string;
  tx: number;
  rx: number;
}

interface CounterRow {
  boot: string;
  iface: string;
  tx: number;
  rx: number;
  since: number;
}

export class EgressStore {
  private readonly counterQ: StatementSync;
  private readonly saveCounterQ: StatementSync;
  private readonly addHourQ: StatementSync;
  private readonly rowsQ: StatementSync;
  private readonly pruneQ: StatementSync;

  constructor(private readonly db: DatabaseSync) {
    this.counterQ = db.prepare('SELECT boot_id AS boot, iface, tx, rx, since FROM net_counter WHERE id = 1');
    this.saveCounterQ = db.prepare(
      `INSERT INTO net_counter (id, boot_id, iface, tx, rx, at, since) VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET boot_id = excluded.boot_id, iface = excluded.iface,
         tx = excluded.tx, rx = excluded.rx, at = excluded.at`,
    );
    this.addHourQ = db.prepare(
      `INSERT INTO net_hourly (hour, tx, rx) VALUES (?, ?, ?)
       ON CONFLICT (hour) DO UPDATE SET tx = tx + excluded.tx, rx = rx + excluded.rx`,
    );
    this.rowsQ = db.prepare('SELECT hour, tx, rx FROM net_hourly WHERE hour >= ? ORDER BY hour');
    this.pruneQ = db.prepare('DELETE FROM net_hourly WHERE hour < ?');
  }

  /**
   * Moves the stored counter to `r` and books what was sent and received since the previous
   * reading into the current hour. The very first reading only sets the starting point.
   */
  book(r: NetReading, at: number): { tx: number; rx: number } {
    const prev = this.counterQ.get() as CounterRow | undefined;
    const before = (value: number | undefined): CounterReading | null =>
      prev && value !== undefined ? { boot: prev.boot, iface: prev.iface, value } : null;
    const tx = counterDelta(before(prev?.tx), { boot: r.boot, iface: r.iface, value: r.tx });
    const rx = counterDelta(before(prev?.rx), { boot: r.boot, iface: r.iface, value: r.rx });
    this.db.exec('BEGIN');
    try {
      this.saveCounterQ.run(r.boot, r.iface, r.tx, r.rx, at, prev?.since ?? at);
      this.addHourQ.run(floorHour(at), tx, rx);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return { tx, rx };
  }

  /** When measuring began and on which card; null = never measured. */
  state(): { since: number; iface: string } | null {
    const row = this.counterQ.get() as CounterRow | undefined;
    return row ? { since: row.since, iface: row.iface } : null;
  }

  rows(from: number): HourTraffic[] {
    return this.rowsQ.all(from) as unknown as HourTraffic[];
  }

  prune(now: number): void {
    this.pruneQ.run(now - NET_KEEP_DAYS * DAY_MS);
  }
}
