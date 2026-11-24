/**
 * Long-distance play: the display state the Host's main screen publishes (every `MIRROR_MS` while
 * cooking, at once on events, pauses and phase changes) and what a far-away main screen rebuilds
 * from it. Pure (no DOM, no SDK).
 *
 * The kitchen layout is static per kitchen, so only its id goes out (plus whether Jam Sibuk moved
 * its stations). Every packet then carries the whole moving part, small enough to resend: cooks
 * (position, facing, held item, work progress, stains), stations that are not empty (item, pot,
 * heat, fire, plates), items on the floor, throws in the air, tickets, score, overlays, the
 * practice card and the result. Times are sent relative to the packet's stamp `t` (server ms), so
 * the far-away screen reads them on the server clock. Short effects (pops, floats, flashes,
 * confetti) are numbered events repeated for about a second, so a lost packet loses none.
 *
 * `MirrorFeed` (Host) keeps the numbering, `toMirror` packs, `applyMirror` validates untrusted
 * JSON, `MirrorTimeline` plays packets a little in the past (an adaptive delay, see `playout.ts`),
 * the `*At` helpers blend two packets, and `mirrorHud` rebuilds the HUD with the countdown and the
 * round clock read at server time.
 */
import { FRUITS, type Fruit, type Look, parseLook } from '@hoorah/protocol';
import type { GameIcon } from '@hoorah/sdk';
import type { GuideButton, GuideStepId, GuideTarget } from './guide';
import type { CookChip, HudState, Overlay } from './hud';
import { FOODS, type Food, type Item, type StainKind } from './items';
import {
  COLS,
  cartGap,
  DIFFICULTIES,
  type Difficulty,
  KITCHENS,
  type KitchenDef,
  type KitchenId,
  ROWS,
  type Side,
} from './kitchens';
import { type Busy, DapurMatch, type Phase, type Stain } from './logic';
import {
  type AwardInfo,
  type GuideInfo,
  guidePanel,
  playPanel,
  type ResultInfo,
  resultPanel,
  type SetupInfo,
  setupPanel,
} from './panels';
import { PlayoutClock, sinceStamp } from './playout';
import { type DishId, type Part, RECIPES } from './recipes';
import type { StageChef, StageFlight, StageMark, StageModel, StageStation } from './scene';
import type { SetupStep } from './setup';

/** Publish interval while cooking and a far-away screen watches. */
export const MIRROR_MS = 60;
/** Effect events are repeated in every packet for this long. */
export const EVENT_KEEP_MS = 1000;
export const EVENTS_KEPT = 16;
/** Floor items and throws sent at most (newest kept). */
export const FLOOR_MAX = 24;
export const FLIGHTS_MAX = 12;
/** Most cooks a packet may list (the game allows 8, plus room for the helper). */
export const COOKS_MAX = 10;
/** A hit older than this no longer shows its bubble (ms, matches the scene's). */
const HIT_KEEP_MS = 2_000;
/** Position steps per tile. */
const Q = 100;
/** Cook moved further than this between two packets (tiles): snap, no gliding. */
const JUMP_TILES = 1.5;

const NAME_MAX = 40;
const TEXT_MAX = 120;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
/** Largest relative time accepted (ms): longer than any round. */
const TIME_MAX = 3_600_000;
const STATIONS_MAX = COLS * ROWS;
const POT_MAX = 2;
const STAINS_MAX = 6;
const AWARDS_MAX = 8;
const TICKETS_MAX = 4;

const PHASES: readonly Phase[] = ['countdown', 'play', 'over', 'done'];
const BUSY: readonly Busy[] = [null, 'chop', 'wash', 'clean', 'fill', 'douse'];
const STAIN_KINDS: readonly StainKind[] = ['tomat', 'telur', 'soda', 'kuah'];
const SETUP_STEPS: readonly SetupStep[] = ['kitchen', 'level', 'sides'];
const PARTS: readonly Part[] = ['burger', 'salad', 'kentang', 'nasi', 'soda'];
const DISHES = Object.keys(RECIPES) as DishId[];
const GUIDE_STEPS: readonly GuideStepId[] = [
  'order',
  'walk',
  'take',
  'board',
  'chop',
  'throw',
  'fry',
  'rack',
  'plate',
  'serve',
];
const GUIDE_BUTTONS: readonly GuideButton[] = ['grab', 'work', 'throw'];
const ICON_SET: Record<GameIcon, true> = {
  zap: true,
  fire: true,
  heart: true,
  star: true,
  crown: true,
  target: true,
  brain: true,
  build: true,
};
const ICONS = Object.keys(ICON_SET) as GameIcon[];

/* ------------------------------------------------------------------ item coding */

const FOOD_BASE = 97; // 'a'

const foodChar = (f: Food): string => String.fromCharCode(FOOD_BASE + FOODS.indexOf(f));

function charFood(c: string): Food | null {
  return FOODS[c.charCodeAt(0) - FOOD_BASE] ?? null;
}

/**
 * An item as a short string: food letter (+ chop %), `P` + plate letters, `G` + fill % (+ `!` when
 * overfilling), `X` for the extinguisher.
 */
export function encodeItem(it: Item): string {
  switch (it.k) {
    case 'food':
      return it.chop === undefined ? foodChar(it.food) : `${foodChar(it.food)}${Math.round(it.chop * 100)}`;
    case 'plate':
      return `P${it.on.map(foodChar).join('')}`;
    case 'glass':
      return `G${Math.round(it.fill * 100)}${(it.over ?? 0) > 0 ? '!' : ''}`;
    case 'extinguisher':
      return 'X';
  }
}

const FOOD_RE = /^([a-n])(\d{1,3})?$/;
const PLATE_RE = /^P([a-n]{0,6})$/;
const GLASS_RE = /^G(\d{1,3})(!?)$/;

/** Decodes `encodeItem`; null when malformed. */
export function decodeItem(code: unknown): Item | null {
  if (typeof code !== 'string' || code.length > 8) return null;
  if (code === 'X') return { k: 'extinguisher' };
  let m = FOOD_RE.exec(code);
  if (m) {
    const f = charFood(m[1]!);
    if (!f) return null;
    if (m[2] === undefined) return { k: 'food', food: f };
    const chop = Number(m[2]);
    return chop <= 100 ? { k: 'food', food: f, chop: chop / 100 } : null;
  }
  m = PLATE_RE.exec(code);
  if (m) {
    const on: Food[] = [];
    for (const ch of m[1]!) {
      const f = charFood(ch);
      if (!f || on.includes(f)) return null;
      on.push(f);
    }
    return { k: 'plate', on };
  }
  m = GLASS_RE.exec(code);
  if (m) {
    const fill = Number(m[1]);
    if (fill > 100) return null;
    return m[2] ? { k: 'glass', fill: fill / 100, over: 1 } : { k: 'glass', fill: fill / 100 };
  }
  return null;
}

