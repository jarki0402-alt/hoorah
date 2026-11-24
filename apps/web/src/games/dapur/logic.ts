/**
 * Dapur Heboh match logic: one team of cooks in a tile kitchen, a fixed 60 Hz simulation that
 * runs on the main screen. Movement with tile collision, stations (baskets, boards, stoves, fryer,
 * wok, sink, racks, soda machine, trash, pass), throwing, orders and per-cook stats.
 *
 * Pure and deterministic: no DOM, no timers. The director feeds phone input and the game clock;
 * the renderer and HUD only read the state and the drained events.
 */
import type { Fruit, Look } from '@hoorah/protocol';
import { seeded } from '../../shared/art/svg';
import {
  addToPlate,
  CHOPS_TO,
  canAddToPlate,
  cloneItem,
  type Food,
  food,
  glass,
  type Item,
  isFull,
  plate,
  type StainKind,
  stainOf,
} from './items';
import {
  type Cell,
  CHOP_MS,
  CLEAN_MS,
  COLS,
  COOK_MS,
  COUNTDOWN_MS,
  cartGap,
  cellOf,
  crewFactor,
  type Difficulty,
  DOUSE_MS,
  FILL_MS,
  KITCHEN_DEFS,
  type KitchenDef,
  type KitchenId,
  MOVE_WARN_MS,
  OVER_MS,
  OVERFILL_MS,
  PLATE_RETURN_MS,
  ROWS,
  type Side,
  STAGGER_MS,
  type StationKind,
  sideOfX,
  spawnPoint,
  starThresholds,
  THROW_MS,
  TUNING,
  type Tuning,
  WARN_MS,
  WARNING_LEFT_MS,
  WASH_MS,
} from './kitchens';
import { OrderBook, type Served, type Ticket } from './orders';
import { type DishId, partOf } from './recipes';
import { pickLandingCounter, pickReceiver } from './throw';

export const STEP_MS = 1000 / 60;
/** Cook radius and walking speed, in tiles. */
export const RADIUS = 0.3;
export const SPEED = 3.6;
/** How far a cook reaches a station or a floor item. */
export const REACH = 0.62;
/**
 * A station already in use keeps the highlight until another one scores this much better, so a
 * cook standing where two counters meet does not flicker between them.
 */
export const TARGET_STICK = 0.2;
const PICK_FLOOR = 0.6;
const DEAD_ZONE = 0.18;
const MAX_STAINS = 6;
const MAX_STEPS = 30;

export type Phase = 'countdown' | 'play' | 'over' | 'done';

export interface CookInfo {
  id: number;
  name: string;
  fruit: Fruit;
  /** The player's avatar, drawn as the cook's head. */
  look: Look;
  color: string;
}

export interface CookStats {
  chops: number;
  deliveries: number;
  firesOut: number;
  burnt: number;
  /** Own throws that were caught. */
  goodThrows: number;
  /** Throws caught from others. */
  catches: number;
  /** Times hit with full hands. */
  stains: number;
  /** Own throws that broke or spilled. */
  badThrows: number;
  washed: number;
}

const emptyStats = (): CookStats => ({
  chops: 0,
  deliveries: 0,
  firesOut: 0,
  burnt: 0,
  goodThrows: 0,
  catches: 0,
  stains: 0,
  badThrows: 0,
  washed: 0,
});

export interface Stain {
  kind: StainKind;
  /** Position on the apron, -1..1. */
  u: number;
  v: number;
  /** Size 0.6..1.2. */
  s: number;
}

/** What a cook is busy with this step (animation and sounds). */
export type Busy = 'chop' | 'wash' | 'clean' | 'fill' | 'douse' | null;

/** Anything that steers a cook instead of a phone: the computer helper or a takeover brain. */
export interface Pilot {
  think(match: DapurMatch, me: Chef, t: number): void;
}

export interface Chef extends CookInfo {
  cpu: boolean;
  side: Side;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  faceX: number;
  faceY: number;
  stickX: number;
  stickY: number;
  work: boolean;
  held: Item | null;
  staggerUntil: number;
  stains: Stain[];
  stats: CookStats;
  /** Station in reach and facing (index into `stations`), recomputed every step. */
  target: number | null;
  busy: Busy;
  /** Progress of the sink job (wash a plate / clean the apron), ms. */
  jobMs: number;
  moving: boolean;
  /** Distance walked, drives the walk cycle. */
  walked: number;
  /** Game time of the last hit (bubble on screen, alert on the phone). */
  hitAt: number;
  pilot: Pilot | null;
}

export interface Station {
  id: number;
  kind: StationKind;
  /** Left tile and row; `w` tiles wide (the pass is 2). */
  x: number;
  y: number;
  w: number;
  source: Food | null;
  item: Item | null;
  /** Wok: raw ingredients waiting for their partner. */
  pot: Food[];
  /** Time on the heat (cookers), counting past done toward burnt. */
  cookMs: number;
  warned: boolean;
  fire: boolean;
  douseMs: number;
  /** Who put the food on (blamed when it burns). */
  lastBy: number | null;
  /** Sink: dirty plates waiting. */
  dirty: number;
  /** Plate rack: clean plates. */
  plates: number;
}

export interface FloorItem {
  id: number;
  item: Item;
  x: number;
  y: number;
}

export interface Flight {
  id: number;
  item: Item;
  from: number;
  /** Receiving cook, or null when it flies to a counter. */
  toChef: number | null;
  toStation: number | null;
  sx: number;
  sy: number;
  /** Current landing point (follows a moving receiver). */
  ex: number;
  ey: number;
  t0: number;
  dur: number;
  /** Thrower's colour for the catch ring. */
  color: string;
}

export type FailReason = 'nothing' | 'full' | 'busy' | 'noTarget' | 'wrong' | 'noOrder' | 'fire' | 'empty';

