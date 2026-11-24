/**
 * The guided practice ("latihan") before the first game on a main screen (owner 2026-11-24): one
 * order of fries made end to end in the real kitchen, one step at a time. The next step shows
 * only after the kitchen shows the current one was done: the step is read from the state itself
 * (where the potato is now, who holds a plate, whether someone walked), so going back (a potato
 * in the bin) shows the earlier step again and doing two things at once skips ahead.
 *
 * Pure: reads the match and its events, no DOM, no timers. The director draws the arrow, the
 * card and the phone hints from what this says.
 */
import type { Item } from './items';
import { type Side, sideOfX } from './kitchens';
import { type Chef, type DapurMatch, type MatchEvent, PRACTICE_DISH, type Station } from './logic';

export type GuideStepId =
  | 'order'
  | 'walk'
  | 'take'
  | 'board'
  | 'chop'
  | 'throw'
  | 'fry'
  | 'rack'
  | 'plate'
  | 'serve';

/** The phone button a step asks for (ids of the pad buttons). */
export type GuideButton = 'grab' | 'work' | 'throw';

export type GuideTarget = { kind: 'ticket' } | { kind: 'station'; id: number } | { kind: 'chef'; id: number };

/** How long "Latihan selesai!" stays before the real countdown. */
export const GUIDE_DONE_MS = 2_600;
/** A first tap on Lewati arms it this long; a second tap within it ends the practice. */
export const SKIP_CONFIRM_MS = 3_000;
/** Walking this far (tiles) counts as having tried the joystick. */
const MOVE_TILES = 0.6;

/** How far the practice dish has come, read from the kitchen as it is now. */
export const STAGE = {
  none: 0,
  /** A raw potato in someone's hands (or anywhere but a board). */
  taken: 1,
  onBoard: 2,
  chopped: 3,
  /** Split kitchens: the chopped potato reached the fryer's side. */
  across: 4,
  frying: 5,
  fried: 6,
  plated: 7,
} as const;

