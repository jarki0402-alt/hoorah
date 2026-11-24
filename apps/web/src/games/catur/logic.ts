/**
 * Catur match logic: who plays which colour, chess clocks, team votes (Catur Rame) and the end
 * of the game. Pure and deterministic: time comes in as `now` (server ms), randomness from a
 * seed. The driver (main.tsx) turns the events into sound, views and the main-screen render.
 */
import {
  type Color,
  findMove,
  hasMatingMaterial,
  inCheck,
  legalMoves,
  type Move,
  makeMove,
  opposite,
  type Position,
  parseFen,
  positionKey,
  START_FEN,
  san,
  sqName,
  statusOf,
  uci,
} from './chess';

export type Mode = 'duel' | 'team';
export type Phase = 'intro' | 'play' | 'over' | 'ended';
export type EndReason =
  | 'checkmate'
  | 'timeout'
  | 'resign'
  | 'stalemate'
  | 'insufficient'
  | 'repetition'
  | 'fifty'
  | 'timeout-draw';

export interface Outcome {
  /** null = draw. */
  winner: Color | null;
  reason: EndReason;
}

export interface PlayerPresence {
  id: number;
  connected: boolean;
}

export interface PlayedMove {
  uci: string;
  san: string;
  color: Color;
  /** Captured piece (FEN letter), if any. */
  captured?: string;
  promo?: string;
  castle: boolean;
  check: boolean;
  /** Players who chose it: the mover in a duel, the voters in team mode (empty = random pick). */
  by: number[];
}

export type CaturEvent =
  | { type: 'start' }
  | { type: 'move'; move: PlayedMove; random: boolean }
  | { type: 'vote'; color: Color; playerId: number; move: string }
  | { type: 'low'; color: Color; seconds: number }
  | { type: 'over'; outcome: Outcome }
  | { type: 'ended' };

export interface VoteTally {
  move: string;
  count: number;
  voters: number[];
  /** Order of the earliest current proposal of this move (ties go to the earliest). */
  first: number;
}

export interface CaturConfig {
  seed: number;
  now: number;
  /** Minutes per side (settings.rounds). */
  minutes: number;
  players: PlayerPresence[];
  /** Start position (tests). */
  fen?: string;
  /** Duel only: fixed colours instead of a random draw (solo game against the computer). */
  seats?: { w: number; b: number };
}

export const INTRO_MS = 3200;
export const OVER_MS = 6500;
/** Team mode: how long a team has to agree on a move. */
export const VOTE_MS = 20_000;
/** Team mode: once everyone on the team has voted, the move is played after this pause. */
export const VOTE_SETTLE_MS = 900;
/** Clock seconds left at which the main screen starts ticking. */
export const LOW_TIME_S = 10;

/** Fischer increment per move: 2 s in Kilat (3 min), 5 s in Normal. */
export function incrementFor(minutes: number): number {
  return minutes <= 5 ? 2000 : 5000;
}

/** Deterministic PRNG (mulberry32). */
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

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface PlayerStats {
  /** Duel: moves made. Team: own proposals that were played. */
  moves: number;
  /** Material captured by moves this player chose. */
  captured: number;
  votes: number;
}

export class CaturMatch {
  readonly mode: Mode;
  readonly minutes: number;
  readonly increment: number;
  /** Players per colour. In a 1-player test game the same player plays both. */
  readonly sides: { w: number[]; b: number[] } = { w: [], b: [] };
  /** Joined after the start of a duel: they watch. */
  readonly spectators: number[] = [];
  phase: Phase = 'intro';
  pos: Position;
  moves: Move[];
  history: PlayedMove[] = [];
  outcome: Outcome | null = null;
  held = false;
  /** Ms left per colour as of `clockAt`; the side to move runs while playing and not held. */
  clock: { w: number; b: number };
  clockAt: number;
  /** End of the intro, the vote, or the game-over screen (each frozen while held). */
  phaseUntil: number;
  voteUntil = 0;
  private heldLeft = { phase: 0, vote: 0 };
  private readonly votes = new Map<number, { move: string; order: number }>();
  private voteOrder = 0;
  private readonly rand: () => number;
  private readonly seen = new Map<string, number>();
  private lowCue = Number.POSITIVE_INFINITY;
  readonly stats = new Map<number, PlayerStats>();
  private readonly connected = new Set<number>();

