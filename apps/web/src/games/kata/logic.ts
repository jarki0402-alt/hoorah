/**
 * Sambung Kata rules, pure and deterministic (seeded). Time is game time in ms (the driver's
 * pausable clock), so pausing freezes every timer. The driver feeds `tick`, `submit` and
 * `setPresence`, then drains the queued events for sound, views and the screen.
 *
 * Rules:
 *  - Seats take turns in order. The word must start with the dealt start (the last syllable of the
 *    previous word), have at least 3 letters, be in the word list and not have been used before.
 *  - A wrong word or running out of time costs a life; the turn then passes to the next player with
 *    a fresh start that has plenty of answers. At 0 lives a player is out (and watches).
 *  - If the start left by a word has fewer than MIN_CHAIN_OPTIONS free words, the next player gets
 *    a fresh start instead (no dead ends).
 *  - Turn time starts at 15 s and drops 1 s every full round, down to 7 s.
 *  - Last player standing wins. When computer players are seated (solo play) and no human is left,
 *    the game ends right away and the best computer player takes it.
 */
import type { Lexicon } from './lexicon';
import { lastSyllable } from './syllables';
import { MAX_WORD, MIN_WORD } from './words';

export const TIMING = {
  introMs: 7000,
  acceptMs: 1700,
  refuseMs: 2400,
  finalMs: 4200,
  /** Answers arriving this long after the deadline still count (relay latency). */
  graceMs: 400,
  turnStartMs: 15_000,
  turnMinMs: 7000,
  turnStepMs: 1000,
} as const;

/** A start with fewer free words than this is a dead end: the player gets a fresh start. */
export const MIN_CHAIN_OPTIONS = 3;
/** Fresh starts are dealt from syllables with at least this many free words. */
export const FRESH_MIN_WORDS = 20;
/** Safety net: the game ends after this many turns even if several players are still in. */
export const MAX_TURNS = 400;
/** Lives per player are clamped to this range. */
export const LIVES_MIN = 1;
export const LIVES_MAX = 5;

export type Phase = 'intro' | 'turn' | 'verdict' | 'final' | 'ended';
export type Reason = 'timeout' | 'start' | 'short' | 'used' | 'unknown';
/** Where the current start came from. */
export type StartKind = 'first' | 'chain' | 'fresh' | 'stuck';

export interface SeatState {
  id: number;
  index: number;
  lives: number;
  /** Still in the room (a dropped phone is present but not connected). */
  present: boolean;
  connected: boolean;
  /** Order of elimination, 1 = first out; 0 while still in. */
  outRank: number;
  words: number;
  longest: string;
  fastestMs: number | null;
  fastestWord: string;
  misses: number;
}

export interface ChainLink {
  word: string;
  by: number;
  /** Letters at the start that were the dealt start. */
  join: number;
  /** Letters at the end (its last syllable) the next word continues from. */
  tail: number;
  ms: number;
  turn: number;
  /** The start was dealt fresh (first word, after a mistake or a dead end). */
  fresh: boolean;
}

export interface Attempt {
  by: number;
  /** Normalised word; empty on a timeout. */
  word: string;
  /** The start that was dealt for this answer. */
  prefix: string;
  ok: boolean;
  reason: Reason | null;
  ms: number;
  livesLeft: number;
  out: boolean;
  turn: number;
}

export interface NextTurn {
  index: number;
  prefix: string;
  kind: StartKind;
  /** The start that had no answers left (kind 'stuck'). */
  stuckFrom: string | null;
}

export type KataEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'turn'; id: number; prefix: string; kind: StartKind; round: number; newRound: boolean }
  | { type: 'accepted'; attempt: Attempt; link: ChainLink }
  | { type: 'refused'; attempt: Attempt }
  | { type: 'out'; id: number; left: boolean }
  | { type: 'cue'; secondsLeft: number };

export interface Presence {
  id: number;
  connected: boolean;
}

export interface KataOptions {
  /** Seats in turn order (humans in join order, then computer players). */
  seats: readonly Presence[];
  lives: number;
  lexicon: Lexicon;
  seed: number;
  now: number;
  /** Ids of computer players (solo play). */
  computers?: ReadonlySet<number>;
}

export function clampLives(raw: unknown, fallback = 3): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LIVES_MAX, Math.max(LIVES_MIN, Math.floor(n)));
}

/** Turn length for a 1-based round. */
export function turnMsFor(round: number): number {
  const r = Math.max(1, Math.floor(round));
  return Math.max(TIMING.turnMinMs, TIMING.turnStartMs - (r - 1) * TIMING.turnStepMs);
}

/** Lowercase, trimmed, capped; anything outside a-z makes the word unknown later. */
export function normalizeWord(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .slice(0, MAX_WORD + 8);
}