const ORDER: readonly GuideStepId[] = [
  'order',
  'walk',
  'take',
  'board',
  'chop',
  'fry',
  'rack',
  'plate',
  'serve',
];
const ORDER_SPLIT: readonly GuideStepId[] = [
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

const stationSide = (s: Station): Side => sideOfX(s.x + s.w / 2);

/** The station whose side does each step in a split kitchen (null: anyone). */
const STEP_STATION: Record<GuideStepId, 'basket' | 'fryer' | 'rack' | 'pass' | null> = {
  order: null,
  walk: 'basket',
  take: 'basket',
  board: 'basket',
  chop: 'basket',
  throw: 'basket',
  fry: 'fryer',
  rack: 'rack',
  plate: 'fryer',
  serve: 'pass',
};

function stageOf(item: Item | null, station: Station | null, side: Side, across: Side | null): number {
  if (!item) return STAGE.none;
  if (item.k === 'plate') return item.on.includes('kentangGoreng') ? STAGE.plated : STAGE.none;
  if (item.k !== 'food') return STAGE.none;
  switch (item.food) {
    case 'kentang':
      return station?.kind === 'board' ? STAGE.onBoard : STAGE.taken;
    case 'kentangPotong':
      if (station?.kind === 'fryer') return STAGE.frying;
      return across !== null && side === across ? STAGE.across : STAGE.chopped;
    case 'kentangGoreng':
      return STAGE.fried;
    default:
      return STAGE.none;
  }
}

/**
 * The furthest the practice dish has come anywhere in the kitchen (hands, stations, floor, in
 * the air). `across` is the fryer's side in a split kitchen (null in an open one). A thrown item
 * counts on the side it left from until it lands.
 */
export function dishStage(m: DapurMatch, across: Side | null): number {
  let best: number = STAGE.none;
  for (const c of m.chefs) best = Math.max(best, stageOf(c.held, null, sideOfX(c.x), across));
  for (const s of m.stations) best = Math.max(best, stageOf(s.item, s, stationSide(s), across));
  for (const f of m.floor) best = Math.max(best, stageOf(f.item, null, sideOfX(f.x), across));
  for (const f of m.flights) best = Math.max(best, stageOf(f.item, null, sideOfX(f.sx), across));
  return best;
}

const holds = (c: Chef, food: string): boolean => c.held?.k === 'food' && c.held.food === food;

export class Guide {
  readonly steps: readonly GuideStepId[];
  private readonly basket: Station;
  private readonly boards: readonly Station[];
  private readonly fryer: Station;
  private readonly rack: Station;
  private readonly pass: Station;
  private readonly split: boolean;
  private moved = false;
  private reached = false;
  private served = false;
  private stage: number = STAGE.none;
  private idx = 0;
  private doneAt: number | null = null;
  private skippedAt: number | null = null;
  private readonly armedUntil = new Map<number, number>();

  /** The practice for this kitchen, or null when it lacks a station the dish needs. */
  static for(m: DapurMatch): Guide | null {
    const basket = m.stations.find((s) => s.kind === 'basket' && s.source === 'kentang');
    const boards = m.stations.filter((s) => s.kind === 'board');
    const fryer = m.stations.find((s) => s.kind === 'fryer');
    const rack = m.stations.find((s) => s.kind === 'rack');
    const pass = m.stations.find((s) => s.kind === 'pass');
    if (!basket || boards.length === 0 || !fryer || !rack || !pass) return null;
    return new Guide(m.def.split, basket, boards, fryer, rack, pass);
  }

  private constructor(
    split: boolean,
    basket: Station,
    boards: Station[],
    fryer: Station,
    rack: Station,
    pass: Station,
  ) {
    this.split = split;
    this.basket = basket;
    this.fryer = fryer;
    this.rack = rack;
    this.pass = pass;
    // In a split kitchen only the boards on the basket's side are reachable with a raw potato.
    const near = split ? boards.filter((b) => stationSide(b) === stationSide(basket)) : boards;
    this.boards = near.length > 0 ? near : boards;
    this.steps = split ? ORDER_SPLIT : ORDER;
  }

  /* ------------------------------------------------------------------ progress */

  /** The step now shown, 0-based. */
  get index(): number {
    return this.idx;
  }

  get total(): number {
    return this.steps.length;
  }

  get step(): GuideStepId {
    return this.steps[Math.min(this.idx, this.steps.length - 1)]!;
  }

  /** The order was served: "Latihan selesai!" shows until `over`. */
  get finished(): boolean {
    return this.served;
  }

  get skipped(): boolean {
    return this.skippedAt !== null;
  }

  /** Time to start the real round (skipped, or the finish card has been seen). */
  over(t: number): boolean {
    if (this.skippedAt !== null) return true;
    return this.doneAt !== null && t - this.doneAt >= GUIDE_DONE_MS;
  }

  onEvent(e: MatchEvent, t: number): void {
    if (e.type !== 'served' || this.served) return;
    if (e.served.ticket.dish !== PRACTICE_DISH || !e.served.complete) return;
    this.served = true;
    this.doneAt = t;
  }

  /** Reads the kitchen after a step of the match; true when the shown step changed. */
  update(m: DapurMatch, t: number): boolean {
    if (this.served || this.skippedAt !== null) return false;
    for (const [id, until] of this.armedUntil) if (t > until) this.armedUntil.delete(id);
    if (!this.moved) this.moved = m.chefs.some((c) => !c.cpu && c.walked >= MOVE_TILES);
    if (!this.reached) this.reached = m.chefs.some((c) => c.target === this.basket.id);
    this.stage = dishStage(m, this.split ? stationSide(this.fryer) : null);
    const plateOut =
      m.chefs.some((c) => c.held?.k === 'plate') ||
      m.stations.some((s) => s.kind !== 'rack' && s.item?.k === 'plate') ||
      m.floor.some((f) => f.item.k === 'plate');
    let i = 0;
    while (i < this.steps.length && this.done(this.steps[i]!, plateOut)) i++;
    const next = Math.min(i, this.steps.length - 1);
    if (next === this.idx) return false;
    this.idx = next;
    return true;
  }

  private done(step: GuideStepId, plateOut: boolean): boolean {
    const st = this.stage;
    switch (step) {
      case 'order':
        return this.moved || st >= STAGE.taken;
      case 'walk':
        return this.reached || st >= STAGE.taken;
      case 'take':
        return st >= STAGE.taken;
      case 'board':
        return st >= STAGE.onBoard;
      case 'chop':
        return st >= STAGE.chopped;
      case 'throw':
        return st >= STAGE.across;
      case 'fry':
        return st >= STAGE.frying;
      case 'rack':
        return (st >= STAGE.frying && plateOut) || st >= STAGE.plated;
      case 'plate':
        return st >= STAGE.plated;
      case 'serve':
        return this.served;
    }
  }

  /** The plate step while the fries are still in the fryer: nothing to press yet. */
  get waiting(): boolean {
    return this.step === 'plate' && this.stage === STAGE.frying;
  }

  /* ------------------------------------------------------------------ who and where */

  /** The side whose cooks do the shown step (split kitchens), or null when anyone can. */
  get side(): Side | null {
    if (!this.split) return null;
    const where = STEP_STATION[this.step];
    return where === null ? null : stationSide(this[where]);
  }

  /** Whether this cook can do the shown step (on the right side of the wall). */
  canAct(c: Chef): boolean {
    const side = this.side;
    return side === null || c.side === side;
  }

  /**
   * The computer helper that should work now: in a split kitchen, when nobody on the step's side
   * is a person (a lone player's helper does that side's steps; otherwise it stays idle).
   */
  helper(m: DapurMatch): Chef | null {
    const side = this.side;
    if (side === null || this.served) return null;
    if (m.chefs.some((c) => !c.cpu && c.side === side)) return null;
    return m.chefs.find((c) => c.cpu && c.side === side) ?? null;
  }

  /** The button this cook should press for the shown step (null: walk, wait or watch). */
  buttonFor(c: Chef): GuideButton | null {
    if (this.served || !this.canAct(c)) return null;
    switch (this.step) {
      case 'order':
      case 'walk':
        return null;
      case 'chop':
        return 'work';
      case 'throw':
        return holds(c, 'kentangPotong') ? 'throw' : 'grab';
      case 'plate':
        return this.waiting ? null : 'grab';
      default:
        return 'grab';
    }
  }

  /** What the arrow points at for the shown step. */
  target(m: DapurMatch): GuideTarget | null {
    if (this.served) return null;
    const at = (s: Station): GuideTarget => ({ kind: 'station', id: s.id });
    const holding = (food: string) => m.chefs.find((c) => holds(c, food)) ?? null;
    const lying = (food: string) =>
      m.stations.find((s) => s.item?.k === 'food' && s.item.food === food) ?? null;
    switch (this.step) {
      case 'order':
        return { kind: 'ticket' };
      case 'walk':
      case 'take':
        return at(this.basket);
      case 'board':
      case 'chop': {
        const on = this.boards.find((b) => b.item?.k === 'food' && b.item.food === 'kentang');
        if (on) return at(on);
        const from = holding('kentang') ?? null;
        return at(
          this.nearestBoard(from ? from.x : this.basket.x + 0.5, from ? from.y : this.basket.y + 0.5),
        );
      }
      case 'throw': {
        const thrower = m.chefs.find((c) => holds(c, 'kentangPotong') && c.side === this.side);
        if (thrower) {
          const across = m.chefs.filter((c) => c.side !== thrower.side);
          const catcher = across.find((c) => !c.held) ?? across[0];
          if (catcher) return { kind: 'chef', id: catcher.id };
        }
        const s = lying('kentangPotong');
        return s ? at(s) : null;
      }
      case 'fry': {
        if (holding('kentangPotong')) return at(this.fryer);
        return at(lying('kentangPotong') ?? this.fryer);
      }
      case 'rack':
        return at(this.rack);
      case 'plate':
        return at(lying('kentangGoreng') ?? this.fryer);
      case 'serve':
        return at(this.pass);
    }
  }

  private nearestBoard(x: number, y: number): Station {
    let best = this.boards[0]!;
    let bd = Number.POSITIVE_INFINITY;
    for (const b of this.boards) {
      if (b.item) continue;
      const d = Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ skip */

  /** A tap on Lewati: the first arms it, a second within SKIP_CONFIRM_MS ends the practice. */
  skip(id: number, t: number): boolean {
    if (this.skippedAt !== null) return true;
    const until = this.armedUntil.get(id);
    if (until !== undefined && t <= until) {
      this.skippedAt = t;
      return true;
    }
    this.armedUntil.set(id, t + SKIP_CONFIRM_MS);
    return false;
  }

  /** Whether this player's Lewati is waiting for the confirming tap. */
  armed(id: number, t: number): boolean {
    const until = this.armedUntil.get(id);
    return until !== undefined && t <= until;
  }
}
