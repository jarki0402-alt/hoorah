/**
 * Satu Tali rules (pure, no rendering): a co-op climb where the whole team is tied in one elastic
 * rope. A session is a run of sections on the chosen route; each: intro card, 3-2-1, the climb,
 * then the flag. Everyone must stand on the finish pad together to raise the flag.
 *
 * - Joystick to walk, LOMPAT to jump, PEGANG (held) to plant your feet: a gripping player anchors
 *   the rope, walks slowly and can haul a hanging friend back up by walking away.
 * - Fall off and the rope catches you if someone holds; hanging, tap LOMPAT (PANJAT) to climb the
 *   rope hand over hand. Near a lip you scramble over by yourself.
 * - PEGANG against a climbing wall climbs it; PEGANG while falling past a ledge grabs it.
 * - Anyone below the course = everyone back to the last save pad (Satu jatuh, semua ikut).
 * - Alone (PRD 6.4, owner's decision 2026-11-22): tied to a heavy sandbag instead of friends. It
 *   is dragged along, holds you when you fall, and LEMPAR throws it across a gap first.
 */

import type { Fruit, Look } from '@hoorah/protocol';
import { DEFAULT_RIG, GroupCamera } from '../../shared/kotak/camera';
import { type SavePoint, SaveTrail } from '../../shared/kotak/checkpoints';
import { clamp, rotY, type V3, v3 } from '../../shared/kotak/math';
import { Rope } from '../../shared/kotak/rope';
import { type Body, KotakSim, STEP } from '../../shared/kotak/sim';
import { toLocal, topOf } from '../../shared/kotak/solids';
import { buildSection, type RouteId, type Section } from './course';

export interface ClimberInfo {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
}

export type Phase = 'intro' | 'count' | 'climb' | 'flag' | 'done';

export const TIMING = {
  intro: 3.6,
  count: 3,
  /** Longest climb per section before the team is moved on (s). */
  sectionMax: 150,
  flag: 6,
  /** Held still after a team respawn (s). */
  wipeFreeze: 0.9,
  /** Everyone on the finish pad this long raises the flag (s). */
  finishHold: 0.5,
  /** A fall faster than this (m/s) that the rope stops counts as a catch. */
  catchSpeed: 5,
  /** Hanging this long before it counts (s). */
  hangAfter: 0.25,
  /** Rest between two hand-over-hand pulls (s). */
  ropeClimbRest: 0.3,
  /** Two jumps this close together are "kompak" (s). */
  syncWindow: 0.3,
} as const;

export const MOVE = {
  /** Walking speed factor while gripping on the ground. */
  gripWalk: 0.5,
  /** Walking speed factor while towing a heavy pull (the sandbag, a hanging friend). */
  towWalk: 0.65,
  /** Rope pull that counts as towing (m/s²). */
  towPull: 30,
  /** Up a climbing wall (m/s). */
  climbSpeed: 3.1,
  /** Hand over hand: rope shortened per pull (m). */
  ropeClimb: 0.75,
  /** Alone: PEGANG reels the sandbag in this fast (m/s), down to this length (m). */
  winch: 2.4,
  winchMin: 1.2,
  /** How fast a shortened rope pays back out once both ends stand (m/s). */
  relax: 1.6,
  /** Sandbag throw (m/s forward and up) and how close you must be. */
  throwForward: 8.2,
  throwUp: 9.5,
  throwReach: 2.6,
} as const;

/** Sideways speed of a vault over a lip (m/s). */
const VAULT_LEAN = 3;

/**
 * The sandbag: heavier than a player (weight factor) with good footing (m/s²), so a walking player
 * can drag it but a player hanging over an edge cannot.
 */
export const SACK = { weight: 0.6, hold: 30 } as const;

/** Body id of the solo sandbag (no player or computer has it). */
export const SACK_ID = -50;

export interface ClimberStats {
  /** Times this climber fell below the course (team respawn). */
  falls: number;
  /** Times the rope caught this climber. */
  hangs: number;
  /** Friends caught while holding the rope next to them. */
  catches: number;
  /** Friends hauled back up while gripping next to them. */
  rescues: number;
  /** Climbing walls topped. */
  climbs: number;
  /** Hand-over-hand pulls. */
  ropeClimbs: number;
  jumps: number;
  /** Jumps within a moment of a teammate. */
  syncJumps: number;
  /** Seconds spent gripping. */
  gripTime: number;
  /** Sections where this climber reached the finish pad first. */
  firstIn: number;
  /** Sandbag throws (solo). */
  throws: number;
}