/** Stains as four base-36 digits each: kind, u and v (-1..1 in tenths), size (tenths). */
function encodeStains(list: readonly Stain[]): string {
  let out = '';
  const d = (v: number) => Math.max(0, Math.min(35, Math.round(v))).toString(36);
  for (const s of list.slice(0, STAINS_MAX)) {
    out += d(STAIN_KINDS.indexOf(s.kind)) + d((s.u + 1) * 10) + d((s.v + 1) * 10) + d(s.s * 10);
  }
  return out;
}

function decodeStains(code: unknown): Stain[] | null {
  if (typeof code !== 'string' || code.length % 4 !== 0 || code.length > STAINS_MAX * 4) return null;
  const out: Stain[] = [];
  for (let i = 0; i < code.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => Number.parseInt(code[i + k]!, 36));
    if (n.some((v) => !Number.isInteger(v) || v < 0)) return null;
    const kind = STAIN_KINDS[n[0]!];
    if (!kind || n[1]! > 20 || n[2]! > 20) return null;
    out.push({ kind, u: n[1]! / 10 - 1, v: n[2]! / 10 - 1, s: n[3]! / 10 });
  }
  return out;
}

/* ------------------------------------------------------------------ wire shapes */

/** id, name, fruit, look, colour. */
export type ChipRow = [number, string, Fruit, Look, string];

/** step, kitchen, difficulty, people, best stars per kitchen (KITCHENS order), side member ids, chips, Host name. */
export type SetupRow = [
  SetupStep,
  KitchenId,
  Difficulty,
  number,
  number[],
  [number[], number[]] | null,
  ChipRow[],
  string,
];

/**
 * Cook: id, name, fruit, look, colour, side, x and y (1/100 tile), facing x (tenths), flags,
 * held item, busy index, job ms, target station (-1: none), ms since a hit (-1: none), stains.
 */
export type ChefRow = [
  number,
  string,
  Fruit,
  Look,
  string,
  Side,
  number,
  number,
  number,
  number,
  string,
  number,
  number,
  number,
  number,
  string,
];

const F_MOVING = 1;
const F_STAGGER = 2;
/** A person steers this cook (the scene marks the station they would use). */
const F_STEER = 4;

/** Station that is not empty: id, item, pot letters, heat (1/1000), fire, douse ms, dirty plates, clean plates. */
export type StationRow = [number, string, string, number, 0 | 1, number, number, number];

/** Floor item: id, item, x, y. */
export type FloorRow = [number, string, number, number];

/** Throw: id, item, thrower, catcher (-1), counter (-1), start and end points, start (rel ms), duration ms, colour. */
export type FlightRow = [
  number,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
];

/** Ticket: id, dish, parts handed in, deadline (rel ms), patience ms. */
export type TicketRow = [number, DishId, Part[], number, number];

/** Practice card: step, index, total, waiting, helper name, button, ticket arrow, target kind ('s', 'c', ''), target id. */
export type GuideRow = [
  GuideStepId,
  number,
  number,
  0 | 1,
  string,
  GuideButton | '',
  0 | 1,
  's' | 'c' | '',
  number,
];

/** Award: player id, title, description, icon. */
export type AwardRow = [number, string, string, GameIcon];

/** Result: stars, score, delivered, missed, tips, new best, awards. */
export type ResultRow = [0 | 1 | 2 | 3, number, number, number, number, 0 | 1, AwardRow[]];

export type OverlayRow = ['n'] | ['c', number] | ['g'] | ['w'] | ['m'] | ['u'] | ['gg'] | ['gd'];

/**
 * Effects: float (text, sub, x, y, colour, size, world px or tiles), pop (x, y, colour), throw
 * pill (cook), move warning, flash, confetti.
 */
export type EventRow =
  | [number, 'f', string, string, number, number, string, number, 0 | 1]
  | [number, 'p', number, number, string]
  | [number, 't', number]
  | [number, 'm']
  | [number, 'x']
  | [number, 'y'];

export interface RoundRow {
  k: KitchenId;
  d: Difficulty;
  pr: boolean;
  ph: Phase;
  mv: boolean;
  /** Start of the cooking (rel ms) and the round clock left (ms). */
  go: number;
  left: number;
  sc: number;
  sr: 0 | 1 | 2 | 3;
  th: [number, number, number];
  ck: ChefRow[];
  sn: StationRow[];
  fl: FloorRow[];
  fx: FlightRow[];
  tk: TicketRow[];
  ov: OverlayRow;
  hint: boolean;
  /** Show the result card. */
  rs: boolean;
  res: ResultRow | null;
  gd: GuideRow | null;
}

/** Compact wire shape (short keys: it crosses the network up to 16 times a second). */
export interface DapurMirror {
  v: 1;
  /** The Host's match (a new number for every round). */
  e: number;
  /** Server ms the state was made. */
  t: number;
  hold: boolean;
  su: SetupRow | null;
  r: RoundRow | null;
  ev: EventRow[];
  en: number;
}

/* ------------------------------------------------------------------ Host side */

/** The practice as the Host's director reads it. */
export interface GuideSource {
  info: GuideInfo;
  target: GuideTarget | null;
}

export interface RoundSource {
  match: DapurMatch;
  /** Game clock now (the match's times run on it). */
  t: number;
  overlay: Overlay;
  hint: boolean;
  showResult: boolean;
  result: ResultInfo | null;
  guide: GuideSource | null;
}

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  /** Server time the state was made (game.now()). */
  server: number;
  /** The Host's screen is paused. */
  held: boolean;
  /** While the Host picks (setup and loading). */
  setup: SetupInfo | null;
  round: RoundSource | null;
}

const q = (v: number): number => Math.round(v * Q);

function chipRow(c: CookChip): ChipRow {
  return [c.id, c.name, c.fruit, c.look, c.color];
}

function setupRow(s: SetupInfo): SetupRow {
  const ids = new Set<number>();
  const chips: ChipRow[] = [];
  const add = (c: CookChip) => {
    if (ids.has(c.id)) return;
    ids.add(c.id);
    chips.push(chipRow(c));
  };
  for (const c of s.everyone) add(c);
  if (s.sides) for (const side of s.sides) for (const c of side) add(c);
  return [
    s.step,
    s.kitchen,
    s.difficulty,
    s.humans,
    KITCHENS.map((k) => s.best[k]),
    s.sides ? [s.sides[0].map((c) => c.id), s.sides[1].map((c) => c.id)] : null,
    chips,
    s.hostName,
  ];
}

