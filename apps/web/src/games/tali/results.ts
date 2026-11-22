/**
 * End of a Satu Tali session: one team result (everyone shares the stars, rank 1) and one title for
 * every climber, picked from what they did for the team.
 */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import { assignTitles, type TitleRule } from '../../shared/kotak/titles';
import type { Climber, TaliMatch } from './logic';
import { formatClock, STR } from './strings';

type AwardKey = keyof typeof STR.awards;

const ICONS: Record<AwardKey, GameIcon> = {
  saver: 'heart',
  drama: 'star',
  sync: 'zap',
  climber: 'build',
  anchor: 'target',
  rope: 'fire',
  leader: 'crown',
  thrower: 'zap',
  jumper: 'star',
  buddy: 'heart',
};

function awardFor(key: AwardKey, c: Climber): GameAward {
  const s = c.stats;
  const a = STR.awards;
  const desc: Record<AwardKey, string> = {
    saver: a.saver.desc(s.catches + s.rescues),
    drama: a.drama.desc(s.hangs),
    sync: a.sync.desc(s.syncJumps),
    climber: a.climber.desc(s.climbs),
    anchor: a.anchor.desc(Math.round(s.gripTime)),
    rope: a.rope.desc(s.ropeClimbs),
    leader: a.leader.desc(s.firstIn),
    thrower: a.thrower.desc(s.throws),
    jumper: a.jumper.desc(s.jumps),
    buddy: a.buddy.desc(),
  };
  return { playerId: c.id, title: a[key].title, desc: desc[key], icon: ICONS[key] };
}

/** One title per climber, best fit first. */
export function pickAwards(climbers: readonly Climber[]): GameAward[] {
  const by = new Map(climbers.map((c) => [c.id, c.stats]));
  const st = (id: number) => by.get(id)!;
  const atLeast = (v: number, min: number) => (v >= min ? v : null);
  const rules: TitleRule<AwardKey>[] = [
    { key: 'saver', score: (id) => atLeast(st(id).catches + st(id).rescues, 1) },
    { key: 'climber', score: (id) => atLeast(st(id).climbs, 1) },
    { key: 'drama', score: (id) => atLeast(st(id).hangs + st(id).falls, 1) },
    { key: 'sync', score: (id) => atLeast(st(id).syncJumps, 2) },
    { key: 'leader', score: (id) => atLeast(st(id).firstIn, 1) },
    { key: 'rope', score: (id) => atLeast(st(id).ropeClimbs, 3) },
    { key: 'anchor', score: (id) => atLeast(st(id).gripTime, 5) },
    { key: 'thrower', score: (id) => atLeast(st(id).throws, 1) },
    { key: 'jumper', score: (id) => atLeast(st(id).jumps, 10) },
  ];
  const titles = assignTitles(
    climbers.map((c) => c.id),
    rules,
    'buddy',
  );
  return climbers.map((c) => awardFor(titles.get(c.id) ?? 'buddy', c));
}

export function buildResult(m: TaliMatch, awards: GameAward[], record: boolean): GameResult {
  const max = m.sections * 3;
  return {
    title: record ? `${STR.winner(m.stars, max)} ${STR.newRecord}` : STR.winner(m.stars, max),
    subtitle: STR.winnerSub(m.route, m.stars, max, formatClock(m.teamTime)),
    ranking: m.climbers.map((c) => ({
      playerId: c.id,
      score: m.stars,
      rank: 1,
      label: STR.rankLabel(m.stars),
    })),
    awards,
  };
}
