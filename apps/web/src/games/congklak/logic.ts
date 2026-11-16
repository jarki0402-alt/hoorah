/**
 * Congklak rules and match flow. Pure and deterministic: time comes in as `now`, randomness is not
 * used at all, and nothing here touches the DOM or the SDK.
 *
 * Board layout (16 positions, sowing goes up the indices and wraps):
 *
 *   store 15 | 14 13 12 11 10  9  8 |            side 1 (bottom row on the main screen, right → left)
 *            |  0  1  2  3  4  5  6 | store 7    side 0 (top row on the main screen, left → right)
 *
 * On the main screen side 0 is the top row (left → right) with its store on the right, side 1 the
 * bottom row (right → left) with its store on the left, so seeds travel clockwise and every
 * player's store sits on their own left, as on a real board.
 */

export const HOLES = 7;
export const SEEDS = 7;
export const PITS = 16;
export type Side = 0 | 1;

/** Time a player gets to pick a hole before one is picked for them. */
export const TURN_MS = 15_000;
/** A side with nobody connected moves by itself after this pause. */
export const AUTO_MS = 1_400;
export const INTRO_MS = 2_800;
/** Breather after the last seed before the next turn starts. */
export const SETTLE_MS = 650;
/** Extra pause after a move that ends in the own store, so "JALAN LAGI!" can be read. */
export const EXTRA_MS = 500;
export const ROUND_END_MS = 5_500;
export const FINAL_MS = 5_500;
/**
 * Relay guard: once a move has dropped this many seeds it stops at the next hole it would pick
 * up from (the turn just ends there). Real games never get close; it only rules out endless loops.
 */
export const MAX_DROPS = 300;

export const other = (s: Side): Side => (s === 0 ? 1 : 0);
export const storeOf = (s: Side): number => (s === 0 ? 7 : 15);
export const isStore = (pos: number): boolean => pos === 7 || pos === 15;
/** Owner of a position (stores included). */
export const sideOf = (pos: number): Side => (pos <= 7 ? 0 : 1);
/** The hole straight across the board (holes only). */
export const opposite = (pos: number): number => 14 - pos;
/** Hole number as players see it: 1 (first after the opponent's store) … 7 (next to the own store). */
export const holeNumber = (pos: number): number => (pos % 8) + 1;
export const holePos = (side: Side, n: number): number => side * 8 + (n - 1);
export const holesOf = (side: Side): number[] => Array.from({ length: HOLES }, (_, i) => side * 8 + i);

export function newBoard(seeds = SEEDS): number[] {
  const b = new Array<number>(PITS).fill(seeds);
  b[7] = 0;
  b[15] = 0;
  return b;
}

/** Next position a seed of `side` goes to: the opponent's store is skipped. */
export function nextPos(pos: number, side: Side): number {
  let p = (pos + 1) % PITS;
  if (p === storeOf(other(side))) p = (p + 1) % PITS;
  return p;
}

export function seedsOnSide(board: readonly number[], side: Side): number {
  let n = 0;
  for (const p of holesOf(side)) n += board[p]!;
  return n;
}

/** Positions of the holes `side` may pick (not empty). */
export function validHoles(board: readonly number[], side: Side): number[] {
  return holesOf(side).filter((p) => board[p]! > 0);
}

/* ------------------------------------------------------------------ sowing */

export type Step =
  /** Pick up every seed of `pos` into the hand. */
  | { t: 'take'; pos: number; n: number }
  /** One seed from the hand into `pos`. */
  | { t: 'drop'; pos: number }
  /** Tembak: the last seed (in `pos`) and the `n - 1` seeds across in `opp` go to the store. */
  | { t: 'capture'; pos: number; opp: number; n: number };

/**
 * How the move ended:
 * - `store`: last seed in the own store, the same side moves again.
 * - `capture`: last seed in an empty own hole, the opposite hole was captured.
 * - `empty-own`: last seed in an empty own hole with nothing across.
 * - `empty-opp`: last seed in an empty opponent hole.
 * - `guard`: the relay guard stopped an overly long move.
 */
