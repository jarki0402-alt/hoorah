/**
 * Ludo rules as a pure, deterministic state machine. Time comes in from the caller (game clock,
 * frozen while paused) and dice come from a seeded generator, so tests can replay any game.
 *
 * House rules (common in Indonesia):
 * - a 6 brings a pawn out of its base onto its start square;
 * - a 6 gives another roll, but the third 6 in a row forfeits the turn;
 * - landing on an opponent sends it back to its base, except on safe squares (start + star);
 * - the exact number is needed to reach home;
 * - the first colour with every pawn home wins.
 *
 * Every player gets their own colour. 2 to 4 players use the classic cross board; 5 to 8 players
 * a regular polygon with one side per colour (owner 2026-11-22: no teams).
 */

/** Squares in each colour's home column. */
export const HOME_COL = 5;
/** Progress of a pawn still in its base. */
export const BASE = -1;
/** Most colours on one board. */
export const MAX_SEATS = 8;

/**
 * The loop around a board. A pawn starts on its start square (progress 0), walks the loop to the
 * square before its start's neighbour (`lastTrack`), turns into its home column and ends at
 * `home`. The same formulas hold for every board, so only the loop itself differs.
 */
export interface BoardSpec {
  /** 4 = the classic cross, 5..8 = a regular polygon with one side per colour. */
  sides: number;
  /** Loop squares per side. */
  perSide: number;
  /** Squares on the shared loop. */
  trackLen: number;
  /** Last progress on the loop (the square before the home column). */
  lastTrack: number;
  /** Progress of a pawn that reached home (the centre). */
  home: number;
  /** Loop index of each colour's start square, by ColorId (clockwise). */
  start: readonly number[];
  /** Loop index of each colour's star square. */
  star: readonly number[];
  /** Start squares and star squares. */
  safe: ReadonlySet<number>;
}

/** Loop squares per side of the polygon boards: fewer as sides grow, so a lap stays near 52. */
const PER_SIDE: Readonly<Record<number, number>> = { 5: 11, 6: 9, 7: 7, 8: 7 };

function makeSpec(sides: number, perSide: number, start: number[], star: number[]): BoardSpec {
  const trackLen = sides * perSide;
  return {
    sides,
    perSide,
    trackLen,
    lastTrack: trackLen - 2,
    home: trackLen - 2 + HOME_COL + 1,
    start,
    star,
    safe: new Set([...start, ...star]),
  };
}

const CLASSIC = makeSpec(4, 13, [0, 13, 26, 39], [8, 21, 34, 47]);
const specs = new Map<number, BoardSpec>([[4, CLASSIC]]);

/** The board for a number of colours: classic up to 4, a polygon with one side each for 5..8. */
export function boardFor(colors: number): BoardSpec {
  const sides = colors <= 4 ? 4 : Math.min(MAX_SEATS, colors);
  let spec = specs.get(sides);
  if (!spec) {
    const L = PER_SIDE[sides]!;
    const mid = (L - 1) / 2;
    const lap = sides * L;
    const start = Array.from({ length: sides }, (_, c) => (c * L + mid + 2) % lap);
    const star = start.map((s) => (s + Math.round((8 * L) / 13)) % lap);
    spec = makeSpec(sides, L, start, star);
    specs.set(sides, spec);
  }
  return spec;
}

export const INTRO_MS = 2800;
export const ROLL_MS = 12_000;
export const PICK_MS = 12_000;
/**
 * Turn deadline for a colour with nobody connected. The main screen's computer brain plays such a
 * seat after a 1.5–3 s pause; this is only the fallback if it doesn't.
 */
export const AWAY_MS = 3400;
/** The dice tumble before the number is final. */
export const DICE_MS = 900;
export const HOP_MS = 210;
/** Extra time after a capture so the sent-home pawn can fly back. */
export const CAPTURE_MS = 750;
/** Pause after a move or a pass before the next turn. */
export const SETTLE_MS = 350;
export const PASS_MS = 1300;
export const FINALE_MS = 4200;

export type ColorId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Phase = 'intro' | 'roll' | 'rolling' | 'pick' | 'moving' | 'pass' | 'finale' | 'ended';

export interface RosterEntry {
  id: number;
  connected: boolean;
}

/** One colour on the board and the player who rolls for it. */
export interface Seat {
  index: number;
  color: ColorId;
  player: number;
  /** Progress per pawn: BASE, 0..lastTrack on the loop, then the home column, `home` at the end. */
  pawns: number[];
  /** Pawns of this colour sent home by opponents. */
  lost: number;
}

