/**
 * Phone screens for every phase (pure). While running, the phone is the standard `pad` in swipe
 * mode without arrow keys, like Lari Terus (owner 2026-11-22): the whole phone is the swipe zone,
 * one swipe = one hop, a tap anywhere hops forward. Out in Bertahan, the
 * phone waits with the platform's cheer buttons and a harmless horn for the main screen.
 */
import type { ControllerView, GuestPlayer, MenuOption } from '@hoorah/protocol';
import { trainState } from './lanes';
import type { NyebrangMatch, Runner } from './logic';
import { MAP_DESC, MAP_NAME, MODE_DESC, MODE_NAME, STR } from './strings';

const MAP_COLORS = {
  kota: '#FFC928',
  sungai: '#14B8C4',
  rel: '#FF5A1F',
  malam: '#2F7DF6',
  acak: '#22B35E',
} as const;
const MODE_COLORS = { balapan: '#FFC928', bertahan: '#FF5A1F' } as const;

export interface ViewContext {
  hostId: number | null;
  name: (id: number) => string;
  color: (id: number) => string;
  guests: GuestPlayer[];
}

function setupView(m: NyebrangMatch, me: number, ctx: ViewContext): ControllerView {
  let view: Extract<ControllerView, { kind: 'menu' }>;
  if (m.setupStep === 'mode') {
    view = {
      kind: 'menu',
      eyebrow: STR.menuEyebrow(1, 2),
      title: STR.menuModeTitle,
      hint: STR.menuModeHint,
      options: (['balapan', 'bertahan'] as const).map((md) => ({
        id: md,
        label: MODE_NAME[md],
        sub: MODE_DESC[md],
        color: MODE_COLORS[md],
        thumb: `mode-${md}`,
      })),
      selected: m.mode,
      confirm: { id: 'next', label: STR.menuNext, style: 'primary' },
    };
  } else {
    const options: MenuOption[] = (['kota', 'sungai', 'rel', 'malam', 'acak'] as const).map((id) => ({
      id,
      label: MAP_NAME[id],
      sub: MAP_DESC[id],
      color: MAP_COLORS[id],
      thumb: `map-${id}`,
    }));
    view = {
      kind: 'menu',
      eyebrow: STR.menuEyebrow(2, 2),
      title: STR.menuMapTitle,
      hint: STR.menuMapHint,
      options,
      selected: m.mapPick,
      confirm: { id: 'start', label: STR.menuStart, style: 'yellow' },
      back: { id: 'back', label: STR.menuBack, style: 'secondary' },
    };
  }
  if (me !== ctx.hostId) {
    const { confirm: _c, back: _b, hint: _h, ...rest } = view;
    return {
      ...rest,
      locked: true,
      waiting: STR.menuWaiting(ctx.hostId !== null ? ctx.name(ctx.hostId) : 'Host'),
    };
  }
  return view;
}

/** A train warning or passing on one of the next two rows ahead of the runner. */
function trainAhead(m: NyebrangMatch, r: Runner): boolean {
  for (let row = r.row; row <= r.row + 2; row++) {
    const lane = m.world.lane(row);
    if (lane.kind === 'rail' && trainState(lane, m.t) !== 0) return true;
  }
  return false;
}

export function viewFor(m: NyebrangMatch, me: number, ctx: ViewContext): ControllerView | null {
  const r = m.runner(me);
  if (!r) return null;
  const withGuests = (v: ControllerView): ControllerView =>
    ctx.guests.length ? { ...v, guests: ctx.guests } : v;
  const modeName = MODE_NAME[m.mode];
  const mapName = MAP_NAME[m.map];
  switch (m.phase) {
    case 'setup':
      return setupView(m, me, ctx);
    case 'intro':
    case 'count':
      return withGuests({
        kind: 'countdown',
        value: m.phase === 'count' ? String(Math.max(1, Math.ceil(m.phaseLeft))) : '3',
        title: STR.countTitle,
        subtitle: STR.countSub(mapName, modeName),
        color: ctx.color(me),
      });
    case 'run': {
      const place = m.ranking().indexOf(r) + 1;
      if (r.state === 'out') {
        if (r.deaths === 0)
          return { kind: 'message', title: STR.watchTitle, subtitle: STR.watchSub, reactions: true };
        return {
          kind: 'message',
          eyebrow: modeName.toUpperCase(),
          title: STR.outTitle,
          subtitle: STR.outSub(Math.max(0, r.best - 1)),
          tone: 'bad',
          stats: [
            { label: STR.statDistance, value: String(Math.max(0, r.best - 1)) },
            { label: STR.statNear, value: String(r.near) },
          ],
          actions: [{ id: 'horn', label: STR.hornLabel, style: 'secondary' }],
          reactions: true,
        };
      }
      if (r.state === 'done') {
        return {
          kind: 'message',
          title: STR.doneTitle(r.place),
          subtitle: STR.doneSub,
          tone: 'good',
          stats: [
            { label: STR.statDistance, value: String(Math.max(0, r.best - 1)) },
            { label: STR.statNear, value: String(r.near) },
          ],
          reactions: true,
        };
      }
      const dead = r.state === 'dead';
      const train = !dead && trainAhead(m, r);
      return withGuests({
        kind: 'pad',
        mode: 'swipe',
        color: ctx.color(me),
        eyebrow: STR.padEyebrow(place, modeName, mapName),
        title: STR.padTitle(Math.max(0, r.best - 1)),
        stats: [
          { label: STR.statRound, value: `${m.round + 1}/${m.rounds}` },
          { label: STR.statCamera, value: STR.cameraLevel(m.level) },
          { label: STR.statNear, value: String(r.near) },
        ],
        actionLabel: STR.padAction,
        keys: false,
        hint: STR.padHint,
        ...(train ? { alert: { title: STR.trainTitle, body: STR.trainBody, tone: 'red' as const } } : {}),
        ...(dead
          ? {
              locked: true,
              banner: STR.banner(Math.max(1, Math.ceil(3 - (m.t - r.deadAt)))),
            }
          : {}),
      });
    }
    case 'roundEnd':
      return {
        kind: 'message',
        title: STR.roundPhoneTitle(m.round + 1),
        tone: 'neutral',
        stats: [
          { label: STR.statDistance, value: String(Math.max(0, r.best - 1)) },
          { label: STR.statGained, value: `+${r.gained}` },
          { label: STR.statTotal, value: String(r.score) },
        ],
        reactions: true,
      };
    case 'final':
    case 'ended': {
      const rank = m.standings().find((x) => x.r.id === me)?.rank ?? 1;
      return {
        kind: 'result',
        tone: rank === 1 ? 'win' : 'neutral',
        title: STR.finalPhone(rank),
        big: String(r.score),
        subtitle: STR.points(r.score),
      };
    }
  }
}
