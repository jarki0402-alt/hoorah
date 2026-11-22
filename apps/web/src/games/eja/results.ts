/** Final standings, a title for every player, and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { EjaMatch, Seat } from './logic';
import { STR } from './strings';

interface AwardDef {
  title: string;
  icon: GameIcon;
  /** Higher is better; below `min` the award is not given. */
  metric: (s: Seat) => number;
  min: number;
  desc: (v: number) => string;
}

const A = STR.awards;
const QUICK_BASE = 60_000;

const AWARDS: readonly AwardDef[] = [
  { title: A.champ, icon: 'crown', metric: (s) => s.stats.correct, min: 1, desc: A.champDesc },
  { title: A.streak, icon: 'fire', metric: (s) => s.stats.bestStreak, min: 3, desc: A.streakDesc },
  {
    title: A.quick,
    icon: 'zap',
    // Faster average on correct words = higher metric; needs at least two correct words.
    metric: (s) => (s.stats.correct >= 2 ? QUICK_BASE - s.stats.correctMs / s.stats.correct : 0),
    min: 1,
    desc: (v) => A.quickDesc(Math.max(1, Math.round((QUICK_BASE - v) / 1000))),
  },
  { title: A.near, icon: 'target', metric: (s) => s.stats.near, min: 1, desc: A.nearDesc },
  {
    title: A.clean,
    icon: 'star',
    metric: (s) => (s.stats.correct >= 2 && s.stats.wrong + s.stats.near === 0 ? 1 : 0),
    min: 1,
    desc: () => A.cleanDesc,
  },
  { title: A.stubborn, icon: 'heart', metric: (s) => s.stats.practice, min: 1, desc: A.stubbornDesc },
];

/** One title per player: each award goes to the best player without a title yet. */
export function pickAwards(seats: readonly Seat[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of AWARDS) {
    const best = seats
      .filter((s) => !has.has(s.id))
      .map((s) => ({ s, v: def.metric(s) }))
      .filter((x) => x.v >= def.min)
      .sort((a, b) => b.v - a.v || a.s.joinIndex - b.s.joinIndex)[0];
    if (!best) continue;
    has.add(best.s.id);
    out.push({ playerId: best.s.id, title: def.title, desc: def.desc(best.v), icon: def.icon });
  }
  for (const s of seats) {
    if (has.has(s.id)) continue;
    out.push({ playerId: s.id, title: A.listener, desc: A.listenerDesc, icon: 'brain' });
  }
  return out;
}

export function buildResult(m: EjaMatch, name: (id: number) => string): GameResult {
  const rows = m.standings();
  const words = Math.max(1, m.index + 1);
  if (m.solo) {
    const me = rows[0]?.seat;
    const best = me?.stats.bestStreak ?? 0;
    return {
      title: STR.resultSolo(best),
      subtitle: STR.resultSoloSub(me?.stats.correct ?? 0),
      ranking: rows.map((r) => ({
        playerId: r.seat.id,
        score: r.seat.score,
        rank: r.rank,
        label: STR.rankLabelSolo(r.seat.stats.bestStreak),
      })),
      awards: pickAwards(rows.map((r) => r.seat)),
    };
  }
  const winners = rows.filter((r) => r.rank === 1);
  const title =
    winners.length === 1
      ? STR.resultWinner(name(winners[0]!.seat.id))
      : winners.length > 1
        ? STR.resultTie(winners.map((w) => name(w.seat.id)))
        : STR.logo;
  return {
    title,
    subtitle: STR.resultSub(words),
    ranking: rows.map((r) => ({
      playerId: r.seat.id,
      score: r.seat.score,
      rank: r.rank,
      label: STR.rankLabel(r.seat.score),
    })),
    awards: pickAwards(rows.map((r) => r.seat)),
  };
}