export type Outcome = 'store' | 'capture' | 'empty-own' | 'empty-opp' | 'guard';

export interface MoveTrace {
  side: Side;
  pit: number;
  before: number[];
  after: number[];
  steps: Step[];
  outcome: Outcome;
  /** Seeds that went to the store by a capture (last seed included). */
  captured: number;
  drops: number;
  /** Times the hand picked a hole up again and kept sowing. */
  relays: number;
  lastPos: number;
}

/** Applies one step to `board` in place; returns the seeds left in the hand. */
export function applyStep(board: number[], hand: number, step: Step, side: Side): number {
  switch (step.t) {
    case 'take': {
      const n = board[step.pos]!;
      board[step.pos] = 0;
      return hand + n;
    }
    case 'drop':
      board[step.pos] = board[step.pos]! + 1;
      return hand - 1;
    case 'capture': {
      const s = storeOf(side);
      board[s] = board[s]! + board[step.pos]! + board[step.opp]!;
      board[step.pos] = 0;
      board[step.opp] = 0;
      return hand;
    }
  }
}

export function sow(board: readonly number[], side: Side, pit: number, maxDrops = MAX_DROPS): MoveTrace {
  if (isStore(pit) || sideOf(pit) !== side) throw new Error(`hole ${pit} does not belong to side ${side}`);
  if (board[pit]! <= 0) throw new Error(`hole ${pit} is empty`);
  const b = board.slice();
  const steps: Step[] = [];
  const own = storeOf(side);
  let hand = b[pit]!;
  b[pit] = 0;
  steps.push({ t: 'take', pos: pit, n: hand });
  let pos = pit;
  let drops = 0;
  let relays = 0;
  let captured = 0;
  let outcome: Outcome;
  for (;;) {
    while (hand > 0) {
      pos = nextPos(pos, side);
      b[pos] = b[pos]! + 1;
      hand--;
      drops++;
      steps.push({ t: 'drop', pos });
    }
    if (pos === own) {
      outcome = 'store';
      break;
    }
    if (b[pos]! > 1) {
      if (drops >= maxDrops) {
        outcome = 'guard';
        break;
      }
      hand = b[pos]!;
      b[pos] = 0;
      relays++;
      steps.push({ t: 'take', pos, n: hand });
      continue;
    }
    if (sideOf(pos) === side) {
      const opp = opposite(pos);
      if (b[opp]! > 0) {
        captured = b[opp]! + 1;
        b[own] = b[own]! + captured;
        b[pos] = 0;
        b[opp] = 0;
        steps.push({ t: 'capture', pos, opp, n: captured });
        outcome = 'capture';
      } else {
        outcome = 'empty-own';
      }
      break;
    }
    outcome = 'empty-opp';
    break;
  }
  return {
    side,
    pit,
    before: board.slice(),
    after: b,
    steps,
    outcome,
    captured,
    drops,
    relays,
    lastPos: pos,
  };
}

/** Seeds still in the holes go to their owners' stores (end of a round). */
export function sweep(board: readonly number[]): { board: number[]; swept: [number, number] } {
  const b = board.slice();
  const swept: [number, number] = [0, 0];
  for (const side of [0, 1] as const) {
    for (const p of holesOf(side)) {
      swept[side] += b[p]!;
      b[p] = 0;
    }
    b[storeOf(side)] = b[storeOf(side)]! + swept[side];
  }
  return { board: b, swept };
}

/**
 * The hole picked for a player who ran out of time (or an empty side): the move that gains the
 * most for the own store, a move ending in the store counting a little extra. Ties go to the hole
 * nearest the store.
 */
export function autoPick(board: readonly number[], side: Side): number {
  const own = storeOf(side);
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const p of validHoles(board, side)) {
    const t = sow(board, side, p);
    const score = t.after[own]! - board[own]! + (t.outcome === 'store' ? 2.5 : 0);
    if (score >= bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best < 0) throw new Error(`side ${side} has no move`);
  return best;
}

/* ------------------------------------------------------------------ animation timing */

