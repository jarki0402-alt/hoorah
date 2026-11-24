/**
 * Langkah Maut rules (pure, no DOM/three): everyone walks the same deadly path in step. The main
 * screen shows arrows (cues); each one must be pressed on the phone before its window closes.
 * The wrong arrow, pressing too late, or (in Lorong Laser) jumping too early = falling into the
 * abyss. Whoever fell joins again in the next babak. Eight babak types, each with its own hazard
 * and rhythm; the tempo climbs inside a babak. The last babak scores double.
 *
 * Fairness: presses carry the time they happened on the phone (server clock), so the game judges
 * the moment of the press, not its arrival. A cue only counts as missed once a short network grace
 * has passed after its window.
 *
 * Time is babak time in seconds (pause-aware, starts at 0 when a babak's play begins).
 */
import type { Fruit, Look } from '@hoorah/protocol';

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];

export type Stage = 'eskalator' | 'titian' | 'tangga' | 'laser' | 'batu' | 'gua' | 'ingat' | 'lift';
export const STAGES: readonly Stage[] = [
  'eskalator',
  'titian',
  'tangga',
  'laser',
  'batu',
  'gua',
  'ingat',
  'lift',
];

export type Choice = 'acak' | Stage;

export function isChoice(v: unknown): v is Choice {
  return v === 'acak' || (typeof v === 'string' && (STAGES as readonly string[]).includes(v));
}

/** How tense a babak feels: Acak plays its picks from calm to scary. */
const TENSION: Record<Stage, number> = {
  eskalator: 1,
  titian: 2,
  batu: 3,
  tangga: 4,
  ingat: 5,
  laser: 6,
  lift: 7,
  gua: 8,
};

export type Phase = 'setup' | 'intro' | 'play' | 'end' | 'final' | 'done';
export type Judge = 'pas' | 'ok';
export type FallWhy = 'wrong' | 'late' | 'early';

export const TIMING = {
  intro: 3.5,
  /** A babak ends after this long even if people are still standing. */
  babak: 60,
  /** No new cue starts this close to the end. */
  lastCue: 2.5,
  /** Late frames may still arrive this long after a window closes. */
  grace: 0.25,
  /** Everybody fell: the babak closes after this pause. */
  allDown: 1.6,
  end: 5,
  final: 9,
  /** Two presses of the same arrow this close together are one bouncy finger. */
  debounce: 0.09,
  /** A press may claim at most this much network delay (clamped by the director). */
  maxLag: 0.5,
};

export const POINTS = {
  pas: 10,
  ok: 5,
  /** +2 per 5 PAS in a row, up to +10. */
  streakStep: 5,
  streakMax: 10,
  survive: 30,
};

export interface PlayerInfo {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
  cpu: boolean;
}

export interface Cue {
  i: number;
  dir: Dir;
  /** Becomes visible (and pressable unless `open` is later). */
  show: number;
  /** Earliest press that counts; earlier presses after `show` are "too early" (laser only). */
  open: number;
  /** The beat: pressing near it is PAS. */
  at: number;
  /** Last moment a press counts. */
  close: number;
  /** The arrow hides at this time (dark cave, memory), null = stays. */
  hide: number | null;
  /** Ingat Jalan: the sequence this cue belongs to. */
  group: number;
}

export interface WalkerStats {
  steps: number;
  pas: number;
  falls: number;
  survived: number;
  bestStreak: number;
  /** Most steps in one babak. */
  best: number;
  /** Falls by pressing the wrong arrow. */
  wrong: number;
  /** Steps taken at the fastest tempos (interval under 0.6 s). */
  fast: number;
}

export interface Walker extends PlayerInfo {
  total: number;
  rounds: number[];
  inRound: boolean;
  fallen: boolean;
  fellAt: number;
  why: FallWhy | null;
  /** Best steps before the last fall (for "nyaris rekor"). */
  prevBest: number;
  /** Index of the cue this walker has to press next. */
  next: number;
  /** Cues cleared this babak. */
  step: number;
  streak: number;
  babakPoints: number;
  lastPress: number;
  lastDir: Dir | null;
  lastJudge: Judge | null;
  lastJudgeAt: number;
  stats: WalkerStats;
}

