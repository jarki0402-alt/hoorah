/**
 * Jago Masak rules. Pure and deterministic: no DOM, no three.js, no wall clock, no randomness.
 * Every method takes the current game time (ms) explicitly, so the same inputs always grade
 * the same way.
 *
 * Flow per dish: intro -> (ready -> cook -> reveal) x steps -> showcase. After the last dish:
 * final -> ended. All players cook the same step at the same time on their own phone.
 */
import { GESTURE_HOLD, u16Delta } from '@hoorah/protocol';
import { DISHES, type Dish, type DishId, type GestureMode, type HoldSpec, type StepDef } from './recipes';

/* ------------------------------------------------------------------ Tuning */

export const INTRO_FIRST_MS = 5600;
export const INTRO_MS = 4400;
export const READY_MS = 2000;
export const REVEAL_MS = 2300;
export const SHOWCASE_MS = 6800;
export const FINAL_MS = 4200;
/** When everyone is done the step ends this much later, so the last chop lands on screen. */
export const ALL_DONE_GRACE_MS = 650;
/** After the deadline we still accept frames stamped before it (they may be in flight). */
export const INPUT_GRACE_MS = 220;
/** A hold is judged burnt only once the burn point is this far in the past (a release may be in flight). */
export const BURN_GRACE_MS = 250;
/** Count steps that reach this share of the target are Lumayan instead of Gagal. */
export const LUMAYAN_RATIO = 0.6;
/** Hold steps released at half the window's start or more are Lumayan (undercooked). */
export const RAW_LUMAYAN = 0.5;

export const GRADE_POINTS: Record<Grade, number> = { sempurna: 100, bagus: 70, lumayan: 40, gagal: 0 };
export const GRADE_VALUE: Record<Grade, number> = { sempurna: 3, bagus: 2, lumayan: 1, gagal: 0 };
/** Each Sempurna after the first in a row adds this much, up to STREAK_MAX. */
export const STREAK_STEP = 10;
export const STREAK_MAX = 50;
export const STAR_BONUS = 50;
/** Dish quality (0..1) needed for 3 and 2 stars; everything else gets 1. */
export const STARS_3 = 0.8;
export const STARS_2 = 0.5;

/** Anti auto-clicker: counted inputs per second (plus a small burst). */
export const MAX_RATE: Record<GestureMode, number> = { tap: 16, stir: 14, swipe: 7, hold: 0 };
export const RATE_BURST = 3;
/** A counter jump bigger than this is a resync (phone reloaded), not real input. */
export const RESYNC_DELTA = 40;

/* ------------------------------------------------------------------ Types */

export type Grade = 'sempurna' | 'bagus' | 'lumayan' | 'gagal';
export type GradeReason =
  | 'fast'
  | 'done'
  | 'slow'
  | 'golden'
  | 'close'
  | 'over'
  | 'burnt'
  | 'raw'
  | 'missed'
  | 'idle';

export type Phase = 'intro' | 'ready' | 'cook' | 'reveal' | 'showcase' | 'final' | 'ended';

export interface RosterEntry {
  id: number;
  connected: boolean;
}

export interface InputFrame {
  /** The phone's cumulative u16 counter. */
  taps: number;
  buttons: number;
  /** Game time the frame was stamped on the phone. */
  at: number;
}

/** One player's run at the current step. */
export interface StepRun {
  count: number;
  /** Hold steps: amount from finished presses. */
  banked: number;
  /** Hold steps: game time of the current press, or null when not held. */
  pressAt: number | null;
  /** Frozen amount (hold) when done. */
  amount: number;
  doneAt: number | null;
  grade: Grade | null;
  reason: GradeReason | null;
  points: number;
  /** Bumped on every counted input or press, so the renderer can fire one animation each. */
  pulses: number;
  lastPulseAt: number;
}

export interface PlayerStats {
  id: number;
  score: number;
  stars: number;
  /** Per dish index. */
  dishStars: number[];
  dishPoints: number[];
  /** [dish][step]; null = not graded yet. */
  grades: (Grade | null)[][];
  reasons: (GradeReason | null)[][];
  /** [dish][step] final amount (count ratio or hold amount); NaN = not played. */
  amounts: number[][];
  perfects: number;
  fails: number;
  streak: number;
  bestStreak: number;
  /** Finish times (ms) of knife/pestle steps and stir steps, for awards. */
  knifeMs: number[];
  stirMs: number[];
  /** Hold steps: |amount - sweet| when finished in or near the window. */
  holdErrors: number[];
  burns: number;
}