function overlayRow(o: Overlay): OverlayRow {
  switch (o.kind) {
    case 'none':
      return ['n'];
    case 'count':
      return ['c', o.value];
    case 'go':
      return ['g'];
    case 'warning':
      return ['w'];
    case 'move':
      return ['m'];
    case 'timeUp':
      return ['u'];
    case 'guideGo':
      return ['gg'];
    case 'guideDone':
      return ['gd'];
  }
}

function guideRow(g: GuideSource): GuideRow {
  const tg = g.target;
  const kind = tg?.kind === 'station' ? 's' : tg?.kind === 'chef' ? 'c' : '';
  const id = tg && tg.kind !== 'ticket' ? tg.id : -1;
  const i = g.info;
  return [
    i.step,
    i.index,
    i.total,
    i.waiting ? 1 : 0,
    i.helper ?? '',
    i.button ?? '',
    i.ticket ? 1 : 0,
    kind,
    id,
  ];
}

function resultRow(r: ResultInfo): ResultRow {
  return [
    r.stars,
    r.score,
    r.delivered,
    r.missed,
    r.tips,
    r.newBest ? 1 : 0,
    r.awards.slice(0, AWARDS_MAX).map((a) => [a.playerId, a.title, a.desc, a.icon]),
  ];
}

function roundRow(src: RoundSource): RoundRow {
  const m = src.match;
  const t = src.t;
  const ck: ChefRow[] = m.chefs.slice(0, COOKS_MAX).map((c) => {
    const flags =
      (c.moving ? F_MOVING : 0) | (m.staggered(c) ? F_STAGGER : 0) | (!c.cpu && !c.pilot ? F_STEER : 0);
    const ago = t - c.hitAt;
    return [
      c.id,
      c.name,
      c.fruit,
      c.look,
      c.color,
      c.side,
      q(c.x),
      q(c.y),
      Math.round(c.faceX * 10),
      flags,
      c.held ? encodeItem(c.held) : '',
      Math.max(0, BUSY.indexOf(c.busy)),
      c.busy ? Math.round(c.jobMs) : 0,
      c.target ?? -1,
      ago >= 0 && ago < HIT_KEEP_MS ? Math.round(ago) : -1,
      encodeStains(c.stains),
    ];
  });
  const sn: StationRow[] = [];
  for (const s of m.stations) {
    const level = m.heatLevel(s);
    if (!s.item && s.pot.length === 0 && level === 0 && !s.fire && s.douseMs === 0 && !s.dirty && !s.plates)
      continue;
    sn.push([
      s.id,
      s.item ? encodeItem(s.item) : '',
      s.pot.map(foodChar).join(''),
      Math.round(level * 1000),
      s.fire ? 1 : 0,
      Math.round(s.douseMs),
      s.dirty,
      s.plates,
    ]);
  }
  const fl: FloorRow[] = m.floor.slice(-FLOOR_MAX).map((f) => [f.id, encodeItem(f.item), q(f.x), q(f.y)]);
  const fx: FlightRow[] = m.flights
    .slice(-FLIGHTS_MAX)
    .map((f) => [
      f.id,
      encodeItem(f.item),
      f.from,
      f.toChef ?? -1,
      f.toStation ?? -1,
      q(f.sx),
      q(f.sy),
      q(f.ex),
      q(f.ey),
      Math.round(f.t0 - t),
      Math.round(f.dur),
      f.color,
    ]);
  const tk: TicketRow[] = m.orders.tickets
    .slice(0, TICKETS_MAX)
    .map((k) => [k.id, k.dish, [...k.got], Math.round(k.t0 + k.waitMs - t), Math.round(k.waitMs)]);
  const th = m.thresholds;
  return {
    k: m.def.id,
    d: m.difficulty,
    pr: m.practice,
    ph: m.phase,
    mv: m.moved,
    go: Math.round(m.goAt - t),
    left: Math.round(m.timeLeft(t)),
    sc: m.score,
    sr: m.stars(),
    th: [th[0], th[1], th[2]],
    ck,
    sn,
    fl,
    fx,
    tk,
    ov: overlayRow(src.overlay),
    hint: src.hint,
    rs: src.showResult,
    res: src.result ? resultRow(src.result) : null,
    gd: src.guide ? guideRow(src.guide) : null,
  };
}

/** Packs one packet (pure). */
export function toMirror(
  src: MirrorSource,
  events: EventRow[],
  eventTop: number,
  epoch: number,
): DapurMirror {
  return {
    v: 1,
    e: epoch,
    t: Math.round(src.server),
    hold: src.held,
    su: src.round ? null : src.setup ? setupRow(src.setup) : null,
    r: src.round ? roundRow(src.round) : null,
    ev: events,
    en: eventTop,
  };
}

/** A float as the director shows it: logic tiles (`world` false) or world px. */
export interface FloatNote {
  text: string;
  sub?: string;
  x: number;
  y: number;
  color: string;
  size: number;
  world: boolean;
}

/** The Host's bookkeeping: the match number and the recent effect events. */
export class MirrorFeed {
  private events: { row: EventRow; at: number | null }[] = [];
  private seq = 0;
  private fresh = false;
  epoch: number;

  constructor(epoch: number = Math.floor(Math.random() * 1_000_000_000)) {
    this.epoch = epoch;
  }

  /** A new round: a new match number, old effects dropped. */
  reset(epoch: number = Math.floor(Math.random() * 1_000_000_000)): void {
    this.epoch = epoch;
    this.events = [];
  }

  /** Effects were noted since the last packet (publish at once). */
  get pending(): boolean {
    return this.fresh;
  }

  private push(row: EventRow): void {
    this.events.push({ row, at: null });
    if (this.events.length > EVENTS_KEPT) this.events.shift();
    this.fresh = true;
  }

  float(f: FloatNote): void {
    const x = f.world ? Math.round(f.x) : q(f.x);
    const y = f.world ? Math.round(f.y) : q(f.y);
    this.push([
      ++this.seq,
      'f',
      f.text.slice(0, TEXT_MAX),
      (f.sub ?? '').slice(0, TEXT_MAX),
      x,
      y,
      f.color,
      Math.round(f.size),
      f.world ? 1 : 0,
    ]);
  }