  constructor(cfg: CaturConfig) {
    this.rand = rng(cfg.seed);
    this.minutes = cfg.minutes;
    this.increment = incrementFor(cfg.minutes);
    const ms = cfg.minutes * 60_000;
    this.clock = { w: ms, b: ms };
    this.clockAt = cfg.now;
    this.pos = parseFen(cfg.fen ?? START_FEN);
    this.moves = legalMoves(this.pos);
    this.seen.set(positionKey(this.pos), 1);
    const ids = cfg.players.map((p) => p.id);
    for (const p of cfg.players) if (p.connected) this.connected.add(p.id);
    for (const id of ids) this.stats.set(id, { moves: 0, captured: 0, votes: 0 });
    this.mode = ids.length >= 3 ? 'team' : 'duel';
    const order = shuffle(ids, this.rand);
    if (this.mode === 'duel') {
      if (cfg.seats && ids.includes(cfg.seats.w) && ids.includes(cfg.seats.b)) {
        this.sides.w.push(cfg.seats.w);
        this.sides.b.push(cfg.seats.b);
      } else if (order.length === 1) {
        this.sides.w.push(order[0]!);
        this.sides.b.push(order[0]!);
      } else {
        if (order[0] !== undefined) this.sides.w.push(order[0]);
        if (order[1] !== undefined) this.sides.b.push(order[1]);
      }
    } else {
      const whiteFirst = this.rand() < 0.5;
      order.forEach((id, i) => {
        const white = i % 2 === 0 ? whiteFirst : !whiteFirst;
        this.sides[white ? 'w' : 'b'].push(id);
      });
    }
    this.phaseUntil = cfg.now + INTRO_MS;
  }

  get turn(): Color {
    return this.pos.turn;
  }

  get running(): boolean {
    return this.phase === 'play' && !this.held;
  }

  colorOf(id: number): Color | null {
    const w = this.sides.w.includes(id);
    const b = this.sides.b.includes(id);
    if (w && b) return this.turn;
    return w ? 'w' : b ? 'b' : null;
  }

  isConnected(id: number): boolean {
    return this.connected.has(id);
  }

  /** Ms left for `c` at `now`. */
  timeLeft(c: Color, now: number): number {
    const base = this.clock[c];
    if (this.running && this.turn === c) return Math.max(0, base - (now - this.clockAt));
    return Math.max(0, base);
  }

  /** May this player move (duel) or vote (team) right now? */
  canAct(id: number): boolean {
    return this.running && this.colorOf(id) === this.turn;
  }

  check(): number {
    return inCheck(this.pos) ? this.pos.kings[this.turn] : -1;
  }

  /** Team mode: the current proposals, most votes first, ties by earliest proposal. */
  tally(): VoteTally[] {
    const by = new Map<string, VoteTally>();
    for (const [id, v] of this.votes) {
      let t = by.get(v.move);
      if (!t) {
        t = { move: v.move, count: 0, voters: [], first: v.order };
        by.set(v.move, t);
      }
      t.count++;
      t.voters.push(id);
      t.first = Math.min(t.first, v.order);
    }
    return [...by.values()].sort((a, b) => b.count - a.count || a.first - b.first);
  }

  voteOf(id: number): string | undefined {
    return this.votes.get(id)?.move;
  }

  /** Players of the side to move who are connected (team-mode quorum). */
  private activeVoters(): number[] {
    return this.sides[this.turn].filter((id) => this.connected.has(id));
  }

  /* ------------------------------------------------------------------ time */

  tick(now: number): CaturEvent[] {
    if (this.held) return [];
    const events: CaturEvent[] = [];
    if (this.phase === 'intro') {
      if (now >= this.phaseUntil) {
        this.phase = 'play';
        this.clockAt = now;
        this.startTurn(now);
        events.push({ type: 'start' });
      }
      return events;
    }
    if (this.phase === 'over') {
      if (now >= this.phaseUntil) {
        this.phase = 'ended';
        events.push({ type: 'ended' });
      }
      return events;
    }
    if (this.phase !== 'play') return events;
    const left = this.timeLeft(this.turn, now);
    if (left <= 0) {
      this.foldClock(now);
      this.clock[this.turn] = 0;
      const winner = opposite(this.turn);
      const draw = !hasMatingMaterial(this.pos, winner);
      return [
        this.finish(draw ? { winner: null, reason: 'timeout-draw' } : { winner, reason: 'timeout' }, now),
      ];
    }
    const secs = Math.ceil(left / 1000);
    if (secs <= LOW_TIME_S && secs < this.lowCue) {
      this.lowCue = secs;
      events.push({ type: 'low', color: this.turn, seconds: secs });
    }
    if (this.mode === 'team' && now >= this.voteUntil) events.push(...this.resolveVote(now));
    return events;
  }

