/**
 * End of a Lantai Runtuh session: the platform result (ranking by total score) and one title for
 * every contestant.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { assignTitles, type TitleRule } from '../../shared/kotak/titles';
import type { Contestant, RuntuhMatch } from './logic';
import { STR } from './strings';

type AwardKey = keyof typeof STR.awards;

const ICONS: Record<AwardKey, GameIcon> = {
  king: 'crown',
  pusher: 'fire',
  slick: 'zap',
  eagle: 'target',
  dancer: 'star',
  busy: 'fire',
  brave: 'heart',
  calm: 'heart',
};

function awardFor(key: AwardKey, p: Contestant): GameAward {
  const s = p.stats;
  const a = STR.awards;
  const desc: Record<AwardKey, string> = {
    king: a.king.desc(s.survived),
    pusher: a.pusher.desc(s.knockouts),
    slick: a.slick.desc(s.nearMisses),
    eagle: a.eagle.desc(),
    dancer: a.dancer.desc(Math.round(s.distance)),
    busy: a.busy.desc(s.pushes),
    brave: a.brave.desc(s.falls),
    calm: a.calm.desc(),
  };
  return { playerId: p.id, title: a[key].title, desc: desc[key], icon: ICONS[key] };
}

export function pickAwards(players: readonly Contestant[]): GameAward[] {
  const by = new Map(players.map((p) => [p.id, p.stats]));
  const st = (id: number) => by.get(id)!;
  const rules: TitleRule<AwardKey>[] = [
    { key: 'king', score: (id) => (st(id).survived > 0 ? st(id).survived : null) },
    { key: 'pusher', score: (id) => (st(id).knockouts > 0 ? st(id).knockouts : null) },
    { key: 'slick', score: (id) => (st(id).nearMisses > 0 ? st(id).nearMisses : null) },
    { key: 'eagle', score: (id) => (st(id).finalSurvivor ? st(id).survived : null) },
    { key: 'dancer', score: (id) => st(id).distance },
    { key: 'busy', score: (id) => (st(id).pushes >= 3 ? st(id).pushes : null) },
    { key: 'brave', score: (id) => (st(id).falls >= 2 ? st(id).falls : null) },
  ];
  const titles = assignTitles(
    players.map((p) => p.id),
    rules,
    'calm',
  );
  return players.map((p) => awardFor(titles.get(p.id) ?? 'calm', p));
}

export function buildResult(m: RuntuhMatch, awards: GameAward[], cpus: PlayerInfo[]): GameResult {
  const order = m.standings();
  let rank = 0;
  let prev = Number.NaN;
  const ranking = order.map((p, i) => {
    if (p.total !== prev) rank = i + 1;
    prev = p.total;
    return { playerId: p.id, score: p.total, rank };
  });
  const top = order[0];
  const result: GameResult = {
    title: top ? STR.winner(top.name) : STR.gameTitle,
    subtitle: STR.winnerSub,
    ranking,
    awards,
  };
  const used = cpus.filter((c) => order.some((p) => p.id === c.id));
  if (used.length > 0) result.cpuPlayers = used;
  return result;
}
