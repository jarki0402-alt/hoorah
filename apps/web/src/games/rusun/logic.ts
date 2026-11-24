/**
 * Rusun game rules. Pure and deterministic: no DOM, no Phaser, no wall clock, no randomness.
 * Every method takes the current game time explicitly (ms), so the same inputs always produce
 * the same tower. Skill is timing only.
 *
 * World units match the 1280x720 stage: ground at y = 680, each floor 50 high, the next floor
 * swings like a pendulum under the crane around x = 640, hanging just above the tower top. The
 * tower stands perfectly still; whether it stands is pure geometry.
 */
import { floorWidth, RUSUN } from '../../shared/art/rusun';
import { CONTROL_DEFAULTS, type RusunTuning } from '../../shared/controls';

/* ------------------------------------------------------------------ Tuning */

export const CENTER_X = 640;
export const GROUND_Y = 680;
export const FLOOR_H = RUSUN.floorHeight;

/** The hanging floor's center swings this far either side of CENTER_X. */
export const SWING_AMPLITUDE = 200;
/**
 * Swing timing (Lab Kontrol on the main screen device can override it, see controls.ts): about
 * 3.4 s there and back (1.7 s per side) at first, 1.5 % faster per placed floor, never under 2.4 s.
 * At 3400 ms the mid-swing speed is about 0.37 px/ms, at 2400 ms about 0.52 px/ms.
 */
export const SWING_DEFAULTS: Readonly<RusunTuning> = CONTROL_DEFAULTS.rusun;

export const TURN_MS = 8000;
/** Straight gravity drop from the hook to the tower top (the floor hangs just above it). */
export const FALL_MS = 260;
/** Pause after a landing before the next turn (crane fetches the next floor). */
export const SETTLE_MS = 900;
/** A miss: longer pause so the crash on the street registers. */
export const MISS_SETTLE_MS = 1400;
export const INTRO_MS = 2200;
/** How long the end of a round (collapse or skyscraper) is shown. */
export const COLLAPSE_MS = 5200;
export const FINALE_MS = 4500;

/** Presses stamped this long before the turn began belong to an earlier turn and are ignored. */
export const STALE_PRESS_MS = 150;

/**
 * Long-distance play (a far-away main screen watches): a phone there reaches this screen about
 * 0.2-0.45 s after the press. While far screens watch, a press is judged at its own stamp (where
 * both screens showed the floor at that server time, at most this far back), and a turn waits
 * this long after the ring empties before the floor drops by itself, so late presses still count.
 */
export const FAR_PRESS_MS = 600;

export const PAS_PX = 8;

/** Balance meter zones (ratio of load offset to the support's half-width). */
export const BALANCE_YELLOW = 0.5;
export const BALANCE_RED = 0.8;

/** This many misses by one player in one round and they bring the tower down. */
export const MAX_STRIKES = 3;
/** Hard cap: a tower this tall ends the round and everybody wins it. */
export const MAX_HEIGHT = 40;

export const POINTS_FLOOR = 1;
export const POINTS_PAS = 1;
export const SURVIVE_BONUS = 3;

/* ------------------------------------------------------------------ Types */

export interface Floor {
  /** Center x. Floors never move once placed. */
  x: number;
  width: number;
}

export interface Swing {
  /** Game time when the floor passed the center moving right (phase 0). */
  start: number;
  period: number;
}

export type BalanceZone = 'green' | 'yellow' | 'red';

export interface Balance {
  /** max over k of |COM above k - center k| / halfWidth k (0 = perfectly stacked, > 1 = topples). */
  ratio: number;
  /** Lowest floor whose load lies beyond its edge, with the side it tips to. */
  fail: { index: number; dir: 1 | -1 } | null;
}

export type Phase =
  | 'intro'
  | 'aim'
  | 'waiting'
  | 'falling'
  | 'settle'
  | 'collapse'
  | 'topped'
  | 'finale'
  | 'ended';

export type DropKind = 'land' | 'pas' | 'miss' | 'topple';
/** Geometry gave way, or a player's third miss in one round. */
export type CollapseReason = 'topple' | 'strikes';