/** Something that can scramble over a lip (a climber, the sandbag). */
interface Vaulter {
  /** Sim time of the last vault. */
  vaultAt: number;
  /** Lean of the current vault (unit, ground plane). */
  vaultX: number;
  vaultZ: number;
}

export interface Climber extends ClimberInfo, Vaulter {
  stats: ClimberStats;
  /** Stick, -1..1 each axis. */
  sx: number;
  sz: number;
  /** PEGANG held. */
  grip: boolean;
  /** Phone gone: stands still and holds the rope. */
  offline: boolean;
  /** Hanging from the rope below a teammate. */
  hanging: boolean;
  hangT: number;
  /** Lowest vertical speed since leaving the ground (catch detection). */
  minVy: number;
  hangY: number;
  climbing: boolean;
  ledge: boolean;
  ropeRest: number;
  /** Sim time of the last jump (sync detection). */
  jumpAt: number;
  /** Jump time already counted as a kompak jump. */
  syncedAt: number;
  /** Sim time hanging ended. */
  hangEnd: number;
  /** Seconds since the rope last caught this climber (phones), Infinity = not recently. */
  sinceCatch: number;
}

interface Wall {
  top: number;
  climb: boolean;
  /** Unit direction from the body towards the wall (ground plane). */
  nx: number;
  nz: number;
}

export interface SectionResult {
  no: number;
  time: number;
  wipes: number;
  stars: 0 | 1 | 2 | 3;
  done: boolean;
}

export type TaliEvent =
  | { k: 'section'; no: number }
  | { k: 'count'; value: number }
  | { k: 'go' }
  | { k: 'jump'; id: number }
  | { k: 'sync'; ids: number[] }
  | { k: 'land'; id: number; speed: number }
  | { k: 'sweep'; id: number }
  | { k: 'catch'; id: number; by: number[] }
  | { k: 'rescued'; id: number; by: number[] }
  | { k: 'climbUp'; id: number }
  | { k: 'ropeClimb'; id: number }
  | { k: 'ledge'; id: number }
  | { k: 'save'; index: number; id: number }
  | { k: 'wipe'; id: number; at: V3 }
  | { k: 'throw'; id: number }
  | { k: 'flag'; result: SectionResult }
  | { k: 'second'; left: number }
  | { k: 'done' };

export interface MatchOptions {
  climbers: ClimberInfo[];
  route: RouteId;
  sections: number;
  seed: number;
  aspect?: number;
}

const newStats = (): ClimberStats => ({
  falls: 0,
  hangs: 0,
  catches: 0,
  rescues: 0,
  climbs: 0,
  ropeClimbs: 0,
  jumps: 0,
  syncJumps: 0,
  gripTime: 0,
  firstIn: 0,
  throws: 0,
});

/**
 * Where climber `slot` stands on a pad: in a line along the course, zig-zagging a little, so the
 * team reads clearly from the main screen and the rope starts slack.
 */
export function teamSpot(sp: SavePoint, slot: number): V3 {
  const step = Math.min(1.1, (sp.hx * 2 - 1) / 4);
  return { x: sp.pos.x + (1.5 - slot) * step, y: sp.pos.y + 0.02, z: sp.pos.z + (slot % 2 ? 0.7 : -0.7) };
}

/** The sandbag waits behind its owner. */
function sackSpot(sp: SavePoint): V3 {
  return { x: sp.pos.x - Math.min(1.8, sp.hx - 0.6), y: sp.pos.y + 0.02, z: sp.pos.z + 1 };
}

/** Stars for a finished section: smooth and quick = 3. */
export function starsFor(time: number, wipes: number, par: number): 1 | 2 | 3 {
  if (wipes === 0 && time <= par) return 3;
  if (wipes <= 2 && time <= par * 1.6) return 2;
  return 1;
}

