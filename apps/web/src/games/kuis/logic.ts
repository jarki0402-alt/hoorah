/**
 * Kuis Nusantara game logic. Pure and deterministic: no DOM, no timers, no randomness except
 * the seeded question shuffle. Every method takes explicit server-time values (`now`, `at`),
 * so the whole match can be replayed in tests.
 *
 * Time model: "game time" is server time minus every paused interval, measured from the match
 * origin. Phase timers run on game time, so they freeze while the match is held (shell pause or
 * nobody connected). Phones stamp answers with synced server time; those stamps are mapped onto
 * game time too, so a pause in the middle of a question never eats a player's answer time.
 */

import type { GameAward, GameResult } from '@hoorah/sdk';
import type { RecordResult } from '../common/records';
import { type PreparedQuestion, prepareQuestions, type Question } from './questions';
import { formatSeconds, STR } from './strings';

export const TIMING = {
  /** Title card before the first question. */
  startMs: 2400,
  /** Category flash before each question. */
  introMs: 1200,
  /** Answer window. */
  questionMs: 15_000,
  /** After the deadline the phase stays open this long so in-flight answers can still land. */
  closeGraceMs: 500,
  /** Short beat after the last lock-in before the reveal, so the lock-in animation reads. */
  allAnsweredMs: 700,
  revealMs: 4500,
  finalMs: 3000,
  /** Answers stamped earlier than question start minus this are rejected. */
  earlyToleranceMs: 200,
  /** Answers stamped later than the deadline plus this are rejected. */
  lateToleranceMs: 300,
  /** Countdown cues fire for the last N whole seconds. */
  cueFromSec: 5,
} as const;

