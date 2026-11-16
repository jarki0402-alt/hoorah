/** End of round: the summary, kitchen awards and the GameResult handed to the shell. Pure. */
import type { PlayerInfo } from '@hoorah/protocol';
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { CookStats, DapurMatch } from './logic';
import { STR } from './strings';
import type { RoundSummary } from './views';

export const MAX_AWARDS = 4;

type StatKey = keyof CookStats;

const DEFS: { key: StatKey; icon: GameIcon }[] = [
  { key: 'deliveries', icon: 'zap' },
  { key: 'chops', icon: 'crown' },
  { key: 'firesOut', icon: 'heart' },
  { key: 'goodThrows', icon: 'target' },
  { key: 'catches', icon: 'star' },
  { key: 'washed', icon: 'build' },
  { key: 'stains', icon: 'brain' },
  { key: 'badThrows', icon: 'target' },
  { key: 'burnt', icon: 'fire' },
];

export interface AwardRow {
  id: number;
  stats: CookStats;
}

/**
 * Up to four awards for stats someone actually earned (non-zero), spread so as many cooks as
 * possible get one: first every award whose leader has none yet, then the rest. Ties go to the
 * cook who joined first.
 */
export function pickAwards(rows: readonly AwardRow[]): GameAward[] {
  const leaders = DEFS.map((d) => {
    let best: AwardRow | null = null;
    for (const r of rows) if (r.stats[d.key] > 0 && (!best || r.stats[d.key] > best.stats[d.key])) best = r;
    return best ? { def: d, row: best } : null;
  }).filter((x): x is { def: (typeof DEFS)[number]; row: AwardRow } => x !== null);
  const chosen = new Set<number>();
  const owners = new Set<number>();
  for (let i = 0; i < leaders.length && chosen.size < MAX_AWARDS; i++) {
    const l = leaders[i]!;
    if (owners.has(l.row.id)) continue;
    chosen.add(i);
    owners.add(l.row.id);
  }
  for (let i = 0; i < leaders.length && chosen.size < MAX_AWARDS; i++) chosen.add(i);
  return leaders
    .filter((_, i) => chosen.has(i))
    .map(({ def, row }) => {
      const text = STR.awards[def.key];
      return { playerId: row.id, title: text.title, desc: text.desc(row.stats[def.key]), icon: def.icon };
    });
}

export function summarize(m: DapurMatch, awards: readonly GameAward[]): RoundSummary {
  const byCook = new Map<number, string[]>();
  for (const a of awards) byCook.set(a.playerId, [...(byCook.get(a.playerId) ?? []), a.title]);
  return {
    stars: m.stars(),
    score: m.score,
    delivered: m.orders.delivered,
    missed: m.orders.missed,
    tips: m.orders.tips,
    awards: byCook,
  };
}

/**
 * One team: everyone shares first place and the team score; the headline carries the stars.
 * Computer helpers that appear are listed so the results screen can draw them.
 */
export function buildResult(
  m: DapurMatch,
  s: RoundSummary,
  awards: GameAward[],
  cpus: readonly PlayerInfo[],
): GameResult {
  const ranking = m.chefs.map((c) => ({
    playerId: c.id,
    score: s.score,
    rank: 1,
    label: STR.rankLabel(s.score),
  }));
  const ids = new Set(ranking.map((r) => r.playerId));
  const shown = cpus.filter((p) => ids.has(p.id));
  const result: GameResult = {
    title: STR.shellTitle(s.stars),
    subtitle: STR.shellSub(STR.kitchens[m.def.id].name, s.score, s.delivered),
    ranking,
    awards,
  };
  return shown.length > 0 ? { ...result, cpuPlayers: shown } : result;
}

/**
 * Teach the helper's remembered skill (PRD 6.4) from a solo round. The helper is on the lone
 * player's side, so it sharpens after a weak round and eases off after an easy one, keeping the
 * kitchen busy but winnable. In `reportSoloResult` terms: 'win' raises the skill, 'lose' lowers it.
 */
export function helperOutcome(stars: number): 'win' | 'lose' | 'draw' {
  if (stars <= 1) return 'win';
  if (stars >= 3) return 'lose';
  return 'draw';
}

/** Score still needed for the next star, or null at three stars. */
export function toNextStar(
  score: number,
  th: readonly [number, number, number],
): { left: number; star: number } | null {
  for (let i = 0; i < 3; i++) if (score < th[i]!) return { left: th[i]! - score, star: i + 1 };
  return null;
}
