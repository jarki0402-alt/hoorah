/** Final standings of a Hantu Tak Terlihat session and a title for every player. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { HauntMatch, Tally } from './logic';
import { STR } from './strings';

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (t: Tally) => number;
  min: number;
  desc: (v: number) => string;
}

const AWARDS: readonly AwardDef[] = [
  { title: STR.awardGhost, icon: 'target', metric: (t) => t.catches, min: 1, desc: STR.awardGhostDesc },
  { title: STR.awardBrave, icon: 'heart', metric: (t) => t.near, min: 1, desc: STR.awardBraveDesc },
  { title: STR.awardBeam, icon: 'zap', metric: (t) => Math.round(t.lit), min: 2, desc: STR.awardBeamDesc },
  { title: STR.awardKeys, icon: 'star', metric: (t) => t.keys, min: 1, desc: STR.awardKeysDesc },
  { title: STR.awardFuse, icon: 'build', metric: (t) => Math.round(t.fuse), min: 2, desc: STR.awardFuseDesc },
  { title: STR.awardRunner, icon: 'crown', metric: (t) => t.escapes, min: 1, desc: STR.awardRunnerDesc },
  { title: STR.awardFly, icon: 'fire', metric: (t) => Math.round(t.flyS), min: 5, desc: STR.awardFlyDesc },
];

export interface Standing {
  t: Tally;
  rank: number;
}

/** Best points first; ties share a rank. */
export function standings(tallies: readonly Tally[], order: readonly number[]): Standing[] {
  const sorted = [...tallies].sort(
    (a, b) => b.points - a.points || order.indexOf(a.id) - order.indexOf(b.id),
  );
  const out: Standing[] = [];
  sorted.forEach((t, i) => {
    const prev = out[i - 1];
    out.push({ t, rank: prev && prev.t.points === t.points ? prev.rank : i + 1 });
  });
  return out;
}

/** One title each when possible, in award order to the best player still without one. */
export function pickAwards(tallies: readonly Tally[], order: readonly number[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of AWARDS) {
    if (has.size >= tallies.length) break;
    const pick = tallies
      .map((t) => ({ t, v: def.metric(t) }))
      .filter((r) => r.v >= def.min && !has.has(r.t.id))
      .sort((a, b) => b.v - a.v || order.indexOf(a.t.id) - order.indexOf(b.t.id))[0];
    if (!pick) continue;
    has.add(pick.t.id);
    out.push({ playerId: pick.t.id, title: def.title, desc: def.desc(pick.v), icon: def.icon });
  }
  for (const t of tallies) {
    if (has.has(t.id)) continue;
    const best = AWARDS.map((d) => ({ d, v: d.metric(t) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v / b.d.min - a.v / a.d.min)[0];
    const d = best?.d ?? AWARDS[1]!;
    has.add(t.id);
    out.push({
      playerId: t.id,
      title: d.title,
      desc: best ? d.desc(best.v) : STR.rankLabel(t.points),
      icon: d.icon,
    });
  }
  return out;
}

export function buildResult(m: HauntMatch, ids: readonly number[], name: (id: number) => string): GameResult {
  const tallies = ids.map((id) => m.tallies.get(id)).filter((t): t is Tally => Boolean(t));
  const rows = standings(tallies, ids);
  const winners = rows.filter((r) => r.rank === 1);
  const title =
    winners.length === 1
      ? STR.resultTitle(name(winners[0]!.t.id))
      : STR.resultTie(winners.map((w) => name(w.t.id)));
  const res = m.results.filter((r) => r.winner === 'penghuni').length;
  return {
    title,
    subtitle: STR.resultSubtitle(res, m.results.length - res),
    ranking: rows.map((r) => ({
      playerId: r.t.id,
      score: r.t.points,
      rank: r.rank,
      label: STR.rankLabel(r.t.points),
    })),
    awards: pickAwards(tallies, ids),
  };
}
