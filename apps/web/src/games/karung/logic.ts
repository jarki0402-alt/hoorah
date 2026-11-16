/**
 * Balap Karung rules: lanes, beat judgement, hop lengths, stumbles, finish order, race points and
 * the final ranking. Pure and deterministic: no DOM, no Phaser, no wall clock. Every method that
 * depends on time takes it explicitly:
 *   - `t`      game time in ms (frozen while paused), drives phases and the race clock;
 *   - `server` synced server time in ms. The beat grid lives in server time, the same clock the
 *              phones draw their ring with and stamp every tap with, so a tap is judged by when it
 *              happened on the phone, never by when it arrived over a slow relay.
 */
import { type Fruit, type PlayerInfo, u16Delta } from '@hoorah/protocol';
import type { GameAward, GameResult } from '@hoorah/sdk';
import { STR } from './strings';

/** Tempo of the hop rhythm. The `karung` song plays at the same tempo. */
export const BPM = 98;
export const BEAT_MS = 60_000 / BPM;

export type Phase = 'waiting' | 'countdown' | 'race' | 'raceEnd' | 'standings' | 'matchEnd' | 'done';
export type HopKind = 'none' | 'long' | 'short' | 'super' | 'stumble';

export interface Tuning {
  /** Simulation step for phases. */
  stepMs: number;
  /** Delay after the game becomes ready before the first countdown. */
  startDelayMs: number;
  beatMs: number;
  /** Beats per countdown number (3, 2, 1); the race starts on beat 3 * countBeats. */
  countBeats: number;
  /** Time from the countdown call until beat 0 (music scheduling plus output latency). */
  musicLeadMs: number;
  /** Hard cap on a race. */
  raceMs: number;
  /** "10 seconds left" warning when nobody has finished yet. */
  warningMs: number;
  /** After the first finisher the others get this long. */
  finishGraceMs: number;
  raceEndMs: number;
  standingsMs: number;
  matchEndMs: number;
  /** Track length in metres. */
  trackLength: number;
  longHop: number;
  shortHop: number;
  superHop: number;
  /** A tap within this many ms of a beat is on the beat. */
  beatWindowMs: number;
  /**
   * Mashing makes the racer stumble: two taps closer than this fraction of a beat, or two taps
   * that belong to the same beat (nearest beat), e.g. tapping at double tempo.
   */
  mashBeats: number;
  stumbleMs: number;
  /** Every n-th on-beat hop in a row is a super hop. */
  superEvery: number;
  /** Air time of a hop (also used to time the exact moment a hop crosses the line). */
  hopMs: number;
  /** Accepted gap between a tap's own timestamp and its arrival (clock skew + latency). */
  maxTapLagMs: number;
  maxTapLeadMs: number;
  /** A counter jump larger than this is treated as a resync (phone reload), not as taps. */
  resyncDelta: number;
  /** Finishers this close together make a photo finish. */
  photoMs: number;
  /** Points by place; places past the end of the list get the last value. */
  points: readonly number[];
  maxRacers: number;
}

/**
 * Track 50 m: a perfect rhythm (1 + 1 + 2.2 m every 3 beats) finishes in ~36 beats (22 s), a
 * decent one in ~30-35 s, someone who taps off the beat (0.4 m per hop) would need over a minute,
 * so the first-finisher grace usually ends the race.
 */
export const DEFAULT_TUNING: Tuning = {
  stepMs: 10,
  startDelayMs: 800,
  beatMs: BEAT_MS,
  countBeats: 2,
  musicLeadMs: 90,
  raceMs: 60_000,
  warningMs: 50_000,
  finishGraceMs: 10_000,
  raceEndMs: 3_600,
  standingsMs: 5_500,
  matchEndMs: 4_000,
  trackLength: 50,
  longHop: 1,
  shortHop: 0.4,
  superHop: 2.2,
  beatWindowMs: 110,
  mashBeats: 0.35,
  stumbleMs: 1_500,
  superEvery: 3,
  hopMs: 380,
  maxTapLagMs: 2_000,
  maxTapLeadMs: 300,
  resyncDelta: 20,
  photoMs: 300,
  points: [10, 8, 6, 5, 4, 3, 2, 1],
  maxRacers: 8,
};

