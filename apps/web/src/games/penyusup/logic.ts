/**
 * Penyusup match logic (pure, no DOM, no network). The main screen is authoritative: phones only
 * send actions (pick, ready, done, clue, vote, guess) and the driver feeds them in with the
 * synced server time. All timers run on an internal clock that stops while the match is held
 * (shell paused), so a pause never eats someone's turn.
 *
 * One session = a few rondes. Each ronde deals a new pair: the majority (warga) gets one word,
 * the impostors (penyusup) the other, optionally one Si Kosong gets no word at all. Players give
 * one-word clues in turn (spoken aloud, or typed in Ketik mode), then vote on their phones. The
 * most-voted player is out and their card is revealed. A caught Si Kosong may guess the warga's
 * word to steal the ronde. The final ronde scores double.
 */
import { type Lang, normalizeWord, PAIRS, pairKey, type WordPair } from './words';

export type Mode = 'lisan' | 'ketik';
export type Role = 'warga' | 'penyusup' | 'kosong';
export type Side = 'warga' | 'beda' | 'kosong';
export type Phase =
  | 'setup'
  | 'deal'
  | 'clue'
  | 'vote'
  | 'tally'
  | 'reveal'
  | 'guess'
  | 'roundEnd'
  | 'final'
  | 'ended';
export type SetupStep = 'lang' | 'mode' | 'kosong';

export const TIMING = {
  /** Longest wait for everyone to look at their card. */
  dealMs: 20_000,
  /** Shortest deal, so nobody skips past the card by accident. */
  dealMinMs: 3_000,
  clueMs: 20_000,
  /** A spoken turn cannot be ended before this (protects against a double tap). */
  clueMinMs: 1_500,
  /** How long a typed clue stays highlighted before the next turn. */
  clueShowMs: 1_400,
  voteMs: 25_000,
  tallyMs: 4_500,
  revealMs: 6_500,
  guessMs: 10_000,
  /** Late guesses still count this long after the clock (network). */
  guessGraceMs: 800,
  guessShowMs: 3_500,
  roundEndMs: 9_000,
  finalMs: 4_500,
} as const;

/** Votes per ronde before the impostors are declared to have slipped away. */
export const MAX_VOTES = 3;
export const MIN_PLAYERS = 3;
/** Si Kosong only joins from this many players (with fewer the impostors would be too many). */
export const KOSONG_MIN = 5;
export const CLUE_MAX = 16;

export const POINTS = {
  wargaWin: 2,
  wargaAlive: 1,
  bedaWin: 4,
  bedaAlive: 1,
  kosongSteal: 6,
  correctVote: 1,
} as const;

export interface Stats {
  correctVotes: number;
  votesAsWarga: number;
  votesReceived: number;
  survivedAsBeda: number;
  timesBeda: number;
  steals: number;
  wins: number;
  clues: number;
  /** Total ms spent on spoken/typed turns, for the quickest-clue award. */
  clueMs: number;
  timesOut: number;
}

export interface Seat {
  id: number;
  joinIndex: number;
  present: boolean;
  /** Dealt into the current ronde (late joiners watch until the next deal). */
  inRound: boolean;
  role: Role;
  word: string;
  alive: boolean;
  ready: boolean;
  /** Vote of this cycle (voters) or bonus guess (players already out). */
  vote: number | null;
  locked: boolean;
  /** Clue given this cycle (Ketik mode); null = not yet. '' = stayed silent. */
  clue: string | null;
  score: number;
  /** Points won in the current ronde (shown at the ronde's end). */
  gained: number;
  stats: Stats;
}

export interface Settings {
  lang: Lang;
  mode: Mode;
  kosong: boolean;
}

export interface Tally {
  /** Votes per target, only targets with at least one vote, most first. */
  counts: { id: number; votes: number; from: number[] }[];
  /** Player voted out, or null on a tie / no votes. */
  out: number | null;
  tie: boolean;
}

export interface RoundOutcome {
  side: Side;
  /** Why the ronde ended, for the headline. */
  reason: 'caught' | 'outnumber' | 'escaped' | 'steal';
  wargaWord: string;
  bedaWord: string;
  kosongId: number | null;
}