/** Small seeded PRNG (mulberry32). */
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

const LETTERS_ONLY = /^[a-z]+$/;

export class KataMatch {
  phase: Phase = 'intro';
  phaseStart: number;
  readonly lives: number;
  readonly seats: SeatState[];
  readonly chain: ChainLink[] = [];
  readonly used = new Set<string>();
  readonly lexicon: Lexicon;
  readonly computers: ReadonlySet<number>;
  /** Goes up on every new turn (the phones clear their input when it changes). */
  turnNo = 0;
  /** 1-based once the first turn starts. */
  round = 0;
  /** Seat index whose turn it is (or was, during the verdict). */
  current = -1;
  prefix = '';
  startKind: StartKind = 'first';
  stuckFrom: string | null = null;
  turnStart = 0;
  turnMs: number = TIMING.turnStartMs;
  /** The answer being shown during the verdict. */
  attempt: Attempt | null = null;
  /** The last refused answer, kept for the phone of the player who gave it. */
  lastMiss: Attempt | null = null;
  /** Who plays next and from which start (known during the verdict). */
  next: NextTurn | null = null;
  winner: number | null = null;
  private over = false;
  private played = new Set<number>();
  private events: KataEvent[] = [];
  private cueSent = 0;
  private outCount = 0;
  private recentFresh: string[] = [];
  private readonly rnd: () => number;
  private readonly firstIndex: number;

  constructor(opts: KataOptions) {
    this.lexicon = opts.lexicon;
    this.lives = clampLives(opts.lives);
    this.computers = opts.computers ?? new Set();
    this.rnd = makeRng(opts.seed);
    this.phaseStart = opts.now;
    this.seats = opts.seats.map((p, index) => ({
      id: p.id,
      index,
      lives: this.lives,
      present: true,
      connected: p.connected,
      outRank: 0,
      words: 0,
      longest: '',
      fastestMs: null,
      fastestWord: '',
      misses: 0,
    }));
    this.firstIndex = this.seats.length ? Math.floor(this.rnd() * this.seats.length) : 0;
  }

  /* ---------------------------------------------------------------- queries */

  get deadline(): number {
    return this.turnStart + this.turnMs;
  }

  get currentSeat(): SeatState | undefined {
    return this.seats[this.current];
  }

  seatOf(id: number): SeatState | undefined {
    return this.seats.find((s) => s.id === id);
  }

  isAlive(s: SeatState): boolean {
    return s.lives > 0 && s.present;
  }

  get alive(): SeatState[] {
    return this.seats.filter((s) => this.isAlive(s));
  }

  isComputer(id: number): boolean {
    return this.computers.has(id);
  }

  /** Free words for the current start (computer players and the "dead end" rule use this). */
  freeWords(prefix = this.prefix): string[] {
    return this.lexicon.freeWithPrefix(prefix, this.used);
  }

  /** Events since the last drain. */
  drain(): KataEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ---------------------------------------------------------------- input */

  tick(now: number): void {
    switch (this.phase) {
      case 'intro':
        if (now >= this.phaseStart + TIMING.introMs) this.openFirstTurn(now);
        break;
      case 'turn': {
        const secs = Math.ceil((this.deadline - now) / 1000);
        if (secs >= 1 && secs <= 3 && secs !== this.cueSent) {
          this.cueSent = secs;
          this.emit({ type: 'cue', secondsLeft: secs });
        }
        if (now >= this.deadline + TIMING.graceMs) this.miss('timeout', '', now, this.turnMs);
        break;
      }
      case 'verdict': {
        const hold = this.attempt?.ok ? TIMING.acceptMs : TIMING.refuseMs;
        if (now >= this.phaseStart + hold) this.advance(now);
        break;
      }
      case 'final':
        if (now >= this.phaseStart + TIMING.finalMs) this.setPhase('ended', now);
        break;
      case 'ended':
        break;
    }
  }

  /**
   * A word from a player (or a computer seat). Returns false when it is ignored: not this player's
   * turn, not the turn phase, or too late. `atGame` is when it was sent, in game time, if known.
   */
  submit(id: number, raw: unknown, now: number, atGame?: number): boolean {
    if (this.phase !== 'turn') return false;
    const seat = this.currentSeat;
    if (!seat || seat.id !== id) return false;
    if (now > this.deadline + TIMING.graceMs) return false;
    const word = normalizeWord(raw);
    const sent = atGame !== undefined && Number.isFinite(atGame) ? Math.min(atGame, now) : now;
    const ms = Math.max(0, Math.min(sent, now) - this.turnStart);
    const reason = this.judge(word);
    if (reason) this.miss(reason, word, now, ms);
    else this.accept(word, now, ms);
    return true;
  }