export interface StepResult {
  id: number;
  grade: Grade;
  reason: GradeReason;
  points: number;
  streak: number;
}

export interface DishResult {
  id: number;
  stars: number;
  /** Step points plus the star bonus earned in this dish. */
  points: number;
  bonus: number;
}

export type MasakEvent =
  | { type: 'intro'; dishIndex: number }
  | { type: 'ready'; dishIndex: number; stepIndex: number }
  | { type: 'cook'; dishIndex: number; stepIndex: number; deadline: number }
  | ({ type: 'done' } & StepResult)
  | { type: 'reveal'; dishIndex: number; stepIndex: number; results: StepResult[] }
  | { type: 'showcase'; dishIndex: number; results: DishResult[] }
  | { type: 'final' }
  | { type: 'end' };

export interface InputResult {
  /** Inputs counted toward the step (taps, quarter turns, swipes). */
  counted: number;
  pressed: boolean;
  released: boolean;
  /** This frame finished the step for the player. */
  finished: boolean;
}

/* ------------------------------------------------------------------ Pure grading */

export function gradeCount(
  step: Pick<StepDef, 'target' | 'perfectMs'>,
  count: number,
  elapsed: number | null,
): { grade: Grade; reason: GradeReason } {
  if (count >= step.target && elapsed !== null) {
    return elapsed <= step.perfectMs
      ? { grade: 'sempurna', reason: 'fast' }
      : { grade: 'bagus', reason: 'done' };
  }
  if (count / step.target >= LUMAYAN_RATIO) return { grade: 'lumayan', reason: 'slow' };
  return { grade: 'gagal', reason: count > 0 ? 'slow' : 'idle' };
}

export function gradeHold(spec: HoldSpec, amount: number): { grade: Grade; reason: GradeReason } {
  if (amount >= spec.burn) return { grade: 'gagal', reason: 'burnt' };
  if (amount > spec.hi) return { grade: 'lumayan', reason: 'over' };
  if (amount >= spec.lo) {
    return Math.abs(amount - spec.sweet) <= spec.perfect + 1e-9
      ? { grade: 'sempurna', reason: 'golden' }
      : { grade: 'bagus', reason: 'close' };
  }
  if (amount >= spec.lo * RAW_LUMAYAN) return { grade: 'lumayan', reason: 'raw' };
  return { grade: 'gagal', reason: amount > 0 ? 'raw' : 'idle' };
}

export function streakBonus(streak: number): number {
  return Math.min(STREAK_MAX, Math.max(0, streak - 1) * STREAK_STEP);
}

/** Stars (1..3) for one dish from its step grades; ungraded steps count as Gagal. */
export function dishStars(grades: readonly (Grade | null)[], steps: number): number {
  if (steps <= 0) return 1;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const g = grades[i];
    sum += g ? GRADE_VALUE[g] : 0;
  }
  const q = sum / (3 * steps);
  return q >= STARS_3 - 1e-9 ? 3 : q >= STARS_2 - 1e-9 ? 2 : 1;
}

/* ------------------------------------------------------------------ Clock */

/** Game time: server time minus everything spent paused. Never goes backwards. */
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

export function parseRounds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(3, Math.floor(n)) : 3;
}

/* ------------------------------------------------------------------ Game */

interface Cook {
  lastTaps: number;
  held: boolean;
}

export interface MasakOptions {
  dishes: readonly DishId[];
  roster: readonly RosterEntry[];
  now: number;
}

function newRun(): StepRun {
  return {
    count: 0,
    banked: 0,
    pressAt: null,
    amount: 0,
    doneAt: null,
    grade: null,
    reason: null,
    points: 0,
    pulses: 0,
    lastPulseAt: Number.NEGATIVE_INFINITY,
  };
}

