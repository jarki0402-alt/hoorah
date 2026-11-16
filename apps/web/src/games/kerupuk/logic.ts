/**
 * Makan Kerupuk rules. Pure and deterministic: no DOM, no Phaser, no wall clock, no randomness.
 * Every method takes the current game time explicitly (ms).
 *
 * Every player has a kerupuk hanging on a string in front of their face. It swings left and
 * right on its own phase: offset(t) = sin(2 pi (t - start) / period), -1..1. A GIGIT press
 * stamped (on the phone, in synced time) while |offset| is inside the zone takes a bite; a press
 * outside it makes the player choke for a moment. Each bite speeds the swing up and narrows the
 * zone. The first player to finish the kerupuk ends the round; otherwise the time cap does and
 * whoever ate most wins it.
 */

/* ------------------------------------------------------------------ Tuning */

/** Bites that finish one kerupuk. */
export const BITES = 7;
/** Full swing period (ms) of a whole kerupuk; each bite multiplies it by PERIOD_DECAY. */
export const BASE_PERIOD = 2200;
export const PERIOD_DECAY = 0.925;
/** Half-width of the bite zone as a fraction of the swing amplitude; shrinks per bite. */
export const BASE_ZONE = 0.38;
export const ZONE_STEP = 0.018;
/** Judged zone is this much wider than the drawn one (touch latency, fingers are not perfect). */
export const JUDGE_GRACE = 0.04;
/** Inside this fraction of the zone a bite counts as PAS (dead centre). */
export const PERFECT_FRAC = 0.4;
/** Lockout after a missed bite. */
export const CHOKE_MS = 1200;
/** Presses this soon after a bite are a double tap and are ignored. */
export const CHEW_MS = 220;
/** Press stamps older than this (relative to arrival) are clamped: a lagging or lying phone. */
export const MAX_LAG_MS = 700;

/** Round intro: banner, then the 3-2-1 countdown during the last COUNT_MS. */
export const INTRO_MS = 5000;
export const COUNT_MS = 3000;
/** Time cap of one round. */
export const ROUND_MS = 45_000;
/** "Ten seconds left" warning. */
export const WARN_MS = 10_000;
export const ROUND_END_MS = 5200;
export const FINALE_MS = 4200;

/** Points per round placement (1st, 2nd, ...). Nobody scores without a single bite. */
export const PLACE_POINTS = [5, 3, 2, 1] as const;

/**
 * Solo score attack (PRD 6.4): a lone player has nobody to race, so they chase a personal record
 * instead. Every bite scores, a PAS bite scores extra, and finishing the kerupuk early adds a bonus
 * for each second left on the clock (so choking costs time, and time costs points).
 */
export const SOLO_BITE = 100;
export const SOLO_PAS = 50;
export const SOLO_PER_SEC = 50;

/* ------------------------------------------------------------------ Types */

export interface Swing {
  /** Game time when the phase was 0 (kerupuk centred, moving right). */
  start: number;
  period: number;
}

export interface Lane {
  id: number;
  /** Slot on the main screen, left to right. */
  index: number;
  bites: number;
  swing: Swing;
  /** Presses handled this round (also ignored ones): lets the phone get a fresh button. */
  presses: number;
  /** Choking until this game time (only meaningful while `choking`). */
  chokeUntil: number;
  choking: boolean;
  /** Last accepted press stamp (keeps presses in order). */
  lastPressAt: number;
  /** Game time of the last bite (-Infinity before the first). */
  lastBiteAt: number;
  finishedAt: number | null;
}

export interface PlayerStats {
  id: number;
  score: number;
  /** Bites over the whole game. */
  bites: number;
  perfect: number;
  chokes: number;
  /** Rounds this player won (finished first, or ate most at the time cap). */
  wins: number;
  /** Fastest finish of a whole kerupuk (ms from the start of the round), or null. */
  bestTime: number | null;
  /** Solo time bonus summed over the finished kerupuk (see `finishBonus`). */
  timeBonus: number;
}

export interface Placement {
  id: number;
  rank: number;
  bites: number;
  points: number;
  finished: boolean;
}

export interface RoundEndInfo {
  round: number;
  reason: 'finish' | 'time';
  /** Who finished the kerupuk (reason 'finish'). */
  finisher: number | null;
  /** Ms from GIGIT to the finishing bite. */
  time: number | null;
  placements: Placement[];
  lastRound: boolean;
}