export const SCORING = {
  base: 500,
  speedMax: 500,
  streakStep: 100,
  streakCap: 300,
  /** A streak of at least this many before a question doubles that question's points. */
  doubleFrom: 3,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ Scoring */

export interface ScoreBreakdown {
  correct: boolean;
  base: number;
  speed: number;
  streakBonus: number;
  doubled: boolean;
  total: number;
  streakAfter: number;
}

const ZERO_SCORE: ScoreBreakdown = {
  correct: false,
  base: 0,
  speed: 0,
  streakBonus: 0,
  doubled: false,
  total: 0,
  streakAfter: 0,
};

/**
 * Points for one question. Correct: 500 + speed bonus (up to 500, linear in remaining time)
 * + streak bonus (+100 per consecutive correct after the first, capped at +300). If the streak
 * was already 3 or more before this question, the whole thing is doubled. Wrong or missing
 * answers score nothing and reset the streak.
 */
export function scoreAnswer(
  correct: boolean,
  timeMs: number | null,
  streakBefore: number,
  limitMs: number = TIMING.questionMs,
): ScoreBreakdown {
  if (!correct || timeMs === null) return { ...ZERO_SCORE };
  const t = clamp(timeMs, 0, limitMs);
  const base = SCORING.base;
  const speed = Math.round((SCORING.speedMax * (limitMs - t)) / limitMs);
  const streakAfter = streakBefore + 1;
  const streakBonus = Math.min(SCORING.streakCap, SCORING.streakStep * (streakAfter - 1));
  const doubled = streakBefore >= SCORING.doubleFrom;
  const total = (base + speed + streakBonus) * (doubled ? 2 : 1);
  return { correct: true, base, speed, streakBonus, doubled, total, streakAfter };
}

/**
 * Answer time from the phone's press stamp. `elapsedMs` = press time minus question start, both
 * in game time. Returns null for stamps outside the accepted window (clock skew tolerance on
 * both ends); otherwise the time clamped into [0, limit].
 */
export function measureAnswerTime(elapsedMs: number, limitMs: number = TIMING.questionMs): number | null {
  if (!Number.isFinite(elapsedMs)) return null;
  if (elapsedMs < -TIMING.earlyToleranceMs || elapsedMs > limitMs + TIMING.lateToleranceMs) return null;
  return clamp(elapsedMs, 0, limitMs);
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

  /** Game ms for a server timestamp. Inside a pause the game clock reads the pause start. */
  game(serverMs: number): number {
    let paused = 0;
    for (const p of this.pauses) {
      if (serverMs <= p.start) break;
      paused += Math.min(serverMs, p.end ?? serverMs) - p.start;
    }
    return serverMs - this.origin - paused;
  }

  /** Server time at which the game clock will read `gameMs`, assuming no further pauses. */
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
  /** Still listed by the shell. Kicked players disappear from the shell list. */
  present: boolean;
  connected: boolean;
  /** First round index this player plays. Mid-question joiners wait for the next question. */
  joinedRound: number;
  score: number;
  /** Score before the latest reveal, for count-up animations. */
  prevScore: number;
  streak: number;
  bestStreak: number;
  correct: number;
  /** Questions this player took part in. */
  asked: number;
  /** Questions this player answered at all. */
  answered: number;
  /** Sum of answer times over correct answers. */
  correctTimeMs: number;
}

export interface Answer {
  option: number;
  timeMs: number;
}

export interface RoundOutcome {
  playerId: number;
  option: number | null;
  timeMs: number | null;
  score: ScoreBreakdown;
}

export interface RankEntry {
  playerId: number;
  score: number;
  rank: number;
}

export type KuisEvent =
  | { type: 'phase'; phase: Phase; round: number }
  | { type: 'locked'; playerId: number }
  | { type: 'cue'; secondsLeft: number }
  | { type: 'reveal'; outcomes: RoundOutcome[]; fastestCorrect: number | null };

export interface MatchOptions {
  seed: number;
  rounds: number;
  /** Server ms the match starts at. */
  now: number;
  players: readonly PlayerPresence[];
  bank?: readonly Question[];
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

export class KuisMatch {
  readonly questions: PreparedQuestion[];
  readonly clock: PauseClock;
  phase: Phase = 'start';
  /** 0-based index of the current question. */
  round = 0;
  /** Game ms the current phase started. */
  phaseStart = 0;
  /** Game ms the current phase is scheduled to end (question phase: see `questionEnd`). */
  phaseEnd: number = TIMING.startMs;
  /** Join order is preserved by Map insertion order. */
  readonly records = new Map<number, PlayerRecord>();
  /** Players taking part in the current question. */
  participants: number[] = [];
  readonly answers = new Map<number, Answer>();
  /** Outcomes of the latest reveal. */
  outcomes: RoundOutcome[] = [];
  fastestCorrect: number | null = null;
  /** Game ms when every connected participant had answered, if that happened. */
  allAnsweredAt: number | null = null;
  private lastCue = Number.POSITIVE_INFINITY;

  constructor(opts: MatchOptions) {
    this.questions = prepareQuestions(opts.seed, Math.max(1, Math.floor(opts.rounds)), opts.bank);
    this.clock = new PauseClock(opts.now);
    this.syncPlayers(opts.players, opts.now);
  }

  get total(): number {
    return this.questions.length;
  }

  get question(): PreparedQuestion {
    return this.questions[clamp(this.round, 0, this.total - 1)]!;
  }

  get held(): boolean {
    return this.clock.paused;
  }

  /** Game time (ms since start, paused time excluded). */
  time(now: number): number {
    return this.clock.game(now);
  }

  /** Game ms of the answer deadline for the current question. */
  get deadline(): number {
    return this.phaseStart + TIMING.questionMs;
  }

  /** Server ms of the answer deadline, for phone countdowns. Stable while not held. */
  deadlineServer(now: number): number {
    return this.clock.server(this.deadline, now);
  }

  /** Remaining ms of the visible countdown: answer time in 'question', phase time otherwise. */
  timeLeft(now: number): number {
    const t = this.time(now);
    const end = this.phase === 'question' ? this.deadline : this.phaseEnd;
    return Math.max(0, end - t);
  }

  record(id: number): PlayerRecord | undefined {
    return this.records.get(id);
  }

  /** Players still listed by the shell, in join order. */
  get roster(): PlayerRecord[] {
    return [...this.records.values()].filter((r) => r.present);
  }

  isParticipant(id: number): boolean {
    return this.participants.includes(id);
  }

  /** Connected participants who have not answered yet. */
  waitingFor(): number[] {
    return this.participants.filter((id) => this.records.get(id)?.connected && !this.answers.has(id));
  }

  /** Participant with the quickest answer so far (correctness unknown until the reveal). */
  fastestAnswer(): number | null {
    let best: number | null = null;
    let bestTime = Number.POSITIVE_INFINITY;
    for (const [id, a] of this.answers) {
      if (a.timeMs < bestTime) {
        best = id;
        bestTime = a.timeMs;
      }
    }
    return best;
  }

  /** Exactly one person has played this match: score attack, no rivals (PRD 6.4). */
  get solo(): boolean {
    return this.records.size === 1;
  }

  ranking(): RankEntry[] {
    return rankScores(this.roster.map((r) => ({ playerId: r.id, score: r.score })));
  }

  rankOf(id: number): RankEntry | undefined {
    return this.ranking().find((r) => r.playerId === id);
  }

  /** Per-player stats in ranking order, the input `computeAwards` expects. */
  awardStats(): AwardStats[] {
    return this.ranking()
      .map((r) => this.records.get(r.playerId))
      .filter((r): r is PlayerRecord => r !== undefined);
  }

  /* -------------------------------------------------------------- inputs */

  /** Hold (pause) or release the match. The game clock does not advance while held. */
  setHeld(held: boolean, now: number): void {
    if (held) this.clock.pause(now);
    else this.clock.resume(now);
  }

  /** Mirror the shell's player list. New players join from the next question with 0 points. */
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

  /**
   * A player's choice. `option` is the displayed index (0 = A). `at` is the phone's synced
   * server time at the press. Only the first valid answer per question counts.
   */
  answer(playerId: number, option: number, at: number, now: number): KuisEvent[] {
    if (this.phase !== 'question' || this.held) return [];
    if (!Number.isInteger(option) || option < 0 || option >= this.question.options.length) return [];
    if (!this.isParticipant(playerId) || this.answers.has(playerId)) return [];
    const timeMs = measureAnswerTime(this.time(at) - this.phaseStart);
    if (timeMs === null) return [];
    this.answers.set(playerId, { option, timeMs });
    this.checkAllAnswered(this.time(now));
    return [{ type: 'locked', playerId }];
  }

  /** Advance phases. Call often (every frame); it is idempotent for a given `now`. */
  tick(now: number): KuisEvent[] {
    if (this.phase === 'ended' || this.held) return [];
    const t = this.time(now);
    const events: KuisEvent[] = [];
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

  /** Game ms the question phase closes: early once everyone answered, else deadline + grace. */
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

  private beginIntro(t: number, events: KuisEvent[]): void {
    this.phase = 'intro';
    this.phaseStart = t;
    this.phaseEnd = t + TIMING.introMs;
    this.answers.clear();
    this.outcomes = [];
    this.fastestCorrect = null;
    for (const r of this.records.values()) r.prevScore = r.score;
    events.push({ type: 'phase', phase: 'intro', round: this.round });
  }

  private beginQuestion(t: number, events: KuisEvent[]): void {
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

  private beginReveal(t: number, events: KuisEvent[]): void {
    this.phase = 'reveal';
    this.phaseStart = t;
    this.phaseEnd = t + TIMING.revealMs;
    const q = this.question;
    for (const r of this.records.values()) r.prevScore = r.score;
    const outcomes: RoundOutcome[] = [];
    for (const id of this.participants) {
      const rec = this.records.get(id);
      if (!rec) continue;
      const a = this.answers.get(id);
      const correct = a !== undefined && a.option === q.answer;
      const score = scoreAnswer(correct, a?.timeMs ?? null, rec.streak);
      rec.score += score.total;
      rec.streak = score.streakAfter;
      rec.bestStreak = Math.max(rec.bestStreak, rec.streak);
      rec.asked++;
      if (a) rec.answered++;
      if (correct && a) {
        rec.correct++;
        rec.correctTimeMs += a.timeMs;
      }
      outcomes.push({ playerId: id, option: a?.option ?? null, timeMs: a?.timeMs ?? null, score });
    }
    let fastest: RoundOutcome | null = null;
    for (const o of outcomes) {
      if (o.score.correct && o.timeMs !== null && (fastest === null || o.timeMs < (fastest.timeMs ?? 0))) {
        fastest = o;
      }
    }
    this.outcomes = outcomes;
    this.fastestCorrect = fastest?.playerId ?? null;
    events.push({ type: 'phase', phase: 'reveal', round: this.round });
    events.push({ type: 'reveal', outcomes, fastestCorrect: this.fastestCorrect });
  }

  private beginFinal(t: number, events: KuisEvent[]): void {
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
    streak: 0,
    bestStreak: 0,
    correct: 0,
    asked: 0,
    answered: 0,
    correctTimeMs: 0,
  };
}

/* ------------------------------------------------------------------ Awards and result */

export interface AwardStats {
  id: number;
  correct: number;
  asked: number;
  answered: number;
  correctTimeMs: number;
  bestStreak: number;
}

/**
 * Hands out awards so every player gets at least one when possible. The three merit awards go
 * to the true best (ties favour players without an award yet). Everyone still empty-handed then
 * gets "Pantang Menyerah" if they answered every question they played, else "Peserta Hebat".
 * `stats` should be in ranking order; it breaks remaining ties.
 */
export function computeAwards(stats: readonly AwardStats[]): GameAward[] {
  const awards: GameAward[] = [];
  const has = new Set<number>();
  const order = new Map(stats.map((s, i) => [s.id, i]));

  const best = (candidates: AwardStats[], metric: (s: AwardStats) => number): AwardStats | null => {
    if (!candidates.length) return null;
    const sorted = [...candidates].sort(
      (a, b) =>
        metric(a) - metric(b) ||
        Number(has.has(a.id)) - Number(has.has(b.id)) ||
        (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    return sorted[0] ?? null;
  };
  const give = (s: AwardStats | null, award: Omit<GameAward, 'playerId'>) => {
    if (!s) return;
    awards.push({ playerId: s.id, ...award });
    has.add(s.id);
  };
  const avg = (s: AwardStats) => s.correctTimeMs / Math.max(1, s.correct);

  const scorers = stats.filter((s) => s.correct > 0);
  const brain = best(scorers, (s) => -s.correct);
  if (brain)
    give(brain, {
      title: STR.awardBrain,
      desc: STR.awardBrainDesc(brain.correct, brain.asked),
      icon: 'brain',
    });

  const zap = best(scorers, avg);
  if (zap) give(zap, { title: STR.awardZap, desc: STR.awardZapDesc(formatSeconds(avg(zap))), icon: 'zap' });

  const fire = best(
    stats.filter((s) => s.bestStreak >= 2),
    (s) => -s.bestStreak,
  );
  if (fire) give(fire, { title: STR.awardFire, desc: STR.awardFireDesc(fire.bestStreak), icon: 'fire' });

  for (const s of stats) {
    if (has.has(s.id)) continue;
    if (s.asked > 0 && s.answered === s.asked) {
      give(s, { title: STR.awardHeart, desc: STR.awardHeartDesc(s.asked), icon: 'heart' });
    } else {
      give(s, { title: STR.awardStar, desc: STR.awardStarDesc, icon: 'star' });
    }
  }
  return awards;
}

/* ------------------------------------------------------------------ Solo records */

export type RecordKind = 'first' | 'new' | 'tie' | 'short';

/** How this match's score compares with the stored record (see `submitRecord`). */
export function recordKind(r: RecordResult, value: number): RecordKind {
  if (r.previous === null) return 'first';
  if (r.isNew) return 'new';
  return value >= r.best ? 'tie' : 'short';
}

/** The line shown under a solo score: new record, first record, or how far off it was. */
export function recordLine(r: RecordResult, value: number): string {
  switch (recordKind(r, value)) {
    case 'first':
      return STR.recordFirst(value);
    case 'new':
      return STR.recordNew(r.best, r.previous ?? 0);
    case 'tie':
      return STR.recordTie(r.best);
    case 'short':
      return STR.recordShort(r.best, r.best - value);
  }
}

/** What the TV and the phone show about the record at the end of a solo match. */
export interface SoloRecord {
  text: string;
  isNew: boolean;
}

export function soloRecord(r: RecordResult, value: number): SoloRecord {
  return { text: recordLine(r, value), isNew: recordKind(r, value) === 'new' };
}

/**
 * The shell's end-of-game payload: ranking (ties share rank), headline, awards. A solo match with
 * its `record` gets a score headline and the record line instead of a champion.
 */
export function buildResult(
  match: KuisMatch,
  nameOf: (id: number) => string,
  record: SoloRecord | null = null,
): GameResult {
  const solo = match.solo ? match.roster[0] : undefined;
  if (solo && record) {
    return {
      title: STR.resultTitleSolo(solo.score),
      subtitle: record.text,
      ranking: [
        { playerId: solo.id, score: solo.score, rank: 1, label: STR.rankingLabel(solo.correct, solo.asked) },
      ],
      awards: computeAwards(match.awardStats()),
    };
  }
  const ranking = match.ranking();
  const winners = ranking.filter((r) => r.rank === 1);
  const first = winners[0] ? match.record(winners[0].playerId) : undefined;

  let title: string = STR.resultTitleNone;
  if (winners.length === 1 && first) title = STR.resultTitleOne(nameOf(first.id));
  else if (winners.length === 2)
    title = STR.resultTitleTwo(nameOf(winners[0]!.playerId), nameOf(winners[1]!.playerId));
  else if (winners.length > 2) title = STR.resultTitleMany;

  return {
    title,
    ...(first ? { subtitle: STR.resultSubtitle(first.score, first.correct, first.asked) } : {}),
    ranking: ranking.map((r) => {
      const rec = match.record(r.playerId);
      return {
        playerId: r.playerId,
        score: r.score,
        rank: r.rank,
        ...(rec ? { label: STR.rankingLabel(rec.correct, rec.asked) } : {}),
      };
    }),
    awards: computeAwards(match.awardStats()),
  };
}
