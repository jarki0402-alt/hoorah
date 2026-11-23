/**
 * The computer opponent's head for Ludo (PRD 6.4). It plays a solo human's opponent and takes over
 * a seat whose phone dropped mid-game. Pure: the board comes in, a ranked list of moves comes out,
 * and the pick itself goes through `pickWithSlips` so the opponent sometimes slips like a person.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import { bySkill, pickWithSlips, soloOpponents, thinkMs } from '../common/cpu';
import { absOf, type BoardSpec, type MoveOption, type Seat } from './logic';

/** Solo play: one opponent; two or more humans: none. */
export function ludoOpponents(humans: readonly PlayerInfo[], rnd: () => number = Math.random): PlayerInfo[] {
  return soloOpponents(humans, 1, rnd);
}

/** True when an opponent pawn could land on loop square `abs` with its next roll (1..6). */
export function threatened(
  board: BoardSpec,
  abs: number,
  me: Seat,
  seats: readonly Seat[],
  ignore: ReadonlySet<string> = new Set(),
): boolean {
  // Safe squares (start squares included, where base pawns come out) can't be hit.
  if (board.safe.has(abs)) return false;
  for (const o of seats) {
    if (o === me) continue;
    for (let i = 0; i < o.pawns.length; i++) {
      if (ignore.has(`${o.index}-${i}`)) continue;
      const p = o.pawns[i]!;
      const oa = absOf(board, o.color, p);
      if (oa === null) continue;
      const d = (abs - oa + board.trackLen) % board.trackLen;
      // The pawn must still be on the loop after d steps (not turned into its home column).
      if (d >= 1 && d <= 6 && p + d <= board.lastTrack) return true;
    }
  }
  return false;
}

/** Score tiers, highest first, matching the order of the heuristic list. */
const TIER = {
  capture: 100_000,
  home: 50_000,
  exit: 20_000,
  safe: 8_000,
  escape: 4_000,
  exposed: -3_000,
} as const;

/**
 * Moves ranked best first:
 * 1. capture an opponent, 2. reach home, 3. leave the base on a 6, 4. land on a safe square,
 * 5. escape a pawn that is in danger, 6. advance the pawn that is furthest along.
 * Landing where an opponent can hit next turn counts against a move.
 */
export function rankOptions(
  board: BoardSpec,
  options: readonly MoveOption[],
  me: Seat,
  seats: readonly Seat[],
): MoveOption[] {
  const scored = options.map((o, i) => ({ o, i, s: scoreOption(board, o, me, seats) }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.map((r) => r.o);
}

export function scoreOption(board: BoardSpec, o: MoveOption, me: Seat, seats: readonly Seat[]): number {
  let s = 0;
  if (o.captures.length) s += TIER.capture * o.captures.length + o.captures.reduce((a, c) => a + c.from, 0);
  if (o.home) s += TIER.home;
  if (o.exit) s += TIER.exit;
  const toAbs = absOf(board, me.color, o.to);
  // The home column (and home) can't be reached by anyone else: as good as a safe square.
  const sheltered = o.to > board.lastTrack || (toAbs !== null && board.safe.has(toAbs));
  if (sheltered && !o.home) s += TIER.safe;
  const fromAbs = absOf(board, me.color, o.from);
  const captured = new Set(o.captures.map((c) => `${c.seat}-${c.pawn}`));
  const inDanger = fromAbs !== null && threatened(board, fromAbs, me, seats);
  const exposed = !sheltered && toAbs !== null && threatened(board, toAbs, me, seats, captured);
  if (inDanger && !exposed) s += TIER.escape + o.from;
  if (exposed) s += TIER.exposed;
  // Advance the leading pawn.
  s += Math.max(0, o.from);
  return s;
}

/** The pawn the computer moves (0-based), with slips that get rarer as skill rises. */
export function choosePawn(
  board: BoardSpec,
  options: readonly MoveOption[],
  me: Seat,
  seats: readonly Seat[],
  skill: number,
  rnd: () => number = Math.random,
): number {
  return pickWithSlips(rankOptions(board, options, me, seats), skill, rnd).pawn;
}

/** How long the computer waits before acting (ms). Takeover seats play at a steady 1.5–3 s pace. */
export function actDelay(
  kind: 'roll' | 'pick',
  skill: number,
  takeover: boolean,
  options = 1,
  rnd: () => number = Math.random,
): number {
  if (takeover) return Math.round((kind === 'roll' ? 1500 : 1100) + rnd() * (kind === 'roll' ? 1500 : 900));
  if (kind === 'roll') return thinkMs(skill, 650, 1500, rnd);
  // More choices, a slightly longer look at the board.
  const extra = Math.min(3, Math.max(0, options - 1)) * bySkill(skill, 260, 160);
  return thinkMs(skill, 800, 1900, rnd) + Math.round(extra);
}
