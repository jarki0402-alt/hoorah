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
 * 2 to 4 players get one colour each. 5 to 8 players play in teams of two per colour, and
 * teammates alternate turns (a bonus roll stays with whoever rolled the 6).
 */

/** Squares on the shared loop around the board. */
export const TRACK_LEN = 52;
/** Squares in each colour's home column. */
export const HOME_COL = 5;
/** Progress of a pawn still in its base. */
export const BASE = -1;
/** Last progress on the shared loop (the square before the home column). */
export const LAST_TRACK = TRACK_LEN - 2;
/** Progress of a pawn that reached home (the centre). */
export const HOME = LAST_TRACK + HOME_COL + 1;
/** Loop index of each colour's start square (0 Merah, 1 Hijau, 2 Kuning, 3 Biru; clockwise). */
export const START_ABS = [0, 13, 26, 39] as const;
/** Start squares and the star squares eight steps after them. */
export const SAFE_ABS: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

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

export type ColorId = 0 | 1 | 2 | 3;

export type Phase = 'intro' | 'roll' | 'rolling' | 'pick' | 'moving' | 'pass' | 'finale' | 'ended';

export interface RosterEntry {
  id: number;
  connected: boolean;
}

export interface Team {
  index: number;
  color: ColorId;
  members: number[];
  /** Progress per pawn: BASE, 0..LAST_TRACK on the loop, then the home column, HOME at the end. */
  pawns: number[];
  /** Turns this colour has started (picks whose turn it is inside a team). */
  turns: number;
  /** Pawns of this colour sent home by opponents. */
  lost: number;
}

export interface PlayerStats {
  id: number;
  team: number;
  rolls: number;
  sixes: number;
  captures: number;
  /** Pawns brought home by this player. */
  home: number;
  /** Steps walked by pawns this player moved. */
  steps: number;
}

export interface Capture {
  team: number;
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
  team: number;
  player: number;
  /** Progress after each hop (a pawn leaving the base makes one hop to its start square). */
  path: number[];
  auto: boolean;
}

export type PassReason = 'none' | 'triple';

export type LudoEvent =
  | { type: 'intro' }
  | { type: 'turn'; team: number; player: number; bonus: boolean }
  | { type: 'roll'; team: number; player: number; value: number; auto: boolean }
  | { type: 'pick'; team: number; player: number; options: MoveOption[] }
  | { type: 'move'; move: MoveInfo }
  | { type: 'pass'; team: number; player: number; reason: PassReason }
  | { type: 'finish'; team: number }
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
export function absOf(color: ColorId, progress: number): number | null {
  if (progress < 0 || progress > LAST_TRACK) return null;
  return (START_ABS[color] + progress) % TRACK_LEN;
}

