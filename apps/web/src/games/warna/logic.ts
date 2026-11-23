/**
 * Petualangan Warna session (pure): the Host picks a world, then a stage of it (stages open in
 * order: a stage is open once the one before it was finished or skipped on this screen), then
 * the group plays `stages` stages in a row. Each stage builds a fresh World from the people
 * connected at its start (two characters for someone playing alone, swapped with TUKAR), scores
 * up to three stars and adds every character's deeds to its owner's tally for the awards.
 *
 * Help (owner 2026-11-22): staged hints (first a pointer at the next thing to use, then its
 * path), a hint button that pulses after HINT_IDLE_S without progress, and the Host may skip a
 * stage after SKIP_AFTER_S.
 *
 * Phases: select (world → level) → intro → play → clear → (intro of the next stage | done).
 */
import type { Fruit } from '@hoorah/protocol';
import { BIOMES, type BiomeId, biomeOf, type HintTarget, LEVELS, type Level, type Slot } from './levels';
import { type CharSpec, type CharStats, TUNE, World, type WorldEvent } from './world';

export const INTRO_S = 3.2;
export const CLEAR_S = 5.5;
/** A restart vote stays open this long (solo: the second tap must come within it). */
export const VOTE_S = 6;
export const VOTE_SOLO_S = 3;
/** The hint button pulses after this long without progress. */
export const HINT_IDLE_S = 45;
/** A hint stays on screen this long after a press. */
export const HINT_SHOW_S = 12;
/** The Host may skip a stage after this long in it. */
export const SKIP_AFTER_S = 180;

export type Phase = 'select' | 'intro' | 'play' | 'clear' | 'done';
export type PickStep = 'world' | 'level';

/** Best stars per stage id on this screen; present = finished (0 = skipped). */
export type Progress = Record<string, number>;

/** What the current hint points at (tile coordinates of the target's centre). */
export interface HintInfo {
  target: HintTarget;
  kind: 'box' | 'plate' | 'lever' | 'exit';
  x: number;
  y: number;
  /** 1: pointer and one line; 2: also the path from the nearest character. */
  level: 1 | 2;
  from: { x: number; y: number } | null;
}

/** Whether a stage can be picked: the first of its world, or the one before it is finished. */
export function isOpen(lv: Level, progress: Progress): boolean {
  if (lv.number <= 1) return true;
  const prev = biomeOf(lv.biome).levels[lv.number - 2];
  return prev !== undefined && progress[prev.id] !== undefined;
}

/** The stage a world opens on: the first open stage not finished yet, else its last open one. */
export function resumeLevel(world: BiomeId, progress: Progress): Level | undefined {
  const levels = biomeOf(world).levels;
  let last: Level | undefined;
  for (const lv of levels) {
    if (!isOpen(lv, progress)) break;
    last = lv;
    if (progress[lv.id] === undefined) return lv;
  }
  return last;
}

/** Stars earned in a world and the most it can give. */
export function worldStars(world: BiomeId, progress: Progress): { got: number; of: number } {
  const levels = biomeOf(world).levels;
  return { got: levels.reduce((n, lv) => n + (progress[lv.id] ?? 0), 0), of: levels.length * 3 };
}

/** Solo: the second character wears another fruit so the two are easy to tell apart. */
export function secondFruit(f: Fruit | undefined): Fruit {
  return f === 'semangka' ? 'nanas' : 'semangka';
}

export interface Person {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  connected: boolean;
}

export interface StageScore {
  level: string;
  stars: number;
  time: number;
  gems: number;
  gemTotal: number;
  starClear: boolean;
  starGems: boolean;
  starTime: boolean;
  skipped: boolean;
}

export type MatchEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'stage'; index: number }
  | { type: 'vote'; votes: number; need: number }
  | { type: 'voteEnd' }
  | { type: 'restart' }
  | { type: 'swap'; owner: number; key: number }
  | { type: 'ping'; key: number }
  | { type: 'hint'; level: 1 | 2 }
  | { type: 'skip' }
  | { type: 'world'; e: WorldEvent };

export interface Tally extends CharStats {
  id: number;
}

function emptyTally(id: number): Tally {
  return { id, jumps: 0, deaths: 0, gems: 0, pushed: 0, helped: 0, firstIn: 0 };
}