export interface DropOutcome {
  kind: DropKind;
  /** Distance from the tower top center. */
  offset: number;
  /** Final x of the new floor: exactly where it was released. */
  x: number;
  /** Miss only: the floor touched the top's edge and tips off around it (else it falls clear). */
  tip: boolean;
  /** Tower balance after this drop (unchanged on a miss). */
  balance: number;
  points: number;
  /** Set when the new weight makes a floor's support give way. */
  collapse: { fromIndex: number; dir: 1 | -1 } | null;
}

export interface Fall {
  playerId: number;
  floorIndex: number;
  width: number;
  /** Game time the drop was judged at: startAt, or the press stamp in long-distance play. */
  at: number;
  /** When the floor was released (receipt time) and when it reaches the tower top. */
  startAt: number;
  landAt: number;
  /**
   * Floor position when released (fromX) and where it was judged (dropX). Equal unless a press
   * is judged at its stamp (long-distance play): then it glides to dropX while it falls.
   */
  fromX: number;
  dropX: number;
  auto: boolean;
  outcome: DropOutcome;
}

export interface CollapseInfo {
  playerId: number;
  reason: CollapseReason;
  /** 1-based number of the floor that was being placed. */
  floorNumber: number;
  /** Tower height (floors, warung included) just before the collapse. */
  height: number;
  /** Floors with index >= fromIndex topple around the edge of floor fromIndex - 1. */
  fromIndex: number;
  /** The dropped floor topples with them (false on a strike-out: it missed the tower). */
  dropped: boolean;
  dir: 1 | -1;
  at: number;
  round: number;
  lastRound: boolean;
}

/** The round ended because the tower hit MAX_HEIGHT: everybody wins it. */
export interface ToppedInfo {
  height: number;
  at: number;
  round: number;
  lastRound: boolean;
}

export interface PlayerStats {
  id: number;
  /** Floors landed over the whole game. */
  floors: number;
  pas: number;
  streak: number;
  bestStreak: number;
  score: number;
  collapses: number;
  /** Misses over the whole game. */
  misses: number;
}

export interface RosterEntry {
  id: number;
  connected: boolean;
}

export type RusunEvent =
  | { type: 'intro'; round: number; at: number }
  | { type: 'turn'; playerId: number; floorIndex: number; skipped: number | null }
  | { type: 'waiting'; skipped: number | null }
  | { type: 'drop'; fall: Fall }
  | {
      type: 'land';
      fall: Fall;
      pas: boolean;
      points: number;
      streak: number;
      /** Balance just crossed into the red zone. */
      enteredRed: boolean;
      newRecord: boolean;
    }
  | { type: 'miss'; fall: Fall; strikes: number }
  | { type: 'collapse'; info: CollapseInfo; fall: Fall }
  | { type: 'topped'; info: ToppedInfo }
  | { type: 'finale' }
  | { type: 'end' };

/* ------------------------------------------------------------------ Pure helpers */

export function balanceZone(ratio: number): BalanceZone {
  if (ratio >= BALANCE_RED) return 'red';
  if (ratio >= BALANCE_YELLOW) return 'yellow';
  return 'green';
}

/** Swing period (ms) while placing floor `floorIndex` (floor 1 is the first one players place). */
export function swingPeriod(floorIndex: number, tune: RusunTuning = SWING_DEFAULTS): number {
  const placed = Math.max(0, floorIndex - 1);
  const speedup = Math.min(0.5, Math.max(0, tune.speedup));
  const min = Math.max(1, tune.minPeriodMs);
  return Math.max(min, Math.max(min, tune.periodMs) * (1 - speedup) ** placed);
}

/**
 * Pendulum position (-1 left end … +1 right end) at cycle phase `u` (any real; 1 = one period):
 * a smooth sine, fastest over the center and easing into each end. Phase 0 is the center moving
 * right, 0.25 the right end, 0.75 the left end.
 */
export function swingPosition(u: number): number {
  return Math.sin(2 * Math.PI * u);
}

