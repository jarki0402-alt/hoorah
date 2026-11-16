/**
 * A small chess engine for the computer opponent (PRD 6.4): alpha-beta on the rules in chess.ts,
 * material plus simple square bonuses, captures first, and a short capture-only search at the
 * leaves. Pure; time comes in through `now`.
 *
 * Search depth, how far it looks into captures and how often it slips all follow the adaptive
 * skill (0..1). Each search stops at a node and time budget so a slow Smart TV never freezes:
 * iterative deepening keeps the last finished depth.
 */
import { pickWithSlips, wobble } from '../common/cpu';
import {
  fileOf,
  inCheck,
  legalMoves,
  type Move,
  makeMove,
  onBoard,
  type Position,
  pseudoLegalMoves,
  rowOf,
} from './chess';

export const MATE = 100_000;
const INF = 1_000_000;

const VALUE: Record<string, number> = { p: 100, n: 310, b: 325, r: 500, q: 900, k: 0 };
/** Safety margin for delta pruning in the capture search. */
const DELTA = 200;

/* ------------------------------------------------------------------ evaluation */

/**
 * Square bonus in centipawns for a piece of type `t` on (row, file), seen from its own side:
 * `rank` 0 is the own back rank, 7 the far end. Built from simple rules rather than tables.
 */
function squareBonus(t: string, rank: number, file: number, endgame: boolean): number {
  // 0 on the rim .. 6 in the four centre squares.
  const centre = 7 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
  switch (t) {
    case 'p': {
      const adv = rank - 1;
      let v = adv * (endgame ? 14 : 7);
      if ((file === 3 || file === 4) && adv >= 1) v += 14;
      if (rank === 6) v += 30;
      return v;
    }
    case 'n':
      return Math.round(centre * 8 - 26);
    case 'b':
      return Math.round(centre * 4 - 10);
    case 'r':
      return (rank === 6 ? 20 : 0) + (file === 3 || file === 4 ? 4 : 0);
    case 'q':
      return Math.round(centre * 2 - 5);
    case 'k':
      if (endgame) return Math.round(centre * 7 - 20);
      if (rank > 0) return -18 * rank;
      return file <= 2 || file >= 6 ? 22 : 0;
    default:
      return 0;
  }
}

/** Piece letter (either case) to value, so the hot paths never change string case. */
const WORTH: Record<string, number> = {};
for (const [t, v] of Object.entries(VALUE)) {
  WORTH[t] = v;
  WORTH[t.toUpperCase()] = v;
}

/**
 * Material plus square bonus per piece letter and 0x88 square, signed for white, built once:
 * index 0 for the middlegame, 1 for the endgame.
 */
const TABLES: [Record<string, Int16Array>, Record<string, Int16Array>] = [{}, {}];
for (const endgame of [false, true]) {
  const table = TABLES[endgame ? 1 : 0];
  for (const t of ['p', 'n', 'b', 'r', 'q', 'k']) {
    for (const white of [true, false]) {
      const arr = new Int16Array(128);
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) continue;
        const rank = white ? 7 - rowOf(sq) : rowOf(sq);
        const v = VALUE[t]! + squareBonus(t, rank, fileOf(sq), endgame);
        arr[sq] = white ? v : -v;
      }
      table[white ? t.toUpperCase() : t] = arr;
    }
  }
}

/** Static evaluation in centipawns from the side to move's point of view. */
export function evaluate(pos: Position): number {
  const board = pos.board;
  let nonPawn = 0;
  for (let sq = 0; sq < 120; sq++) {
    const p = board[sq];
    if (p && p !== 'p' && p !== 'P') nonPawn += WORTH[p]!;
  }
  const table = TABLES[nonPawn <= 1_600 ? 1 : 0];
  let score = 0;
  let bishopsW = 0;
  let bishopsB = 0;
  for (let sq = 0; sq < 120; sq++) {
    const p = board[sq];
    if (!p) continue;
    score += table[p]![sq]!;
    if (p === 'B') bishopsW++;
    else if (p === 'b') bishopsB++;
  }
  if (bishopsW >= 2) score += 30;
  if (bishopsB >= 2) score -= 30;
  return pos.turn === 'w' ? score : -score;
}

/* ------------------------------------------------------------------ search */

/** Captures (most valuable victim, least valuable attacker) and promotions first. */
function orderScore(m: Move): number {
  let s = 0;
  if (m.captured) s += 10_000 + 10 * WORTH[m.captured]! - WORTH[m.piece]!;
  if (m.promo) s += 8_000 + VALUE[m.promo]!;
  return s;
}