/** Stars of a finished stage. */
export function scoreStage(level: Level, time: number, gems: number, gemTotal: number): StageScore {
  const starGems = gemTotal === 0 || gems >= gemTotal;
  const starTime = time <= level.par;
  return {
    level: level.id,
    stars: 1 + (starGems ? 1 : 0) + (starTime ? 1 : 0),
    time,
    gems,
    gemTotal,
    starClear: true,
    starGems,
    starTime,
    skipped: false,
  };
}

function skippedScore(level: Level, time: number, gemTotal: number): StageScore {
  return {
    level: level.id,
    stars: 0,
    time,
    gems: 0,
    gemTotal,
    starClear: false,
    starGems: false,
    starTime: false,
    skipped: true,
  };
}

/** Votes needed to restart a stage: two people agree in a group (half the group when bigger). */
export function votesNeeded(people: number): number {
  return people <= 1 ? 1 : Math.max(2, Math.ceil(people / 2));
}

export class WarnaMatch {
  phase: Phase = 'select';
  pickStep: PickStep = 'world';
  /** World highlighted in the picker. */
  world: BiomeId = 'hutan';
  /** Level index (into LEVELS) highlighted in the picker. */
  pick = 0;
  /** Best stars per stage on this screen (updated as stages are finished). */
  readonly progress: Progress;
  /** Levels of this session, in play order. */
  order: number[] = [];
  stage = 0;
  readonly stages: number;
  sim: World | null = null;
  /** People in the current stage (owners of characters). */
  cast: Person[] = [];
  solo = false;
  /** Solo: which of the two characters the person steers. */
  steer: 0 | 1 = 0;
  phaseT = 0;
  playT = 0;
  readonly scores: StageScore[] = [];
  readonly tallies = new Map<number, Tally>();
  votes = new Set<number>();
  voteLeft = 0;
  /** Hint stage shown (0 = none), when it was asked for, and the step it was for. */
  hintLevel: 0 | 1 | 2 = 0;
  private hintAt = 0;
  private hintStep = -1;
  /** Last time anything moved the stage forward (gem, switch, door, box, exit). */
  lastProgress = 0;
  private readonly chEver = new Set<number>();
  private readonly boxMoved = new Set<number>();
  private people: Person[] = [];
  private events: MatchEvent[] = [];
  /** Last stick per person, re-applied when the solo steer swaps. */
  private readonly sticks = new Map<number, { x: number; jump: boolean }>();

  constructor(stages: number, progress: Progress = {}) {
    this.stages = Math.max(1, Math.min(LEVELS.length, Math.floor(stages)));
    this.progress = { ...progress };
    const first = resumeLevel('hutan', this.progress);
    if (first) this.pick = first.index;
  }

  get level(): Level {
    return LEVELS[this.order[this.stage] ?? this.pick] ?? LEVELS[0]!;
  }

  setPeople(people: readonly Person[]): void {
    this.people = people.map((p) => ({ ...p }));
    for (const p of this.people) if (!this.tallies.has(p.id)) this.tallies.set(p.id, emptyTally(p.id));
    const w = this.sim;
    if (!w) return;
    for (const c of w.chars) {
      const p = this.people.find((x) => x.id === c.owner);
      w.setActive(c.key, Boolean(p?.connected));
      if (!p?.connected) w.setInput(c.key, 0, false);
    }
    this.cast = this.cast.map((c) => this.people.find((p) => p.id === c.id) ?? { ...c, connected: false });
  }

  connected(): Person[] {
    return this.people.filter((p) => p.connected);
  }

  drainEvents(): MatchEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ------------------------------------------------------------------ picker */

  pickWorld(id: string): boolean {
    if (this.phase !== 'select' || this.pickStep !== 'world') return false;
    const b = BIOMES.find((x) => x.id === id);
    if (!b?.ready) return false;
    this.world = b.id;
    return true;
  }

  /** World chosen: show its stages, the next unfinished one highlighted. */
  toLevels(): boolean {
    if (this.phase !== 'select' || this.pickStep !== 'world') return false;
    const lv = resumeLevel(this.world, this.progress);
    if (!lv) return false;
    this.pick = lv.index;
    this.pickStep = 'level';
    return true;
  }

  toWorlds(): boolean {
    if (this.phase !== 'select' || this.pickStep !== 'level') return false;
    this.pickStep = 'world';
    return true;
  }