export type PenyusupEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'turn'; id: number }
  | { type: 'clue'; id: number; text: string }
  | { type: 'timeout' }
  | { type: 'locked'; id: number }
  | { type: 'ready'; id: number }
  | { type: 'guess'; id: number; correct: boolean };

export interface MatchOptions {
  rounds: number;
  seed: number;
  now: number;
  players: readonly { id: number; connected: boolean }[];
  /** Pair keys played recently on this screen, drawn last. */
  recent?: ReadonlySet<string>;
}

const emptyStats = (): Stats => ({
  correctVotes: 0,
  votesAsWarga: 0,
  votesReceived: 0,
  survivedAsBeda: 0,
  timesBeda: 0,
  steals: 0,
  wins: 0,
  clues: 0,
  clueMs: 0,
  timesOut: 0,
});

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Impostors for a table of `n` (Si Kosong comes on top when enabled and n >= KOSONG_MIN). */
export function impostorCount(n: number): number {
  if (n >= 12) return 3;
  if (n >= 8) return 2;
  return 1;
}

/** Clue circuits before the first vote of a ronde: small tables go round twice. */
export function circuitsFor(alive: number, firstCycle: boolean): number {
  return firstCycle && alive <= 5 ? 2 : 1;
}

/** Why a typed clue is refused, or null if it is fine. */
export function clueProblem(clue: string, ownWord: string): 'empty' | 'own' | null {
  const c = normalizeWord(clue);
  if (c.length < 2) return 'empty';
  if (!ownWord) return null;
  const own = normalizeWord(ownWord);
  if (c === own || c.includes(own)) return 'own';
  for (const part of ownWord.split(' ')) {
    const p = normalizeWord(part);
    if (p.length >= 3 && c.includes(p)) return 'own';
  }
  return null;
}

export class PenyusupMatch {
  readonly rounds: number;
  phase: Phase = 'setup';
  step: SetupStep = 'lang';
  settings: Settings = { lang: 'id', mode: 'lisan', kosong: false };
  /** 0-based ronde index. */
  round = -1;
  pair: WordPair | null = null;
  wargaWord = '';
  bedaWord = '';
  /** Clue turn order of this cycle (alive players). */
  order: number[] = [];
  turn = 0;
  circuit = 0;
  circuits = 1;
  /** Votes held this ronde. */
  votes = 0;
  tally: Tally | null = null;
  outcome: RoundOutcome | null = null;
  guessed: { text: string; correct: boolean } | null = null;
  /** Ketik mode: the clue just shown, highlighted until the next turn. */
  lastClue: { id: number; text: string } | null = null;
  held = false;
  /** Clues typed this ronde, in order, for the main screen's wall. */
  clueWall: { id: number; text: string; cycle: number }[] = [];
  /** Played pairs (keys), for the screen's recent memory. */
  readonly played: string[] = [];

  private readonly seats = new Map<number, Seat>();
  private joinCounter = 0;
  private readonly rnd: () => number;
  private readonly recent: ReadonlySet<string>;
  private readonly used = new Set<string>();
  private t = 0;
  private last: number;
  private deadline = 0;
  private phaseStart = 0;
  private turnStart = 0;
  private startIndex = 0;
  private events: PenyusupEvent[] = [];

  constructor(opts: MatchOptions) {
    this.rounds = Math.max(1, Math.min(5, Math.floor(opts.rounds)));
    this.rnd = mulberry(opts.seed);
    this.recent = opts.recent ?? new Set();
    this.last = opts.now;
    this.syncPlayers(opts.players, opts.now);
  }

  /* ------------------------------------------------------------------ queries */

  get roster(): Seat[] {
    return [...this.seats.values()].sort((a, b) => a.joinIndex - b.joinIndex);
  }

  seat(id: number): Seat | undefined {
    return this.seats.get(id);
  }

  /** Players dealt into this ronde. */
  get table(): Seat[] {
    return this.roster.filter((s) => s.inRound);
  }

  get alive(): Seat[] {
    return this.table.filter((s) => s.alive);
  }