const FIRST_TAKE_MS = 420;
const RELAY_TAKE_MS = 320;
const RELAY_TAKE_MIN_MS = 150;
const CAPTURE_MS = 1_150;
const DROP_START_MS = 230;
const DROP_MIN_MS = 36;
const DROP_EASE = 0.955;

/** Gap after the n-th drop of a move (0-based): quick, and quicker the longer the relay runs. */
export const dropGap = (n: number): number =>
  Math.max(DROP_MIN_MS, Math.round(DROP_START_MS * DROP_EASE ** n));

/** When each step happens, in ms after the move starts, and when the last one is done. */
export function stepTimes(steps: readonly Step[]): { at: number[]; total: number } {
  const at: number[] = [];
  let t = 0;
  let drops = 0;
  let relays = 0;
  steps.forEach((s, i) => {
    at.push(t);
    if (s.t === 'take')
      t +=
        i === 0 ? FIRST_TAKE_MS : Math.max(RELAY_TAKE_MIN_MS, Math.round(RELAY_TAKE_MS * 0.93 ** relays++));
    else if (s.t === 'drop') t += dropGap(drops++);
    else t += CAPTURE_MS;
  });
  return { at, total: t };
}

export function moveDuration(trace: MoveTrace): number {
  return stepTimes(trace.steps).total + SETTLE_MS + (trace.outcome === 'store' ? EXTRA_MS : 0);
}

/* ------------------------------------------------------------------ teams */

export interface RosterEntry {
  id: number;
  connected: boolean;
}

/** Join order alternates between the sides: 1 vs 1 for two players, two teams for more. */
export function assignTeams(ids: readonly number[]): [number[], number[]] {
  const out: [number[], number[]] = [[], []];
  ids.forEach((id, i) => {
    out[(i % 2) as Side].push(id);
  });
  return out;
}

/* ------------------------------------------------------------------ clock */

/** Game time that stands still while the shell is paused. */
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
}

/* ------------------------------------------------------------------ match */

export type Phase = 'intro' | 'turn' | 'sowing' | 'roundEnd' | 'final' | 'ended';

export interface PlayerStats {
  id: number;
  side: Side;
  moves: number;
  /** Tembak count and the seeds they brought in. */
  captures: number;
  captured: number;
  extras: number;
  /** Most seeds dropped in one move. */
  longest: number;
  timeouts: number;
}

export interface RoundResult {
  round: number;
  stores: [number, number];
  swept: [number, number];
  winner: Side | null;
}

export type CongklakEvent =
  | { type: 'intro'; round: number; first: Side }
  | { type: 'turn'; side: Side; playerId: number | null; extra: boolean; deadline: number }
  | {
      type: 'move';
      trace: MoveTrace;
      playerId: number | null;
      /** Picked by the timer (or for an empty side) rather than by a player. */
      auto: boolean;
      startAt: number;
      endAt: number;
    }
  | { type: 'roundEnd'; result: RoundResult; last: boolean }
  | { type: 'end' };

export interface MatchOptions {
  rounds: number;
  roster: readonly RosterEntry[];
  now: number;
  /**
   * Picks the hole for a side with nobody connected (the computer brain on the main screen).
   * Defaults to `autoPick`.
   */
  autoChoose?: (board: readonly number[], side: Side) => number;
  /** Pause before such a side moves by itself. Defaults to `AUTO_MS`. */
  autoDelay?: () => number;
}

export interface ActiveMove {
  trace: MoveTrace;
  playerId: number | null;
  auto: boolean;
  startAt: number;
  endAt: number;
}

export class CongklakMatch {
  readonly rounds: number;
  round = 0;
  phase: Phase = 'intro';
  board: number[] = newBoard();
  /** Side whose turn it is (or who starts, during the intro). */
  turnSide: Side = 0;
  /** Player picking right now; null while a side with nobody connected moves by itself. */
  current: number | null = null;
  extra = false;
  /** Turn deadline during 'turn', end of the phase otherwise. */
  deadline = 0;
  phaseEnd = 0;
  move: ActiveMove | null = null;
  readonly members: [number[], number[]];
  readonly results: RoundResult[] = [];
  readonly stats = new Map<number, PlayerStats>();
  private readonly ptr: [number, number] = [0, 0];
  private connected = new Set<number>();
  private queue: CongklakEvent[] = [];
  private readonly autoChoose: (board: readonly number[], side: Side) => number;
  private readonly autoDelay: () => number;