  pickLevel(id: string): boolean {
    if (this.phase !== 'select' || this.pickStep !== 'level') return false;
    const lv = LEVELS.find((l) => l.id === id);
    if (!lv || lv.biome !== this.world || !isOpen(lv, this.progress)) return false;
    this.pick = lv.index;
    return true;
  }

  start(): void {
    if (this.phase !== 'select' || this.pickStep !== 'level') return;
    const first = LEVELS[this.pick];
    if (!first || !isOpen(first, this.progress)) return;
    const levels = biomeOf(first.biome).levels;
    this.order = [];
    for (let n = first.number; n < first.number + this.stages && n <= levels.length; n++)
      this.order.push(levels[n - 1]!.index);
    this.stage = 0;
    this.beginStage();
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.events.push({ type: 'phase', phase: p });
  }

  private beginStage(): void {
    const here = this.connected();
    this.cast = here.length ? here : this.people.slice(0, 1);
    this.solo = this.cast.length === 1;
    this.steer = 0;
    const specs: CharSpec[] = this.solo
      ? [
          { owner: this.cast[0]!.id, sub: 0 },
          { owner: this.cast[0]!.id, sub: 1 },
        ]
      : this.cast.map((p) => ({ owner: p.id, sub: 0 as const }));
    this.sim = new World(this.level, specs, { solo: this.solo });
    this.playT = 0;
    this.resetHelp();
    this.clearVote();
    this.events.push({ type: 'stage', index: this.stage });
    this.setPhase('intro');
  }

  /* ------------------------------------------------------------------ input */

  /** Character steered by a person right now (solo: the active one of two). */
  charOf(owner: number): number {
    const w = this.sim;
    if (!w) return -1;
    const c = w.chars.find((ch) => ch.owner === owner && (!this.solo || ch.sub === this.steer));
    return c ? c.key : -1;
  }

  setStick(owner: number, x: number, jump: boolean): void {
    this.sticks.set(owner, { x, jump });
    if (this.phase !== 'play' || !this.sim) return;
    const key = this.charOf(owner);
    if (key >= 0) this.sim.setInput(key, x, jump);
  }

  swap(owner: number): void {
    const w = this.sim;
    if (!this.solo || !w || this.phase !== 'play' || this.cast[0]?.id !== owner) return;
    const from = this.charOf(owner);
    if (from >= 0) w.setInput(from, 0, false);
    this.steer = this.steer === 0 ? 1 : 0;
    const to = this.charOf(owner);
    const s = this.sticks.get(owner);
    // The held jump is not carried over: the new character would hop by itself.
    if (to >= 0) w.setInput(to, s?.x ?? 0, false);
    this.events.push({ type: 'swap', owner, key: to });
  }

  ping(owner: number): void {
    const key = this.charOf(owner);
    if (this.phase !== 'play' || key < 0 || !this.sim) return;
    this.sim.ping(key);
    this.events.push({ type: 'ping', key });
  }

  /** A press of ULANG. */
  restart(owner: number): void {
    if (this.phase !== 'play' || !this.cast.some((p) => p.id === owner)) return;
    const people = this.cast.filter((p) => p.connected).length || 1;
    const need = votesNeeded(people);
    if (this.voteLeft <= 0) {
      this.votes = new Set([owner]);
      this.voteLeft = people <= 1 ? VOTE_SOLO_S : VOTE_S;
      // A lone player confirms with a second tap; in a group one vote may already be enough.
      if (people > 1 && this.votes.size >= need) {
        this.doRestart();
        return;
      }
      this.events.push({ type: 'vote', votes: this.votes.size, need: people <= 1 ? 2 : need });
      return;
    }
    if (people <= 1) {
      if (this.votes.has(owner)) this.doRestart();
      return;
    }
    if (this.votes.has(owner)) return;
    this.votes.add(owner);
    if (this.votes.size >= need) this.doRestart();
    else this.events.push({ type: 'vote', votes: this.votes.size, need });
  }

  voteNeed(): number {
    const people = this.cast.filter((p) => p.connected).length || 1;
    return people <= 1 ? 2 : votesNeeded(people);
  }

  private clearVote(): void {
    if (this.voteLeft > 0) this.events.push({ type: 'voteEnd' });
    this.votes = new Set();
    this.voteLeft = 0;
  }

  private doRestart(): void {
    this.clearVote();
    this.events.push({ type: 'restart' });
    // Tallies keep what happened before the restart: effort still counts for the awards.
    this.addTallies();
    this.beginStageSame();
  }

