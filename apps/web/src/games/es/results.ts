/**
 * End of a Seluncur Es session: the platform result (ranking by total points) and one title for
 * every skater.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { assignTitles, type TitleRule } from '../../shared/kotak/titles';
import type { EsMatch, Skater } from './logic';
import { STR } from './strings';

type AwardKey = keyof typeof STR.awards;

const ICONS: Record<AwardKey, GameIcon> = {
  king: 'crown',
  bumper: 'fire',
  slick: 'zap',
  thunder: 'target',
  bold: 'fire',
  skater: 'star',
  brave: 'heart',
  calm: 'heart',
};

function awardFor(key: AwardKey, p: Skater): GameAward {
  const s = p.stats;
  const a = STR.awards;
  const desc: Record<AwardKey, string> = {
    king: a.king.desc(s.wins),
    bumper: a.bumper.desc(s.knockouts),
    slick: a.slick.desc(s.nearMisses),
    thunder: a.thunder.desc(),
    bold: a.bold.desc(s.bold),
    skater: a.skater.desc(Math.round(s.distance)),
    brave: a.brave.desc(s.falls),
    calm: a.calm.desc(),
  };
  return { playerId: p.id, title: a[key].title, desc: desc[key], icon: ICONS[key] };
}

export function pickAwards(players: readonly Skater[]): GameAward[] {
  const by = new Map(players.map((p) => [p.id, p.stats]));
  const st = (id: number) => by.get(id)!;
  const rules: TitleRule<AwardKey>[] = [
    { key: 'king', score: (id) => (st(id).wins > 0 ? st(id).wins : null) },
    { key: 'bumper', score: (id) => (st(id).knockouts > 0 ? st(id).knockouts : null) },
    { key: 'slick', score: (id) => (st(id).nearMisses > 0 ? st(id).nearMisses : null) },
    { key: 'thunder', score: (id) => (st(id).biggestHit >= 3 ? st(id).biggestHit : null) },
    { key: 'bold', score: (id) => (st(id).bold >= 2 ? st(id).bold : null) },
    { key: 'skater', score: (id) => (st(id).distance > 1 ? st(id).distance : null) },
    { key: 'brave', score: (id) => (st(id).falls >= 2 ? st(id).falls : null) },
  ];
  const titles = assignTitles(
    players.map((p) => p.id),
    rules,
    'calm',
  );
  return players.map((p) => awardFor(titles.get(p.id) ?? 'calm', p));
}

export function buildResult(m: EsMatch, awards: GameAward[], cpus: PlayerInfo[]): GameResult {
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
    subtitle: STR.winnerSub(m.roundCount),
    ranking,
    awards,
  };
  const used = cpus.filter((c) => order.some((p) => p.id === c.id));
  if (used.length > 0) result.cpuPlayers = used;
  return result;
}