export interface PlayerStats {
  id: number;
  seat: number;
  rolls: number;
  sixes: number;
  captures: number;
  /** Pawns brought home by this player. */
  home: number;
  /** Steps walked by pawns this player moved. */
  steps: number;
}

export interface Capture {
  seat: number;
  pawn: number;
  /** Progress of the captured pawn before it went back to base. */
  from: number;
}

export interface MoveOption {
  pawn: number;
  from: number;
  to: number;
  captures: Capture[];
  exit: boolean;
  home: boolean;
  /** Lands on a safe square. */
  safe: boolean;
}

export interface MoveInfo extends MoveOption {
  seat: number;
  player: number;
  /** Progress after each hop (a pawn leaving the base makes one hop to its start square). */
  path: number[];
  auto: boolean;
}

export type PassReason = 'none' | 'triple';

export type LudoEvent =
  | { type: 'intro' }
  | { type: 'turn'; seat: number; player: number; bonus: boolean }
  | { type: 'roll'; seat: number; player: number; value: number; auto: boolean }
  | { type: 'pick'; seat: number; player: number; options: MoveOption[] }
  | { type: 'move'; move: MoveInfo }
  | { type: 'pass'; seat: number; player: number; reason: PassReason }
  | { type: 'finish'; seat: number }
  | { type: 'end' };

export interface LudoOptions {
  /** Pawns per colour: 2 (Kilat) or 4 (Normal). */
  pawns: number;
  roster: RosterEntry[];
  now: number;
  seed?: number;
  /** Override the dice (tests). Must return 1..6. */
  dice?: () => number;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loop index of a pawn, or null when it is in its base, home column or home. */
export function absOf(board: BoardSpec, color: ColorId, progress: number): number | null {
  if (progress < 0 || progress > board.lastTrack) return null;
  return (board.start[color]! + progress) % board.trackLen;
}

/** Colours for n players: on the classic board two players sit opposite each other. */
export function colorsFor(n: number): ColorId[] {
  if (n <= 1) return [0];
  if (n === 2) return [0, 2];
  if (n === 3) return [0, 1, 2];
  return Array.from({ length: Math.min(MAX_SEATS, n) }, (_, i) => i as ColorId);
}

export function clampPawns(v: unknown): number {
  const n = Number(v);
  return n >= 4 ? 4 : 2;
}

export class LudoLogic {
  readonly pawnCount: number;
  readonly board: BoardSpec;
  readonly seats: Seat[];
  readonly stats = new Map<number, PlayerStats>();
  phase: Phase = 'intro';
  /** Seat whose turn it is. */
  current = 0;
  /** Player rolling for the current seat. */
  roller = -1;
  dice: number | null = null;
  /** Sixes in a row this turn. */
  sixes = 0;
  /** Distinct legal moves while picking. */
  options: MoveOption[] = [];
  /** Game time when the current phase times out. */
  deadline = 0;
  /** Game time the current timed phase started. */
  since = 0;
  winner: number | null = null;
  lastPass: PassReason | null = null;
  lastMove: MoveInfo | null = null;
  /** A 6 was rolled and the same player rolls again. */
  bonus = false;

  private readonly connected = new Map<number, boolean>();
  private readonly roll6: () => number;
  private events: LudoEvent[] = [];

  constructor(opts: LudoOptions) {
    this.pawnCount = clampPawns(opts.pawns);
    for (const r of opts.roster) this.connected.set(r.id, r.connected);
    const live = opts.roster.filter((r) => r.connected).map((r) => r.id);
    const ids = (live.length ? live : opts.roster.map((r) => r.id)).slice(0, MAX_SEATS);
    const colors = colorsFor(ids.length);
    this.board = boardFor(colors.length);
    this.seats = ids.map((player, index) => ({
      index,
      color: colors[index]!,
      player,
      pawns: Array.from({ length: this.pawnCount }, () => BASE),
      lost: 0,
    }));
    for (const t of this.seats)
      this.stats.set(t.player, {
        id: t.player,
        seat: t.index,
        rolls: 0,
        sixes: 0,
        captures: 0,
        home: 0,
        steps: 0,
      });
    if (opts.dice) {
      this.roll6 = opts.dice;
    } else {
      const r = rng(opts.seed ?? 1);
      this.roll6 = () => 1 + Math.floor(r() * 6);
    }
    this.since = opts.now;
    this.deadline = opts.now + INTRO_MS;
    this.emit({ type: 'intro' });
  }

  /** Every player with a seat, in join order. */
  get participants(): number[] {
    return this.seats.map((t) => t.player);
  }

