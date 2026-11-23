/** Final ranking, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { type LudoLogic, type PlayerStats, standings } from './logic';
import { STR } from './strings';

/** The name of the player on a seat. */
export function seatTitle(L: LudoLogic, seat: number, name: (id: number) => string): string {
  const t = L.seats[seat];
  return t ? name(t.player) : STR.unknownPlayer;
}

export function headline(L: LudoLogic, name: (id: number) => string): string {
  const top = standings(L)[0];
  return top ? STR.resultTitle(seatTitle(L, top.seat, name)) : STR.resultTitle(STR.unknownPlayer);
}

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (s: PlayerStats) => number;
  min: number;
  desc: (v: number) => string;
}

const AWARDS: AwardDef[] = [
  { title: STR.awardHunter, icon: 'fire', metric: (s) => s.captures, min: 1, desc: STR.awardHunterDesc },
  { title: STR.awardRunner, icon: 'crown', metric: (s) => s.home, min: 1, desc: STR.awardRunnerDesc },
  { title: STR.awardSix, icon: 'star', metric: (s) => s.sixes, min: 2, desc: STR.awardSixDesc },
];

/** Each award goes to the best player without one yet; anyone left who walked gets a nod. */
export function pickAwards(stats: readonly PlayerStats[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of AWARDS) {
    const ranked = stats
      .map((s, i) => ({ s, i, v: def.metric(s) }))
      .filter((r) => r.v >= def.min)
      .sort((a, b) => b.v - a.v || a.i - b.i);
    const pick = ranked.find((r) => !has.has(r.s.id)) ?? ranked[0];
    if (!pick) continue;
    has.add(pick.s.id);
    out.push({ playerId: pick.s.id, title: def.title, desc: def.desc(pick.v), icon: def.icon });
  }
  for (const s of stats) {
    if (has.has(s.id) || s.steps < 1) continue;
    has.add(s.id);
    out.push({ playerId: s.id, title: STR.awardWalker, desc: STR.awardWalkerDesc(s.steps), icon: 'heart' });
  }
  return out;
}

export function buildResult(L: LudoLogic, name: (id: number) => string): GameResult {
  const rows = standings(L);
  const ranking: GameResult['ranking'] = [];
  for (const r of rows) {
    const t = L.seats[r.seat]!;
    ranking.push({
      playerId: t.player,
      rank: r.rank,
      score: r.home * 100 + r.progress,
      label: STR.rankLabel(r.home, L.pawnCount, L.stats.get(t.player)?.captures ?? 0),
    });
  }
  return {
    title: headline(L, name),
    subtitle: STR.resultSubtitle(L.pawnCount),
    ranking,
    awards: pickAwards(L.participants.map((id) => L.stats.get(id)!)),
  };
}
