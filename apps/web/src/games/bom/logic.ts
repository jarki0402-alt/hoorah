/**
 * Bom Oper rules (pure, no rendering): chase in a fenced yard with a ticking bomb whose fuse time
 * is secret and different every round (the screen only shows the fuse sputtering, faster near the
 * end). Tap OPER near someone to hand it over; whoever just passed it is immune for a moment, so
 * it can't come straight back. The holder runs a little faster, so they can always catch up.
 *
 * BUM: the holder loses one of 3 lives and is back on their feet 2 seconds later, then the next
 * round starts. The final round drops two bombs at once. Out of lives = out of the game, waiting
 * on the phone with the cheer buttons (owner's decisions 2026-11-22: 3 lives, 2 bombs in the last
 * round, no "Arwah Jahil"). Most lives at the end wins.
 */

import type { Fruit } from '@hoorah/protocol';
import { DEFAULT_RIG, GroupCamera } from '../../shared/kotak/camera';
import { rng, type V3, v3 } from '../../shared/kotak/math';
import { KotakSim } from '../../shared/kotak/sim';
import { type Arena, type ArenaId, buildArena } from './arena';

export interface RunnerInfo {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
}

export type Phase = 'intro' | 'drop' | 'play' | 'boom' | 'score' | 'done';

export const RULES = {
  lives: 3,
  intro: 2.6,
  drop: 1.3,
  /** Frozen after a BUM, then back on the feet (s). */
  boom: 2.2,
  score: 2.8,
  /** Secret fuse length range (s); the final round's two bombs use their own. */
  fuse: [16, 30] as const,
  finalFuse: [[13, 22] as const, [19, 30] as const],
  /** Centre-to-centre reach of OPER (m). */
  passRange: 2.6,
  /** A new holder must keep the bomb this long before passing (s). */
  holdMin: 0.35,
  /** Whoever passed is immune this long (s). */
  immune: 2,
  /** Holder speed boost. */
  holderBoost: 1.12,
  /** A pass this close to the end counts as "nyaris" (s). */
  nearMiss: 0.7,
  /** The explosion knocks away anyone this close (m). */
  blast: 3.2,
  /** Bomb flight time of a pass (s, visual). */
  flight: 0.26,
  baseSpeed: 6.2,
} as const;

export interface RunnerStats {
  passes: number;
  /** Bombs received. */
  caught: number;
  /** Seconds holding a bomb. */
  holdTime: number;
  nearMisses: number;
  booms: number;
  /** Metres run. */
  distance: number;
  /** Round in which lives ran out (0 = never). */
  outRound: number;
}

export interface Runner extends RunnerInfo {
  lives: number;
  out: boolean;
  /** Sim time until which this runner cannot receive a bomb. */
  immuneUntil: number;
  stats: RunnerStats;
}

export interface Bomb {
  /** Index 0 or 1. */
  index: number;
  holder: number;
  /** Secret: fuse length and when it was lit (sim time). */
  fuse: number;
  litAt: number;
  /** Sim time the current holder got it. */
  heldSince: number;
  /** Visual pass flight: from, to, start time; null when in hand. */
  flight: { from: number; to: number; at: number } | null;
  exploded: boolean;
}

export type BomEvent =
  | { k: 'round'; no: number; bombs: number }
  | { k: 'drop'; ids: number[] }
  | { k: 'go' }
  | { k: 'pass'; from: number; to: number; near: boolean; bomb: number }
  | { k: 'refused'; id: number }
  | { k: 'boom'; id: number; bomb: number; out: boolean; at: V3 }
  | { k: 'back' }
  | { k: 'score' }
  | { k: 'bump'; a: number; b: number }
  | { k: 'done' };

export interface Pilot {
  think(m: BomMatch, id: number, dt: number): { x: number; z: number; pass: boolean };
}

export interface MatchOptions {
  runners: RunnerInfo[];
  arena: ArenaId;
  rounds: number;
  seed: number;
  aspect?: number;
}

const newStats = (): RunnerStats => ({
  passes: 0,
  caught: 0,
  holdTime: 0,
  nearMisses: 0,
  booms: 0,
  distance: 0,
  outRound: 0,
});