  /** Pause (Host menu) or resume. Clocks and every countdown freeze while held. */
  setHeld(hold: boolean, now: number): void {
    if (hold === this.held) return;
    if (hold) {
      this.foldClock(now);
      this.heldLeft = { phase: this.phaseUntil - now, vote: this.voteUntil - now };
      this.held = true;
    } else {
      this.held = false;
      this.clockAt = now;
      this.phaseUntil = now + this.heldLeft.phase;
      this.voteUntil = now + this.heldLeft.vote;
    }
  }

  private foldClock(now: number): void {
    if (this.running) this.clock[this.turn] = Math.max(0, this.clock[this.turn] - (now - this.clockAt));
    this.clockAt = now;
  }

  private startTurn(now: number): void {
    this.votes.clear();
    this.lowCue = Number.POSITIVE_INFINITY;
    this.voteUntil = now + VOTE_MS;
  }

  /* ------------------------------------------------------------------ input */

  /** A phone sent a move: played at once in a duel, a vote in team mode. Invalid input is ignored. */
  submit(id: number, text: string | undefined, now: number): CaturEvent[] {
    if (!text || !this.canAct(id)) return [];
    // A clock that ran out before this tick still loses, even if a move arrives.
    const timeout = this.tick(now);
    if (timeout.some((e) => e.type === 'over') || !this.canAct(id)) return timeout;
    const move = findMove(this.moves, text);
    if (!move) return timeout;
    if (this.mode === 'duel') return [...timeout, ...this.play(move, [id], false, now)];
    const prev = this.votes.get(id);
    if (prev?.move === text) return timeout;
    this.votes.set(id, { move: text, order: ++this.voteOrder });
    const s = this.stats.get(id);
    if (s) s.votes++;
    const events: CaturEvent[] = [...timeout, { type: 'vote', color: this.turn, playerId: id, move: text }];
    const voters = this.activeVoters();
    if (voters.length > 0 && voters.every((v) => this.votes.has(v))) {
      this.voteUntil = Math.min(this.voteUntil, now + VOTE_SETTLE_MS);
    }
    return events;
  }

  /**
   * The side to move plays `text` at once, chosen by the computer: its own seat in a solo duel,
   * or a seat (duel) or whole team (Catur Rame) whose phones dropped. `by` gets the credit.
   */
  autoMove(text: string, by: number[], now: number): CaturEvent[] {
    if (!this.running) return [];
    const timeout = this.tick(now);
    if (timeout.some((e) => e.type === 'over') || !this.running) return timeout;
    const move = findMove(this.moves, text);
    if (!move) return timeout;
    return [...timeout, ...this.play(move, by, false, now)];
  }

  /** How often a position has occurred in this game (threefold repetition is a draw). */
  timesSeen(pos: Position): number {
    return this.seen.get(positionKey(pos)) ?? 0;
  }

  /** Duel only: the player gives up. */
  resign(id: number, now: number): CaturEvent[] {
    if (this.mode !== 'duel' || this.phase !== 'play' || this.held) return [];
    const c = this.colorOf(id);
    if (!c || (this.sides.w.includes(id) && this.sides.b.includes(id))) return [];
    this.foldClock(now);
    return [this.finish({ winner: opposite(c), reason: 'resign' }, now)];
  }

  private resolveVote(now: number): CaturEvent[] {
    const top = this.tally()[0];
    let move = top ? findMove(this.moves, top.move) : null;
    const random = !move;
    if (!move) move = this.moves[Math.floor(this.rand() * this.moves.length)] ?? null;
    if (!move) return [];
    return this.play(move, top?.voters ?? [], random, now);
  }