export type Phase = 'intro' | 'play' | 'roundEnd' | 'finale' | 'ended';

export type BiteOutcome = 'bite' | 'perfect' | 'finish' | 'choke' | 'ignored';

export type KerupukEvent =
  | { type: 'intro'; round: number }
  | { type: 'go'; round: number }
  | { type: 'bite'; id: number; bites: number; perfect: boolean; at: number }
  | { type: 'choke'; id: number; at: number; until: number }
  | { type: 'recover'; id: number }
  | { type: 'warn' }
  | { type: 'roundEnd'; info: RoundEndInfo }
  | { type: 'finale' }
  | { type: 'end' };

export interface RosterEntry {
  id: number;
  connected: boolean;
}

/* ------------------------------------------------------------------ Pure helpers */

export function swingPeriod(bites: number): number {
  return BASE_PERIOD * PERIOD_DECAY ** Math.max(0, Math.min(BITES, bites));
}

/** Drawn zone half-width for a kerupuk with `bites` taken. */
export function swingZone(bites: number): number {
  return BASE_ZONE - ZONE_STEP * Math.max(0, Math.min(BITES, bites));
}

/** Horizontal offset of the kerupuk, -1 (left) .. 1 (right). */
export function swingOffset(s: Swing, t: number): number {
  return Math.sin(((t - s.start) / s.period) * Math.PI * 2);
}

/** Same position at time t, new period: the kerupuk keeps moving smoothly when it speeds up. */
export function rephase(s: Swing, t: number, period: number): Swing {
  const cycles = (t - s.start) / s.period;
  const frac = cycles - Math.floor(cycles);
  return { start: t - frac * period, period };
}

export type Judgement = 'perfect' | 'bite' | 'miss';

export function judge(offset: number, bites: number): Judgement {
  const a = Math.abs(offset);
  const zone = swingZone(bites);
  if (a <= zone * PERFECT_FRAC) return 'perfect';
  if (a <= zone + JUDGE_GRACE) return 'bite';
  return 'miss';
}

/** Spread lanes' phases with the golden ratio so no two kerupuk swing together. */
export function phaseFraction(index: number, round: number): number {
  const v = index * 0.618034 + round * 0.293;
  return v - Math.floor(v);
}

/** Press time to judge: the phone's stamp, clamped to [now - MAX_LAG_MS, now]. */
export function pressTime(at: number, now: number): number {
  if (!Number.isFinite(at)) return now;
  return Math.min(now, Math.max(now - MAX_LAG_MS, at));
}

/**
 * Round ranking: finishers first (earliest), then most bites, then who reached that count first.
 * Players without a bite share the last rank and score nothing.
 */
export function placeLanes(lanes: readonly Lane[]): Placement[] {
  const rows = [...lanes].sort((a, b) => {
    const fa = a.finishedAt ?? Number.POSITIVE_INFINITY;
    const fb = b.finishedAt ?? Number.POSITIVE_INFINITY;
    if (fa !== fb) return fa - fb;
    if (a.bites !== b.bites) return b.bites - a.bites;
    if (a.lastBiteAt !== b.lastBiteAt) return a.lastBiteAt - b.lastBiteAt;
    return a.index - b.index;
  });
  const out: Placement[] = [];
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k]!;
    const prev = rows[k - 1];
    const tied =
      prev !== undefined &&
      prev.finishedAt === r.finishedAt &&
      prev.bites === r.bites &&
      prev.lastBiteAt === r.lastBiteAt;
    const rank = tied ? out[k - 1]!.rank : k + 1;
    const points = r.bites > 0 ? (PLACE_POINTS[rank - 1] ?? 0) : 0;
    out.push({ id: r.id, rank, bites: r.bites, points, finished: r.finishedAt !== null });
  }
  return out;
}

/** Solo bonus for a kerupuk finished `timeMs` after GIGIT: SOLO_PER_SEC per second left. */
export function finishBonus(timeMs: number): number {
  if (!Number.isFinite(timeMs)) return 0;
  return Math.max(0, Math.round(((ROUND_MS - timeMs) / 1000) * SOLO_PER_SEC));
}

/** A lone player's score over the whole game (the value kept as their record). */
export function soloScore(s: Pick<PlayerStats, 'bites' | 'perfect' | 'timeBonus'>): number {
  return s.bites * SOLO_BITE + s.perfect * SOLO_PAS + s.timeBonus;
}

