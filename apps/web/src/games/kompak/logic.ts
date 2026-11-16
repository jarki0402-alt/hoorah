/**
 * Kompak Gak? game logic. Pure and deterministic: no DOM, no timers, no randomness except the
 * seeded prompt draw. Every method takes explicit server-time values (`now`, `at`), so the whole
 * match can be replayed in tests.
 *
 * There are no right answers. With 3+ players a round pays everyone in the largest group (all
 * tied largest groups pay); someone alone on an option never scores; a unanimous room earns a
 * bonus. With exactly 2 players the round is co-op ("sehati"): both pick the same option and
 * both score, and the match tracks a "persen kompak" meter.
 *
 * Time model (same as Kuis Nusantara): "game time" is server time minus every paused interval.
 * Phase timers run on game time, so they freeze while the match is held (shell pause or nobody
 * connected). Phone press stamps are mapped onto game time too.
 */

import type { GameAward, GameResult } from '@hoorah/sdk';
import { PROMPTS, type Prompt } from './prompts';
import { formatSeconds, STR } from './strings';

export const TIMING = {
  /** Title card before the first prompt. */
  startMs: 3200,
  /** Category flash before each prompt. */
  introMs: 1300,
  /** Answer window. */
  questionMs: 15_000,
  /** After the deadline the phase stays open this long so in-flight answers can still land. */
  closeGraceMs: 500,
  /** Short beat after the last lock-in before the reveal. */
  allAnsweredMs: 800,
  revealMs: 6200,
  finalMs: 4500,
  earlyToleranceMs: 200,
  lateToleranceMs: 300,
  cueFromSec: 5,
} as const;

export const SCORING = {
  /** In the largest group (3+ players). */
  kompak: 100,
  /** Extra when every participant picked the same option (3+ players). */
  unanimous: 50,
  /** Both picked the same option (2 players). */
  sehati: 100,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ Round scoring */

export type RoundMode = 'group' | 'sehati' | 'solo';

/**
 * Per-player result of one round:
 * - kompak: in a largest group (3+ players)
 * - minority: in a group of 2+ that was not the largest
 * - alone: the only one on that option
 * - sehati / apart: 2 players, same / different option
 * - missed: did not answer in time
 * - solo: fewer than 2 participants, nothing to match
 */
export type OutcomeKind = 'kompak' | 'minority' | 'alone' | 'sehati' | 'apart' | 'missed' | 'solo';

export interface RoundOutcome {
  playerId: number;
  option: number | null;
  timeMs: number | null;
  kind: OutcomeKind;
  points: number;
  /** Bonus part of `points` (unanimous). */
  bonus: number;
}

export interface RoundScore {
  mode: RoundMode;
  /** Pickers per option. */
  counts: number[];
  /** Options that scored (largest groups, or the shared sehati pick). */
  winners: number[];
  unanimous: boolean;
  outcomes: RoundOutcome[];
}

/**
 * Score one round from the participants' picks (`null` = no answer). Pure; order of outcomes
 * follows `picks`.
 */
export function scoreRound(
  picks: readonly { playerId: number; option: number | null; timeMs?: number | null }[],
  optionCount = 4,
): RoundScore {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const p of picks)
    if (p.option !== null && p.option >= 0 && p.option < optionCount) counts[p.option]!++;
  const base = (p: (typeof picks)[number]) => ({
    playerId: p.playerId,
    option: p.option,
    timeMs: p.option === null ? null : (p.timeMs ?? null),
    bonus: 0,
  });

  if (picks.length < 2) {
    return {
      mode: 'solo',
      counts,
      winners: [],
      unanimous: false,
      outcomes: picks.map((p) => ({ ...base(p), kind: p.option === null ? 'missed' : 'solo', points: 0 })),
    };
  }

  if (picks.length === 2) {
    const [a, b] = picks;
    const same = a!.option !== null && a!.option === b!.option;
    return {
      mode: 'sehati',
      counts,
      winners: same ? [a!.option!] : [],
      unanimous: same,
      outcomes: picks.map((p) => {
        if (p.option === null) return { ...base(p), kind: 'missed', points: 0 };
        if (same) return { ...base(p), kind: 'sehati', points: SCORING.sehati };
        return { ...base(p), kind: 'apart', points: 0 };
      }),
    };
  }

  const max = Math.max(...counts);
  const winners = max >= 2 ? counts.flatMap((c, i) => (c === max ? [i] : [])) : [];
  const unanimous = max === picks.length;
  return {
    mode: 'group',
    counts,
    winners,
    unanimous,
    outcomes: picks.map((p) => {
      if (p.option === null) return { ...base(p), kind: 'missed', points: 0 };
      const n = counts[p.option] ?? 0;
      if (winners.includes(p.option)) {
        const bonus = unanimous ? SCORING.unanimous : 0;
        return { ...base(p), kind: 'kompak', points: SCORING.kompak + bonus, bonus };
      }
      return { ...base(p), kind: n <= 1 ? 'alone' : 'minority', points: 0 };
    }),
  };
}