export type MatchEvent =
  | { type: 'count'; value: number }
  | { type: 'go' }
  | { type: 'order'; ticket: Ticket }
  | { type: 'served'; served: Served; by: number; x: number; y: number }
  | { type: 'missed'; ticket: Ticket; penalty: number }
  | { type: 'pickup'; id: number }
  | { type: 'putdown'; id: number }
  | { type: 'fail'; id: number; reason: FailReason }
  | { type: 'chopped'; id: number; station: number }
  | { type: 'cookStart'; station: number }
  | { type: 'cooked'; station: number }
  | { type: 'burnWarn'; station: number }
  | { type: 'burnt'; station: number; by: number | null }
  | { type: 'fire'; station: number }
  | { type: 'fireOut'; station: number; by: number }
  | { type: 'filled'; id: number }
  | { type: 'spill'; id: number }
  | { type: 'washed'; id: number }
  | { type: 'cleaned'; id: number }
  | { type: 'plateBack' }
  | { type: 'throw'; flight: Flight }
  | { type: 'catch'; flight: Flight; by: number }
  | { type: 'hit'; flight: Flight; to: number; broke: boolean }
  | { type: 'land'; flight: Flight; x: number; y: number }
  | { type: 'moveWarn' }
  | { type: 'move' }
  | { type: 'warning' }
  | { type: 'second'; left: number }
  | { type: 'timeUp' }
  | { type: 'done' };

export interface MatchOptions {
  kitchen: KitchenId;
  difficulty: Difficulty;
  /** Cooks in join order with their side. */
  cooks: readonly (CookInfo & { side: Side; cpu?: boolean })[];
  now: number;
  seed?: number;
  /**
   * Start with the guided practice (first game on this main screen): after the countdown the
   * kitchen runs without a round clock, with one ticket that never leaves, nothing burns and the
   * score does not count. `endPractice` then resets the kitchen and starts the real countdown.
   */
  practice?: boolean;
}

/** The one dish the practice teaches: basket, board, fryer, plate, pass. Every kitchen has them. */
export const PRACTICE_DISH: DishId = 'kentang';

const isCooker = (k: StationKind): k is 'stove' | 'fryer' | 'wok' =>
  k === 'stove' || k === 'fryer' || k === 'wok';

/** Raw food each cooker accepts. */
const COOKS: Record<'stove' | 'fryer' | 'wok', readonly Food[]> = {
  stove: ['daging'],
  fryer: ['kentangPotong'],
  wok: ['nasi', 'telur'],
};
const COOKED: Record<'stove' | 'fryer' | 'wok', Food> = {
  stove: 'dagingMatang',
  fryer: 'kentangGoreng',
  wok: 'nasiGoreng',
};

export class DapurMatch {
  readonly def: KitchenDef;
  readonly difficulty: Difficulty;
  readonly tuning: Tuning;
  readonly chefs: Chef[] = [];
  readonly stations: Station[] = [];
  readonly floor: FloorItem[] = [];
  readonly flights: Flight[] = [];
  private book: OrderBook;
  /** Station index per tile, -1 floor, -2 wall. */
  readonly cells = new Int16Array(COLS * ROWS);
  phase: Phase = 'countdown';
  countValue = 3;
  private startMs: number;
  private goMs: number;
  private endMs: number;
  private moveMs: number | null;
  private practicing: boolean;
  moved = false;
  /** Stars thresholds for this crew (fixed at the start). */
  readonly thresholds: [number, number, number];
  private readonly rnd: () => number;
  private readonly events: MatchEvent[] = [];
  private readonly returns: number[] = [];
  private nextId = 1;
  private acc = 0;
  private lastT: number;
  private simT: number;
  private lastSecond = -1;
  private warned = false;
  private moveWarned = false;

  constructor(o: MatchOptions) {
    this.def = KITCHEN_DEFS[o.kitchen];
    this.difficulty = o.difficulty;
    this.tuning = TUNING[o.difficulty];
    this.rnd = seeded(o.seed ?? 0x5eed);
    this.practicing = o.practice ?? false;
    this.startMs = o.now;
    this.goMs = o.now + COUNTDOWN_MS;
    this.endMs = this.goMs + this.tuning.roundMs;
    this.moveMs = this.def.move ? this.goMs + this.tuning.roundMs * this.def.move.atFrac : null;
    this.lastT = o.now;
    this.simT = o.now;
    for (const s of this.freshStations()) this.stations.push(s);
    const crew = Math.max(1, o.cooks.length);
    this.thresholds = starThresholds(this.def, o.difficulty, crew);
    this.book = this.makeOrders(crew);
    for (const c of o.cooks) this.addChef(c, c.side, c.cpu ?? false);
  }

  /** The order book: the real menu, or only the practice dish (whose ticket never leaves). */
  private makeOrders(crew: number): OrderBook {
    return new OrderBook({
      menu: this.practicing ? [PRACTICE_DISH] : this.def.menu,
      first: this.practicing ? PRACTICE_DISH : this.def.first,
      gapMs: (this.def.orderGapMs * this.tuning.gapMul) / crewFactor(crew),
      waitMul: this.tuning.waitMul,
      missPenalty: this.tuning.missPenalty,
      roundMs: this.tuning.roundMs,
      rnd: this.rnd,
    });
  }

  get orders(): OrderBook {
    return this.book;
  }

  get startAt(): number {
    return this.startMs;
  }

  /** Game time the cooking starts (the practice's start while practising). */
  get goAt(): number {
    return this.goMs;
  }

  get endAt(): number {
    return this.endMs;
  }

  get moveAt(): number | null {
    return this.moveMs;
  }

  /** True during the guided practice (no clock, no score, nothing burns). */
  get practice(): boolean {
    return this.practicing;
  }

