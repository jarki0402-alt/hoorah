/**
 * Juara Eja match logic (pure, no DOM, no network). The main screen is authoritative: phones only
 * send actions (pick, start, word) and the driver feeds them in with the synced server time. All
 * timers run on an internal clock that stops while the match is held (shell paused).
 *
 * A word is read out (definition on the main screen, voice when the browser has one), everyone
 * types its spelling on their phone at the same time and the letters are revealed together.
 * Group play: a fixed number of words from Mudah through Sedang to Sulit; the Sulit words score
 * double. A wrong spelling costs a life; without lives a player keeps typing in Latihan (practice)
 * for no points. Solo: endless words until the lives run out, chasing the longest streak, and the
 * tier quietly follows how well it goes (PRD 6.4).
 */
import { type EjaWord, type Lang, normalizeWord, type Tier, WORDS, wordKey } from './words';

export type Phase = 'setup' | 'intro' | 'spell' | 'reveal' | 'final' | 'ended';
export type Verdict = 'correct' | 'near' | 'wrong' | 'none';
/** How a near miss differs from the word (exactly one edit away). */
export type NearKind = 'missing' | 'extra' | 'swap' | 'typo';

export const TIMING = {
  /** "Kata 3/10" card before typing starts (the word is read out meanwhile). */
  introMs: 2_600,
  spellMs: { 1: 25_000, 2: 30_000, 3: 35_000 } as Record<Tier, number>,
  /** Answers sent this long after the clock still count (network). */
  graceMs: 600,
  /** Letters flip one by one, then everyone's verdict shows. */
  revealMs: 5_600,
  finalMs: 5_000,
} as const;

export const LIVES = 3;
export const POINTS = { correct: 2, fastest: 1 } as const;
export const SOLO_MAX_WORDS = 60;
export const MIN_WORDS = 4;
export const MAX_WORDS = 15;
export const DEFAULT_WORDS = 10;
/** Solo: the hidden level climbs by one per correct word and drops on a miss. */
const SOLO_LEVEL_DROP = 3;

export interface Stats {
  correct: number;
  wrong: number;
  near: number;
  /** Words typed after running out of lives. */
  practice: number;
  /** Sum of answer times of correct words (ms), for the quickest award. */
  correctMs: number;
  fastest: number;
  bestStreak: number;
}

export interface Seat {
  id: number;
  joinIndex: number;
  present: boolean;
  /** Playing the current word (late joiners start with the next word). */
  inWord: boolean;
  lives: number;
  score: number;
  /** Points of the current word (shown at the reveal). */
  gained: number;
  answer: string | null;
  /** ms after the word opened. */
  answerMs: number | null;
  verdict: Verdict;
  near: NearKind | null;
  /** Answered this word without lives (Latihan). */
  practice: boolean;
  streak: number;
  /** Words spelled right, in order ("Kamus Saya"). */
  spelled: string[];
  stats: Stats;
}

export type EjaEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'locked'; id: number }
  | { type: 'out'; id: number };

export interface MatchOptions {
  /** Words in group play (ignored solo). */
  words: number;
  seed: number;
  now: number;
  players: readonly { id: number; connected: boolean }[];
  /** Word keys played recently on this screen, drawn last. */
  recent?: ReadonlySet<string>;
}

