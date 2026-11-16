/** Final standings, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { CongklakMatch, PlayerStats, Side } from './logic';
import { STR } from './strings';

/** What a side is called: the team name, or the player's own name in a 1 vs 1. */
export function sideLabel(match: CongklakMatch, side: Side, name: (id: number) => string): string {
  const m = match.members[side];
  if (match.teamMode || m.length !== 1) return STR.teamName[side];
  return name(m[0]!);
}

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (s: PlayerStats) => number;
  min: number;
  desc: (v: number) => string;
}

const AWARDS: AwardDef[] = [
  { title: STR.awardSniper, icon: 'target', metric: (s) => s.captured, min: 1, desc: STR.awardSniperDesc },
  { title: STR.awardStreak, icon: 'zap', metric: (s) => s.extras, min: 1, desc: STR.awardStreakDesc },
  { title: STR.awardLong, icon: 'fire', metric: (s) => s.longest, min: 12, desc: STR.awardLongDesc },
];

/** Each award goes to the best player without one yet; anyone else who played gets 'Pemain Setia'. */
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
    if (has.has(s.id) || s.moves < 1) continue;
    has.add(s.id);
    out.push({ playerId: s.id, title: STR.awardHelper, desc: STR.awardHelperDesc(s.moves), icon: 'heart' });
  }
  return out;
}

export function headline(match: CongklakMatch, name: (id: number) => string): string {
  const lead = match.leader;
  return lead === null ? STR.finalTie : STR.finalWin(sideLabel(match, lead, name));
}

export function buildResult(match: CongklakMatch, name: (id: number) => string): GameResult {
  const totals = match.totals;
  const lead = match.leader;
  const rows = [...match.stats.values()].filter((s) => s.moves > 0 || match.members[s.side].includes(s.id));
  // Winners first; inside a side, more seeds captured first.
  const sorted = rows
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ra = lead === null || a.s.side === lead ? 1 : 2;
      const rb = lead === null || b.s.side === lead ? 1 : 2;
      return ra - rb || b.s.captured - a.s.captured || a.i - b.i;
    });
  return {
    title: headline(match, name),
    subtitle: STR.finalScore(totals[0], totals[1], match.rounds),
    ranking: sorted.map(({ s }) => ({
      playerId: s.id,
      score: totals[s.side],
      rank: lead === null || s.side === lead ? 1 : 2,
      label: STR.rankLabel(
        match.teamMode ? STR.teamName[s.side] : null,
        totals[s.side],
        s.captures,
        s.extras,
      ),
    })),
    awards: pickAwards(rows),
  };
}