export class TaliMatch {
  readonly climbers: Climber[];
  readonly route: RouteId;
  readonly sections: number;
  readonly seed: number;
  sectionNo = 0;
  phase: Phase = 'intro';
  phaseT = 0;
  /** Climb clock of the current section (s). */
  sectionT = 0;
  /** Sum of the climb clocks of the finished sections (s). */
  teamTime = 0;
  section!: Section;
  sim!: KotakSim;
  rope!: Rope;
  trail!: SaveTrail;
  /** Furthest save pad of the team in this section. */
  save = 0;
  wipes = 0;
  /** Catches over the whole session (HUD). */
  catches = 0;
  readonly results: SectionResult[] = [];
  readonly camera: GroupCamera;
  alpha = 0;
  /** True while this section has a sandbag (one climber when it started). */
  sack = false;
  private events: TaliEvent[] = [];
  private readonly sackMove: Vaulter = { vaultAt: Number.NEGATIVE_INFINITY, vaultX: 1, vaultZ: 0 };
  private finishT = 0;
  private firstInGiven = false;
  private lastSecond = -1;
  private countShown = 0;

  constructor(opts: MatchOptions) {
    this.climbers = opts.climbers.slice(0, 4).map((c) => this.make(c));
    this.route = opts.route;
    this.sections = Math.max(1, Math.min(8, Math.floor(opts.sections)));
    this.seed = opts.seed;
    this.camera = new GroupCamera(
      {
        ...DEFAULT_RIG,
        fov: 40,
        pitch: 0.42,
        yaw: 0,
        minDist: 14,
        maxDist: 30,
        fill: 0.74,
        lead: v3(2, 0.8, -0.3),
      },
      opts.aspect ?? 16 / 9,
    );
    this.load(0);
  }

  private make(c: ClimberInfo): Climber {
    return {
      ...c,
      stats: newStats(),
      sx: 0,
      sz: 0,
      grip: false,
      offline: false,
      hanging: false,
      hangT: 0,
      minVy: 0,
      hangY: 0,
      climbing: false,
      ledge: false,
      ropeRest: 0,
      jumpAt: Number.NEGATIVE_INFINITY,
      syncedAt: Number.NaN,
      vaultAt: Number.NEGATIVE_INFINITY,
      hangEnd: Number.NEGATIVE_INFINITY,
      vaultX: 1,
      vaultZ: 0,
      sinceCatch: Infinity,
    };
  }

  climber(id: number): Climber | undefined {
    return this.climbers.find((c) => c.id === id);
  }

