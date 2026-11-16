/**
 * The order book: up to four tickets with timers, team score, speed tips and missed-ticket
 * penalties. Deterministic for a given random source. Pure.
 */
import { type DishId, type Part, RECIPES } from './recipes';

export const MAX_TICKETS = 4;
/** Share of the dish points paid as a tip when served instantly (scales down to 0 at the deadline). */
export const TIP_SHARE = 0.5;
/** A fresh ticket comes this soon when the rail runs empty. */
const EMPTY_GAP_MS = 2_500;
/** The second ticket follows the first quickly so everyone has something to do. */
const SECOND_MS = 8_000;
/** Paket orders only after this share of the round (they need the most work). */
const PAKET_AFTER = 0.25;
/** Early tickets come from the first dishes of the menu. */
const EASY_FOR = 0.2;

export interface Ticket {
  id: number;
  dish: DishId;
  /** Game time the ticket appeared. */
  t0: number;
  waitMs: number;
  /** Parts already handed in (paket). */
  got: Part[];
}

export interface Served {
  ticket: Ticket;
  /** True when this hand-in finished the ticket. */
  complete: boolean;
  points: number;
  tip: number;
}

export interface OrderOptions {
  menu: readonly DishId[];
  first: DishId;
  gapMs: number;
  waitMul: number;
  missPenalty: number;
  roundMs: number;
  rnd: () => number;
}

export class OrderBook {
  readonly tickets: Ticket[] = [];
  score = 0;
  delivered = 0;
  missed = 0;
  tips = 0;
  private nextId = 1;
  private nextAt = Number.POSITIVE_INFINITY;
  private startAt = 0;
  private last: DishId | null = null;

  constructor(private readonly o: OrderOptions) {}

  /** Opens the rail at game time `t` with the kitchen's first, easy ticket. */
  start(t: number): Ticket {
    this.startAt = t;
    const first = this.add(this.o.first, t);
    this.nextAt = t + SECOND_MS;
    return first;
  }

  timeLeft(k: Ticket, t: number): number {
    return Math.max(0, k.t0 + k.waitMs - t);
  }

  /** 1 = fresh, 0 = about to leave. */
  patience(k: Ticket, t: number): number {
    return k.waitMs > 0 ? this.timeLeft(k, t) / k.waitMs : 0;
  }

  /** Parts a ticket still needs. */
  missing(k: Ticket): Part[] {
    const left = [...RECIPES[k.dish].parts];
    for (const g of k.got) {
      const i = left.indexOf(g);
      if (i >= 0) left.splice(i, 1);
    }
    return left;
  }

  /** The most urgent ticket that still needs `part`, or null. */
  wants(part: Part, t: number): Ticket | null {
    let best: Ticket | null = null;
    for (const k of this.tickets) {
      if (!this.missing(k).includes(part)) continue;
      if (!best || this.timeLeft(k, t) < this.timeLeft(best, t)) best = k;
    }
    return best;
  }

  /** Hand `part` in at the pass. Null when no ticket wants it. */
  serve(part: Part, t: number): Served | null {
    const k = this.wants(part, t);
    if (!k) return null;
    k.got.push(part);
    if (this.missing(k).length > 0) return { ticket: k, complete: false, points: 0, tip: 0 };
    const base = RECIPES[k.dish].points;
    const tip = Math.round((base * TIP_SHARE * this.patience(k, t)) / 5) * 5;
    this.tickets.splice(this.tickets.indexOf(k), 1);
    this.score += base + tip;
    this.tips += tip;
    this.delivered++;
    if (this.tickets.length === 0) this.nextAt = Math.min(this.nextAt, t + EMPTY_GAP_MS);
    return { ticket: k, complete: true, points: base, tip };
  }

  /**
   * Advance to `t`: tickets past their patience leave (penalty), new ones arrive. `stopAt` is the
   * end of the round: no new tickets in its last seconds.
   */
  update(t: number, stopAt: number): { added: Ticket[]; missed: Ticket[] } {
    const added: Ticket[] = [];
    const missed: Ticket[] = [];
    for (let i = this.tickets.length - 1; i >= 0; i--) {
      const k = this.tickets[i]!;
      if (t < k.t0 + k.waitMs) continue;
      this.tickets.splice(i, 1);
      this.missed++;
      this.score = Math.max(0, this.score - this.o.missPenalty);
      missed.push(k);
    }
    if (this.tickets.length === 0 && this.nextAt > t + EMPTY_GAP_MS) this.nextAt = t + EMPTY_GAP_MS;
    if (t >= this.nextAt && t < stopAt - 15_000) {
      if (this.tickets.length < MAX_TICKETS) added.push(this.add(this.pick(t), t));
      const jitter = 0.8 + this.o.rnd() * 0.4;
      this.nextAt = t + this.o.gapMs * jitter;
    }
    missed.reverse();
    return { added, missed };
  }

  private pick(t: number): DishId {
    const elapsed = (t - this.startAt) / Math.max(1, this.o.roundMs);
    let pool = [...this.o.menu];
    if (elapsed < PAKET_AFTER) pool = pool.filter((d) => d !== 'paket');
    if (elapsed < EASY_FOR) pool = pool.slice(0, 3);
    if (pool.length > 1 && this.last) pool = pool.filter((d) => d !== this.last);
    const d = pool[Math.floor(this.o.rnd() * pool.length)] ?? this.o.first;
    return d;
  }

  private add(dish: DishId, t: number): Ticket {
    const k: Ticket = {
      id: this.nextId++,
      dish,
      t0: t,
      waitMs: RECIPES[dish].waitMs * this.o.waitMul,
      got: [],
    };
    this.tickets.push(k);
    this.last = dish;
    return k;
  }
}
