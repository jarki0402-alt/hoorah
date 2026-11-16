/**
 * Congklak computer brain (PRD 6.4). Pure: every candidate hole is played out with the real
 * sowing rules from logic.ts, scored, ranked, and one is picked with human-like slips.
 *
 * Used for the solo opponent and for a side whose phones all dropped mid-game.
 */
import { pickWithSlips } from '../common/cpu';
import { other, type Side, sow, storeOf, validHoles } from './logic';

/** Ending in the own store is worth a little on its own (another move follows). */
const EXTRA_BONUS = 2;
/** How much the opponent's best reply counts against a move (a bit under 1: people hope). */
const REPLY_WEIGHT = 0.85;

export interface RankedHole {
  pos: number;
  score: number;
}

/** Plies of lookahead for a skill level: 1 (gentle), 2, or 3 (sharp). */
export function depthFor(skill: number): number {
  if (skill < 0.35) return 1;
  if (skill < 0.75) return 2;
  return 3;
}

/** Best net gain `side` can reach from `board`, looking `depth` plies ahead. */
function bestValue(board: readonly number[], side: Side, depth: number): number {
  const holes = validHoles(board, side);
  if (holes.length === 0) return 0;
  let best = Number.NEGATIVE_INFINITY;
  for (const p of holes) best = Math.max(best, moveValue(board, side, p, depth));
  return best;
}

/**
 * Value of sowing `pit`: seeds gained by the own store (captures included), plus a small extra
 * turn bonus. With depth left, an extra turn adds the best follow-up, any other ending subtracts
 * the opponent's best reply.
 */
export function moveValue(board: readonly number[], side: Side, pit: number, depth: number): number {
  const own = storeOf(side);
  const t = sow(board, side, pit);
  const gain = t.after[own]! - board[own]!;
  const extra = t.outcome === 'store';
  if (depth <= 1) return gain + (extra ? EXTRA_BONUS : 0);
  if (extra) return gain + EXTRA_BONUS / 2 + bestValue(t.after, side, depth - 1);
  return gain - REPLY_WEIGHT * bestValue(t.after, other(side), depth - 1);
}

/**
 * Every legal hole of `side`, best first. Ties go to the hole nearest the own store (the higher
 * position on that side), which is what most players reach for.
 */
export function rankHoles(board: readonly number[], side: Side, depth: number): RankedHole[] {
  return validHoles(board, side)
    .map((pos) => ({ pos, score: moveValue(board, side, pos, depth) }))
    .sort((a, b) => b.score - a.score || b.pos - a.pos);
}

/** The hole the computer plays: ranked by skill-dependent lookahead, with occasional slips. */
export function chooseHole(
  board: readonly number[],
  side: Side,
  skill: number,
  rnd: () => number = Math.random,
): number {
  const ranked = rankHoles(board, side, depthFor(skill));
  if (ranked.length === 0) throw new Error(`side ${side} has no move`);
  return pickWithSlips(ranked, skill, rnd).pos;
}
