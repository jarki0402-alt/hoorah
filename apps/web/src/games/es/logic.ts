/**
 * Seluncur Es rules (pure, no DOM/three): a round ice floe on a cold sea. Every shot all skaters
 * aim at once (slingshot on the phone, about 5 seconds), then launch together and slide with
 * friction; circles bump elastically, whoever's centre leaves the ice falls in. After every shot
 * the cracked rim breaks off, so the floe shrinks. The last one standing wins the round; the last
 * round scores double. Whoever fell waits for the next round (cheering from the phone).
 *
 * Plane coordinates: x right, y down on the main screen's top view (the phone's aim uses the same
 * axes), metres, origin at the centre of the floe. Time in seconds of game time (pause-aware).
 */
import type { Fruit, SlingAim } from '@hoorah/protocol';
import { SLING_MIN_POWER } from '@hoorah/protocol';
import { planShot, type ShotPlan } from './brain';

export type Phase = 'intro' | 'aim' | 'slide' | 'settle' | 'end' | 'final' | 'done';

export const TIMING = {
  intro: 3,
  /** Aiming time shown on the phones. */
  aim: 5,
  /** Locks that left the phone in time but arrive a little late are still taken. */
  grace: 0.35,
  slideMax: 7,
  /** After the slide: near misses, then the rim cracks off. */
  settle: 1.9,
  /** When the rim breaks during the settle phase. */
  crackAt: 0.7,
  end: 4.5,
  final: 9,
};

export const PHYS = {
  radius: 0.55,
  /** Launch speed at full power (m/s). */
  vmax: 8.7,
  /** Constant ice friction (m/s²): a full-power slide goes vmax² / (2·decel) ≈ 9 m. */
  decel: 4.2,
  restitution: 0.94,
  step: 1 / 120,
  stopSpeed: 0.06,
  /** Bumps slower than this make no "DUK!". */
  hitSpeed: 1.2,
  /** A fall is credited to the last skater who bumped the one falling within this many seconds. */
  creditWindow: 3,
  /** Seconds a falling skater keeps sliding before it splashes. */
  fallTime: 0.55,
  /** Stopping this close to the edge is a near miss. */
  nearGap: 0.5,
  minEdge: 2.4,
  shrink: 0.84,
  maxShots: 9,
};

/** How far a full-power launch slides on open ice. */
export const REACH = (PHYS.vmax * PHYS.vmax) / (2 * PHYS.decel);

/** Bonus for the last one standing ("Juara Kutub"). */
export const WIN_BONUS = 3;

export interface Vec {
  x: number;
  y: number;
}

export interface PlayerInfo {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  cpu: boolean;
}

export interface SkaterStats {
  knockouts: number;
  wins: number;
  survivedShots: number;
  falls: number;
  hits: number;
  nearMisses: number;
  /** Strongest bump given (m/s of closing speed). */
  biggestHit: number;
  /** Metres slid in total. */
  distance: number;
  /** Shots this skater launched at full power (90%+). */
  bold: number;
}

export interface Skater extends PlayerInfo {
  total: number;
  /** Points of every round played so far (index = round). */
  rounds: number[];
  /** Taking part in the current round (false = joined mid-round, waits). */
  inRound: boolean;
  out: boolean;
  /** Sliding off the edge right now (seconds since it left the ice), null when not. */
  falling: number | null;
  /** How many skaters had already fallen when this one fell (its round points). */
  outlasted: number;
  pos: Vec;
  vel: Vec;
  /** Locked aim of this shot. */
  aim: SlingAim | null;
  /** Live aim streamed while the finger is down (shown faded on the main screen). */
  live: SlingAim | null;
  lastHit: { by: number; t: number } | null;
  /** Seconds since the last bump (avatar wobble). */
  bumped: number;
  stats: SkaterStats;
}

export type EsEvent =
  | { k: 'round'; no: number }
  | { k: 'aim'; shot: number }
  | { k: 'second'; left: number }
  | { k: 'timeUp' }
  | { k: 'lock'; id: number; again: boolean }
  | { k: 'launch' }
  | { k: 'hit'; a: number; b: number; speed: number; at: Vec }
  | { k: 'fall'; id: number; by: number | null; at: Vec; crack: boolean }
  | { k: 'nearMiss'; id: number; gap: number }
  | { k: 'crack'; from: number; to: number }
  | { k: 'roundEnd'; points: Map<number, number>; winner: number | null }
  | { k: 'final' }
  | { k: 'done' };