  /**
   * Ends the practice at game time t: the kitchen goes back to how it started (stations, plates,
   * floor, cooks at their spots with empty hands and clean aprons, stats and score at zero) and
   * the real round begins with its usual countdown.
   */
  endPractice(t: number): void {
    if (!this.practicing) return;
    this.practicing = false;
    const fresh = this.freshStations();
    for (let i = 0; i < this.stations.length; i++) {
      const f = fresh[i];
      if (f) Object.assign(this.stations[i]!, f);
    }
    this.floor.length = 0;
    this.flights.length = 0;
    this.returns.length = 0;
    const placed: [number, number] = [0, 0];
    for (const c of this.chefs) {
      const p = spawnPoint(this.def, c.side, placed[c.side]++);
      c.x = c.prevX = p.x;
      c.y = c.prevY = p.y;
      c.faceX = c.side === 0 ? 1 : -1;
      c.faceY = 0;
      c.held = null;
      c.stains = [];
      c.stats = emptyStats();
      c.staggerUntil = 0;
      c.hitAt = Number.NEGATIVE_INFINITY;
      c.target = null;
      c.busy = null;
      c.jobMs = 0;
      c.moving = false;
    }
    this.book = this.makeOrders(Math.max(1, this.chefs.length));
    this.phase = 'countdown';
    this.countValue = 3;
    this.startMs = t;
    this.goMs = t + COUNTDOWN_MS;
    this.endMs = this.goMs + this.tuning.roundMs;
    this.moveMs = this.def.move ? this.goMs + this.tuning.roundMs * this.def.move.atFrac : null;
    this.moved = false;
    this.lastSecond = -1;
    this.warned = false;
    this.moveWarned = false;
  }

  /** Gap between the two carts (tiles) at game time t; they stand still while practising. */
  gap(t: number): number {
    return this.practicing ? 0 : cartGap(this.def, this.difficulty, t - this.goMs);
  }

  /* ------------------------------------------------------------------ setup */

  /** Every station as the kitchen starts (also fills the tile index). */
  private freshStations(): Station[] {
    const out: Station[] = [];
    this.cells.fill(-1);
    for (let r = 0; r < ROWS; r++) {
      const row = this.def.grid[r] ?? '';
      for (let c = 0; c < COLS; c++) {
        const ch = row[c] ?? '#';
        const cell: Cell = cellOf(ch);
        if (cell.kind === 'floor') continue;
        if (cell.kind === 'wall') {
          this.cells[r * COLS + c] = -2;
          continue;
        }
        // The pass spans two tiles: the second tile joins the first.
        if (cell.kind === 'pass' && c > 0 && row[c - 1] === 'L') {
          const left = this.cells[r * COLS + c - 1]!;
          this.cells[r * COLS + c] = left;
          continue;
        }
        const s: Station = {
          id: out.length,
          kind: cell.kind,
          x: c,
          y: r,
          w: cell.kind === 'pass' ? 2 : 1,
          source: cell.source ?? null,
          item: cell.extinguisher ? { k: 'extinguisher' } : null,
          pot: [],
          cookMs: 0,
          warned: false,
          fire: false,
          douseMs: 0,
          lastBy: null,
          dirty: 0,
          plates: cell.kind === 'rack' ? this.def.plates : 0,
        };
        this.cells[r * COLS + c] = s.id;
        out.push(s);
      }
    }
    return out;
  }

  addChef(info: CookInfo, side: Side, cpu = false): Chef {
    const existing = this.chef(info.id);
    if (existing) return existing;
    const n = this.chefs.filter((c) => c.side === side).length;
    const p = spawnPoint(this.def, side, n);
    const c: Chef = {
      ...info,
      cpu,
      side,
      x: p.x,
      y: p.y,
      prevX: p.x,
      prevY: p.y,
      faceX: side === 0 ? 1 : -1,
      faceY: 0,
      stickX: 0,
      stickY: 0,
      work: false,
      held: null,
      staggerUntil: 0,
      stains: [],
      stats: emptyStats(),
      target: null,
      busy: null,
      jobMs: 0,
      moving: false,
      walked: 0,
      hitAt: Number.NEGATIVE_INFINITY,
      pilot: null,
    };
    this.chefs.push(c);
    return c;
  }

  /** A cook leaves for good: what they held drops where they stood. */
  removeChef(id: number): void {
    const i = this.chefs.findIndex((c) => c.id === id);
    if (i < 0) return;
    const c = this.chefs[i]!;
    if (c.held) this.dropFloor(c.held, c.x, c.y);
    this.chefs.splice(i, 1);
  }

  /** Name/fruit/colour updates (e.g. a computer helper restyled). */
  restyle(id: number, info: Partial<CookInfo>): void {
    const c = this.chef(id);
    if (c) Object.assign(c, info);
  }

  setPilot(id: number, pilot: Pilot | null): void {
    const c = this.chef(id);
    if (!c) return;
    c.pilot = pilot;
    if (!pilot) {
      c.stickX = 0;
      c.stickY = 0;
      c.work = false;
    }
  }

  chef(id: number): Chef | undefined {
    return this.chefs.find((c) => c.id === id);
  }

  /** The smaller side, for someone joining mid-round (Persiapan on a tie). */
  smallerSide(): Side {
    const a = this.chefs.filter((c) => c.side === 0).length;
    const b = this.chefs.filter((c) => c.side === 1).length;
    return b < a ? 1 : 0;
  }

  /* ------------------------------------------------------------------ input */

  /** Joystick, each axis -1..1. */
  steer(id: number, x: number, y: number): void {
    const c = this.chef(id);
    if (!c) return;
    c.stickX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    c.stickY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  }

  /** The held Kerja button. */
  hold(id: number, on: boolean): void {
    const c = this.chef(id);
    if (c) c.work = on;
  }

  /** Input made during a pause is dropped: the cook stands still until the next frame. */
  absorb(id: number): void {
    this.steer(id, 0, 0);
    this.hold(id, false);
  }