/** "Persen kompak" for co-op play: share of sehati rounds, rounded. 0 when nothing was played. */
export function percent(hits: number, rounds: number): number {
  if (rounds <= 0) return 0;
  return Math.round((clamp(hits, 0, rounds) * 100) / rounds);
}

/** The fun co-op title for a percentage. */
export function coopTitle(pct: number): { title: string; text: string } {
  for (const t of STR.coopTitles) if (pct >= t.from) return { title: t.title, text: t.text };
  const last = STR.coopTitles[STR.coopTitles.length - 1]!;
  return { title: last.title, text: last.text };
}

/**
 * Answer time from the phone's press stamp (game time since the prompt opened). Null for stamps
 * outside the accepted window; otherwise clamped into [0, limit].
 */
export function measureAnswerTime(elapsedMs: number, limitMs: number = TIMING.questionMs): number | null {
  if (!Number.isFinite(elapsedMs)) return null;
  if (elapsedMs < -TIMING.earlyToleranceMs || elapsedMs > limitMs + TIMING.lateToleranceMs) return null;
  return clamp(elapsedMs, 0, limitMs);
}

/* ------------------------------------------------------------------ Prompt draw */

/** Deterministic PRNG (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw `count` distinct prompts, deterministically from `seed`. Prompts listed in `recent`
 * (played in earlier sessions) are only used once the fresh ones run out, and the same category
 * never comes twice in a row when the pool allows it.
 */
export function drawPrompts(
  seed: number,
  count: number,
  bank: readonly Prompt[] = PROMPTS,
  recent: ReadonlySet<string> = new Set(),
): Prompt[] {
  const rnd = seededRng(seed);
  const n = Math.max(0, Math.min(Math.floor(count), bank.length));
  const fresh = bank.filter((q) => !recent.has(q.id));
  const stale = bank.filter((q) => recent.has(q.id));
  const picked: Prompt[] = [];
  while (picked.length < n) {
    const pool = fresh.length ? fresh : stale;
    const prev = picked[picked.length - 1]?.category;
    const eligible = pool.filter((q) => q.category !== prev);
    const from = eligible.length ? eligible : pool;
    const choice = from[Math.floor(rnd() * from.length)]!;
    pool.splice(pool.indexOf(choice), 1);
    picked.push(choice);
  }
  return picked;
}

/* ------------------------------------------------------------------ Clock */

/** Maps server time to game time, skipping every paused interval. */
export class PauseClock {
  private readonly pauses: { start: number; end: number | null }[] = [];

  constructor(readonly origin: number) {}

  get paused(): boolean {
    const last = this.pauses[this.pauses.length - 1];
    return last !== undefined && last.end === null;
  }

  pause(now: number): void {
    if (!this.paused) this.pauses.push({ start: now, end: null });
  }