  /** Why `word` is refused for the current start, or null when it is good. */
  judge(word: string): Reason | null {
    if (!LETTERS_ONLY.test(word)) return word.length < MIN_WORD ? 'short' : 'unknown';
    if (!word.startsWith(this.prefix)) return 'start';
    if (word.length < MIN_WORD) return 'short';
    if (this.used.has(word)) return 'used';
    if (!this.lexicon.has(word)) return 'unknown';
    return null;
  }

  /** Roster changes from the room. Seats whose player left the room are out. */
  setPresence(list: readonly Presence[], now: number): void {
    const byId = new Map(list.map((p) => [p.id, p]));
    for (const s of this.seats) {
      if (this.isComputer(s.id)) continue;
      const p = byId.get(s.id);
      s.connected = p?.connected ?? false;
      if (p || !s.present) continue;
      s.present = false;
      if (s.lives > 0 && !this.over) {
        s.lives = 0;
        s.outRank = ++this.outCount;
        this.emit({ type: 'out', id: s.id, left: true });
        this.onLeft(s, now);
      }
    }
  }

  /* ---------------------------------------------------------------- turns */

  private openFirstTurn(now: number): void {
    if (this.checkEnd()) {
      this.setPhase('final', now);
      return;
    }
    const first = this.seats[this.firstIndex];
    const index = first && this.isAlive(first) ? first.index : this.nextAlive(this.firstIndex);
    this.beginTurn({ index, prefix: this.freshStart(), kind: 'first', stuckFrom: null }, now);
  }

  private beginTurn(next: NextTurn, now: number): void {
    const seat = this.seats[next.index];
    const index = seat && this.isAlive(seat) ? next.index : this.nextAlive(next.index);
    this.turnNo++;
    let newRound = false;
    if (this.round === 0 || this.played.has(index)) {
      this.round++;
      this.played.clear();
      newRound = this.round > 1;
    }
    this.played.add(index);
    this.current = index;
    this.prefix = next.prefix;
    this.startKind = next.kind;
    this.stuckFrom = next.stuckFrom;
    this.turnMs = turnMsFor(this.round);
    this.turnStart = now;
    this.cueSent = 0;
    this.attempt = null;
    this.next = null;
    this.setPhase('turn', now);
    this.emit({
      type: 'turn',
      id: this.seats[index]!.id,
      prefix: this.prefix,
      kind: this.startKind,
      round: this.round,
      newRound,
    });
  }

  private accept(word: string, now: number, ms: number): void {
    const seat = this.currentSeat!;
    seat.words++;
    if (word.length > seat.longest.length) seat.longest = word;
    if (seat.fastestMs === null || ms < seat.fastestMs) {
      seat.fastestMs = ms;
      seat.fastestWord = word;
    }
    this.used.add(word);
    const tail = lastSyllable(word);
    const link: ChainLink = {
      word,
      by: seat.id,
      join: this.prefix.length,
      tail: tail.length,
      ms,
      turn: this.turnNo,
      fresh: this.startKind !== 'chain',
    };
    this.chain.push(link);
    this.attempt = {
      by: seat.id,
      word,
      prefix: this.prefix,
      ok: true,
      reason: null,
      ms,
      livesLeft: seat.lives,
      out: false,
      turn: this.turnNo,
    };
    if (this.turnNo >= MAX_TURNS && this.checkEnd(true)) {
      this.next = null;
    } else {
      const index = this.nextAlive(seat.index);
      const options = this.lexicon.countFree(tail, this.used);
      this.next =
        options >= MIN_CHAIN_OPTIONS
          ? { index, prefix: tail, kind: 'chain', stuckFrom: null }
          : { index, prefix: this.freshStart(), kind: 'stuck', stuckFrom: tail };
    }
    this.setPhase('verdict', now);
    this.emit({ type: 'accepted', attempt: this.attempt, link });
  }

  private miss(reason: Reason, word: string, now: number, ms: number): void {
    const seat = this.currentSeat!;
    seat.lives = Math.max(0, seat.lives - 1);
    seat.misses++;
    const out = seat.lives === 0;
    if (out) seat.outRank = ++this.outCount;
    this.attempt = {
      by: seat.id,
      word,
      prefix: this.prefix,
      ok: false,
      reason,
      ms,
      livesLeft: seat.lives,
      out,
      turn: this.turnNo,
    };
    this.lastMiss = this.attempt;
    if (out) this.emit({ type: 'out', id: seat.id, left: false });
    const ended = this.checkEnd(this.turnNo >= MAX_TURNS);
    this.next = ended
      ? null
      : { index: this.nextAlive(seat.index), prefix: this.freshStart(), kind: 'fresh', stuckFrom: null };
    this.setPhase('verdict', now);
    this.emit({ type: 'refused', attempt: this.attempt });
  }

