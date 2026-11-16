/**
 * The computer opponent for Ular Tangga (PRD 6.4). It plays a solo human's opponent and takes over
 * a seat whose phone dropped mid-game. Rolling has no strategy, so its only "skill" is how fast it
 * taps in the duel kilat; everything else is a believable pause before rolling. Pure.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import { bySkill, soloOpponents, thinkMs, wobble } from '../common/cpu';
import { DUEL_MS, MAX_TAP_RATE, type Standing } from './logic';

/** Solo play: one opponent; two or more humans: none. */
export function ularOpponents(humans: readonly PlayerInfo[], rnd: () => number = Math.random): PlayerInfo[] {
  return soloOpponents(humans, 1, rnd);
}

/** Pause before the computer rolls (ms). Takeover seats keep a steady 1.5–3 s pace. */
export function rollDelay(skill: number, takeover: boolean, rnd: () => number = Math.random): number {
  if (takeover) return Math.round(1500 + rnd() * 1500);
  return thinkMs(skill, 700, 1800, rnd);
}

/** Average taps per second for a duel at this skill: about 3.6 (easy to beat) up to 8.6 (a fight). */
export function duelRate(skill: number, rnd: () => number = Math.random): number {
  const r = bySkill(skill, 3.6, 8.6) * (1 + 0.1 * wobble(rnd));
  return Math.min(MAX_TAP_RATE - 2, Math.max(2, r));
}

/**
 * Taps for one duelist over the 5 s window: a short reaction delay, then an uneven rhythm that
 * tires a little towards the end. `advance(now)` returns the new whole taps since the last call.
 */
export class DuelTapper {
  private readonly rate: number;
  private readonly begin: number;
  private last: number;
  private acc = 0;

  constructor(
    skill: number,
    private readonly start: number,
    private readonly rnd: () => number = Math.random,
  ) {
    this.rate = duelRate(skill, rnd);
    this.begin = start + bySkill(skill, 420, 200) + rnd() * 160;
    this.last = this.begin;
  }

  advance(now: number): number {
    if (now <= this.last) return 0;
    const from = this.last;
    this.last = now;
    const elapsed = (from - this.start) / DUEL_MS;
    const tired = 1 - 0.12 * Math.min(1, Math.max(0, elapsed));
    const burst = 1 + 0.25 * wobble(this.rnd);
    this.acc += (this.rate * tired * burst * (now - from)) / 1000;
    const whole = Math.floor(this.acc);
    this.acc -= whole;
    return whole;
  }
}

/** A solo game's outcome from the human's side. */
export function soloOutcome(
  standings: readonly Standing[],
  winner: number | null,
  human: number,
): 'win' | 'lose' | 'draw' {
  if (winner !== null) return winner === human ? 'win' : 'lose';
  const me = standings.find((s) => s.id === human);
  return me?.rank === 1 ? 'draw' : 'lose';
}
