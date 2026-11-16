import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { counterDelta, EgressStore, egressRowsFrom, type HourTraffic, summarizeEgress } from './egress';
import { parseMemInfo, pickInterface } from './host';
import { historyBucketSec, SampleStore, type SystemSampleInput } from './samples';
import { SecurityLog } from './security';
import { ByteMeter, CloudflareWatch, wsFrameBytes } from './traffic';
import { summarizeUsage, UsageStore, usageBuckets } from './usage';
import {
  BILLING_TZ,
  DAY_MS,
  dayKey,
  HOUR_MS,
  LOCAL_TZ,
  startOfDay,
  startOfMonth,
  zonedParts,
  zoneOffset,
} from './zone';

const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);
const GIB = 1024 ** 3;

describe('time zones', () => {
  it('cuts Pacific billing months at local midnight, across the daylight-saving change', () => {
    // 1 Nov 2026 is the day PDT ends: the month starts at 00:00 PDT (07:00 UTC).
    const now = utc(2026, 11, 16, 3);
    expect(startOfMonth(now, BILLING_TZ)).toBe(utc(2026, 11, 1, 7));
    expect(startOfMonth(now, BILLING_TZ, 1)).toBe(utc(2026, 12, 1, 8));
    expect(startOfMonth(now, BILLING_TZ, -1)).toBe(utc(2026, 10, 1, 7));
    // Still October in Pacific time on the evening of 31 Oct, while it is already November in UTC.
    expect(startOfMonth(utc(2026, 11, 1, 5), BILLING_TZ)).toBe(utc(2026, 10, 1, 7));
    // Across a year end.
    expect(startOfMonth(utc(2027, 1, 10), BILLING_TZ, -1)).toBe(utc(2026, 12, 1, 8));
  });

  it('starts Jakarta days at 17:00 UTC and names them by the Jakarta date', () => {
    const lateNightWib = utc(2026, 11, 15, 18); // 01:00 WIB on 16 Nov
    expect(startOfDay(lateNightWib, LOCAL_TZ)).toBe(utc(2026, 11, 15, 17));
    expect(startOfDay(lateNightWib, LOCAL_TZ, -1)).toBe(utc(2026, 11, 14, 17));
    expect(dayKey(lateNightWib, LOCAL_TZ)).toBe('2026-11-16');
    expect(zoneOffset(lateNightWib, LOCAL_TZ)).toBe(7 * HOUR_MS);
    expect(zoneOffset(utc(2026, 7, 1), BILLING_TZ)).toBe(-7 * HOUR_MS);
    expect(zoneOffset(utc(2026, 12, 1), BILLING_TZ)).toBe(-8 * HOUR_MS);
  });

  it('numbers weekdays from Monday', () => {
    // 16 Nov 2026 is a Monday; 23:30 UTC on Sunday 15 Nov is already Monday 06:30 in Jakarta.
    expect(zonedParts(utc(2026, 11, 15, 23, 30), LOCAL_TZ)).toMatchObject({ weekday: 0, hour: 6, day: 16 });
    expect(zonedParts(utc(2026, 11, 15, 12), LOCAL_TZ)).toMatchObject({ weekday: 6, hour: 19 });
  });
});

describe('network card counters', () => {
  it('counts the movement, starts over after a reboot and never goes negative', () => {
    const at = (boot: string, value: number, iface = 'ens4') => ({ boot, iface, value });
    expect(counterDelta(null, at('a', 5000))).toBe(0);
    expect(counterDelta(at('a', 5000), at('a', 7500))).toBe(2500);
    expect(counterDelta(at('a', 7500), at('b', 300))).toBe(300);
    expect(counterDelta(at('a', 7500), at('a', 100))).toBe(100);
    expect(counterDelta(at('a', 7500), at('a', 9000, 'eth0'))).toBe(0);
  });

  it('books deltas per hour and survives a server restart and a VM reboot', () => {
    const db = openDb(':memory:');
    const t0 = utc(2026, 11, 16, 3, 10);
    let store = new EgressStore(db);
    expect(store.state()).toBeNull();
    expect(store.book({ boot: 'b1', iface: 'ens4', tx: 1_000_000, rx: 50_000 }, t0)).toEqual({
      tx: 0,
      rx: 0,
    });
    expect(store.book({ boot: 'b1', iface: 'ens4', tx: 1_400_000, rx: 60_000 }, t0 + 5 * 60_000)).toEqual({
      tx: 400_000,
      rx: 10_000,
    });
    // The server restarts: a new store on the same file continues from the stored counter.
    store = new EgressStore(db);
    expect(store.book({ boot: 'b1', iface: 'ens4', tx: 1_500_000, rx: 61_000 }, t0 + HOUR_MS)).toEqual({
      tx: 100_000,
      rx: 1_000,
    });
    // The VM reboots: the counters restart from zero under a new boot id.
    expect(store.book({ boot: 'b2', iface: 'ens4', tx: 20_000, rx: 2_000 }, t0 + 2 * HOUR_MS)).toEqual({
      tx: 20_000,
      rx: 2_000,
    });
    expect(store.state()).toEqual({ since: t0, iface: 'ens4' });
    expect(store.rows(0)).toEqual([
      { hour: utc(2026, 11, 16, 3), tx: 400_000, rx: 10_000 },
      { hour: utc(2026, 11, 16, 4), tx: 100_000, rx: 1_000 },
      { hour: utc(2026, 11, 16, 5), tx: 20_000, rx: 2_000 },
    ]);
  });
});