/* ------------------------------------------------------------------ Clock */

/**
 * Game time = server time minus the time spent paused. Never runs backwards. Phones stamp
 * presses in server time; `toGame` maps them into game time.
 */
export class GameClock {
  private offset = 0;
  private pausedAt: number | null = null;
  private last = Number.NEGATIVE_INFINITY;

  constructor(private readonly server: () => number) {}

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  now(): number {
    const t = this.pausedAt ?? this.server() - this.offset;
    if (t < this.last) return this.last;
    this.last = t;
    return t;
  }

  pause(): void {
    if (this.pausedAt === null) this.pausedAt = this.now();
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.offset = this.server() - this.pausedAt;
    this.pausedAt = null;
  }

  toServer(t: number): number {
    return t + this.offset;
  }

  toGame(serverT: number): number {
    return serverT - this.offset;
  }
}

/* ------------------------------------------------------------------ Game */

export interface KerupukOptions {
  rounds: number;
  roster: readonly RosterEntry[];
  now: number;
}

export class KerupukLogic {
  readonly rounds: number;
  phase: Phase = 'intro';
  round = 1;
  /** Lanes of the current round, by slot. */
  lanes: Lane[] = [];
  /** When the countdown ends and biting starts. */
  goAt = 0;
  /** Time cap of the running round. */
  roundEndsAt = 0;
  /** End of the current timed phase (intro, roundEnd, finale). */
  phaseEndsAt = 0;
  lastRoundEnd: RoundEndInfo | null = null;
  /** Everyone who has played, in join order. */
  readonly order: number[] = [];
  readonly stats = new Map<number, PlayerStats>();

  private readonly connected = new Set<number>();
  private warned = false;
  private events: KerupukEvent[] = [];

  constructor(opts: KerupukOptions) {
    this.rounds = Math.max(1, Math.floor(opts.rounds));
    this.setRoster(opts.roster, opts.now);
    this.startRound(opts.now);
  }

  /* ---------------- queries */

  get participants(): number[] {
    return this.lanes.map((l) => l.id);
  }

  /** Exactly one person has played this game: score attack, no rivals (PRD 6.4). */
  get solo(): boolean {
    return this.order.length === 1;
  }

  lane(id: number): Lane | undefined {
    return this.lanes.find((l) => l.id === id);
  }

  isConnected(id: number): boolean {
    return this.connected.has(id);
  }

  /** Can this player bite right now? */
  canBite(id: number, now: number): boolean {
    const l = this.lane(id);
    return (
      this.phase === 'play' && l !== undefined && l.finishedAt === null && !(l.choking && now < l.chokeUntil)
    );
  }

  remainingMs(now: number): number {
    if (this.phase === 'play') return Math.max(0, this.roundEndsAt - now);
    if (this.phase === 'intro') return ROUND_MS;
    return 0;
  }

  drain(): KerupukEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ---------------- inputs */

  setRoster(roster: readonly RosterEntry[], _now: number): void {
    this.connected.clear();
    for (const r of roster) {
      if (!r.connected) continue;
      this.connected.add(r.id);
      if (!this.order.includes(r.id)) this.order.push(r.id);
      if (!this.stats.has(r.id)) {
        this.stats.set(r.id, {
          id: r.id,
          score: 0,
          bites: 0,
          perfect: 0,
          chokes: 0,
          wins: 0,
          bestTime: null,
          timeBonus: 0,
        });
      }
    }
    // Before the first bite of a round anyone new can still get a lane.
    if (this.phase === 'intro') this.buildLanes();
  }

