/** Final standings, a title for every player, and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { PenyusupMatch, Seat } from './logic';
import { STR } from './strings';

/** A seat plus whether it ever took part (late joiners who only watched get the fallback). */
type Ranked = Seat & { played: boolean };

interface AwardDef {
  title: string;
  icon: GameIcon;
  /** Higher is better; below `min` the award is not given. */
  metric: (s: Ranked) => number;
  min: number;
  desc: (v: number) => string;
}

const A = STR.awards;

const AWARDS: readonly AwardDef[] = [
  { title: A.thief, icon: 'crown', metric: (s) => s.stats.steals, min: 1, desc: A.thiefDesc },
  { title: A.liar, icon: 'star', metric: (s) => s.stats.survivedAsBeda, min: 1, desc: A.liarDesc },
  { title: A.detective, icon: 'target', metric: (s) => s.stats.correctVotes, min: 1, desc: A.detectiveDesc },
  { title: A.bold, icon: 'fire', metric: (s) => s.stats.votesAsWarga, min: 2, desc: A.boldDesc },
  {
    title: A.quick,
    icon: 'zap',
    // Faster average clue = higher metric; only players who gave at least two clues.
    metric: (s) => (s.stats.clues >= 2 ? 30_000 - s.stats.clueMs / s.stats.clues : 0),
    min: 1,
    desc: (v) => A.quickDesc(Math.max(1, Math.round((30_000 - v) / 1000))),
  },
  { title: A.loyal, icon: 'heart', metric: (s) => s.stats.wins, min: 1, desc: A.loyalDesc },
  {
    title: A.clean,
    icon: 'brain',
    metric: (s) => (s.stats.votesReceived === 0 && s.played ? 1 : 0),
    min: 1,
    desc: () => A.cleanDesc,
  },
];

/**
 * One title per player: each award goes to the best player without a title yet. Whoever is left
 * gets "Pendengar Setia", so nobody leaves the results empty-handed.
 */
export function pickAwards(seats: readonly Seat[]): GameAward[] {
  const rows: Ranked[] = seats.map((s) => ({
    ...s,
    played: s.inRound || s.stats.clues > 0 || s.stats.wins > 0,
  }));
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
  for (const r of rows) {
    if (has.has(r.id)) continue;
    out.push({ playerId: r.id, title: A.listener, desc: A.listenerDesc, icon: 'star' });
  }
  return out;
}

export function buildResult(m: PenyusupMatch, name: (id: number) => string): GameResult {
  const rows = m.standings();
  const winners = rows.filter((r) => r.rank === 1);
  const title =
    winners.length === 0
      ? STR.logo
      : winners.length === 1
        ? STR.resultWinner(name(winners[0]!.seat.id))
        : STR.resultTie(winners.map((w) => name(w.seat.id)));
  return {
    title,
    subtitle: STR.resultSub(Math.max(1, m.round + 1)),
    ranking: rows.map((r) => ({
      playerId: r.seat.id,
      score: r.seat.score,
      rank: r.rank,
      label: STR.rankLabel(r.seat.score),
    })),
    awards: pickAwards(rows.map((r) => r.seat)),
  };
}