export type LangkahEvent =
  | { k: 'babak'; no: number; stage: Stage }
  | { k: 'play' }
  | { k: 'cue'; i: number }
  | { k: 'memorize'; group: number; length: number; recallAt: number }
  | { k: 'recall'; group: number }
  | { k: 'step'; id: number; i: number; judge: Judge; points: number }
  | { k: 'fall'; id: number; why: FallWhy; step: number; best: number; record: boolean }
  | { k: 'speed'; level: number }
  | { k: 'second'; left: number }
  | { k: 'babakEnd'; points: Map<number, number>; survivors: number[] }
  | { k: 'final' }
  | { k: 'done' };

export interface MatchOptions {
  players: PlayerInfo[];
  /** Babak count for Acak; a chosen babak plays 3 times, faster each time. */
  rounds: number;
  seed: number;
  skill?: number;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tempo of a stage: seconds between cues at the start, the floor, and the ramp time. */
const TEMPO: Record<Stage, { start: number; min: number; ramp: number }> = {
  eskalator: { start: 1.2, min: 0.42, ramp: 50 },
  titian: { start: 1.5, min: 0.6, ramp: 50 },
  tangga: { start: 1.1, min: 0.42, ramp: 48 },
  laser: { start: 1.9, min: 0.8, ramp: 50 },
  batu: { start: 1.35, min: 0.52, ramp: 50 },
  gua: { start: 1.3, min: 0.5, ramp: 50 },
  ingat: { start: 1.3, min: 0.75, ramp: 50 },
  lift: { start: 1.6, min: 0.62, ramp: 50 },
};

/** Seconds between cues at babak time `t` (difficulty `lvl` starts a repeated babak faster). */
export function intervalAt(stage: Stage, t: number, lvl: number): number {
  const tp = TEMPO[stage];
  const start = tp.start / (1 + 0.14 * lvl);
  const k = Math.min(1, Math.max(0, t / tp.ramp));
  // Eases in: calm opening, then the squeeze.
  const e = k * k * (3 - 2 * k);
  return start + (tp.min - start) * e;
}

/** Speed shown on screen, e.g. 2.4 for "x2,4". */
export function speedAt(stage: Stage, t: number, lvl: number): number {
  return TEMPO[stage].start / intervalAt(stage, t, lvl);
}

/** Directions a stage uses. */
export function dirsOf(stage: Stage): readonly Dir[] {
  switch (stage) {
    case 'titian':
      return ['left', 'right'];
    case 'laser':
      return ['up', 'down'];
    case 'batu':
      return ['left', 'up', 'right'];
    default:
      return DIRS;
  }
}

/** The babak list for a Host pick. */
export function planBabak(pick: Choice, rounds: number, rnd: () => number): Stage[] {
  if (pick !== 'acak') return [pick, pick, pick];
  const n = Math.max(1, Math.min(STAGES.length, Math.floor(rounds)));
  const pool = [...STAGES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n).sort((a, b) => TENSION[a] - TENSION[b]);
}

/** PAS window around the beat for a given interval. */
export function pasWindow(interval: number): number {
  return Math.min(0.2, 0.09 + interval * 0.09);
}

interface CpuPlan {
  cue: number;
  at: number;
  dir: Dir;
}

export class LangkahMatch {
  readonly players: Walker[] = [];
  readonly rounds: number;
  phase: Phase = 'setup';
  phaseT = 0;
  pick: Choice = 'acak';
  plan: Stage[] = [];
  /** Babak index (0-based). */
  babak = 0;
  /** Babak time (seconds since play began). */
  t = 0;
  cues: Cue[] = [];
  /** Ingat Jalan: the current sequence, its memorise and recall times. */
  memo: { group: number; length: number; showAt: number; recallAt: number } | null = null;
  /** Best steps this session: who and how many. */
  record: { id: number; name: string; steps: number } | null = null;
  private nextCueAt = 0;
  private group = 0;
  private allDownAt: number | null = null;
  private speedLevel = 0;
  private lastSecond = -1;
  private readonly rnd: () => number;
  private readonly skill: number;
  private readonly auto = new Set<number>();
  private readonly cpuPlans = new Map<number, CpuPlan>();
  private lastDir: Dir | null = null;
  private announced = 0;
  private memoRecalled = true;
  private events: LangkahEvent[] = [];