export class MasakLogic {
  readonly dishes: readonly DishId[];
  phase: Phase = 'intro';
  dishIndex = 0;
  stepIndex = 0;
  phaseStartAt: number;
  /** When the current timed phase ends (cook: see cookEndsAt). */
  phaseEndsAt: number;
  cookStartAt = 0;
  deadline = 0;
  /** When the last connected cook finished, or null. */
  allDoneAt: number | null = null;
  /** Everyone who has played, in join order. */
  readonly participants: number[] = [];
  readonly stats = new Map<number, PlayerStats>();
  readonly runs = new Map<number, StepRun>();
  private readonly cooks = new Map<number, Cook>();
  private readonly connected = new Set<number>();
  private events: MasakEvent[] = [];

  constructor(opts: MasakOptions) {
    this.dishes = opts.dishes.length ? [...opts.dishes] : ['nasgor'];
    for (const r of opts.roster) {
      if (r.connected) this.connected.add(r.id);
      if (r.connected) this.addParticipant(r.id);
    }
    this.phaseStartAt = opts.now;
    this.phaseEndsAt = opts.now + INTRO_FIRST_MS;
    this.emit({ type: 'intro', dishIndex: 0 });
  }

  /* ---------------------------------------------------------------- queries */

  get dish(): Dish {
    return DISHES[this.dishes[this.dishIndex] ?? 'nasgor'];
  }

  get dishId(): DishId {
    return this.dish.id;
  }

  get step(): StepDef {
    const steps = this.dish.steps;
    return steps[Math.min(this.stepIndex, steps.length - 1)]!;
  }

  get solo(): boolean {
    return this.participants.length <= 1;
  }

  isConnected(id: number): boolean {
    return this.connected.has(id);
  }

  /** End of the cook phase: the deadline (plus in-flight grace), or shortly after everyone is done. */
  get cookEndsAt(): number {
    const byClock = this.deadline + INPUT_GRACE_MS;
    return this.allDoneAt === null ? byClock : Math.min(byClock, this.allDoneAt + ALL_DONE_GRACE_MS);
  }

  /** Hold amount at game time t (frozen once done). */
  amountAt(id: number, t: number): number {
    const run = this.runs.get(id);
    const spec = this.step.hold;
    if (!run || !spec) return 0;
    if (run.doneAt !== null) return run.amount;
    let a = run.banked;
    if (run.pressAt !== null && this.phase === 'cook') {
      a += (Math.max(run.pressAt, Math.min(t, this.deadline)) - run.pressAt) / spec.fillMs;
    }
    return Math.min(spec.burn, a);
  }

  /** 0..1 for progress bars: count / target, or the hold amount over the burn point. */
  progressAt(id: number, t: number): number {
    const run = this.runs.get(id);
    if (!run) return 0;
    const s = this.step;
    if (s.hold) return Math.min(1, this.amountAt(id, t) / s.hold.burn);
    return Math.min(1, run.count / s.target);
  }

  drain(): MasakEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ---------------------------------------------------------------- roster */

  setRoster(roster: readonly RosterEntry[], now: number): void {
    const next = new Set(roster.filter((r) => r.connected).map((r) => r.id));
    for (const id of this.connected) {
      if (next.has(id)) continue;
      // Gone: stop any press where it is; their phone can't send the release any more.
      const run = this.runs.get(id);
      const spec = this.step.hold;
      if (run && spec && run.pressAt !== null && this.phase === 'cook') {
        run.banked += (Math.max(run.pressAt, Math.min(now, this.deadline)) - run.pressAt) / spec.fillMs;
        run.pressAt = null;
      }
      const c = this.cooks.get(id);
      if (c) c.held = false;
    }
    this.connected.clear();
    for (const id of next) this.connected.add(id);
    if (this.phase === 'final' || this.phase === 'ended') return;
    for (const id of next) if (!this.stats.has(id)) this.addParticipant(id);
    this.checkAllDone(now);
  }