export class BomMatch {
  readonly runners: Runner[];
  readonly arena: Arena;
  readonly rounds: number;
  readonly sim: KotakSim;
  readonly camera: GroupCamera;
  roundNo = 0;
  phase: Phase = 'intro';
  phaseT = 0;
  bombs: Bomb[] = [];
  alpha = 0;
  /** Who exploded this round (scoreboard). */
  lastBoom: number[] = [];
  private readonly rnd: () => number;
  private readonly pilots = new Map<number, Pilot>();
  private readonly sticks = new Map<number, { x: number; z: number }>();
  private events: BomEvent[] = [];
  private lastVictim = 0;
  private boomAt = 0;

  constructor(opts: MatchOptions) {
    this.rnd = rng(opts.seed);
    this.arena = buildArena(opts.arena);
    this.rounds = Math.max(1, Math.min(9, Math.floor(opts.rounds)));
    this.sim = new KotakSim({
      speed: RULES.baseSpeed * RULES.holderBoost,
      killY: -20,
      crowd: 1,
      sweepPush: 9,
    });
    for (const def of this.arena.solids) this.sim.addSolid(def);
    this.runners = opts.runners.slice(0, 8).map((r) => this.make(r));
    this.runners.forEach((r, i) => {
      const sp = this.arena.spawns[i % this.arena.spawns.length]!;
      this.sim.addBody({ id: r.id, pos: v3(sp.x, 0.02, sp.z), yaw: 0 });
    });
    this.camera = new GroupCamera(
      {
        ...DEFAULT_RIG,
        fov: 38,
        pitch: 0.98,
        yaw: 0,
        minDist: 18,
        maxDist: 60,
        fill: 0.95,
        lead: v3(0, 0, 0.4),
      },
      opts.aspect ?? 16 / 9,
    );
    this.camera.snap(this.framePoints());
    this.startRound(0);
  }

  private make(r: RunnerInfo): Runner {
    return { ...r, lives: RULES.lives, out: false, immuneUntil: 0, stats: newStats() };
  }

  runner(id: number): Runner | undefined {
    return this.runners.find((r) => r.id === id);
  }

  alive(): Runner[] {
    return this.runners.filter((r) => !r.out);
  }

  drainEvents(): BomEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  setAspect(aspect: number): void {
    if (Math.abs(this.camera.aspect - aspect) < 1e-3) return;
    this.camera.aspect = aspect;
    this.camera.snap(this.framePoints());
  }

  setPilot(id: number, pilot: Pilot | null): void {
    if (pilot) this.pilots.set(id, pilot);
    else {
      this.pilots.delete(id);
      this.sim.setMove(id, 0, 0);
    }
  }

  piloted(id: number): boolean {
    return this.pilots.has(id);
  }

  /** The bomb this runner holds, if any. */
  bombOf(id: number): Bomb | undefined {
    return this.bombs.find((b) => !b.exploded && b.holder === id);
  }

  get finalRound(): boolean {
    return this.roundNo === this.rounds - 1;
  }

  /** 0..1 of the secret fuse burnt (renderer: the sputter speeds up). Not shown as a number. */
  burnt(b: Bomb): number {
    if (this.phase !== 'play' || b.exploded) return 0;
    return Math.max(0, Math.min(1, (this.sim.t - b.litAt) / b.fuse));
  }

  /* ------------------------------------------------------------------ lineup */

  addRunner(info: RunnerInfo): void {
    if (this.runner(info.id) || this.runners.length >= 8) return;
    const r = this.make(info);
    // A late joiner gets as many lives as the weakest runner still in, at least one.
    const left = this.alive().map((o) => o.lives);
    r.lives = Math.max(1, left.length > 0 ? Math.min(...left) : RULES.lives);
    this.runners.push(r);
    const sp = this.arena.spawns[(this.runners.length - 1) % this.arena.spawns.length]!;
    this.sim.addBody({ id: r.id, pos: v3(sp.x, 0.02, sp.z) });
    this.sim.place(r.id, v3(sp.x, 0.02, sp.z), 0, this.phase === 'play' ? 0.8 : 0);
  }