  constructor(opts: MatchOptions) {
    this.rounds = Math.max(1, Math.min(8, Math.floor(opts.rounds)));
    this.rnd = rng(opts.seed);
    this.skill = Math.max(0, Math.min(1, opts.skill ?? 0.45));
    for (const p of opts.players.slice(0, 16)) this.players.push(this.makeWalker(p, true));
  }

  private makeWalker(p: PlayerInfo, inRound: boolean): Walker {
    return {
      ...p,
      total: 0,
      rounds: [],
      inRound,
      fallen: false,
      fellAt: 0,
      why: null,
      prevBest: 0,
      next: 0,
      step: 0,
      streak: 0,
      babakPoints: 0,
      lastPress: Number.NEGATIVE_INFINITY,
      lastDir: null,
      lastJudge: null,
      lastJudgeAt: Number.NEGATIVE_INFINITY,
      stats: { steps: 0, pas: 0, falls: 0, survived: 0, bestStreak: 0, best: 0, wrong: 0, fast: 0 },
    };
  }

  /* ------------------------------------------------------------------ queries */

  player(id: number): Walker | undefined {
    return this.players.find((p) => p.id === id);
  }

  get stage(): Stage {
    return this.plan[this.babak] ?? 'eskalator';
  }

  /** Difficulty step of this babak (a chosen babak repeats faster). */
  get level(): number {
    return this.pick === 'acak' ? Math.floor(this.babak / 2) : this.babak;
  }

  get babakCount(): number {
    return this.plan.length || (this.pick === 'acak' ? this.rounds : 3);
  }

  get isFinal(): boolean {
    return this.plan.length > 0 && this.babak === this.plan.length - 1;
  }

  get interval(): number {
    return intervalAt(this.stage, this.t, this.level);
  }

  get speed(): number {
    return speedAt(this.stage, this.t, this.level);
  }

  get secondsLeft(): number {
    return this.phase === 'play' ? Math.max(0, TIMING.babak - this.t) : 0;
  }

  alive(): Walker[] {
    return this.players.filter((p) => p.inRound && !p.fallen);
  }

  contestants(): Walker[] {
    return this.players.filter((p) => p.inRound);
  }

  /** Steps the group has taken: the most cleared by anyone this babak. */
  get stepNo(): number {
    let n = 0;
    for (const p of this.players) if (p.inRound) n = Math.max(n, p.step);
    return n;
  }

  /** The cue a walker has to press now, if it is visible. */
  cueFor(p: Walker): Cue | null {
    const c = this.cues[p.next];
    return c && c.show <= this.t ? c : null;
  }

  /** The cue after it (preview), once the current one is visible. */
  nextCueFor(p: Walker): Cue | null {
    return this.cueFor(p) ? (this.cues[p.next + 1] ?? null) : null;
  }

  standings(): Walker[] {
    return [...this.players].sort((a, b) => b.total - a.total || b.stats.best - a.stats.best);
  }

  drainEvents(): LangkahEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /* ------------------------------------------------------------------ lineup */

  addPlayer(p: PlayerInfo): void {
    if (this.player(p.id) || this.players.length >= 16) return;
    const now = this.phase === 'setup' || this.phase === 'intro';
    this.players.push(this.makeWalker(p, now));
  }

  removePlayer(id: number): void {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.players.splice(i, 1);
    this.auto.delete(id);
    this.cpuPlans.delete(id);
  }

  restyle(id: number, look: Pick<PlayerInfo, 'name' | 'color' | 'fruit' | 'look'>): void {
    const p = this.player(id);
    if (p) Object.assign(p, look);
  }

  setAuto(id: number, on: boolean): void {
    if (on) this.auto.add(id);
    else {
      this.auto.delete(id);
      this.cpuPlans.delete(id);
    }
  }

  /* ------------------------------------------------------------------ setup (Host) */

  choose(v: string): boolean {
    if (this.phase !== 'setup' || !isChoice(v)) return false;
    this.pick = v;
    return true;
  }

  start(): boolean {
    if (this.phase !== 'setup') return false;
    this.plan = planBabak(this.pick, this.rounds, this.rnd);
    this.startBabak(0);
    return true;
  }

