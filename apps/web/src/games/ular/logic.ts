/**
 * Ular Tangga rules: turns, dice, hops, snakes and ladders, the bounce at the last square,
 * kotak kejutan (event cards), duel kilat, the round cap and the final standings.
 * Pure and deterministic: time comes in as arguments and randomness from a seeded generator,
 * so the whole game can be replayed in tests. Durations live here too, because the next phase
 * starts when the main screen's animation of the previous one is over.
 */
import { u16Delta } from '@hoorah/protocol';
import { type Board, type BoardSize, cellDistance, type Jump, makeBoard } from './board';

/* ------------------------------------------------------------------ timing (ms) */

export const INTRO_MS = 3400;
/** A turn waits this long for the phone, then the dice roll by themselves. */
export const ROLL_MS = 8000;
export const DICE_MS = 1100;
export const HOP_MS = 220;
/** Short beat after landing (before a slide, and before the next phase). */
export const LAND_MS = 360;
export const CARD_MS = 3000;
export const SKIP_MS = 2000;
export const DUEL_INTRO_MS = 2600;
export const DUEL_MS = 5000;
export const DUEL_RESULT_MS = 2000;
export const FINALE_MS = 5200;
/** The duel loser slides back this many squares. */
export const DUEL_BACK = 3;
/** Taps per second a human can plausibly reach; anything above is dropped. */
export const MAX_TAP_RATE = 16;
/** A single input frame can't carry more taps than this (stale counters resync instead). */
const MAX_TAP_DELTA = 8;
/** Late ticks catch up at most this far, so a frozen tab doesn't fast-forward a whole game. */
const CATCH_UP_MS = 300;

/** Round cap: about this many turns in total, so a game stays near the catalog duration. */
const CAP: Record<BoardSize, { turns: number; min: number; max: number }> = {
  50: { turns: 64, min: 10, max: 30 },
  100: { turns: 108, min: 18, max: 40 },
};

export function maxRoundsFor(size: BoardSize, players: number): number {
  const c = CAP[size];
  return Math.max(c.min, Math.min(c.max, Math.round(c.turns / Math.max(1, players))));
}

/** How long a slide down a snake or a climb up a ladder takes. */
export function jumpMs(board: Board, j: Jump): number {
  const d = cellDistance(board, j.from, j.to);
  const ms = j.kind === 'snake' ? 650 + 210 * d : 520 + 170 * d;
  return Math.round(Math.max(800, Math.min(2300, ms)));
}

/* ------------------------------------------------------------------ cards */

export type CardId =
  | 'ojek'
  | 'layangan'
  | 'sepeda'
  | 'macet'
  | 'hujan'
  | 'dompet'
  | 'kerupuk'
  | 'tidur'
  | 'bot';

export type CardEffect =
  | { kind: 'move'; steps: number }
  | { kind: 'again' }
  | { kind: 'skip' }
  | { kind: 'shield' };

/** One deck: three steps forward cards (+9), three back (-6), an extra roll, a skip and a shield. */
export const CARDS: Record<CardId, CardEffect> = {
  ojek: { kind: 'move', steps: 3 },
  layangan: { kind: 'move', steps: 2 },
  sepeda: { kind: 'move', steps: 4 },
  macet: { kind: 'move', steps: -2 },
  hujan: { kind: 'move', steps: -1 },
  dompet: { kind: 'move', steps: -3 },
  kerupuk: { kind: 'again' },
  tidur: { kind: 'skip' },
  bot: { kind: 'shield' },
};

export const DECK = Object.keys(CARDS) as CardId[];

/* ------------------------------------------------------------------ rng */

/** mulberry32: tiny, fast, good enough for dice. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ clock */

/** Game time: server time minus everything spent paused. Frozen while paused. */
export class GameClock {
  private offset = 0;
  private pausedAt: number | null = null;
  private last = Number.NEGATIVE_INFINITY;