  get isFinal(): boolean {
    return this.round === this.rounds - 1;
  }

  get multiplier(): number {
    return this.isFinal ? 2 : 1;
  }

  get speaker(): number | null {
    return this.phase === 'clue' ? (this.order[this.turn] ?? null) : null;
  }

  /** Who gives clues after the current speaker, this circuit. */
  get upcoming(): number[] {
    return this.phase === 'clue' ? this.order.slice(this.turn + 1) : [];
  }

  get spoken(): number[] {
    return this.phase === 'clue' ? this.order.slice(0, this.turn) : [];
  }

  /** Can Si Kosong be switched on for this many present players? */
  kosongAllowed(): boolean {
    return this.roster.filter((s) => s.present).length >= KOSONG_MIN;
  }

  /** ms left on the current clock (0 when none runs). */
  msLeft(): number {
    return this.deadline > 0 ? Math.max(0, this.deadline - this.t) : 0;
  }

  /** The current clock's full length, for rings. */
  phaseLength(): number {
    switch (this.phase) {
      case 'deal':
        return TIMING.dealMs;
      case 'clue':
        return TIMING.clueMs;
      case 'vote':
        return TIMING.voteMs;
      case 'guess':
        return TIMING.guessMs;
      default:
        return 0;
    }
  }

  /** Server time the current clock ends, for phone timers. */
  deadlineAt(now: number): number | undefined {
    if (this.deadline <= 0 || this.held) return undefined;
    if (this.phase === 'clue' && this.lastClue) return undefined;
    if (this.phase === 'guess' && this.guessed) return undefined;
    // Rounded so the same deadline gives the same view every frame (views are deduplicated).
    return Math.round((now + (this.deadline - this.t)) / 250) * 250;
  }

  /** Voters this cycle (alive and present). */
  get voters(): Seat[] {
    return this.alive.filter((s) => s.present);
  }

  get votersLeft(): Seat[] {
    return this.voters.filter((s) => !s.locked);
  }

  /** Ranked standings (ties share a rank). */
  standings(): { seat: Seat; rank: number }[] {
    const rows = this.roster.slice().sort((a, b) => b.score - a.score || a.joinIndex - b.joinIndex);
    let rank = 0;
    let prev = Number.NaN;
    return rows.map((seat, i) => {
      if (seat.score !== prev) rank = i + 1;
      prev = seat.score;
      return { seat, rank };
    });
  }

  /* ------------------------------------------------------------------ roster */

  syncPlayers(players: readonly { id: number; connected: boolean }[], now: number): void {
    this.advance(now);
    const ids = new Set(players.map((p) => p.id));
    for (const p of players) {
      let s = this.seats.get(p.id);
      if (!s) {
        s = {
          id: p.id,
          joinIndex: this.joinCounter++,
          present: p.connected,
          inRound: false,
          role: 'warga',
          word: '',
          alive: false,
          ready: false,
          vote: null,
          locked: false,
          clue: null,
          score: 0,
          gained: 0,
          stats: emptyStats(),
        };
        this.seats.set(p.id, s);
      }
      s.present = p.connected;
    }
    for (const s of this.seats.values()) if (!ids.has(s.id)) s.present = false;
    if (this.settings.kosong && !this.kosongAllowed() && this.phase === 'setup') this.settings.kosong = false;
    this.checkProgress();
  }

  setHeld(held: boolean, now: number): void {
    this.advance(now);
    this.held = held;
  }

  /* ------------------------------------------------------------------ setup (Host) */

  /** The Host tapped an option of the current setup menu. */
  pick(value: string): boolean {
    if (this.phase !== 'setup') return false;
    switch (this.step) {
      case 'lang':
        if (value !== 'id' && value !== 'en') return false;
        this.settings.lang = value;
        return true;
      case 'mode':
        if (value !== 'lisan' && value !== 'ketik') return false;
        this.settings.mode = value;
        return true;
      case 'kosong':
        if (value !== 'on' && value !== 'off') return false;
        if (value === 'on' && !this.kosongAllowed()) return false;
        this.settings.kosong = value === 'on';
        return true;
    }
  }

