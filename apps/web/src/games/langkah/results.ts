/**
 * End of a Langkah Maut session: the platform result (ranking by total points) and one title for
 * every walker.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { assignTitles, type TitleRule } from '../../shared/kotak/titles';
import type { LangkahMatch, Walker } from './logic';
import { STR } from './strings';

type AwardKey = keyof typeof STR.awards;

const ICONS: Record<AwardKey, GameIcon> = {
  steel: 'crown',
  survivor: 'heart',
  rhythm: 'target',
  nekat: 'fire',
  pas: 'zap',
  oops: 'star',
  brave: 'heart',
  calm: 'star',
};

function awardFor(key: AwardKey, p: Walker): GameAward {
  const s = p.stats;
  const a = STR.awards;
  const desc: Record<AwardKey, string> = {
    steel: a.steel.desc(s.best),
    survivor: a.survivor.desc(s.survived),
    rhythm: a.rhythm.desc(s.bestStreak),
    nekat: a.nekat.desc(s.fast),
    pas: a.pas.desc(s.pas),
    oops: a.oops.desc(s.wrong),
    brave: a.brave.desc(s.falls),
    calm: a.calm.desc(),
  };
  return { playerId: p.id, title: a[key].title, desc: desc[key], icon: ICONS[key] };
}

export function pickAwards(players: readonly Walker[]): GameAward[] {
  const by = new Map(players.map((p) => [p.id, p.stats]));
  const st = (id: number) => by.get(id)!;
  const rules: TitleRule<AwardKey>[] = [
    { key: 'steel', score: (id) => (st(id).best > 0 ? st(id).best : null) },
    { key: 'survivor', score: (id) => (st(id).survived > 0 ? st(id).survived : null) },
    { key: 'rhythm', score: (id) => (st(id).bestStreak >= 5 ? st(id).bestStreak : null) },
    { key: 'nekat', score: (id) => (st(id).fast >= 3 ? st(id).fast : null) },
    { key: 'pas', score: (id) => (st(id).pas > 0 ? st(id).pas : null) },
    { key: 'oops', score: (id) => (st(id).wrong > 0 ? st(id).wrong : null) },
    { key: 'brave', score: (id) => (st(id).falls >= 2 ? st(id).falls : null) },
  ];
  const titles = assignTitles(
    players.map((p) => p.id),
    rules,
    'calm',
  );
  return players.map((p) => awardFor(titles.get(p.id) ?? 'calm', p));
}

export function buildResult(m: LangkahMatch, awards: GameAward[], cpus: PlayerInfo[]): GameResult {
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
    subtitle: STR.winnerSub(m.babakCount),
    ranking,
    awards,
  };
  const used = cpus.filter((c) => order.some((p) => p.id === c.id));
  if (used.length > 0) result.cpuPlayers = used;
  return result;
}