  constructor(private readonly server: () => number) {}

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  now(): number {
    const t = this.pausedAt ?? this.server() - this.offset;
    if (t < this.last) return this.last;
    this.last = t;
    return t;
  }

  pause(): void {
    if (this.pausedAt === null) this.pausedAt = this.now();
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.offset = this.server() - this.pausedAt;
    this.pausedAt = null;
  }

  toServer(t: number): number {
    return t + this.offset;
  }

  toGame(serverT: number): number {
    return serverT - this.offset;
  }
}

/* ------------------------------------------------------------------ state */

export interface RosterEntry {
  id: number;
  connected: boolean;
}

export interface PlayerStats {
  id: number;
  rolls: number;
  sixes: number;
  ladders: number;
  /** Squares gained on ladders. */
  climbed: number;
  snakes: number;
  /** Squares lost to snakes. */
  fell: number;
  cards: number;
  duelsWon: number;
  duelsLost: number;
  /** Snake bites stopped by the boots card. */
  blocked: number;
}

export interface PlayerState {
  id: number;
  pos: number;
  connected: boolean;
  /** Boots card: the next snake can't bite. */
  shield: boolean;
  /** Overslept: the next turn is skipped. */
  skip: boolean;
  stats: PlayerStats;
}

export type MoveKind = 'dice' | 'card' | 'duel';

/** One move as the main screen animates it: dice, hops, then a slide or a climb. */
export interface MovePlan {
  id: number;
  playerId: number;
  kind: MoveKind;
  from: number;
  dice: number | null;
  /** Every square hopped onto, in order; the last one is where the token lands. */
  path: number[];
  landed: number;
  bounced: boolean;
  /** Ladder or snake taken from the landing square. */
  jump: Jump | null;
  /** A snake that could not bite thanks to the boots card. */
  blocked: Jump | null;
  to: number;
  start: number;
  hopStart: number;
  jumpStart: number;
  end: number;
}

export interface Duel {
  /** The player who landed (challenger) and the one already there. */
  a: number;
  b: number;
  square: number;
  tapsA: number;
  tapsB: number;
  start: number;
  end: number;
  winner: number | null;
}

export type Phase =
  | 'intro'
  | 'roll'
  | 'move'
  | 'card'
  | 'skip'
  | 'duelIntro'
  | 'duel'
  | 'duelResult'
  | 'waiting'
  | 'finale'
  | 'ended';

export type EndReason = 'finish' | 'cap';

export type UlarEvent =
  | { type: 'intro' }
  | { type: 'round'; round: number; last: boolean }
  | { type: 'turn'; playerId: number; extra: boolean }
  | { type: 'skip'; playerId: number }
  | { type: 'move'; plan: MovePlan; auto: boolean }
  | { type: 'card'; playerId: number; card: CardId }
  | { type: 'duelIntro'; duel: Duel }
  | { type: 'duelStart'; duel: Duel }
  | { type: 'duelEnd'; duel: Duel }
  | { type: 'waiting' }
  | { type: 'finale'; winner: number | null; reason: EndReason }
  | { type: 'end' };

export interface Standing {
  id: number;
  rank: number;
  pos: number;
  finished: boolean;
  stats: PlayerStats;
}

export interface UlarOptions {
  size: BoardSize;
  roster: readonly RosterEntry[];
  now: number;
  seed: number;
  /** Replaces the seeded generator (tests force dice with it). Returns [0, 1). */
  rng?: () => number;
}

function emptyStats(id: number): PlayerStats {
  return {
    id,
    rolls: 0,
    sixes: 0,
    ladders: 0,
    climbed: 0,
    snakes: 0,
    fell: 0,
    cards: 0,
    duelsWon: 0,
    duelsLost: 0,
    blocked: 0,
  };
}

/* ------------------------------------------------------------------ game */

