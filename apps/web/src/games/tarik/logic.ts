/**
 * Tarik Tambang rules: teams, tap accounting, force, rope position, super-pull timing, rounds
 * and scoring. Pure and deterministic: no DOM, no Phaser, no wall clock. Every method that
 * depends on time takes it explicitly:
 *   - `t`      game time in ms (frozen while paused), drives physics and phases;
 *   - `server` synced server time in ms, only used for the super-pull ring that phones also draw.
 */
import { type Fruit, type PlayerInfo, u16Delta } from '@hoorah/protocol';
import type { GameAward, GameResult } from '@hoorah/sdk';
import { formatRate, STR } from './strings';

export type Team = 'red' | 'blue';
export const TEAMS: readonly Team[] = ['red', 'blue'];
export const otherTeam = (t: Team): Team => (t === 'red' ? 'blue' : 'red');

export type Phase = 'waiting' | 'countdown' | 'pull' | 'roundEnd' | 'scoreboard' | 'matchEnd' | 'done';
export type RoundReason = 'line' | 'time' | 'draw';

export interface Tuning {
  /** Simulation step. Physics is integrated in fixed steps so results never depend on frame rate. */
  stepMs: number;
  /** Delay after the game becomes ready before the first countdown. */
  startDelayMs: number;
  countStepMs: number;
  roundMs: number;
  warningMs: number;
  suddenDeathMs: number;
  /** During sudden death the first side to lead by this much wins at once. */
  suddenDeathLead: number;
  tieEpsilon: number;
  roundEndMs: number;
  scoreboardMs: number;
  matchEndMs: number;
  /** Rope speed per unit of tap-rate difference (rope units per second per tap/s). */
  pullGain: number;
  /** Mild pull back toward the center, per second. Keeps evenly matched teams near 0. */
  damping: number;
  bucketMs: number;
  windowBuckets: number;
  /** Taps above this per-player rate are ignored (auto-clicker guard). */
  maxTapsPerSecond: number;
  /** A counter jump larger than this is treated as a resync (phone reload), not as taps. */
  resyncDelta: number;
  ringPeriodMs: number;
  superWindowMs: number;
  /** A super must be a deliberate tap: no tap from that player in this span before the window. */
  superQuietMs: number;
  superBonusTaps: number;
  /** How long after a cycle's window we wait for late frames before a combo counts as broken. */
  superGraceMs: number;
  /** Accepted gap between a tap's own timestamp and its arrival (clock skew + latency). */
  maxTapLagMs: number;
  maxTapLeadMs: number;
}

/**
 * pullGain/damping: with a steady 2.1 taps/s advantage (7 vs 9.1, i.e. 30 % stronger) the rope
 * approaches 2.3 and crosses 1 after ~15 s (12-20 s target). 10 % stronger never reaches the
 * line on its own (equilibrium 0.74), so the clock decides close rounds.
 */
export const DEFAULT_TUNING: Tuning = {
  stepMs: 10,
  startDelayMs: 600,
  countStepMs: 900,
  roundMs: 45_000,
  warningMs: 35_000,
  suddenDeathMs: 10_000,
  suddenDeathLead: 0.1,
  tieEpsilon: 0.01,
  roundEndMs: 2_000,
  scoreboardMs: 3_000,
  matchEndMs: 3_500,
  pullGain: 0.0422,
  damping: 0.04,
  bucketMs: 50,
  windowBuckets: 20,
  maxTapsPerSecond: 16,
  resyncDelta: 20,
  ringPeriodMs: 1600,
  superWindowMs: 90,
  superQuietMs: 200,
  superBonusTaps: 6,
  superGraceMs: 400,
  maxTapLagMs: 2_000,
  maxTapLeadMs: 300,
};

/** Sliding sum over the last `buckets * bucketMs` ms, in fixed buckets so it never allocates. */
export class RateWindow {
  private readonly buckets: Float64Array;
  private head = Number.NEGATIVE_INFINITY;
  private total = 0;

  constructor(
    private readonly bucketMs = 50,
    count = 20,
  ) {
    this.buckets = new Float64Array(count);
  }

  private roll(t: number): void {
    const b = Math.floor(t / this.bucketMs);
    if (b <= this.head) return;
    const n = this.buckets.length;
    if (b - this.head >= n) {
      this.buckets.fill(0);
      this.total = 0;
    } else {
      for (let i = this.head + 1; i <= b; i++) {
        const k = ((i % n) + n) % n;
        this.total -= this.buckets[k]!;
        this.buckets[k] = 0;
      }
    }
    this.head = b;
  }