  next(now: number): PenyusupEvent[] {
    if (this.phase !== 'setup') return [];
    if (this.step === 'lang') this.step = 'mode';
    else if (this.step === 'mode') this.step = 'kosong';
    else return this.start(now);
    return [{ type: 'phase', phase: 'setup' }];
  }

  back(): boolean {
    if (this.phase !== 'setup') return false;
    if (this.step === 'kosong') this.step = 'mode';
    else if (this.step === 'mode') this.step = 'lang';
    else return false;
    return true;
  }

  start(now: number): PenyusupEvent[] {
    if (this.phase !== 'setup') return [];
    this.advance(now);
    if (this.roster.filter((s) => s.present).length < MIN_PLAYERS) return [];
    if (!this.kosongAllowed()) this.settings.kosong = false;
    this.deal();
    return this.flush();
  }

  /* ------------------------------------------------------------------ phone actions */

  ready(id: number, now: number): PenyusupEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    if (this.phase !== 'deal' || !s?.inRound || s.ready) return [];
    s.ready = true;
    this.events.push({ type: 'ready', id });
    this.checkProgress();
    return this.flush();
  }

  /** Spoken mode: the speaker says they are done. */
  done(id: number, now: number): PenyusupEvent[] {
    this.advance(now);
    if (this.phase !== 'clue' || this.settings.mode !== 'lisan' || this.speaker !== id) return [];
    if (this.t - this.turnStart < TIMING.clueMinMs) return [];
    this.endTurn(false);
    return this.flush();
  }

  /** Ketik mode: a typed clue. Returns the refusal reason, or the events when accepted. */
  clue(id: number, text: string, now: number): { events: PenyusupEvent[]; problem: 'empty' | 'own' | null } {
    this.advance(now);
    if (this.phase !== 'clue' || this.settings.mode !== 'ketik' || this.speaker !== id || this.lastClue) {
      return { events: [], problem: null };
    }
    const s = this.seats.get(id);
    if (!s) return { events: [], problem: null };
    const clean = text
      .replace(/[^A-Za-z ]/g, '')
      .trim()
      .slice(0, CLUE_MAX)
      .toUpperCase();
    const problem = clueProblem(clean, s.word);
    if (problem) return { events: [], problem };
    this.recordClue(s, clean);
    return { events: this.flush(), problem: null };
  }

  vote(id: number, target: number, now: number): PenyusupEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    const tgt = this.seats.get(target);
    if (this.phase !== 'vote' || !s?.inRound || s.locked || !tgt?.inRound || !tgt.alive || target === id)
      return [];
    s.vote = target;
    return [];
  }

  /** Lock in the vote picked with `vote` (or a bonus guess for players already out). */
  lock(id: number, now: number): PenyusupEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    if (this.phase !== 'vote' || !s?.inRound || s.locked || s.vote === null) return [];
    s.locked = true;
    this.events.push({ type: 'locked', id });
    this.checkProgress();
    return this.flush();
  }

  guess(id: number, text: string, now: number): PenyusupEvent[] {
    this.advance(now);
    if (this.phase !== 'guess' || this.guessed || this.tally?.out !== id) return [];
    if (this.t > this.deadline + TIMING.guessGraceMs) return [];
    const correct = normalizeWord(text) === normalizeWord(this.wargaWord) && normalizeWord(text).length > 0;
    this.resolveGuess(id, text.trim().slice(0, CLUE_MAX).toUpperCase(), correct);
    return this.flush();
  }

  /* ------------------------------------------------------------------ clock */

  tick(now: number): PenyusupEvent[] {
    this.advance(now);
    if (this.held || this.deadline <= 0 || this.t < this.deadline) return this.flush();
    switch (this.phase) {
      case 'deal':
        this.startCycle();
        break;
      case 'clue':
        if (this.lastClue) this.nextTurn();
        else this.endTurn(true);
        break;
      case 'vote':
        this.closeVote();
        break;
      case 'tally':
        this.afterTally();
        break;
      case 'reveal':
        this.afterReveal();
        break;
      case 'guess':
        if (this.guessed)
          this.endRound(this.guessed.correct ? 'kosong' : this.sideAfterOut(), this.reasonAfterOut());
        else if (this.t >= this.deadline + TIMING.guessGraceMs) {
          const id = this.tally?.out ?? 0;
          this.resolveGuess(id, '', false);
        }
        break;
      case 'roundEnd':
        if (this.round + 1 >= this.rounds) this.enter('final', TIMING.finalMs);
        else this.deal();
        break;
      case 'final':
        this.deadline = 0;
        this.enter('ended', 0);
        break;
      default:
        break;
    }
    return this.flush();
  }

  /* ------------------------------------------------------------------ flow */

  private advance(now: number): void {
    const dt = Math.max(0, Math.min(1_000, now - this.last));
    this.last = now;
    if (!this.held) this.t += dt;
  }

  private flush(): PenyusupEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private enter(phase: Phase, ms: number): void {
    this.phase = phase;
    this.phaseStart = this.t;
    this.deadline = ms > 0 ? this.t + ms : 0;
    this.events.push({ type: 'phase', phase });
  }

  private drawPair(): WordPair {
    const lang = this.settings.lang;
    const all = PAIRS[lang];
    const wantEasy = this.round === 0;
    const fresh = (p: WordPair) => !this.used.has(pairKey(lang, p));
    const tiers = [
      all.filter((p) => fresh(p) && p.easy === wantEasy && !this.recent.has(pairKey(lang, p))),
      all.filter((p) => fresh(p) && !this.recent.has(pairKey(lang, p))),
      all.filter(fresh),
      all.slice(),
    ];
    const pool = tiers.find((t) => t.length > 0) ?? all.slice();
    const pair = pool[Math.floor(this.rnd() * pool.length)] ?? all[0]!;
    const key = pairKey(lang, pair);
    this.used.add(key);
    this.played.push(key);
    return pair;
  }

  private deal(): void {
    this.round++;
    this.pair = this.drawPair();
    const flip = this.rnd() < 0.5;
    this.wargaWord = flip ? this.pair.b : this.pair.a;
    this.bedaWord = flip ? this.pair.a : this.pair.b;
    this.votes = 0;
    this.tally = null;
    this.outcome = null;
    this.guessed = null;
    this.lastClue = null;
    this.clueWall = [];
    const seated = shuffle(
      this.roster.filter((s) => s.present),
      this.rnd,
    );
    for (const s of this.seats.values()) {
      s.inRound = false;
      s.alive = false;
      s.gained = 0;
      s.vote = null;
      s.locked = false;
      s.clue = null;
      s.ready = false;
    }
    const n = seated.length;
    const imps = impostorCount(n);
    const withKosong = this.settings.kosong && n >= KOSONG_MIN;
    seated.forEach((s, i) => {
      s.inRound = true;
      s.alive = true;
      if (i < imps) {
        s.role = 'penyusup';
        s.word = this.bedaWord;
      } else if (withKosong && i === imps) {
        s.role = 'kosong';
        s.word = '';
      } else {
        s.role = 'warga';
        s.word = this.wargaWord;
      }
      if (s.role !== 'warga') s.stats.timesBeda++;
    });
    this.startIndex = Math.floor(this.rnd() * Math.max(1, n));
    this.enter('deal', TIMING.dealMs);
  }

  private startCycle(): void {
    const alive = this.table.filter((s) => s.alive).sort((a, b) => a.joinIndex - b.joinIndex);
    const n = alive.length;
    const order: number[] = [];
    for (let i = 0; i < n; i++) order.push(alive[(this.startIndex + i) % n]!.id);
    // Si Kosong never opens a ronde: with no word, going first would give them away.
    if (this.votes === 0 && order.length > 1 && this.seats.get(order[0]!)?.role === 'kosong') {
      order.push(order.shift()!);
    }
    this.startIndex = (this.startIndex + 1) % Math.max(1, n);
    this.order = order;
    this.circuit = 0;
    this.circuits = circuitsFor(n, this.votes === 0);
    for (const s of this.seats.values()) s.clue = null;
    this.turn = -1;
    this.phase = 'clue';
    this.phaseStart = this.t;
    this.events.push({ type: 'phase', phase: 'clue' });
    this.nextTurn();
  }

  /** Move to the next present speaker; after the last circuit, open the vote. */
  private nextTurn(): void {
    this.lastClue = null;
    for (;;) {
      this.turn++;
      if (this.turn >= this.order.length) {
        this.circuit++;
        if (this.circuit >= this.circuits) {
          this.openVote();
          return;
        }
        this.turn = 0;
        for (const s of this.seats.values()) s.clue = null;
      }
      const id = this.order[this.turn]!;
      const s = this.seats.get(id);
      if (s?.present && s.alive) break;
    }
    this.turnStart = this.t;
    this.deadline = this.t + TIMING.clueMs;
    this.events.push({ type: 'turn', id: this.order[this.turn]! });
  }

  private endTurn(timedOut: boolean): void {
    const id = this.speaker;
    const s = id !== null ? this.seats.get(id) : undefined;
    if (timedOut) this.events.push({ type: 'timeout' });
    if (s) {
      s.stats.clueMs += Math.min(TIMING.clueMs, this.t - this.turnStart);
      if (!timedOut) s.stats.clues++;
    }
    if (this.settings.mode === 'ketik' && s && timedOut) {
      this.recordClue(s, '');
      return;
    }
    this.nextTurn();
  }

  private recordClue(s: Seat, text: string): void {
    s.clue = text;
    if (text) {
      s.stats.clues++;
      s.stats.clueMs += Math.min(TIMING.clueMs, this.t - this.turnStart);
    }
    this.lastClue = { id: s.id, text };
    this.clueWall.push({ id: s.id, text, cycle: this.votes });
    this.events.push({ type: 'clue', id: s.id, text });
    this.deadline = this.t + TIMING.clueShowMs;
  }

  private openVote(): void {
    for (const s of this.seats.values()) {
      s.vote = null;
      s.locked = false;
    }
    this.enter('vote', TIMING.voteMs);
  }

  private closeVote(): void {
    this.votes++;
    const counts = new Map<number, number[]>();
    for (const s of this.table) {
      if (!s.alive || !s.locked || s.vote === null) continue;
      const target = this.seats.get(s.vote);
      if (!target?.alive) continue;
      const list = counts.get(s.vote) ?? [];
      list.push(s.id);
      counts.set(s.vote, list);
    }
    const rows = [...counts.entries()]
      .map(([id, from]) => ({ id, votes: from.length, from }))
      .sort(
        (a, b) =>
          b.votes - a.votes ||
          (this.seats.get(a.id)?.joinIndex ?? 0) - (this.seats.get(b.id)?.joinIndex ?? 0),
      );
    const top = rows[0];
    const tie = rows.length > 1 && rows[1]!.votes === top?.votes;
    const out = top && !tie ? top.id : null;
    this.tally = { counts: rows, out, tie };
    const mult = this.multiplier;
    // Every locked vote or bonus guess on a non-warga scores, caught or not.
    for (const s of this.table) {
      if (!s.locked || s.vote === null) continue;
      const target = this.seats.get(s.vote);
      if (!target) continue;
      if (s.alive) {
        target.stats.votesReceived++;
        if (target.role === 'warga') target.stats.votesAsWarga++;
      }
      if (target.role !== 'warga') {
        s.stats.correctVotes++;
        this.award(s, POINTS.correctVote * mult);
      }
    }
    this.enter('tally', TIMING.tallyMs);
  }

  private afterTally(): void {
    const out = this.tally?.out ?? null;
    if (out === null) {
      if (this.votes >= MAX_VOTES) this.endRound('beda', 'escaped');
      else this.startCycle();
      return;
    }
    const s = this.seats.get(out);
    if (s) {
      s.alive = false;
      s.stats.timesOut++;
    }
    this.enter('reveal', TIMING.revealMs);
  }

  private afterReveal(): void {
    const out = this.tally?.out ?? null;
    const s = out !== null ? this.seats.get(out) : undefined;
    if (s?.role === 'kosong') {
      this.guessed = null;
      if (s.present) {
        this.enter('guess', TIMING.guessMs);
        return;
      }
      this.resolveGuessSilently(s);
    }
    const side = this.sideAfterOut();
    if (side) this.endRound(side, this.reasonAfterOut());
    else if (this.votes >= MAX_VOTES) this.endRound('beda', 'escaped');
    else this.startCycle();
  }

  private resolveGuessSilently(s: Seat): void {
    this.guessed = { text: '', correct: false };
    this.events.push({ type: 'guess', id: s.id, correct: false });
  }

  private resolveGuess(id: number, text: string, correct: boolean): void {
    this.guessed = { text, correct };
    this.events.push({ type: 'guess', id, correct });
    this.deadline = this.t + TIMING.guessShowMs;
  }

  /** Winner after an elimination, or null when the ronde goes on. */
  private sideAfterOut(): Side | null {
    const alive = this.alive;
    const beda = alive.filter((s) => s.role !== 'warga').length;
    const warga = alive.length - beda;
    if (beda === 0) return 'warga';
    if (beda >= warga) return 'beda';
    if (this.votes >= MAX_VOTES) return 'beda';
    return null;
  }

  private reasonAfterOut(): RoundOutcome['reason'] {
    const alive = this.alive;
    const beda = alive.filter((s) => s.role !== 'warga').length;
    if (beda === 0) return 'caught';
    return beda >= alive.length - beda ? 'outnumber' : 'escaped';
  }

  private endRound(side: Side | null, reason: RoundOutcome['reason']): void {
    if (side === null) {
      // The guess failed and the ronde is not decided yet: play on.
      if (this.votes >= MAX_VOTES) this.endRound('beda', 'escaped');
      else this.startCycle();
      return;
    }
    const kosong = this.table.find((s) => s.role === 'kosong');
    this.outcome = {
      side,
      reason: side === 'kosong' ? 'steal' : reason,
      wargaWord: this.wargaWord,
      bedaWord: this.bedaWord,
      kosongId: kosong?.id ?? null,
    };
    const mult = this.multiplier;
    for (const s of this.table) {
      if (s.role !== 'warga' && s.alive) s.stats.survivedAsBeda++;
      if (side === 'kosong') {
        if (s.role === 'kosong') {
          this.award(s, POINTS.kosongSteal * mult);
          s.stats.steals++;
          s.stats.wins++;
        }
      } else if (side === 'warga' && s.role === 'warga') {
        this.award(s, (POINTS.wargaWin + (s.alive ? POINTS.wargaAlive : 0)) * mult);
        s.stats.wins++;
      } else if (side === 'beda' && s.role !== 'warga') {
        this.award(s, (POINTS.bedaWin + (s.alive ? POINTS.bedaAlive : 0)) * mult);
        s.stats.wins++;
      }
    }
    this.enter('roundEnd', TIMING.roundEndMs);
  }

  private award(s: Seat, pts: number): void {
    s.score += pts;
    s.gained += pts;
  }

  /** Early exits when everyone needed has acted, and skipping players who left. */
  private checkProgress(): void {
    if (this.held) return;
    if (this.phase === 'deal') {
      const waiting = this.table.filter((s) => s.present && !s.ready);
      if (waiting.length === 0 && this.t - this.phaseStart >= TIMING.dealMinMs) this.deadline = this.t;
      else if (waiting.length === 0) this.deadline = this.phaseStart + TIMING.dealMinMs;
    } else if (this.phase === 'clue' && !this.lastClue) {
      const id = this.speaker;
      if (id !== null && !this.seats.get(id)?.present) this.deadline = this.t;
    } else if (this.phase === 'vote') {
      if (this.voters.length > 0 && this.votersLeft.length === 0) this.deadline = this.t;
    } else if (this.phase === 'guess' && !this.guessed) {
      const id = this.tally?.out;
      if (id !== undefined && id !== null && !this.seats.get(id)?.present)
        this.deadline = this.t - TIMING.guessGraceMs;
    }
  }
}

/** The seat's role this ronde, or null when it was not dealt in. */
export function roleOf(seat: Seat | undefined): Role | null {
  return seat?.inRound ? seat.role : null;
}