export function swingX(swing: Swing, t: number): number {
  return CENTER_X + SWING_AMPLITUDE * swingPosition((t - swing.start) / swing.period);
}

/**
 * Pure geometry: for every floor k, the center of mass (weight ~ width) of all floors above it,
 * compared with k's center. The tower topples at the lowest k whose load lies beyond its edge.
 */
export function analyzeBalance(floors: readonly Floor[]): Balance {
  let mass = 0;
  let moment = 0;
  let ratio = 0;
  let fail: Balance['fail'] = null;
  for (let k = floors.length - 2; k >= 0; k--) {
    const above = floors[k + 1]!;
    mass += above.width;
    moment += above.width * above.x;
    const base = floors[k]!;
    const lean = moment / mass - base.x;
    const r = Math.abs(lean) / (base.width / 2);
    ratio = Math.max(ratio, r);
    if (r > 1) fail = { index: k, dir: lean >= 0 ? 1 : -1 };
  }
  return { ratio, fail };
}

export function findUnstableFloor(floors: readonly Floor[]): Balance['fail'] {
  return analyzeBalance(floors).fail;
}

/**
 * Resolve a drop at `dropX` onto the current tower.
 * - Clear of the top: a miss that falls straight to the street.
 * - Center past the top's edge: a miss that tips off around that edge.
 * - Otherwise it lands exactly where it was dropped (PAS within PAS_PX); if the new weight puts
 *   any lower floor's load past its edge, the tower topples there.
 */
export function resolveDrop(floors: readonly Floor[], width: number, dropX: number): DropOutcome {
  const top = floors[floors.length - 1]!;
  const offset = dropX - top.x;
  const before = analyzeBalance(floors).ratio;
  if (Math.abs(offset) > top.width / 2) {
    return {
      kind: 'miss',
      offset,
      x: dropX,
      tip: Math.abs(offset) < top.width / 2 + width / 2,
      balance: before,
      points: 0,
      collapse: null,
    };
  }
  const pas = Math.abs(offset) <= PAS_PX;
  const x = dropX;
  const after = analyzeBalance([...floors, { x, width }]);
  if (after.fail) {
    return {
      kind: 'topple',
      offset,
      x,
      tip: false,
      balance: after.ratio,
      points: 0,
      collapse: { fromIndex: after.fail.index + 1, dir: after.fail.dir },
    };
  }
  return {
    kind: pas ? 'pas' : 'land',
    offset,
    x,
    tip: false,
    balance: after.ratio,
    points: POINTS_FLOOR + (pas ? POINTS_PAS : 0),
    collapse: null,
  };
}

/* ------------------------------------------------------------------ Clock */

/**
 * Game time = server time minus everything spent paused. Frozen while paused, monotonic.
 * Phones get server times (`toServer`) for deadlines.
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

  /** Server time minus game time (grows by every pause). */
  get offsetMs(): number {
    return this.offset;
  }

  /** Game time the clock froze at, or null while it runs. */
  get pausedAtMs(): number | null {
    return this.pausedAt;
  }

  toServer(t: number): number {
    return t + this.offset;
  }

  toGame(serverT: number): number {
    return serverT - this.offset;
  }
}

/* ------------------------------------------------------------------ Game */

export interface RusunOptions {
  rounds: number;
  roster: readonly RosterEntry[];
  now: number;
  /** Swing timing (the driver passes this device's Lab Kontrol values); defaults otherwise. */
  swing?: Partial<RusunTuning>;
}