  constructor(opts: MatchOptions) {
    this.autoChoose = opts.autoChoose ?? autoPick;
    this.autoDelay = opts.autoDelay ?? (() => AUTO_MS);
    this.rounds = Math.max(1, Math.floor(opts.rounds));
    this.members = assignTeams(opts.roster.map((r) => r.id));
    this.connected = new Set(opts.roster.filter((r) => r.connected).map((r) => r.id));
    for (const side of [0, 1] as const) for (const id of this.members[side]) this.addStats(id, side);
    this.startRound(1, opts.now);
  }

  /** More than one player on a side: show team names instead of player names. */
  get teamMode(): boolean {
    return this.members[0].length + this.members[1].length > 2;
  }

  sideOfPlayer(id: number): Side | null {
    if (this.members[0].includes(id)) return 0;
    if (this.members[1].includes(id)) return 1;
    return null;
  }

  /** Seeds in each store over the whole match (finished rounds plus the one being played). */
  get totals(): [number, number] {
    const t: [number, number] = [0, 0];
    for (const r of this.results) {
      t[0] += r.stores[0];
      t[1] += r.stores[1];
    }
    if (this.results.length < this.round) {
      t[0] += this.board[7]!;
      t[1] += this.board[15]!;
    }
    return t;
  }

  /** Match leader by total seeds; null on a tie. */
  get leader(): Side | null {
    const [a, b] = this.totals;
    return a === b ? null : a > b ? 0 : 1;
  }

