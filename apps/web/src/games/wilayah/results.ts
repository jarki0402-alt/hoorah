/** Final ranking, awards and the GameResult handed to the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { RunnerStats, Standing } from './logic';
import { formatPct, STR } from './strings';

export interface FinalRow {
  id: number;
  name: string;
  /** Territory share at the end, 0..100. */
  pct: number;
  rank: number;
  stats: RunnerStats;
}

export function finalRows(standings: readonly Standing[], fieldSize: number): FinalRow[] {
  return standings.map((s) => ({
    id: s.runner.id,
    name: s.runner.name,
    pct: (s.cells * 100) / fieldSize,
    rank: s.rank,
    stats: s.runner.stats,
  }));
}

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (r: FinalRow) => number;
  min: number;
  desc: (v: number) => string;
}

/**
 * Awards spread so as many players as possible get one: each award goes to the best player who
 * has none yet, or to the true leader when nobody new qualifies.
 */
export function pickAwards(rows: readonly FinalRow[], fieldSize: number): GameAward[] {
  const share = (cells: number) => formatPct((cells * 100) / fieldSize);
  const defs: AwardDef[] = [
    {
      title: STR.awardSweep,
      icon: 'fire',
      metric: (r) => r.stats.bestCapture,
      min: Math.max(4, Math.ceil(fieldSize * 0.005)),
      desc: (v) => STR.awardSweepDesc(share(v)),
    },
    {
      title: STR.awardHunter,
      icon: 'target',
      metric: (r) => r.stats.kills,
      min: 1,
      desc: STR.awardHunterDesc,
    },
    {
      title: STR.awardPeak,
      icon: 'crown',
      metric: (r) => r.stats.peak,
      min: Math.ceil(fieldSize * 0.03),
      desc: (v) => STR.awardPeakDesc(share(v)),
    },
    {
      title: STR.awardRoamer,
      icon: 'zap',
      metric: (r) => r.stats.longestLoop,
      min: 12,
      desc: STR.awardRoamerDesc,
    },
  ];
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of defs) {
    const ranked = rows
      .map((r, i) => ({ r, i, v: def.metric(r) }))
      .filter((x) => x.v >= def.min)
      .sort((a, b) => b.v - a.v || a.r.rank - b.r.rank || a.i - b.i);
    const pick = ranked.find((x) => !has.has(x.r.id)) ?? ranked[0];
    if (!pick) continue;
    has.add(pick.r.id);
    out.push({ playerId: pick.r.id, title: def.title, desc: def.desc(pick.v), icon: def.icon });
  }
  for (const r of rows) {
    if (has.has(r.id) || r.stats.outs > 0 || r.stats.captures < 1) continue;
    has.add(r.id);
    out.push({ playerId: r.id, title: STR.awardUntouched, desc: STR.awardUntouchedDesc, icon: 'heart' });
  }
  for (const r of rows) {
    if (has.has(r.id) || r.stats.outs < 2) continue;
    has.add(r.id);
    out.push({ playerId: r.id, title: STR.awardTough, desc: STR.awardToughDesc(r.stats.outs), icon: 'star' });
  }
  return out;
}

export function headline(rows: readonly FinalRow[]): string {
  const top = rows.filter((r) => r.rank === 1);
  if (top.length === 0 || top[0]!.pct <= 0) return STR.finaleNobody;
  if (top.length === 1) return STR.finaleWinner(top[0]!.name);
  return STR.finaleTie(top.map((r) => r.name));
}

export function buildResult(standings: readonly Standing[], fieldSize: number, minutes: number): GameResult {
  const rows = finalRows(standings, fieldSize);
  const best = rows[0]?.pct ?? 0;
  return {
    title: headline(rows),
    subtitle: STR.resultSubtitle(formatPct(best), minutes),
    ranking: rows.map((r) => ({
      playerId: r.id,
      score: Math.round(r.pct * 10) / 10,
      rank: r.rank,
      label: STR.rankLabel(formatPct(r.pct)),
    })),
    awards: pickAwards(rows, fieldSize),
  };
}

/** How the lone person did against the computer players, for the adaptive skill. */
export function soloOutcome(result: GameResult, humanId: number): 'win' | 'lose' | 'draw' | null {
  const me = result.ranking.find((r) => r.playerId === humanId);
  if (!me) return null;
  if (me.rank !== 1) return 'lose';
  return result.ranking.filter((r) => r.rank === 1).length > 1 ? 'draw' : 'win';
}