  resume(now: number): void {
    const last = this.pauses[this.pauses.length - 1];
    if (last && last.end === null) last.end = Math.max(last.start, now);
  }

  game(serverMs: number): number {
    let paused = 0;
    for (const p of this.pauses) {
      if (serverMs <= p.start) break;
      paused += Math.min(serverMs, p.end ?? serverMs) - p.start;
    }
    return serverMs - this.origin - paused;
  }

  server(gameMs: number, now: number): number {
    return now + (gameMs - this.game(now));
  }
}

/* ------------------------------------------------------------------ Match */

export type Phase = 'start' | 'intro' | 'question' | 'reveal' | 'final' | 'ended';

export interface PlayerPresence {
  id: number;
  connected: boolean;
}

export interface PlayerRecord {
  id: number;
  present: boolean;
  connected: boolean;
  /** First round index this player plays. Mid-question joiners wait for the next prompt. */
  joinedRound: number;
  score: number;
  /** Score before the latest reveal, for count-up animations. */
  prevScore: number;
  /** Rounds that paid (kompak or sehati). */
  hits: number;
  /** Rounds played against at least one other player. */
  played: number;
  answered: number;
  /** Rounds alone on an option (3+ players). */
  alone: number;
  answerTimeMs: number;
}

export interface Answer {
  option: number;
  timeMs: number;
}

export interface RankEntry {
  playerId: number;
  score: number;
  rank: number;
}

export type KompakEvent =
  | { type: 'phase'; phase: Phase; round: number }
  | { type: 'locked'; playerId: number }
  | { type: 'cue'; secondsLeft: number }
  | { type: 'reveal'; result: RoundScore };

export interface MatchOptions {
  seed: number;
  rounds: number;
  now: number;
  players: readonly PlayerPresence[];
  bank?: readonly Prompt[];
  recent?: ReadonlySet<string>;
}

/** Ties share a rank (1, 1, 3). Input order breaks ties for display (join order). */
export function rankScores(entries: readonly { playerId: number; score: number }[]): RankEntry[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  let rank = 0;
  let prev = Number.NaN;
  return sorted.map((e, i) => {
    if (e.score !== prev) {
      rank = i + 1;
      prev = e.score;
    }
    return { playerId: e.playerId, score: e.score, rank };
  });
}

export class KompakMatch {
  readonly prompts: Prompt[];
  readonly clock: PauseClock;
  phase: Phase = 'start';
  round = 0;
  phaseStart = 0;
  phaseEnd: number = TIMING.startMs;
  readonly records = new Map<number, PlayerRecord>();
  participants: number[] = [];
  readonly answers = new Map<number, Answer>();
  /** Result of the latest reveal. */
  result: RoundScore | null = null;
  allAnsweredAt: number | null = null;
  /** Co-op rounds (exactly 2 participants) and how many of them were sehati. */
  coopRounds = 0;
  coopHits = 0;
  private lastCue = Number.POSITIVE_INFINITY;

  constructor(opts: MatchOptions) {
    this.prompts = drawPrompts(opts.seed, Math.max(1, Math.floor(opts.rounds)), opts.bank, opts.recent);
    this.clock = new PauseClock(opts.now);
    this.syncPlayers(opts.players, opts.now);
  }

  get total(): number {
    return this.prompts.length;
  }

  get prompt(): Prompt {
    return this.prompts[clamp(this.round, 0, this.total - 1)]!;
  }

  get held(): boolean {
    return this.clock.paused;
  }

  /** Two players in the room: co-op "sehati" presentation. */
  get coop(): boolean {
    return this.roster.length === 2;
  }

  get coopPercent(): number {
    return percent(this.coopHits, this.coopRounds);
  }

  time(now: number): number {
    return this.clock.game(now);
  }

  get deadline(): number {
    return this.phaseStart + TIMING.questionMs;
  }

  deadlineServer(now: number): number {
    return this.clock.server(this.deadline, now);
  }