  /** Tap "Ambil": pick up, put down, take from a basket, plate, serve. */
  grab(id: number): boolean {
    const c = this.chef(id);
    if (!c || this.phase !== 'play' || this.staggered(c)) return false;
    c.target = this.findTarget(c);
    if (!c.held) {
      const f = this.nearestFloor(c);
      if (f) {
        this.floor.splice(this.floor.indexOf(f), 1);
        c.held = f.item;
        this.emit({ type: 'pickup', id });
        return true;
      }
    }
    const s = c.target === null ? null : this.stations[c.target]!;
    if (!s) {
      if (!c.held) return this.fail(c, 'noTarget');
      // Nothing in reach: set it down on the floor in front.
      this.dropFloor(c.held, c.x + c.faceX * 0.45, c.y + c.faceY * 0.45);
      c.held = null;
      this.emit({ type: 'putdown', id });
      return true;
    }
    if (s.fire) return this.fail(c, 'fire');
    return this.useStation(c, s);
  }

  /** Tap "Lempar": the held item flies to a teammate (or a free counter across). */
  throwItem(id: number): boolean {
    const c = this.chef(id);
    if (!c || this.phase !== 'play' || this.staggered(c)) return false;
    if (!c.held) return this.fail(c, 'nothing');
    const to = pickReceiver(this.chefs, c, {
      split: this.def.split,
      safe: this.tuning.safeThrows,
      incoming: (rid) => this.flights.some((f) => f.toChef === rid),
      now: this.simT,
    });
    let ex: number;
    let ey: number;
    let toStation: number | null = null;
    if (to) {
      ex = to.x;
      ey = to.y;
    } else {
      const s = pickLandingCounter(this.stations, c, this.def.split, (sid) =>
        this.flights.some((f) => f.toStation === sid),
      );
      if (!s) return this.fail(c, 'noTarget');
      toStation = s.id;
      ex = s.x + s.w / 2;
      ey = s.y + 0.5;
    }
    const dist = Math.hypot(ex - c.x, ey - c.y);
    const gap = this.gap(this.simT);
    const dur = Math.min(1000, THROW_MS + Math.max(0, dist - 3) * 35 + gap * 120);
    const flight: Flight = {
      id: this.nextId++,
      item: c.held,
      from: c.id,
      toChef: to ? to.id : null,
      toStation,
      sx: c.x,
      sy: c.y,
      ex,
      ey,
      t0: this.simT,
      dur,
      color: c.color,
    };
    c.held = null;
    this.flights.push(flight);
    this.emit({ type: 'throw', flight });
    return true;
  }

  /* ------------------------------------------------------------------ stations */

  private useStation(c: Chef, s: Station): boolean {
    const held = c.held;
    switch (s.kind) {
      case 'basket': {
        const src = s.source;
        if (!src) return this.fail(c, 'wrong');
        if (!held) return this.give(c, food(src));
        if (held.k === 'food' && held.food === src && (held.chop ?? 0) === 0) {
          c.held = null;
          this.emit({ type: 'putdown', id: c.id });
          return true;
        }
        if (held.k === 'plate' && addToPlate(held, src)) return this.done(c, 'putdown');
        return this.fail(c, 'full');
      }
      case 'counter':
      case 'board':
        return this.useCounter(c, s);
      case 'stove':
      case 'fryer':
      case 'wok':
        return this.useCooker(c, s, s.kind);
      case 'rack': {
        if (!held) {
          if (s.plates <= 0) return this.fail(c, 'empty');
          s.plates--;
          return this.give(c, plate());
        }
        if (held.k === 'plate' && held.on.length === 0) {
          s.plates++;
          c.held = null;
          return this.done(c, 'putdown');
        }
        return this.fail(c, 'full');
      }
      case 'cups': {
        if (!held) return this.give(c, glass(0));
        if (held.k === 'glass' && held.fill === 0) {
          c.held = null;
          return this.done(c, 'putdown');
        }
        return this.fail(c, 'full');
      }
      case 'soda':
        // Filling is done by holding Kerja; a tap just explains.
        return this.fail(c, held && held.k === 'glass' ? 'busy' : 'wrong');
      case 'trash': {
        if (!held) return this.fail(c, 'nothing');
        if (held.k === 'extinguisher') return this.fail(c, 'wrong');
        if (held.k === 'plate') {
          if (held.on.length === 0) return this.fail(c, 'wrong');
          held.on = [];
          return this.done(c, 'putdown');
        }
        c.held = null;
        return this.done(c, 'putdown');
      }
      case 'pass':
        return this.serve(c);
      case 'sink':
        return this.fail(c, held ? 'wrong' : 'busy');
    }
  }

  private useCounter(c: Chef, s: Station): boolean {
    const held = c.held;
    const on = s.item;
    if (!on) {
      if (!held) return this.fail(c, 'empty');
      s.item = held;
      c.held = null;
      return this.done(c, 'putdown');
    }
    if (!held) {
      s.item = null;
      return this.give(c, on);
    }
    // Combine onto a plate, whichever of the two is the plate.
    if (held.k === 'plate' && on.k === 'food' && addToPlate(held, on.food)) {
      s.item = null;
      return this.done(c, 'pickup');
    }
    if (held.k === 'food' && on.k === 'plate' && addToPlate(on, held.food)) {
      c.held = null;
      return this.done(c, 'putdown');
    }
    // Two plates: pour the one in hand onto the one on the counter when it all fits.
    if (held.k === 'plate' && on.k === 'plate' && held.on.length > 0) {
      const merged = [...on.on];
      for (const f of held.on) {
        if (!canAddToPlate(merged, f)) return this.fail(c, 'full');
        merged.push(f);
      }
      for (const f of held.on) addToPlate(on, f);
      held.on = [];
      return this.done(c, 'putdown');
    }
    return this.fail(c, 'full');
  }