export interface MatchOptions {
  players: PlayerInfo[];
  rounds: number;
  seed: number;
  /** Computer skill 0..1 (PRD 6.4, adapts between games). */
  skill?: number;
}

/** Small deterministic PRNG (mulberry32) so tests and replays are stable. */
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

const len = (v: Vec) => Math.hypot(v.x, v.y);

/** Starting floe radius for a lineup: a little more room for every skater. */
export function startEdge(n: number): number {
  return 5.4 + 0.32 * Math.max(2, Math.min(8, n));
}

/** The floe after one more shot. */
export function shrinkEdge(edge: number): number {
  return Math.max(PHYS.minEdge, edge * PHYS.shrink - 0.1);
}

/** Launch velocity of an aim (null or too weak = stay). */
export function launchVelocity(aim: SlingAim | null): Vec {
  if (!aim) return { x: 0, y: 0 };
  const p = Math.min(1, Math.hypot(aim.x, aim.y));
  if (p < SLING_MIN_POWER) return { x: 0, y: 0 };
  return { x: aim.x * PHYS.vmax, y: aim.y * PHYS.vmax };
}

/**
 * Elastic bump of two equal discs, in place. Returns the closing speed along the normal (0 when
 * they were not approaching). Overlap is pushed apart evenly.
 */
export function collide(a: { pos: Vec; vel: Vec }, b: { pos: Vec; vel: Vec }, r: number, e: number): number {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  let d = Math.hypot(dx, dy);
  if (d >= r * 2) return 0;
  let nx = 1;
  let ny = 0;
  if (d > 1e-6) {
    nx = dx / d;
    ny = dy / d;
  } else d = 0;
  const overlap = r * 2 - d;
  a.pos.x -= nx * overlap * 0.5;
  a.pos.y -= ny * overlap * 0.5;
  b.pos.x += nx * overlap * 0.5;
  b.pos.y += ny * overlap * 0.5;
  const closing = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * ny;
  if (closing <= 0) return 0;
  const j = ((1 + e) * closing) / 2;
  a.vel.x -= j * nx;
  a.vel.y -= j * ny;
  b.vel.x += j * nx;
  b.vel.y += j * ny;
  return closing;
}

/** Friction on one disc for `dt`: constant deceleration, never reversing. */
export function slow(v: Vec, dt: number, decel: number): void {
  const s = len(v);
  if (s <= 0) return;
  const next = Math.max(0, s - decel * dt);
  v.x *= next / s;
  v.y *= next / s;
}

export class EsMatch {
  readonly players: Skater[] = [];
  readonly roundCount: number;
  phase: Phase = 'intro';
  phaseT = 0;
  /** Round index (0-based). */
  round = 0;
  /** Shot number in the round (1-based). */
  shot = 0;
  edge: number;
  nextEdge: number;
  /** Seconds since the slide started (credit window). */
  slideT = 0;
  private fallen = 0;
  private cracked = false;
  private lastLeft = -1;
  private acc = 0;
  private readonly rnd: () => number;
  private readonly skill: number;
  private readonly plans = new Map<number, ShotPlan>();
  /** Seats whose phone dropped: a computer brain aims for them until it comes back. */
  private readonly auto = new Set<number>();
  private readonly hitPairs = new Map<string, number>();
  private events: EsEvent[] = [];

  constructor(opts: MatchOptions) {
    this.roundCount = Math.max(1, Math.min(9, Math.floor(opts.rounds)));
    this.rnd = rng(opts.seed);
    this.skill = Math.max(0, Math.min(1, opts.skill ?? 0.45));
    for (const p of opts.players.slice(0, 8)) this.players.push(this.makeSkater(p, true));
    this.edge = startEdge(this.players.length);
    this.nextEdge = this.edge;
    this.startRound(0);
  }

  private makeSkater(p: PlayerInfo, inRound: boolean): Skater {
    return {
      ...p,
      total: 0,
      rounds: [],
      inRound,
      out: !inRound,
      falling: null,
      outlasted: 0,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      aim: null,
      live: null,
      lastHit: null,
      bumped: 99,
      stats: {
        knockouts: 0,
        wins: 0,
        survivedShots: 0,
        falls: 0,
        hits: 0,
        nearMisses: 0,
        biggestHit: 0,
        distance: 0,
        bold: 0,
      },
    };
  }

  /* ------------------------------------------------------------------ queries */

  player(id: number): Skater | undefined {
    return this.players.find((p) => p.id === id);
  }

  get isFinal(): boolean {
    return this.round === this.roundCount - 1;
  }

  /** Skaters still on the ice this round. */
  standing(): Skater[] {
    return this.players.filter((p) => p.inRound && !p.out && p.falling === null);
  }

