/**
 * End of an Obby session: the platform result (ranking by total points) and one title for every
 * runner, picked from their session stats.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { assignTitles, type TitleRule } from '../../shared/kotak/titles';
import type { ObbyMatch, Racer } from './logic';
import { formatTime, STR } from './strings';

type AwardKey = keyof typeof STR.awards;

const ICONS: Record<AwardKey, GameIcon> = {
  champ: 'crown',
  fastest: 'zap',
  flight: 'star',
  comeback: 'heart',
  clean: 'target',
  swept: 'fire',
  pioneer: 'build',
  hopper: 'zap',
  spring: 'star',
  brave: 'heart',
};

function awardFor(key: AwardKey, r: Racer): GameAward {
  const s = r.stats;
  const a = STR.awards;
  const desc: Record<AwardKey, string> = {
    champ: a.champ.desc(s.wins),
    fastest: a.fastest.desc(formatTime(s.best ?? 0)),
    flight: a.flight.desc(s.flight.toFixed(1).replace('.', ',')),
    comeback: a.comeback.desc(s.falls + s.pulls),
    clean: a.clean.desc(s.falls),
    swept: a.swept.desc(s.sweeps),
    pioneer: a.pioneer.desc(s.firstSaves),
    hopper: a.hopper.desc(s.jumps),
    spring: a.spring.desc(s.springs),
    brave: a.brave.desc(),
  };
  return { playerId: r.id, title: a[key].title, desc: desc[key], icon: ICONS[key] };
}

/** One title per runner. */
export function pickAwards(racers: readonly Racer[]): GameAward[] {
  const by = new Map(racers.map((r) => [r.id, r]));
  const st = (id: number) => by.get(id)!.stats;
  const rules: TitleRule<AwardKey>[] = [
    { key: 'champ', score: (id) => (st(id).wins > 0 ? st(id).wins : null) },
    { key: 'fastest', score: (id) => (st(id).best !== null ? -st(id).best! : null) },
    { key: 'flight', score: (id) => (st(id).flight >= 2 ? st(id).flight : null) },
    {
      key: 'comeback',
      score: (id) => (st(id).falls + st(id).pulls >= 2 ? st(id).falls + st(id).pulls : null),
    },
    { key: 'pioneer', score: (id) => (st(id).firstSaves > 0 ? st(id).firstSaves : null) },
    { key: 'clean', score: (id) => (st(id).falls <= 2 ? -st(id).falls : null) },
    { key: 'swept', score: (id) => (st(id).sweeps >= 1 ? st(id).sweeps : null) },
    { key: 'spring', score: (id) => (st(id).springs >= 2 ? st(id).springs : null) },
    { key: 'hopper', score: (id) => (st(id).jumps >= 5 ? st(id).jumps : null) },
  ];
  const titles = assignTitles(
    racers.map((r) => r.id),
    rules,
    'brave',
  );
  return racers.map((r) => awardFor(titles.get(r.id) ?? 'brave', r));
}

export function buildResult(m: ObbyMatch, awards: GameAward[], cpus: PlayerInfo[]): GameResult {
  const order = m.sessionStandings();
  let rank = 0;
  let prev = Number.NaN;
  const ranking = order.map((r, i) => {
    if (r.total !== prev) rank = i + 1;
    prev = r.total;
    return { playerId: r.id, score: r.total, rank, label: STR.totalShort(r.total) };
  });
  const top = order[0];
  const result: GameResult = {
    title: top ? STR.winner(top.name) : STR.gameTitle,
    subtitle: STR.winnerSub(m.tracks),
    ranking,
    awards,
  };
  const used = cpus.filter((c) => order.some((r) => r.id === c.id));
  if (used.length > 0) result.cpuPlayers = used;
  return result;
}
