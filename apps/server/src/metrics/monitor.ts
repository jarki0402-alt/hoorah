/**
 * Ties the dashboard's monitoring together: reads the VM and the relay for the live view, takes the
 * 5-minute sample (system numbers, egress counters, relay bytes), writes the usage and security
 * buffers, and drops old rows. Timers are unref'd, so they never keep the process alive.
 */

import os from 'node:os';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type {
  AdminEgress,
  AdminLive,
  AdminSystem,
  AdminSystemHistory,
  SystemHistoryHours,
} from '@hoorah/protocol';
import { dbSizeBytes, tableRows } from '../db';
import type { Logger } from '../log';
import type { LiveCounts } from '../rooms';
import {
  type EgressStore,
  egressRowsFrom,
  FREE_DISK_MAX_BYTES,
  FREE_EGRESS_BYTES,
  FREE_RAM_MAX_BYTES,
  summarizeEgress,
} from './egress';
import { readBootId, readDisk, readMemInfo, readNetCounters } from './host';
import { SAMPLE_EVERY_MS, type SampleStore } from './samples';
import type { SecurityLog } from './security';
import type { ByteMeter, CloudflareWatch } from './traffic';
import type { UsageStore } from './usage';

/** The first sample comes a minute after start (the server is settled by then). */
const FIRST_SAMPLE_MS = 60_000;
/** Usage and security entries wait in memory at most this long. */
const FLUSH_EVERY_MS = 10_000;
const CLOUDFLARE_KEY = 'cloudflare_seen_at';

export interface MonitorDeps {
  db: DatabaseSync;
  dbFile: string;
  rooms: { liveCounts(): LiveCounts; readonly connectionCount: number };
  relay: ByteMeter;
  cloudflare: CloudflareWatch;
  samples: SampleStore;
  egress: EgressStore;
  usage: UsageStore;
  security: SecurityLog;
  /** Where the host's /sys is mounted (HOST_SYS_PATH). */
  hostSys: string;
  /** NET_IFACE: the card to measure; otherwise the busiest one. */
  netIface: string | undefined;
  startedAt: number;
  now: () => number;
  log: Logger;
}

/** The last time Cloudflare's proxy was seen, from an earlier run (null when never). */
export function loadCloudflareSeen(db: DatabaseSync): number | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(CLOUDFLARE_KEY) as
    | { value: string }
    | undefined;
  const n = Number(row?.value);
  return row && Number.isSafeInteger(n) && n > 0 ? n : null;
}

export class Monitor {
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private readonly saveMetaQ: StatementSync;
  private netReadable = false;
  private savedCloudflare: number | null;
  private sampling = false;