export interface Racer {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  connected: boolean;
  /** No longer in the room's player list. */
  gone: boolean;
  joinIndex: number;
  /** Lane in the current race (0 = top), null = watching until the next race. */
  lane: number | null;
  /** Last cumulative u16 tap counter seen, -1 before the first frame. */
  lastTaps: number;
  /* per race */
  dist: number;
  streak: number;
  /** Beat index of the last on-beat hop. */
  lastBeat: number;
  /** Server time of the latest tap and the beat nearest to it. */
  lastTapAt: number;
  lastTapBeat: number;
  stumbleUntil: number;
  /** Server time the racer crossed the line, null while racing. */
  finishAt: number | null;
  /** Place in the last finished race, null when not in it. */
  place: number | null;
  racePoints: number;
  raceOnBeat: number;
  raceSupers: number;
  raceStumbles: number;
  /** Server times of recent taps (newest last), for the tap rate on the phone. */
  recent: number[];
  /* whole match */
  points: number;
  wins: number;
  races: number;
  hops: number;
  onBeat: number;
  supers: number;
  stumbles: number;
  maxStreak: number;
}

export type MatchEvent =
  | { type: 'roster' }
  | { type: 'waiting' }
  | { type: 'countdown'; race: number; anchor: number }
  | { type: 'count'; value: number }
  | { type: 'go'; race: number }
  | { type: 'finish'; id: number; place: number; close: boolean }
  | { type: 'lastCall' }
  | { type: 'warning' }
  | { type: 'raceEnd'; race: number; winner: number | null; photo: boolean }
  | { type: 'standings'; race: number }
  | { type: 'matchEnd' }
  | { type: 'done' };

/** Result of one input frame. The same object is reused for every call; copy what you keep. */
export interface HopResult {
  playerId: number;
  kind: HopKind;
  /** Distance before and after the hop. */
  from: number;
  to: number;
  streak: number;
  /** Ms from the nearest beat (negative = early); NaN when not judged. */
  offset: number;
  /** This hop crossed the finish line. */
  finished: boolean;
}

const NO_EVENTS: readonly MatchEvent[] = [];
const RATE_WINDOW_MS = 2_000;
const RECENT_MAX = 12;

export function parseRounds(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return 3;
  return Math.min(9, Math.max(1, Math.round(n)));
}

/** Points for a place (1-based); a racer that never moved gets nothing. */
export function pointsFor(place: number, moved: boolean, table = DEFAULT_TUNING.points): number {
  if (!moved || table.length === 0) return 0;
  return table[Math.min(place, table.length) - 1] ?? 0;
}

export class KarungMatch {
  readonly tuning: Tuning;
  readonly totalRaces: number;

  phase: Phase = 'waiting';
  phaseStart = 0;
  /** Current (or just finished) race, 1-based. */
  race = 1;
  /** 3, 2, 1 during the countdown, 0 otherwise. */
  countValue = 0;
  /** Server time of beat 0 of the current race (the phones' ring start). */
  anchor = 0;
  /** Game time of beat 0. */
  countStart = 0;
  /** Game time the race started (the go beat). */
  raceStartT = 0;
  /** Server time of the go beat. */
  raceStartServer = 0;
  /** Game time the first racer crossed the line, null before that. */
  firstFinishT: number | null = null;
  /** Ids of the last finished race in finishing order. */
  lastOrder: number[] = [];
  lastPhoto = false;

  private t = 0;
  private server = 0;
  private simT = 0;
  private readonly racers = new Map<number, Racer>();
  private joinCounter = 0;
  private warned = false;
  private frozenElapsed = 0;
  private events: MatchEvent[] = [];
  private readonly result: HopResult = {
    playerId: 0,
    kind: 'none',
    from: 0,
    to: 0,
    streak: 0,
    offset: Number.NaN,
    finished: false,
  };

