/**
 * Phone views for every phase (pure, testable): the Host's setup menus (others see them locked),
 * the countdown, the landscape pad with joystick and three buttons while cooking, and the result.
 */
import type { ControllerView, GuestPlayer, MenuOption, PadButton } from '@hoorah/protocol';
import { LOOK_COLOR } from './art';
import { CHOPS_TO, type Item, isFull, itemLook } from './items';
import { DIFFICULTIES, KITCHENS, recommended, type Side, sideOfX } from './kitchens';
import type { Chef, DapurMatch } from './logic';
import { partOf } from './recipes';
import type { Setup } from './setup';
import { formatClock, formatScore, STR } from './strings';
import { pickReceiver } from './throw';

/** How long "Bajumu kotor!" stays on the phone after a hit. */
export const HIT_ALERT_MS = 1_800;
const SIDE_COLOR = ['#FFC928', '#FF5A1F'] as const;
const LEVEL_COLOR = { santai: '#22B35E', normal: '#FFC928', heboh: '#F2453D' } as const;
const KITCHEN_COLOR = {
  warung: '#FFC928',
  terbelah: '#FF5A1F',
  gerobak: '#22B35E',
  sibuk: '#F2453D',
} as const;

export const PAD_BUTTONS: PadButton[] = [
  {
    id: 'grab',
    label: STR.buttons.grab,
    sub: STR.buttons.grabSub,
    icon: 'hand',
    tone: 'yellow',
    press: 'tap',
    big: true,
  },
  {
    id: 'work',
    label: STR.buttons.work,
    sub: STR.buttons.workSub,
    icon: 'knife',
    tone: 'orange',
    press: 'hold',
  },
  { id: 'throw', label: STR.buttons.throw, icon: 'throw', tone: 'cream', press: 'tap' },
];

/* ------------------------------------------------------------------ setup */

export interface SetupViewContext {
  setup: Setup;
  me: number;
  isHost: boolean;
  hostName: string;
  names: ReadonlyMap<number, string>;
  humans: number;
  guests: GuestPlayer[];
}

export function setupView(ctx: SetupViewContext): ControllerView {
  const { setup } = ctx;
  const steps = setup.split ? 3 : 2;
  let view: ControllerView;
  switch (setup.step) {
    case 'kitchen': {
      const rec = recommended(ctx.humans);
      const options: MenuOption[] = KITCHENS.map((k) => ({
        id: k,
        label: STR.kitchens[k].name,
        sub: STR.kitchens[k].desc,
        color: KITCHEN_COLOR[k],
        thumb: `kitchen-${k}`,
        ...(k === rec ? { badge: STR.recommended } : {}),
      }));
      view = {
        kind: 'menu',
        eyebrow: STR.menuEyebrow(1, steps),
        title: STR.menuKitchenTitle,
        hint: STR.menuKitchenHint,
        options,
        selected: setup.kitchen,
        confirm: { id: 'next', label: STR.menuNext, style: 'primary' },
      };
      break;
    }
    case 'level': {
      const options: MenuOption[] = DIFFICULTIES.map((d, i) => ({
        id: d,
        label: STR.levels[d].name,
        sub: STR.levelSub(STR.levels[d].desc, i + 1),
        color: LEVEL_COLOR[d],
        thumb: `level-${d}`,
      }));
      view = {
        kind: 'menu',
        eyebrow: STR.menuEyebrow(2, steps),
        title: STR.menuLevelTitle,
        hint: STR.menuLevelHint,
        options,
        selected: setup.difficulty,
        confirm: setup.split
          ? { id: 'next', label: STR.menuNext, style: 'primary' }
          : { id: 'start', label: STR.menuStart, style: 'yellow' },
        back: { id: 'back', label: STR.menuBack, style: 'secondary' },
      };
      break;
    }
    case 'sides': {
      const options: MenuOption[] = setup.order.map((id) => {
        const side = setup.sideOf(id);
        return {
          id: String(id),
          label: ctx.names.get(id) ?? '?',
          sub: STR.menuSideSub(STR.sideName[side]),
          color: SIDE_COLOR[side],
          badge: STR.sideTag[side],
        };
      });
      view = {
        kind: 'menu',
        eyebrow: STR.menuEyebrow(3, steps),
        title: STR.menuSidesTitle,
        hint: STR.menuSidesHint,
        options,
        confirm: { id: 'start', label: STR.menuStart, style: 'yellow' },
        back: { id: 'back', label: STR.menuBack, style: 'secondary' },
      };
      break;
    }
  }
  if (view.kind === 'menu' && !ctx.isHost) {
    const { confirm: _c, back: _b, hint: _h, ...rest } = view;
    view = { ...rest, locked: true, waiting: STR.menuWaiting(ctx.hostName) };
  }
  return ctx.guests.length > 0 ? { ...view, guests: ctx.guests } : view;
}