  /**
   * A GIGIT press. `at` is the phone's press stamp in game time, `now` the arrival time.
   * The press is judged where the kerupuk was at `at` (both screens show the same synced swing).
   */
  bite(id: number, at: number, now: number): BiteOutcome {
    if (this.phase !== 'play') return 'ignored';
    const l = this.lane(id);
    if (!l || l.finishedAt !== null) return 'ignored';
    l.presses++;
    const t = pressTime(at, now);
    if (t < this.goAt) return 'ignored';
    if (l.choking && t < l.chokeUntil) return 'ignored';
    if (t < l.lastBiteAt + CHEW_MS || t < l.lastPressAt) return 'ignored';
    l.lastPressAt = t;
    const verdict = judge(swingOffset(l.swing, t), l.bites);
    const s = this.stats.get(id)!;
    if (verdict === 'miss') {
      l.choking = true;
      l.chokeUntil = t + CHOKE_MS;
      s.chokes++;
      this.emit({ type: 'choke', id, at: t, until: l.chokeUntil });
      return 'choke';
    }
    l.bites++;
    l.lastBiteAt = t;
    s.bites++;
    if (verdict === 'perfect') s.perfect++;
    l.swing = rephase(l.swing, t, swingPeriod(l.bites));
    this.emit({ type: 'bite', id, bites: l.bites, perfect: verdict === 'perfect', at: t });
    if (l.bites >= BITES) {
      l.finishedAt = t;
      const time = t - this.goAt;
      s.bestTime = s.bestTime === null ? time : Math.min(s.bestTime, time);
      s.timeBonus += finishBonus(time);
      this.endRound(now, 'finish', id, time);
      return 'finish';
    }
    return verdict === 'perfect' ? 'perfect' : 'bite';
  }

  /** Advance timers up to `now`. Safe to call as often as you like. */
  tick(now: number): void {
    for (let guard = 0; guard < 16; guard++) {
      if (!this.advance(now)) return;
    }
  }

  /* ---------------- internals */

  private emit(e: KerupukEvent): void {
    this.events.push(e);
  }

  private advance(now: number): boolean {
    switch (this.phase) {
      case 'intro':
        if (now < this.goAt) return false;
        this.phase = 'play';
        this.emit({ type: 'go', round: this.round });
        return true;
      case 'play': {
        for (const l of this.lanes) {
          if (l.choking && now >= l.chokeUntil) {
            l.choking = false;
            this.emit({ type: 'recover', id: l.id });
          }
        }
        if (!this.warned && now >= this.roundEndsAt - WARN_MS) {
          this.warned = true;
          this.emit({ type: 'warn' });
        }
        if (now < this.roundEndsAt) return false;
        this.endRound(this.roundEndsAt, 'time', null, null);
        return true;
      }
      case 'roundEnd':
        if (now < this.phaseEndsAt) return false;
        if (this.round < this.rounds) {
          this.round++;
          this.startRound(this.phaseEndsAt);
        } else {
          this.phase = 'finale';
          this.phaseEndsAt += FINALE_MS;
          this.emit({ type: 'finale' });
        }
        return true;
      case 'finale':
        if (now < this.phaseEndsAt) return false;
        this.phase = 'ended';
        this.emit({ type: 'end' });
        return true;
      case 'ended':
        return false;
    }
  }

  private startRound(at: number): void {
    this.phase = 'intro';
    this.goAt = at + INTRO_MS;
    this.roundEndsAt = this.goAt + ROUND_MS;
    this.phaseEndsAt = this.goAt;
    this.warned = false;
    this.buildLanes();
    this.emit({ type: 'intro', round: this.round });
  }

  /** Lanes for everyone connected plus earlier players who drop back in, in join order. */
  private buildLanes(): void {
    const ids = this.order.filter((id) => this.connected.has(id));
    this.lanes = ids.map((id, index) => {
      const period = swingPeriod(0);
      return {
        id,
        index,
        bites: 0,
        swing: { start: this.goAt - phaseFraction(index, this.round) * period, period },
        presses: 0,
        chokeUntil: 0,
        choking: false,
        lastPressAt: Number.NEGATIVE_INFINITY,
        lastBiteAt: Number.NEGATIVE_INFINITY,
        finishedAt: null,
      };
    });
  }

  private endRound(
    at: number,
    reason: 'finish' | 'time',
    finisher: number | null,
    time: number | null,
  ): void {
    for (const l of this.lanes) l.choking = false;
    const placements = placeLanes(this.lanes);
    for (const p of placements) {
      const s = this.stats.get(p.id)!;
      s.score += p.points;
      if (p.rank === 1 && p.bites > 0) s.wins++;
    }
    const info: RoundEndInfo = {
      round: this.round,
      reason,
      finisher,
      time,
      placements,
      lastRound: this.round >= this.rounds,
    };
    this.lastRoundEnd = info;
    this.phase = 'roundEnd';
    this.phaseEndsAt = at + ROUND_END_MS;
    this.emit({ type: 'roundEnd', info });
  }
}