  removeRunner(id: number): void {
    const i = this.runners.findIndex((r) => r.id === id);
    if (i < 0) return;
    this.runners.splice(i, 1);
    this.pilots.delete(id);
    this.sim.removeBody(id);
    // A bomb in the leaver's hands jumps to the nearest runner.
    for (const b of this.bombs) {
      if (b.exploded || b.holder !== id) continue;
      const next = this.nearestTo(b.flight ? this.posOf(b.flight.from) : null, new Set([id]));
      if (next) {
        b.holder = next.id;
        b.heldSince = this.sim.t;
        b.flight = null;
      } else b.exploded = true;
    }
    this.checkEnd();
  }

  restyle(id: number, look: Partial<Pick<RunnerInfo, 'name' | 'fruit' | 'color'>>): void {
    const r = this.runner(id);
    if (r) Object.assign(r, look);
  }

  /* ------------------------------------------------------------------ input */

  steer(id: number, x: number, z: number): void {
    if (this.pilots.has(id)) return;
    this.sticks.set(id, { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 });
  }

  /** OPER: hand the bomb to the nearest runner in reach. False when nothing happened. */
  pass(id: number): boolean {
    if (this.phase !== 'play') return false;
    const b = this.bombOf(id);
    if (!b || b.flight || this.sim.t - b.heldSince < RULES.holdMin) return false;
    const target = this.passTarget(id);
    if (!target) {
      this.events.push({ k: 'refused', id });
      return false;
    }
    const left = b.fuse - (this.sim.t - b.litAt);
    const near = left < RULES.nearMiss;
    const from = this.runner(id)!;
    from.stats.passes++;
    if (near) from.stats.nearMisses++;
    from.immuneUntil = this.sim.t + RULES.immune;
    target.stats.caught++;
    b.flight = { from: id, to: target.id, at: this.sim.t };
    b.holder = target.id;
    b.heldSince = this.sim.t;
    this.events.push({ k: 'pass', from: id, to: target.id, near, bomb: b.index });
    return true;
  }

