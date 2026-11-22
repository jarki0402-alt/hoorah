/** Final result of a Petualangan Warna session: the team's stars and a title for every player. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { Tally, WarnaMatch } from './logic';
import { STR } from './strings';

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (t: Tally) => number;
  min: number;
  desc: (v: number) => string;
}

const AWARDS: readonly AwardDef[] = [
  {
    title: STR.awardPillar,
    icon: 'build',
    metric: (t) => Math.round(t.carried),
    min: 2,
    desc: STR.awardPillarDesc,
  },
  {
    title: STR.awardPusher,
    icon: 'zap',
    metric: (t) => Math.round(t.pushed),
    min: 2,
    desc: STR.awardPusherDesc,
  },
  { title: STR.awardGems, icon: 'star', metric: (t) => t.gems, min: 1, desc: STR.awardGemsDesc },
  {
    title: STR.awardHelper,
    icon: 'target',
    metric: (t) => Math.round(t.helped),
    min: 3,
    desc: STR.awardHelperDesc,
  },
  { title: STR.awardFirst, icon: 'crown', metric: (t) => t.firstIn, min: 1, desc: STR.awardFirstDesc },
  { title: STR.awardJumper, icon: 'fire', metric: (t) => t.jumps, min: 10, desc: STR.awardJumperDesc },
  { title: STR.awardBrave, icon: 'heart', metric: (t) => t.deaths, min: 1, desc: STR.awardBraveDesc },
];

/**
 * One title per player when possible: titles go in order to the best player who has none yet.
 * Anyone still without a title afterwards gets the first title they qualify for, so in a
 * cooperative game nobody leaves empty-handed.
 */
export function pickAwards(tallies: readonly Tally[], order: readonly number[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  const rank = (id: number) => order.indexOf(id);
  for (const def of AWARDS) {
    if (has.size >= tallies.length) break;
    const ranked = tallies
      .map((t) => ({ t, v: def.metric(t) }))
      .filter((r) => r.v >= def.min && !has.has(r.t.id))
      .sort((a, b) => b.v - a.v || rank(a.t.id) - rank(b.t.id));
    const pick = ranked[0];
    if (!pick) continue;
    has.add(pick.t.id);
    out.push({ playerId: pick.t.id, title: def.title, desc: def.desc(pick.v), icon: def.icon });
  }
  for (const t of tallies) {
    if (has.has(t.id)) continue;
    // Fallback: the title this player is closest to, with their own number.
    const def =
      AWARDS.map((d) => ({ d, v: d.metric(t) }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v / b.d.min - a.v / a.d.min)[0] ?? null;
    const d = def?.d ?? AWARDS[5]!;
    const v = def?.v ?? t.jumps;
    has.add(t.id);
    out.push({ playerId: t.id, title: d.title, desc: d.desc(v), icon: d.icon });
  }
  return out;
}

export function buildResult(m: WarnaMatch, people: readonly number[]): GameResult {
  const tallies = people.map((id) => m.tallies.get(id)).filter((t): t is Tally => Boolean(t));
  const stars = m.totalStars();
  const gems = m.scores.reduce((s, x) => s + x.gems, 0);
  return {
    title: STR.resultTitle(stars, m.maxStars()),
    subtitle: STR.resultSub(m.scores.length, gems),
    // Everyone plays on one team: a shared first place, the gems as the personal number.
    ranking: tallies.map((t) => ({ playerId: t.id, score: stars, rank: 1, label: STR.rankLabel(t.gems) })),
    awards: pickAwards(tallies, people),
  };
}
