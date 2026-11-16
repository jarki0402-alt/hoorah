/**
 * One row about the VM and the relay every 5 minutes (`system_samples`), kept 14 days, so the
 * dashboard's "Riwayat" shows what RAM, CPU, players and egress did overnight, not only while the
 * page was open. About 4000 rows of numbers.
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { AdminSystemHistory, AdminSystemSample, SystemHistoryHours } from '@hoorah/protocol';
import { DAY_MS, HOUR_MS } from './zone';

export const SAMPLE_EVERY_MS = 5 * 60_000;
export const SAMPLE_KEEP_DAYS = 14;

export interface SystemSampleInput {
  at: number;
  ramUsed: number;
  ramTotal: number;
  swapUsed: number;
  swapTotal: number;
  load1: number;
  cpus: number;
  diskUsed: number | null;
  diskTotal: number | null;
  rss: number;
  heapUsed: number;
  dbBytes: number;
  sockets: number;
  screens: number;
  phones: number;
  rooms: number;
  players: number;
  direct: number;
  relayBytes: number;
  netTx: number | null;
  netRx: number | null;
}

/** At most a few hundred points whatever the range: 5 minutes for a day, half hours for a week. */
export function historyBucketSec(hours: SystemHistoryHours): number {
  return hours <= 24 ? 300 : hours <= 168 ? 1800 : 3600;
}

interface HistoryRow {
  at: number;
  ram: number | null;
  load: number | null;
  disk: number | null;
  rss: number;
  players: number;
  phones: number;
  screens: number;
  tx: number | null;
  relay: number;
}

export class SampleStore {
  private readonly insertQ: StatementSync;
  private readonly historyQ: StatementSync;
  private readonly pruneQ: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertQ = db.prepare(
      `INSERT OR IGNORE INTO system_samples (at, ram_used, ram_total, swap_used, swap_total, load1, cpus,
         disk_used, disk_total, rss, heap_used, db_bytes, sockets, screens, phones, rooms, players, direct,
         relay_bytes, net_tx, net_rx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.historyQ = db.prepare(
      `SELECT CAST(at / ? AS INTEGER) * ? AS at,
         avg(CAST(ram_used AS REAL) / NULLIF(ram_total, 0)) AS ram,
         avg(load1 / NULLIF(cpus, 0)) AS load,
         max(CAST(disk_used AS REAL) / NULLIF(disk_total, 0)) AS disk,
         max(rss) AS rss,
         max(players) AS players,
         max(phones) AS phones,
         max(screens) AS screens,
         sum(net_tx) AS tx,
         sum(relay_bytes) AS relay
       FROM system_samples WHERE at > ? GROUP BY 1 ORDER BY 1`,
    );
    this.pruneQ = db.prepare('DELETE FROM system_samples WHERE at < ?');
  }

  insert(s: SystemSampleInput): void {
    this.insertQ.run(
      Math.floor(s.at / 60_000) * 60_000,
      s.ramUsed,
      s.ramTotal,
      s.swapUsed,
      s.swapTotal,
      s.load1,
      s.cpus,
      s.diskUsed,
      s.diskTotal,
      s.rss,
      s.heapUsed,
      s.dbBytes,
      s.sockets,
      s.screens,
      s.phones,
      s.rooms,
      s.players,
      s.direct,
      s.relayBytes,
      s.netTx,
      s.netRx,
    );
  }

  history(hours: SystemHistoryHours, now: number): AdminSystemHistory {
    const bucketSec = historyBucketSec(hours);
    const bucketMs = bucketSec * 1000;
    const rows = this.historyQ.all(bucketMs, bucketMs, now - hours * HOUR_MS) as unknown as HistoryRow[];
    const samples: AdminSystemSample[] = rows.map((r) => ({
      at: Number(r.at),
      ram: r.ram,
      load: r.load,
      disk: r.disk,
      rssBytes: r.rss,
      players: r.players,
      phones: r.phones,
      screens: r.screens,
      txBytes: r.tx,
      relayBytes: r.relay,
    }));
    return { hours, bucketSec, samples };
  }

  prune(now: number): void {
    this.pruneQ.run(now - SAMPLE_KEEP_DAYS * DAY_MS);
  }
}
