/**
 * Satu Tali phone views (pure, testable): the Host's route picker (others watch it locked), the
 * landscape pad (joystick + LOMPAT + PEGANG, plus LEMPAR when tied to the sandbag) with callouts
 * when a friend falls or you hang, the flag between sections and the final result.
 */
import type { ControllerView, GuestPlayer, MenuOption, PadButton } from '@hoorah/protocol';
import { ROUTES, type RouteId } from './course';
import { type Climber, SACK_ID, type TaliMatch, TIMING } from './logic';
import { formatClock, STR } from './strings';

/** How long a catch or a team fall stays on the phone (s). */
export const ALERT_S = 2.2;

const ROUTE_COLOR: Record<RouteId, string> = { senja: '#FF8A3D', bambu: '#22B35E', salju: '#2F8CFF' };

export interface PickContext {
  route: RouteId;
  isHost: boolean;
  hostName: string;
  humans: number;
  /** Best team time per route (s), shown under the option. */
  best: Partial<Record<RouteId, number>>;
}

export function pickView(ctx: PickContext): ControllerView {
  const options: MenuOption[] = ROUTES.map((id) => {
    const best = ctx.best[id];
    return {
      id,
      label: STR.routes[id].name,
      sub: best !== undefined ? STR.recordLabel(formatClock(best)) : STR.routes[id].sub,
      color: ROUTE_COLOR[id],
      thumb: id,
    };
  });
  const view: ControllerView = {
    kind: 'menu',
    eyebrow: STR.pickEyebrow,
    title: STR.pickTitle,
    hint: ctx.humans <= 1 ? STR.pickSolo : STR.pickHint,
    options,
    selected: ctx.route,
    confirm: { id: 'start', label: STR.pickStart, style: 'yellow' },
  };
  if (ctx.isHost) return view;
  const { confirm: _c, hint: _h, ...rest } = view;
  return { ...rest, locked: true, waiting: STR.pickWaiting(ctx.hostName) };
}

export interface ViewContext {
  match: TaliMatch;
  id: number;
  guests: GuestPlayer[];
  /** Seconds since the team last fell (Infinity = not recently). */
  sinceWipe: number;
  titles: ReadonlyMap<number, string>;
}

function buttons(m: TaliMatch, c: Climber): PadButton[] {
  const out: PadButton[] = [
    {
      id: 'jump',
      label: c.hanging ? STR.climbRope : c.ledge ? STR.vault : STR.jump,
      icon: 'jump',
      tone: 'yellow',
      press: 'tap',
      big: true,
    },
    { id: 'grip', label: STR.grip, sub: STR.gripSub, icon: 'hand', tone: 'orange', press: 'hold' },
  ];
  if (m.sack)
    out.push({
      id: 'throw',
      label: STR.throw,
      sub: STR.throwSub,
      icon: 'throw',
      tone: 'cream',
      press: 'tap',
    });
  return out;
}

function ropeWord(m: TaliMatch, id: number): string {
  let k = 0;
  for (let i = 0; i < m.rope.links.length; i++) {
    const l = m.rope.links[i]!;
    if (l.a === id || l.b === id) k = Math.max(k, m.rope.strain(i));
  }
  return k < 0.25 ? STR.ropeSlack : k < 0.75 ? STR.ropeTight : STR.ropeDanger;
}

function nameOf(m: TaliMatch, id: number): string {
  return id === SACK_ID ? STR.sack : (m.climber(id)?.name ?? '');
}