describe('egress summary', () => {
  const now = utc(2026, 11, 16, 3); // Mon 16 Nov, 10:00 WIB; 15 Nov 19:00 PST
  const hourly = (from: number, to: number, tx: number): HourTraffic[] => {
    const out: HourTraffic[] = [];
    for (let h = from; h < to; h += HOUR_MS) out.push({ hour: h, tx, rx: tx / 10 });
    return out;
  };

  it('adds up the Pacific month, last month, today and yesterday in Jakarta, and projects the month end', () => {
    // 1 GiB per hour from 20 Oct (Pacific) until now.
    const rows = hourly(utc(2026, 10, 20, 7), now, GIB);
    const since = utc(2026, 10, 20, 7);
    const s = summarizeEgress(rows, now, since);
    const monthHours = (now - utc(2026, 11, 1, 7)) / HOUR_MS;
    expect(s.month.start).toBe(utc(2026, 11, 1, 7));
    expect(s.month.end).toBe(utc(2026, 12, 1, 8));
    expect(s.month.txBytes).toBe(monthHours * GIB);
    expect(s.previous).toMatchObject({ start: utc(2026, 10, 1, 7), complete: false });
    expect(s.previous.txBytes).toBe(((utc(2026, 11, 1, 7) - since) / HOUR_MS) * GIB);
    // Today in WIB began at 17:00 UTC yesterday: 10 hours ago.
    expect(s.today.txBytes).toBe(10 * GIB);
    expect(s.yesterday.txBytes).toBe(24 * GIB);
    expect(s.perDayBytes).toBeCloseTo(24 * GIB, -3);
    expect(s.paceDays).toBe(7);
    const daysLeft = (utc(2026, 12, 1, 8) - now) / DAY_MS;
    expect(s.projectedBytes).toBeCloseTo(s.month.txBytes + 24 * GIB * daysLeft, -3);
    expect(s.daily).toHaveLength(14);
    expect(s.daily.at(-1)).toMatchObject({ day: '2026-11-16', txBytes: 10 * GIB });
    expect(s.daily[0]).toMatchObject({ day: '2026-11-03', txBytes: 24 * GIB });
  });

  it('paces from the start of measuring when that is less than a week ago, and reads nothing without data', () => {
    const since = now - 2 * DAY_MS;
    const s = summarizeEgress(hourly(since, now, GIB), now, since);
    expect(s.paceDays).toBeCloseTo(2);
    expect(s.perDayBytes).toBeCloseTo(24 * GIB, -3);
    expect(s.previous.complete).toBe(false);
    const empty = summarizeEgress([], now, null);
    expect(empty.month.txBytes).toBe(0);
    expect(empty.perDayBytes).toBe(0);
    expect(empty.projectedBytes).toBe(0);
    expect(empty.daily.every((d) => d.txBytes === 0)).toBe(true);
    expect(summarizeEgress([], now, utc(2026, 9, 1)).previous.complete).toBe(true);
  });

  it('loads rows back to the start of last month', () => {
    expect(egressRowsFrom(now)).toBe(utc(2026, 10, 1, 7));
  });
});