  mark(mk: StageMark): void {
    switch (mk.kind) {
      case 'pop':
        this.push([++this.seq, 'p', q(mk.x), q(mk.y), mk.color]);
        return;
      case 'throw':
        this.push([++this.seq, 't', mk.id]);
        return;
      case 'moveWarn':
        this.push([++this.seq, 'm']);
        return;
    }
  }

  flash(): void {
    this.push([++this.seq, 'x']);
  }

  celebrate(): void {
    this.push([++this.seq, 'y']);
  }

  /** The next packet. */
  pack(src: MirrorSource): DapurMirror {
    for (const e of this.events) e.at ??= src.server;
    this.events = this.events.filter((e) => e.at !== null && src.server - e.at <= EVENT_KEEP_MS);
    this.fresh = false;
    return toMirror(
      src,
      this.events.map((e) => e.row),
      this.seq,
      this.epoch,
    );
  }
}

/* ------------------------------------------------------------------ decoded shapes */

export interface MirrorChef {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
  side: Side;
  x: number;
  y: number;
  faceX: number;
  moving: boolean;
  staggered: boolean;
  steer: boolean;
  held: Item | null;
  busy: Busy;
  jobMs: number;
  target: number | null;
  /** Ms since the cook was hit, null when not recently. */
  hitAgo: number | null;
  stains: Stain[];
}

export interface MirrorStation {
  id: number;
  item: Item | null;
  pot: Food[];
  level: number;
  fire: boolean;
  douseMs: number;
  dirty: number;
  plates: number;
}

export interface MirrorFloor {
  id: number;
  item: Item;
  x: number;
  y: number;
}

export interface MirrorFlight {
  id: number;
  item: Item;
  from: number;
  toChef: number | null;
  toStation: number | null;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  /** Start relative to the packet's stamp (ms). */
  t0: number;
  dur: number;
  color: string;
}

export interface MirrorTicket {
  id: number;
  dish: DishId;
  got: Part[];
  /** Deadline relative to the packet's stamp (ms). */
  end: number;
  wait: number;
}

export type MirrorOverlay =
  | { kind: 'none' }
  | { kind: 'count'; value: number }
  | { kind: 'go' }
  | { kind: 'warning' }
  | { kind: 'move' }
  | { kind: 'timeUp' }
  | { kind: 'guideGo' }
  | { kind: 'guideDone' };

export interface MirrorGuide {
  info: GuideInfo;
  target: { kind: 'station' | 'chef'; id: number } | null;
}

export interface MirrorRound {
  kitchen: KitchenId;
  difficulty: Difficulty;
  practice: boolean;
  phase: Phase;
  moved: boolean;
  /** Start of the cooking relative to the stamp (ms). */
  go: number;
  left: number;
  score: number;
  stars: 0 | 1 | 2 | 3;
  thresholds: [number, number, number];
  chefs: MirrorChef[];
  stations: MirrorStation[];
  floor: MirrorFloor[];
  flights: MirrorFlight[];
  tickets: MirrorTicket[];
  overlay: MirrorOverlay;
  hint: boolean;
  showResult: boolean;
  result: ResultInfo | null;
  guide: MirrorGuide | null;
}

export type MirrorEvent =
  | {
      n: number;
      type: 'float';
      text: string;
      sub: string;
      x: number;
      y: number;
      color: string;
      size: number;
      world: boolean;
    }
  | { n: number; type: 'pop'; x: number; y: number; color: string }
  | { n: number; type: 'throw'; id: number }
  | { n: number; type: 'moveWarn' }
  | { n: number; type: 'flash' }
  | { n: number; type: 'celebrate' };

/** A validated, decoded packet. */
export interface MirrorState {
  epoch: number;
  t: number;
  hold: boolean;
  setup: SetupInfo | null;
  round: MirrorRound | null;
  events: MirrorEvent[];
  eventTop: number;
}

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isBit = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR_RE.test(v);
const isRel = (v: unknown): v is number => isInt(v) && Math.abs(v) <= TIME_MAX;
const isSide = (v: unknown): v is Side => v === 0 || v === 1;
const isStars = (v: unknown): v is 0 | 1 | 2 | 3 => v === 0 || v === 1 || v === 2 || v === 3;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
/** A position in 1/100 tile, a little past the kitchen's edge at most. */
const isX = (v: unknown): v is number => isInt(v) && v >= -Q && v <= (COLS + 1) * Q;
const isY = (v: unknown): v is number => isInt(v) && v >= -Q && v <= (ROWS + 1) * Q;
const isStation = (v: unknown): v is number => isInt(v) && v >= -1 && v < STATIONS_MAX;

