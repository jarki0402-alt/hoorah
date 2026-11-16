/** Final standings, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { EndReason, PlayerStats, Standing } from './logic';
import { STR } from './strings';

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (s: PlayerStats) => number;
  min: number;
  desc: (s: PlayerStats) => string;
}

const AWARDS: AwardDef[] = [
  {
    title: STR.awardLadder,
    icon: 'star',
    metric: (s) => s.climbed,
    min: 1,
    desc: (s) => STR.awardLadderDesc(s.ladders, s.climbed),
  },
  {
    title: STR.awardDuel,
    icon: 'zap',
    metric: (s) => s.duelsWon,
    min: 1,
    desc: (s) => STR.awardDuelDesc(s.duelsWon),
  },
  {
    title: STR.awardLucky,
    icon: 'fire',
    metric: (s) => s.sixes,
    min: 2,
    desc: (s) => STR.awardLuckyDesc(s.sixes),
  },
  { title: STR.awardBoots, icon: 'target', metric: (s) => s.blocked, min: 1, desc: () => STR.awardBootsDesc },
  {
    title: STR.awardSnake,
    icon: 'heart',
    metric: (s) => s.snakes,
    min: 2,
    desc: (s) => STR.awardSnakeDesc(s.snakes),
  },
];

/**
 * Each award goes to the best player who has none yet (so awards spread out); players left
 * without one get "Penjelajah Kampung" for how far they got.
 */
export function pickAwards(standings: readonly Standing[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of AWARDS) {
    const ranked = standings
      .map((s, i) => ({ s, i, v: def.metric(s.stats) }))
      .filter((r) => r.v >= def.min)
      .sort((a, b) => b.v - a.v || a.i - b.i);
    const pick = ranked.find((r) => !has.has(r.s.id));
    if (!pick) continue;
    has.add(pick.s.id);
    out.push({ playerId: pick.s.id, title: def.title, desc: def.desc(pick.s.stats), icon: def.icon });
  }
  for (const s of standings) {
    if (has.has(s.id) || s.rank === 1) continue;
    has.add(s.id);
    out.push({ playerId: s.id, title: STR.awardTraveler, desc: STR.awardTravelerDesc(s.pos), icon: 'build' });
  }
  return out;
}

export function headline(standings: readonly Standing[], name: (id: number) => string): string {
  const top = standings.filter((s) => s.rank === 1);
  return top.length === 1 ? STR.finaleWinner(name(top[0]!.id)) : STR.finaleTie;
}

export interface ResultContext {
  reason: EndReason;
  rounds: number;
  name: (id: number) => string;
}

export function buildResult(standings: readonly Standing[], ctx: ResultContext): GameResult {
  return {
    title: headline(standings, ctx.name),
    subtitle: ctx.reason === 'finish' ? STR.resultSubFinish(ctx.rounds) : STR.resultSubCap(ctx.rounds),
    ranking: standings.map((s) => ({
      playerId: s.id,
      score: s.pos,
      rank: s.rank,
      label: s.finished ? STR.rankFinished : STR.rankAt(s.pos),
    })),
    awards: pickAwards(standings),
  };
}