  timeLeft(now: number): number {
    const t = this.time(now);
    const end = this.phase === 'question' ? this.deadline : this.phaseEnd;
    return Math.max(0, end - t);
  }

  record(id: number): PlayerRecord | undefined {
    return this.records.get(id);
  }

  get roster(): PlayerRecord[] {
    return [...this.records.values()].filter((r) => r.present);
  }

  isParticipant(id: number): boolean {
    return this.participants.includes(id);
  }

  waitingFor(): number[] {
    return this.participants.filter((id) => this.records.get(id)?.connected && !this.answers.has(id));
  }

  outcomeOf(id: number): RoundOutcome | undefined {
    return this.result?.outcomes.find((o) => o.playerId === id);
  }

  ranking(): RankEntry[] {
    return rankScores(this.roster.map((r) => ({ playerId: r.id, score: r.score })));
  }

  rankOf(id: number): RankEntry | undefined {
    return this.ranking().find((r) => r.playerId === id);
  }

  awardStats(): PlayerRecord[] {
    return this.ranking()
      .map((r) => this.records.get(r.playerId))
      .filter((r): r is PlayerRecord => r !== undefined);
  }

  /* -------------------------------------------------------------- inputs */

  setHeld(held: boolean, now: number): void {
    if (held) this.clock.pause(now);
    else this.clock.resume(now);
  }

