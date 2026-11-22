/** Final standings, a title for every runner, and the GameResult for the shell. Pure. */
import type { PlayerInfo } from '@hoorah/protocol';
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { NyebrangMatch, Runner } from './logic';
import { MAP_NAME, STR } from './strings';

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (r: Runner) => number;
  min: number;
  desc: (v: number) => string;
}

const A = STR.awards;

const AWARDS: readonly AwardDef[] = [
  { title: A.far, icon: 'crown', metric: (r) => r.total.bestRow, min: 1, desc: A.farDesc },
  { title: A.near, icon: 'zap', metric: (r) => r.total.near, min: 1, desc: A.nearDesc },
  { title: A.river, icon: 'star', metric: (r) => r.total.riverHops, min: 4, desc: A.riverDesc },
  { title: A.rail, icon: 'target', metric: (r) => r.total.railCrossings, min: 2, desc: A.railDesc },
  { title: A.bold, icon: 'fire', metric: (r) => r.total.hops, min: 10, desc: A.boldDesc },
  { title: A.tough, icon: 'heart', metric: (r) => r.total.deaths, min: 2, desc: A.toughDesc },
  { title: A.back, icon: 'build', metric: (r) => r.total.backHops, min: 3, desc: A.backDesc },
];

/** One title per runner: each award goes to the best runner without one; the rest are fans. */
export function pickAwards(rows: readonly Runner[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of AWARDS) {
    const best = rows
      .filter((r) => !has.has(r.id))
      .map((r) => ({ r, v: def.metric(r) }))
      .filter((x) => x.v >= def.min)
      .sort((a, b) => b.v - a.v || a.r.joinIndex - b.r.joinIndex)[0];
    if (!best) continue;
    has.add(best.r.id);
    out.push({ playerId: best.r.id, title: def.title, desc: def.desc(best.v), icon: def.icon });
  }
  const careful = rows.filter((r) => !has.has(r.id)).sort((a, b) => a.total.deaths - b.total.deaths)[0];
  if (careful && careful.total.distance > 0) {
    has.add(careful.id);
    out.push({ playerId: careful.id, title: A.safe, desc: A.safeDesc, icon: 'heart' });
  }
  for (const r of rows) {
    if (has.has(r.id)) continue;
    out.push({ playerId: r.id, title: A.fan, desc: A.fanDesc, icon: 'star' });
  }
  return out;
}

export function buildResult(m: NyebrangMatch, cpuPlayers: PlayerInfo[]): GameResult {
  const rows = m.standings();
  const winners = rows.filter((x) => x.rank === 1);
  const title =
    winners.length === 0
      ? STR.title
      : winners.length === 1
        ? STR.resultWinner(winners[0]!.r.name)
        : STR.resultTie(winners.map((w) => w.r.name));
  const mapLabel = m.mapPick === 'acak' ? MAP_NAME.acak : MAP_NAME[m.mapPick];
  return {
    title,
    subtitle: STR.resultSub(m.rounds, mapLabel),
    ranking: rows.map((x) => ({
      playerId: x.r.id,
      score: x.r.score,
      rank: x.rank,
      label: STR.rankLabel(x.r.score, x.r.total.distance),
    })),
    awards: pickAwards(rows.map((x) => x.r)),
    ...(cpuPlayers.length ? { cpuPlayers } : {}),
  };
}

/** The lone person's outcome against the computer, for the adaptive skill. */
export function soloOutcome(result: GameResult, humanId: number): 'win' | 'lose' | 'draw' | null {
  const me = result.ranking.find((r) => r.playerId === humanId);
  if (!me) return null;
  if (me.rank !== 1) return 'lose';
  return result.ranking.filter((r) => r.rank === 1).length > 1 ? 'draw' : 'win';
}