  /** Whoever OPER would reach right now (nearest, in range, not immune, not holding a bomb). */
  passTarget(id: number): Runner | null {
    const me = this.sim.body(id);
    if (!me) return null;
    let best: Runner | null = null;
    let bestD: number = RULES.passRange;
    for (const r of this.alive()) {
      if (r.id === id || !this.canReceive(r)) continue;
      const b = this.sim.body(r.id);
      if (!b) continue;
      const d = Math.hypot(b.pos.x - me.pos.x, b.pos.z - me.pos.z);
      if (d <= bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  canReceive(r: Runner): boolean {
    return !r.out && this.sim.t >= r.immuneUntil && !this.bombOf(r.id);
  }

  immuneLeft(r: Runner): number {
    return Math.max(0, r.immuneUntil - this.sim.t);
  }

  /* ------------------------------------------------------------------ rounds */

  private startRound(no: number): void {
    this.roundNo = no;
    this.phase = 'intro';
    this.phaseT = 0;
    this.bombs = [];
    this.lastBoom = [];
    for (const r of this.runners) r.immuneUntil = 0;
    const alive = this.alive();
    const n = this.finalRound && alive.length >= 3 ? 2 : 1;
    this.events.push({ k: 'round', no, bombs: n });
  }

  private dropBombs(): void {
    const alive = this.alive();
    const n = this.finalRound && alive.length >= 3 ? 2 : 1;
    // Random holders, avoiding the last victim when there is a choice.
    const pool = alive.length > n ? alive.filter((r) => r.id !== this.lastVictim) : alive;
    const picks: Runner[] = [];
    const left = [...pool];
    for (let i = 0; i < n && left.length > 0; i++) {
      const k = Math.floor(this.rnd() * left.length);
      picks.push(left.splice(k, 1)[0]!);
    }
    this.bombs = picks.map((r, i) => {
      const range = n === 2 ? RULES.finalFuse[i]! : RULES.fuse;
      return {
        index: i,
        holder: r.id,
        fuse: range[0] + this.rnd() * (range[1] - range[0]),
        litAt: 0,
        heldSince: 0,
        flight: null,
        exploded: false,
      };
    });
    for (const r of picks) r.stats.caught++;
    this.events.push({ k: 'drop', ids: picks.map((r) => r.id) });
  }

  tick(dt: number): void {
    if (this.phase === 'done') return;
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        this.idle(dt);
        if (this.phaseT >= RULES.intro) {
          this.phase = 'drop';
          this.phaseT = 0;
          this.dropBombs();
        }
        break;
      case 'drop':
        this.run(dt, false);
        if (this.phaseT >= RULES.drop) {
          this.phase = 'play';
          this.phaseT = 0;
          for (const b of this.bombs) {
            b.litAt = this.sim.t;
            b.heldSince = this.sim.t;
          }
          this.events.push({ k: 'go' });
        }
        break;
      case 'play':
        this.run(dt, true);
        this.burn();
        break;
      case 'boom':
        this.run(dt, false);
        if (this.phaseT >= RULES.boom) {
          if (this.bombs.some((b) => !b.exploded)) {
            // The second bomb of the final round burns on from where it was.
            const paused = this.sim.t - this.boomAt;
            for (const b of this.bombs) {
              b.litAt += paused;
              b.heldSince += paused;
            }
            this.phase = 'play';
            this.phaseT = 0;
            this.events.push({ k: 'back' });
          } else {
            this.phase = 'score';
            this.phaseT = 0;
            this.events.push({ k: 'back' }, { k: 'score' });
          }
        }
        break;
      case 'score':
        this.idle(dt);
        if (this.phaseT >= RULES.score) {
          if (this.over()) this.finish();
          else this.startRound(this.roundNo + 1);
        }
        break;
    }
    this.camera.update(this.framePoints(), dt);
  }

  /** Bodies stand still (cards on screen). */
  private idle(dt: number): void {
    for (const r of this.runners) this.sim.setMove(r.id, 0, 0);
    this.alpha = this.sim.advance(dt);
    this.drainSim();
  }

  private run(dt: number, live: boolean): void {
    for (const r of this.runners) {
      const body = this.sim.body(r.id);
      if (!body) continue;
      if (r.out) {
        this.sim.setMove(r.id, 0, 0);
        continue;
      }
      let x = 0;
      let z = 0;
      const pilot = this.pilots.get(r.id);
      if (pilot) {
        const out = pilot.think(this, r.id, dt);
        x = out.x;
        z = out.z;
        if (out.pass && live) this.pass(r.id);
      } else {
        const s = this.sticks.get(r.id);
        x = s?.x ?? 0;
        z = s?.z ?? 0;
      }
      // Only the holder gets the top speed.
      const k = this.bombOf(r.id) ? 1 : 1 / RULES.holderBoost;
      this.sim.setMove(r.id, x * k, z * k);
    }
    const before = new Map(this.runners.map((r) => [r.id, this.sim.body(r.id)?.pos]));
    const from = new Map<number, { x: number; z: number }>();
    for (const [id, p] of before) if (p) from.set(id, { x: p.x, z: p.z });
    this.alpha = this.sim.advance(dt);
    this.drainSim();
    for (const r of this.runners) {
      const b = this.sim.body(r.id);
      const p = from.get(r.id);
      if (b && p && !r.out) r.stats.distance += Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
      if (live && this.bombOf(r.id)) r.stats.holdTime += dt;
    }
    for (const b of this.bombs) if (b.flight && this.sim.t - b.flight.at >= RULES.flight) b.flight = null;
  }

  private burn(): void {
    for (const b of this.bombs) {
      if (b.exploded || this.sim.t - b.litAt < b.fuse) continue;
      this.explode(b);
      return;
    }
  }

  private explode(b: Bomb): void {
    this.boomAt = this.sim.t;
    b.exploded = true;
    b.flight = null;
    const r = this.runner(b.holder);
    const body = this.sim.body(b.holder);
    const at = body ? { ...body.pos } : v3();
    if (r) {
      r.lives = Math.max(0, r.lives - 1);
      r.stats.booms++;
      this.lastVictim = r.id;
      this.lastBoom.push(r.id);
      if (r.lives === 0) {
        r.out = true;
        r.stats.outRound = this.roundNo + 1;
      }
    }
    // Blast: everyone close is knocked away; the holder is frozen while the smoke clears.
    for (const o of this.alive()) {
      if (o.id === b.holder) continue;
      const ob = this.sim.body(o.id);
      if (!ob) continue;
      const dx = ob.pos.x - at.x;
      const dz = ob.pos.z - at.z;
      const d = Math.hypot(dx, dz);
      if (d < RULES.blast) this.sim.shove(o.id, dx || 1, dz, 7 * (1 - d / RULES.blast) + 3, b.holder);
    }
    if (body) {
      this.sim.setMove(b.holder, 0, 0);
      body.vel.x = 0;
      body.vel.z = 0;
      body.frozenLeft = RULES.boom;
    }
    if (r?.out && body) body.active = false;
    this.phase = 'boom';
    this.phaseT = 0;
    this.events.push({ k: 'boom', id: b.holder, bomb: b.index, out: !!r?.out, at });
    // The other bomb's holder may just have been knocked out: hand it on.
    for (const o of this.bombs) {
      if (o.exploded || o === b) continue;
      const h = this.runner(o.holder);
      if (h?.out) {
        const next = this.nearestTo(at, new Set([h.id]));
        if (next) {
          o.holder = next.id;
          o.heldSince = this.sim.t;
        } else o.exploded = true;
      }
    }
    if (this.alive().length <= 1) for (const o of this.bombs) o.exploded = true;
  }

  private nearestTo(p: V3 | null, skip: Set<number>): Runner | null {
    let best: Runner | null = null;
    let bestD = Infinity;
    for (const r of this.alive()) {
      if (skip.has(r.id) || this.bombOf(r.id)) continue;
      const b = this.sim.body(r.id);
      if (!b) continue;
      const d = p ? Math.hypot(b.pos.x - p.x, b.pos.z - p.z) : 0;
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  private posOf(id: number): V3 | null {
    return this.sim.body(id)?.pos ?? null;
  }

  /** The session is over: rounds done, one runner left, or (solo) the only person out. */
  over(): boolean {
    if (this.roundNo + 1 >= this.rounds) return true;
    const alive = this.alive();
    if (alive.length <= 1) return true;
    const humans = this.runners.filter((r) => r.id > 0);
    return humans.length > 0 && humans.every((r) => r.out);
  }

  private checkEnd(): void {
    if (this.phase !== 'done' && this.alive().length === 0) this.finish();
  }

  private finish(): void {
    this.phase = 'done';
    this.phaseT = 0;
    for (const r of this.runners) this.sim.setMove(r.id, 0, 0);
    this.events.push({ k: 'done' });
  }

  /** Final order: most lives, then out later, then less time holding a bomb. */
  standings(): Runner[] {
    return [...this.runners].sort(
      (a, b) => b.lives - a.lives || outKey(b) - outKey(a) || a.stats.holdTime - b.stats.holdTime,
    );
  }

  private drainSim(): void {
    for (const e of this.sim.drainEvents()) {
      if (e.k === 'bump') this.events.push({ k: 'bump', a: e.a, b: e.b });
      else if (e.k === 'fall') {
        // Nobody can leave the fenced yard, but never lose a body: back to a spawn spot.
        const i = Math.max(
          0,
          this.runners.findIndex((r) => r.id === e.id),
        );
        const sp = this.arena.spawns[i % this.arena.spawns.length]!;
        this.sim.place(e.id, v3(sp.x, 0.02, sp.z), 0, 0.5);
      }
    }
  }

  private framePoints(): V3[] {
    const A = this.arena;
    return [
      v3(-A.hx, 0, -A.hz),
      v3(A.hx, 0, -A.hz),
      v3(-A.hx, 0, A.hz),
      v3(A.hx, 0, A.hz),
      v3(0, 2.4, -A.hz),
    ];
  }
}

/** Later knock-out ranks higher; never out ranks highest. */
function outKey(r: Runner): number {
  return r.stats.outRound === 0 ? 99 : r.stats.outRound;
}
