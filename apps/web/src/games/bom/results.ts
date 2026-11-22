/**
 * End of a Bom Oper session: the platform result (most lives first, then who lasted longer, then
 * less time holding a bomb) and one title for every runner, picked from their session stats.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { assignTitles, type TitleRule } from '../../shared/kotak/titles';
import type { BomMatch, Runner } from './logic';
import { STR } from './strings';

type AwardKey = keyof typeof STR.awards;

const ICONS: Record<AwardKey, GameIcon> = {
  champ: 'crown',
  passer: 'zap',
  slippery: 'star',
  near: 'fire',
  panic: 'zap',
  tough: 'heart',
  magnet: 'target',
  brave: 'heart',
};

function awardFor(key: AwardKey, r: Runner): GameAward {
  const s = r.stats;
  const a = STR.awards;
  const desc: Record<AwardKey, string> = {
    champ: a.champ.desc(r.lives),
    passer: a.passer.desc(s.passes),
    slippery: a.slippery.desc(Math.round(s.holdTime)),
    near: a.near.desc(s.nearMisses),
    panic: a.panic.desc(Math.round(s.distance)),
    tough: a.tough.desc(),
    magnet: a.magnet.desc(s.caught),
    brave: a.brave.desc(),
  };
  return { playerId: r.id, title: a[key].title, desc: desc[key], icon: ICONS[key] };
}

/** One title per runner: the winner first, then the best fit for everyone else. */
export function pickAwards(m: BomMatch): GameAward[] {
  const order = m.standings();
  const top = order[0];
  const by = new Map(m.runners.map((r) => [r.id, r]));
  const r = (id: number) => by.get(id)!;
  const rules: TitleRule<AwardKey>[] = [
    { key: 'champ', score: (id) => (top && id === top.id && r(id).lives > 0 ? 1 : null) },
    { key: 'near', score: (id) => (r(id).stats.nearMisses >= 1 ? r(id).stats.nearMisses : null) },
    { key: 'passer', score: (id) => (r(id).stats.passes >= 2 ? r(id).stats.passes : null) },
    { key: 'tough', score: (id) => (r(id).lives === 1 && !r(id).out ? 1 : null) },
    { key: 'slippery', score: (id) => (r(id).stats.caught <= 1 ? -r(id).stats.holdTime : null) },
    { key: 'magnet', score: (id) => (r(id).stats.caught >= 3 ? r(id).stats.caught : null) },
    { key: 'panic', score: (id) => (r(id).stats.distance >= 40 ? r(id).stats.distance : null) },
  ];
  const titles = assignTitles(
    m.runners.map((x) => x.id),
    rules,
    'brave',
  );
  return m.runners.map((x) => awardFor(titles.get(x.id) ?? 'brave', x));
}

export function buildResult(m: BomMatch, awards: GameAward[], cpus: PlayerInfo[]): GameResult {
  const order = m.standings();
  let rank = 0;
  let prevKey = '';
  const ranking = order.map((r, i) => {
    const key = `${r.lives}:${r.stats.outRound}`;
    if (key !== prevKey) rank = i + 1;
    prevKey = key;
    return { playerId: r.id, score: r.lives, rank, label: STR.rankLabel(r.lives) };
  });
  const top = order[0];
  const result: GameResult = {
    title: top ? STR.winner(top.name) : STR.gameTitle,
    subtitle: STR.winnerSub(m.arena.id, m.roundNo + 1),
    ranking,
    awards,
  };
  const used = cpus.filter((c) => order.some((r) => r.id === c.id));
  if (used.length > 0) result.cpuPlayers = used;
  return result;
}