export class RusunLogic {
  readonly rounds: number;
  phase: Phase = 'intro';
  round = 1;
  floors: Floor[] = [];
  /** Current balance ratio of the tower (see analyzeBalance). */
  balance = 0;
  /** Player whose turn it is (also the dropper while falling). */
  current: number | null = null;
  turnStartAt = 0;
  deadline = 0;
  swing: Swing = { start: 0, period: SWING_DEFAULTS.periodMs };
  /** Swing timing for this game. */
  readonly swingTune: RusunTuning;
  /** When the current timed phase (intro/settle/falling/collapse/topped/finale) ends. */
  phaseEndsAt = 0;
  fall: Fall | null = null;
  collapse: CollapseInfo | null = null;
  topped: ToppedInfo | null = null;
  /** Tallest tower this game (warung included). */
  bestHeight = 1;
  /**
   * 0 normally: a press lets go where the floor is when it arrives. While far-away screens watch
   * the driver sets FAR_PRESS_MS: presses are judged at their stamp (at most this far back) and a
   * turn drops by itself this long after its deadline.
   */
  pressWindowMs = 0;
  /** Join order of everyone who has been in the game. */
  readonly order: number[] = [];
  readonly stats = new Map<number, PlayerStats>();

  private readonly connected = new Set<number>();
  /** Misses per player in the current round. */
  private readonly strikes = new Map<number, number>();
  private roster: number[] = [];
  private turns = 0;
  private lastTurnPlayer: number | null = null;
  private events: RusunEvent[] = [];

  constructor(opts: RusunOptions) {
    this.rounds = Math.max(1, Math.floor(opts.rounds));
    this.swingTune = { ...SWING_DEFAULTS, ...opts.swing };
    this.setRoster(opts.roster, opts.now);
    this.startRound(opts.now, true);
  }

  /* ---------------- queries */

  get height(): number {
    return this.floors.length;
  }

  /** Index of the floor on the crane (or being placed). */
  get floorIndex(): number {
    return this.floors.length;
  }

  get top(): Floor {
    return this.floors[this.floors.length - 1]!;
  }

  get solo(): boolean {
    return this.roster.length <= 1;
  }

  isConnected(id: number): boolean {
    return this.connected.has(id);
  }

  /** Players currently holding a slot, in join order. */
  get participants(): number[] {
    return this.order.filter((id) => this.roster.includes(id));
  }

  /** Where the hanging floor's center is at game time `t`. */
  swingX(t: number): number {
    return swingX(this.swing, t);
  }

  /** Strikes (misses) the player has in the current round. */
  strikesOf(id: number): number {
    return this.strikes.get(id) ?? 0;
  }

  remainingMs(now: number): number {
    return this.phase === 'aim' ? Math.max(0, this.deadline - now) : 0;
  }

  /** Who goes after `after` (or first in join order), skipping disconnected players. */
  nextPlayer(after: number | null): number | null {
    const n = this.order.length;
    if (!n) return null;
    const start = after === null ? 0 : this.order.indexOf(after) + 1;
    for (let i = 0; i < n; i++) {
      const id = this.order[(start + i) % n]!;
      if (this.connected.has(id) && this.roster.includes(id)) return id;
    }
    return null;
  }

  /** Whose turn it is, or who goes next while the crane fetches a floor. */
  upcoming(): number | null {
    switch (this.phase) {
      case 'aim':
      case 'falling':
        return this.current;
      case 'intro':
      case 'settle':
        return this.nextPlayer(this.lastTurnPlayer);
      default:
        return null;
    }
  }

  drain(): RusunEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ---------------- inputs */

  setRoster(roster: readonly RosterEntry[], now: number): void {
    this.roster = roster.map((r) => r.id);
    this.connected.clear();
    for (const r of roster) {
      if (!this.order.includes(r.id)) this.order.push(r.id);
      if (!this.stats.has(r.id)) {
        this.stats.set(r.id, {
          id: r.id,
          floors: 0,
          pas: 0,
          streak: 0,
          bestStreak: 0,
          score: 0,
          collapses: 0,
          misses: 0,
        });
      }
      if (r.connected) this.connected.add(r.id);
    }
    if (this.phase === 'aim' && this.current !== null && !this.connected.has(this.current)) {
      const skipped = this.current;
      this.beginTurn(now, this.nextPlayer(skipped), skipped);
    } else if (this.phase === 'waiting') {
      const next = this.nextPlayer(this.lastTurnPlayer);
      if (next !== null) this.beginTurn(now, next, null);
    }
  }