function parseList<T>(v: unknown, max: number, item: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: T[] = [];
  for (const x of v) {
    const parsed = item(x);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parseChip(v: unknown): CookChip | null {
  if (!Array.isArray(v) || v.length !== 5) return null;
  const [id, name, fruit, rawLook, color] = v as unknown[];
  if (!isInt(id) || !isText(name, NAME_MAX) || !oneOf(FRUITS, fruit) || !isColor(color)) return null;
  const look = parseLook(rawLook);
  return look ? { id, name, fruit, look, color } : null;
}

function parseSetup(v: unknown): SetupInfo | null {
  if (!Array.isArray(v) || v.length !== 8) return null;
  const [step, kitchen, difficulty, humans, rawBest, rawSides, rawChips, host] = v as unknown[];
  if (!oneOf(SETUP_STEPS, step) || !oneOf(KITCHENS, kitchen) || !oneOf(DIFFICULTIES, difficulty)) return null;
  if (!isNat(humans) || humans > 64 || !isText(host, NAME_MAX)) return null;
  const best = parseList(rawBest, KITCHENS.length, (x) => (isInt(x) && x >= 0 && x <= 3 ? x : null));
  const chips = parseList(rawChips, COOKS_MAX * 2, parseChip);
  if (!best || best.length !== KITCHENS.length || !chips) return null;
  const byId = new Map(chips.map((c) => [c.id, c]));
  const pick = (ids: unknown): CookChip[] | null =>
    parseList(ids, COOKS_MAX * 2, (x) => (isInt(x) ? (byId.get(x) ?? null) : null));
  let sides: [CookChip[], CookChip[]] | null = null;
  if (rawSides !== null) {
    if (!Array.isArray(rawSides) || rawSides.length !== 2) return null;
    const a = pick(rawSides[0]);
    const b = pick(rawSides[1]);
    if (!a || !b) return null;
    sides = [a, b];
  }
  const bestMap = {} as Record<KitchenId, number>;
  KITCHENS.forEach((k, i) => {
    bestMap[k] = best[i]!;
  });
  return { step, kitchen, difficulty, humans, best: bestMap, sides, everyone: chips, hostName: host };
}

function parseChef(v: unknown): MirrorChef | null {
  if (!Array.isArray(v) || v.length !== 16) return null;
  const [id, name, fruit, rawLook, color, side, x, y, face, flags, held, busy, job, target, hit, stains] =
    v as unknown[];
  if (!isInt(id) || !isText(name, NAME_MAX) || !oneOf(FRUITS, fruit) || !isColor(color) || !isSide(side))
    return null;
  if (!isX(x) || !isY(y) || !isInt(face) || Math.abs(face) > 10 || !isNat(flags) || flags > 7) return null;
  if (!isNat(busy) || busy >= BUSY.length || !isNat(job) || job > 60_000 || !isStation(target)) return null;
  if (!isInt(hit) || hit < -1 || hit >= HIT_KEEP_MS) return null;
  const look = parseLook(rawLook);
  const item = held === '' ? null : decodeItem(held);
  const stainList = decodeStains(stains);
  if (!look || (held !== '' && !item) || !stainList) return null;
  return {
    id,
    name,
    fruit,
    look,
    color,
    side,
    x: x / Q,
    y: y / Q,
    faceX: face / 10,
    moving: (flags & F_MOVING) !== 0,
    staggered: (flags & F_STAGGER) !== 0,
    steer: (flags & F_STEER) !== 0,
    held: item,
    busy: BUSY[busy]!,
    jobMs: job,
    target: target < 0 ? null : target,
    hitAgo: hit < 0 ? null : hit,
    stains: stainList,
  };
}

function parseStation(v: unknown): MirrorStation | null {
  if (!Array.isArray(v) || v.length !== 8) return null;
  const [id, rawItem, rawPot, level, fire, douse, dirty, plates] = v as unknown[];
  if (!isNat(id) || id >= STATIONS_MAX || !isText(rawPot, POT_MAX) || !isNat(level) || level > 2000)
    return null;
  if (!isBit(fire) || !isNat(douse) || douse > 60_000 || !isNat(dirty) || dirty > 99) return null;
  if (!isNat(plates) || plates > 99) return null;
  const item = rawItem === '' ? null : decodeItem(rawItem);
  if (rawItem !== '' && !item) return null;
  const pot: Food[] = [];
  for (const ch of rawPot) {
    const f = charFood(ch);
    if (!f) return null;
    pot.push(f);
  }
  return { id, item, pot, level: level / 1000, fire: fire === 1, douseMs: douse, dirty, plates };
}

function parseFloor(v: unknown): MirrorFloor | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [id, rawItem, x, y] = v as unknown[];
  const item = decodeItem(rawItem);
  if (!isInt(id) || !item || !isX(x) || !isY(y)) return null;
  return { id, item, x: x / Q, y: y / Q };
}

function parseFlight(v: unknown): MirrorFlight | null {
  if (!Array.isArray(v) || v.length !== 12) return null;
  const [id, rawItem, from, toChef, toStation, sx, sy, ex, ey, t0, dur, color] = v as unknown[];
  const item = decodeItem(rawItem);
  if (!isInt(id) || !item || !isInt(from) || !isInt(toChef) || !isStation(toStation)) return null;
  if (!isX(sx) || !isY(sy) || !isX(ex) || !isY(ey) || !isRel(t0) || !isNat(dur) || dur < 1 || dur > 10_000)
    return null;
  if (!isColor(color)) return null;
  return {
    id,
    item,
    from,
    toChef: toChef < 0 ? null : toChef,
    toStation: toStation < 0 ? null : toStation,
    sx: sx / Q,
    sy: sy / Q,
    ex: ex / Q,
    ey: ey / Q,
    t0,
    dur,
    color,
  };
}

function parseTicket(v: unknown): MirrorTicket | null {
  if (!Array.isArray(v) || v.length !== 5) return null;
  const [id, dish, rawGot, end, wait] = v as unknown[];
  if (!isInt(id) || !oneOf(DISHES, dish) || !isRel(end) || !isNat(wait) || wait > TIME_MAX) return null;
  const got = parseList(rawGot, PARTS.length, (x) => (oneOf(PARTS, x) ? x : null));
  return got ? { id, dish, got, end, wait } : null;
}

function parseOverlay(v: unknown): MirrorOverlay | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 2) return null;
  const [kind, a] = v as unknown[];
  switch (kind) {
    case 'n':
      return { kind: 'none' };
    case 'c':
      return isNat(a) && a <= 9 ? { kind: 'count', value: a } : null;
    case 'g':
      return { kind: 'go' };
    case 'w':
      return { kind: 'warning' };
    case 'm':
      return { kind: 'move' };
    case 'u':
      return { kind: 'timeUp' };
    case 'gg':
      return { kind: 'guideGo' };
    case 'gd':
      return { kind: 'guideDone' };
    default:
      return null;
  }
}

function parseGuide(v: unknown): MirrorGuide | null {
  if (!Array.isArray(v) || v.length !== 9) return null;
  const [step, index, total, waiting, helper, button, ticket, kind, id] = v as unknown[];
  if (!oneOf(GUIDE_STEPS, step) || !isNat(index) || !isNat(total) || index >= total || total > 20)
    return null;
  if (!isBit(waiting) || !isText(helper, NAME_MAX) || !isBit(ticket) || !isInt(id)) return null;
  if (button !== '' && !oneOf(GUIDE_BUTTONS, button)) return null;
  if (kind !== '' && kind !== 's' && kind !== 'c') return null;
  return {
    info: {
      step,
      index,
      total,
      waiting: waiting === 1,
      helper: helper === '' ? null : helper,
      button: button === '' ? null : button,
      ticket: ticket === 1,
    },
    target: kind === 's' ? { kind: 'station', id } : kind === 'c' ? { kind: 'chef', id } : null,
  };
}

function parseResult(v: unknown, kitchen: KitchenId, th: [number, number, number]): ResultInfo | null {
  if (!Array.isArray(v) || v.length !== 7) return null;
  const [stars, score, delivered, missed, tips, best, rawAwards] = v as unknown[];
  if (!isStars(stars) || !isNat(score) || !isNat(delivered) || !isNat(missed) || !isNat(tips) || !isBit(best))
    return null;
  const awards = parseList(rawAwards, AWARDS_MAX, (x): AwardInfo | null => {
    if (!Array.isArray(x) || x.length !== 4) return null;
    const [playerId, title, desc, icon] = x as unknown[];
    if (!isInt(playerId) || !isText(title, TEXT_MAX) || !isText(desc, TEXT_MAX) || !oneOf(ICONS, icon))
      return null;
    return { playerId, title, desc, icon };
  });
  if (!awards) return null;
  return { kitchen, thresholds: th, stars, score, delivered, missed, tips, awards, newBest: best === 1 };
}