  private addParticipant(id: number): void {
    if (this.stats.has(id)) return;
    this.participants.push(id);
    const grades: (Grade | null)[][] = [];
    const reasons: (GradeReason | null)[][] = [];
    const amounts: number[][] = [];
    for (let d = 0; d < this.dishes.length; d++) {
      const n = DISHES[this.dishes[d]!].steps.length;
      // Steps that already happened count as missed for the dish stars.
      const missedUpTo = d < this.dishIndex ? n : d === this.dishIndex ? this.missedSteps() : 0;
      grades.push(Array.from({ length: n }, (_, i) => (i < missedUpTo ? 'gagal' : null)));
      reasons.push(Array.from({ length: n }, (_, i) => (i < missedUpTo ? 'missed' : null)));
      amounts.push(Array.from({ length: n }, (_, i) => (i < missedUpTo ? 0 : Number.NaN)));
    }
    this.stats.set(id, {
      id,
      score: 0,
      stars: 0,
      dishStars: this.dishes.map(() => 0),
      dishPoints: this.dishes.map(() => 0),
      grades,
      reasons,
      amounts,
      perfects: 0,
      fails: 0,
      streak: 0,
      bestStreak: 0,
      knifeMs: [],
      stirMs: [],
      holdErrors: [],
      burns: 0,
    });
    this.cooks.set(id, { lastTaps: -1, held: false });
    if (this.phase === 'ready' || this.phase === 'cook') this.runs.set(id, newRun());
  }

  /** Steps of the current dish a newcomer can no longer play. */
  private missedSteps(): number {
    switch (this.phase) {
      case 'intro':
        return 0;
      case 'ready':
      case 'cook':
        return this.stepIndex;
      default:
        return this.stepIndex + 1;
    }
  }

  /* ---------------------------------------------------------------- input */

  input(id: number, f: InputFrame, now: number): InputResult {
    const res: InputResult = { counted: 0, pressed: false, released: false, finished: false };
    const cook = this.cooks.get(id);
    if (!cook) return res;
    const counter = f.taps & 0xffff;
    const step = this.step;
    const cooking = this.phase === 'cook' && now <= this.cookEndsAt;
    let delta: number;
    if (cook.lastTaps < 0) delta = cooking && (step.mode === 'tap' || step.mode === 'swipe') ? 1 : 0;
    else delta = u16Delta(cook.lastTaps, counter);
    cook.lastTaps = counter;
    if (delta > RESYNC_DELTA) delta = 0;
    const isHeld = (f.buttons & GESTURE_HOLD) !== 0;
    cook.held = isHeld;

    const run = this.runs.get(id);
    if (!cooking || !run || run.doneAt !== null) return res;
    if (!this.connected.has(id)) return res;
    // Frames stamped after the deadline are too late; before the step began, too early.
    if (f.at > this.deadline) return res;
    const at = Math.max(this.cookStartAt, Math.min(f.at, now));

    if (step.hold) {
      const spec = step.hold;
      if (isHeld && run.pressAt === null) {
        run.pressAt = at;
        run.pulses++;
        run.lastPulseAt = at;
        res.pressed = true;
      } else if (!isHeld && run.pressAt !== null) {
        const end = Math.max(run.pressAt, at);
        run.banked += (end - run.pressAt) / spec.fillMs;
        run.pressAt = null;
        res.released = true;
        if (run.banked >= spec.burn) {
          this.finishHold(id, run, spec, spec.burn, end);
          res.finished = true;
        } else if (run.banked >= spec.lo) {
          this.finishHold(id, run, spec, run.banked, end);
          res.finished = true;
        }
      }
      if (res.finished) this.checkAllDone(now);
      return res;
    }

    if (delta <= 0) return res;
    const elapsed = Math.max(0, at - this.cookStartAt);
    const allowed = Math.floor((MAX_RATE[step.mode] * elapsed) / 1000) + RATE_BURST;
    const counted = Math.min(delta, Math.max(0, allowed - run.count), step.target - run.count);
    if (counted <= 0) return res;
    run.count += counted;
    run.pulses += counted;
    run.lastPulseAt = at;
    res.counted = counted;
    if (run.count >= step.target) {
      const g = gradeCount(step, run.count, elapsed);
      this.grade(id, run, g.grade, g.reason, at);
      res.finished = true;
      this.checkAllDone(now);
    }
    return res;
  }