  constructor(opts: { rounds?: number; tuning?: Partial<Tuning> } = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...opts.tuning };
    this.totalRaces = parseRounds(opts.rounds ?? 3);
  }

  /* ------------------------------------------------------------------ players */

  /** Feed the full player list (connected or not) in join order. */
  setPlayers(players: readonly PlayerInfo[]): void {
    let changed = false;
    const seen = new Set<number>();
    for (const info of players) {
      seen.add(info.id);
      let r = this.racers.get(info.id);
      if (!r) {
        r = this.createRacer(info);
        this.racers.set(info.id, r);
        changed = true;
      } else if (r.gone) {
        r.gone = false;
        changed = true;
      }
      if (r.connected !== info.connected || r.name !== info.name || r.fruit !== info.fruit) changed = true;
      r.name = info.name;
      r.fruit = info.fruit;
      r.color = info.color;
      r.connected = info.connected;
    }
    for (const r of this.racers.values()) {
      if (!seen.has(r.id) && !r.gone) {
        r.gone = true;
        r.connected = false;
        changed = true;
      }
    }
    if (changed) this.emit({ type: 'roster' });
  }

  private createRacer(info: PlayerInfo): Racer {
    return {
      id: info.id,
      name: info.name,
      fruit: info.fruit,
      color: info.color,
      connected: info.connected,
      gone: false,
      joinIndex: this.joinCounter++,
      lane: null,
      lastTaps: -1,
      dist: 0,
      streak: 0,
      lastBeat: Number.NEGATIVE_INFINITY,
      lastTapAt: Number.NEGATIVE_INFINITY,
      lastTapBeat: Number.NEGATIVE_INFINITY,
      stumbleUntil: Number.NEGATIVE_INFINITY,
      finishAt: null,
      place: null,
      racePoints: 0,
      raceOnBeat: 0,
      raceSupers: 0,
      raceStumbles: 0,
      recent: [],
      points: 0,
      wins: 0,
      races: 0,
      hops: 0,
      onBeat: 0,
      supers: 0,
      stumbles: 0,
      maxStreak: 0,
    };
  }

  racer(id: number): Racer | undefined {
    const r = this.racers.get(id);
    return r && !r.gone ? r : undefined;
  }

  /** Everyone still in the room, in join order. */
  all(): Racer[] {
    return [...this.racers.values()].filter((r) => !r.gone).sort((a, b) => a.joinIndex - b.joinIndex);
  }

  /** Racers with a lane in the current race, top lane first. */
  field(): Racer[] {
    return this.all()
      .filter((r) => r.lane !== null)
      .sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0));
  }

  connectedCount(): number {
    let n = 0;
    for (const r of this.racers.values()) if (r.connected && !r.gone) n++;
    return n;
  }

  /* ------------------------------------------------------------------ time */

  get now(): number {
    return this.t;
  }

  /** Advance the simulation to game time `t` (server time `server` at that moment). */
  advance(t: number, server: number): void {
    if (t > this.t) this.t = t;
    this.server = server;
    const step = this.tuning.stepMs;
    while (this.simT + step <= this.t) {
      this.simT += step;
      this.step(this.simT);
    }
  }

  /** Server time at simulation time `now` (the sim may lag `t` by up to one step). */
  private serverAt(now: number): number {
    return this.server - (this.t - now);
  }

  private step(now: number): void {
    const tu = this.tuning;
    switch (this.phase) {
      case 'waiting':
        if (now >= tu.startDelayMs && this.connectedCount() >= 2) this.startCountdown(now);
        return;
      case 'countdown': {
        const k = Math.floor((now - this.countStart) / (tu.countBeats * tu.beatMs));
        const value = 3 - Math.max(0, k);
        if (value >= 1) {
          if (value !== this.countValue) {
            this.countValue = value;
            this.emit({ type: 'count', value });
          }
        } else {
          this.startRace(now);
        }
        return;
      }
      case 'race':
        this.checkRace(now);
        return;
      case 'raceEnd':
        if (now - this.phaseStart >= tu.raceEndMs) {
          this.setPhase('standings', now);
          this.emit({ type: 'standings', race: this.race });
        }
        return;
      case 'standings':
        if (now - this.phaseStart < tu.standingsMs) return;
        if (this.race >= this.totalRaces) {
          this.setPhase('matchEnd', now);
          this.emit({ type: 'matchEnd' });
        } else {
          this.race++;
          if (this.connectedCount() >= 2) this.startCountdown(now);
          else {
            this.setPhase('waiting', now);
            this.emit({ type: 'waiting' });
          }
        }
        return;
      case 'matchEnd':
        if (now - this.phaseStart >= tu.matchEndMs) {
          this.setPhase('done', now);
          this.emit({ type: 'done' });
        }
        return;
      case 'done':
        return;
    }
  }

  private setPhase(phase: Phase, now: number): void {
    this.phase = phase;
    this.phaseStart = now;
  }

  private startCountdown(now: number): void {
    const tu = this.tuning;
    this.setPhase('countdown', now);
    let lane = 0;
    for (const r of this.all()) {
      const racing = r.connected && lane < tu.maxRacers;
      r.lane = racing ? lane++ : null;
      r.dist = 0;
      r.streak = 0;
      r.lastBeat = Number.NEGATIVE_INFINITY;
      r.lastTapAt = Number.NEGATIVE_INFINITY;
      r.lastTapBeat = Number.NEGATIVE_INFINITY;
      r.stumbleUntil = Number.NEGATIVE_INFINITY;
      r.finishAt = null;
      r.place = null;
      r.racePoints = 0;
      r.raceOnBeat = 0;
      r.raceSupers = 0;
      r.raceStumbles = 0;
      r.recent.length = 0;
    }
    this.firstFinishT = null;
    this.warned = false;
    this.lastOrder = [];
    this.lastPhoto = false;
    this.countValue = 3;
    this.countStart = now + tu.musicLeadMs;
    this.anchor = Math.round(this.serverAt(now) + tu.musicLeadMs);
    this.raceStartServer = this.anchor + 3 * tu.countBeats * tu.beatMs;
    this.emit({ type: 'roster' });
    this.emit({ type: 'countdown', race: this.race, anchor: this.anchor });
    this.emit({ type: 'count', value: 3 });
  }

  /**
   * After a pause during the countdown the count no longer sits on the music's beat: start the
   * countdown over (the director restarts the music with it).
   */
  resync(t: number, server: number): void {
    this.advance(t, server);
    if (this.phase === 'countdown') this.startCountdown(this.simT);
  }

  private startRace(now: number): void {
    this.setPhase('race', now);
    this.raceStartT = now;
    this.countValue = 0;
    for (const r of this.field()) r.races++;
    this.emit({ type: 'go', race: this.race });
  }

  private checkRace(now: number): void {
    const tu = this.tuning;
    const elapsed = now - this.raceStartT;
    let racing = 0;
    let connected = 0;
    for (const r of this.racers.values()) {
      if (r.gone || r.lane === null || !r.connected) continue;
      connected++;
      if (r.finishAt === null) racing++;
    }
    const over =
      connected === 0 ||
      racing === 0 ||
      (this.firstFinishT !== null && now - this.firstFinishT >= tu.finishGraceMs) ||
      elapsed >= tu.raceMs;
    if (over) {
      this.endRace(now);
      return;
    }
    if (!this.warned && this.firstFinishT === null && elapsed >= tu.warningMs) {
      this.warned = true;
      this.emit({ type: 'warning' });
    }
  }

  /** Provisional order: finishers by crossing time, then the rest by distance. */
  order(): Racer[] {
    return this.field().sort((a, b) => {
      if (a.finishAt !== null || b.finishAt !== null) {
        if (a.finishAt === null) return 1;
        if (b.finishAt === null) return -1;
        return a.finishAt - b.finishAt || a.joinIndex - b.joinIndex;
      }
      return b.dist - a.dist || a.joinIndex - b.joinIndex;
    });
  }

  /** Live place (1-based) of a racer, 0 when not racing. */
  placeOf(id: number): number {
    const list = this.order();
    const i = list.findIndex((r) => r.id === id);
    return i < 0 ? 0 : i + 1;
  }

  private endRace(now: number): void {
    const tu = this.tuning;
    this.setPhase('raceEnd', now);
    this.frozenElapsed = now - this.raceStartT;
    const list = this.order();
    let place = 0;
    let prev: Racer | null = null;
    list.forEach((r, i) => {
      // Racers still on the track with the same distance share a place.
      const tied = prev !== null && prev.finishAt === null && r.finishAt === null && prev.dist === r.dist;
      if (!tied) place = i + 1;
      r.place = place;
      r.racePoints = pointsFor(place, r.dist > 0 || r.finishAt !== null, tu.points);
      r.points += r.racePoints;
      if (place === 1 && r.racePoints > 0) r.wins++;
      prev = r;
    });
    this.lastOrder = list.map((r) => r.id);
    const a = list[0];
    const b = list[1];
    this.lastPhoto =
      a !== undefined &&
      b !== undefined &&
      a.finishAt !== null &&
      b.finishAt !== null &&
      b.finishAt - a.finishAt <= tu.photoMs;
    const winner = a && a.racePoints > 0 ? a.id : null;
    this.emit({ type: 'raceEnd', race: this.race, winner, photo: this.lastPhoto });
  }

  /* ------------------------------------------------------------------ input */

  /** Taps that arrive while paused: keep the counter in sync but give them no effect. */
  absorb(id: number, taps: number): void {
    const r = this.racers.get(id);
    if (r) r.lastTaps = taps & 0xffff;
  }

  /** Beat index nearest to server time `at`, and how far from it the time is. */
  beatOf(at: number): { beat: number; offset: number } {
    const beat = Math.round((at - this.anchor) / this.tuning.beatMs);
    return { beat, offset: at - (this.anchor + beat * this.tuning.beatMs) };
  }

  /**
   * One input frame from a phone. `taps` is the phone's cumulative u16 counter, `atMs` the synced
   * server time of the tap. Returns a shared, reused result object.
   */
  input(id: number, taps: number, atMs: number, t: number, server: number): HopResult {
    this.advance(t, server);
    const tu = this.tuning;
    const res = this.result;
    res.playerId = id;
    res.kind = 'none';
    res.from = 0;
    res.to = 0;
    res.streak = 0;
    res.offset = Number.NaN;
    res.finished = false;
    const r = this.racers.get(id);
    if (!r || r.gone) return res;
    const counter = taps & 0xffff;
    const delta = r.lastTaps < 0 ? 1 : u16Delta(r.lastTaps, counter);
    r.lastTaps = counter;
    if (delta === 0 || delta > tu.resyncDelta) return res;
    if (this.phase !== 'race' || r.lane === null || r.finishAt !== null) return res;
    res.from = r.dist;
    res.to = r.dist;
    const lag = server - atMs;
    const trusted = lag <= tu.maxTapLagMs && lag >= -tu.maxTapLeadMs;
    const at = trusted ? atMs : server;
    // A false start before the go beat does nothing.
    if (at < this.raceStartServer - tu.beatWindowMs) return res;
    r.recent.push(at);
    if (r.recent.length > RECENT_MAX) r.recent.shift();
    const { beat, offset } = this.beatOf(at);
    const sinceLast = at - r.lastTapAt;
    const sameBeat = beat === r.lastTapBeat;
    if (at > r.lastTapAt) {
      r.lastTapAt = at;
      r.lastTapBeat = beat;
    }
    // Still on the ground after a tumble: taps only count toward the next mash check.
    if (at < r.stumbleUntil) return res;
    if (delta > 1 || sameBeat || sinceLast < tu.mashBeats * tu.beatMs) {
      r.stumbleUntil = at + tu.stumbleMs;
      r.streak = 0;
      r.raceStumbles++;
      r.stumbles++;
      res.kind = 'stumble';
      return res;
    }
    res.offset = offset;
    let hop: number;
    if (trusted && Math.abs(offset) <= tu.beatWindowMs) {
      r.streak = r.streak > 0 && r.lastBeat === beat - 1 ? r.streak + 1 : 1;
      r.lastBeat = beat;
      r.raceOnBeat++;
      r.onBeat++;
      if (r.streak > r.maxStreak) r.maxStreak = r.streak;
      if (r.streak % tu.superEvery === 0) {
        hop = tu.superHop;
        res.kind = 'super';
        r.raceSupers++;
        r.supers++;
      } else {
        hop = tu.longHop;
        res.kind = 'long';
      }
    } else {
      r.streak = 0;
      hop = tu.shortHop;
      res.kind = 'short';
    }
    r.hops++;
    const from = r.dist;
    r.dist = from + hop;
    res.from = from;
    res.to = r.dist;
    res.streak = r.streak;
    if (r.dist >= tu.trackLength) {
      // The exact moment the body crosses the line, partway through the hop's air time.
      r.finishAt = at + (tu.hopMs * (tu.trackLength - from)) / hop;
      res.finished = true;
      const ahead = this.order().filter((o) => o.finishAt !== null && o.id !== r.id);
      const place = ahead.filter((o) => (o.finishAt ?? 0) <= (r.finishAt ?? 0)).length + 1;
      const close = ahead.some((o) => Math.abs((o.finishAt ?? 0) - (r.finishAt ?? 0)) <= tu.photoMs);
      if (this.firstFinishT === null) {
        this.firstFinishT = this.t;
        if (this.connectedRacing() > 0) this.emit({ type: 'lastCall' });
      }
      this.emit({ type: 'finish', id: r.id, place, close });
    }
    return res;
  }

  private connectedRacing(): number {
    let n = 0;
    for (const r of this.racers.values())
      if (!r.gone && r.connected && r.lane !== null && r.finishAt === null) n++;
    return n;
  }

  /* ------------------------------------------------------------------ read-outs */

  /** Live on-beat streak: drops to 0 once a beat passes without an on-beat hop. */
  streakOf(id: number, server = this.server): number {
    const r = this.racers.get(id);
    if (!r || r.streak === 0 || this.phase !== 'race') return 0;
    const tu = this.tuning;
    const lastBeatAt = this.anchor + r.lastBeat * tu.beatMs;
    return server - lastBeatAt <= tu.beatMs + tu.beatWindowMs * 2 ? r.streak : 0;
  }

  stumbling(id: number, server = this.server): boolean {
    const r = this.racers.get(id);
    return !!r && this.phase === 'race' && server < r.stumbleUntil;
  }

  /** Taps per second over the last two seconds. */
  tapRate(id: number, server = this.server): number {
    const r = this.racers.get(id);
    if (!r) return 0;
    let n = 0;
    for (const at of r.recent) if (server - at <= RATE_WINDOW_MS) n++;
    return n / (RATE_WINDOW_MS / 1000);
  }

  /** Race clock (ms since the go beat); frozen after the race. */
  elapsed(): number {
    if (this.phase === 'race') return Math.max(0, this.t - this.raceStartT);
    if (this.phase === 'countdown' || this.phase === 'waiting') return 0;
    return this.frozenElapsed;
  }

  /** Ms left of the first-finisher grace, null when nobody has finished. */
  graceLeft(): number | null {
    if (this.phase !== 'race' || this.firstFinishT === null) return null;
    return Math.max(0, this.tuning.finishGraceMs - (this.t - this.firstFinishT));
  }

  /** Finish time of a racer in ms since the go beat. */
  finishTime(r: Racer): number | null {
    return r.finishAt === null ? null : r.finishAt - this.raceStartServer;
  }

  isFinalRace(): boolean {
    return this.race >= this.totalRaces;
  }

  /** Overall standings: points, then race wins, then join order. */
  standings(): Racer[] {
    return this.all()
      .filter((r) => r.races > 0 || r.lane !== null)
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.joinIndex - b.joinIndex);
  }

  /** Events since the last call, oldest first. */
  drainEvents(): readonly MatchEvent[] {
    if (this.events.length === 0) return NO_EVENTS;
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(e: MatchEvent): void {
    this.events.push(e);
  }
}