export class UlarLogic {
  readonly board: Board;
  readonly size: BoardSize;
  readonly maxRounds: number;
  readonly players = new Map<number, PlayerState>();
  /** Turn order (join order); late joiners are appended. */
  readonly order: number[] = [];

  phase: Phase = 'intro';
  /** When the current timed phase ends (game ms). */
  until: number;
  /** Roll phase: when the dice roll by themselves. */
  deadline = 0;
  current: number | null = null;
  /** 1-based; 0 during the intro. */
  round = 0;
  plan: MovePlan | null = null;
  card: { playerId: number; id: CardId } | null = null;
  duel: Duel | null = null;
  winner: number | null = null;
  endReason: EndReason | null = null;

  private turnIdx = -1;
  private extraRoll = false;
  private planSeq = 0;
  private deck: CardId[] = [];
  private readonly rng: () => number;
  private readonly lastTaps = new Map<number, number>();
  private events: UlarEvent[] = [];

  constructor(opts: UlarOptions) {
    this.size = opts.size;
    this.board = makeBoard(opts.size);
    this.rng = opts.rng ?? makeRng(opts.seed);
    for (const r of opts.roster) this.addPlayer(r);
    this.maxRounds = maxRoundsFor(opts.size, Math.max(1, this.order.length));
    this.until = opts.now + INTRO_MS;
    this.emit({ type: 'intro' });
  }

  /* ---------------------------------------------------------------- queries */

  get last(): number {
    return this.board.size;
  }

  player(id: number): PlayerState | undefined {
    return this.players.get(id);
  }

  /** Whose turn is coming up (for the intro). */
  upcoming(): number | null {
    if (this.current !== null) return this.current;
    return this.order.find((id) => this.players.get(id)?.connected) ?? null;
  }

  drain(): UlarEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Ranking: the finisher first, then by square. Ties share a rank (1, 1, 3). */
  standings(): Standing[] {
    const rows = this.order.map((id, i) => ({ p: this.players.get(id)!, i }));
    const key = (p: PlayerState) => (p.id === this.winner ? this.last + 1 : p.pos);
    rows.sort((x, y) => key(y.p) - key(x.p) || x.i - y.i);
    const out: Standing[] = [];
    rows.forEach((r, k) => {
      const prev = out[k - 1];
      const prevKey = prev ? (prev.id === this.winner ? this.last + 1 : prev.pos) : null;
      const rank = prev && prevKey === key(r.p) ? prev.rank : k + 1;
      out.push({ id: r.p.id, rank, pos: r.p.pos, finished: r.p.pos === this.last, stats: r.p.stats });
    });
    return out;
  }

  /** The player furthest ahead, or null on a tie. */
  leader(): number | null {
    const s = this.standings();
    const top = s.filter((x) => x.rank === 1);
    return top.length === 1 ? top[0]!.id : null;
  }

  /* ---------------------------------------------------------------- input */

  /** The current player taps "Lempar dadu". Returns false when it isn't their moment. */
  roll(id: number, now: number): boolean {
    if (this.phase !== 'roll' || id !== this.current) return false;
    this.doRoll(now, false);
    return true;
  }

  /**
   * One binary input frame: `counter` is the phone's cumulative u16 tap counter. Taps count only
   * for the two duelists during the duel window, capped at a human tap rate.
   */
  tap(id: number, counter: number, now: number): number {
    const prev = this.lastTaps.get(id);
    const c = counter & 0xffff;
    this.lastTaps.set(id, c);
    const delta = prev === undefined ? 1 : u16Delta(prev, c);
    if (delta === 0 || delta > MAX_TAP_DELTA) return 0;
    return this.score(id, delta, now);
  }

  /**
   * Taps from a seat the main screen plays itself (a computer opponent or a dropped phone): no
   * phone counter, same duel window and the same human tap-rate cap.
   */
  addTaps(id: number, n: number, now: number): number {
    if (!Number.isInteger(n) || n <= 0) return 0;
    return this.score(id, Math.min(n, MAX_TAP_DELTA), now);
  }

