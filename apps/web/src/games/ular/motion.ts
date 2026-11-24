/**
 * Where things are on the board at a given moment: a token along its move plan, the dice face,
 * the duel clock. Pure, shared by the Host's driver and a far-away main screen (long-distance
 * play) so both animate a move the same way from the same plan.
 */
import { type Board, cellCenter, type Jump, jumpPoint, type Pt } from './board';
import { DUEL_INTRO_MS, DUEL_MS, HOP_MS, jumpMs } from './logic';
import { STR } from './strings';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeIn = (k: number) => k * k * (1.6 - 0.6 * k);

/** The part of a move plan that drives the token (`MovePlan` fits). */
export interface MotionPlan {
  from: number;
  path: readonly number[];
  landed: number;
  jump: Jump | null;
  hopStart: number;
  jumpStart: number;
  end: number;
}

export interface Pose {
  /** Board position in cell units. */
  p: Pt;
  /** Hop height, cell units. */
  lift: number;
  moving: boolean;
  /** Hops begun so far (0 until the dice settle, then 1..path.length). */
  hops: number;
  /** The ladder/snake moment has come (always false before the last hop ends). */
  jumping: boolean;
}

/** Token pose for a plan that is still running (`now < plan.end`). */
export function planPose(board: Board, plan: MotionPlan, now: number): Pose {
  if (now < plan.hopStart)
    return { p: cellCenter(board, plan.from), lift: 0, moving: true, hops: 0, jumping: false };
  const k = (now - plan.hopStart) / HOP_MS;
  if (k < plan.path.length) {
    const i = Math.floor(k);
    const u = k - i;
    const a = cellCenter(board, i === 0 ? plan.from : plan.path[i - 1]!);
    const b = cellCenter(board, plan.path[i]!);
    const e = easeInOut(u);
    return {
      p: { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e },
      lift: Math.sin(Math.PI * u) * 0.42,
      moving: true,
      hops: i + 1,
      jumping: false,
    };
  }
  const hops = plan.path.length;
  const jumping = now >= plan.jumpStart;
  const j = plan.jump;
  if (!j || !jumping) return { p: cellCenter(board, plan.landed), lift: 0, moving: true, hops, jumping };
  const u = clamp01((now - plan.jumpStart) / jumpMs(board, j));
  const t = j.kind === 'snake' ? easeIn(u) : easeInOut(u);
  return {
    p: jumpPoint(board, j, t),
    lift: j.kind === 'ladder' ? Math.sin(Math.PI * u) * 0.12 : 0,
    moving: true,
    hops,
    jumping,
  };
}

/** Dice in the turn panel: blank while someone may roll, tumbling until the hops start. */
export function dieAt(
  rolling: boolean,
  dice: { hopStart: number; face: number | null } | null,
  now: number,
): { face: number; rolling: boolean } {
  if (rolling || !dice) return { face: 0, rolling: false };
  if (now < dice.hopStart) return { face: 1 + ((Math.floor(now / 85) * 5 + 3) % 6), rolling: true };
  return { face: dice.face ?? 0, rolling: false };
}

export type DuelStage = 'intro' | 'live' | 'result';

/** "3, 2, 1" before a duel. */
export function duelCount(start: number, now: number): number {
  return Math.max(1, Math.ceil((start - now) / (DUEL_INTRO_MS / 3)));
}

/** The duel's clock bar and centre text. */
export function duelClock(
  stage: DuelStage,
  start: number,
  end: number,
  now: number,
): { frac: number; text: string } {
  if (stage === 'intro') return { frac: 1, text: String(duelCount(start, now)) };
  if (stage === 'live') return { frac: clamp01((end - now) / DUEL_MS), text: STR.duelGo };
  return { frac: 0, text: 'VS' };
}