function parseRound(v: unknown): MirrorRound | null {
  if (!isObj(v)) return null;
  const r = v;
  if (!oneOf(KITCHENS, r.k) || !oneOf(DIFFICULTIES, r.d) || !oneOf(PHASES, r.ph)) return null;
  if (!isBool(r.pr) || !isBool(r.mv) || !isBool(r.hint) || !isBool(r.rs)) return null;
  if (!isRel(r.go) || !isNat(r.left) || r.left > TIME_MAX || !isNat(r.sc) || !isStars(r.sr)) return null;
  const th = parseList(r.th, 3, (x) => (isNat(x) ? x : null));
  if (th?.length !== 3) return null;
  const thresholds: [number, number, number] = [th[0]!, th[1]!, th[2]!];
  const chefs = parseList(r.ck, COOKS_MAX, parseChef);
  const stations = parseList(r.sn, STATIONS_MAX, parseStation);
  const floor = parseList(r.fl, FLOOR_MAX, parseFloor);
  const flights = parseList(r.fx, FLIGHTS_MAX, parseFlight);
  const tickets = parseList(r.tk, TICKETS_MAX, parseTicket);
  const overlay = parseOverlay(r.ov);
  if (!chefs || !stations || !floor || !flights || !tickets || !overlay) return null;
  const guide = r.gd === null ? null : parseGuide(r.gd);
  const result = r.res === null ? null : parseResult(r.res, r.k, thresholds);
  if ((r.gd !== null && !guide) || (r.res !== null && !result)) return null;
  return {
    kitchen: r.k,
    difficulty: r.d,
    practice: r.pr,
    phase: r.ph,
    moved: r.mv,
    go: r.go,
    left: r.left,
    score: r.sc,
    stars: r.sr,
    thresholds,
    chefs,
    stations,
    floor,
    flights,
    tickets,
    overlay,
    hint: r.hint,
    showResult: r.rs,
    result,
    guide,
  };
}

function parseEvent(v: unknown): MirrorEvent | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const row = v as unknown[];
  const n = row[0];
  if (!isNat(n)) return null;
  switch (row[1]) {
    case 'f': {
      const [, , text, sub, x, y, color, size, world] = row;
      if (row.length !== 9 || !isText(text, TEXT_MAX) || !isText(sub, TEXT_MAX) || !isColor(color))
        return null;
      if (!isInt(x) || !isInt(y) || Math.abs(x) > 5000 || Math.abs(y) > 5000) return null;
      if (!isNat(size) || size < 8 || size > 96 || !isBit(world)) return null;
      const w = world === 1;
      return { n, type: 'float', text, sub, x: w ? x : x / Q, y: w ? y : y / Q, color, size, world: w };
    }
    case 'p': {
      const [, , x, y, color] = row;
      if (row.length !== 5 || !isX(x) || !isY(y) || !isColor(color)) return null;
      return { n, type: 'pop', x: x / Q, y: y / Q, color };
    }
    case 't':
      return row.length === 3 && isInt(row[2]) ? { n, type: 'throw', id: row[2] } : null;
    case 'm':
      return row.length === 2 ? { n, type: 'moveWarn' } : null;
    case 'x':
      return row.length === 2 ? { n, type: 'flash' } : null;
    case 'y':
      return row.length === 2 ? { n, type: 'celebrate' } : null;
    default:
      return null;
  }
}

/** Validates and decodes a published state from the network; null if anything is off. */
export function applyMirror(raw: unknown): MirrorState | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const j = raw;
  if (!isNat(j.e) || !isNum(j.t) || !isBool(j.hold) || !isNat(j.en)) return null;
  const setup = j.su === null || j.su === undefined ? null : parseSetup(j.su);
  const round = j.r === null || j.r === undefined ? null : parseRound(j.r);
  if (j.su != null && !setup) return null;
  if (j.r != null && !round) return null;
  if (!setup && !round) return null;
  const events = parseList(j.ev, EVENTS_KEPT, parseEvent);
  if (!events) return null;
  const top = j.en;
  for (let k = 0; k < events.length; k++) {
    const e = events[k]!;
    if (e.n > top || (k > 0 && e.n <= events[k - 1]!.n)) return null;
  }
  return { epoch: j.e, t: j.t, hold: j.hold, setup: round ? null : setup, round, events, eventTop: top };
}

/* ------------------------------------------------------------------ playback */

const BUFFER = 8;

/** Packets that differ in these are separate stretches: the stage snaps instead of blending. */
const stretchKey = (s: MirrorState): string => {
  const r = s.round;
  return r ? `${s.epoch}|r|${r.phase}|${r.practice ? 1 : 0}|${s.hold ? 1 : 0}` : `${s.epoch}|s`;
};

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Two packets around the playback point, and how far between them it is. */
export interface Span {
  /** The packet at or before the playback point: discrete state (items, flags, HUD). */
  a: MirrorState;
  b: MirrorState;
  k: number;
}

/**
 * The last few packets, played back a little behind server time by a `PlayoutClock`: the shortest
 * recent trip plus a buffer that follows the packet gap and jitter, eased so a route change never
 * makes the cooks jump.
 */
export class MirrorTimeline {
  private readonly buf: MirrorState[] = [];
  private readonly clock = new PlayoutClock();

  get latest(): MirrorState | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  /** Shortest recent Host-to-here trip in ms (null before the first packet). */
  get lag(): number | null {
    return this.clock.lagMs;
  }

  /**
   * Adds a packet that arrived at server time `now`. True when it starts a new stretch (first
   * packet, new phase, pause, Host restarted): draw it right away.
   */
  push(s: MirrorState, now: number): boolean {
    this.clock.observe(s.t, now);
    const last = this.latest;
    const snap = !last || s.t <= last.t || stretchKey(s) !== stretchKey(last);
    if (snap) this.buf.length = 0;
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    return snap;
  }

  /** Server time of the Host state shown now. */
  playhead(now: number): number {
    return this.clock.drawAt(now);
  }

  sample(now: number): Span | null {
    const buf = this.buf;
    const first = buf[0];
    const last = buf[buf.length - 1];
    if (!first || !last) return null;
    const at = this.playhead(now);
    if (at <= first.t) return { a: first, b: first, k: 0 };
    if (at >= last.t) return { a: last, b: last, k: 0 };
    for (let i = 0; i < buf.length - 1; i++) {
      const b = buf[i + 1]!;
      if (at > b.t) continue;
      const a = buf[i]!;
      return { a, b, k: (at - a.t) / (b.t - a.t) };
    }
    return { a: last, b: last, k: 0 };
  }
}