  private score(id: number, delta: number, now: number): number {
    const d = this.duel;
    if (this.phase !== 'duel' || !d || now < d.start || now > d.end) return 0;
    if (id !== d.a && id !== d.b) return 0;
    const allowed = Math.ceil(((now - d.start) / 1000) * MAX_TAP_RATE) + 2;
    if (id === d.a) {
      const next = Math.min(allowed, d.tapsA + delta);
      const got = Math.max(0, next - d.tapsA);
      d.tapsA = Math.max(d.tapsA, next);
      return got;
    }
    const next = Math.min(allowed, d.tapsB + delta);
    const got = Math.max(0, next - d.tapsB);
    d.tapsB = Math.max(d.tapsB, next);
    return got;
  }

  /** Put cards on top of the deck; the last one is drawn first (tests and demos). */
  stackDeck(cards: readonly CardId[]): void {
    this.deck.push(...cards);
  }

  /** Remember a counter without scoring it (frames that arrive while paused). */
  absorbTaps(id: number, counter: number): void {
    this.lastTaps.set(id, counter & 0xffff);
  }

  setRoster(roster: readonly RosterEntry[], now: number): void {
    for (const r of roster) {
      const p = this.players.get(r.id);
      if (p) p.connected = r.connected;
      else this.addPlayer(r);
    }
    if (this.phase === 'waiting' && this.anyConnected()) {
      this.nextTurn(now);
      return;
    }
    if (this.phase === 'roll' && this.current !== null && !this.players.get(this.current)?.connected) {
      this.extraRoll = false;
      this.nextTurn(now);
    }
  }

  /* ---------------------------------------------------------------- time */

  tick(now: number): void {
    for (let guard = 0; guard < 24; guard++) if (!this.step(now)) return;
  }

  private step(now: number): boolean {
    const at = Math.max(this.until, now - CATCH_UP_MS);
    switch (this.phase) {
      case 'intro':
        if (now < this.until) return false;
        this.nextTurn(at);
        return true;
      case 'roll':
        if (now < this.deadline) return false;
        this.doRoll(Math.max(this.deadline, now - CATCH_UP_MS), true);
        return true;
      case 'move':
        if (now < this.until) return false;
        this.afterMove(at);
        return true;
      case 'card':
        if (now < this.until) return false;
        this.applyCard(at);
        return true;
      case 'skip':
        if (now < this.until) return false;
        this.nextTurn(at);
        return true;
      case 'duelIntro':
        if (now < this.until) return false;
        this.phase = 'duel';
        this.until = this.duel!.end;
        this.emit({ type: 'duelStart', duel: this.duel! });
        return true;
      case 'duel':
        if (now < this.until) return false;
        this.endDuel(at);
        return true;
      case 'duelResult':
        if (now < this.until) return false;
        this.afterDuel(at);
        return true;
      case 'finale':
        if (now < this.until) return false;
        this.phase = 'ended';
        this.emit({ type: 'end' });
        return true;
      case 'waiting':
      case 'ended':
        return false;
    }
  }

  /* ---------------------------------------------------------------- turns */

  private addPlayer(r: RosterEntry): void {
    if (this.players.has(r.id)) return;
    this.players.set(r.id, {
      id: r.id,
      pos: 1,
      connected: r.connected,
      shield: false,
      skip: false,
      stats: emptyStats(r.id),
    });
    this.order.push(r.id);
  }

  private anyConnected(): boolean {
    for (const p of this.players.values()) if (p.connected) return true;
    return false;
  }