  /** After the verdict: the next turn, or the final card. */
  private advance(now: number): void {
    if (this.over || !this.next) {
      this.checkEnd(true);
      this.setPhase('final', now);
      return;
    }
    this.beginTurn(this.next, now);
  }

  /** A player left the room: skip their turn without a penalty, keep the start. */
  private onLeft(seat: SeatState, now: number): void {
    const ended = this.checkEnd();
    if (this.phase === 'intro') {
      if (ended) this.setPhase('final', now);
      return;
    }
    if (this.phase === 'turn' && this.current === seat.index) {
      if (ended) {
        this.setPhase('final', now);
        return;
      }
      this.beginTurn(
        {
          index: this.nextAlive(seat.index),
          prefix: this.prefix,
          kind: this.startKind,
          stuckFrom: this.stuckFrom,
        },
        now,
      );
      return;
    }
    if (this.phase === 'turn' && ended) {
      this.setPhase('final', now);
      return;
    }
    if (this.phase === 'verdict' && ended) this.next = null;
  }

  /**
   * Decides whether the game is over and sets the winner. `force` ends it regardless (turn cap):
   * the best remaining player wins.
   */
  private checkEnd(force = false): boolean {
    if (this.over) return true;
    const alive = this.alive;
    const humansLeft = alive.some((s) => !this.isComputer(s.id));
    const soloLost = this.computers.size > 0 && !humansLeft;
    if (alive.length > 1 && !soloLost && !force) return false;
    this.over = true;
    this.winner = bestOf(alive)?.id ?? null;
    return true;
  }

  /** Next alive seat after `index` in turn order (or `index` itself if it is the only one). */
  private nextAlive(index: number): number {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const s = this.seats[(index + k) % n]!;
      if (this.isAlive(s)) return s.index;
    }
    return index;
  }

  /** A fresh start with plenty of free words, avoiding the last few dealt. */
  freshStart(): string {
    let pool = this.lexicon.starters(FRESH_MIN_WORDS, this.used).filter(isOpenSyllable);
    if (pool.length === 0) pool = this.lexicon.starters(MIN_CHAIN_OPTIONS, this.used);
    if (pool.length === 0) pool = ['ba'];
    const fresh = pool.filter((s) => !this.recentFresh.includes(s) && s !== this.prefix);
    const from = fresh.length ? fresh : pool;
    const pick = from[Math.floor(this.rnd() * from.length)]!;
    this.recentFresh.push(pick);
    if (this.recentFresh.length > 8) this.recentFresh.shift();
    return pick;
  }

  private setPhase(phase: Phase, now: number): void {
    this.phase = phase;
    this.phaseStart = now;
    this.emit({ type: 'phase', phase });
  }

  private emit(e: KataEvent): void {
    this.events.push(e);
  }
}

/** A consonant (or two) followed by a vowel: clean fresh starts like "ba", "ke", "pu". */
function isOpenSyllable(s: string): boolean {
  return s.length >= 2 && s.length <= 3 && /^[^aiueo]+[aiueo]$/.test(s);
}

/** Best of the remaining players: most lives, then most words, then seat order. */
function bestOf(seats: readonly SeatState[]): SeatState | undefined {
  return [...seats].sort((a, b) => b.lives - a.lives || b.words - a.words || a.index - b.index)[0];
}

export interface Standing {
  id: number;
  rank: number;
  alive: boolean;
  lives: number;
  words: number;
}

/**
 * Final order: the winner, then the other players still in (lives, then words; equal ones share a
 * rank), then everyone who went out, the last one out first.
 */
export function standings(m: KataMatch): Standing[] {
  const winner = m.winner;
  const alive = m.seats
    .filter((s) => s.outRank === 0)
    .sort(
      (a, b) =>
        Number(b.id === winner) - Number(a.id === winner) ||
        b.lives - a.lives ||
        b.words - a.words ||
        a.index - b.index,
    );
  const out = m.seats.filter((s) => s.outRank > 0).sort((a, b) => b.outRank - a.outRank);
  const rows: Standing[] = [];
  let rank = 0;
  let prev: SeatState | null = null;
  for (const s of alive) {
    const tie =
      prev !== null &&
      prev.id !== winner &&
      prev.lives === s.lives &&
      prev.words === s.words &&
      s.id !== winner;
    rank = tie ? rank : rows.length + 1;
    rows.push({ id: s.id, rank, alive: true, lives: s.lives, words: s.words });
    prev = s;
  }
  for (const s of out) rows.push({ id: s.id, rank: rows.length + 1, alive: false, lives: 0, words: s.words });
  return rows;
}
