/**
 * Obby phone views (pure, testable): landscape pad with the joystick and one big LOMPAT button
 * while racing, the countdown, a cheering wait after finishing, the podium between tracks and the
 * final result.
 */
import type { ControllerView, GuestPlayer, PadButton } from '@hoorah/protocol';
import { type ObbyMatch, type Racer, TIMING } from './logic';
import { formatClock, STR } from './strings';

/** How long the "brought to the save pad" or "fell" callout stays on the phone (s). */
export const ALERT_S = 2.4;

export const JUMP_BUTTON: PadButton = {
  id: 'jump',
  label: STR.jump,
  icon: 'jump',
  tone: 'yellow',
  press: 'tap',
  big: true,
};

export interface ViewContext {
  match: ObbyMatch;
  id: number;
  guests: GuestPlayer[];
  /** Seconds since this runner last fell (Infinity = not recently). */
  sinceFall: number;
  /** Final rank once the session is over. */
  finalRank: number | null;
  /** Award titles per runner once the session is over. */
  titles: ReadonlyMap<number, string>;
}

function place(m: ObbyMatch, r: Racer): number {
  return m.standings().indexOf(r) + 1;
}

function aheadHint(m: ObbyMatch, r: Racer): string {
  const order = m.standings();
  const i = order.indexOf(r);
  if (i <= 0) return STR.leading;
  const front = order[i - 1]!;
  const a = m.sim.body(front.id);
  const b = m.sim.body(r.id);
  if (!a || !b) return STR.leading;
  return STR.ahead(front.name, Math.abs(a.pos.x - b.pos.x));
}

export function padView(m: ObbyMatch, r: Racer, sinceFall: number): ControllerView {
  const total = m.course.saves.length - 1;
  const view: ControllerView = {
    kind: 'pad',
    mode: 'stick',
    color: r.color,
    eyebrow: STR.trackOf(m.trackNo, m.tracks),
    title: STR.padTitle(r.save, total),
    stats: [
      { label: STR.statPos, value: `${place(m, r)}/${m.racers.length}` },
      { label: STR.statTime, value: formatClock(m.timeLeft()) },
    ],
    buttons: [JUMP_BUTTON],
    hint: aheadHint(m, r),
  };
  if (r.sincePull < ALERT_S) view.alert = { title: STR.pulledTitle, body: STR.pulledBody, tone: 'yellow' };
  else if (sinceFall < ALERT_S) view.alert = { title: STR.fallTitle, body: STR.fallBody, tone: 'red' };
  return view;
}

export function viewFor(ctx: ViewContext): ControllerView {
  const { match: m, id } = ctx;
  const r = m.racer(id);
  if (!r) {
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
  const others = m.racers.filter((o) => o.id !== id).map((o) => o.id);
  const withGuests = (v: ControllerView): ControllerView =>
    ctx.guests.length > 0 ? { ...v, guests: ctx.guests } : v;
  switch (m.phase) {
    case 'intro':
      return withGuests({
        kind: 'countdown',
        value: String(m.trackNo + 1),
        title: STR.introTitle(m.trackNo),
        subtitle: STR.introSub,
        color: r.color,
        opponents: others,
      });
    case 'count':
      return withGuests({
        kind: 'countdown',
        value: String(m.countValue),
        title: STR.countTitle,
        subtitle: STR.countSub(m.trackNo, m.tracks),
        color: r.color,
        opponents: others,
      });
    case 'race':
      if (r.finishedAt !== null) {
        return {
          kind: 'message',
          eyebrow: STR.trackOf(m.trackNo, m.tracks),
          title: STR.finishedTitle(r.place ?? 1),
          subtitle: STR.finishedSub,
          tone: 'good',
          avatarOf: id,
          stats: [{ label: STR.statTime, value: formatClock(m.timeLeft()) }],
          reactions: true,
        };
      }
      return padView(m, r, ctx.sinceFall);
    case 'podium': {
      const res = m.lastResults.find((t) => t.id === id);
      return {
        kind: 'message',
        eyebrow: STR.podiumTitle(m.trackNo, m.tracks),
        title: STR.podiumPhone(res?.place ?? m.racers.length),
        subtitle: m.trackNo + 1 < m.tracks ? STR.podiumNext(TIMING.podium - m.phaseT) : STR.podiumLast,
        tone: res?.place === 1 ? 'good' : 'neutral',
        avatarOf: id,
        stats: [
          { label: STR.statPoints, value: STR.pointsShort(res?.points ?? 0) },
          { label: STR.statTotal, value: String(r.total) },
        ],
        reactions: true,
      };
    }
    case 'done': {
      const rank = ctx.finalRank ?? m.sessionStandings().indexOf(r) + 1;
      const title = ctx.titles.get(id);
      const view: ControllerView = {
        kind: 'result',
        tone: rank === 1 ? 'win' : rank <= 3 ? 'good' : 'neutral',
        title: STR.resultPhoneTitle(rank),
        big: String(r.total),
        subtitle: STR.resultPhoneSub(r.total),
        stats: [
          { label: STR.statFalls, value: String(r.stats.falls) },
          { label: STR.statJumps, value: String(r.stats.jumps) },
        ],
      };
      return title ? { ...view, chips: [title] } : view;
    }
  }
}