/** Colours used for n teams: two players sit opposite each other. */
export function colorsFor(teams: number): ColorId[] {
  if (teams <= 1) return [0];
  if (teams === 2) return [0, 2];
  if (teams === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

/** Player ids per team, in join order: up to 4 play alone, 5..8 play in pairs. */
export function makeTeams(ids: readonly number[]): number[][] {
  const n = ids.length;
  if (n <= 4) return ids.map((id) => [id]);
  const count = Math.min(4, Math.ceil(n / 2));
  const teams: number[][] = Array.from({ length: count }, () => []);
  ids.forEach((id, i) => {
    teams[i % count]!.push(id);
  });
  return teams;
}

export function clampPawns(v: unknown): number {
  const n = Number(v);
  return n >= 4 ? 4 : 2;
}

export class LudoLogic {
  readonly pawnCount: number;
  readonly teams: Team[];
  readonly stats = new Map<number, PlayerStats>();
  phase: Phase = 'intro';
  /** Team whose turn it is. */
  current = 0;
  /** Player rolling for the current team. */
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
    const ids = opts.roster.filter((r) => r.connected).map((r) => r.id);
    const groups = makeTeams(ids.length ? ids : opts.roster.map((r) => r.id));
    const colors = colorsFor(groups.length);
    this.teams = groups.map((members, index) => ({
      index,
      color: colors[index]!,
      members,
      pawns: Array.from({ length: this.pawnCount }, () => BASE),
      turns: 0,
      lost: 0,
    }));
    for (const t of this.teams)
      for (const id of t.members)
        this.stats.set(id, { id, team: t.index, rolls: 0, sixes: 0, captures: 0, home: 0, steps: 0 });
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

  /** Every player in a team, in join order. */
  get participants(): number[] {
    return this.teams.flatMap((t) => t.members);
  }

  get team(): Team {
    return this.teams[this.current]!;
  }

  teamOf(playerId: number): Team | null {
    return this.teams.find((t) => t.members.includes(playerId)) ?? null;
  }

  isConnected(id: number): boolean {
    return this.connected.get(id) ?? false;
  }

  homeCount(team: Team): number {
    return team.pawns.filter((p) => p === HOME).length;
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
    const t = this.team;
    if (!this.isConnected(this.roller)) {
      // Hand the turn to a connected teammate, or let the colour play itself.
      const mate = t.members.find((id) => id !== this.roller && this.isConnected(id));
      if (mate !== undefined) {
        this.roller = mate;
        this.deadline = Math.max(this.deadline, now + 5000);
        this.emit({ type: 'turn', team: t.index, player: mate, bonus: this.bonus });
        if (this.phase === 'pick')
          this.emit({ type: 'pick', team: t.index, player: mate, options: this.options });
      } else {
        this.deadline = Math.min(this.deadline, now + AWAY_MS);
      }
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
    const t = this.team;
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

  /** Who rolls for a team this turn: teammates alternate; a connected one is preferred. */
  private pickRoller(t: Team): number {
    const n = t.members.length;
    for (let k = 0; k < n; k++) {
      const id = t.members[(t.turns + k) % n]!;
      if (this.isConnected(id)) return id;
    }
    return t.members[t.turns % n]!;
  }

  private startTurn(teamIndex: number, bonus: boolean, at: number): void {
    const t = this.teams[teamIndex]!;
    this.current = teamIndex;
    this.bonus = bonus;
    if (!bonus) {
      this.sixes = 0;
      this.roller = this.pickRoller(t);
      t.turns++;
    }
    this.dice = null;
    this.options = [];
    this.lastPass = null;
    this.set('roll', at, this.isConnected(this.roller) ? ROLL_MS : AWAY_MS);
    this.emit({ type: 'turn', team: t.index, player: this.roller, bonus });
  }

  private next(at: number, bonus: boolean): void {
    if (bonus) this.startTurn(this.current, true, at);
    else this.startTurn((this.current + 1) % this.teams.length, false, at);
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
    this.emit({ type: 'roll', team: this.current, player: this.roller, value, auto });
  }

  private resolveRoll(at: number): void {
    const value = this.dice ?? 1;
    const t = this.team;
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
    this.emit({ type: 'pick', team: t.index, player: this.roller, options: opts });
  }

  private pass(reason: PassReason, at: number): void {
    this.lastPass = reason;
    this.set('pass', at, PASS_MS);
    this.emit({ type: 'pass', team: this.current, player: this.roller, reason });
  }

  /** One legal move for a pawn, or null. */
  optionFor(t: Team, pawn: number, value: number): MoveOption | null {
    const from = t.pawns[pawn];
    if (from === undefined || from === HOME) return null;
    let to: number;
    if (from === BASE) {
      if (value !== 6) return null;
      to = 0;
    } else {
      to = from + value;
      if (to > HOME) return null;
    }
    const abs = absOf(t.color, to);
    const safe = abs !== null && SAFE_ABS.has(abs);
    const captures: Capture[] = [];
    if (abs !== null && !safe) {
      for (const o of this.teams) {
        if (o === t) continue;
        o.pawns.forEach((p, i) => {
          if (absOf(o.color, p) === abs) captures.push({ team: o.index, pawn: i, from: p });
        });
      }
    }
    return { pawn, from, to, captures, exit: from === BASE, home: to === HOME, safe };
  }

  /** Legal moves, one per distinct starting square (pawns sharing a square move the same way). */
  legalMoves(t: Team, value: number): MoveOption[] {
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
    const t = this.team;
    const path: number[] = [];
    if (opt.exit) path.push(0);
    else for (let p = opt.from + 1; p <= opt.to; p++) path.push(p);
    t.pawns[opt.pawn] = opt.to;
    for (const c of opt.captures) {
      const o = this.teams[c.team]!;
      o.pawns[c.pawn] = BASE;
      o.lost++;
    }
    const s = this.stats.get(this.roller);
    if (s) {
      s.captures += opt.captures.length;
      s.steps += opt.exit ? 1 : opt.to - opt.from;
      if (opt.home) s.home++;
    }
    const move: MoveInfo = { ...opt, team: t.index, player: this.roller, path, auto };
    this.lastMove = move;
    this.options = [];
    const ms = path.length * HOP_MS + (opt.captures.length ? CAPTURE_MS : 0) + SETTLE_MS;
    this.set('moving', at, ms);
    this.emit({ type: 'move', move });
  }

  private afterMove(at: number): void {
    const t = this.team;
    if (this.homeCount(t) === t.pawns.length) {
      this.winner = t.index;
      this.set('finale', at, FINALE_MS);
      this.emit({ type: 'finish', team: t.index });
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
  team: number;
  rank: number;
  home: number;
  /** Sum of all pawn progress (base counts as 0). */
  progress: number;
}

/** Winner first, then pawns home, then distance covered. Ties share a rank. */
export function standings(L: LudoLogic): Standing[] {
  const rows = L.teams.map((t) => ({
    team: t.index,
    win: L.winner === t.index ? 1 : 0,
    home: L.homeCount(t),
    progress: t.pawns.reduce((s, p) => s + Math.max(0, p), 0),
  }));
  rows.sort((a, b) => b.win - a.win || b.home - a.home || b.progress - a.progress || a.team - b.team);
  const out: Standing[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const same = prev && prev.win === r.win && prev.home === r.home && prev.progress === r.progress;
    const rank = same ? out[i - 1]!.rank : i + 1;
    out.push({ team: r.team, rank, home: r.home, progress: r.progress });
  });
  return out;
}
