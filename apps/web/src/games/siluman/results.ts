/** Final standings, a title for every player, and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { type Seat, type Side, type SilumanMatch, sideOf } from './logic';
import { ROLE_NAME, SIDE_NAME, STR } from './strings';

interface AwardDef {
  title: string;
  icon: GameIcon;
  /** Higher is better; below `min` the award is not given. */
  metric: (s: Seat, winner: Side | null) => number;
  min: number;
  desc: (v: number) => string;
}

const A = STR.awards;

const AWARDS: readonly AwardDef[] = [
  {
    title: A.sly,
    icon: 'crown',
    metric: (s, w) => (s.role === 'siluman' && w === 'siluman' ? (s.alive ? 2 : 1) : 0),
    min: 1,
    desc: () => A.slyDesc,
  },
  { title: A.seer, icon: 'brain', metric: (s) => s.stats.seen, min: 1, desc: A.seerDesc },
  { title: A.healer, icon: 'heart', metric: (s) => s.stats.saves, min: 1, desc: A.healerDesc },
  { title: A.hunter, icon: 'target', metric: (s) => s.stats.shots, min: 1, desc: () => A.hunterDesc },
  {
    title: A.traitor,
    icon: 'star',
    metric: (s, w) => (s.role === 'pengkhianat' && w === 'siluman' ? 1 : 0),
    min: 1,
    desc: () => A.traitorDesc,
  },
  { title: A.detective, icon: 'target', metric: (s) => s.stats.goodVotes, min: 1, desc: A.detectiveDesc },
  { title: A.ghost, icon: 'zap', metric: (s) => s.stats.ghostHits, min: 1, desc: A.ghostDesc },
  { title: A.talker, icon: 'fire', metric: (s) => s.stats.defended, min: 1, desc: () => A.talkerDesc },
  { title: A.suspect, icon: 'fire', metric: (s) => s.stats.suspected, min: 2, desc: A.suspectDesc },
];

/** One title per player: each award goes to the best player without a title yet. */
export function pickAwards(seats: readonly Seat[], winner: Side | null): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of AWARDS) {
    const best = seats
      .filter((s) => !has.has(s.id))
      .map((s) => ({ s, v: def.metric(s, winner) }))
      .filter((x) => x.v >= def.min)
      .sort((a, b) => b.v - a.v || a.s.joinIndex - b.s.joinIndex)[0];
    if (!best) continue;
    has.add(best.s.id);
    out.push({ playerId: best.s.id, title: def.title, desc: def.desc(best.v), icon: def.icon });
  }
  for (const s of seats) {
    if (has.has(s.id)) continue;
    out.push({ playerId: s.id, title: A.loyal, desc: A.loyalDesc, icon: 'build' });
  }
  return out;
}

export function buildResult(m: SilumanMatch): GameResult {
  const rows = m.standings();
  const side = m.winner ?? 'warga';
  return {
    title: STR.finalWin(SIDE_NAME[side]),
    subtitle: STR.resultSub(Math.max(1, m.night)),
    ranking: rows.map((r) => ({
      playerId: r.seat.id,
      score: r.seat.score,
      rank: r.rank,
      label: STR.rankRole(ROLE_NAME[r.seat.role], sideOf(r.seat.role) === side),
    })),
    awards: pickAwards(
      rows.map((r) => r.seat),
      m.winner,
    ),
  };
}