  add(t: number, weight: number): void {
    this.roll(t);
    const n = this.buckets.length;
    const k = ((this.head % n) + n) % n;
    this.buckets[k]! += weight;
    this.total += weight;
  }

  sum(t: number): number {
    this.roll(t);
    return Math.max(0, this.total);
  }

  reset(): void {
    this.buckets.fill(0);
    this.total = 0;
    this.head = Number.NEGATIVE_INFINITY;
  }
}

export interface Member {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  connected: boolean;
  /** No longer in the room's player list. */
  gone: boolean;
  joinIndex: number;
  team: Team | null;
  /** Last cumulative u16 tap counter seen, -1 before the first frame. */
  lastTaps: number;
  /** Server time of this player's latest tap. */
  lastTapAt: number;
  rate: RateWindow;
  lastSuperCycle: number;
  combo: number;
  taps: number;
  supers: number;
  maxCombo: number;
  roundTaps: number;
  roundSupers: number;
  /** Best per-round average tap rate (taps/s). */
  bestRate: number;
}

export type MatchEvent =
  | { type: 'teams' }
  | { type: 'waiting' }
  | { type: 'countdown'; round: number }
  | { type: 'count'; value: number }
  | { type: 'go'; round: number; ringStart: number }
  | { type: 'warning' }
  | { type: 'suddenDeath' }
  | { type: 'roundEnd'; round: number; winner: Team | null; reason: RoundReason }
  | { type: 'scoreboard'; round: number }
  | { type: 'matchEnd'; winner: Team }
  | { type: 'done' };

/** Result of one input frame. The same object is reused for every call; copy what you keep. */
export interface TapResult {
  playerId: number;
  team: Team | null;
  counted: number;
  super: boolean;
  combo: number;
}

const NO_EVENTS: readonly MatchEvent[] = [];

export function parseRounds(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return 3;
  return Math.min(9, Math.max(1, Math.round(n)));
}

export class TarikMatch {
  readonly tuning: Tuning;
  readonly totalRounds: number;
  readonly winsNeeded: number;

  phase: Phase = 'waiting';
  phaseStart = 0;
  /** Current (or just finished) round, 1-based. */
  round = 1;
  readonly wins: Record<Team, number> = { red: 0, blue: 0 };
  /** Winner of every finished round in order; null = drawn round that was replayed. */
  readonly history: (Team | null)[] = [];
  /** Rope position in [-1, 1]. Negative = toward Merah. */
  p = 0;
  pullStart = 0;
  /** Server time when the current round's pull started; ring cycles end at ringStart + n * period. */
  ringStart = 0;
  suddenDeath = false;
  /** 3, 2, 1 during the countdown, 0 otherwise. */
  countValue = 0;
  lastWinner: Team | null = null;
  lastReason: RoundReason = 'line';
  matchWinner: Team | null = null;

  private t = 0;
  private server = 0;
  private simT = 0;
  private readonly members = new Map<number, Member>();
  private joinCounter = 0;
  private teamsAssigned = false;
  private warned = false;
  /** Round clock as it stood when the last round ended (shown between rounds). */
  private frozenLeft = 0;
  private readonly force: Record<Team, RateWindow>;
  private readonly real: Record<Team, RateWindow>;
  private events: MatchEvent[] = [];
  private readonly result: TapResult = { playerId: 0, team: null, counted: 0, super: false, combo: 0 };