  /** Skaters taking part in this round. */
  contestants(): Skater[] {
    return this.players.filter((p) => p.inRound);
  }

  locks(): number {
    return this.standing().filter((p) => p.aim !== null).length;
  }

  /** Whole seconds left to aim (display), 0 once time is up. */
  get aimLeft(): number {
    if (this.phase !== 'aim') return 0;
    return Math.max(0, Math.ceil(TIMING.aim - this.phaseT - 1e-6));
  }

  /** Seconds left to aim, unrounded (phone deadlines). */
  get aimRemaining(): number {
    return this.phase === 'aim' ? Math.max(0, TIMING.aim - this.phaseT) : 0;
  }

  standings(): Skater[] {
    return [...this.players].sort((a, b) => b.total - a.total || a.stats.falls - b.stats.falls);
  }

  drainEvents(): EsEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /* ------------------------------------------------------------------ lineup */

  addPlayer(p: PlayerInfo): void {
    if (this.player(p.id) || this.players.length >= 8) return;
    // Joins at once only before the first aim of the round; otherwise waits for the next round.
    const now = this.phase === 'intro';
    const s = this.makeSkater(p, now);
    this.players.push(s);
    if (now) this.placeRing();
  }

  removePlayer(id: number): void {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.players.splice(i, 1);
    this.plans.delete(id);
    this.auto.delete(id);
    if (
      (this.phase === 'aim' || this.phase === 'slide' || this.phase === 'settle') &&
      this.standing().length <= 1
    )
      this.endRound();
  }

  restyle(id: number, look: Pick<PlayerInfo, 'name' | 'color' | 'fruit'>): void {
    const p = this.player(id);
    if (p) Object.assign(p, look);
  }

  /** A dropped phone: the computer aims for this seat until `on` is false again. */
  setAuto(id: number, on: boolean): void {
    if (on) {
      this.auto.add(id);
      if (this.phase === 'aim') this.planFor(id);
    } else {
      this.auto.delete(id);
      this.plans.delete(id);
    }
  }

  /* ------------------------------------------------------------------ input */

  /** Live aim while the finger is down (shown faded); zero = finger lifted. */
  stream(id: number, aim: SlingAim): void {
    const p = this.player(id);
    if (!p || this.phase !== 'aim' || !this.isStanding(p) || this.plans.has(id)) return;
    p.live = Math.hypot(aim.x, aim.y) >= SLING_MIN_POWER ? { x: aim.x, y: aim.y } : null;
  }

  /** Locked aim from the phone. Re-aiming replaces it until time is up (plus grace). */
  lock(id: number, aim: SlingAim): boolean {
    const p = this.player(id);
    if (!p || this.phase !== 'aim' || !this.isStanding(p) || this.plans.has(id)) return false;
    if (Math.hypot(aim.x, aim.y) < SLING_MIN_POWER) return false;
    const again = p.aim !== null;
    p.aim = { x: aim.x, y: aim.y };
    p.live = null;
    this.events.push({ k: 'lock', id, again });
    return true;
  }

  private isStanding(p: Skater): boolean {
    return p.inRound && !p.out && p.falling === null;
  }