/* ------------------------------------------------------------------ play */

export function itemLabel(item: Item): string {
  return STR.items[itemLook(item)];
}

export function itemColor(item: Item): string {
  return LOOK_COLOR[itemLook(item)];
}

function sideTag(m: DapurMatch, c: Chef): string {
  return m.def.split ? STR.sideTag[c.side] : STR.openTag;
}

/** The next useful step for this cook, short enough for the phone's title line. */
export function hintFor(m: DapurMatch, c: Chef, t: number): string {
  const side: Side = sideOfX(c.x);
  const reach = (kind: string) =>
    m.stations.some((s) => s.kind === kind && (!m.def.split || sideOfX(s.x + s.w / 2) === side));
  const across = m.def.split;
  const h = c.held;
  const fire = m.stations.some((s) => s.fire && (!across || sideOfX(s.x + 0.5) === side));
  const toward = () => {
    const r = pickReceiver(m.chefs, c, {
      split: across,
      safe: m.tuning.safeThrows,
      incoming: (id) => m.flights.some((f) => f.toChef === id),
      now: t,
    });
    return r ? STR.hint.throwTo(r.name) : STR.hint.throwAcross;
  };
  if (!h) {
    if (fire) return STR.hint.getExtinguisher;
    const target = c.target === null ? null : m.stations[c.target];
    if (target?.kind === 'board' && target.item?.k === 'food' && CHOPS_TO[target.item.food])
      return STR.hint.chopping;
    if (c.stains.length > 0 && reach('sink') && c.busy === 'clean') return STR.hint.clean;
    const sink = m.stations.find((s) => s.kind === 'sink');
    const rack = m.stations.find((s) => s.kind === 'rack');
    if (sink && sink.dirty > 0 && (rack?.plates ?? 0) === 0 && reach('sink')) return STR.hint.wash;
    if (m.floor.some((f) => !across || sideOfX(f.x) === side)) return STR.hint.pickUp;
    if (reach('basket') && (!reach('pass') || !across)) return STR.hint.getFood;
    return reach('rack') ? STR.hint.catchNext : STR.hint.getFood;
  }
  if (h.k === 'extinguisher') return fire ? STR.hint.douse : STR.hint.getFood;
  if (h.k === 'glass') {
    if (!isFull(h)) return reach('soda') ? STR.hint.fillSoda : toward();
    return reach('pass') ? (c.busy === 'fill' ? STR.hint.sodaFull : STR.hint.serve) : toward();
  }
  if (h.k === 'plate') {
    if (partOf(h)) return reach('pass') ? STR.hint.serve : toward();
    return h.on.length === 0 ? STR.hint.fillPlate : STR.hint.finishPlate;
  }
  const f = h.food;
  if (f === 'gosong') return STR.hint.trash;
  if (CHOPS_TO[f]) return reach('board') ? STR.hint.chop(STR.items[f]) : toward();
  if (f === 'daging') return reach('stove') ? STR.hint.cookMeat : toward();
  if (f === 'kentangPotong') return reach('fryer') ? STR.hint.fry : toward();
  if (f === 'nasi' || f === 'telur') return reach('wok') ? STR.hint.wok : toward();
  return reach('pass') ? STR.hint.toPlate : toward();
}