  /**
   * While paused: keep the phone counter in sync and end a press at the pause moment, but count
   * nothing new.
   */
  absorb(id: number, f: InputFrame, now: number): void {
    const cook = this.cooks.get(id);
    if (!cook) return;
    cook.lastTaps = f.taps & 0xffff;
    const isHeld = (f.buttons & GESTURE_HOLD) !== 0;
    cook.held = isHeld;
    const run = this.runs.get(id);
    const spec = this.step.hold;
    if (isHeld || !run || !spec || run.pressAt === null || run.doneAt !== null || this.phase !== 'cook')
      return;
    const end = Math.max(run.pressAt, Math.min(now, this.deadline));
    run.banked += (end - run.pressAt) / spec.fillMs;
    run.pressAt = null;
    if (run.banked >= spec.lo) {
      this.finishHold(id, run, spec, Math.min(spec.burn, run.banked), end);
      this.checkAllDone(now);
    }
  }

  private finishHold(id: number, run: StepRun, spec: HoldSpec, amount: number, at: number): void {
    run.amount = Math.min(spec.burn, amount);
    const g = gradeHold(spec, run.amount);
    this.grade(id, run, g.grade, g.reason, at);
  }

  private grade(id: number, run: StepRun, grade: Grade, reason: GradeReason, at: number): void {
    const s = this.stats.get(id);
    if (!s || run.grade !== null) return;
    const step = this.step;
    run.doneAt = at;
    run.grade = grade;
    run.reason = reason;
    if (!step.hold) run.amount = Math.min(1, run.count / step.target);
    if (grade === 'sempurna') {
      s.streak++;
      s.perfects++;
      if (s.streak > s.bestStreak) s.bestStreak = s.streak;
    } else {
      s.streak = 0;
    }
    if (grade === 'gagal') s.fails++;
    run.points = GRADE_POINTS[grade] + (grade === 'sempurna' ? streakBonus(s.streak) : 0);
    s.score += run.points;
    s.dishPoints[this.dishIndex] = (s.dishPoints[this.dishIndex] ?? 0) + run.points;
    const dg = s.grades[this.dishIndex];
    if (dg) dg[this.stepIndex] = grade;
    const dr = s.reasons[this.dishIndex];
    if (dr) dr[this.stepIndex] = reason;
    const da = s.amounts[this.dishIndex];
    if (da) da[this.stepIndex] = run.amount;

    const elapsed = at - this.cookStartAt;
    const finished = grade === 'sempurna' || grade === 'bagus';
    if (finished && !step.hold && (step.skill === 'knife' || step.skill === 'pound')) s.knifeMs.push(elapsed);
    if (finished && step.skill === 'stir') s.stirMs.push(elapsed);
    if (step.hold) {
      if (reason === 'burnt') s.burns++;
      else if (reason === 'golden' || reason === 'close' || reason === 'over') {
        s.holdErrors.push(Math.abs(run.amount - step.hold.sweet));
      }
    }
    this.emit({ type: 'done', id, grade, reason, points: run.points, streak: s.streak });
  }

  private checkAllDone(now: number): void {
    if (this.phase !== 'cook' || this.allDoneAt !== null) return;
    let any = false;
    for (const id of this.participants) {
      if (!this.connected.has(id)) continue;
      any = true;
      const run = this.runs.get(id);
      if (!run || run.doneAt === null) return;
    }
    if (any) this.allDoneAt = now;
  }

  /* ---------------------------------------------------------------- time */

  tick(now: number): void {
    // Bounded: each pass advances at least one phase.
    for (let guard = 0; guard < 64; guard++) {
      if (this.phase === 'ended') return;
      if (this.phase === 'cook') {
        this.burnCheck(now);
        this.checkAllDone(now);
        if (now < this.cookEndsAt) return;
        this.endCook(this.cookEndsAt);
        continue;
      }
      if (now < this.phaseEndsAt) return;
      this.advance(this.phaseEndsAt);
    }
  }

  /** Holders whose food went past the burn point (with grace for a release in flight). */
  private burnCheck(now: number): void {
    const spec = this.step.hold;
    if (!spec) return;
    for (const id of this.participants) {
      const run = this.runs.get(id);
      if (!run || run.doneAt !== null || run.pressAt === null) continue;
      const burnAt = run.pressAt + (spec.burn - run.banked) * spec.fillMs;
      if (burnAt > this.deadline) continue;
      if (now - BURN_GRACE_MS >= burnAt) {
        run.pressAt = null;
        run.banked = spec.burn;
        this.finishHold(id, run, spec, spec.burn, burnAt);
      }
    }
  }