  /* ------------------------------------------------------------------ flow */

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseT = 0;
  }

  private startRound(no: number): void {
    this.round = no;
    this.shot = 0;
    this.fallen = 0;
    for (const p of this.players) {
      p.inRound = true;
      p.out = false;
      p.falling = null;
      p.outlasted = 0;
      p.vel = { x: 0, y: 0 };
      p.aim = null;
      p.live = null;
      p.lastHit = null;
    }
    this.edge = startEdge(this.players.length);
    this.nextEdge = this.edge;
    this.placeRing();
    this.setPhase('intro');
    this.events.push({ k: 'round', no });
  }

  /** Everyone evenly on a ring, a random turn each round. */
  private placeRing(): void {
    const list = this.contestants();
    const n = list.length;
    const r = this.edge * (n <= 2 ? 0.45 : 0.6);
    const turn = this.rnd() * Math.PI * 2;
    list.forEach((p, i) => {
      const a = turn + (i / Math.max(1, n)) * Math.PI * 2;
      p.pos = { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  }

  private startAim(): void {
    this.shot++;
    this.nextEdge = shrinkEdge(this.edge);
    this.lastLeft = -1;
    this.plans.clear();
    for (const p of this.players) {
      p.aim = null;
      p.live = null;
      p.vel = { x: 0, y: 0 };
    }
    this.setPhase('aim');
    for (const p of this.standing()) if (p.cpu || this.auto.has(p.id)) this.planFor(p.id);
    this.events.push({ k: 'aim', shot: this.shot });
  }

  private planFor(id: number): void {
    const p = this.player(id);
    if (!p || !this.isStanding(p)) return;
    const others = this.standing()
      .filter((o) => o.id !== id)
      .map((o) => ({ id: o.id, x: o.pos.x, y: o.pos.y }));
    const skill = p.cpu ? this.skill : 0.35;
    this.plans.set(
      id,
      planShot({ me: p.pos, others, edge: this.edge, next: this.nextEdge, skill }, this.rnd),
    );
  }

  private runPlans(): void {
    for (const [id, plan] of this.plans) {
      const p = this.player(id);
      if (!p || !this.isStanding(p)) continue;
      if (p.aim) continue;
      if (this.phaseT >= plan.lockAt) {
        p.aim = plan.aim;
        p.live = null;
        this.events.push({ k: 'lock', id, again: false });
      } else if (this.phaseT >= plan.previewAt) {
        // Searching around the final aim, like a thumb settling.
        const w = Math.sin(this.phaseT * 5 + id) * (plan.lockAt - this.phaseT) * 0.12;
        const c = Math.cos(w);
        const s = Math.sin(w);
        p.live = { x: plan.aim.x * c - plan.aim.y * s, y: plan.aim.x * s + plan.aim.y * c };
      }
    }
  }

  private launch(): void {
    for (const p of this.standing()) {
      const aim = p.aim ?? p.live;
      p.vel = launchVelocity(aim);
      if (aim && Math.hypot(aim.x, aim.y) >= 0.9) p.stats.bold++;
      p.lastHit = null;
    }
    this.slideT = 0;
    this.cracked = false;
    this.hitPairs.clear();
    this.setPhase('slide');
    this.events.push({ k: 'launch' });
  }

  tick(dt: number): void {
    if (this.phase === 'done' || dt <= 0) return;
    this.phaseT += dt;
    for (const p of this.players) p.bumped += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= TIMING.intro) this.startAim();
        break;
      case 'aim': {
        this.runPlans();
        const left = this.aimLeft;
        if (left !== this.lastLeft) {
          if (this.lastLeft !== -1) {
            if (left > 0) this.events.push({ k: 'second', left });
            else this.events.push({ k: 'timeUp' });
          }
          this.lastLeft = left;
        }
        if (this.phaseT >= TIMING.aim + TIMING.grace) this.launch();
        break;
      }
      case 'slide':
        this.acc += dt;
        while (this.acc >= PHYS.step && this.phase === 'slide') {
          this.acc -= PHYS.step;
          this.stepSlide(PHYS.step);
        }
        break;
      case 'settle':
        if (!this.cracked && this.phaseT >= TIMING.crackAt) this.crack();
        this.advanceFalls(dt);
        if (this.phaseT >= TIMING.settle && this.players.every((p) => p.falling === null)) this.afterShot();
        break;
      case 'end':
        if (this.phaseT >= TIMING.end) {
          if (this.round + 1 < this.roundCount) this.startRound(this.round + 1);
          else {
            this.setPhase('final');
            this.events.push({ k: 'final' });
          }
        }
        break;
      case 'final':
        if (this.phaseT >= TIMING.final) {
          this.setPhase('done');
          this.events.push({ k: 'done' });
        }
        break;
    }
  }

  /** Sliding off the edge: keep going outwards a moment, then splash. */
  private advanceFalls(dt: number): void {
    for (const p of this.players) {
      if (p.falling === null) continue;
      p.falling += dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      if (p.falling >= PHYS.fallTime) {
        p.falling = null;
        p.out = true;
        p.vel = { x: 0, y: 0 };
      }
    }
  }

  private stepSlide(dt: number): void {
    this.slideT += dt;
    const on = this.standing();
    for (const p of on) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.stats.distance += len(p.vel) * dt;
      slow(p.vel, dt, PHYS.decel);
    }
    for (let i = 0; i < on.length; i++) {
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i]!;
        const b = on[j]!;
        const closing = collide(a, b, PHYS.radius, PHYS.restitution);
        if (closing <= 0) continue;
        a.lastHit = { by: b.id, t: this.slideT };
        b.lastHit = { by: a.id, t: this.slideT };
        a.bumped = 0;
        b.bumped = 0;
        const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        const last = this.hitPairs.get(key) ?? -1;
        if (closing >= PHYS.hitSpeed && this.slideT - last > 0.25) {
          this.hitPairs.set(key, this.slideT);
          // The faster one gave the bump.
          const giver = len(a.vel) < len(b.vel) ? a : b;
          giver.stats.hits++;
          giver.stats.biggestHit = Math.max(giver.stats.biggestHit, closing);
          this.events.push({
            k: 'hit',
            a: a.id,
            b: b.id,
            speed: closing,
            at: { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 },
          });
        }
      }
    }
    // Off the edge: falls in the same step share their place.
    const off = on.filter((p) => len(p.pos) > this.edge);
    for (const p of off) this.startFall(p, false);
    this.fallen += off.length;
    this.advanceFalls(dt);
    const moving = this.standing().some((p) => len(p.vel) > PHYS.stopSpeed);
    const falling = this.players.some((p) => p.falling !== null);
    if ((!moving && !falling) || this.slideT >= TIMING.slideMax) {
      for (const p of this.standing()) p.vel = { x: 0, y: 0 };
      this.endSlide();
    }
  }

  private startFall(p: Skater, crack: boolean): void {
    p.falling = 0;
    p.outlasted = this.fallen;
    p.stats.falls++;
    if (crack) {
      // Drifts off with the broken rim.
      const l = Math.max(1e-6, len(p.pos));
      p.vel = { x: (p.pos.x / l) * 1.2, y: (p.pos.y / l) * 1.2 };
    } else {
      // Keep sliding outwards at least a little so the fall reads clearly.
      const l = Math.max(1e-6, len(p.pos));
      const out = (p.vel.x * p.pos.x + p.vel.y * p.pos.y) / l;
      if (out < 1.5) {
        p.vel.x += (p.pos.x / l) * (1.5 - out);
        p.vel.y += (p.pos.y / l) * (1.5 - out);
      }
    }
    let by: number | null = null;
    if (!crack && p.lastHit && this.slideT - p.lastHit.t <= PHYS.creditWindow) {
      const giver = this.player(p.lastHit.by);
      if (giver) {
        by = giver.id;
        giver.stats.knockouts++;
      }
    }
    this.events.push({ k: 'fall', id: p.id, by, at: { x: p.pos.x, y: p.pos.y }, crack });
  }

  private endSlide(): void {
    this.setPhase('settle');
    let close: Skater | null = null;
    let gap = PHYS.nearGap;
    for (const p of this.standing()) {
      const g = this.edge - len(p.pos);
      if (g < gap) {
        gap = g;
        close = p;
      }
    }
    if (close) {
      close.stats.nearMisses++;
      this.events.push({ k: 'nearMiss', id: close.id, gap: Math.max(0, gap) });
    }
  }

  private crack(): void {
    this.cracked = true;
    const from = this.edge;
    const to = this.nextEdge;
    if (to >= from) return;
    this.edge = to;
    this.events.push({ k: 'crack', from, to });
    const off = this.standing().filter((p) => len(p.pos) > to);
    for (const p of off) this.startFall(p, true);
    this.fallen += off.length;
  }

  private afterShot(): void {
    const left = this.standing();
    for (const p of left) p.stats.survivedShots++;
    if (left.length <= 1 || this.shot >= PHYS.maxShots) this.endRound();
    else this.startAim();
  }

  private endRound(): void {
    if (this.phase === 'end' || this.phase === 'final' || this.phase === 'done') return;
    const list = this.contestants();
    const n = list.length;
    const left = list.filter((p) => !p.out && p.falling === null);
    const mult = this.isFinal ? 2 : 1;
    const points = new Map<number, number>();
    let winner: number | null = null;
    for (const p of list) {
      let pts = p.outlasted;
      if (!p.out && p.falling === null) {
        if (left.length === 1) {
          pts = n - 1 + WIN_BONUS;
          winner = p.id;
          p.stats.wins++;
        } else pts = this.fallen + 1;
      }
      pts *= mult;
      points.set(p.id, pts);
      p.total += pts;
    }
    for (const p of this.players) {
      while (p.rounds.length < this.round) p.rounds.push(0);
      p.rounds[this.round] = points.get(p.id) ?? 0;
    }
    for (const p of this.players) {
      p.vel = { x: 0, y: 0 };
      p.falling = null;
    }
    this.setPhase('end');
    this.events.push({ k: 'roundEnd', points, winner });
  }

  /** Points this skater would score if the round ended now (live scoreboard). */
  roundPoints(p: Skater): number {
    if (!p.inRound) return 0;
    const mult = this.isFinal ? 2 : 1;
    if (p.out || p.falling !== null) return p.outlasted * mult;
    return this.fallen * mult;
  }
}