  /* ------------------------------------------------------------------ input */

  /**
   * A press on the phone at babak time `at` (already corrected for network delay by the caller).
   * Returns the judgement, or null when the press was ignored.
   */
  press(id: number, dir: Dir, at: number): Judge | 'fall' | null {
    const p = this.player(id);
    if (!p || this.phase !== 'play' || !p.inRound || p.fallen) return null;
    if (at < p.lastPress) return null;
    if (p.lastDir === dir && at - p.lastPress < TIMING.debounce) return null;
    const c = this.cues[p.next];
    if (!c || at < c.show) return null;
    p.lastPress = at;
    p.lastDir = dir;
    if (at < c.open) {
      this.fall(p, 'early', at);
      return 'fall';
    }
    if (at > c.close) {
      this.fall(p, 'late', c.close);
      return 'fall';
    }
    if (dir !== c.dir) {
      p.stats.wrong++;
      this.fall(p, 'wrong', at);
      return 'fall';
    }
    const iv = intervalAt(this.stage, c.at, this.level);
    const judge: Judge =
      Math.abs(at - c.at) <= pasWindow(iv) || (at <= c.at && this.stage === 'ingat') ? 'pas' : 'ok';
    let pts: number;
    if (judge === 'pas') {
      p.streak++;
      p.stats.pas++;
      p.stats.bestStreak = Math.max(p.stats.bestStreak, p.streak);
      pts = POINTS.pas + Math.min(POINTS.streakMax, Math.floor(p.streak / POINTS.streakStep) * 2);
    } else {
      p.streak = 0;
      pts = POINTS.ok;
    }
    if (this.isFinal) pts *= 2;
    p.next++;
    p.step++;
    p.stats.steps++;
    if (iv < 0.6) p.stats.fast++;
    p.babakPoints += pts;
    p.lastJudge = judge;
    p.lastJudgeAt = at;
    this.events.push({ k: 'step', id, i: c.i, judge, points: pts });
    return judge;
  }

  /* ------------------------------------------------------------------ flow */

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseT = 0;
  }

  private startBabak(no: number): void {
    this.babak = no;
    this.t = 0;
    this.cues = [];
    this.announced = 0;
    this.memo = null;
    this.memoRecalled = true;
    this.group = 0;
    this.nextCueAt = 1.4;
    this.allDownAt = null;
    this.speedLevel = 0;
    this.lastSecond = -1;
    this.cpuPlans.clear();
    for (const p of this.players) {
      p.inRound = true;
      p.fallen = false;
      p.why = null;
      p.next = 0;
      p.step = 0;
      p.streak = 0;
      p.babakPoints = 0;
      p.lastPress = Number.NEGATIVE_INFINITY;
      p.lastDir = null;
      p.lastJudge = null;
    }
    this.setPhase('intro');
    this.events.push({ k: 'babak', no, stage: this.stage });
  }