const emptyStats = (): Stats => ({
  correct: 0,
  wrong: 0,
  near: 0,
  practice: 0,
  correctMs: 0,
  fastest: 0,
  bestStreak: 0,
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

/** One edit away from the word, and which kind; null if right or further off. */
export function nearMiss(typed: string, word: string): NearKind | null {
  if (!typed || typed === word) return null;
  const a = typed;
  const b = word;
  if (a.length === b.length - 1) {
    for (let i = 0; i < b.length; i++) if (b.slice(0, i) + b.slice(i + 1) === a) return 'missing';
    return null;
  }
  if (a.length === b.length + 1) {
    for (let i = 0; i < a.length; i++) if (a.slice(0, i) + a.slice(i + 1) === b) return 'extra';
    return null;
  }
  if (a.length !== b.length) return null;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  if (diff.length === 1) return 'typo';
  if (
    diff.length === 2 &&
    diff[1] === diff[0]! + 1 &&
    a[diff[0]!] === b[diff[1]!] &&
    a[diff[1]!] === b[diff[0]!]
  )
    return 'swap';
  return null;
}

/** Group play: the tier of word `index` (0-based) out of `total`: Mudah, then Sedang, then Sulit. */
export function tierForIndex(index: number, total: number): Tier {
  const easy = Math.max(1, Math.round(total * 0.3));
  const hard = Math.max(1, Math.round(total * 0.3));
  if (index < easy) return 1;
  if (index >= total - hard) return 3;
  return 2;
}

/** Solo: the tier for a hidden skill level. */
export function tierForLevel(level: number): Tier {
  if (level < 3) return 1;
  if (level < 7) return 2;
  return 3;
}

export class EjaMatch {
  readonly words: number;
  phase: Phase = 'setup';
  lang: Lang = 'id';
  /** Solo run (decided when the Host starts). */
  solo = false;
  /** 0-based index of the current word. */
  index = -1;
  word: EjaWord | null = null;
  tier: Tier = 1;
  held = false;
  /** Played word keys, for the screen's recent memory. */
  readonly played: string[] = [];
  /** Solo hidden level. */
  level = 0;

  private readonly seats = new Map<number, Seat>();
  private joinCounter = 0;
  private readonly rnd: () => number;
  private readonly recent: ReadonlySet<string>;
  private readonly used = new Set<string>();
  private t = 0;
  private last: number;
  private deadline = 0;
  private phaseStart = 0;
  private events: EjaEvent[] = [];

  constructor(opts: MatchOptions) {
    const raw = Math.floor(Number.isFinite(opts.words) ? opts.words : DEFAULT_WORDS);
    this.words = Math.max(MIN_WORDS, Math.min(MAX_WORDS, raw));
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

  /** Players in the current word. */
  get table(): Seat[] {
    return this.roster.filter((s) => s.inWord);
  }

  /** Players whose answer is still awaited this word. */
  get waiting(): Seat[] {
    return this.table.filter((s) => s.present && s.answer === null);
  }

  /** Total words of the session (solo: the cap). */
  get total(): number {
    return this.solo ? SOLO_MAX_WORDS : this.words;
  }

  /** Points multiplier of the current word: the Sulit words of group play score double. */
  get multiplier(): number {
    return !this.solo && this.tier === 3 ? 2 : 1;
  }

  msLeft(): number {
    return this.deadline > 0 ? Math.max(0, this.deadline - this.t) : 0;
  }

  phaseLength(): number {
    if (this.phase === 'spell') return TIMING.spellMs[this.tier];
    if (this.phase === 'intro') return TIMING.introMs;
    if (this.phase === 'reveal') return TIMING.revealMs;
    return 0;
  }

  /** ms since the current phase began (match clock). */
  phaseElapsed(): number {
    return Math.max(0, this.t - this.phaseStart);
  }

  /** Server time the typing clock ends, for phone timers (rounded so views deduplicate). */
  deadlineAt(now: number): number | undefined {
    if (this.phase !== 'spell' || this.deadline <= 0 || this.held) return undefined;
    return Math.round((now + (this.deadline - this.t)) / 250) * 250;
  }

  /** Ranked standings (ties share a rank). Solo ranks by best streak. */
  standings(): { seat: Seat; rank: number }[] {
    const key = (s: Seat) => (this.solo ? s.stats.bestStreak * 1000 + s.stats.correct : s.score);
    const rows = this.roster.slice().sort((a, b) => key(b) - key(a) || a.joinIndex - b.joinIndex);
    let rank = 0;
    let prev = Number.NaN;
    return rows.map((seat, i) => {
      const k = key(seat);
      if (k !== prev) rank = i + 1;
      prev = k;
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
          inWord: false,
          lives: LIVES,
          score: 0,
          gained: 0,
          answer: null,
          answerMs: null,
          verdict: 'none',
          near: null,
          practice: false,
          streak: 0,
          spelled: [],
          stats: emptyStats(),
        };
        this.seats.set(p.id, s);
      }
      s.present = p.connected;
    }
    for (const s of this.seats.values()) if (!ids.has(s.id)) s.present = false;
    this.checkProgress();
  }

  setHeld(held: boolean, now: number): void {
    this.advance(now);
    this.held = held;
  }

  /* ------------------------------------------------------------------ setup (Host) */

  pick(value: string): boolean {
    if (this.phase !== 'setup' || (value !== 'id' && value !== 'en')) return false;
    this.lang = value;
    return true;
  }

  start(now: number): EjaEvent[] {
    if (this.phase !== 'setup') return [];
    this.advance(now);
    const present = this.roster.filter((s) => s.present);
    if (present.length === 0) return [];
    this.solo = present.length === 1;
    this.nextWord();
    return this.flush();
  }

  /* ------------------------------------------------------------------ phone actions */

  /** A typed spelling. One answer per word; returns the events (empty when refused). */
  submit(id: number, text: string, now: number): EjaEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    if (this.phase !== 'spell' || !s?.inWord || s.answer !== null) return [];
    if (this.t > this.deadline + TIMING.graceMs) return [];
    const clean = normalizeWord(text).slice(0, 24);
    if (!clean) return [];
    s.answer = clean;
    s.answerMs = Math.max(0, this.t - this.phaseStart);
    this.events.push({ type: 'locked', id });
    this.checkProgress();
    return this.flush();
  }

  /* ------------------------------------------------------------------ clock */

  tick(now: number): EjaEvent[] {
    this.advance(now);
    if (this.held || this.deadline <= 0 || this.t < this.deadline) return this.flush();
    switch (this.phase) {
      case 'intro':
        this.enter('spell', TIMING.spellMs[this.tier]);
        break;
      case 'spell':
        if (this.t >= this.deadline + TIMING.graceMs) this.reveal();
        break;
      case 'reveal':
        if (this.isOver()) this.enter('final', TIMING.finalMs);
        else this.nextWord();
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

  private flush(): EjaEvent[] {
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

  private drawWord(tier: Tier): EjaWord {
    const all = WORDS[this.lang];
    const fresh = (w: EjaWord) => !this.used.has(wordKey(this.lang, w));
    const notRecent = (w: EjaWord) => !this.recent.has(wordKey(this.lang, w));
    const near = (w: EjaWord) => Math.abs(w.tier - tier) <= 1;
    const tiers = [
      all.filter((w) => w.tier === tier && fresh(w) && notRecent(w)),
      all.filter((w) => w.tier === tier && fresh(w)),
      all.filter((w) => near(w) && fresh(w)),
      all.filter(fresh),
      all.slice(),
    ];
    const pool = tiers.find((p) => p.length > 0) ?? all.slice();
    const word = pool[Math.floor(this.rnd() * pool.length)] ?? all[0]!;
    const key = wordKey(this.lang, word);
    this.used.add(key);
    this.played.push(key);
    return word;
  }

  private nextWord(): void {
    this.index++;
    this.tier = this.solo ? tierForLevel(this.level) : tierForIndex(this.index, this.words);
    this.word = this.drawWord(this.tier);
    for (const s of this.seats.values()) {
      s.inWord = s.present;
      s.answer = null;
      s.answerMs = null;
      s.verdict = 'none';
      s.near = null;
      s.gained = 0;
      s.practice = false;
    }
    this.enter('intro', TIMING.introMs);
  }

  private isOver(): boolean {
    const table = this.table;
    if (this.solo) return table.every((s) => s.lives <= 0) || this.index + 1 >= SOLO_MAX_WORDS;
    if (this.index + 1 >= this.words) return true;
    // Everyone out of lives: no points left to win, end instead of a long Latihan.
    const playing = this.roster.filter((s) => s.present);
    return playing.length > 0 && playing.every((s) => s.lives <= 0);
  }

  private reveal(): void {
    const word = this.word?.word ?? '';
    const mult = this.multiplier;
    const table = this.table;
    let fastest: Seat | null = null;
    for (const s of table) {
      s.practice = s.lives <= 0;
      const answer = s.answer ?? '';
      if (answer === word) s.verdict = 'correct';
      else if (!answer) s.verdict = 'none';
      else {
        s.near = nearMiss(answer, word);
        s.verdict = s.near ? 'near' : 'wrong';
      }
      if (s.practice) {
        if (s.answer !== null) s.stats.practice++;
        if (s.verdict === 'correct') s.spelled.push(word);
        continue;
      }
      if (s.verdict === 'correct') {
        s.gained = POINTS.correct * mult;
        s.streak++;
        s.stats.correct++;
        s.stats.correctMs += s.answerMs ?? 0;
        s.stats.bestStreak = Math.max(s.stats.bestStreak, s.streak);
        s.spelled.push(word);
        if (!fastest || (s.answerMs ?? 0) < (fastest.answerMs ?? 0)) fastest = s;
      } else {
        s.streak = 0;
        s.lives = Math.max(0, s.lives - 1);
        if (s.verdict === 'near') s.stats.near++;
        else s.stats.wrong++;
        if (s.lives === 0) this.events.push({ type: 'out', id: s.id });
      }
    }
    const scorers = table.filter((s) => !s.practice).length;
    if (fastest && scorers >= 2) {
      fastest.gained += POINTS.fastest * mult;
      fastest.stats.fastest++;
    }
    for (const s of table) s.score += s.gained;
    if (this.solo) {
      const me = table[0];
      if (me?.verdict === 'correct') this.level++;
      else if (me) this.level = Math.max(0, this.level - SOLO_LEVEL_DROP);
    }
    this.enter('reveal', TIMING.revealMs);
  }

  private checkProgress(): void {
    if (this.phase === 'spell' && this.table.length > 0 && this.waiting.length === 0) this.reveal();
  }
}