export function padView(m: TaliMatch, c: Climber, sinceWipe: number): ControllerView {
  const tied = m.rope.neighbours(c.id).map((n) => nameOf(m, n));
  const flags = m.results.filter((r) => r.done).length;
  const view: ControllerView = {
    kind: 'pad',
    mode: 'stick',
    color: c.color,
    eyebrow: STR.sectionOf(m.sectionNo, m.sections),
    title: STR.padTitle(flags, m.sections),
    stats: [
      { label: STR.statTime, value: formatClock(m.teamTime + m.sectionT) },
      { label: STR.statCatches, value: String(m.catches) },
    ],
    buttons: buttons(m, c),
    hint: tied.length > 0 ? `${STR.tiedTo(tied)} · ${ropeWord(m, c.id)}` : ropeWord(m, c.id),
  };
  const friendDown = m.rope.neighbours(c.id).some((n) => m.climber(n)?.hanging);
  const sackDown = m.sack && !c.grip && sackHanging(m);
  if (sinceWipe < ALERT_S) view.alert = { title: STR.wipeToast, tone: 'red' };
  else if (c.hanging && c.sinceCatch < ALERT_S)
    view.alert = {
      title: STR.caughtTitle,
      body: STR.caughtBody(m.holders(c.id, true).map((n) => nameOf(m, n))),
      tone: 'yellow',
    };
  else if (c.hanging) view.alert = { title: STR.hangTitle, body: STR.hangBody, tone: 'red' };
  else if (c.ledge) view.alert = { title: STR.ledgeTitle, body: STR.ledgeBody, tone: 'yellow' };
  else if (friendDown) view.alert = { title: STR.friendFellTitle, body: STR.friendFellBody, tone: 'red' };
  else if (sackDown) view.alert = { title: STR.sackTitle, body: STR.sackBody, tone: 'yellow' };
  return view;
}

/** The sandbag dangles below its owner (in the air, well below them, rope pulling). */
export function sackHanging(m: TaliMatch): boolean {
  const s = m.sim.body(SACK_ID);
  if (!s || s.ground >= 0) return false;
  return m.rope.neighbours(SACK_ID).some((n) => {
    const o = m.sim.body(n);
    const li = m.rope.linkOf(SACK_ID, n);
    return !!o && o.pos.y > s.pos.y + 0.8 && (m.rope.tension[li] ?? 0) > 6;
  });
}

export function viewFor(ctx: ViewContext): ControllerView {
  const { match: m, id } = ctx;
  const c = m.climber(id);
  if (!c) {
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
  const others = m.climbers.filter((o) => o.id !== id).map((o) => o.id);
  const withGuests = (v: ControllerView): ControllerView =>
    ctx.guests.length > 0 ? { ...v, guests: ctx.guests } : v;
  switch (m.phase) {
    case 'intro':
      return withGuests({
        kind: 'countdown',
        value: String(m.sectionNo + 1),
        title: STR.introTitle(m.sectionNo),
        subtitle: STR.introSub,
        color: c.color,
        opponents: others,
      });
    case 'count':
      return withGuests({
        kind: 'countdown',
        value: String(m.countValue),
        title: STR.countTitle,
        subtitle: STR.countSub(m.sectionNo, m.sections),
        color: c.color,
        opponents: others,
      });
    case 'climb':
      return padView(m, c, ctx.sinceWipe);
    case 'flag': {
      const r = m.results[m.results.length - 1];
      const done = r?.done ?? false;
      return {
        kind: 'message',
        eyebrow: STR.sectionOf(m.sectionNo, m.sections),
        title: done ? STR.flagPhoneTitle(m.sectionNo) : STR.timeoutTitle,
        subtitle: done ? STR.flagPhoneSub(r?.stars ?? 1) : STR.timeoutSub,
        tone: done ? 'good' : 'warn',
        avatarOf: id,
        stats: [
          { label: STR.statStars, value: STR.starsOf(m.stars, m.results.length * 3) },
          { label: STR.statTime, value: formatClock(r?.time ?? 0) },
        ],
        reactions: true,
      };
    }
    case 'done': {
      const max = m.sections * 3;
      const title = ctx.titles.get(id);
      const view: ControllerView = {
        kind: 'result',
        tone: m.stars >= max * 0.6 ? 'win' : 'good',
        title: STR.resultPhoneTitle(m.stars, max),
        big: STR.starsOf(m.stars, max),
        subtitle: STR.resultPhoneSub(formatClock(m.teamTime)),
        stats: [
          { label: STR.statCatchesLong, value: String(c.stats.catches + c.stats.rescues) },
          { label: STR.statStars, value: String(m.stars) },
        ],
      };
      return title ? { ...view, chips: [title] } : view;
    }
  }
}

/** Seconds left of the flag card (phones and HUD). */
export function flagLeft(m: TaliMatch): number {
  return TIMING.flag - m.phaseT;
}
