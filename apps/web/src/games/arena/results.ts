/** Final standings, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { Standing } from './logic';
import { STR } from './strings';

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (r: Standing) => number;
  min: number;
  desc: (v: number) => string;
}

const AWARDS: readonly AwardDef[] = [
  {
    title: STR.awardLongest,
    icon: 'crown',
    metric: (r) => r.best,
    min: 1,
    desc: STR.awardLongestDesc,
  },
  { title: STR.awardHunter, icon: 'target', metric: (r) => r.snake.kos, min: 1, desc: STR.awardHunterDesc },
  { title: STR.awardGlutton, icon: 'star', metric: (r) => r.snake.eaten, min: 5, desc: STR.awardGluttonDesc },
  {
    title: STR.awardSpeed,
    icon: 'zap',
    metric: (r) => Math.round(r.snake.boostMs / 1000),
    min: 3,
    desc: STR.awardSpeedDesc,
  },
  {
    title: STR.awardSurvivor,
    icon: 'heart',
    metric: (r) => Math.round(r.snake.longestLife / 1000),
    min: 20,
    desc: STR.awardSurvivorDesc,
  },
];

/**
 * Awards spread so everyone gets one when possible: each award goes to the best player who has
 * none yet, or to the true leader when nobody new qualifies. At most one award more than there
 * are players (3 to 5), so a duel does not hand out a pile of repeats.
 */
export function pickAwards(rows: readonly Standing[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  const limit = Math.min(AWARDS.length, Math.max(3, rows.length + 1));
  for (const def of AWARDS) {
    if (out.length >= limit) break;
    const ranked = rows
      .map((r) => ({ s: r.snake, v: def.metric(r) }))
      .filter((r) => r.v >= def.min)
      .sort((a, b) => b.v - a.v || a.s.joinIndex - b.s.joinIndex);
    const pick = ranked.find((r) => !has.has(r.s.id)) ?? ranked[0];
    if (!pick) continue;
    has.add(pick.s.id);
    out.push({ playerId: pick.s.id, title: def.title, desc: def.desc(pick.v), icon: def.icon });
  }
  return out;
}

export function buildResult(rows: readonly Standing[]): GameResult {
  const top = rows[0];
  const winners = rows.filter((r) => r.rank === 1);
  const title = !top
    ? STR.gameTitle
    : winners.length === 1
      ? STR.resultWinner(top.snake.name)
      : STR.resultTie(winners.map((w) => w.snake.name));
  const subtitle = !top || top.final === 0 ? STR.resultAllOut : STR.resultSubtitle(top.final, top.snake.kos);
  return {
    title,
    subtitle,
    ranking: rows.map((r) => ({
      playerId: r.snake.id,
      score: r.final,
      rank: r.rank,
      label: r.final > 0 ? STR.rankLabel(r.final, r.snake.kos) : STR.rankLabelOut(r.snake.kos),
    })),
    awards: pickAwards(rows),
  };
}

/** The lone person's outcome against the computer, for the adaptive skill. */
export function soloOutcome(result: GameResult, humanId: number): 'win' | 'lose' | 'draw' | null {
  const me = result.ranking.find((r) => r.playerId === humanId);
  if (!me) return null;
  if (me.rank !== 1) return 'lose';
  return result.ranking.filter((r) => r.rank === 1).length > 1 ? 'draw' : 'win';
}