  tick(dt: number): void {
    if (this.phase === 'done' || this.phase === 'setup' || dt <= 0) return;
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= TIMING.intro) {
          this.setPhase('play');
          this.events.push({ k: 'play' });
        }
        return;
      case 'play':
        this.t += dt;
        this.spawnCues();
        this.runCpus();
        this.checkLate();
        this.checkClock();
        return;
      case 'end':
        if (this.phaseT >= TIMING.end) {
          if (this.babak + 1 < this.plan.length) this.startBabak(this.babak + 1);
          else {
            this.setPhase('final');
            this.events.push({ k: 'final' });
          }
        }
        return;
      case 'final':
        if (this.phaseT >= TIMING.final) {
          this.setPhase('done');
          this.events.push({ k: 'done' });
        }
        return;
    }
  }

  private pickDir(stage: Stage): Dir {
    const dirs = dirsOf(stage);
    // Avoid long runs of the same arrow (except the stairs, which mostly climb).
    for (let k = 0; k < 4; k++) {
      const d = dirs[Math.floor(this.rnd() * dirs.length)]!;
      if (d !== this.lastDir || this.rnd() < 0.3) return d;
    }
    return dirs[0]!;
  }

  private pushCue(c: Omit<Cue, 'i'>): void {
    const cue: Cue = { ...c, i: this.cues.length };
    this.cues.push(cue);
    this.lastDir = cue.dir;
  }

  /** Builds cues a little ahead of time so they can show before their beat. */
  private spawnCues(): void {
    const stage = this.stage;
    // Memory sequences start exactly when shown; other cues are built ahead so they can show early.
    const horizon = stage === 'ingat' ? this.t : this.t + 3;
    while (this.nextCueAt <= horizon && this.nextCueAt < TIMING.babak - TIMING.lastCue) {
      if (stage === 'ingat') {
        this.spawnMemo();
        continue;
      }
      const at = this.nextCueAt;
      const iv = intervalAt(stage, at, this.level);
      const late = Math.max(0.12, Math.min(0.3, iv * 0.3));
      let dir: Dir;
      let gap = iv;
      let show = at - iv;
      let open = show;
      let hide: number | null = null;
      switch (stage) {
        case 'tangga': {
          // Mostly up; every 3–5 steps a landing turns left or right.
          const sinceTurn = this.cues.length - this.lastTurnIndex();
          const turn = sinceTurn >= 3 + Math.floor(this.rnd() * 3);
          dir = turn ? (this.rnd() < 0.5 ? 'left' : 'right') : 'up';
          break;
        }
        case 'titian':
        case 'lift':
          // Irregular sways and jolts.
          dir = this.pickDir(stage);
          gap = iv * (0.75 + this.rnd() * 0.6);
          show = at - Math.min(iv, gap) * (stage === 'lift' ? 0.8 : 1);
          open = show;
          break;
        case 'laser':
          dir = this.rnd() < 0.5 ? 'up' : 'down';
          show = at - 2.2;
          open = at - Math.max(0.32, Math.min(0.5, iv * 0.45));
          break;
        case 'gua':
          dir = this.pickDir(stage);
          hide = show + Math.max(0.28, iv * 0.45);
          break;
        default:
          dir = this.pickDir(stage);
      }
      this.pushCue({
        dir,
        show: Math.max(0, show),
        open: Math.max(0, open),
        at,
        close: at + late,
        hide,
        group: 0,
      });
      this.nextCueAt = at + gap;
    }
    // Announce cues as they appear.
    while (this.announced < this.cues.length && this.cues[this.announced]!.show <= this.t) {
      this.events.push({ k: 'cue', i: this.announced });
      this.announced++;
    }
    if (this.memo && this.memo.recallAt <= this.t && !this.memoRecalled) {
      this.memoRecalled = true;
      this.events.push({ k: 'recall', group: this.memo.group });
    }
  }

  private lastTurnIndex(): number {
    for (let i = this.cues.length - 1; i >= 0; i--) {
      const d = this.cues[i]!.dir;
      if (d === 'left' || d === 'right') return i;
    }
    return -1;
  }

  /** Ingat Jalan: show a sequence, then everyone repeats it from memory, one longer each time. */
  private spawnMemo(): void {
    const length = 3 + this.level + this.group;
    const showAt = this.nextCueAt;
    const look = 1.6 + length * 0.45;
    const recallAt = showAt + look;
    const per = Math.max(TEMPO.ingat.min, intervalAt('ingat', showAt, this.level));
    const group = this.group++;
    for (let j = 0; j < length; j++) {
      const close = recallAt + (j + 1) * per + 0.25;
      this.pushCue({
        dir: this.pickDir('ingat'),
        show: recallAt,
        open: recallAt,
        at: close - per * 0.55,
        close,
        hide: recallAt,
        group,
      });
    }
    this.memo = { group, length, showAt, recallAt };
    this.memoRecalled = false;
    this.events.push({ k: 'memorize', group, length, recallAt });
    this.nextCueAt = recallAt + length * per + 1.6;
  }

  /** The cues of the current memory sequence (shown before recall). */
  memoCues(): Cue[] {
    if (!this.memo) return [];
    const g = this.memo.group;
    return this.cues.filter((c) => c.group === g && this.stage === 'ingat');
  }

  private runCpus(): void {
    const s = this.skill;
    for (const p of this.alive()) {
      if (!p.cpu && !this.auto.has(p.id)) continue;
      const c = this.cues[p.next];
      if (!c || c.show > this.t) continue;
      let plan = this.cpuPlans.get(p.id);
      if (!plan || plan.cue !== c.i) {
        const skill = p.cpu ? s : 0.35;
        const iv = intervalAt(this.stage, c.at, this.level);
        const react = 0.5 - 0.28 * skill + (this.rnd() - 0.5) * 0.12;
        let at: number;
        if (this.stage === 'laser') at = c.at - this.rnd() * (c.at - c.open) * 0.8;
        else if (this.stage === 'ingat') at = c.show + (c.i - this.firstOfGroup(c.group)) * iv * 0.55 + react;
        else at = c.at - iv * 0.15 + (react - 0.3) * 0.8;
        // Slips grow with the tempo and the memory load.
        const memoLoad = this.stage === 'ingat' ? (c.i - this.firstOfGroup(c.group)) * 0.012 : 0;
        const pWrong = 0.006 + (1 - skill) * 0.03 + Math.max(0, 0.75 - iv) * (0.2 - 0.15 * skill) + memoLoad;
        let dir = c.dir;
        if (this.rnd() < pWrong) {
          const others = dirsOf(this.stage).filter((d) => d !== c.dir);
          dir = others[Math.floor(this.rnd() * others.length)] ?? c.dir;
        }
        plan = { cue: c.i, at: Math.max(c.open + 0.02, at), dir };
        this.cpuPlans.set(p.id, plan);
      }
      if (this.t >= plan.at) {
        this.cpuPlans.delete(p.id);
        this.press(p.id, plan.dir, Math.min(this.t, plan.at));
      }
    }
  }

  private firstOfGroup(group: number): number {
    const c = this.cues.find((x) => x.group === group);
    return c ? c.i : 0;
  }

  private checkLate(): void {
    for (const p of this.alive()) {
      const c = this.cues[p.next];
      if (c && this.t > c.close + TIMING.grace) this.fall(p, 'late', c.close);
    }
  }

  private checkClock(): void {
    const level = this.speed >= 2.2 ? 2 : this.speed >= 1.6 ? 1 : 0;
    if (level > this.speedLevel) {
      this.speedLevel = level;
      this.events.push({ k: 'speed', level });
    }
    const left = Math.ceil(TIMING.babak - this.t);
    if (left <= 5 && left >= 1 && left !== this.lastSecond) {
      this.lastSecond = left;
      this.events.push({ k: 'second', left });
    }
    const alive = this.alive().length;
    if (alive === 0 && this.contestants().length > 0) {
      if (this.allDownAt === null) this.allDownAt = this.t;
      if (this.t - this.allDownAt >= TIMING.allDown) this.endBabak();
      return;
    }
    if (this.t >= TIMING.babak) this.endBabak();
  }

  private fall(p: Walker, why: FallWhy, at: number): void {
    if (p.fallen) return;
    p.fallen = true;
    p.fellAt = at;
    p.why = why;
    p.streak = 0;
    p.stats.falls++;
    const best = p.stats.best;
    p.prevBest = best;
    const record = best > 0 && p.step > best;
    p.stats.best = Math.max(best, p.step);
    this.noteRecord(p);
    this.cpuPlans.delete(p.id);
    this.events.push({ k: 'fall', id: p.id, why, step: p.step, best, record });
  }

  private noteRecord(p: Walker): void {
    if (p.step > 0 && (!this.record || p.step > this.record.steps))
      this.record = { id: p.id, name: p.name, steps: p.step };
  }

  private endBabak(): void {
    const survivors: number[] = [];
    const points = new Map<number, number>();
    const mult = this.isFinal ? 2 : 1;
    for (const p of this.contestants()) {
      if (!p.fallen) {
        survivors.push(p.id);
        p.stats.survived++;
        p.babakPoints += POINTS.survive * mult;
        p.stats.best = Math.max(p.stats.best, p.step);
        this.noteRecord(p);
      }
      points.set(p.id, p.babakPoints);
      p.total += p.babakPoints;
    }
    for (const p of this.players) {
      while (p.rounds.length < this.babak) p.rounds.push(0);
      p.rounds[this.babak] = points.get(p.id) ?? 0;
    }
    this.setPhase('end');
    this.events.push({ k: 'babakEnd', points, survivors });
  }
}