  private useCooker(c: Chef, s: Station, kind: 'stove' | 'fryer' | 'wok'): boolean {
    const held = c.held;
    if (s.item) {
      if (!held) {
        const it = s.item;
        s.item = null;
        s.cookMs = 0;
        s.warned = false;
        return this.give(c, it);
      }
      if (held.k === 'plate' && s.item.k === 'food' && addToPlate(held, s.item.food)) {
        s.item = null;
        s.cookMs = 0;
        s.warned = false;
        return this.done(c, 'pickup');
      }
      return this.fail(c, 'full');
    }
    if (!held) {
      // Wok: take the last raw ingredient back out.
      const raw = s.pot.pop();
      if (raw) {
        s.cookMs = 0;
        return this.give(c, food(raw));
      }
      return this.fail(c, 'empty');
    }
    if (held.k !== 'food' || !COOKS[kind].includes(held.food) || s.pot.includes(held.food))
      return this.fail(c, 'wrong');
    if (kind === 'wok') {
      s.pot.push(held.food);
      s.cookMs = 0;
      if (s.pot.length === 2) this.emit({ type: 'cookStart', station: s.id });
    } else {
      s.item = held;
      s.cookMs = 0;
      this.emit({ type: 'cookStart', station: s.id });
    }
    s.warned = false;
    s.lastBy = c.id;
    c.held = null;
    return this.done(c, 'putdown');
  }

  private serve(c: Chef): boolean {
    const held = c.held;
    if (!held) return this.fail(c, 'nothing');
    const part = partOf(held);
    if (!part) return this.fail(c, 'wrong');
    const served = this.orders.serve(part, this.simT);
    if (!served) return this.fail(c, 'noOrder');
    c.held = null;
    if (held.k === 'plate') this.returns.push(this.simT + PLATE_RETURN_MS);
    c.stats.deliveries++;
    const pass = this.stations.find((s) => s.kind === 'pass');
    this.emit({
      type: 'served',
      served,
      by: c.id,
      x: pass ? pass.x + pass.w / 2 : c.x,
      y: pass ? pass.y : c.y,
    });
    return true;
  }

  private give(c: Chef, item: Item): boolean {
    c.held = item;
    this.emit({ type: 'pickup', id: c.id });
    return true;
  }

  private done(c: Chef, type: 'pickup' | 'putdown'): boolean {
    this.emit({ type, id: c.id });
    return true;
  }

  private fail(c: Chef, reason: FailReason): boolean {
    this.emit({ type: 'fail', id: c.id, reason });
    return false;
  }

  /* ------------------------------------------------------------------ queries */

  staggered(c: Chef): boolean {
    return this.simT < c.staggerUntil;
  }

  solid(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return true;
    return this.cells[row * COLS + col] !== -1;
  }

  stationAt(col: number, row: number): Station | null {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
    const i = this.cells[row * COLS + col]!;
    return i >= 0 ? this.stations[i]! : null;
  }

  /** Distance from a point to a station's tile rectangle. */
  static distTo(s: Station, x: number, y: number): number {
    const qx = Math.max(s.x, Math.min(s.x + s.w, x));
    const qy = Math.max(s.y, Math.min(s.y + 1, y));
    return Math.hypot(x - qx, y - qy);
  }

  /**
   * The station a cook would use. Alignment is measured to the station's middle (the nearest tile
   * middle for the two-tile pass), not to its nearest edge, so where two counters meet the one the
   * cook faces wins instead of both scoring the same. The current target is kept while holding
   * Kerja, and otherwise until another station is clearly better (`TARGET_STICK`).
   */
  findTarget(c: Chef): number | null {
    const prev = c.target === null ? null : (this.stations[c.target] ?? null);
    if (prev && c.work && DapurMatch.distTo(prev, c.x, c.y) <= REACH) return prev.id;
    let best: number | null = null;
    let bestScore = -Infinity;
    let prevScore = -Infinity;
    const x0 = Math.floor(c.x - 1);
    const y0 = Math.floor(c.y - 1);
    for (let r = y0; r <= y0 + 2; r++) {
      for (let col = x0; col <= x0 + 2; col++) {
        const s = this.stationAt(col, r);
        // The pass covers two tiles: score it once, from its left tile.
        if (!s || col !== Math.max(s.x, x0)) continue;
        const score = this.targetScore(s, c);
        if (score === null) continue;
        if (s === prev) prevScore = score;
        if (score > bestScore) {
          bestScore = score;
          best = s.id;
        }
      }
    }
    if (prev && prevScore > -Infinity && bestScore - prevScore < TARGET_STICK) return prev.id;
    return best;
  }

  /** How well a station suits a cook (higher is better), or null when out of reach or behind. */
  private targetScore(s: Station, c: Chef): number | null {
    const d = DapurMatch.distTo(s, c.x, c.y);
    if (d > REACH) return null;
    const mx = Math.max(s.x + 0.5, Math.min(s.x + s.w - 0.5, c.x));
    const dx = mx - c.x;
    const dy = s.y + 0.5 - c.y;
    const len = Math.hypot(dx, dy);
    const dot = len > 1e-6 ? (dx * c.faceX + dy * c.faceY) / len : 1;
    if (dot < -0.3) return null;
    return dot - d * 0.8;
  }