describe('host readers', () => {
  it('parses /proc/meminfo', () => {
    const text =
      'MemTotal:        1000000 kB\nMemFree:  10 kB\nMemAvailable:     400000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n';
    expect(parseMemInfo(text)).toEqual({
      totalBytes: 1_024_000_000,
      availableBytes: 409_600_000,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
    });
    expect(parseMemInfo('nothing here')).toBeNull();
  });

  it('picks the busiest internet-facing card, or the one asked for', () => {
    const cards = [
      { iface: 'lo', tx: 9e9, rx: 9e9 },
      { iface: 'docker0', tx: 8e9, rx: 8e9 },
      { iface: 'veth12ab', tx: 7e9, rx: 7e9 },
      { iface: 'ens4', tx: 5e8, rx: 1e8 },
      { iface: 'ens5', tx: 1e6, rx: 1e6 },
    ];
    expect(pickInterface(cards)?.iface).toBe('ens4');
    expect(pickInterface(cards, 'ens5')?.iface).toBe('ens5');
    expect(pickInterface(cards, 'wlan0')).toBeNull();
    expect(pickInterface([])).toBeNull();
  });
});

describe('relay meter and Cloudflare watch', () => {
  it('adds the WebSocket frame header', () => {
    expect(wsFrameBytes(11)).toBe(13);
    expect(wsFrameBytes(200)).toBe(204);
    expect(wsFrameBytes(70_000)).toBe(70_010);
  });

  it('reports a rate over the last window and hands interval totals to the sample', () => {
    const m = new ByteMeter(30_000);
    expect(m.rate(0)).toBe(0);
    for (let s = 0; s <= 60; s++) {
      m.mark(s * 1000);
      m.add(s < 30 ? 1000 : 3000);
    }
    expect(m.rate(61_000)).toBeCloseTo(3000, -1);
    expect(m.take()).toBe(30 * 1000 + 31 * 3000);
    m.add(500);
    expect(m.take()).toBe(500);
    expect(m.take()).toBe(0);
  });

  it('warns for a day after a request came through the proxy', () => {
    const w = new CloudflareWatch();
    w.note('', 1000);
    expect(w.state(1000)).toEqual({ seenAt: null, active: false });
    w.note('8d3f2a1b-SIN', 5000);
    expect(w.state(5000 + 23 * HOUR_MS)).toEqual({ seenAt: 5000, active: true });
    expect(w.state(5000 + 25 * HOUR_MS).active).toBe(false);
  });
});

describe('usage', () => {
  const now = utc(2026, 11, 16, 3, 20); // Mon 16 Nov 10:20 WIB

  it('makes 24 hourly points for a day and Jakarta days otherwise', () => {
    const day = usageBuckets(1, now);
    expect(day.bucket).toBe('hour');
    expect(day.starts).toHaveLength(24);
    expect(day.starts.at(-1)).toBe(utc(2026, 11, 16, 3));
    const week = usageBuckets(7, now);
    expect(week.starts).toHaveLength(7);
    expect(week.starts[0]).toBe(utc(2026, 11, 9, 17));
    expect(week.starts.at(-1)).toBe(utc(2026, 11, 15, 17));
  });

  it('aggregates rooms, game starts, the heatmap and top games', () => {
    const store = new UsageStore(openDb(':memory:'));
    const mondayMorning = utc(2026, 11, 16, 1, 5); // Mon 08:05 WIB
    const saturdayNight = utc(2026, 11, 14, 13, 40); // Sat 20:40 WIB
    store.roomCreated(saturdayNight);
    store.gameStarted('ludo', 3, saturdayNight);
    store.gameStarted('ludo', 4, saturdayNight + 60_000);
    store.gameStarted('kuis', 2, saturdayNight + 120_000);
    store.roomClosed(45 * 60_000, 4, saturdayNight + 50 * 60_000);
    store.roomCreated(mondayMorning);
    store.roomClosed(5 * 60_000, 0, mondayMorning + 10 * 60_000);
    store.passActivated(mondayMorning);
    // Before the range: ignored.
    store.gameStarted('catur', 2, now - 10 * DAY_MS);

    const u = store.summary(7, now);
    expect(u.bucket).toBe('day');
    expect(u.totals).toEqual({
      roomsCreated: 2,
      gameStarts: 3,
      startPlayers: 9,
      roomsClosed: 2,
      roomSeconds: 50 * 60,
      roomsPlayed: 1,
      roomPlayers: 4,
      passActivations: 1,
    });
    expect(u.games).toEqual([
      { gameId: 'ludo', plays: 2, players: 7 },
      { gameId: 'kuis', plays: 1, players: 2 },
    ]);
    expect(u.heatmap[5]?.[20]).toBe(3);
    expect(u.heatmap.flat().reduce((a, b) => a + b, 0)).toBe(3);
    const sat = u.series.find((p) => p.at === utc(2026, 11, 13, 17));
    expect(sat).toMatchObject({ roomsCreated: 1, gameStarts: 3, startPlayers: 9 });
    expect(u.series.at(-1)).toMatchObject({ at: utc(2026, 11, 15, 17), roomsCreated: 1, gameStarts: 0 });

    // The longer range reaches the older game too.
    expect(store.summary(30, now).totals.gameStarts).toBe(4);
  });

  it('keeps hours inside their point for a one-day view', () => {
    const rows = [
      { hour: utc(2026, 11, 16, 1), roomsCreated: 2, gameStarts: 1, startPlayers: 2 },
      { hour: utc(2026, 11, 15, 2), roomsCreated: 5, gameStarts: 5, startPlayers: 5 },
    ].map((r) => ({
      ...r,
      roomsClosed: 0,
      roomSeconds: 0,
      roomsPlayed: 0,
      roomPlayers: 0,
      passActivations: 0,
    }));
    const u = summarizeUsage(rows, [], 1, now);
    expect(u.series).toHaveLength(24);
    expect(u.totals.roomsCreated).toBe(2);
    expect(u.series.find((p) => p.at === utc(2026, 11, 16, 1))?.roomsCreated).toBe(2);
  });
});