  constructor(private readonly d: MonitorDeps) {
    this.saveMetaQ = d.db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    );
    this.savedCloudflare = d.cloudflare.seenAt;
  }

  start(): void {
    const first = setTimeout(() => void this.sample(), FIRST_SAMPLE_MS);
    const every = setInterval(() => void this.sample(), SAMPLE_EVERY_MS);
    const flush = setInterval(() => this.flush(), FLUSH_EVERY_MS);
    for (const t of [first, every, flush]) {
      t.unref();
      this.timers.push(t);
    }
  }

  /** Stops the timers and writes what is still in memory (call before closing the database). */
  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    this.flush();
    this.saveCloudflare();
  }

  live(): AdminLive {
    const c = this.d.rooms.liveCounts();
    return {
      screens: c.screens,
      phones: c.phones,
      rooms: c.rooms,
      players: c.players,
      direct: c.direct,
      sockets: this.d.rooms.connectionCount,
      relayBytesPerSec: Math.round(this.d.relay.rate(this.d.now())),
    };
  }

  async system(): Promise<AdminSystem> {
    const [mem, disk] = await Promise.all([readMemInfo(), readDisk()]);
    const now = this.d.now();
    const proc = process.memoryUsage();
    const [l1 = 0, l5 = 0, l15 = 0] = os.loadavg();
    return {
      at: now,
      host: {
        memTotalBytes: mem.totalBytes,
        memAvailableBytes: mem.availableBytes,
        swapTotalBytes: mem.swapTotalBytes,
        swapUsedBytes: mem.swapUsedBytes,
        load: [l1, l5, l15],
        cpus: Math.max(1, os.cpus().length),
        uptimeSec: Math.round(os.uptime()),
        fromProc: mem.fromProc,
      },
      disk,
      process: {
        rssBytes: proc.rss,
        heapUsedBytes: proc.heapUsed,
        heapTotalBytes: proc.heapTotal,
        startedAt: this.d.startedAt,
        uptimeSec: Math.round((now - this.d.startedAt) / 1000),
        node: process.version,
      },
      database: { bytes: dbSizeBytes(this.d.dbFile), tables: tableRows(this.d.db) },
      live: this.live(),
    };
  }

  history(hours: SystemHistoryHours): AdminSystemHistory {
    return this.d.samples.history(hours, this.d.now());
  }

  async egress(): Promise<AdminEgress> {
    const now = this.d.now();
    const [mem, disk] = await Promise.all([readMemInfo(), readDisk()]);
    const state = this.d.egress.state();
    const since = state?.since ?? null;
    // Only the VM (host /sys mounted, card read at least once) is judged against Always Free; a
    // laptop or a local Docker would always look "outside the free tier".
    const onVm = since !== null || this.netReadable;
    const numbers = summarizeEgress(this.d.egress.rows(egressRowsFrom(now)), now, since);
    return {
      available: this.netReadable,
      iface: state?.iface ?? null,
      measuredSince: since,
      freeBytes: FREE_EGRESS_BYTES,
      ...numbers,
      cloudflare: this.d.cloudflare.state(now),
      freeTier: [
        {
          id: 'ram',
          ok: onVm && mem.fromProc ? mem.totalBytes <= FREE_RAM_MAX_BYTES : null,
          bytes: mem.totalBytes,
          limitBytes: FREE_RAM_MAX_BYTES,
        },
        {
          id: 'disk',
          ok: onVm && disk ? disk.totalBytes <= FREE_DISK_MAX_BYTES : null,
          bytes: disk?.totalBytes ?? null,
          limitBytes: FREE_DISK_MAX_BYTES,
        },
      ],
    };
  }

  /** One 5-minute sample. A failed part (no /sys mount, a read error) leaves a gap, nothing more. */
  async sample(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const [mem, disk, net, boot] = await Promise.all([
        readMemInfo(),
        readDisk(),
        readNetCounters(this.d.hostSys, this.d.netIface),
        readBootId(),
      ]);
      const now = this.d.now();
      let delta: { tx: number; rx: number } | null = null;
      this.netReadable = net !== null;
      if (net) {
        try {
          delta = this.d.egress.book({ boot, iface: net.iface, tx: net.tx, rx: net.rx }, now);
        } catch (err) {
          this.d.log.warn('egress_book_failed', { err: String(err) });
        }
      }
      const live = this.d.rooms.liveCounts();
      const proc = process.memoryUsage();
      this.d.samples.insert({
        at: now,
        ramUsed: Math.max(0, mem.totalBytes - mem.availableBytes),
        ramTotal: mem.totalBytes,
        swapUsed: mem.swapUsedBytes,
        swapTotal: mem.swapTotalBytes,
        load1: os.loadavg()[0] ?? 0,
        cpus: Math.max(1, os.cpus().length),
        diskUsed: disk ? Math.max(0, disk.totalBytes - disk.freeBytes) : null,
        diskTotal: disk?.totalBytes ?? null,
        rss: proc.rss,
        heapUsed: proc.heapUsed,
        dbBytes: dbSizeBytes(this.d.dbFile),
        sockets: this.d.rooms.connectionCount,
        screens: live.screens,
        phones: live.phones,
        rooms: live.rooms,
        players: live.players,
        direct: live.direct,
        relayBytes: this.d.relay.take(),
        netTx: delta?.tx ?? null,
        netRx: delta?.rx ?? null,
      });
      this.flush();
      this.saveCloudflare();
      this.d.samples.prune(now);
      this.d.egress.prune(now);
      this.d.usage.prune(now);
      this.d.security.prune(now);
    } catch (err) {
      this.d.log.warn('system_sample_failed', { err: String(err) });
    } finally {
      this.sampling = false;
    }
  }

  private flush(): void {
    try {
      this.d.usage.flush();
      this.d.security.flush();
    } catch (err) {
      this.d.log.warn('metrics_flush_failed', { err: String(err) });
    }
  }

  private saveCloudflare(): void {
    const seen = this.d.cloudflare.seenAt;
    if (seen === null || seen === this.savedCloudflare) return;
    try {
      this.saveMetaQ.run(CLOUDFLARE_KEY, String(seen));
      this.savedCloudflare = seen;
    } catch (err) {
      this.d.log.warn('meta_save_failed', { err: String(err) });
    }
  }
}