  private beginStageSame(): void {
    const specs: CharSpec[] = this.sim
      ? this.sim.chars.map((c) => ({ owner: c.owner, sub: c.sub }))
      : this.cast.map((p) => ({ owner: p.id, sub: 0 as const }));
    this.sim = new World(this.level, specs, { solo: this.solo });
    for (const c of this.sim.chars) {
      const p = this.people.find((x) => x.id === c.owner);
      this.sim.setActive(c.key, Boolean(p?.connected));
    }
    this.steer = 0;
    this.playT = 0;
    this.resetHelp();
    this.setPhase('play');
  }

  private resetHelp(): void {
    this.hintLevel = 0;
    this.hintAt = 0;
    this.hintStep = -1;
    this.lastProgress = 0;
    this.chEver.clear();
    this.boxMoved.clear();
  }

  /* ------------------------------------------------------------------ help */

  /** A press of the hint button: pointer first, then the path. */
  hint(owner: number): void {
    if (this.phase !== 'play' || !this.inCast(owner)) return;
    const step = this.hintStepIndex();
    if (step !== this.hintStep) this.hintLevel = 0;
    this.hintStep = step;
    this.hintLevel = this.hintLevel >= 2 ? 2 : ((this.hintLevel + 1) as 1 | 2);
    this.hintAt = this.playT;
    this.events.push({ type: 'hint', level: this.hintLevel });
  }

  /** The hint button should draw attention (nothing moved forward for a while). */
  hintPulse(): boolean {
    return this.phase === 'play' && this.playT - this.lastProgress >= HINT_IDLE_S;
  }

  canSkip(): boolean {
    return this.phase === 'play' && this.playT >= SKIP_AFTER_S;
  }

  /** The Host gives up on this stage: no stars, but the next one opens. */
  skip(): boolean {
    if (!this.canSkip() || !this.sim) return false;
    const total = this.sim.gems.length;
    this.scores.push(skippedScore(this.level, this.playT, total));
    this.record(this.level.id, 0);
    this.addTallies();
    this.clearVote();
    this.events.push({ type: 'skip' });
    this.setPhase('clear');
    return true;
  }

  private record(id: string, stars: number): void {
    this.progress[id] = Math.max(this.progress[id] ?? 0, stars);
  }

  /** Index into the stage's hint order of the first step not done yet. */
  private hintStepIndex(): number {
    const lv = this.level;
    for (let i = 0; i < lv.hints.length; i++) {
      const t = lv.hints[i]!;
      if (t === 'exit') return i;
      if (t === 'box') {
        if (lv.boxes.some((_, b) => !this.boxMoved.has(b))) return i;
        continue;
      }
      const ch = Number(t.slice(2));
      if (!this.chEver.has(ch) && (lv.plates.some((p) => p.ch === ch) || lv.levers.some((l) => l.ch === ch)))
        return i;
    }
    return lv.hints.length - 1;
  }