  drainEvents(): TaliEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
  }

  /** Ids tied in the rope, in order (the sandbag last). */
  chainIds(): number[] {
    const ids = this.climbers.map((c) => c.id);
    if (this.sack) ids.push(SACK_ID);
    return ids;
  }

  /* ------------------------------------------------------------------ lineup */

  addClimber(info: ClimberInfo): void {
    if (this.climber(info.id) || this.climbers.length >= 4) return;
    const c = this.make(info);
    this.climbers.push(c);
    const sp = this.trail.point(this.save);
    const pos = teamSpot(sp, this.climbers.length - 1);
    this.sim.addBody({ id: c.id, pos, yaw: Math.PI / 2 });
    this.sim.place(c.id, pos, Math.PI / 2, this.phase === 'climb' ? TIMING.wipeFreeze : 999);
    this.rope.chain(this.chainIds());
  }

  removeClimber(id: number): void {
    const i = this.climbers.findIndex((c) => c.id === id);
    if (i < 0) return;
    this.climbers.splice(i, 1);
    this.sim.removeBody(id);
    this.rope.setGrip(id, false);
    this.rope.chain(this.chainIds());
  }

  setOffline(id: number, off: boolean): void {
    const c = this.climber(id);
    if (!c) return;
    c.offline = off;
    if (off) {
      c.sx = 0;
      c.sz = 0;
      c.grip = false;
    }
  }

  restyle(id: number, look: Partial<Pick<ClimberInfo, 'name' | 'fruit' | 'look' | 'color'>>): void {
    const c = this.climber(id);
    if (c) Object.assign(c, look);
  }

  /* ------------------------------------------------------------------ input */

  steer(id: number, x: number, z: number): void {
    const c = this.climber(id);
    if (!c || c.offline) return;
    c.sx = Number.isFinite(x) ? clamp(x, -1, 1) : 0;
    c.sz = Number.isFinite(z) ? clamp(z, -1, 1) : 0;
  }

  hold(id: number, on: boolean): void {
    const c = this.climber(id);
    if (c && !c.offline) c.grip = on;
  }

  /** LOMPAT: jump, or pull up the rope while hanging, or vault from a ledge. */
  jump(id: number): void {
    const c = this.climber(id);
    const b = this.sim.body(id);
    if (!c || !b || c.offline || this.phase !== 'climb' || b.frozenLeft > 0) return;
    if (c.ledge) {
      const w = this.wallContact(b);
      if (w) this.vault(c, b, w);
      c.ledge = false;
      return;
    }
    if (c.hanging) {
      this.ropeClimb(c);
      return;
    }
    this.sim.jump(id);
  }

  /** LEMPAR (solo): throw the sandbag ahead, where you face. */
  throwSack(id: number): boolean {
    const c = this.climber(id);
    const b = this.sim.body(id);
    const s = this.sim.body(SACK_ID);
    if (!this.sack || !c || !b || !s || this.phase !== 'climb' || b.frozenLeft > 0) return false;
    if (Math.hypot(s.pos.x - b.pos.x, s.pos.z - b.pos.z) > MOVE.throwReach || s.pos.y < b.pos.y - 1.2)
      return false;
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    s.pos.x = b.pos.x + fx * 0.6;
    s.pos.z = b.pos.z + fz * 0.6;
    s.pos.y = b.pos.y + 1;
    s.vel.x = fx * MOVE.throwForward + b.vel.x * 0.5;
    s.vel.z = fz * MOVE.throwForward + b.vel.z * 0.5;
    s.vel.y = MOVE.throwUp;
    s.ground = -1;
    c.stats.throws++;
    this.events.push({ k: 'throw', id });
    return true;
  }

  /** Pulling hard on the rope (walks slower). */
  towing(id: number): boolean {
    for (let i = 0; i < this.rope.links.length; i++) {
      const l = this.rope.links[i]!;
      if ((l.a === id || l.b === id) && (this.rope.tension[i] ?? 0) > MOVE.towPull) return true;
    }
    return false;
  }

  /** The sandbag is within reach for a throw. */
  canThrow(id: number): boolean {
    const b = this.sim.body(id);
    const s = this.sim.body(SACK_ID);
    if (!this.sack || !b || !s) return false;
    return Math.hypot(s.pos.x - b.pos.x, s.pos.z - b.pos.z) <= MOVE.throwReach && s.pos.y >= b.pos.y - 1.2;
  }

  /* ------------------------------------------------------------------ sections */

  private load(no: number): void {
    this.sectionNo = no;
    this.section = buildSection(this.route, no, this.sections, this.seed);
    this.sim = new KotakSim({ killY: this.section.killY, crowd: 0.6 });
    for (const def of this.section.solids) this.sim.addSolid(def);
    this.trail = new SaveTrail(
      this.section.saves.map((s) => ({ index: s.index, pos: s.pos, hx: s.hx, hz: s.hz, solid: s.solid })),
    );
    this.rope = new Rope();
    this.sim.afterStep = (dt) => this.afterStep(dt);
    this.save = 0;
    this.wipes = 0;
    this.sectionT = 0;
    this.finishT = 0;
    this.firstInGiven = false;
    this.lastSecond = -1;
    this.countShown = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.sack = this.climbers.length === 1;
    const start = this.trail.point(0);
    this.climbers.forEach((c, i) => {
      this.resetClimber(c);
      const pos = teamSpot(start, i);
      this.sim.addBody({ id: c.id, pos, yaw: Math.PI / 2 });
      this.sim.place(c.id, pos, Math.PI / 2, 999);
    });
    if (this.sack) {
      const pos = sackSpot(start);
      this.sim.addBody({ id: SACK_ID, pos, yaw: Math.PI / 2 });
      this.sim.place(SACK_ID, pos, Math.PI / 2, 999);
      this.rope.setWeight(SACK_ID, SACK.weight);
      this.rope.setHold(SACK_ID, SACK.hold);
    }
    this.rope.chain(this.chainIds());
    this.camera.snap(this.framePoints());
    this.events.push({ k: 'section', no });
  }

  private resetClimber(c: Climber): void {
    c.sx = 0;
    c.sz = 0;
    c.hanging = false;
    c.hangT = 0;
    c.minVy = 0;
    c.climbing = false;
    c.ledge = false;
    c.ropeRest = 0;
    c.sinceCatch = Infinity;
  }

  /** 0..1 along the section, by the team's front runner. */
  progress(): number {
    const span = Math.max(1, this.section.finishX - this.section.startX);
    let front = this.section.startX;
    for (const c of this.climbers) front = Math.max(front, this.sim.body(c.id)?.pos.x ?? front);
    return clamp((front - this.section.startX) / span, 0, 1);
  }

  timeLeft(): number {
    return Math.max(0, TIMING.sectionMax - this.sectionT);
  }

  get countValue(): number {
    return Math.max(1, Math.ceil(TIMING.count - this.phaseT));
  }

  /** Stars collected so far over the session. */
  get stars(): number {
    return this.results.reduce((s, r) => s + r.stars, 0);
  }

  /* ------------------------------------------------------------------ tick */

  tick(dt: number): void {
    if (this.phase === 'done') return;
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        this.alpha = this.sim.advance(dt);
        this.drainSim();
        if (this.phaseT >= TIMING.intro) {
          this.phase = 'count';
          this.phaseT = 0;
        }
        break;
      case 'count': {
        this.alpha = this.sim.advance(dt);
        this.drainSim();
        const v = this.countValue;
        if (v !== this.countShown && this.phaseT < TIMING.count) {
          this.countShown = v;
          this.events.push({ k: 'count', value: v });
        }
        if (this.phaseT >= TIMING.count) this.go();
        break;
      }
      case 'climb':
        this.climb(dt);
        break;
      case 'flag':
        this.alpha = this.sim.advance(dt);
        this.drainSim();
        if (this.phaseT >= TIMING.flag) {
          if (this.sectionNo + 1 < this.sections) this.load(this.sectionNo + 1);
          else {
            this.phase = 'done';
            this.events.push({ k: 'done' });
          }
        }
        break;
    }
    this.camera.update(this.framePoints(), dt);
  }

  private go(): void {
    this.phase = 'climb';
    this.phaseT = 0;
    for (const b of this.sim.bodies) b.frozenLeft = 0;
    this.events.push({ k: 'go' });
  }

  private climb(dt: number): void {
    this.sectionT += dt;
    for (const c of this.climbers) {
      const b = this.sim.body(c.id);
      if (!b) continue;
      const grip = c.grip || c.offline;
      this.rope.setGrip(c.id, grip);
      const k = grip && b.ground >= 0 ? MOVE.gripWalk : this.towing(c.id) ? MOVE.towWalk : 1;
      this.sim.setMove(c.id, c.offline ? 0 : c.sx * k, c.offline ? 0 : c.sz * k);
      if (grip && !c.offline) c.stats.gripTime += dt;
      // Alone, PEGANG on the ground reels the sandbag in.
      if (this.sack && c.grip && !c.offline && b.ground >= 0) {
        const li = this.rope.linkOf(c.id, SACK_ID);
        if (li >= 0) this.rope.shorten(li, MOVE.winch * dt, MOVE.winchMin);
      }
      c.sinceCatch += dt;
    }
    this.alpha = this.sim.advance(dt);
    this.drainSim();
    if (this.phase !== 'climb') return;
    this.checkPads(dt);
    if (this.phase !== 'climb') return;
    const left = this.timeLeft();
    if (left <= 10 && left > 0) {
      const sec = Math.ceil(left);
      if (sec !== this.lastSecond) {
        this.lastSecond = sec;
        this.events.push({ k: 'second', left: sec });
      }
    }
    if (left <= 0) this.endSection(false);
  }

  private checkPads(dt: number): void {
    const finish = this.section.finish;
    let allIn = true;
    let anyOnline = false;
    for (const c of this.climbers) {
      const b = this.sim.body(c.id);
      if (!b) continue;
      const on = b.ground === finish;
      if (on && !this.firstInGiven) {
        this.firstInGiven = true;
        c.stats.firstIn++;
      }
      if (c.offline) continue;
      anyOnline = true;
      if (!on) allIn = false;
      if (b.ground >= 0) {
        const s = this.sim.solids[b.ground]!;
        if (s.def.role === 'checkpoint') {
          const index = this.trail.bySolid(s.id);
          if (index > this.save) {
            this.save = index;
            this.events.push({ k: 'save', index, id: c.id });
          }
        }
      }
    }
    if (anyOnline && allIn) {
      this.finishT += dt;
      if (this.finishT >= TIMING.finishHold) this.endSection(true);
    } else this.finishT = 0;
  }

  private endSection(done: boolean): void {
    const time = this.sectionT;
    const result: SectionResult = {
      no: this.sectionNo,
      time,
      wipes: this.wipes,
      stars: done ? starsFor(time, this.wipes, this.section.par) : 0,
      done,
    };
    this.results.push(result);
    this.teamTime += time;
    for (const c of this.climbers) {
      c.sx = 0;
      c.sz = 0;
      c.grip = false;
      this.sim.setMove(c.id, 0, 0);
      this.rope.setGrip(c.id, true);
    }
    this.phase = 'flag';
    this.phaseT = 0;
    this.events.push({ k: 'flag', result });
  }

  /* ------------------------------------------------------------------ 60 Hz rules */

  private afterStep(dt: number): void {
    // Someone holding a wall or a ledge (or vaulting over it) hangs on to the world, not the rope.
    for (const c of this.climbers) {
      const held = c.climbing || c.ledge || this.sim.t - c.vaultAt < 0.45;
      this.rope.setWeight(c.id, held ? 0 : 1);
    }
    this.rope.solve(this.sim, dt);
    if (this.phase !== 'climb') return;
    for (const c of this.climbers) {
      const b = this.sim.body(c.id);
      if (!b?.active || b.frozenLeft > 0) continue;
      this.wallRules(c, b);
      this.hangRules(c, b, dt);
    }
    if (this.sack) this.sackRules();
    // A shortened rope pays back out once both ends stand and nobody holds it in.
    for (let i = 0; i < this.rope.links.length; i++) {
      const l = this.rope.links[i]!;
      if (l.rest === undefined || this.rope.gripping(l.a) || this.rope.gripping(l.b)) continue;
      const a = this.sim.body(l.a);
      const b = this.sim.body(l.b);
      if (a && b && a.ground >= 0 && b.ground >= 0) this.rope.relax(i, MOVE.relax, dt);
    }
  }

  /**
   * The side of a solid this body touches: the highest one, with its top and the direction from
   * the body towards it on the ground plane.
   */
  private wallContact(b: Body): Wall | null {
    const T = this.sim.tuning;
    let best: Wall | null = null;
    for (const s of this.sim.solids) {
      if (s.state === 'gone' || s.def.role === 'sweeper') continue;
      const p = this.sim.pose(s.id);
      const top = topOf(s.def, p);
      const bottom = p.y - s.def.half.y;
      if (b.pos.y >= top - 0.02 || b.pos.y + T.height <= bottom) continue;
      const l = toLocal(p, b.pos.x, b.pos.z);
      const ox = l.x - clamp(l.x, -s.def.half.x, s.def.half.x);
      const oz = l.z - clamp(l.z, -s.def.half.z, s.def.half.z);
      const d = Math.hypot(ox, oz);
      if (d > T.radius + 0.16 || (best && top <= best.top)) continue;
      // Towards the wall: minus the offset from the box, back in world axes.
      const k = d > 1e-6 ? -1 / d : 0;
      const w = rotY(ox * k, oz * k, p.yaw);
      best = { top, climb: s.def.look === 'climb', nx: w.x, nz: w.z };
    }
    return best;
  }

  /** Jump up and over a lip, leaning towards the wall so the feet land on top. */
  private vault(v: Vaulter, b: Body, w: Wall): void {
    const g = this.sim.tuning.gravity;
    b.vel.y = Math.sqrt(2 * g * Math.max(0.3, w.top - b.pos.y + 0.3)) + g * STEP;
    const nl = Math.hypot(w.nx, w.nz);
    v.vaultX = nl > 0.1 ? w.nx / nl : 1;
    v.vaultZ = nl > 0.1 ? w.nz / nl : 0;
    b.vel.x = v.vaultX * VAULT_LEAN;
    b.vel.z = v.vaultZ * VAULT_LEAN;
    b.ground = -1;
    v.vaultAt = this.sim.t;
  }

  /** While a vault lasts, keep leaning in: the wall cancels it until the feet clear the lip. */
  private vaulting(v: Vaulter, b: Body): boolean {
    if (this.sim.t - v.vaultAt >= 0.45) return false;
    if (b.ground < 0) {
      b.vel.x = v.vaultX * VAULT_LEAN;
      b.vel.z = v.vaultZ * VAULT_LEAN;
    }
    return true;
  }

  /** The sandbag hauled up to a lip tips over it, like a climber scrambling. */
  private sackRules(): void {
    const s = this.sim.body(SACK_ID);
    if (!s?.active || s.frozenLeft > 0 || this.vaulting(this.sackMove, s) || s.ground >= 0) return;
    const li = this.rope.links.findIndex((l) => l.a === SACK_ID || l.b === SACK_ID);
    if (li < 0 || (this.rope.tension[li] ?? 0) < 6) return;
    const w = this.wallContact(s);
    if (w && w.top - s.pos.y <= 0.9) this.vault(this.sackMove, s, w);
  }

  /** Climbing walls, grabbing ledges and scrambling over a lip while hauled. */
  private wallRules(c: Climber, b: Body): void {
    const t = this.sim.t;
    c.climbing = false;
    if (this.vaulting(c, b)) return;
    const grip = c.grip && !c.offline;
    const g = this.sim.tuning.gravity;
    const hauled = c.hanging || t - c.hangEnd < 0.8;
    const wall = grip || hauled ? this.wallContact(b) : null;
    if (!wall) {
      c.ledge = false;
      return;
    }
    const below = wall.top - b.pos.y;
    if (grip && wall.climb) {
      if (below <= 0.8) {
        this.vault(c, b, wall);
        c.stats.climbs++;
        this.events.push({ k: 'climbUp', id: c.id });
        return;
      }
      c.climbing = true;
      b.vel.y = MOVE.climbSpeed + g * STEP;
      b.ground = -1;
      return;
    }
    if (b.ground >= 0) {
      c.ledge = false;
      return;
    }
    // Hauled up to a lip on the rope: scramble over by yourself.
    if (hauled && below <= 0.9) {
      this.vault(c, b, wall);
      c.ledge = false;
      return;
    }
    if (grip && below >= 0.4 && below <= 1.6 && b.vel.y <= 0.5) {
      if (!c.ledge) this.events.push({ k: 'ledge', id: c.id });
      c.ledge = true;
      b.vel.y = g * STEP;
      b.vel.x *= 0.5;
      b.vel.z *= 0.5;
      return;
    }
    c.ledge = false;
  }

  /** Who hangs on the rope, catches, rescues. */
  private hangRules(c: Climber, b: Body, dt: number): void {
    if (b.ground >= 0) {
      if (c.hanging && b.pos.y > c.hangY + 0.6) {
        const by = this.holders(c.id, true);
        for (const id of by) {
          const h = this.climber(id);
          if (h) h.stats.rescues++;
        }
        this.events.push({ k: 'rescued', id: c.id, by });
      }
      if (c.hanging) c.hangEnd = this.sim.t;
      c.hanging = false;
      c.hangT = 0;
      c.minVy = 0;
      return;
    }
    c.minVy = Math.min(c.minVy, b.vel.y);
    const held = this.holders(c.id, false).length > 0 && !c.climbing && !c.ledge;
    if (!held || Math.abs(b.vel.y) > 2.2) {
      if (!held) {
        if (c.hanging) c.hangEnd = this.sim.t;
        c.hangT = 0;
        c.hanging = false;
      }
      return;
    }
    c.hangT += dt;
    if (!c.hanging && c.hangT >= TIMING.hangAfter) {
      c.hanging = true;
      c.hangY = b.pos.y;
      c.stats.hangs++;
      if (c.minVy < -TIMING.catchSpeed) {
        const by = this.holders(c.id, true);
        for (const id of by) {
          const h = this.climber(id);
          if (h) h.stats.catches++;
        }
        this.catches++;
        c.sinceCatch = 0;
        this.events.push({ k: 'catch', id: c.id, by });
      }
    }
  }

  /**
   * Teammates (or the sandbag) the rope ties `id` to that stand above it and pull. With `credit`,
   * only climbers, preferring those who grip.
   */
  holders(id: number, credit: boolean): number[] {
    const b = this.sim.body(id);
    if (!b) return [];
    const out: number[] = [];
    for (const n of this.rope.neighbours(id)) {
      const o = this.sim.body(n);
      const li = this.rope.linkOf(id, n);
      if (!o || o.ground < 0 || o.pos.y < b.pos.y + 0.8 || (this.rope.tension[li] ?? 0) < 6) continue;
      out.push(n);
    }
    if (!credit) return out;
    const people = out.filter((n) => n !== SACK_ID && this.climber(n));
    const gripping = people.filter((n) => this.rope.gripping(n));
    return gripping.length > 0 ? gripping : people;
  }

  private ropeClimb(c: Climber): void {
    const now = this.sim.t;
    if (now - c.ropeRest < TIMING.ropeClimbRest) return;
    const up = this.holders(c.id, false);
    if (up.length === 0) return;
    c.ropeRest = now;
    for (const n of up) this.rope.shorten(this.rope.linkOf(c.id, n), MOVE.ropeClimb);
    c.stats.ropeClimbs++;
    this.events.push({ k: 'ropeClimb', id: c.id });
  }

  /* ------------------------------------------------------------------ physics events */

  private drainSim(): void {
    for (const e of this.sim.drainEvents()) {
      switch (e.k) {
        case 'jump': {
          const c = this.climber(e.id);
          if (!c) break;
          c.stats.jumps++;
          const t = this.sim.t;
          const mates = this.climbers.filter((o) => o !== c && t - o.jumpAt <= TIMING.syncWindow);
          c.jumpAt = t;
          if (mates.length > 0) {
            c.stats.syncJumps++;
            c.syncedAt = t;
            for (const m of mates)
              if (m.syncedAt !== m.jumpAt) {
                m.stats.syncJumps++;
                m.syncedAt = m.jumpAt;
              }
            this.events.push({ k: 'sync', ids: [c.id, ...mates.map((m) => m.id)] });
          }
          this.events.push({ k: 'jump', id: e.id });
          break;
        }
        case 'land':
          if (e.speed > 9 && this.climber(e.id)) this.events.push({ k: 'land', id: e.id, speed: e.speed });
          break;
        case 'sweep':
          if (this.climber(e.id)) this.events.push({ k: 'sweep', id: e.id });
          break;
        case 'fall':
          this.wipe(e.id);
          break;
        default:
          break;
      }
    }
  }

  /** Someone fell below the course: the whole team back to the last save pad. */
  private wipe(id: number): void {
    const b = this.sim.body(id);
    const at = b ? { ...b.pos } : v3();
    const c = this.climber(id);
    if (this.phase === 'climb') {
      if (c) c.stats.falls++;
      this.wipes++;
    }
    const sp = this.trail.point(this.save);
    this.climbers.forEach((o, i) => {
      this.resetClimber(o);
      this.sim.place(o.id, teamSpot(sp, i), Math.PI / 2, TIMING.wipeFreeze);
    });
    if (this.sack) {
      const pos = sackSpot(sp);
      this.sim.place(SACK_ID, pos, Math.PI / 2, TIMING.wipeFreeze);
    }
    for (const l of this.rope.links) delete l.rest;
    this.events.push({ k: 'wipe', id, at });
  }

  /* ------------------------------------------------------------------ camera */

  private framePoints(): V3[] {
    const pts: V3[] = [];
    for (const b of this.sim.bodies) {
      if (!b.active || b.fallen) continue;
      pts.push(b.pos, { x: b.pos.x, y: b.pos.y + 1.6, z: b.pos.z });
    }
    if (pts.length === 0) pts.push(this.trail.point(this.save).pos);
    return pts;
  }
}
