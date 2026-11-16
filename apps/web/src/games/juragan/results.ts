/** Final ranking, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { type JuraganLogic, type PlayerState, propertiesOf, standings } from './logic';
import { rp, STR } from './strings';

type Name = (id: number) => string;

export function headline(L: JuraganLogic, name: Name): string {
  const top = standings(L)[0];
  return STR.resultTitle(top ? name(top.id) : STR.unknownPlayer);
}

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (p: PlayerState, L: JuraganLogic) => number;
  min: number;
  desc: (v: number) => string;
}

const AWARDS: AwardDef[] = [
  {
    title: STR.awardRich,
    icon: 'crown',
    metric: (p, L) => (p.bankrupt ? 0 : L.worth(p)),
    min: 1,
    desc: (v) => STR.awardRichDesc(rp(v)),
  },
  {
    title: STR.awardCities,
    icon: 'build',
    metric: (p, L) => propertiesOf(L.tiles, p.id).length,
    min: 2,
    desc: STR.awardCitiesDesc,
  },
  {
    title: STR.awardRent,
    icon: 'fire',
    metric: (p) => p.stats.rentCollected,
    min: 1,
    desc: (v) => STR.awardRentDesc(rp(v)),
  },
  {
    title: STR.awardConqueror,
    icon: 'target',
    metric: (p) => p.stats.takeovers,
    min: 1,
    desc: STR.awardConquerorDesc,
  },
  {
    title: STR.awardBuilder,
    icon: 'star',
    metric: (p) => p.stats.built,
    min: 1,
    desc: STR.awardBuilderDesc,
  },
  {
    title: STR.awardTraveler,
    icon: 'zap',
    metric: (p) => p.stats.salaries,
    min: 1,
    desc: STR.awardTravelerDesc,
  },
];

/** Each award goes to the best player without one yet (or the best overall if all have one). */
export function pickAwards(L: JuraganLogic): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of AWARDS) {
    const ranked = L.players
      .map((p) => ({ p, v: def.metric(p, L) }))
      .filter((r) => r.v >= def.min)
      .sort((a, b) => b.v - a.v || a.p.seat - b.p.seat);
    const pick = ranked.find((r) => !has.has(r.p.id)) ?? ranked[0];
    if (!pick) continue;
    has.add(pick.p.id);
    out.push({ playerId: pick.p.id, title: def.title, desc: def.desc(pick.v), icon: def.icon });
  }
  return out;
}

export function buildResult(L: JuraganLogic, name: Name): GameResult {
  const ranking: GameResult['ranking'] = standings(L).map((r) => ({
    playerId: r.id,
    rank: r.rank,
    score: r.worth,
    label: r.bankrupt ? STR.rankBankrupt : STR.rankLabel(r.worth),
  }));
  return {
    title: headline(L, name),
    subtitle: STR.resultSubtitle(L.rounds),
    ranking,
    awards: pickAwards(L),
  };
}