  /**
   * A JATUHKAN press. `at` is the phone's press time in game time; it filters out presses meant
   * for an earlier turn. Normally the floor lets go where it is on the main screen right now and
   * falls straight down: no rewinding to the press time, so it never jumps sideways. With a
   * press window (long-distance play) it is judged where it was at the stamp, never earlier than
   * the turn start or the window, never later than now, and glides there while falling.
   */
  drop(playerId: number, at: number, now: number): boolean {
    if (this.phase !== 'aim' || playerId !== this.current) return false;
    const pressedAt = Number.isFinite(at) ? at : now;
    if (pressedAt < this.turnStartAt - STALE_PRESS_MS) return false;
    this.release(this.judgedAt(pressedAt, now), now, false);
    return true;
  }

  /** Game time a press stamped `pressedAt` and received at `now` is judged at. */
  judgedAt(pressedAt: number, now: number): number {
    const win = this.pressWindow;
    if (win <= 0) return now;
    return Math.min(now, Math.max(pressedAt, this.turnStartAt, now - win));
  }

  /** When the current turn's floor drops by itself (the deadline plus any press window). */
  get autoDropAt(): number {
    return this.deadline + this.pressWindow;
  }

  private get pressWindow(): number {
    const w = this.pressWindowMs;
    return Number.isFinite(w) ? Math.max(0, Math.min(FAR_PRESS_MS, w)) : 0;
  }

  /** Advance timers up to `now`. Safe to call as often as you like. */
  tick(now: number): void {
    for (let guard = 0; guard < 16; guard++) {
      if (!this.advance(now)) return;
    }
  }

  /* ---------------- internals */

  private emit(e: RusunEvent): void {
    this.events.push(e);
  }