/** Moves sorted for search; moves in `prior` (best first) go ahead of everything else. */
function ordered(moves: Move[], prior: readonly Move[] = []): Move[] {
  const scored = moves.map((m) => {
    const i = prior.findIndex((p) => same(m, p));
    return { m, s: orderScore(m) + (i >= 0 ? 1_000_000 - i : 0) };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.m);
}

const same = (a: Move, b: Move) => a.from === b.from && a.to === b.to && a.promo === b.promo;

class Abort extends Error {}

export interface SearchLevel {
  /** Full-width plies. */
  depth: number;
  /** Plies of capture-only search at the leaves. */
  qDepth: number;
  /** Root moves within this many centipawns of the best stay candidates for a slip. */
  margin: number;
}

/** How the engine plays at a skill level: about 1 ply when gentle up to 3 plies when sharp. */
export function levelFor(skill: number): SearchLevel {
  const depth = skill < 0.3 ? 1 : skill < 0.65 ? 2 : 3;
  const qDepth = skill < 0.3 ? 1 : skill < 0.65 ? 2 : 3;
  const margin = Math.round(350 - 310 * Math.min(1, Math.max(0, skill)));
  return { depth, qDepth, margin };
}

export interface EngineOptions {
  skill: number;
  /** Time budget for one search (ms). */
  maxMs?: number;
  /** Node budget for one search. */
  maxNodes?: number;
  rnd?: () => number;
  /** Clock for the time budget (ms). */
  now?: () => number;
  /** Times a position was seen in this game; a root move into a third repetition scores 0. */
  repeats?: (pos: Position) => number;
}

export interface ScoredMove {
  move: Move;
  score: number;
}

export interface EngineResult {
  move: Move;
  /** Deepest finished iteration. */
  depth: number;
  nodes: number;
  /** Root candidates within the slip margin, best first. */
  ranked: ScoredMove[];
}

export const DEFAULT_MAX_MS = 120;
export const DEFAULT_MAX_NODES = 40_000;

/** Picks the computer's move. Throws if the position has no legal move. */
export function chooseMove(pos: Position, opts: EngineOptions): EngineResult {
  const rnd = opts.rnd ?? Math.random;
  const clock = opts.now ?? (() => performance.now());
  const level = levelFor(opts.skill);
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const rootMoves = legalMoves(pos);
  if (rootMoves.length === 0) throw new Error('no legal move');
  const start = clock();
  let nodes = 0;
  let armed = false;

  const tick = () => {
    nodes++;
    if (armed && (nodes >= maxNodes || ((nodes & 63) === 0 && clock() - start >= maxMs))) throw new Abort();
  };

  const quiesce = (p: Position, alpha: number, beta: number, ply: number, q: number): number => {
    tick();
    if (q <= 0) return evaluate(p);
    if (inCheck(p)) {
      // In check: every evasion counts, and none means mate.
      const moves = legalMoves(p);
      if (moves.length === 0) return -MATE + ply;
      let best = Number.NEGATIVE_INFINITY;
      for (const m of ordered(moves)) {
        const score = -quiesce(makeMove(p, m), -beta, -alpha, ply + 1, q - 1);
        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
      return best;
    }
    const stand = evaluate(p);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    let best = stand;
    const list = pseudoLegalMoves(p).filter((m) => m.captured || m.promo === 'q');
    for (const m of ordered(list)) {
      // Delta pruning: even winning this piece for free would not lift the score to alpha.
      if (!m.promo && stand + WORTH[m.captured!]! + DELTA <= alpha) continue;
      const child = makeMove(p, m);
      if (inCheck(child, p.turn)) continue;
      const score = -quiesce(child, -beta, -alpha, ply + 1, q - 1);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  };

  const search = (p: Position, depth: number, alpha: number, beta: number, ply: number): number => {
    if (depth <= 0) return quiesce(p, alpha, beta, ply, level.qDepth);
    tick();
    if (p.halfmove >= 100) return 0;
    let best = Number.NEGATIVE_INFINITY;
    let legal = 0;
    // Legality is checked lazily: a cutoff often comes before most moves are even made.
    for (const m of ordered(pseudoLegalMoves(p))) {
      const child = makeMove(p, m);
      if (inCheck(child, p.turn)) continue;
      legal++;
      const score = -search(child, depth - 1, -beta, -alpha, ply + 1);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    if (legal === 0) return inCheck(p) ? -MATE + ply : 0;
    return best;
  };

  /** One root iteration: exact scores for moves within `margin` of the best, bounds for the rest. */
  const root = (depth: number, prior: readonly Move[]): ScoredMove[] => {
    const out: ScoredMove[] = [];
    let best = Number.NEGATIVE_INFINITY;
    for (const m of ordered(rootMoves, prior)) {
      const child = makeMove(pos, m);
      let score: number;
      if (opts.repeats && opts.repeats(child) >= 2) {
        score = 0;
      } else {
        const floor = best === Number.NEGATIVE_INFINITY ? -INF : best - level.margin;
        score = -search(child, depth - 1, -INF, -floor, 1);
      }
      out.push({ move: m, score });
      if (score > best) best = score;
    }
    return out.filter((s) => s.score >= best - level.margin).sort((a, b) => b.score - a.score);
  };

  // Depth 1 always finishes; deeper iterations stop at the budget and are thrown away.
  let ranked = root(1, []);
  let done = 1;
  armed = true;
  for (let d = 2; d <= level.depth; d++) {
    try {
      ranked = root(
        d,
        ranked.map((s) => s.move),
      );
      done = d;
    } catch (e) {
      if (e instanceof Abort) break;
      throw e;
    }
  }

  // A touch of noise so games differ; a mate stays a mate.
  const noise = 8 + 40 * (1 - Math.min(1, Math.max(0, opts.skill)));
  const noisy = ranked
    .map((s) => ({ ...s, n: Math.abs(s.score) >= MATE - 100 ? s.score : s.score + wobble(rnd) * noise }))
    .sort((a, b) => b.n - a.n)
    .map(({ move, score }) => ({ move, score }));
  const mate = noisy[0] && noisy[0].score >= MATE - 100;
  const pick = mate ? noisy[0]! : pickWithSlips(noisy, opts.skill, rnd);
  return { move: pick.move, depth: done, nodes, ranked: noisy };
}