  syncPlayers(list: readonly PlayerPresence[], now: number): void {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let rec = this.records.get(p.id);
      if (!rec) {
        rec = newRecord(p.id, this.joinRoundForNewcomer());
        this.records.set(p.id, rec);
      }
      rec.present = true;
      rec.connected = p.connected;
    }
    for (const rec of this.records.values()) {
      if (!seen.has(rec.id)) {
        rec.present = false;
        rec.connected = false;
      }
    }
    this.checkAllAnswered(this.time(now));
  }

  /** A player's pick (`option` = displayed index, 0 = A). Only the first valid pick counts. */
  answer(playerId: number, option: number, at: number, now: number): KompakEvent[] {
    if (this.phase !== 'question' || this.held) return [];
    if (!Number.isInteger(option) || option < 0 || option >= this.prompt.options.length) return [];
    if (!this.isParticipant(playerId) || this.answers.has(playerId)) return [];
    const timeMs = measureAnswerTime(this.time(at) - this.phaseStart);
    if (timeMs === null) return [];
    this.answers.set(playerId, { option, timeMs });
    this.checkAllAnswered(this.time(now));
    return [{ type: 'locked', playerId }];
  }

  /** Advance phases. Call often; idempotent for a given `now`. */
  tick(now: number): KompakEvent[] {
    if (this.phase === 'ended' || this.held) return [];
    const t = this.time(now);
    const events: KompakEvent[] = [];
    switch (this.phase) {
      case 'start':
        if (t >= this.phaseEnd) this.beginIntro(t, events);
        break;
      case 'intro':
        if (t >= this.phaseEnd) this.beginQuestion(t, events);
        break;
      case 'question': {
        if (this.allAnsweredAt === null) {
          const left = this.deadline - t;
          const sec = Math.ceil(left / 1000);
          if (left > 0 && sec <= TIMING.cueFromSec && sec < this.lastCue) {
            this.lastCue = sec;
            events.push({ type: 'cue', secondsLeft: sec });
          }
        }
        if (t >= this.questionEnd) this.beginReveal(t, events);
        break;
      }
      case 'reveal':
        if (t >= this.phaseEnd) {
          if (this.round + 1 < this.total) {
            this.round++;
            this.beginIntro(t, events);
          } else {
            this.beginFinal(t, events);
          }
        }
        break;
      case 'final':
        if (t >= this.phaseEnd) {
          this.phase = 'ended';
          events.push({ type: 'phase', phase: 'ended', round: this.round });
        }
        break;
    }
    return events;
  }

  get questionEnd(): number {
    return this.allAnsweredAt !== null
      ? Math.min(this.allAnsweredAt + TIMING.allAnsweredMs, this.deadline + TIMING.closeGraceMs)
      : this.deadline + TIMING.closeGraceMs;
  }

  /* -------------------------------------------------------------- phases */

  private joinRoundForNewcomer(): number {
    if (this.phase === 'start' || this.phase === 'intro') return this.round;
    if (this.phase === 'final' || this.phase === 'ended') return this.total;
    return this.round + 1;
  }

  private checkAllAnswered(t: number): void {
    if (this.phase !== 'question') return;
    if (this.waitingFor().length === 0) {
      if (this.allAnsweredAt === null) this.allAnsweredAt = t;
    } else {
      this.allAnsweredAt = null;
    }
  }

  private beginIntro(t: number, events: KompakEvent[]): void {
    this.phase = 'intro';
    this.phaseStart = t;
    this.phaseEnd = t + TIMING.introMs;
    this.answers.clear();
    this.result = null;
    for (const r of this.records.values()) r.prevScore = r.score;
    events.push({ type: 'phase', phase: 'intro', round: this.round });
  }

  private beginQuestion(t: number, events: KompakEvent[]): void {
    this.phase = 'question';
    this.phaseStart = t;
    this.phaseEnd = t + TIMING.questionMs + TIMING.closeGraceMs;
    this.answers.clear();
    this.allAnsweredAt = null;
    this.lastCue = Number.POSITIVE_INFINITY;
    this.participants = this.roster.filter((r) => r.joinedRound <= this.round).map((r) => r.id);
    events.push({ type: 'phase', phase: 'question', round: this.round });
    this.checkAllAnswered(t);
  }

  private beginReveal(t: number, events: KompakEvent[]): void {
    this.phase = 'reveal';
    this.phaseStart = t;
    this.phaseEnd = t + TIMING.revealMs;
    for (const r of this.records.values()) r.prevScore = r.score;
    const picks = this.participants.map((id) => {
      const a = this.answers.get(id);
      return { playerId: id, option: a?.option ?? null, timeMs: a?.timeMs ?? null };
    });
    const result = scoreRound(picks, this.prompt.options.length);
    for (const o of result.outcomes) {
      const rec = this.records.get(o.playerId);
      if (!rec) continue;
      rec.score += o.points;
      if (result.mode !== 'solo') rec.played++;
      if (o.points > 0) rec.hits++;
      if (o.kind === 'alone') rec.alone++;
      if (o.option !== null) {
        rec.answered++;
        rec.answerTimeMs += o.timeMs ?? 0;
      }
    }
    if (result.mode === 'sehati') {
      this.coopRounds++;
      if (result.winners.length) this.coopHits++;
    }
    this.result = result;
    events.push({ type: 'phase', phase: 'reveal', round: this.round });
    events.push({ type: 'reveal', result });
  }

  private beginFinal(t: number, events: KompakEvent[]): void {
    this.phase = 'final';
    this.phaseStart = t;
    this.phaseEnd = t + TIMING.finalMs;
    for (const r of this.records.values()) r.prevScore = r.score;
    events.push({ type: 'phase', phase: 'final', round: this.round });
  }
}

function newRecord(id: number, joinedRound: number): PlayerRecord {
  return {
    id,
    present: true,
    connected: false,
    joinedRound,
    score: 0,
    prevScore: 0,
    hits: 0,
    played: 0,
    answered: 0,
    alone: 0,
    answerTimeMs: 0,
  };
}

/* ------------------------------------------------------------------ Awards and result */

/**
 * Every player gets at least one award when possible. 3+ players: "Paling Nyambung" (most
 * hits), "Anti Arus" (most times alone, 2+), "Jari Kilat" (fastest average answer). Co-op: both
 * get "Pasangan Sehati" once they matched at least once. Everyone else: "Teman Nongkrong".
 * `stats` should be in ranking order; it breaks ties.
 */