  /** The hint on screen right now, or null. */
  currentHint(): HintInfo | null {
    const w = this.sim;
    if (this.phase !== 'play' || !w || this.hintLevel === 0) return null;
    const step = this.hintStepIndex();
    if (step !== this.hintStep || this.playT - this.hintAt > HINT_SHOW_S) return null;
    const lv = this.level;
    const target = lv.hints[step] ?? 'exit';
    const live = w.chars.filter((c) => !c.dead && c.active);
    const cx = live.length ? live.reduce((n, c) => n + c.x, 0) / live.length : 2;
    const cy = live.length ? live.reduce((n, c) => n + c.y, 0) / live.length : 14;
    const near = <T extends { x: number; y: number }>(list: readonly T[]): T | undefined =>
      list.reduce<T | undefined>(
        (best, p) =>
          !best || Math.hypot(p.x - cx, p.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? p : best,
        undefined,
      );
    let kind: HintInfo['kind'] = 'exit';
    let x = 0;
    let y = 0;
    if (target === 'box') {
      const b = w.boxes.find((_, i) => !this.boxMoved.has(i)) ?? w.boxes[0];
      if (!b) return null;
      kind = 'box';
      x = b.x + b.w / 2;
      y = b.y + b.h / 2;
    } else if (target === 'exit') {
      const e = near(lv.exits);
      if (!e) return null;
      x = e.x + 0.5;
      y = e.y;
    } else {
      const ch = Number(target.slice(2));
      const p = near([...lv.plates.filter((q) => q.ch === ch), ...lv.levers.filter((q) => q.ch === ch)]);
      if (!p) return null;
      kind = lv.plates.includes(p as (typeof lv.plates)[number]) ? 'plate' : 'lever';
      x = p.x + 0.5;
      y = p.y + 0.5;
    }
    const from = near(live.map((c) => ({ x: c.x + TUNE.charW / 2, y: c.y + TUNE.charH / 2 })));
    return { target, kind, x, y, level: this.hintLevel, from: from ?? null };
  }

  /** Notes what moved the stage forward (for the hint pulse and the hint steps). */
  private watch(e: WorldEvent): void {
    switch (e.type) {
      case 'gem':
      case 'checkpoint':
      case 'lever':
      case 'push':
      case 'exit':
        this.lastProgress = this.playT;
        return;
      case 'plate':
      case 'door':
        if ((e.type === 'plate' && e.on) || (e.type === 'door' && e.open)) this.lastProgress = this.playT;
        return;
      default:
        return;
    }
  }

  private trackSteps(): void {
    const w = this.sim;
    if (!w) return;
    for (const [ch, on] of w.active) if (on) this.chEver.add(ch);
    this.level.boxes.forEach((b, i) => {
      const now = w.boxes[i];
      if (now && Math.abs(now.x - b.x) >= 0.8) this.boxMoved.add(i);
    });
  }

  /* ------------------------------------------------------------------ time */

  update(dt: number): void {
    const step = Math.max(0, Math.min(dt, 0.25));
    this.phaseT += step;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= INTRO_S) {
          this.setPhase('play');
          this.applySticks();
        }
        return;
      case 'play': {
        const w = this.sim;
        if (!w) return;
        this.playT += step;
        if (this.voteLeft > 0) {
          this.voteLeft -= step;
          if (this.voteLeft <= 0) this.clearVote();
        }
        w.update(step);
        this.trackSteps();
        for (const e of w.drainEvents()) {
          this.watch(e);
          this.events.push({ type: 'world', e });
          if (e.type === 'clear') this.finishStage();
        }
        return;
      }
      case 'clear':
        if (this.phaseT >= CLEAR_S) {
          if (this.stage + 1 < this.order.length) {
            this.stage++;
            this.beginStage();
          } else this.setPhase('done');
        }
        return;
      default:
        return;
    }
  }

  private applySticks(): void {
    for (const [owner, s] of this.sticks) {
      const key = this.charOf(owner);
      if (key >= 0) this.sim?.setInput(key, s.x, false);
    }
  }

  private addTallies(): void {
    const w = this.sim;
    if (!w) return;
    for (const c of w.chars) {
      const t = this.tallies.get(c.owner) ?? emptyTally(c.owner);
      t.jumps += c.stats.jumps;
      t.deaths += c.stats.deaths;
      t.gems += c.stats.gems;
      t.pushed += c.stats.pushed;
      t.helped += c.stats.helped;
      t.firstIn += c.stats.firstIn;
      this.tallies.set(c.owner, t);
      c.stats = { jumps: 0, deaths: 0, gems: 0, pushed: 0, helped: 0, firstIn: 0 };
    }
  }

  private finishStage(): void {
    const w = this.sim;
    if (!w || this.phase !== 'play') return;
    const g = w.allGems();
    const score = scoreStage(this.level, this.playT, g.taken, g.total);
    this.scores.push(score);
    this.record(this.level.id, score.stars);
    this.addTallies();
    this.clearVote();
    this.setPhase('clear');
  }

  /* ------------------------------------------------------------------ read-outs */

  lastScore(): StageScore | undefined {
    return this.scores[this.scores.length - 1];
  }

  totalStars(): number {
    return this.scores.reduce((s, x) => s + x.stars, 0);
  }

  maxStars(): number {
    return this.order.length * 3;
  }

  /** Colour of a person's steered character (solo: the active one). */
  slotOf(owner: number): Slot | null {
    const key = this.charOf(owner);
    const c = key >= 0 ? this.sim?.chars[key] : undefined;
    return c ? c.slot : null;
  }

  inCast(owner: number): boolean {
    return this.cast.some((p) => p.id === owner);
  }

  person(id: number): Person | undefined {
    return this.people.find((p) => p.id === id);
  }
}