  constructor(opts: { rounds?: number; tuning?: Partial<Tuning> } = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...opts.tuning };
    this.totalRounds = parseRounds(opts.rounds ?? 3);
    this.winsNeeded = Math.floor(this.totalRounds / 2) + 1;
    const w = () => new RateWindow(this.tuning.bucketMs, this.tuning.windowBuckets);
    this.force = { red: w(), blue: w() };
    this.real = { red: w(), blue: w() };
  }

  /* ------------------------------------------------------------------ players & teams */

  /** Feed the full player list (connected or not) in join order. */
  setPlayers(players: readonly PlayerInfo[]): void {
    let changed = false;
    const seen = new Set<number>();
    for (const info of players) {
      seen.add(info.id);
      let m = this.members.get(info.id);
      if (!m) {
        m = this.createMember(info);
        this.members.set(info.id, m);
        changed = true;
      } else if (m.gone) {
        m.gone = false;
        changed = true;
      }
      if (m.connected !== info.connected || m.name !== info.name || m.fruit !== info.fruit) changed = true;
      m.name = info.name;
      m.fruit = info.fruit;
      m.color = info.color;
      m.connected = info.connected;
      if (this.teamsAssigned && m.team === null && m.connected) {
        m.team = this.latecomerTeam(m);
        changed = true;
      }
    }
    for (const m of this.members.values()) {
      if (!seen.has(m.id) && !m.gone) {
        m.gone = true;
        m.connected = false;
        changed = true;
      }
    }
    if (changed) this.emit({ type: 'teams' });
  }

  private createMember(info: PlayerInfo): Member {
    return {
      id: info.id,
      name: info.name,
      fruit: info.fruit,
      color: info.color,
      connected: info.connected,
      gone: false,
      joinIndex: this.joinCounter++,
      team: null,
      lastTaps: -1,
      lastTapAt: Number.NEGATIVE_INFINITY,
      rate: new RateWindow(this.tuning.bucketMs, this.tuning.windowBuckets),
      lastSuperCycle: -10,
      combo: 0,
      taps: 0,
      supers: 0,
      maxCombo: 0,
      roundTaps: 0,
      roundSupers: 0,
      bestRate: 0,
    };
  }

  member(id: number): Member | undefined {
    const m = this.members.get(id);
    return m && !m.gone ? m : undefined;
  }

  /** Members still in the room, in join order. */
  allMembers(): Member[] {
    return [...this.members.values()].filter((m) => !m.gone).sort((a, b) => a.joinIndex - b.joinIndex);
  }

  /** Team members in drawing order: connected first (front of the rope), then by join order. */
  roster(team: Team): Member[] {
    return this.allMembers()
      .filter((m) => m.team === team)
      .sort((a, b) => Number(b.connected) - Number(a.connected) || a.joinIndex - b.joinIndex);
  }

  connectedCount(team?: Team): number {
    let n = 0;
    for (const m of this.members.values()) {
      if (m.connected && !m.gone && (team === undefined || m.team === team)) n++;
    }
    return n;
  }

  /** Divisor for team force: connected members, at least 1, so uneven teams stay fair. */
  teamSize(team: Team): number {
    return Math.max(1, this.connectedCount(team));
  }

  private assignTeams(): void {
    let i = 0;
    for (const m of this.allMembers()) {
      if (!m.connected) continue;
      m.team = i % 2 === 0 ? 'red' : 'blue';
      i++;
    }
    this.teamsAssigned = true;
    this.emit({ type: 'teams' });
  }

  private latecomerTeam(m: Member): Team {
    const red = this.connectedCount('red') - (m.team === 'red' && m.connected ? 1 : 0);
    const blue = this.connectedCount('blue') - (m.team === 'blue' && m.connected ? 1 : 0);
    if (red !== blue) return red < blue ? 'red' : 'blue';
    return m.joinIndex % 2 === 0 ? 'red' : 'blue';
  }

  /** Between rounds only: move the latest joiner from a team that is 2+ players bigger. */
  private rebalance(): void {
    let moved = false;
    for (;;) {
      const red = this.connectedCount('red');
      const blue = this.connectedCount('blue');
      if (Math.abs(red - blue) < 2) break;
      const big: Team = red > blue ? 'red' : 'blue';
      let pick: Member | undefined;
      for (const m of this.members.values()) {
        if (m.team === big && m.connected && !m.gone && (!pick || m.joinIndex > pick.joinIndex)) pick = m;
      }
      if (!pick) break;
      pick.team = otherTeam(big);
      moved = true;
    }
    if (moved) this.emit({ type: 'teams' });
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

  private step(now: number): void {
    const tu = this.tuning;
    switch (this.phase) {
      case 'waiting':
        if (now >= tu.startDelayMs && this.connectedCount() >= 2) {
          if (this.teamsAssigned) this.rebalance();
          else this.assignTeams();
          this.startCountdown(now);
        }
        return;
      case 'countdown': {
        const value = 3 - Math.floor((now - this.phaseStart) / tu.countStepMs);
        if (value === this.countValue) return;
        if (value >= 1) {
          this.countValue = value;
          this.emit({ type: 'count', value });
        } else {
          this.startPull(now);
        }
        return;
      }
      case 'pull':
        this.physics(now);
        return;
      case 'roundEnd':
        if (now - this.phaseStart < tu.roundEndMs) return;
        if (this.matchWinner) {
          this.setPhase('matchEnd', now);
          this.emit({ type: 'matchEnd', winner: this.matchWinner });
        } else {
          this.setPhase('scoreboard', now);
          this.emit({ type: 'scoreboard', round: this.round });
        }
        return;
      case 'scoreboard':
        if (now - this.phaseStart >= tu.scoreboardMs) this.nextRound(now);
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
    this.setPhase('countdown', now);
    this.p = 0;
    this.suddenDeath = false;
    this.countValue = 3;
    for (const team of TEAMS) {
      this.force[team].reset();
      this.real[team].reset();
    }
    for (const m of this.members.values()) {
      m.roundTaps = 0;
      m.roundSupers = 0;
      m.combo = 0;
      m.lastSuperCycle = -10;
      m.rate.reset();
    }
    this.emit({ type: 'countdown', round: this.round });
    this.emit({ type: 'count', value: 3 });
  }

  private startPull(now: number): void {
    this.setPhase('pull', now);
    this.pullStart = now;
    this.countValue = 0;
    this.warned = false;
    this.ringStart = Math.round(this.server - (this.t - now));
    this.emit({ type: 'go', round: this.round, ringStart: this.ringStart });
  }

  private physics(now: number): void {
    const tu = this.tuning;
    const red = this.force.red.sum(now) / this.teamSize('red');
    const blue = this.force.blue.sum(now) / this.teamSize('blue');
    this.p += (tu.pullGain * (blue - red) - tu.damping * this.p) * (tu.stepMs / 1000);
    if (this.p <= -1 || this.p >= 1) {
      this.p = this.p < 0 ? -1 : 1;
      this.endRound(this.p < 0 ? 'red' : 'blue', 'line', now);
      return;
    }
    const elapsed = now - this.pullStart;
    if (!this.warned && elapsed >= tu.warningMs) {
      this.warned = true;
      this.emit({ type: 'warning' });
    }
    if (!this.suddenDeath) {
      if (elapsed < tu.roundMs) return;
      if (Math.abs(this.p) > tu.tieEpsilon) {
        this.endRound(this.p < 0 ? 'red' : 'blue', 'time', now);
      } else {
        this.suddenDeath = true;
        this.emit({ type: 'suddenDeath' });
      }
      return;
    }
    if (Math.abs(this.p) >= tu.suddenDeathLead) {
      this.endRound(this.p < 0 ? 'red' : 'blue', 'time', now);
    } else if (elapsed >= tu.roundMs + tu.suddenDeathMs) {
      if (this.p !== 0) {
        this.endRound(this.p < 0 ? 'red' : 'blue', 'time', now);
      } else {
        const red = this.roundTaps('red');
        const blue = this.roundTaps('blue');
        if (red === blue) this.endRound(null, 'draw', now);
        else this.endRound(red > blue ? 'red' : 'blue', 'time', now);
      }
    }
  }

  private endRound(winner: Team | null, reason: RoundReason, now: number): void {
    this.setPhase('roundEnd', now);
    this.frozenLeft = this.clockLeft(now);
    const seconds = Math.max(1, (now - this.pullStart) / 1000);
    for (const m of this.members.values()) {
      if (m.team) m.bestRate = Math.max(m.bestRate, m.roundTaps / seconds);
    }
    this.lastWinner = winner;
    this.lastReason = reason;
    this.history.push(winner);
    if (winner) {
      this.wins[winner]++;
      if (this.wins[winner] >= this.winsNeeded) this.matchWinner = winner;
    }
    this.emit({ type: 'roundEnd', round: this.round, winner, reason });
  }

  private nextRound(now: number): void {
    if (this.lastReason !== 'draw') this.round++;
    if (this.connectedCount() >= 2) {
      this.rebalance();
      this.startCountdown(now);
    } else {
      this.setPhase('waiting', now);
      this.emit({ type: 'waiting' });
    }
  }

  /* ------------------------------------------------------------------ input */

  /** Taps that arrive while paused: keep the counter in sync but give them no effect. */
  absorb(id: number, taps: number): void {
    const m = this.members.get(id);
    if (m) m.lastTaps = taps & 0xffff;
  }

  /**
   * One input frame from a phone. `taps` is the phone's cumulative u16 counter, `atMs` the synced
   * server time of the tap. Returns a shared, reused result object.
   */
  input(id: number, taps: number, atMs: number, t: number, server: number): TapResult {
    this.advance(t, server);
    const r = this.result;
    r.playerId = id;
    r.team = null;
    r.counted = 0;
    r.super = false;
    r.combo = 0;
    const m = this.members.get(id);
    if (!m || m.gone) return r;
    const counter = taps & 0xffff;
    const delta = m.lastTaps < 0 ? 1 : u16Delta(m.lastTaps, counter);
    m.lastTaps = counter;
    if (delta === 0 || delta > this.tuning.resyncDelta) return r;
    if (this.phase !== 'pull' || m.team === null) {
      m.lastTapAt = atMs;
      return r;
    }
    const team = m.team;
    const now = this.t;
    const room = Math.max(0, this.tuning.maxTapsPerSecond - m.rate.sum(now));
    const counted = Math.min(delta, room);
    r.team = team;
    r.counted = counted;
    if (counted > 0) {
      m.rate.add(now, counted);
      this.force[team].add(now, counted);
      this.real[team].add(now, counted);
      m.taps += counted;
      m.roundTaps += counted;
    }
    if (delta === 1 && counted === 1) {
      const cycle = this.superCycle(m, atMs, server);
      if (cycle > 0) {
        m.combo = m.lastSuperCycle === cycle - 1 ? m.combo + 1 : 1;
        m.lastSuperCycle = cycle;
        m.supers++;
        m.roundSupers++;
        if (m.combo > m.maxCombo) m.maxCombo = m.combo;
        this.force[team].add(now, this.tuning.superBonusTaps);
        r.super = true;
        r.combo = m.combo;
      }
    }
    m.lastTapAt = atMs;
    return r;
  }

  /** The ring cycle this tap lands as a super in, or 0 when it is not a super. */
  private superCycle(m: Member, atMs: number, server: number): number {
    const tu = this.tuning;
    const lag = server - atMs;
    if (lag > tu.maxTapLagMs || lag < -tu.maxTapLeadMs) return 0;
    const n = Math.round((atMs - this.ringStart) / tu.ringPeriodMs);
    if (n < 1) return 0;
    const end = this.ringStart + n * tu.ringPeriodMs;
    if (Math.abs(atMs - end) > tu.superWindowMs) return 0;
    if (m.lastSuperCycle === n) return 0;
    if (m.lastTapAt >= end - tu.superWindowMs - tu.superQuietMs) return 0;
    return n;
  }

  /* ------------------------------------------------------------------ read-outs */

  /** Live combo: drops to 0 once a ring cycle (plus grace for late frames) passes without a super. */
  comboOf(id: number, server = this.server): number {
    const m = this.members.get(id);
    if (!m || m.combo === 0 || this.phase !== 'pull') return 0;
    const tu = this.tuning;
    const closed = Math.floor(
      (server - this.ringStart - tu.superWindowMs - tu.superGraceMs) / tu.ringPeriodMs,
    );
    return m.lastSuperCycle >= closed ? m.combo : 0;
  }

  /** Effective pulling force of a team (taps/s per connected player, super bonus included). */
  teamForce(team: Team): number {
    return this.force[team].sum(this.t) / this.teamSize(team);
  }

  /** Real tap rate per connected player of a team (taps/s), for display. */
  teamRate(team: Team): number {
    return this.real[team].sum(this.t) / this.teamSize(team);
  }

  playerRate(id: number): number {
    const m = this.members.get(id);
    return m ? m.rate.sum(this.t) : 0;
  }

  roundTaps(team: Team): number {
    let n = 0;
    for (const m of this.members.values()) if (m.team === team) n += m.roundTaps;
    return n;
  }

  /** Ms left on the round clock (sudden death included); frozen between rounds. */
  timeLeft(): number {
    if (this.phase === 'pull') return this.clockLeft(this.t);
    if (this.phase === 'countdown' || this.phase === 'waiting') return this.tuning.roundMs;
    return this.frozenLeft;
  }

  private clockLeft(now: number): number {
    const tu = this.tuning;
    const limit = this.suddenDeath ? tu.roundMs + tu.suddenDeathMs : tu.roundMs;
    return Math.max(0, limit - (now - this.pullStart));
  }

  /** Leading side, or null when the rope is within `eps` of the center. */
  leader(eps = 0.02): Team | null {
    if (this.p < -eps) return 'red';
    if (this.p > eps) return 'blue';
    return null;
  }

  /** True when both teams are one round win away from the match. */
  isDecider(): boolean {
    return this.wins.red === this.winsNeeded - 1 && this.wins.blue === this.winsNeeded - 1;
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

/* ------------------------------------------------------------------ scoring */

export const scoreOf = (m: Member, bonus = DEFAULT_TUNING.superBonusTaps): number =>
  m.taps + m.supers * bonus;

interface AwardRule {
  title: string;
  icon: GameAward['icon'];
  eligible: (m: Member) => boolean;
  metric: (m: Member) => number;
  desc: (m: Member, isBest: boolean) => string;
}

/**
 * Hand out awards so everyone gets one when possible (maximum matching between awards and
 * eligible players); an award only doubles up on someone when all its candidates already have one.
 */
export function pickAwards(match: TarikMatch, winner: Team): GameAward[] {
  const loser = otherTeam(winner);
  const players = match.allMembers().filter((m) => m.team !== null);
  const rules: AwardRule[] = [
    {
      title: STR.awardCaptain,
      icon: 'crown',
      eligible: (m) => m.team === winner && m.taps > 0,
      metric: (m) => m.taps,
      desc: (m, best) =>
        best ? STR.awardCaptainDesc(m.taps, winner) : STR.awardCaptainOther(m.taps, winner),
    },
    {
      title: STR.awardFighter,
      icon: 'heart',
      eligible: (m) => m.team === loser && m.taps > 0,
      metric: (m) => scoreOf(m, match.tuning.superBonusTaps),
      desc: (m) => STR.awardFighterDesc(m.taps, loser),
    },
    {
      title: STR.awardFastest,
      icon: 'zap',
      eligible: (m) => m.bestRate > 0,
      metric: (m) => m.bestRate,
      desc: (m, best) =>
        best ? STR.awardFastestBest(formatRate(m.bestRate)) : STR.awardFastestOther(formatRate(m.bestRate)),
    },
    {
      title: STR.awardCombo,
      icon: 'fire',
      eligible: (m) => m.maxCombo > 0,
      metric: (m) => m.maxCombo * 1000 + m.supers,
      desc: (m) => (m.maxCombo > 1 ? STR.awardComboStreak(m.maxCombo) : STR.awardComboSingle(m.supers)),
    },
  ];
  const candidates = rules.map((rule) =>
    players
      .filter(rule.eligible)
      .sort((a, b) => rule.metric(b) - rule.metric(a) || a.joinIndex - b.joinIndex),
  );
  // Bipartite matching (augmenting paths): as many distinct players as possible get an award,
  // each award preferring its best free candidate before displacing anyone.
  const owner = new Map<number, number>();
  const assigned: (Member | undefined)[] = rules.map(() => undefined);
  const tryAssign = (ri: number, seen: Set<number>): boolean => {
    const list = candidates[ri] ?? [];
    for (const m of list) {
      if (seen.has(m.id) || owner.has(m.id)) continue;
      seen.add(m.id);
      owner.set(m.id, ri);
      assigned[ri] = m;
      return true;
    }
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const other = owner.get(m.id);
      if (other !== undefined && tryAssign(other, seen)) {
        owner.set(m.id, ri);
        assigned[ri] = m;
        return true;
      }
    }
    return false;
  };
  rules.forEach((_, ri) => {
    tryAssign(ri, new Set());
  });
  const picked: { order: number; award: GameAward }[] = [];
  const displayOrder: string[] = [STR.awardFastest, STR.awardCombo, STR.awardFighter, STR.awardCaptain];
  rules.forEach((rule, ri) => {
    const best = candidates[ri]?.[0];
    if (!best) return;
    // Everyone eligible already has an award: this one goes to the true best.
    const pick = assigned[ri] ?? best;
    picked.push({
      order: displayOrder.indexOf(rule.title),
      award: {
        playerId: pick.id,
        title: rule.title,
        desc: rule.desc(pick, rule.metric(pick) === rule.metric(best)),
        icon: rule.icon,
      },
    });
  });
  return picked.sort((a, b) => a.order - b.order).map((p) => p.award);
}

/** Final result for the shell. Winning team members share rank 1, the rest share rank 2. */
export function buildResult(match: TarikMatch): GameResult {
  const winner = match.matchWinner ?? (match.wins.red >= match.wins.blue ? 'red' : 'blue');
  const loser = otherTeam(winner);
  const bonus = match.tuning.superBonusTaps;
  const ranking = match
    .allMembers()
    .filter((m) => m.team !== null)
    .map((m) => ({
      playerId: m.id,
      score: scoreOf(m, bonus),
      rank: m.team === winner ? 1 : 2,
      label: STR.teamLabel(m.team as Team),
    }))
    .sort((a, b) => a.rank - b.rank || b.score - a.score);
  return {
    title: STR.champion(winner),
    subtitle: STR.winScore(match.wins[winner], match.wins[loser]),
    ranking,
    awards: pickAwards(match, winner),
  };
}
