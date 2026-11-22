/**
 * Petualangan Warna session (pure): the Host picks a starting stage, then the group plays
 * `stages` stages in a row. Each stage builds a fresh World from the people connected at its
 * start (two characters for someone playing alone, swapped with TUKAR), scores up to three
 * stars and adds every character's deeds to its owner's tally for the awards.
 *
 * Phases: select → intro → play → clear → (intro of the next stage | done).
 */
import type { Fruit } from '@hoorah/protocol';
import { LEVELS, type Level, type Slot } from './levels';
import { type CharSpec, type CharStats, World, type WorldEvent } from './world';

export const INTRO_S = 3.2;
export const CLEAR_S = 5.5;
/** A restart vote stays open this long (solo: the second tap must come within it). */
export const VOTE_S = 6;
export const VOTE_SOLO_S = 3;

export type Phase = 'select' | 'intro' | 'play' | 'clear' | 'done';

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
}

export type MatchEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'stage'; index: number }
  | { type: 'vote'; votes: number; need: number }
  | { type: 'voteEnd' }
  | { type: 'restart' }
  | { type: 'swap'; owner: number; key: number }
  | { type: 'ping'; key: number }
  | { type: 'world'; e: WorldEvent };

export interface Tally extends CharStats {
  id: number;
}

function emptyTally(id: number): Tally {
  return { id, jumps: 0, deaths: 0, gems: 0, carried: 0, pushed: 0, helped: 0, firstIn: 0 };
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
  };
}

/** Votes needed to restart a stage: two people agree in a group (half the group when bigger). */
export function votesNeeded(people: number): number {
  return people <= 1 ? 1 : Math.max(2, Math.ceil(people / 2));
}

export class WarnaMatch {
  phase: Phase = 'select';
  /** Level index highlighted in the picker. */
  pick = 0;
  /** Levels of this session, in play order. */
  order: number[] = [];
  stage = 0;
  readonly stages: number;
  world: World | null = null;
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
  private people: Person[] = [];
  private events: MatchEvent[] = [];
  /** Last stick per person, re-applied when the solo steer swaps. */
  private readonly sticks = new Map<number, { x: number; jump: boolean }>();

  constructor(stages: number) {
    this.stages = Math.max(1, Math.min(LEVELS.length, Math.floor(stages)));
  }

  get level(): Level {
    return LEVELS[this.order[this.stage] ?? this.pick] ?? LEVELS[0]!;
  }

  setPeople(people: readonly Person[]): void {
    this.people = people.map((p) => ({ ...p }));
    for (const p of this.people) if (!this.tallies.has(p.id)) this.tallies.set(p.id, emptyTally(p.id));
    const w = this.world;
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

  pickLevel(id: string): boolean {
    if (this.phase !== 'select') return false;
    const i = LEVELS.findIndex((l) => l.id === id);
    if (i < 0) return false;
    this.pick = i;
    return true;
  }

  start(): void {
    if (this.phase !== 'select') return;
    this.order = [];
    for (let i = 0; i < this.stages; i++) this.order.push((this.pick + i) % LEVELS.length);
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
    this.world = new World(this.level, specs, { solo: this.solo });
    this.playT = 0;
    this.clearVote();
    this.events.push({ type: 'stage', index: this.stage });
    this.setPhase('intro');
  }

  /* ------------------------------------------------------------------ input */

  /** Character steered by a person right now (solo: the active one of two). */
  charOf(owner: number): number {
    const w = this.world;
    if (!w) return -1;
    const c = w.chars.find((ch) => ch.owner === owner && (!this.solo || ch.sub === this.steer));
    return c ? c.key : -1;
  }

  setStick(owner: number, x: number, jump: boolean): void {
    this.sticks.set(owner, { x, jump });
    if (this.phase !== 'play' || !this.world) return;
    const key = this.charOf(owner);
    if (key >= 0) this.world.setInput(key, x, jump);
  }

  swap(owner: number): void {
    const w = this.world;
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
    if (this.phase !== 'play' || key < 0 || !this.world) return;
    this.world.ping(key);
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
    const specs: CharSpec[] = this.world
      ? this.world.chars.map((c) => ({ owner: c.owner, sub: c.sub }))
      : this.cast.map((p) => ({ owner: p.id, sub: 0 as const }));
    this.world = new World(this.level, specs, { solo: this.solo });
    for (const c of this.world.chars) {
      const p = this.people.find((x) => x.id === c.owner);
      this.world.setActive(c.key, Boolean(p?.connected));
    }
    this.steer = 0;
    this.playT = 0;
    this.setPhase('play');
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
        const w = this.world;
        if (!w) return;
        this.playT += step;
        if (this.voteLeft > 0) {
          this.voteLeft -= step;
          if (this.voteLeft <= 0) this.clearVote();
        }
        w.update(step);
        for (const e of w.drainEvents()) {
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
      if (key >= 0) this.world?.setInput(key, s.x, false);
    }
  }

  private addTallies(): void {
    const w = this.world;
    if (!w) return;
    for (const c of w.chars) {
      const t = this.tallies.get(c.owner) ?? emptyTally(c.owner);
      t.jumps += c.stats.jumps;
      t.deaths += c.stats.deaths;
      t.gems += c.stats.gems;
      t.carried += c.stats.carried;
      t.pushed += c.stats.pushed;
      t.helped += c.stats.helped;
      t.firstIn += c.stats.firstIn;
      this.tallies.set(c.owner, t);
      c.stats = { jumps: 0, deaths: 0, gems: 0, carried: 0, pushed: 0, helped: 0, firstIn: 0 };
    }
  }

  private finishStage(): void {
    const w = this.world;
    if (!w || this.phase !== 'play') return;
    const g = w.allGems();
    this.scores.push(scoreStage(this.level, this.playT, g.taken, g.total));
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
    const c = key >= 0 ? this.world?.chars[key] : undefined;
    return c ? c.slot : null;
  }

  inCast(owner: number): boolean {
    return this.cast.some((p) => p.id === owner);
  }

  person(id: number): Person | undefined {
    return this.people.find((p) => p.id === id);
  }
}