describe('security log', () => {
  it('folds repeats from one address in one minute, newest first', () => {
    const log = new SecurityLog(openDb(':memory:'));
    const t = utc(2026, 11, 16, 3, 0);
    log.record('pass_wrong', '9.9.9.9', t);
    log.record('pass_wrong', '9.9.9.9', t + 20_000);
    log.record('pass_wrong', '9.9.9.9', t + 50_000);
    log.record('pass_wrong', '8.8.8.8', t + 30_000);
    log.record('login_ok', '1.2.3.4', t + 70_000, 'admin');
    log.flush();
    // The same minute again after a flush still lands on the same row.
    log.record('pass_wrong', '9.9.9.9', t + 55_000);
    const list = log.list();
    expect(list.map((e) => [e.kind, e.ip, e.count, e.detail])).toEqual([
      ['login_ok', '1.2.3.4', 1, 'admin'],
      ['pass_wrong', '9.9.9.9', 4, null],
      ['pass_wrong', '8.8.8.8', 1, null],
    ]);
    expect(list[1]?.at).toBe(t + 55_000);
    log.prune(t + 31 * DAY_MS);
    expect(log.list()).toEqual([]);
  });
});

describe('system samples', () => {
  const sample = (at: number, over: Partial<SystemSampleInput> = {}): SystemSampleInput => ({
    at,
    ramUsed: 500,
    ramTotal: 1000,
    swapUsed: 0,
    swapTotal: 0,
    load1: 0.5,
    cpus: 2,
    diskUsed: 10,
    diskTotal: 100,
    rss: 80,
    heapUsed: 20,
    dbBytes: 4096,
    sockets: 3,
    screens: 1,
    phones: 2,
    rooms: 1,
    players: 2,
    direct: 1,
    relayBytes: 1000,
    netTx: 2000,
    netRx: 100,
    ...over,
  });

  it('buckets the history and sums the bytes', () => {
    expect([historyBucketSec(24), historyBucketSec(168), historyBucketSec(336)]).toEqual([300, 1800, 3600]);
    const store = new SampleStore(openDb(':memory:'));
    const t = utc(2026, 11, 16, 3, 0);
    store.insert(sample(t));
    store.insert(sample(t + 5 * 60_000, { ramUsed: 900, players: 5, netTx: null }));
    store.insert(sample(t + 35 * 60_000, { netTx: null }));
    const day = store.history(24, t + HOUR_MS);
    expect(day.samples).toHaveLength(3);
    expect(day.samples[2]?.txBytes).toBeNull();
    const week = store.history(168, t + HOUR_MS);
    expect(week.bucketSec).toBe(1800);
    expect(week.samples).toHaveLength(2);
    expect(week.samples[0]).toMatchObject({
      at: t,
      ram: 0.7,
      load: 0.25,
      players: 5,
      txBytes: 2000,
      relayBytes: 2000,
    });
    store.prune(t + 15 * DAY_MS);
    expect(store.history(336, t + 15 * DAY_MS).samples).toEqual([]);
  });
});