  nearestFloor(c: Chef): FloorItem | null {
    let best: FloorItem | null = null;
    let bd = PICK_FLOOR;
    for (const f of this.floor) {
      const d = Math.hypot(f.x - c.x, f.y - c.y);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /** Remaining round time (ms) at game time t. */
  timeLeft(t: number): number {
    if (this.phase === 'countdown' || this.practicing) return this.tuning.roundMs;
    return Math.max(0, this.endAt - t);
  }

  /** Progress between the last two steps, for smooth drawing. */
  alpha(t: number): number {
    return Math.max(0, Math.min(1, (t - this.simT) / STEP_MS + 1));
  }

  get now(): number {
    return this.simT;
  }

  get score(): number {
    return this.orders.score;
  }

  drainEvents(): MatchEvent[] {
    return this.events.splice(0, this.events.length);
  }

  private emit(e: MatchEvent): void {
    this.events.push(e);
  }

  /* ------------------------------------------------------------------ simulation */

  /** Run fixed steps up to game time `t`. */
  advance(t: number): void {
    const dt = t - this.lastT;
    this.lastT = t;
    if (dt <= 0) return;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      this.simT += STEP_MS;
      this.step(this.simT);
      if (++n >= MAX_STEPS) {
        // A long stall (tab hidden without a pause): skip ahead rather than spiral.
        this.acc = 0;
        this.simT = t;
        break;
      }
    }
  }

  /** One fixed step at game time t (exposed for tests). */
  step(t: number): void {
    this.simT = t;
    this.updatePhase(t);
    for (const c of this.chefs) {
      c.prevX = c.x;
      c.prevY = c.y;
    }
    if (this.phase !== 'play') {
      for (const c of this.chefs) {
        c.moving = false;
        c.busy = null;
      }
      return;
    }
    for (const c of this.chefs) if (c.pilot) c.pilot.think(this, c, t);
    for (const c of this.chefs) this.moveChef(c);
    this.separate();
    for (const c of this.chefs) {
      c.target = this.findTarget(c);
      this.work(c, STEP_MS, t);
    }
    for (const s of this.stations) this.heat(s, STEP_MS);
    this.updateFlights(t);
    this.updateReturns(t);
    // Practice: the one ticket stays and no new ones come.
    if (this.practicing) return;
    const { added, missed } = this.orders.update(t, this.endAt);
    for (const k of added) this.emit({ type: 'order', ticket: k });
    for (const k of missed) this.emit({ type: 'missed', ticket: k, penalty: this.tuning.missPenalty });
  }

  private updatePhase(t: number): void {
    if (this.phase === 'countdown') {
      const v = Math.ceil((this.goAt - t) / 1000);
      if (t >= this.goAt) {
        this.phase = 'play';
        this.emit({ type: 'go' });
        const k = this.orders.start(t);
        this.emit({ type: 'order', ticket: k });
      } else if (v !== this.countValue) {
        this.countValue = v;
        this.emit({ type: 'count', value: v });
      }
      return;
    }
    if (this.phase === 'play') {
      if (this.practicing) return;
      const left = this.endAt - t;
      if (!this.warned && left <= WARNING_LEFT_MS) {
        this.warned = true;
        this.emit({ type: 'warning' });
      }
      const sec = Math.ceil(left / 1000);
      if (sec <= 10 && sec >= 1 && sec !== this.lastSecond) {
        this.lastSecond = sec;
        this.emit({ type: 'second', left: sec });
      }
      if (this.moveAt !== null && !this.moved) {
        if (!this.moveWarned && t >= this.moveAt - MOVE_WARN_MS) {
          this.moveWarned = true;
          this.emit({ type: 'moveWarn' });
        }
        if (t >= this.moveAt) this.moveStations();
      }
      if (t >= this.endAt) {
        this.phase = 'over';
        for (const c of this.chefs) {
          c.work = false;
          c.busy = null;
        }
        this.emit({ type: 'timeUp' });
      }
      return;
    }
    if (this.phase === 'over' && t >= this.endAt + OVER_MS) {
      this.phase = 'done';
      this.emit({ type: 'done' });
    }
  }

  /** Jam Sibuk: stations trade places; what is on them travels along. */
  private moveStations(): void {
    this.moved = true;
    const move = this.def.move;
    if (!move) return;
    for (const [a, b] of move.swaps) {
      const sa = this.stationAt(a[0], a[1]);
      const sb = this.stationAt(b[0], b[1]);
      if (!sa || !sb || sa.w !== 1 || sb.w !== 1) continue;
      const ax = sa.x;
      const ay = sa.y;
      sa.x = sb.x;
      sa.y = sb.y;
      sb.x = ax;
      sb.y = ay;
      this.cells[sa.y * COLS + sa.x] = sa.id;
      this.cells[sb.y * COLS + sb.x] = sb.id;
    }
    this.emit({ type: 'move' });
  }

  private moveChef(c: Chef): void {
    c.moving = false;
    if (this.staggered(c)) return;
    let sx = c.stickX;
    let sy = c.stickY;
    const mag = Math.hypot(sx, sy);
    if (mag < DEAD_ZONE) return;
    sx /= mag;
    sy /= mag;
    c.faceX = sx;
    c.faceY = sy;
    const speed = SPEED * Math.min(1, (mag - DEAD_ZONE) / (0.75 - DEAD_ZONE) + 0.25);
    const d = (speed * STEP_MS) / 1000;
    const x0 = c.x;
    const y0 = c.y;
    c.x += sx * d;
    this.resolve(c);
    c.y += sy * d;
    this.resolve(c);
    const moved = Math.hypot(c.x - x0, c.y - y0);
    c.walked += moved;
    c.moving = moved > 0.002;
  }

  /** Push a cook out of every solid tile it overlaps. */
  private resolve(c: Chef): void {
    for (let pass = 0; pass < 2; pass++) {
      const c0 = Math.floor(c.x - RADIUS);
      const c1 = Math.floor(c.x + RADIUS);
      const r0 = Math.floor(c.y - RADIUS);
      const r1 = Math.floor(c.y + RADIUS);
      for (let r = r0; r <= r1; r++) {
        for (let col = c0; col <= c1; col++) {
          if (!this.solid(col, r)) continue;
          const qx = Math.max(col, Math.min(col + 1, c.x));
          const qy = Math.max(r, Math.min(r + 1, c.y));
          const dx = c.x - qx;
          const dy = c.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= RADIUS * RADIUS) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            const push = (RADIUS - d) / d;
            c.x += dx * push;
            c.y += dy * push;
          } else {
            // Centre inside the tile: leave by the nearest edge.
            const left = c.x - col;
            const right = col + 1 - c.x;
            const top = c.y - r;
            const bottom = r + 1 - c.y;
            const m = Math.min(left, right, top, bottom);
            if (m === left) c.x = col - RADIUS;
            else if (m === right) c.x = col + 1 + RADIUS;
            else if (m === top) c.y = r - RADIUS;
            else c.y = r + 1 + RADIUS;
          }
        }
      }
    }
  }

  /** Cooks gently push each other apart. */
  private separate(): void {
    const min = RADIUS * 1.7;
    for (let i = 0; i < this.chefs.length; i++) {
      const a = this.chefs[i]!;
      for (let j = i + 1; j < this.chefs.length; j++) {
        const b = this.chefs[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        const nx = d > 1e-6 ? dx / d : 1;
        const ny = d > 1e-6 ? dy / d : 0;
        const push = (min - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        this.resolve(a);
        this.resolve(b);
      }
    }
  }

  /** Holding Kerja: chop, wash, clean the apron, fill soda, put out a fire. */
  private work(c: Chef, dt: number, _t: number): void {
    c.busy = null;
    const s = c.target === null ? null : this.stations[c.target]!;
    if (!c.work || this.staggered(c) || !s) {
      c.jobMs = 0;
      return;
    }
    const held = c.held;
    if (held?.k === 'extinguisher' && s.fire) {
      c.busy = 'douse';
      s.douseMs += dt;
      if (s.douseMs >= DOUSE_MS) {
        s.fire = false;
        s.douseMs = 0;
        c.stats.firesOut++;
        this.emit({ type: 'fireOut', station: s.id, by: c.id });
      }
      return;
    }
    if (s.fire) return;
    if (s.kind === 'board' && s.item?.k === 'food') {
      const into = CHOPS_TO[s.item.food];
      if (!into) return;
      c.busy = 'chop';
      s.item.chop = (s.item.chop ?? 0) + dt / CHOP_MS;
      if (s.item.chop >= 1) {
        s.item = food(into);
        c.stats.chops++;
        this.emit({ type: 'chopped', id: c.id, station: s.id });
      }
      return;
    }
    if (s.kind === 'sink' && !held) {
      if (c.stains.length > 0) {
        c.busy = 'clean';
        c.jobMs += dt;
        if (c.jobMs >= CLEAN_MS) {
          c.jobMs = 0;
          c.stains = [];
          this.emit({ type: 'cleaned', id: c.id });
        }
        return;
      }
      if (s.dirty > 0) {
        c.busy = 'wash';
        c.jobMs += dt;
        if (c.jobMs >= WASH_MS) {
          c.jobMs = 0;
          s.dirty--;
          const rack = this.stations.find((r) => r.kind === 'rack');
          if (rack) rack.plates++;
          c.stats.washed++;
          this.emit({ type: 'washed', id: c.id });
        }
        return;
      }
      c.jobMs = 0;
      return;
    }
    if (s.kind === 'soda' && held?.k === 'glass') {
      if (isFull(held) && !this.tuning.overfill) return;
      c.busy = 'fill';
      if (!isFull(held)) {
        held.fill = Math.min(1, held.fill + dt / FILL_MS);
        if (isFull(held)) this.emit({ type: 'filled', id: c.id });
        return;
      }
      held.over = (held.over ?? 0) + dt;
      if (held.over >= OVERFILL_MS) {
        c.held = null;
        this.emit({ type: 'spill', id: c.id });
      }
      return;
    }
    c.jobMs = 0;
  }

  /** Cookers: raw to done, then (if the difficulty burns) warning, burnt, maybe fire. */
  private heat(s: Station, dt: number): void {
    if (!isCooker(s.kind) || s.fire) return;
    const kind = s.kind;
    const cookMs = COOK_MS[kind];
    const raw =
      kind === 'wok' ? s.pot.length === 2 : s.item?.k === 'food' && COOKS[kind].includes(s.item.food);
    if (raw) {
      s.cookMs += dt;
      if (s.cookMs >= cookMs) {
        s.item = food(COOKED[kind]);
        s.pot = [];
        s.cookMs = cookMs;
        this.emit({ type: 'cooked', station: s.id });
      }
      return;
    }
    if (s.item?.k !== 'food' || s.item.food !== COOKED[kind]) return;
    const burn = this.tuning.burnMs;
    if (burn === null || this.practicing) return;
    s.cookMs += dt;
    if (!s.warned && s.cookMs >= cookMs + burn - WARN_MS) {
      s.warned = true;
      this.emit({ type: 'burnWarn', station: s.id });
    }
    if (s.cookMs >= cookMs + burn) {
      s.item = food('gosong');
      s.warned = false;
      const by = s.lastBy;
      const who = by === null ? undefined : this.chef(by);
      if (who) who.stats.burnt++;
      this.emit({ type: 'burnt', station: s.id, by });
      if (this.tuning.fire) {
        s.fire = true;
        s.douseMs = 0;
        this.emit({ type: 'fire', station: s.id });
      }
    }
  }

  /** Cooking progress of a cooker for drawing: 0..1 while cooking, then 1..2 toward burnt. */
  heatLevel(s: Station): number {
    if (!isCooker(s.kind)) return 0;
    const cookMs = COOK_MS[s.kind];
    if (s.item?.k === 'food' && s.item.food === 'gosong') return 2;
    const raw =
      s.kind === 'wok' ? s.pot.length === 2 : s.item?.k === 'food' && COOKS[s.kind].includes(s.item.food);
    if (raw) return Math.min(1, s.cookMs / cookMs);
    if (s.item?.k === 'food' && s.item.food === COOKED[s.kind]) {
      const burn = this.tuning.burnMs;
      return burn === null ? 1 : 1 + Math.min(1, (s.cookMs - cookMs) / burn);
    }
    return 0;
  }

  private updateFlights(t: number): void {
    for (let i = 0; i < this.flights.length; i++) {
      const f = this.flights[i]!;
      const r = f.toChef === null ? undefined : this.chef(f.toChef);
      if (r) {
        f.ex = r.x;
        f.ey = r.y;
      }
      if (t < f.t0 + f.dur) continue;
      this.flights.splice(i--, 1);
      this.land(f, r, t);
    }
  }

  private land(f: Flight, r: Chef | undefined, t: number): void {
    const thrower = this.chef(f.from);
    if (f.toStation !== null) {
      const s = this.stations[f.toStation]!;
      if (!s.item && !s.fire) {
        s.item = f.item;
        this.emit({ type: 'land', flight: f, x: s.x + 0.5, y: s.y + 0.5 });
      } else {
        const p = this.floorNear(s.x + 0.5, s.y + 0.5);
        this.dropFloor(f.item, p.x, p.y);
        this.emit({ type: 'land', flight: f, x: p.x, y: p.y });
      }
      return;
    }
    if (!r) {
      const p = this.floorNear(f.ex, f.ey);
      this.dropFloor(f.item, p.x, p.y);
      this.emit({ type: 'land', flight: f, x: p.x, y: p.y });
      return;
    }
    if (!r.held && !this.staggered(r)) {
      r.held = f.item;
      r.stats.catches++;
      if (thrower) thrower.stats.goodThrows++;
      this.emit({ type: 'catch', flight: f, by: r.id });
      return;
    }
    if (!this.tuning.hits) {
      // Santai: it lands safely on the nearest free counter the receiver can reach.
      const s = this.freeCounterNear(r);
      if (s) {
        s.item = f.item;
        this.emit({ type: 'land', flight: f, x: s.x + 0.5, y: s.y + 0.5 });
      } else {
        this.dropFloor(f.item, r.x, r.y + 0.3);
        this.emit({ type: 'land', flight: f, x: r.x, y: r.y + 0.3 });
      }
      return;
    }
    r.staggerUntil = t + STAGGER_MS;
    r.hitAt = t;
    r.stats.stains++;
    if (r.stains.length < MAX_STAINS) {
      r.stains.push({
        kind: stainOf(f.item),
        u: this.rnd() * 1.6 - 0.8,
        v: this.rnd() * 1.4 - 0.7,
        s: 0.6 + this.rnd() * 0.6,
      });
    }
    let broke = false;
    const it = f.item;
    if (this.tuning.breaks && it.k === 'plate' && it.on.length > 0) {
      broke = true;
      // A replacement plate turns up at the sink later, so the kitchen never runs dry.
      this.returns.push(t + PLATE_RETURN_MS);
    } else if (this.tuning.breaks && it.k === 'glass' && it.fill > 0) {
      broke = true;
    } else {
      const a = this.rnd() * Math.PI * 2;
      this.dropFloor(it, r.x + Math.cos(a) * 0.35, r.y + Math.sin(a) * 0.25);
    }
    if (broke && thrower) thrower.stats.badThrows++;
    this.emit({ type: 'hit', flight: f, to: r.id, broke });
  }

  private updateReturns(t: number): void {
    if (this.returns.length === 0) return;
    const sink = this.stations.find((s) => s.kind === 'sink');
    for (let i = this.returns.length - 1; i >= 0; i--) {
      if (t < this.returns[i]!) continue;
      this.returns.splice(i, 1);
      if (sink) sink.dirty++;
      else {
        const rack = this.stations.find((s) => s.kind === 'rack');
        if (rack) rack.plates++;
      }
      this.emit({ type: 'plateBack' });
    }
  }

  /** Plates on their way back to the sink (delivered or broken). */
  get platesAway(): number {
    return this.returns.length;
  }

  private freeCounterNear(c: Chef): Station | null {
    let best: Station | null = null;
    let bd = Infinity;
    for (const s of this.stations) {
      if (s.kind !== 'counter' || s.item || s.fire) continue;
      if (this.def.split && sideOfX(s.x + 0.5) !== sideOfX(c.x)) continue;
      const d = DapurMatch.distTo(s, c.x, c.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Nearest walkable point to (x, y), on the same side of a divider. */
  floorNear(x: number, y: number): { x: number; y: number } {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (!this.solid(col, row)) return { x, y };
    let best = { x: x, y: y };
    let bd = Infinity;
    const side = sideOfX(x);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.solid(c, r)) continue;
        if (this.def.split && sideOfX(c + 0.5) !== side) continue;
        const px = Math.max(c + 0.3, Math.min(c + 0.7, x));
        const py = Math.max(r + 0.3, Math.min(r + 0.7, y));
        const d = Math.hypot(px - x, py - y);
        if (d < bd) {
          bd = d;
          best = { x: px, y: py };
        }
      }
    }
    return best;
  }

  dropFloor(item: Item, x: number, y: number): void {
    const p = this.floorNear(x, y);
    this.floor.push({ id: this.nextId++, item, x: p.x, y: p.y });
  }

  /* ------------------------------------------------------------------ results */

  stars(): 0 | 1 | 2 | 3 {
    const th = this.thresholds;
    const s = this.orders.score;
    return s >= th[2] ? 3 : s >= th[1] ? 2 : s >= th[0] ? 1 : 0;
  }

  /** Test helper: put a cook somewhere facing a direction. */
  place(id: number, x: number, y: number, faceX = 0, faceY = -1): void {
    const c = this.chef(id);
    if (!c) return;
    c.x = c.prevX = x;
    c.y = c.prevY = y;
    const m = Math.hypot(faceX, faceY) || 1;
    c.faceX = faceX / m;
    c.faceY = faceY / m;
    c.target = this.findTarget(c);
  }

  /** Test/debug helper: a copy of an item, for snapshots that must not alias live state. */
  static copy(item: Item | null): Item | null {
    return item ? cloneItem(item) : null;
  }
}