export function computeAwards(
  stats: readonly PlayerRecord[],
  coop: { percent: number; hits: number } | null,
): GameAward[] {
  const awards: GameAward[] = [];
  const has = new Set<number>();
  const order = new Map(stats.map((s, i) => [s.id, i]));
  const best = (candidates: PlayerRecord[], metric: (s: PlayerRecord) => number): PlayerRecord | null => {
    if (!candidates.length) return null;
    const sorted = [...candidates].sort(
      (a, b) =>
        metric(a) - metric(b) ||
        Number(has.has(a.id)) - Number(has.has(b.id)) ||
        (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    return sorted[0] ?? null;
  };
  const give = (s: PlayerRecord | null, award: Omit<GameAward, 'playerId'>) => {
    if (!s) return;
    awards.push({ playerId: s.id, ...award });
    has.add(s.id);
  };

  if (coop) {
    if (coop.hits > 0)
      for (const s of stats)
        give(s, { title: STR.awardHeart, desc: STR.awardHeartDesc(coop.percent), icon: 'heart' });
  } else {
    const kompak = best(
      stats.filter((s) => s.hits > 0),
      (s) => -s.hits,
    );
    if (kompak)
      give(kompak, {
        title: STR.awardKompak,
        desc: STR.awardKompakDesc(kompak.hits, kompak.played),
        icon: 'crown',
      });
    const unik = best(
      stats.filter((s) => s.alone >= 2),
      (s) => -s.alone,
    );
    if (unik) give(unik, { title: STR.awardUnik, desc: STR.awardUnikDesc(unik.alone), icon: 'star' });
    const avg = (s: PlayerRecord) => s.answerTimeMs / Math.max(1, s.answered);
    const zap = best(
      stats.filter((s) => s.answered > 0 && !has.has(s.id)),
      avg,
    );
    if (zap) give(zap, { title: STR.awardZap, desc: STR.awardZapDesc(formatSeconds(avg(zap))), icon: 'zap' });
  }
  for (const s of stats) {
    if (has.has(s.id)) continue;
    give(s, { title: STR.awardStar, desc: STR.awardStarDesc, icon: 'target' });
  }
  return awards;
}

/** The shell's end-of-game payload: ranking (ties share rank), headline, awards. */
export function buildResult(match: KompakMatch, nameOf: (id: number) => string): GameResult {
  const ranking = match.ranking();
  if (match.coop && match.coopRounds > 0) {
    const pct = match.coopPercent;
    return {
      title: STR.resultTitleCoop(coopTitle(pct).title),
      subtitle: STR.resultSubtitleCoop(pct, match.coopHits, match.coopRounds),
      ranking: ranking.map((r) => ({
        playerId: r.playerId,
        score: r.score,
        rank: r.rank,
        label: STR.rankingLabelCoop(pct),
      })),
      awards: computeAwards(match.awardStats(), { percent: pct, hits: match.coopHits }),
    };
  }
  const winners = ranking.filter((r) => r.rank === 1 && r.score > 0);
  const first = winners[0] ? match.record(winners[0].playerId) : undefined;
  let title: string = STR.resultTitleNone;
  if (winners.length === 1 && first) title = STR.resultTitleOne(nameOf(first.id));
  else if (winners.length === 2)
    title = STR.resultTitleTwo(nameOf(winners[0]!.playerId), nameOf(winners[1]!.playerId));
  else if (winners.length > 2) title = STR.resultTitleMany;
  return {
    title,
    ...(first ? { subtitle: STR.resultSubtitle(first.score, first.hits, first.played) } : {}),
    ranking: ranking.map((r) => {
      const rec = match.record(r.playerId);
      return {
        playerId: r.playerId,
        score: r.score,
        rank: r.rank,
        ...(rec ? { label: STR.rankingLabel(rec.hits, rec.played) } : {}),
      };
    }),
    awards: computeAwards(match.awardStats(), null),
  };
}