/* ------------------------------------------------------------------ results */

interface AwardRule {
  title: string;
  icon: GameAward['icon'];
  metric: (r: Racer) => number;
  desc: (r: Racer) => string;
}

/** One award per player where possible: each rule goes to its best candidate without one yet. */
export function pickAwards(match: KarungMatch): GameAward[] {
  const players = match.standings();
  const rules: AwardRule[] = [
    {
      title: STR.awardChampion,
      icon: 'crown',
      metric: (r) => r.wins,
      desc: (r) => STR.awardChampionDesc(r.wins),
    },
    {
      title: STR.awardRhythm,
      icon: 'target',
      metric: (r) => r.maxStreak,
      desc: (r) => STR.awardRhythmDesc(r.maxStreak),
    },
    {
      title: STR.awardSuper,
      icon: 'zap',
      metric: (r) => r.supers,
      desc: (r) => STR.awardSuperDesc(r.supers),
    },
    {
      title: STR.awardTumble,
      icon: 'heart',
      metric: (r) => r.stumbles,
      desc: (r) => STR.awardTumbleDesc(r.stumbles),
    },
  ];
  const taken = new Set<number>();
  const out: GameAward[] = [];
  for (const rule of rules) {
    const list = players
      .filter((r) => rule.metric(r) > 0)
      .sort((a, b) => rule.metric(b) - rule.metric(a) || a.joinIndex - b.joinIndex);
    const best = list[0];
    if (!best) continue;
    const pick = list.find((r) => !taken.has(r.id)) ?? best;
    taken.add(pick.id);
    out.push({ playerId: pick.id, title: rule.title, desc: rule.desc(pick), icon: rule.icon });
  }
  return out;
}

/** Final result for the shell: ranked by points, then race wins; equal records share a rank. */
export function buildResult(match: KarungMatch): GameResult {
  const list = match.standings();
  let rank = 0;
  const ranking = list.map((r, i) => {
    const prev = list[i - 1];
    if (!prev || prev.points !== r.points || prev.wins !== r.wins) rank = i + 1;
    return { playerId: r.id, score: r.points, rank, label: STR.resultLabel(r.points) };
  });
  const top = list[0];
  const shared = ranking.filter((x) => x.rank === 1).length > 1;
  return {
    title: !top ? STR.gameTitle : shared ? STR.resultTieTitle : STR.resultTitle(top.name),
    ...(top ? { subtitle: STR.resultSubtitleTop(top.points) } : {}),
    ranking,
    awards: pickAwards(match),
  };
}