  private play(move: Move, by: number[], random: boolean, now: number): CaturEvent[] {
    this.foldClock(now);
    const color = this.turn;
    const text = san(this.pos, move, this.moves);
    this.clock[color] += this.increment;
    this.pos = makeMove(this.pos, move);
    this.moves = legalMoves(this.pos);
    const played: PlayedMove = {
      uci: uci(move),
      san: text,
      color,
      castle: text.startsWith('O-O'),
      check: inCheck(this.pos),
      by,
    };
    if (move.captured) played.captured = move.captured;
    if (move.promo) played.promo = move.promo;
    this.history.push(played);
    const value = move.captured ? pieceWorth(move.captured) : 0;
    for (const id of by) {
      const s = this.stats.get(id);
      if (!s) continue;
      s.moves++;
      s.captured += value;
    }
    const events: CaturEvent[] = [{ type: 'move', move: played, random }];
    const key = positionKey(this.pos);
    const seen = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, seen);
    const status = statusOf(this.pos, this.moves);
    if (status === 'checkmate') events.push(this.finish({ winner: color, reason: 'checkmate' }, now));
    else if (status !== 'play') events.push(this.finish({ winner: null, reason: status }, now));
    else if (seen >= 3) events.push(this.finish({ winner: null, reason: 'repetition' }, now));
    else this.startTurn(now);
    return events;
  }

  private finish(outcome: Outcome, now: number): CaturEvent {
    this.outcome = outcome;
    this.phase = 'over';
    this.phaseUntil = now + OVER_MS;
    this.votes.clear();
    return { type: 'over', outcome };
  }

  /* ------------------------------------------------------------------ players */

  /** Connection changes; late joiners watch a duel or join the smaller team. */
  syncPlayers(players: PlayerPresence[], now: number): CaturEvent[] {
    this.connected.clear();
    for (const p of players) {
      if (p.connected) this.connected.add(p.id);
      if (!this.stats.has(p.id)) this.stats.set(p.id, { moves: 0, captured: 0, votes: 0 });
      const known =
        this.sides.w.includes(p.id) || this.sides.b.includes(p.id) || this.spectators.includes(p.id);
      if (known) continue;
      if (this.mode === 'duel') this.spectators.push(p.id);
      else (this.sides.w.length <= this.sides.b.length ? this.sides.w : this.sides.b).push(p.id);
    }
    // A teammate dropped out and everyone left has voted: settle the vote now.
    if (this.mode === 'team' && this.running && this.votes.size > 0) {
      const voters = this.activeVoters();
      if (voters.length > 0 && voters.every((v) => this.votes.has(v))) {
        this.voteUntil = Math.min(this.voteUntil, now + VOTE_SETTLE_MS);
      }
    }
    return [];
  }

  /** Captured pieces per capturing colour (what `w` took from black, and vice versa). */
  captures(): { w: string[]; b: string[] } {
    const out: { w: string[]; b: string[] } = { w: [], b: [] };
    for (const m of this.history) if (m.captured) out[m.color].push(m.captured);
    const rank = (p: string) => -pieceWorth(p);
    out.w.sort((a, b) => rank(a) - rank(b));
    out.b.sort((a, b) => rank(a) - rank(b));
    return out;
  }

  /** Material balance from white's point of view. */
  material(): number {
    const c = this.captures();
    return c.w.reduce((s, p) => s + pieceWorth(p), 0) - c.b.reduce((s, p) => s + pieceWorth(p), 0);
  }

  lastMove(): PlayedMove | undefined {
    return this.history[this.history.length - 1];
  }

  /** "e2e4" -> "e4" in the current position (vote rows); unknown moves come back unchanged. */
  sanOf(move: string): string {
    const m = findMove(this.moves, move);
    return m ? san(this.pos, m, this.moves) : move;
  }

  /** Square name of the king in check, if any. */
  checkSquare(): string | undefined {
    const sq = this.check();
    return sq >= 0 ? sqName(sq) : undefined;
  }
}

const WORTH: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function pieceWorth(p: string): number {
  return WORTH[p.toLowerCase()] ?? 0;
}

/* ------------------------------------------------------------------ results */

export interface RankRow {
  playerId: number;
  score: number;
  rank: number;
  label?: string;
}

/** Winners rank 1, losers rank 2; a draw ranks everybody 1. Spectators are left out. */
export function rankings(match: CaturMatch, label: (c: Color, won: boolean | null) => string): RankRow[] {
  const rows: RankRow[] = [];
  const w = match.outcome?.winner ?? null;
  const done = new Set<number>();
  for (const c of ['w', 'b'] as const) {
    for (const id of match.sides[c]) {
      if (done.has(id)) continue;
      done.add(id);
      const won = w === null ? null : w === c;
      rows.push({
        playerId: id,
        score: won === null ? 1 : won ? 2 : 0,
        rank: won === false ? 2 : 1,
        label: label(c, won),
      });
    }
  }
  return rows.sort((a, b) => a.rank - b.rank);
}