  get seat(): Seat {
    return this.seats[this.current]!;
  }

  seatOf(playerId: number): Seat | null {
    return this.seats.find((t) => t.player === playerId) ?? null;
  }

  isConnected(id: number): boolean {
    return this.connected.get(id) ?? false;
  }

  homeCount(seat: Seat): number {
    return seat.pawns.filter((p) => p === this.board.home).length;
  }

  drain(): LudoEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ---------------------------------------------------------------- input */

  setRoster(roster: readonly RosterEntry[], now: number): void {
    for (const r of roster) this.connected.set(r.id, r.connected);
    if (this.phase !== 'roll' && this.phase !== 'pick') return;
    if (!this.isConnected(this.roller)) {
      // Nobody rolls for this colour any more: it plays itself.
      this.deadline = Math.min(this.deadline, now + AWAY_MS);
    } else if (this.deadline - now < 5000) {
      // The roller is back: give them time to act again.
      this.deadline = now + 5000;
    }
  }

  /** The current roller throws the dice. */
  roll(from: number, now: number): boolean {
    if (this.phase !== 'roll' || from !== this.roller) return false;
    this.doRoll(now, false);
    return true;
  }

  /** The current roller picks a pawn (1-based number as shown on the board and the phone). */
  pick(from: number, pawn: number, now: number): boolean {
    if (this.phase !== 'pick' || from !== this.roller) return false;
    const idx = pawn - 1;
    const t = this.seat;
    if (!Number.isInteger(idx) || idx < 0 || idx >= t.pawns.length || this.dice === null) return false;
    const opt = this.optionFor(t, idx, this.dice);
    if (!opt) return false;
    this.doMove(opt, now, false);
    return true;
  }

  /* ---------------------------------------------------------------- clock */

  tick(now: number): void {
    // A phase can end inside one tick; keep going until it is in a state waiting for the future.
    for (let guard = 0; guard < 16; guard++) {
      if (!this.step(now)) return;
    }
  }

  private step(now: number): boolean {
    if (now < this.deadline) return false;
    switch (this.phase) {
      case 'intro':
        this.startTurn(0, false, this.deadline);
        return true;
      case 'roll':
        this.doRoll(this.deadline, true);
        return true;
      case 'rolling':
        this.resolveRoll(this.deadline);
        return true;
      case 'pick':
        this.doMove(bestOption(this.options), this.deadline, true);
        return true;
      case 'moving':
        this.afterMove(this.deadline);
        return true;
      case 'pass':
        this.next(this.deadline, this.lastPass === 'none' && this.dice === 6);
        return true;
      case 'finale':
        this.phase = 'ended';
        this.deadline = Number.POSITIVE_INFINITY;
        this.emit({ type: 'end' });
        return false;
      case 'ended':
        return false;
    }
  }

  /* ---------------------------------------------------------------- turn flow */

  private emit(e: LudoEvent): void {
    this.events.push(e);
  }

  private set(phase: Phase, at: number, ms: number): void {
    this.phase = phase;
    this.since = at;
    this.deadline = at + ms;
  }

  private startTurn(seatIndex: number, bonus: boolean, at: number): void {
    const t = this.seats[seatIndex]!;
    this.current = seatIndex;
    this.bonus = bonus;
    if (!bonus) {
      this.sixes = 0;
      this.roller = t.player;
    }
    this.dice = null;
    this.options = [];
    this.lastPass = null;
    this.set('roll', at, this.isConnected(this.roller) ? ROLL_MS : AWAY_MS);
    this.emit({ type: 'turn', seat: t.index, player: this.roller, bonus });
  }

  private next(at: number, bonus: boolean): void {
    if (bonus) this.startTurn(this.current, true, at);
    else this.startTurn((this.current + 1) % this.seats.length, false, at);
  }

  private doRoll(at: number, auto: boolean): void {
    const value = Math.max(1, Math.min(6, Math.floor(this.roll6())));
    this.dice = value;
    const s = this.stats.get(this.roller);
    if (s) {
      s.rolls++;
      if (value === 6) s.sixes++;
    }
    this.set('rolling', at, DICE_MS);
    this.emit({ type: 'roll', seat: this.current, player: this.roller, value, auto });
  }

  private resolveRoll(at: number): void {
    const value = this.dice ?? 1;
    const t = this.seat;
    if (value === 6) this.sixes++;
    if (this.sixes >= 3) {
      this.pass('triple', at);
      return;
    }
    const opts = this.legalMoves(t, value);
    if (opts.length === 0) {
      this.pass('none', at);
      return;
    }
    if (opts.length === 1) {
      this.doMove(opts[0]!, at, true);
      return;
    }
    this.options = opts;
    this.set('pick', at, this.isConnected(this.roller) ? PICK_MS : AWAY_MS);
    this.emit({ type: 'pick', seat: t.index, player: this.roller, options: opts });
  }