  private nextTurn(now: number): void {
    if (this.extraRoll && this.current !== null && this.players.get(this.current)?.connected) {
      this.extraRoll = false;
      this.beginTurn(this.current, now, true);
      return;
    }
    this.extraRoll = false;
    if (!this.anyConnected() || this.order.length === 0) {
      this.phase = 'waiting';
      this.current = null;
      this.emit({ type: 'waiting' });
      return;
    }
    // Walk the order; wrapping past the end starts a new round. Offline players are passed over.
    for (let guard = 0; guard <= this.order.length * 2; guard++) {
      this.turnIdx++;
      if (this.turnIdx >= this.order.length || this.round === 0) {
        this.turnIdx = this.turnIdx >= this.order.length ? 0 : this.turnIdx;
        this.round++;
        if (this.round > this.maxRounds) {
          this.round = this.maxRounds;
          this.finish(now, 'cap');
          return;
        }
        this.emit({ type: 'round', round: this.round, last: this.round === this.maxRounds });
      }
      const id = this.order[this.turnIdx]!;
      const p = this.players.get(id)!;
      if (!p.connected) continue;
      if (p.skip) {
        p.skip = false;
        this.current = id;
        this.phase = 'skip';
        this.until = now + SKIP_MS;
        this.emit({ type: 'skip', playerId: id });
        return;
      }
      this.beginTurn(id, now, false);
      return;
    }
    this.phase = 'waiting';
    this.current = null;
    this.emit({ type: 'waiting' });
  }

  private beginTurn(id: number, now: number, extra: boolean): void {
    this.current = id;
    this.phase = 'roll';
    this.deadline = now + ROLL_MS;
    this.until = this.deadline;
    this.plan = null;
    this.card = null;
    this.duel = null;
    this.emit({ type: 'turn', playerId: id, extra });
  }

  private doRoll(now: number, auto: boolean): void {
    const id = this.current!;
    const p = this.players.get(id)!;
    const dice = 1 + Math.floor(this.rng() * 6);
    p.stats.rolls++;
    if (dice === 6) p.stats.sixes++;
    this.startMove(id, dice, 'dice', now, auto);
  }

  /* ---------------------------------------------------------------- moves */

  /** Plan a move of `steps` squares (negative = backwards) and apply it to the player's square. */
  planMove(id: number, steps: number, kind: MoveKind, now: number): MovePlan {
    const p = this.players.get(id)!;
    const from = p.pos;
    const path: number[] = [];
    let at = from;
    let dir = steps >= 0 ? 1 : -1;
    let bounced = false;
    for (let k = 0; k < Math.abs(steps); k++) {
      if (dir > 0 && at === this.last) {
        dir = -1;
        bounced = true;
      }
      if (dir < 0 && at === 1) break;
      at += dir;
      path.push(at);
    }
    const landed = at;
    let jump = this.board.jumpAt.get(landed) ?? null;
    let blocked: Jump | null = null;
    if (jump?.kind === 'snake' && p.shield) {
      p.shield = false;
      p.stats.blocked++;
      blocked = jump;
      jump = null;
    }
    const to = jump ? jump.to : landed;
    if (jump?.kind === 'ladder') {
      p.stats.ladders++;
      p.stats.climbed += jump.to - jump.from;
    } else if (jump?.kind === 'snake') {
      p.stats.snakes++;
      p.stats.fell += jump.from - jump.to;
    }
    p.pos = to;
    const lead = kind === 'dice' ? DICE_MS : 260;
    const hopStart = now + lead;
    const hopsEnd = hopStart + path.length * HOP_MS;
    const jumpStart = hopsEnd + (jump || blocked ? LAND_MS : 0);
    const end = jumpStart + (jump ? jumpMs(this.board, jump) : 0) + LAND_MS;
    return {
      id: ++this.planSeq,
      playerId: id,
      kind,
      from,
      dice: kind === 'dice' ? steps : null,
      path,
      landed,
      bounced,
      jump,
      blocked,
      to,
      start: now,
      hopStart,
      jumpStart,
      end,
    };
  }

  private startMove(id: number, steps: number, kind: MoveKind, now: number, auto = false): void {
    const plan = this.planMove(id, steps, kind, now);
    this.plan = plan;
    this.phase = 'move';
    this.until = plan.end;
    this.emit({ type: 'move', plan, auto });
  }