function alertFor(
  m: DapurMatch,
  c: Chef,
  t: number,
): { title: string; body?: string; tone: 'yellow' | 'red' } | undefined {
  const f = m.flights.find((x) => x.toChef === c.id);
  if (f) {
    const from = m.chef(f.from);
    if (c.held && m.tuning.hits) return { title: STR.alertCatch, body: STR.alertFullBody, tone: 'red' };
    return {
      title: STR.alertCatch,
      body: STR.alertCatchBody(itemLabel(f.item), from?.name ?? ''),
      tone: 'yellow',
    };
  }
  if (t - c.hitAt < HIT_ALERT_MS) return { title: STR.alertHit, body: STR.alertHitBody, tone: 'red' };
  return undefined;
}

export function padView(m: DapurMatch, c: Chef, t: number): ControllerView {
  const view: ControllerView = {
    kind: 'pad',
    mode: 'stick',
    color: c.color,
    eyebrow: sideTag(m, c),
    title: hintFor(m, c, t),
    stats: [
      { label: STR.statTime, value: formatClock(m.timeLeft(t)) },
      { label: STR.statScore, value: formatScore(m.score) },
    ],
    buttons: PAD_BUTTONS,
  };
  if (c.held) view.carry = { label: itemLabel(c.held), color: itemColor(c.held) };
  const alert = alertFor(m, c, t);
  if (alert) view.alert = alert;
  return view;
}

function countdownView(m: DapurMatch, c: Chef, guests: GuestPlayer[]): ControllerView {
  const view: ControllerView = {
    kind: 'countdown',
    value: String(Math.max(1, m.countValue)),
    title: STR.countdownTitle,
    subtitle: m.def.split ? STR.countdownSub(STR.sideName[c.side]) : STR.countdownSubOpen,
    color: c.color,
    opponents: m.chefs.filter((o) => o.id !== c.id).map((o) => o.id),
  };
  return guests.length > 0 ? { ...view, guests } : view;
}

/** Final numbers for the result screens (fixed at time up). */
export interface RoundSummary {
  stars: 0 | 1 | 2 | 3;
  score: number;
  delivered: number;
  missed: number;
  tips: number;
  /** Award titles per cook. */
  awards: ReadonlyMap<number, string[]>;
}

function resultView(m: DapurMatch, c: Chef, s: RoundSummary): ControllerView {
  const tone = s.stars >= 3 ? 'win' : s.stars === 2 ? 'good' : s.stars === 1 ? 'neutral' : 'bad';
  const view: ControllerView = {
    kind: 'result',
    tone,
    title: STR.resultTitle[s.stars],
    big: formatScore(s.score),
    subtitle: STR.resultPhoneSub(s.stars, STR.kitchens[m.def.id].name),
    stats: [
      { label: STR.resultStatDeliveries, value: String(c.stats.deliveries) },
      { label: STR.resultStatChops, value: String(c.stats.chops) },
      { label: STR.resultStatCatches, value: String(c.stats.catches) },
    ],
  };
  const mine = s.awards.get(c.id);
  return mine && mine.length > 0 ? { ...view, chips: mine } : view;
}

export interface PlayViewContext {
  match: DapurMatch;
  id: number;
  t: number;
  summary: RoundSummary | null;
  guests: GuestPlayer[];
}

export function playViewFor(ctx: PlayViewContext): ControllerView {
  const { match: m, id, t, summary } = ctx;
  const c = m.chef(id);
  if (!c) {
    return {
      kind: 'message',
      eyebrow: STR.gameTitle,
      title: STR.spectatorTitle,
      subtitle: STR.spectatorSub,
      tone: 'neutral',
      avatarOf: id,
    };
  }
  switch (m.phase) {
    case 'countdown':
      return countdownView(m, c, ctx.guests);
    case 'play':
      return padView(m, c, t);
    case 'over':
    case 'done':
      return summary ? resultView(m, c, summary) : padView(m, c, t);
  }
}