  private advance(now: number): boolean {
    switch (this.phase) {
      case 'intro':
      case 'settle':
        if (now < this.phaseEndsAt) return false;
        this.beginTurn(this.phaseEndsAt, this.nextPlayer(this.lastTurnPlayer), null);
        return true;
      case 'aim': {
        const end = this.autoDropAt;
        if (now < end) return false;
        this.release(end, end, true);
        return true;
      }
      case 'falling':
        if (now < this.phaseEndsAt) return false;
        this.land();
        return true;
      case 'collapse':
      case 'topped':
        if (now < this.phaseEndsAt) return false;
        if (this.round < this.rounds) {
          this.round++;
          this.startRound(this.phaseEndsAt, false);
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
      default:
        return false;
    }
  }

  private startRound(at: number, first: boolean): void {
    this.floors = [{ x: CENTER_X, width: floorWidth(0) }];
    this.balance = 0;
    this.fall = null;
    this.strikes.clear();
    if (!first) {
      this.collapse = null;
      this.topped = null;
    }
    this.current = null;
    this.phase = 'intro';
    this.phaseEndsAt = at + INTRO_MS;
    this.prepareSwing(this.phaseEndsAt);
    this.emit({ type: 'intro', round: this.round, at });
  }

  /** Set up the swing for the next turn so it starts at an end (alternating sides). */
  private prepareSwing(turnAt: number): void {
    const period = swingPeriod(this.floors.length, this.swingTune);
    const fromRight = this.turns % 2 === 0;
    this.swing = { start: turnAt - period * (fromRight ? 0.25 : 0.75), period };
  }

  private beginTurn(at: number, playerId: number | null, skipped: number | null): void {
    if (playerId === null) {
      this.current = null;
      this.phase = 'waiting';
      this.emit({ type: 'waiting', skipped });
      return;
    }
    this.current = playerId;
    this.turnStartAt = at;
    this.deadline = at + TURN_MS;
    this.phase = 'aim';
    this.turns++;
    this.emit({ type: 'turn', playerId, floorIndex: this.floors.length, skipped });
  }

  private release(evalAt: number, startAt: number, auto: boolean): void {
    const playerId = this.current!;
    const index = this.floors.length;
    const width = floorWidth(index);
    const dropX = this.swingX(evalAt);
    const landAt = startAt + FALL_MS;
    this.fall = {
      playerId,
      floorIndex: index,
      width,
      at: evalAt,
      startAt,
      landAt,
      fromX: this.swingX(startAt),
      dropX,
      auto,
      outcome: resolveDrop(this.floors, width, dropX),
    };
    this.phase = 'falling';
    this.phaseEndsAt = landAt;
    this.emit({ type: 'drop', fall: this.fall });
  }

  private land(): void {
    const fall = this.fall!;
    const o = fall.outcome;
    const s = this.stats.get(fall.playerId)!;
    this.lastTurnPlayer = fall.playerId;
    if (o.kind === 'miss') {
      s.misses++;
      s.streak = 0;
      const strikes = this.strikesOf(fall.playerId) + 1;
      this.strikes.set(fall.playerId, strikes);
      this.emit({ type: 'miss', fall, strikes });
      if (strikes >= MAX_STRIKES) {
        const n = this.floors.length;
        this.collapseTower(fall, 'strikes', Math.max(1, Math.ceil(n * 0.45)), o.offset >= 0 ? 1 : -1, false);
        return;
      }
      this.phase = 'settle';
      this.phaseEndsAt = fall.landAt + MISS_SETTLE_MS;
      this.prepareSwing(this.phaseEndsAt);
      return;
    }
    if (o.collapse) {
      this.floors.push({ x: o.x, width: fall.width });
      this.balance = o.balance;
      this.collapseTower(fall, 'topple', o.collapse.fromIndex, o.collapse.dir, true);
      return;
    }
    const pas = o.kind === 'pas';
    this.floors.push({ x: o.x, width: fall.width });
    s.floors++;
    s.score += o.points;
    if (pas) {
      s.pas++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
    } else {
      s.streak = 0;
    }
    const enteredRed = balanceZone(this.balance) !== 'red' && balanceZone(o.balance) === 'red';
    this.balance = o.balance;
    const newRecord = this.floors.length > this.bestHeight;
    this.bestHeight = Math.max(this.bestHeight, this.floors.length);
    this.emit({ type: 'land', fall, pas, points: o.points, streak: s.streak, enteredRed, newRecord });
    if (this.floors.length >= MAX_HEIGHT) {
      // Skyscraper: nobody brought it down, so everybody wins the round.
      for (const id of this.roster) this.stats.get(id)!.score += SURVIVE_BONUS;
      this.topped = {
        height: this.floors.length,
        at: fall.landAt,
        round: this.round,
        lastRound: this.round >= this.rounds,
      };
      this.current = null;
      this.phase = 'topped';
      this.phaseEndsAt = fall.landAt + COLLAPSE_MS;
      this.emit({ type: 'topped', info: this.topped });
      return;
    }
    this.phase = 'settle';
    this.phaseEndsAt = fall.landAt + SETTLE_MS;
    this.prepareSwing(this.phaseEndsAt);
  }

  /** Floors >= fromIndex topple off; the dropped floor (if it landed) was pushed already. */
  private collapseTower(
    fall: Fall,
    reason: CollapseReason,
    fromIndex: number,
    dir: 1 | -1,
    dropped: boolean,
  ): void {
    const s = this.stats.get(fall.playerId)!;
    const height = dropped ? this.floors.length - 1 : this.floors.length;
    const info: CollapseInfo = {
      playerId: fall.playerId,
      reason,
      floorNumber: fall.floorIndex + 1,
      height,
      fromIndex,
      dropped,
      dir,
      at: fall.landAt,
      round: this.round,
      lastRound: this.round >= this.rounds,
    };
    s.collapses++;
    s.streak = 0;
    for (const id of this.roster) {
      if (id !== fall.playerId) this.stats.get(id)!.score += SURVIVE_BONUS;
    }
    this.floors = this.floors.slice(0, Math.min(this.floors.length, fromIndex));
    // The meter shows the tower gave way.
    this.balance = Math.max(1, this.balance);
    this.collapse = info;
    this.current = null;
    this.phase = 'collapse';
    this.phaseEndsAt = fall.landAt + COLLAPSE_MS;
    this.emit({ type: 'collapse', info, fall });
  }
}