/** Where a cook is drawn and how far its sink job is, between packets `a` and `b`. */
export interface ChefPose {
  x: number;
  y: number;
  jobMs: number;
}

export function chefAt(a: MirrorChef, b: MirrorChef | undefined, k: number, out: ChefPose): ChefPose {
  if (!b || Math.hypot(b.x - a.x, b.y - a.y) > JUMP_TILES) {
    out.x = a.x;
    out.y = a.y;
    out.jobMs = a.jobMs;
    return out;
  }
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k);
  out.jobMs = b.busy === a.busy && b.jobMs >= a.jobMs ? lerp(a.jobMs, b.jobMs, k) : a.jobMs;
  return out;
}

/**
 * An item between packets: chop progress and glass fill grow smoothly when the same food or glass
 * is in both; anything else shows as in `a`. Returns `a` itself unless it blends.
 */
export function itemAt(a: Item | null, b: Item | null | undefined, k: number): Item | null {
  if (!a || !b || k <= 0) return a;
  if (a.k === 'food' && b.k === 'food' && a.food === b.food && a.chop !== undefined && b.chop !== undefined) {
    return b.chop > a.chop ? { k: 'food', food: a.food, chop: lerp(a.chop, b.chop, k) } : a;
  }
  if (a.k === 'glass' && b.k === 'glass' && b.fill > a.fill) {
    const fill = lerp(a.fill, b.fill, k);
    return a.over === undefined ? { k: 'glass', fill } : { k: 'glass', fill, over: a.over };
  }
  return a;
}

/** Heat and douse progress between packets (they only grow at a fixed rate; resets snap). */
export function stationAt(
  a: MirrorStation,
  b: MirrorStation | undefined,
  k: number,
): { level: number; douseMs: number } {
  if (!b) return { level: a.level, douseMs: a.douseMs };
  const level = b.level >= a.level && b.level - a.level < 0.5 ? lerp(a.level, b.level, k) : a.level;
  const douseMs = b.douseMs >= a.douseMs ? lerp(a.douseMs, b.douseMs, k) : a.douseMs;
  return { level, douseMs };
}

/**
 * A throw as the scene draws it, with its start on the server clock (`stamp` is its packet's) and
 * the landing point following a moving catcher between packets.
 */
export function flightAt(
  f: MirrorFlight,
  b: MirrorFlight | undefined,
  k: number,
  stamp: number,
): StageFlight {
  return {
    item: f.item,
    from: f.from,
    toChef: f.toChef,
    toStation: f.toStation,
    sx: f.sx,
    sy: f.sy,
    ex: b ? lerp(f.ex, b.ex, k) : f.ex,
    ey: b ? lerp(f.ey, b.ey, k) : f.ey,
    t0: stamp + f.t0,
    dur: f.dur,
    color: f.color,
  };
}

/* ------------------------------------------------------------------ far-away stage */

/** A cook as a far-away screen draws it. */
export interface ChefView extends StageChef {
  side: Side;
  stagger: boolean;
}

/** Per-packet lookups by id, built once per packet. */
interface RoundIndex {
  chefs: Map<number, MirrorChef>;
  stations: Map<number, MirrorStation>;
  flights: Map<number, MirrorFlight>;
}

const indexes = new WeakMap<MirrorRound, RoundIndex>();

function indexOf(r: MirrorRound): RoundIndex {
  let ix = indexes.get(r);
  if (!ix) {
    ix = {
      chefs: new Map(r.chefs.map((c) => [c.id, c])),
      stations: new Map(r.stations.map((s) => [s.id, s])),
      flights: new Map(r.flights.map((f) => [f.id, f])),
    };
    indexes.set(r, ix);
  }
  return ix;
}

/**
 * The scene's model on a far-away screen: the kitchen's own layout (built like the Host's) with
 * the published state blended between two packets. Times are server ms.
 */
export class MirrorStage implements StageModel {
  readonly def: KitchenDef;
  readonly difficulty: Difficulty;
  readonly tuning: { readonly burnMs: number | null };
  phase: Phase = 'countdown';
  moved = false;
  practice = false;
  /** Server time the cooking started (carts sway from it). */
  goAt = 0;
  readonly stations: StageStation[];
  floor: readonly MirrorFloor[] = [];
  readonly chefs: ChefView[] = [];
  flights: StageFlight[] = [];
  private readonly byId = new Map<number, ChefView>();
  private readonly home: { x: number; y: number }[];
  private readonly levels: Float64Array;
  private readonly pose: ChefPose = { x: 0, y: 0, jobMs: 0 };

  constructor(kitchen: KitchenId, difficulty: Difficulty) {
    const layout = new DapurMatch({ kitchen, difficulty, cooks: [], now: 0 });
    this.def = layout.def;
    this.difficulty = difficulty;
    this.tuning = layout.tuning;
    this.stations = layout.stations.map((s) => ({
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      w: s.w,
      source: s.source,
      item: null,
      pot: [],
      fire: false,
      douseMs: 0,
      dirty: 0,
      plates: 0,
    }));
    this.home = layout.stations.map((s) => ({ x: s.x, y: s.y }));
    this.levels = new Float64Array(this.stations.length);
  }

  chef(id: number): ChefView | undefined {
    return this.byId.get(id);
  }

  gap(t: number): number {
    return this.practice ? 0 : cartGap(this.def, this.difficulty, t - this.goAt);
  }

  heatLevel(s: StageStation): number {
    return this.levels[s.id] ?? 0;
  }

  staggered(c: StageChef): boolean {
    return this.byId.get(c.id)?.stagger ?? false;
  }

  /** Jam Sibuk: stations at their start spots, or traded as the Host's `moveStations` does. */
  private setMoved(moved: boolean): void {
    if (moved === this.moved) return;
    this.moved = moved;
    this.stations.forEach((s, i) => {
      s.x = this.home[i]!.x;
      s.y = this.home[i]!.y;
    });
    const swaps = this.def.move?.swaps;
    if (!moved || !swaps) return;
    const at = (x: number, y: number) => this.stations.find((s) => s.x <= x && x < s.x + s.w && s.y === y);
    for (const [a, b] of swaps) {
      const sa = at(a[0], a[1]);
      const sb = at(b[0], b[1]);
      if (!sa || !sb || sa.w !== 1 || sb.w !== 1) continue;
      const ax = sa.x;
      const ay = sa.y;
      sa.x = sb.x;
      sa.y = sb.y;
      sb.x = ax;
      sb.y = ay;
    }
  }