  drain(): CongklakEvent[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  tick(now: number): void {
    // Each transition can trigger the next (a turn that finds an empty side ends the round).
    for (let guard = 0; guard < 8; guard++) {
      if (!this.advance(now)) return;
    }
  }

  /** A player picked hole `n` (1–7). Returns false when the pick does not count. */
  pick(playerId: number, n: number, now: number): boolean {
    if (this.phase !== 'turn' || playerId !== this.current) return false;
    if (!Number.isInteger(n) || n < 1 || n > HOLES) return false;
    const pos = holePos(this.turnSide, n);
    if (this.board[pos]! <= 0) return false;
    this.play(pos, playerId, false, now);
    return true;
  }

  setRoster(roster: readonly RosterEntry[], now: number): void {
    this.connected = new Set(roster.filter((r) => r.connected).map((r) => r.id));
    for (const r of roster) {
      if (this.sideOfPlayer(r.id) !== null) continue;
      // Late joiners go to the smaller side (side 0 on a tie).
      const side: Side = this.members[1].length < this.members[0].length ? 1 : 0;
      this.members[side].push(r.id);
      this.addStats(r.id, side);
    }
    if (this.phase !== 'turn') return;
    if (this.current !== null && this.connected.has(this.current)) return;
    const next = this.nextMember(this.turnSide);
    if (next !== null) {
      // Someone (else) of the side takes over with a fresh clock.
      this.current = next;
      this.deadline = now + TURN_MS;
      this.emit({
        type: 'turn',
        side: this.turnSide,
        playerId: next,
        extra: this.extra,
        deadline: this.deadline,
      });
    } else if (this.current !== null) {
      this.current = null;
      this.deadline = Math.min(this.deadline, now + this.autoDelay());
      this.emit({
        type: 'turn',
        side: this.turnSide,
        playerId: null,
        extra: this.extra,
        deadline: this.deadline,
      });
    }
  }

  /* ---------------------------------------------------------------- internals */

  private emit(e: CongklakEvent): void {
    this.queue.push(e);
  }

  private addStats(id: number, side: Side): void {
    this.stats.set(id, { id, side, moves: 0, captures: 0, captured: 0, extras: 0, longest: 0, timeouts: 0 });
  }

  private startRound(round: number, now: number): void {
    this.round = round;
    this.board = newBoard();
    this.move = null;
    this.current = null;
    this.extra = false;
    // Sides take turns starting a round.
    this.turnSide = round % 2 === 1 ? 0 : 1;
    this.phase = 'intro';
    this.phaseEnd = now + INTRO_MS;
    this.deadline = this.phaseEnd;
    this.emit({ type: 'intro', round, first: this.turnSide });
  }

  private advance(now: number): boolean {
    switch (this.phase) {
      case 'intro':
        if (now < this.phaseEnd) return false;
        this.beginTurn(this.turnSide, false, now);
        return true;
      case 'turn':
        if (now < this.deadline) return false;
        this.timeout(now);
        return true;
      case 'sowing': {
        if (now < this.phaseEnd || !this.move) return false;
        const t = this.move.trace;
        if (t.outcome === 'store') this.beginTurn(t.side, true, now);
        else this.beginTurn(other(t.side), false, now);
        return true;
      }
      case 'roundEnd':
        if (now < this.phaseEnd) return false;
        this.startRound(this.round + 1, now);
        return true;
      case 'final':
        if (now < this.phaseEnd) return false;
        this.phase = 'ended';
        this.emit({ type: 'end' });
        return true;
      case 'ended':
        return false;
    }
  }

  /** Next connected member of `side` in rotation, or null when nobody of the side is here. */
  private nextMember(side: Side): number | null {
    const list = this.members[side];
    for (let k = 0; k < list.length; k++) {
      const i = (this.ptr[side] + k) % list.length;
      const id = list[i]!;
      if (this.connected.has(id)) {
        this.ptr[side] = (i + 1) % list.length;
        return id;
      }
    }
    return null;
  }

  private beginTurn(side: Side, extra: boolean, now: number): void {
    if (seedsOnSide(this.board, side) === 0) {
      this.endRound(now);
      return;
    }
    const keep =
      extra &&
      this.current !== null &&
      this.connected.has(this.current) &&
      this.sideOfPlayer(this.current) === side;
    if (!keep) this.current = this.nextMember(side);
    this.turnSide = side;
    this.extra = extra;
    this.phase = 'turn';
    this.deadline = now + (this.current !== null ? TURN_MS : this.autoDelay());
    this.emit({ type: 'turn', side, playerId: this.current, extra, deadline: this.deadline });
  }

  private timeout(now: number): void {
    const id = this.current;
    if (id !== null) {
      const s = this.stats.get(id);
      if (s) s.timeouts++;
    }
    // A player who ran out of time gets the simple pick; a side with nobody here, the brain.
    const pos =
      id !== null ? autoPick(this.board, this.turnSide) : this.autoChoose(this.board, this.turnSide);
    this.play(pos, id, true, now);
  }

  private play(pos: number, playerId: number | null, auto: boolean, now: number): void {
    const trace = sow(this.board, this.turnSide, pos);
    this.board = trace.after;
    const endAt = now + moveDuration(trace);
    this.move = { trace, playerId, auto, startAt: now, endAt };
    this.phase = 'sowing';
    this.phaseEnd = endAt;
    this.deadline = endAt;
    const s = playerId !== null ? this.stats.get(playerId) : undefined;
    if (s) {
      s.moves++;
      s.longest = Math.max(s.longest, trace.drops);
      if (trace.outcome === 'capture') {
        s.captures++;
        s.captured += trace.captured;
      }
      if (trace.outcome === 'store') s.extras++;
    }
    this.emit({ type: 'move', trace, playerId, auto, startAt: now, endAt });
  }

  private endRound(now: number): void {
    const { board, swept } = sweep(this.board);
    this.board = board;
    this.current = null;
    this.move = null;
    const stores: [number, number] = [board[7]!, board[15]!];
    const winner: Side | null = stores[0] === stores[1] ? null : stores[0] > stores[1] ? 0 : 1;
    const result: RoundResult = { round: this.round, stores, swept, winner };
    this.results.push(result);
    const last = this.round >= this.rounds;
    this.phase = last ? 'final' : 'roundEnd';
    this.phaseEnd = now + (last ? FINAL_MS : ROUND_END_MS);
    this.deadline = this.phaseEnd;
    this.emit({ type: 'roundEnd', result, last });
  }
}