  private pass(reason: PassReason, at: number): void {
    this.lastPass = reason;
    this.set('pass', at, PASS_MS);
    this.emit({ type: 'pass', seat: this.current, player: this.roller, reason });
  }

  /** One legal move for a pawn, or null. */
  optionFor(t: Seat, pawn: number, value: number): MoveOption | null {
    const B = this.board;
    const from = t.pawns[pawn];
    if (from === undefined || from === B.home) return null;
    let to: number;
    if (from === BASE) {
      if (value !== 6) return null;
      to = 0;
    } else {
      to = from + value;
      if (to > B.home) return null;
    }
    const abs = absOf(B, t.color, to);
    const safe = abs !== null && B.safe.has(abs);
    const captures: Capture[] = [];
    if (abs !== null && !safe) {
      for (const o of this.seats) {
        if (o === t) continue;
        o.pawns.forEach((p, i) => {
          if (absOf(B, o.color, p) === abs) captures.push({ seat: o.index, pawn: i, from: p });
        });
      }
    }
    return { pawn, from, to, captures, exit: from === BASE, home: to === B.home, safe };
  }

  /** Legal moves, one per distinct starting square (pawns sharing a square move the same way). */
  legalMoves(t: Seat, value: number): MoveOption[] {
    const seen = new Set<number>();
    const out: MoveOption[] = [];
    t.pawns.forEach((from, i) => {
      if (seen.has(from)) return;
      const opt = this.optionFor(t, i, value);
      if (!opt) return;
      seen.add(from);
      out.push(opt);
    });
    return out;
  }

  private doMove(opt: MoveOption, at: number, auto: boolean): void {
    const t = this.seat;
    const path: number[] = [];
    if (opt.exit) path.push(0);
    else for (let p = opt.from + 1; p <= opt.to; p++) path.push(p);
    t.pawns[opt.pawn] = opt.to;
    for (const c of opt.captures) {
      const o = this.seats[c.seat]!;
      o.pawns[c.pawn] = BASE;
      o.lost++;
    }
    const s = this.stats.get(this.roller);
    if (s) {
      s.captures += opt.captures.length;
      s.steps += opt.exit ? 1 : opt.to - opt.from;
      if (opt.home) s.home++;
    }
    const move: MoveInfo = { ...opt, seat: t.index, player: this.roller, path, auto };
    this.lastMove = move;
    this.options = [];
    const ms = path.length * HOP_MS + (opt.captures.length ? CAPTURE_MS : 0) + SETTLE_MS;
    this.set('moving', at, ms);
    this.emit({ type: 'move', move });
  }

  private afterMove(at: number): void {
    const t = this.seat;
    if (this.homeCount(t) === t.pawns.length) {
      this.winner = t.index;
      this.set('finale', at, FINALE_MS);
      this.emit({ type: 'finish', seat: t.index });
      return;
    }
    this.next(at, this.dice === 6);
  }
}

/**
 * What an automatic move picks: capture, then reach home, then leave the base, then escape to a
 * safe square, then advance the pawn that is furthest along.
 */
export function bestOption(options: readonly MoveOption[]): MoveOption {
  let best = options[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const o of options) {
    const score =
      o.captures.length * 1000 + (o.home ? 500 : 0) + (o.exit ? 300 : 0) + (o.safe ? 100 : 0) + o.from;
    if (score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return best;
}

export interface Standing {
  seat: number;
  rank: number;
  home: number;
  /** Sum of all pawn progress (base counts as 0). */
  progress: number;
}

/** Winner first, then pawns home, then distance covered. Ties share a rank. */
export function standings(L: LudoLogic): Standing[] {
  const rows = L.seats.map((t) => ({
    seat: t.index,
    win: L.winner === t.index ? 1 : 0,
    home: L.homeCount(t),
    progress: t.pawns.reduce((s, p) => s + Math.max(0, p), 0),
  }));
  rows.sort((a, b) => b.win - a.win || b.home - a.home || b.progress - a.progress || a.seat - b.seat);
  const out: Standing[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const same = prev && prev.win === r.win && prev.home === r.home && prev.progress === r.progress;
    const rank = same ? out[i - 1]!.rank : i + 1;
    out.push({ seat: r.seat, rank, home: r.home, progress: r.progress });
  });
  return out;
}