  private afterMove(now: number): void {
    const plan = this.plan!;
    const mover = this.current!;
    if (plan.kind === 'duel') {
      this.endTurn(now);
      return;
    }
    const p = this.players.get(mover)!;
    if (p.pos === this.last) {
      this.winner = mover;
      this.finish(now, 'finish');
      return;
    }
    if (plan.kind === 'dice' && !plan.jump && this.board.surprises.includes(plan.landed)) {
      this.drawCard(mover, now);
      return;
    }
    this.checkDuel(now);
  }

  /* ---------------------------------------------------------------- cards */

  private drawCard(id: number, now: number): void {
    if (this.deck.length === 0) {
      this.deck = [...DECK];
      // Fisher-Yates with the game's rng: every card comes up once per deck.
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j]!, this.deck[i]!];
      }
    }
    const card = this.deck.pop()!;
    this.players.get(id)!.stats.cards++;
    this.card = { playerId: id, id: card };
    this.phase = 'card';
    this.until = now + CARD_MS;
    this.emit({ type: 'card', playerId: id, card });
  }

  private applyCard(now: number): void {
    const c = this.card!;
    const p = this.players.get(c.playerId)!;
    const fx = CARDS[c.id];
    switch (fx.kind) {
      case 'move':
        this.startMove(c.playerId, fx.steps, 'card', now);
        return;
      case 'again':
        this.extraRoll = true;
        break;
      case 'skip':
        p.skip = true;
        break;
      case 'shield':
        p.shield = true;
        break;
    }
    this.checkDuel(now);
  }

  /* ---------------------------------------------------------------- duel */

  private checkDuel(now: number): void {
    const mover = this.current!;
    const pos = this.players.get(mover)!.pos;
    if (pos <= 1 || pos >= this.last) {
      this.endTurn(now);
      return;
    }
    const other = this.order.find((id) => {
      const o = this.players.get(id)!;
      return id !== mover && o.connected && o.pos === pos;
    });
    if (other === undefined) {
      this.endTurn(now);
      return;
    }
    const start = now + DUEL_INTRO_MS;
    this.duel = {
      a: mover,
      b: other,
      square: pos,
      tapsA: 0,
      tapsB: 0,
      start,
      end: start + DUEL_MS,
      winner: null,
    };
    this.phase = 'duelIntro';
    this.until = start;
    this.emit({ type: 'duelIntro', duel: this.duel });
  }

  private endDuel(now: number): void {
    const d = this.duel!;
    d.winner = d.tapsA > d.tapsB ? d.a : d.tapsB > d.tapsA ? d.b : null;
    if (d.winner !== null) {
      const loser = d.winner === d.a ? d.b : d.a;
      this.players.get(d.winner)!.stats.duelsWon++;
      this.players.get(loser)!.stats.duelsLost++;
    }
    this.phase = 'duelResult';
    this.until = now + DUEL_RESULT_MS;
    this.emit({ type: 'duelEnd', duel: d });
  }

  private afterDuel(now: number): void {
    const d = this.duel!;
    if (d.winner === null) {
      this.endTurn(now);
      return;
    }
    const loser = d.winner === d.a ? d.b : d.a;
    this.startMove(loser, -DUEL_BACK, 'duel', now);
  }

  /* ---------------------------------------------------------------- end */

  private endTurn(now: number): void {
    this.nextTurn(now);
  }

  private finish(now: number, reason: EndReason): void {
    if (reason === 'cap') this.winner = this.leader();
    this.endReason = reason;
    this.extraRoll = false;
    this.phase = 'finale';
    this.until = now + FINALE_MS;
    this.emit({ type: 'finale', winner: this.winner, reason });
  }

  private emit(e: UlarEvent): void {
    this.events.push(e);
  }
}
