/** Final standings, awards and the GameResult handed to the shell. Pure, so it is tested. */
import type { PlayerInfo } from '@hoorah/protocol';
import type { GameAward, GameResult } from '@hoorah/sdk';
import type { LariRun, Mode, Runner } from './logic';
import { STR } from './strings';

export interface FinalRow {
  id: number;
  place: number;
  cpu: boolean;
  score: number;
  dist: number;
  coins: number;
  stumbles: number;
  /** Seconds survived (Bertahan); the whole run for those still running. */
  seconds: number;
  out: boolean;
}

/** Everyone in final order (call once the run is done; places are set by the rules). */
export function finalRows(run: LariRun): FinalRow[] {
  const rows = run.runners.map((r) => toRow(run, r));
  rows.sort((a, b) => a.place - b.place);
  return rows;
}

function toRow(run: LariRun, r: Runner): FinalRow {
  const dist = Math.round(run.distOf(r));
  return {
    id: r.id,
    place: r.place ?? run.runners.length,
    cpu: r.cpu,
    score: run.mode === 'sprint' ? run.scoreOf(r) : dist,
    dist,
    coins: r.coins,
    stumbles: r.stumbles,
    seconds: r.outT ?? run.t,
    out: r.out,
  };
}

/** The single best row by `score`, or null on a tie or below `min`. */
function best(rows: readonly FinalRow[], score: (r: FinalRow) => number, min: number): FinalRow | null {
  let top: FinalRow | null = null;
  let topScore = Number.NEGATIVE_INFINITY;
  let tie = false;
  for (const r of rows) {
    const s = score(r);
    if (s > topScore) {
      top = r;
      topScore = s;
      tie = false;
    } else if (s === topScore) tie = true;
  }
  return top && !tie && topScore >= min ? top : null;
}

export function pickAwards(rows: readonly FinalRow[]): GameAward[] {
  if (rows.length < 2) return [];
  const out: GameAward[] = [];
  const far = best(rows, (r) => r.dist, 1);
  if (far) out.push({ playerId: far.id, title: STR.awardFar, desc: STR.awardFarDesc(far.dist), icon: 'zap' });
  const coins = best(rows, (r) => r.coins, 1);
  if (coins)
    out.push({
      playerId: coins.id,
      title: STR.awardCoins,
      desc: STR.awardCoinsDesc(coins.coins),
      icon: 'star',
    });
  const clean = best(rows, (r) => -r.stumbles, Number.NEGATIVE_INFINITY);
  if (clean)
    out.push({
      playerId: clean.id,
      title: STR.awardClean,
      desc: STR.awardCleanDesc(clean.stumbles),
      icon: 'heart',
    });
  return out;
}

export function rowLabel(mode: Mode, r: FinalRow): string {
  if (mode === 'sprint') return STR.labelSprint(r.dist, r.coins);
  return r.out ? STR.labelSurvive(r.seconds, r.dist) : STR.labelSurvivor(r.dist);
}

/** The shell's result: everyone ranked (computer runners included and described in `cpuPlayers`). */
export function buildResult(
  run: LariRun,
  nameOf: (id: number) => string,
  cpus: readonly PlayerInfo[],
): GameResult {
  const rows = finalRows(run);
  const winner = rows[0];
  const title = !winner
    ? STR.finishTitle
    : run.mode === 'sprint'
      ? STR.winner(nameOf(winner.id))
      : STR.survivorWins(nameOf(winner.id));
  const result: GameResult = {
    title,
    subtitle: STR.resultSub(run.mode, run.t),
    ranking: rows.map((r) => ({
      playerId: r.id,
      score: r.score,
      rank: r.place,
      label: rowLabel(run.mode, r),
    })),
    awards: pickAwards(rows),
  };
  return cpus.length > 0 ? { ...result, cpuPlayers: [...cpus] } : result;
}

/** Solo against the computer: did the person win? */
export function soloOutcome(rows: readonly FinalRow[], humanId: number): 'win' | 'lose' {
  return rows.find((r) => r.id === humanId)?.place === 1 ? 'win' : 'lose';
}