  /** The kitchen as the Host showed it at the playback point (`span` of round packets). */
  apply(span: Span): void {
    const { a, b, k } = span;
    const r = a.round;
    if (!r) return;
    const rb = b.round && b.epoch === a.epoch ? indexOf(b.round) : null;
    this.phase = r.phase;
    this.practice = r.practice;
    this.goAt = a.t + r.go;
    this.setMoved(r.moved);
    this.applyChefs(a, rb, k);
    for (const s of this.stations) {
      s.item = null;
      s.pot = [];
      s.fire = false;
      s.douseMs = 0;
      s.dirty = 0;
      s.plates = 0;
    }
    this.levels.fill(0);
    for (const row of r.stations) {
      const s = this.stations[row.id];
      if (!s) continue;
      const other = rb?.stations.get(row.id);
      const p = stationAt(row, other, k);
      s.item = itemAt(row.item, other?.item, k);
      s.pot = row.pot;
      s.fire = row.fire;
      s.douseMs = p.douseMs;
      s.dirty = row.dirty;
      s.plates = row.plates;
      this.levels[row.id] = p.level;
    }
    this.floor = r.floor;
    this.flights = r.flights.map((f) => flightAt(f, rb?.flights.get(f.id), k, a.t));
  }

  private applyChefs(a: MirrorState, rb: RoundIndex | null, k: number): void {
    const r = a.round!;
    const seen = new Set<number>();
    for (const src of r.chefs) {
      seen.add(src.id);
      const other = rb?.chefs.get(src.id);
      const p = chefAt(src, other, k, this.pose);
      let view = this.byId.get(src.id);
      if (!view) {
        view = {
          id: src.id,
          name: src.name,
          color: src.color,
          look: src.look,
          cpu: !src.steer,
          pilot: null,
          side: src.side,
          x: p.x,
          y: p.y,
          prevX: p.x,
          prevY: p.y,
          faceX: src.faceX,
          moving: src.moving,
          walked: 0,
          busy: src.busy,
          held: src.held,
          stains: src.stains,
          target: src.target,
          jobMs: p.jobMs,
          hitAt: Number.NEGATIVE_INFINITY,
          stagger: src.staggered,
        };
        this.byId.set(src.id, view);
        this.chefs.push(view);
      }
      // The walk cycle follows the distance drawn here (a teleport does not count).
      const step = Math.hypot(p.x - view.x, p.y - view.y);
      if (src.moving && step < JUMP_TILES) view.walked += step;
      view.name = src.name;
      view.color = src.color;
      view.look = src.look;
      view.cpu = !src.steer;
      view.side = src.side;
      view.x = view.prevX = p.x;
      view.y = view.prevY = p.y;
      view.faceX = src.faceX;
      view.moving = src.moving;
      view.busy = src.busy;
      view.held = itemAt(src.held, other?.held, k);
      view.stains = src.stains;
      view.target = src.target;
      view.jobMs = p.jobMs;
      view.hitAt = src.hitAgo === null ? Number.NEGATIVE_INFINITY : a.t - src.hitAgo;
      view.stagger = src.staggered;
    }
    for (let i = this.chefs.length - 1; i >= 0; i--) {
      const view = this.chefs[i]!;
      if (seen.has(view.id)) continue;
      this.chefs.splice(i, 1);
      this.byId.delete(view.id);
    }
  }
}

/* ------------------------------------------------------------------ HUD */

/** The Host's clocks at server time `now` (what the Host judges right then). */
export interface Clocks {
  left: number;
  /** The countdown overlay as the Host shows it then; null: the packet's own overlay. */
  overlay: Overlay | null;
}

/**
 * The countdown and round clock at server time `now`, read from packet `s` (the newest one, not
 * the delayed stage), so the far-away screen shows GO and the clock when the Host does. They
 * stand still while the Host is paused.
 */
export function mirrorClocks(s: MirrorState, now: number): Clocks {
  const r = s.round;
  if (!r) return { left: 0, overlay: null };
  const run = s.hold ? 0 : sinceStamp(s.t, now);
  if (r.phase === 'play' && !r.practice) return { left: Math.max(0, r.left - run), overlay: null };
  if (r.phase === 'countdown' && !s.hold) {
    const rest = r.go - run;
    if (rest > 0)
      return { left: r.left, overlay: { kind: 'count', value: Math.max(1, Math.ceil(rest / 1000)) } };
    return { left: r.left, overlay: { kind: r.practice ? 'guideGo' : 'go' } };
  }
  return { left: r.left, overlay: null };
}

/** Chips of a round's cooks by id (award faces). */
export function roundChips(r: MirrorRound): Map<number, CookChip> {
  return new Map(
    r.chefs.map((c) => [c.id, { id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color }]),
  );
}

/**
 * The HUD the Host shows, rebuilt from packet `a` (the one at the playback point `at`), with the
 * countdown and round clock from `clocks`. `arrow` places the practice arrow on this screen's stage.
 */
export function mirrorHud(
  a: MirrorState,
  at: number,
  clocks: Clocks,
  arrow: (target: MirrorGuide['target']) => { x: number; y: number; up: boolean } | null,
): HudState {
  const r = a.round;
  if (!r) {
    return {
      mode: 'setup',
      setup: a.setup ? setupPanel(a.setup) : null,
      play: null,
      overlay: { kind: 'none' },
      result: null,
      hint: false,
      guide: null,
    };
  }
  const run = a.hold ? 0 : sinceStamp(a.t, at);
  const play = playPanel({
    kitchen: r.kitchen,
    difficulty: r.difficulty,
    phase: r.phase,
    practice: r.practice,
    left: clocks.left,
    score: r.score,
    stars: r.stars,
    thresholds: r.thresholds,
    tickets: r.tickets.map((k) => ({
      id: k.id,
      dish: k.dish,
      got: k.got,
      left: k.wait > 0 ? (k.end - run) / k.wait : 0,
    })),
    cooks: r.chefs,
  });
  const show = r.showResult && r.result !== null;
  return {
    mode: show ? 'result' : 'play',
    setup: null,
    play,
    overlay: clocks.overlay ?? r.overlay,
    result: show && r.result ? resultPanel(r.result, roundChips(r)) : null,
    hint: r.hint,
    guide: r.guide ? guidePanel(r.guide.info, r.guide.info.ticket ? null : arrow(r.guide.target)) : null,
  };
}

/** Effect events in a packet that came after `seen`, oldest first. */
export function newEvents(s: MirrorState, seen: number): MirrorEvent[] {
  return s.events.filter((e) => e.n > seen);
}
