/**
 * Seluncur Es phone views (pure, testable): the slingshot while aiming (with a radar of the floe),
 * the same pad locked while everyone slides, a waiting screen with cheers for whoever fell in,
 * the round cards and the final result.
 */
import type { ControllerView, GuestPlayer, SlingMap } from '@hoorah/protocol';
import { type EsMatch, REACH, type Skater, TIMING } from './logic';
import { STR } from './strings';

export interface ViewContext {
  match: EsMatch;
  id: number;
  guests: GuestPlayer[];
  titles: ReadonlyMap<number, string>;
  /** Server time this shot's aiming closes (0 = unknown). */
  deadline: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function rank(m: EsMatch, p: Skater): number {
  return m.standings().indexOf(p) + 1;
}

function radar(m: EsMatch, p: Skater): SlingMap {
  const map: SlingMap = {
    edge: r2(m.edge),
    reach: r2(REACH),
    me: { x: r2(p.pos.x), y: r2(p.pos.y) },
    others: m
      .standing()
      .filter((o) => o.id !== p.id)
      .map((o) => ({ id: o.id, x: r2(o.pos.x), y: r2(o.pos.y) })),
  };
  if (m.nextEdge < m.edge) map.next = r2(m.nextEdge);
  return map;
}

function slingView(ctx: ViewContext, p: Skater): ControllerView {
  const m = ctx.match;
  const aiming = m.phase === 'aim';
  const view: ControllerView = {
    kind: 'sling',
    eyebrow: STR.phoneEyebrow(m.round, m.shot),
    title: aiming ? STR.phoneAim : STR.phoneSlide,
    color: p.color,
    map: radar(m, p),
    status: aiming ? STR.locksOf(m.locks(), m.standing().length) : STR.watchSlide,
    shot: m.round * 100 + m.shot,
  };
  if (aiming && ctx.deadline > 0) view.deadline = ctx.deadline;
  if (p.aim) view.aim = { x: p.aim.x, y: p.aim.y };
  if (aiming) view.hint = STR.phoneHint;
  else view.locked = true;
  return view;
}

export function viewFor(ctx: ViewContext): ControllerView {
  const { match: m, id } = ctx;
  const p = m.player(id);
  if (!p) {
    return {
      kind: 'message',
      eyebrow: STR.gameTitle,
      title: STR.spectatorTitle,
      subtitle: STR.spectatorSub,
      tone: 'neutral',
      avatarOf: id,
      reactions: true,
    };
  }
  const withGuests = (v: ControllerView): ControllerView =>
    ctx.guests.length > 0 ? { ...v, guests: ctx.guests } : v;
  switch (m.phase) {
    case 'intro':
      return withGuests({
        kind: 'countdown',
        value: String(Math.max(1, Math.ceil(TIMING.intro - m.phaseT))),
        title: STR.introTitle(m.round, m.roundCount),
        subtitle: m.isFinal ? STR.introSubFinal : STR.introSub,
        color: p.color,
        opponents: m
          .contestants()
          .filter((o) => o.id !== id)
          .map((o) => o.id),
      });
    case 'aim':
    case 'slide':
    case 'settle': {
      if (!p.inRound) {
        return {
          kind: 'message',
          eyebrow: STR.roundOf(m.round, m.roundCount),
          title: STR.waitTitle,
          subtitle: STR.waitSub,
          tone: 'neutral',
          avatarOf: id,
          reactions: true,
        };
      }
      if (p.out) {
        return {
          kind: 'message',
          eyebrow: STR.roundOf(m.round, m.roundCount),
          title: STR.outTitle,
          subtitle: STR.outSub(m.round + 1 < m.roundCount),
          tone: 'bad',
          avatarOf: id,
          stats: [
            { label: STR.statRound, value: String(m.roundPoints(p)) },
            { label: STR.statPoints, value: String(p.total) },
          ],
          reactions: true,
        };
      }
      return withGuests(slingView(ctx, p));
    }
    case 'end': {
      const pts = p.rounds[m.round] ?? 0;
      const won = p.inRound && !p.out;
      return {
        kind: 'message',
        eyebrow: STR.roundOf(m.round, m.roundCount),
        title: STR.endTitle(pts),
        subtitle: won ? STR.endWin : STR.endSub,
        tone: won ? 'good' : 'neutral',
        avatarOf: id,
        stats: [
          { label: STR.statPoints, value: String(p.total) },
          { label: STR.statRank, value: `${rank(m, p)}/${m.players.length}` },
        ],
        reactions: true,
      };
    }
    case 'final':
    case 'done': {
      const r = rank(m, p);
      const title = ctx.titles.get(id);
      const view: ControllerView = {
        kind: 'result',
        tone: r === 1 ? 'win' : r <= 3 ? 'good' : 'neutral',
        title: STR.resultPhoneTitle(r),
        big: String(p.total),
        subtitle: STR.resultPhoneSub(p.stats.wins),
        stats: [
          { label: STR.statWins, value: String(p.stats.wins) },
          { label: STR.statKnock, value: String(p.stats.knockouts) },
        ],
      };
      return title ? { ...view, chips: [title] } : view;
    }
  }
}