  private endCook(at: number): void {
    const step = this.step;
    const results: StepResult[] = [];
    for (const id of this.participants) {
      let run = this.runs.get(id);
      if (!run) {
        run = newRun();
        this.runs.set(id, run);
      }
      if (run.grade === null) {
        if (!this.connected.has(id)) {
          this.grade(id, run, 'gagal', 'missed', this.deadline);
        } else if (step.hold) {
          const amount = this.amountAt(id, this.deadline);
          run.pressAt = null;
          run.banked = amount;
          this.finishHold(id, run, step.hold, amount, this.deadline);
        } else {
          const g = gradeCount(step, run.count, null);
          this.grade(id, run, g.grade, g.reason, this.deadline);
        }
      }
      const s = this.stats.get(id)!;
      results.push({ id, grade: run.grade!, reason: run.reason!, points: run.points, streak: s.streak });
    }
    this.phase = 'reveal';
    this.phaseStartAt = at;
    this.phaseEndsAt = at + REVEAL_MS;
    this.emit({ type: 'reveal', dishIndex: this.dishIndex, stepIndex: this.stepIndex, results });
  }

  private advance(at: number): void {
    switch (this.phase) {
      case 'intro':
        this.stepIndex = 0;
        this.startReady(at);
        return;
      case 'ready':
        this.phase = 'cook';
        this.phaseStartAt = at;
        this.cookStartAt = at;
        this.deadline = at + this.step.timeMs;
        this.phaseEndsAt = this.deadline;
        this.allDoneAt = null;
        this.emit({
          type: 'cook',
          dishIndex: this.dishIndex,
          stepIndex: this.stepIndex,
          deadline: this.deadline,
        });
        this.checkAllDone(at);
        return;
      case 'reveal':
        if (this.stepIndex + 1 < this.dish.steps.length) {
          this.stepIndex++;
          this.startReady(at);
        } else {
          this.startShowcase(at);
        }
        return;
      case 'showcase':
        if (this.dishIndex + 1 < this.dishes.length) {
          this.dishIndex++;
          this.stepIndex = 0;
          this.runs.clear();
          this.phase = 'intro';
          this.phaseStartAt = at;
          this.phaseEndsAt = at + INTRO_MS;
          this.emit({ type: 'intro', dishIndex: this.dishIndex });
        } else {
          this.phase = 'final';
          this.phaseStartAt = at;
          this.phaseEndsAt = at + FINAL_MS;
          this.emit({ type: 'final' });
        }
        return;
      case 'final':
        this.phase = 'ended';
        this.phaseStartAt = at;
        this.emit({ type: 'end' });
        return;
      default:
        return;
    }
  }

  private startReady(at: number): void {
    this.phase = 'ready';
    this.phaseStartAt = at;
    this.phaseEndsAt = at + READY_MS;
    this.allDoneAt = null;
    this.runs.clear();
    for (const id of this.participants) this.runs.set(id, newRun());
    this.emit({ type: 'ready', dishIndex: this.dishIndex, stepIndex: this.stepIndex });
  }

  private startShowcase(at: number): void {
    const results: DishResult[] = [];
    const n = this.dish.steps.length;
    for (const id of this.participants) {
      const s = this.stats.get(id)!;
      const stars = dishStars(s.grades[this.dishIndex] ?? [], n);
      const bonus = stars * STAR_BONUS;
      s.dishStars[this.dishIndex] = stars;
      s.stars += stars;
      s.score += bonus;
      s.dishPoints[this.dishIndex] = (s.dishPoints[this.dishIndex] ?? 0) + bonus;
      results.push({ id, stars, points: s.dishPoints[this.dishIndex]!, bonus });
    }
    this.phase = 'showcase';
    this.phaseStartAt = at;
    this.phaseEndsAt = at + SHOWCASE_MS;
    this.emit({ type: 'showcase', dishIndex: this.dishIndex, results });
  }

  private emit(e: MasakEvent): void {
    this.events.push(e);
  }
}
