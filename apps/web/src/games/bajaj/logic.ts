/**
 * Bajaj Rush rules: a fixed-step (60 Hz) arcade kart simulation for four modes (Grand Prix, Duel,
 * Arena Tempur, Lawan Waktu). Pure and deterministic: no DOM, no three.js, no wall clock. Time
 * only advances through `step()`, so pausing is simply not stepping. The renderer reads kart state
 * (prev* fields for interpolation) and the driver drains `events` for sounds, phones and the HUD.
 */
import { DRIVE_BRAKE, DRIVE_GAS, DRIVE_LEFT, DRIVE_RIGHT, type Fruit, u16Delta } from '@hoorah/protocol';
import { type AiState, aiControl, newAiState } from './ai';
import { type Arena, getArena } from './arena';
import type { CircuitId } from './maps/types';
import { CURB_W, ROAD_HALF, type Track } from './track';
import { getTrack } from './tracks';

export type Mode = 'gp' | 'duel' | 'arena' | 'time';
export const MODES: readonly Mode[] = ['gp', 'duel', 'arena', 'time'];
export type ItemKind = 'durian' | 'firecracker' | 'boost' | 'oil' | 'shield' | 'horn';
export const ITEM_KINDS: readonly ItemKind[] = ['durian', 'firecracker', 'boost', 'oil', 'shield', 'horn'];
export type HitKind = 'durian' | 'firecracker' | 'oil' | 'horn';
export type Phase = 'intro' | 'countdown' | 'race' | 'results' | 'done';

export const STEP_MS = 1000 / 60;
const DT = 1 / 60;

export const TUNE = {
  /** m/s on tarmac with the gas held. */
  topSpeed: 24,
  /** m/s^2 from standstill, fading to 0 at top speed. */
  engine: 12,
  brake: 20,
  reverseAccel: 6,
  reverseMax: 7,
  /** Coasting drag: a + k * v. */
  coastA: 1.2,
  coastK: 0.05,
  /** Steering ramps to full in 1/steerUp s and recentres in 1/steerBack s. */
  steerUp: 4,
  steerBack: 5,
  steerFlip: 8,
  /** Yaw rate cap (rad/s): yawLow up to yawLowSpeed, easing down to yawHigh at top speed. */
  yawLow: 1.9,
  yawHigh: 0.85,
  yawLowSpeed: 5,
  /** Lateral velocity decay (1/s): very grippy, no sliding unless hit. */
  grip: 24,
  hitGrip: 2.5,
  boostMul: 1.35,
  boostAccel: 18,
  itemBoostS: 1.7,
  boostKick: 3,
  offroadMul: 0.55,
  kartRadius: 1.25,
  wallRestitution: 0.3,
  spinS: 1.25,
  wobbleS: 1.3,
  hornRadius: 12,
  hazardRadius: 1.7,
  hazardLife: 25,
  hazardMax: 16,
  shieldS: 20,
  rollS: 1.0,
  boxRespawnS: 3.5,
  boxRadius: 1.9,
  durianSpeed: 34,
  durianLife: 4.5,
  firecrackerSpeed: 38,
  firecrackerLife: 6,
  projectileRadius: 1.7,
  blastRadius: 4.5,
  gravity: 26,
  lives: 3,
  invulnS: 2.2,
  arenaTimeMs: 180_000,
};

export const INTRO_MS = 3200;
export const COUNT_MS = 1000;
/** After the first human finishes, the others get this long. */
export const FINISH_GRACE_MS = 30_000;
export const TIME_GRACE_MS = 45_000;
export const RESULTS_MS = 7000;
export const CHECKPOINTS = 16;
export const SECTORS = 4;
export const BOX_OFFSETS = [-6, -3, 0, 3, 6] as const;

export interface RacerSetup {
  /** Player id for humans (> 0), negative for CPUs. */
  id: number;
  human: boolean;
  name: string;
  color: string;
  fruit: Fruit;
}

export interface Controls {
  /** -1 left .. +1 right. */
  steer: number;
  gas: boolean;
  brake: boolean;
  useItem: boolean;
  /** Throw backwards (REM held at the tap). */
  back: boolean;
}

export interface KartStats {
  hitsGiven: number;
  hitsTaken: number;
  overtakes: number;
  wallHits: number;
  itemsUsed: number;
  boxes: number;
}

export interface Kart {
  idx: number;
  id: number;
  human: boolean;
  name: string;
  color: string;
  fruit: Fruit;
  /** AI drives: CPUs always, humans while disconnected or after finishing. */
  autopilot: boolean;
  connected: boolean;

  x: number;
  z: number;
  y: number;
  vy: number;
  h: number;
  vx: number;
  vz: number;
  /** Forward speed (m/s, signed: negative while reversing). */
  speed: number;
  prevX: number;
  prevZ: number;
  prevY: number;
  prevH: number;
  /** Smoothed steering actually applied, -1..1. */
  steer: number;
  /** Pedals as applied this step (for brake lights and the reverse beeper). */
  gas: boolean;
  braking: boolean;
  airborne: boolean;
  airT: number;

  buttons: number;
  lastTaps: number;
  pendingUse: number;
  pendingBack: boolean;

  boostT: number;
  spinT: number;
  wobbleT: number;
  shield: boolean;
  shieldT: number;
  item: ItemKind | null;
  rollT: number;
  rollItem: ItemKind | null;
  /** Immune to its own fresh hazard or projectile. */
  ownT: number;
  rescueT: number;
  invulnT: number;
  wallCd: number;
  bumpCd: number;

  /** Arena: hits left; 0 = out. */
  lives: number;
  out: boolean;
  outT: number;

  hint: number;
  s: number;
  d: number;
  /** Unwrapped progress along the loop (m); 0 = start line, laps * length = finish. */
  u: number;
  nextCp: number;
  lap: number;
  lapStartT: number;
  lapTimes: number[];
  /** Time since lap start at each checkpoint of the current lap and of the best lap. */
  cpTimes: number[];
  bestSplits: number[] | null;
  finishT: number | null;
  place: number;
  offroad: boolean;
  wrongT: number;
  wrongWay: boolean;
  stuckU: number;
  stuckX: number;
  stuckZ: number;
  stuckT: number;

  stats: KartStats;
  ai: AiState;
}

export interface ItemBox {
  id: number;
  x: number;
  z: number;
  y: number;
  s: number;
  d: number;
  active: boolean;
  respawnT: number;
}

/** Something lying on the ground: an oil slick or a durian lobbed backwards. */
export interface Hazard {
  id: number;
  kind: 'oil' | 'durian';
  x: number;
  z: number;
  y: number;
  owner: number;
  life: number;
  born: number;
}

/** A thrown durian or a homing petasan. */
export interface Projectile {
  id: number;
  kind: 'durian' | 'firecracker';
  owner: number;
  x: number;
  y: number;
  z: number;
  /** Circuit: arc length and lateral offset it travels along. */
  s: number;
  d: number;
  /** Arena: velocity. */
  vx: number;
  vz: number;
  speed: number;
  life: number;
  target: number;
  bounces: number;
  born: number;
  prevX: number;
  prevY: number;
  prevZ: number;
}

export type RaceEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'count'; n: number }
  | { type: 'go' }
  | { type: 'lap'; kart: number; lap: number; lapTime: number; best: boolean }
  | { type: 'finalLap'; kart: number }
  | { type: 'finish'; kart: number; place: number; time: number }
  | { type: 'pickup'; kart: number; box: number }
  | { type: 'item'; kart: number; item: ItemKind }
  | { type: 'use'; kart: number; item: ItemKind; back: boolean }
  | { type: 'boost'; kart: number }
  | { type: 'spin'; kart: number; by: number; kind: HitKind }
  | { type: 'wobble'; kart: number; by: number }
  | { type: 'blocked'; kart: number; by: number }
  | { type: 'wall'; kart: number; power: number }
  | { type: 'bump'; a: number; b: number; power: number }
  | { type: 'horn'; kart: number }
  | { type: 'hazard'; kart: number; id: number; kind: Hazard['kind'] }
  | { type: 'throw'; kart: number; id: number; kind: Projectile['kind'] }
  | { type: 'boom'; x: number; y: number; z: number; kart: number }
  | { type: 'lifeLost'; kart: number; lives: number; by: number }
  | { type: 'out'; kart: number; by: number }
  | { type: 'split'; kart: number; sector: number; delta: number | null; time: number }
  | { type: 'jump'; kart: number }
  | { type: 'land'; kart: number; air: number }
  | { type: 'rescue'; kart: number }
  | { type: 'wrongWay'; kart: number; on: boolean }
  | { type: 'end' };

/** Small seeded PRNG so races replay identically in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : Math.min(v, b));

export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

/** Steering from the phone's held buttons: -1, 0 or +1 (both = 0). */
export function steerFromButtons(buttons: number): number {
  const l = (buttons & DRIVE_LEFT) !== 0;
  const r = (buttons & DRIVE_RIGHT) !== 0;
  return l === r ? 0 : l ? -1 : 1;
}

/** Highest yaw rate (rad/s) at a speed: nimble when slow, calm and steady at top speed. */
export function yawCap(speed: number): number {
  const t = clamp((Math.abs(speed) - TUNE.yawLowSpeed) / (TUNE.topSpeed - TUNE.yawLowSpeed), 0, 1);
  return TUNE.yawLow + (TUNE.yawHigh - TUNE.yawLow) * t;
}

/** Move `cur` toward `target` at `rate` per second (the steering ramp). */
export function rampSteer(cur: number, target: number, dt: number): number {
  const flipping = target !== 0 && cur !== 0 && Math.sign(target) !== Math.sign(cur);
  const rate = flipping
    ? TUNE.steerFlip
    : target !== 0 && Math.abs(target) > Math.abs(cur)
      ? TUNE.steerUp
      : TUNE.steerBack;
  return cur + clamp(target - cur, -rate * dt, rate * dt);
}

/**
 * Item odds by race position (0 = leading, 1 = last): leaders get defensive items and durians
 * to lob backwards, the back of the pack gets speed and homing petasan.
 */
export function itemWeights(rel: number, arena = false): Record<ItemKind, number> {
  if (arena) return { durian: 0.32, firecracker: 0.2, oil: 0.14, shield: 0.14, horn: 0.1, boost: 0.1 };
  const r = clamp(rel, 0, 1);
  return {
    durian: 0.3 - 0.05 * r,
    firecracker: 0.02 + 0.33 * r,
    boost: 0.05 + 0.4 * r,
    oil: 0.25 - 0.2 * r,
    shield: 0.22 - 0.17 * r,
    horn: 0.16 - 0.06 * r,
  };
}

export function rollItem(rel: number, rnd: number, arena = false): ItemKind {
  const w = itemWeights(rel, arena);
  let total = 0;
  for (const k of ITEM_KINDS) total += w[k];
  let x = rnd * total;
  for (const k of ITEM_KINDS) {
    x -= w[k];
    if (x <= 0) return k;
  }
  return 'durian';
}

export interface RaceOptions {
  mode: Mode;
  laps: number;
  racers: readonly RacerSetup[];
  circuit?: CircuitId;
  seed?: number;
  /** Arena time limit override (tests). */
  arenaMs?: number;
}

export class Race {
  readonly mode: Mode;
  readonly track: Track | null;
  readonly arena: Arena | null;
  readonly laps: number;
  readonly karts: Kart[];
  readonly boxes: ItemBox[] = [];
  hazards: Hazard[] = [];
  projectiles: Projectile[] = [];
  phase: Phase = 'intro';
  /** Game time in ms (only advances in step()). */
  t = 0;
  phaseT = 0;
  goT = 0;
  countdown = 0;
  firstHumanFinishT: number | null = null;
  endsAt: number | null = null;
  readonly arenaMs: number;
  events: RaceEvent[] = [];
  /** Sorted kart indices, leader first. */
  order: number[] = [];
  private readonly rnd: () => number;
  private seq = 0;

  constructor(opts: RaceOptions) {
    this.mode = opts.mode;
    this.laps = Math.max(1, Math.floor(opts.laps));
    this.rnd = mulberry32(opts.seed ?? 1);
    this.arenaMs = opts.arenaMs ?? TUNE.arenaTimeMs;
    const isArena = opts.mode === 'arena';
    this.arena = isArena ? getArena() : null;
    this.track = isArena ? null : getTrack(opts.circuit ?? 'kota');
    this.karts = opts.racers.map((r, idx) => this.newKart(r, idx));
    let id = 0;
    if (this.arena) {
      for (const p of this.arena.boxSpots) {
        this.boxes.push({ id: id++, x: p.x, z: p.z, y: 0, s: 0, d: 0, active: true, respawnT: 0 });
      }
    } else if (this.mode !== 'time') {
      const T = this.track!;
      for (const s of T.marks.itemRows) {
        for (const d of BOX_OFFSETS) {
          const p = T.point(s, d);
          this.boxes.push({ id: id++, x: p.x, z: p.z, y: p.y, s: T.wrap(s), d, active: true, respawnT: 0 });
        }
      }
    }
    this.updateOrder(false);
  }

  private newKart(r: RacerSetup, idx: number): Kart {
    let x: number;
    let z: number;
    let y = 0;
    let h: number;
    let hint = 0;
    let s = 0;
    let d = 0;
    let u = 0;
    if (this.arena) {
      const sp = this.arena.spawns[idx % this.arena.spawns.length]!;
      x = sp.x;
      z = sp.z;
      h = sp.h;
    } else {
      const T = this.track!;
      const row = Math.floor(idx / 2);
      const side = idx % 2 === 0 ? -1 : 1;
      const sg = T.wrap(-7 - row * 7.5 - (side > 0 ? 3.2 : 0));
      const p = T.point(sg, side * 3.4);
      x = p.x;
      z = p.z;
      y = p.y;
      h = T.headingAt(sg);
      const proj = T.projectGlobal(x, z);
      hint = proj.i;
      s = proj.s;
      d = proj.d;
      u = T.delta(0, proj.s);
    }
    return {
      idx,
      id: r.id,
      human: r.human,
      name: r.name,
      color: r.color,
      fruit: r.fruit,
      autopilot: !r.human,
      connected: true,
      x,
      z,
      y,
      vy: 0,
      h,
      vx: 0,
      vz: 0,
      speed: 0,
      prevX: x,
      prevZ: z,
      prevY: y,
      prevH: h,
      steer: 0,
      gas: false,
      braking: false,
      airborne: false,
      airT: 0,
      buttons: 0,
      lastTaps: -1,
      pendingUse: 0,
      pendingBack: false,
      boostT: 0,
      spinT: 0,
      wobbleT: 0,
      shield: false,
      shieldT: 0,
      item: null,
      rollT: 0,
      rollItem: null,
      ownT: 0,
      rescueT: 0,
      invulnT: 0,
      wallCd: 0,
      bumpCd: 0,
      lives: TUNE.lives,
      out: false,
      outT: 0,
      hint,
      s,
      d,
      u,
      nextCp: 0,
      lap: 0,
      lapStartT: 0,
      lapTimes: [],
      cpTimes: [],
      bestSplits: null,
      finishT: null,
      place: idx + 1,
      offroad: false,
      wrongT: 0,
      wrongWay: false,
      stuckU: u,
      stuckX: x,
      stuckZ: z,
      stuckT: 0,
      stats: { hitsGiven: 0, hitsTaken: 0, overtakes: 0, wallHits: 0, itemsUsed: 0, boxes: 0 },
      ai: newAiState(idx, r.human, this.mode, this.rnd),
    };
  }

  /* ---------------------------------------------------------------- input */

  /** Phone input frame for a human's kart. `taps` is the cumulative u16 item counter. */
  input(playerId: number, buttons: number, taps: number, allowUse = true): void {
    const k = this.kartOf(playerId);
    if (!k) return;
    k.buttons = buttons & (DRIVE_LEFT | DRIVE_RIGHT | DRIVE_GAS | DRIVE_BRAKE);
    const counter = taps & 0xffff;
    const delta = k.lastTaps < 0 ? 0 : u16Delta(k.lastTaps, counter);
    k.lastTaps = counter;
    // A huge jump means a reconnect/reset of the counter, not 4000 presses.
    if (
      allowUse &&
      delta > 0 &&
      delta < 20 &&
      this.phase === 'race' &&
      !k.out &&
      k.finishT === null &&
      k.item &&
      k.rollT <= 0
    ) {
      k.pendingUse = 1;
      k.pendingBack = (buttons & DRIVE_BRAKE) !== 0;
    }
  }

  setConnected(playerId: number, connected: boolean): void {
    const k = this.kartOf(playerId);
    if (!k) return;
    k.connected = connected;
    k.autopilot = !connected || k.finishT !== null;
    if (!connected) {
      k.buttons = 0;
      k.pendingUse = 0;
      k.lastTaps = -1;
    }
  }

  kartOf(playerId: number): Kart | undefined {
    return this.karts.find((q) => q.human && q.id === playerId);
  }

  drain(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get raceTime(): number {
    return this.phase === 'race' || this.phase === 'results' ? this.t - this.goT : 0;
  }

  /** Arena: ms left on the clock. */
  get timeLeft(): number {
    return this.phase === 'race' ? Math.max(0, this.arenaMs - (this.t - this.goT)) : this.arenaMs;
  }

  get isCircuit(): boolean {
    return this.track !== null;
  }

  /* ---------------------------------------------------------------- step */

  step(): void {
    if (this.phase === 'done') return;
    this.t += STEP_MS;
    this.phaseT += STEP_MS;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= INTRO_MS) {
          this.setPhase('countdown');
          this.countdown = 3;
          this.emit({ type: 'count', n: 3 });
        }
        break;
      case 'countdown': {
        const n = 3 - Math.floor(this.phaseT / COUNT_MS);
        if (n <= 0) {
          this.setPhase('race');
          this.goT = this.t;
          this.countdown = 0;
          for (const k of this.karts) {
            k.lapStartT = this.t;
            k.stuckT = this.t;
            k.stuckU = k.u;
          }
          this.emit({ type: 'go' });
        } else if (n !== this.countdown) {
          this.countdown = n;
          this.emit({ type: 'count', n });
        }
        break;
      }
      case 'race':
        this.checkRaceEnd();
        break;
      case 'results':
        if (this.phaseT >= RESULTS_MS) {
          this.setPhase('done');
          this.emit({ type: 'end' });
          return;
        }
        break;
    }
    this.simulate();
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.emit({ type: 'phase', phase: p });
  }

  private emit(e: RaceEvent): void {
    this.events.push(e);
  }

  private checkRaceEnd(): void {
    const raceT = this.t - this.goT;
    const humans = this.karts.filter((k) => k.human);
    if (this.mode === 'arena') {
      const alive = this.karts.filter((k) => !k.out);
      const humansOut = humans.length > 0 && humans.every((k) => k.out);
      if (alive.length <= 1 || raceT >= this.arenaMs || humansOut) this.finishRace();
      return;
    }
    const allHumansDone = humans.length > 0 && humans.every((k) => k.finishT !== null);
    const everyoneDone = this.karts.every((k) => k.finishT !== null);
    const graceOver = this.endsAt !== null && this.t >= this.endsAt;
    const hardCap = raceT > this.laps * 120_000 + 60_000;
    if (allHumansDone || everyoneDone || graceOver || hardCap) this.finishRace();
  }

  private finishRace(): void {
    this.updateOrder(false);
    this.endsAt = null;
    this.setPhase('results');
  }

  private simulate(): void {
    const racing = this.phase === 'race' || this.phase === 'results';
    for (const k of this.karts) {
      k.prevX = k.x;
      k.prevZ = k.z;
      k.prevY = k.y;
      k.prevH = k.h;
    }
    for (const p of this.projectiles) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;
    }
    if (!racing) {
      for (const k of this.karts) {
        k.vx = 0;
        k.vz = 0;
        k.speed = 0;
        // Revving on the grid: the phone's pedals light up the brake lights.
        k.gas = !k.autopilot ? (k.buttons & DRIVE_GAS) !== 0 : false;
        k.braking = !k.autopilot ? (k.buttons & DRIVE_BRAKE) !== 0 : false;
      }
      return;
    }
    for (const k of this.karts) this.drive(k, this.controlsFor(k));
    if (this.mode !== 'time') this.collideKarts();
    for (const k of this.karts) {
      if (this.track) this.trackKart(k);
      else this.arenaKart(k);
      this.vertical(k);
    }
    this.updateBoxes();
    this.updateHazards();
    this.updateProjectiles();
    this.updateOrder(this.phase === 'race' && this.t - this.goT > 3000);
  }

  private controlsFor(k: Kart): Controls {
    if (k.out) return { steer: 0, gas: false, brake: false, useItem: false, back: false };
    if (k.autopilot) return aiControl(this, k, DT);
    const c: Controls = {
      steer: steerFromButtons(k.buttons),
      gas: (k.buttons & DRIVE_GAS) !== 0,
      brake: (k.buttons & DRIVE_BRAKE) !== 0,
      useItem: k.pendingUse > 0,
      back: k.pendingBack,
    };
    k.pendingUse = 0;
    k.pendingBack = false;
    return c;
  }

  /* ---------------------------------------------------------------- physics */

  private topSpeed(k: Kart): number {
    let top = TUNE.topSpeed * (k.autopilot ? k.ai.speedMul : 1);
    if (k.finishT !== null) top *= 0.72;
    if (k.offroad) top *= TUNE.offroadMul;
    if (k.wobbleT > 0) top *= 0.6;
    return top;
  }

  private drive(k: Kart, c: Controls): void {
    const T = TUNE;
    const finished = k.finishT !== null;
    k.boostT = Math.max(0, k.boostT - DT);
    k.spinT = Math.max(0, k.spinT - DT);
    k.wobbleT = Math.max(0, k.wobbleT - DT);
    k.ownT = Math.max(0, k.ownT - DT);
    k.rescueT = Math.max(0, k.rescueT - DT);
    k.invulnT = Math.max(0, k.invulnT - DT);
    k.wallCd = Math.max(0, k.wallCd - DT);
    k.bumpCd = Math.max(0, k.bumpCd - DT);
    if (k.shield) {
      k.shieldT -= DT;
      if (k.shieldT <= 0) k.shield = false;
    }
    if (k.rollT > 0) {
      k.rollT -= DT;
      if (k.rollT <= 0 && k.rollItem) {
        k.rollT = 0;
        k.item = k.rollItem;
        k.rollItem = null;
        this.emit({ type: 'item', kart: k.idx, item: k.item });
      }
    }
    if (k.out) {
      k.vx *= 0.9;
      k.vz *= 0.9;
      k.speed = 0;
      k.gas = false;
      k.braking = false;
      return;
    }

    const spinning = k.spinT > 0;
    let steerIn = spinning ? 0 : clamp(c.steer, -1, 1);
    if (k.wobbleT > 0) steerIn *= 0.5;
    k.steer = rampSteer(k.steer, steerIn, DT);

    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    const rx = -fz;
    const rz = fx;
    let vf = k.vx * fx + k.vz * fz;
    let vl = k.vx * rx + k.vz * rz;

    // Longitudinal: gas, brake (then reverse), coast.
    const top = this.topSpeed(k);
    k.gas = c.gas && !spinning;
    k.braking = c.brake && !spinning && vf > 0.3;
    if (k.airborne) {
      // Wheels off the ground: keep momentum.
    } else if (spinning) {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), 14 * DT);
    } else if (k.boostT > 0) {
      const boostTop = top * T.boostMul;
      vf = vf < boostTop ? Math.min(boostTop, vf + T.boostAccel * DT) : vf - 4 * DT;
    } else if (c.brake) {
      if (vf > 0.3) vf = Math.max(0, vf - T.brake * DT);
      else vf = Math.max(-T.reverseMax, vf - T.reverseAccel * DT);
    } else if (c.gas) {
      if (vf < 0) vf = Math.min(0, vf + T.brake * DT);
      else if (vf < top) vf += T.engine * (1 - vf / top) * DT;
      else vf = Math.max(top, vf - 6 * DT);
    } else {
      const dec = (T.coastA + T.coastK * Math.abs(vf)) * DT * (k.offroad ? 2.5 : 1);
      vf = Math.abs(vf) <= dec ? 0 : vf - Math.sign(vf) * dec;
    }
    if (!k.airborne && vf > top * (k.boostT > 0 ? T.boostMul : 1) + 0.5) vf -= (k.offroad ? 9 : 3) * DT;
    if (!k.airborne && Math.abs(k.steer) > 0.4 && vf > 15) vf -= Math.abs(k.steer) * 1.6 * DT;

    // Yaw: capped by speed; a standing kart can't turn.
    const turnF = Math.min(1, Math.abs(vf) / 3);
    let yaw = -k.steer * yawCap(vf) * turnF;
    if (vf < -0.2) yaw = -yaw;
    if (k.airborne) yaw *= 0.35;
    if (k.wobbleT > 0) yaw += Math.sin(this.t / 70 + k.idx) * 0.5;
    k.h = wrapAngle(k.h + yaw * DT);

    // Lateral grip: planted unless hit.
    const grip = spinning ? T.hitGrip : k.airborne ? 2 : T.grip;
    vl *= Math.exp(-grip * DT);

    const nfx = Math.sin(k.h);
    const nfz = Math.cos(k.h);
    k.vx = nfx * vf + -nfz * vl;
    k.vz = nfz * vf + nfx * vl;
    k.speed = vf;
    k.x += k.vx * DT;
    k.z += k.vz * DT;

    if (c.useItem && k.item && k.rollT <= 0 && !finished && this.phase === 'race') this.useItem(k, c.back);
  }

  /** Ground following with ballistic hops over crests and ramps. */
  private vertical(k: Kart): void {
    const g = this.groundAt(k);
    if (k.airborne) {
      k.vy -= TUNE.gravity * DT;
      k.y += k.vy * DT;
      k.airT += DT;
      if (k.y <= g) {
        k.y = g;
        k.airborne = false;
        if (k.airT > 0.2) this.emit({ type: 'land', kart: k.idx, air: k.airT });
        k.vy = 0;
      }
      return;
    }
    const ballistic = k.y + k.vy * DT - 0.5 * TUNE.gravity * DT * DT;
    if (k.vy > 1 && ballistic > g + 0.03 && Math.abs(k.speed) > 8) {
      k.airborne = true;
      k.airT = 0;
      k.y = ballistic;
      k.vy -= TUNE.gravity * DT;
      this.emit({ type: 'jump', kart: k.idx });
      return;
    }
    k.vy = clamp((g - k.y) / DT, -20, 20);
    k.y = g;
  }

  private groundAt(k: Kart): number {
    if (this.arena) return this.arena.heightAt(k.x, k.z);
    return this.track!.project(k.x, k.z, k.hint, 4).y;
  }

  private applyBoost(k: Kart, dur: number): void {
    k.boostT = Math.max(k.boostT, dur);
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    k.vx += fx * TUNE.boostKick;
    k.vz += fz * TUNE.boostKick;
    this.emit({ type: 'boost', kart: k.idx });
  }

  /* ---------------------------------------------------------------- items */

  private useItem(k: Kart, back: boolean): void {
    const item = k.item!;
    k.item = null;
    k.stats.itemsUsed++;
    this.emit({ type: 'use', kart: k.idx, item, back });
    switch (item) {
      case 'boost':
        this.applyBoost(k, TUNE.itemBoostS);
        return;
      case 'shield':
        k.shield = true;
        k.shieldT = TUNE.shieldS;
        return;
      case 'oil':
        this.dropHazard(k, 'oil');
        return;
      case 'durian':
        if (back) this.dropHazard(k, 'durian');
        else this.launch(k, 'durian');
        return;
      case 'firecracker':
        this.launch(k, 'firecracker');
        return;
      case 'horn': {
        this.emit({ type: 'horn', kart: k.idx });
        const r2 = TUNE.hornRadius * TUNE.hornRadius;
        for (const o of this.karts) {
          if (o === k || o.finishT !== null || o.out) continue;
          const dx = o.x - k.x;
          const dz = o.z - k.z;
          const dy = o.y - k.y;
          if (dx * dx + dz * dz + dy * dy * 4 > r2) continue;
          this.hit(o, k.idx, 'horn');
        }
        return;
      }
    }
  }

  private dropHazard(k: Kart, kind: Hazard['kind']): void {
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    const back = kind === 'durian' ? 3.4 : 2.8;
    let x = k.x - fx * back;
    let z = k.z - fz * back;
    let y = k.y;
    if (this.track) {
      y = this.track.project(x, z, k.hint, 8).y;
    } else if (this.arena) {
      const res = this.arena.resolve(x, z, 0.8);
      if (res) {
        x = res.x;
        z = res.z;
      }
      y = this.arena.heightAt(x, z);
    }
    const hz: Hazard = { id: ++this.seq, kind, x, z, y, owner: k.idx, life: TUNE.hazardLife, born: this.t };
    this.hazards.push(hz);
    if (this.hazards.length > TUNE.hazardMax) this.hazards.shift();
    k.ownT = 1.0;
    this.emit({ type: 'hazard', kart: k.idx, id: hz.id, kind });
  }

  /** The kart just ahead in the race (circuits) or the nearest one in front (arena). */
  private targetFor(k: Kart): number {
    if (this.track) {
      const ahead = this.order[k.place - 2];
      if (ahead === undefined) return -1;
      const o = this.karts[ahead]!;
      return o.finishT === null ? ahead : -1;
    }
    let best = -1;
    let bestScore = Infinity;
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    for (const o of this.karts) {
      if (o === k || o.out) continue;
      const dx = o.x - k.x;
      const dz = o.z - k.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 80) continue;
      const front = (dx * fx + dz * fz) / (dist || 1);
      const score = dist * (front > 0.3 ? 1 : 3);
      if (score < bestScore) {
        bestScore = score;
        best = o.idx;
      }
    }
    return best;
  }

  private launch(k: Kart, kind: Projectile['kind']): void {
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    const speed = (kind === 'durian' ? TUNE.durianSpeed : TUNE.firecrackerSpeed) + Math.max(0, k.speed) * 0.4;
    const x = k.x + fx * 2.2;
    const z = k.z + fz * 2.2;
    let s = 0;
    let d = 0;
    let y = k.y + 0.8;
    if (this.track) {
      const pr = this.track.project(x, z, k.hint, 8);
      s = pr.s;
      d = clamp(pr.d, -ROAD_HALF + 0.8, ROAD_HALF - 0.8);
      y = pr.y + 0.8;
    }
    const p: Projectile = {
      id: ++this.seq,
      kind,
      owner: k.idx,
      x,
      y,
      z,
      s,
      d,
      vx: fx * speed,
      vz: fz * speed,
      speed,
      life: kind === 'durian' ? TUNE.durianLife : TUNE.firecrackerLife,
      target: kind === 'firecracker' ? this.targetFor(k) : -1,
      bounces: 0,
      born: this.t,
      prevX: x,
      prevY: y,
      prevZ: z,
    };
    this.projectiles.push(p);
    this.emit({ type: 'throw', kart: k.idx, id: p.id, kind });
  }

  private updateProjectiles(): void {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.life -= DT;
      if (p.life <= 0) {
        if (p.kind === 'firecracker') this.explode(p, null);
        continue;
      }
      const target = p.target >= 0 ? this.karts[p.target]! : null;
      if (target && (target.out || target.finishT !== null)) p.target = -1;
      if (this.track) {
        const T = this.track;
        p.s = T.wrap(p.s + p.speed * DT);
        if (p.kind === 'firecracker' && p.target >= 0) {
          p.d += clamp(target!.d - p.d, -7 * DT, 7 * DT);
          // Slow to the target's pace once alongside, so it can't overshoot and miss.
          if (T.delta(p.s, target!.s) < 1)
            p.s = T.wrap(p.s - Math.max(0, p.speed - Math.max(0, target!.speed) - 6) * DT);
        }
        p.d = clamp(p.d, -ROAD_HALF + 0.6, ROAD_HALF - 0.6);
        const pt = T.point(p.s, p.d);
        const hop = p.kind === 'durian' ? Math.abs(Math.sin((this.t - p.born) / 90)) * 0.7 : 0.35;
        p.x = pt.x;
        p.z = pt.z;
        p.y = pt.y + 0.55 + hop;
      } else {
        const A = this.arena!;
        if (p.kind === 'firecracker' && target) {
          const want = Math.atan2(target.x - p.x, target.z - p.z);
          const cur = Math.atan2(p.vx, p.vz);
          const turn = clamp(wrapAngle(want - cur), -3.2 * DT, 3.2 * DT);
          p.vx = Math.sin(cur + turn) * p.speed;
          p.vz = Math.cos(cur + turn) * p.speed;
        }
        p.x += p.vx * DT;
        p.z += p.vz * DT;
        const res = A.resolve(p.x, p.z, 0.5);
        if (res) {
          if (p.kind === 'firecracker') {
            this.explode(p, null);
            continue;
          }
          p.x = res.x;
          p.z = res.z;
          const vn = p.vx * res.nx + p.vz * res.nz;
          p.vx -= 2 * vn * res.nx;
          p.vz -= 2 * vn * res.nz;
          if (++p.bounces > 3) continue;
        }
        const hop = p.kind === 'durian' ? Math.abs(Math.sin((this.t - p.born) / 90)) * 0.7 : 0.35;
        p.y = A.heightAt(p.x, p.z) + 0.55 + hop;
      }
      // Contact with a kart.
      let victim: Kart | null = null;
      const r2 = TUNE.projectileRadius * TUNE.projectileRadius;
      for (const k of this.karts) {
        if (k.out || k.finishT !== null) continue;
        if (k.idx === p.owner && this.t - p.born < 600) continue;
        const dx = k.x - p.x;
        const dz = k.z - p.z;
        const dy = k.y + 0.8 - p.y;
        if (dx * dx + dz * dz + dy * dy > r2) continue;
        victim = k;
        break;
      }
      if (!victim) {
        keep.push(p);
        continue;
      }
      if (p.kind === 'firecracker') this.explode(p, victim);
      else this.hit(victim, p.owner, 'durian');
    }
    this.projectiles = keep;
  }

  private explode(p: Projectile, direct: Kart | null): void {
    this.emit({ type: 'boom', x: p.x, y: p.y, z: p.z, kart: p.owner });
    if (direct) this.hit(direct, p.owner, 'firecracker');
    const r2 = TUNE.blastRadius * TUNE.blastRadius;
    for (const k of this.karts) {
      if (k === direct || k.idx === p.owner || k.out || k.finishT !== null) continue;
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      if (dx * dx + dz * dz > r2) continue;
      this.hit(k, p.owner, 'firecracker');
    }
  }

  /** Applies an attack to `victim`; returns false if it was blocked or ignored. */
  hit(victim: Kart, by: number, kind: HitKind): boolean {
    if (victim.out || victim.rescueT > 0 || victim.invulnT > 0) return false;
    if (victim.shield) {
      victim.shield = false;
      victim.shieldT = 0;
      this.emit({ type: 'blocked', kart: victim.idx, by });
      return false;
    }
    victim.boostT = 0;
    victim.stats.hitsTaken++;
    if (by !== victim.idx && by >= 0) this.karts[by]!.stats.hitsGiven++;
    if (kind === 'horn') {
      victim.wobbleT = TUNE.wobbleS;
      this.emit({ type: 'wobble', kart: victim.idx, by });
      return true;
    }
    victim.spinT = TUNE.spinS;
    this.emit({ type: 'spin', kart: victim.idx, by, kind });
    if (this.arena) {
      victim.lives = Math.max(0, victim.lives - 1);
      victim.invulnT = TUNE.invulnS;
      this.emit({ type: 'lifeLost', kart: victim.idx, lives: victim.lives, by });
      if (victim.lives === 0) {
        victim.out = true;
        victim.outT = this.t;
        victim.item = null;
        victim.rollT = 0;
        victim.rollItem = null;
        victim.shield = false;
        this.emit({ type: 'out', kart: victim.idx, by });
      }
    }
    return true;
  }

  private collideKarts(): void {
    const R = TUNE.kartRadius;
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i]!;
      if (a.out) continue;
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j]!;
        if (b.out || Math.abs(a.y - b.y) > 2) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= 4 * R * R || d2 < 1e-6) continue;
        if (a.rescueT > 0 || b.rescueT > 0) continue;
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const nz = dz / dist;
        const push = (2 * R - dist) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel < 0) {
          const imp = (-(1 + 0.4) * rel) / 2;
          a.vx -= nx * imp;
          a.vz -= nz * imp;
          b.vx += nx * imp;
          b.vz += nz * imp;
          if (-rel > 3 && a.bumpCd <= 0 && b.bumpCd <= 0) {
            a.bumpCd = 0.5;
            b.bumpCd = 0.5;
            this.emit({ type: 'bump', a: a.idx, b: b.idx, power: -rel });
          }
        }
      }
    }
  }

  private wallHit(k: Kart, vn: number): void {
    if (vn > 4 && k.wallCd <= 0) {
      k.wallCd = 0.5;
      k.stats.wallHits++;
      this.emit({ type: 'wall', kart: k.idx, power: vn });
    }
  }

  /** Arena: walls, obstacles, stuck recovery. */
  private arenaKart(k: Kart): void {
    const A = this.arena!;
    const res = A.resolve(k.x, k.z, TUNE.kartRadius * 0.9);
    if (res) {
      k.x = res.x;
      k.z = res.z;
      const vn = -(k.vx * res.nx + k.vz * res.nz);
      if (vn > 0) {
        k.vx += res.nx * vn * (1 + TUNE.wallRestitution);
        k.vz += res.nz * vn * (1 + TUNE.wallRestitution);
        if (vn > 4) {
          k.vx *= 0.9;
          k.vz *= 0.9;
        }
        this.wallHit(k, vn);
      }
    }
    k.offroad = false;
    if (this.phase !== 'race' || k.out) return;
    if (Math.hypot(k.x - k.stuckX, k.z - k.stuckZ) > 3) {
      k.stuckX = k.x;
      k.stuckZ = k.z;
      k.stuckT = this.t;
    } else if (k.spinT <= 0 && this.t - k.stuckT > (k.autopilot ? 6000 : 9000)) {
      this.rescueArena(k);
    }
  }

  private rescueArena(k: Kart): void {
    const A = this.arena!;
    let best = A.spawns[0]!;
    let bestScore = -Infinity;
    for (const sp of A.spawns) {
      let near = Infinity;
      for (const o of this.karts)
        if (o !== k && !o.out) near = Math.min(near, Math.hypot(o.x - sp.x, o.z - sp.z));
      if (near > bestScore) {
        bestScore = near;
        best = sp;
      }
    }
    this.place(k, best.x, best.z, best.h);
    this.emit({ type: 'rescue', kart: k.idx });
  }

  private place(k: Kart, x: number, z: number, h: number): void {
    k.x = k.prevX = x;
    k.z = k.prevZ = z;
    k.h = k.prevH = h;
    k.vx = 0;
    k.vz = 0;
    k.vy = 0;
    k.speed = 0;
    k.airborne = false;
    k.spinT = 0;
    k.wobbleT = 0;
    k.rescueT = 1.5;
    k.wrongT = 0;
    k.stuckX = x;
    k.stuckZ = z;
    k.stuckT = this.t;
  }

  /** Circuits: walls, off-road, progress, checkpoints, laps, splits, wrong way, rescue. */
  private trackKart(k: Kart): void {
    const T = this.track!;
    let p = T.project(k.x, k.z, k.hint);
    let lost = false;
    if (p.dist2 > 30 * 30) {
      p = T.projectGlobal(k.x, k.z);
      lost = true;
    }
    const wallR = T.wallR[p.i]! - TUNE.kartRadius * 0.8;
    const wallL = T.wallL[p.i]! - TUNE.kartRadius * 0.8;
    let side = 0;
    let over = 0;
    if (p.d > wallR) {
      side = 1;
      over = p.d - wallR;
    } else if (p.d < -wallL) {
      side = -1;
      over = -wallL - p.d;
    }
    if (side !== 0) {
      const j = (p.i + 1) % T.n;
      const tx = (T.tx[p.i]! + T.tx[j]!) / 2;
      const tz = (T.tz[p.i]! + T.tz[j]!) / 2;
      const nx = -tz * side;
      const nz = tx * side;
      k.x -= nx * over;
      k.z -= nz * over;
      const vn = k.vx * nx + k.vz * nz;
      if (vn > 0) {
        k.vx -= nx * vn * (1 + TUNE.wallRestitution);
        k.vz -= nz * vn * (1 + TUNE.wallRestitution);
        const scrub = vn > 4 ? 0.9 : 0.985;
        k.vx *= scrub;
        k.vz *= scrub;
        this.wallHit(k, vn);
      }
      p = T.project(k.x, k.z, p.i, 4);
    }
    k.offroad = Math.abs(p.d) > ROAD_HALF + CURB_W && !k.airborne;
    k.d = p.d;
    k.hint = p.i;
    let ds = lost ? 0 : T.delta(k.s, p.s);
    ds = clamp(ds, -3, 3);
    k.s = p.s;
    k.u += ds;

    if (this.phase !== 'race' && this.phase !== 'results') return;

    const cpLen = T.length / CHECKPOINTS;
    while (k.finishT === null && k.u >= k.nextCp * cpLen) {
      const cp = k.nextCp;
      k.nextCp++;
      if (cp % CHECKPOINTS === 0) this.crossLine(k);
      else this.checkpoint(k, cp % CHECKPOINTS);
    }

    const tx = T.tx[p.i]!;
    const tz = T.tz[p.i]!;
    const dot = Math.sin(k.h) * tx + Math.cos(k.h) * tz;
    // Reversing out of a wall is not "wrong way": only driving forwards against the track is.
    if (dot < -0.35 && k.speed > 3) k.wrongT += DT;
    else k.wrongT = Math.max(0, k.wrongT - DT * 2);
    const wrong = k.wrongT > 0.9 && k.finishT === null;
    if (wrong !== k.wrongWay) {
      k.wrongWay = wrong;
      if (k.human) this.emit({ type: 'wrongWay', kart: k.idx, on: wrong });
    }

    // Really stuck (no forward progress for a long while): tow back onto the road.
    if (k.u > k.stuckU + 3) {
      k.stuckU = k.u;
      k.stuckT = this.t;
    } else if (k.spinT <= 0 && this.t - k.stuckT > (k.autopilot ? 4000 : 7000)) {
      this.rescueTrack(k);
    }
  }

  private checkpoint(k: Kart, cp: number): void {
    if (k.lap < 1) return;
    const t = this.t - k.lapStartT;
    k.cpTimes[cp] = t;
    if (cp % (CHECKPOINTS / SECTORS) !== 0) return;
    const sector = cp / (CHECKPOINTS / SECTORS);
    const pb = k.bestSplits?.[cp];
    if (this.mode === 'time' && k.human) {
      this.emit({ type: 'split', kart: k.idx, sector, delta: pb !== undefined ? t - pb : null, time: t });
    }
  }

  private crossLine(k: Kart): void {
    const lap = k.lap + 1;
    if (k.lap >= 1) {
      const lapTime = this.t - k.lapStartT;
      const best = k.lapTimes.length === 0 || lapTime < Math.min(...k.lapTimes);
      k.lapTimes.push(lapTime);
      if (best) {
        k.bestSplits = [...k.cpTimes];
        k.bestSplits[0] = lapTime;
      }
      k.cpTimes = [];
      k.lapStartT = this.t;
      if (lap > this.laps) {
        k.finishT = this.t - this.goT;
        k.lap = this.laps;
        k.autopilot = true;
        k.item = null;
        k.rollT = 0;
        k.rollItem = null;
        this.updateOrder(false);
        this.emit({ type: 'lap', kart: k.idx, lap: this.laps, lapTime, best });
        this.emit({ type: 'finish', kart: k.idx, place: k.place, time: k.finishT });
        if (k.human && this.firstHumanFinishT === null) {
          this.firstHumanFinishT = this.t;
          this.endsAt = this.t + (this.mode === 'time' ? TIME_GRACE_MS : FINISH_GRACE_MS);
        }
        if (!this.karts.some((q) => q.human) && this.endsAt === null) this.endsAt = this.t + FINISH_GRACE_MS;
        return;
      }
      this.emit({ type: 'lap', kart: k.idx, lap, lapTime, best });
      if (lap === this.laps) this.emit({ type: 'finalLap', kart: k.idx });
    } else {
      k.lapStartT = this.t;
    }
    k.lap = lap;
  }

  private rescueTrack(k: Kart): void {
    const T = this.track!;
    const s = T.wrap(k.s - 4);
    let bestD = 0;
    let bestScore = -Infinity;
    for (const d of [0, -3.5, 3.5, -6, 6]) {
      const p = T.point(s, d);
      let score = 0;
      for (const o of this.karts) {
        if (o === k) continue;
        score = Math.min(score, Math.hypot(o.x - p.x, o.z - p.z) - 6);
      }
      score -= Math.abs(d) * 0.01;
      if (score > bestScore) {
        bestScore = score;
        bestD = d;
      }
    }
    const p = T.point(s, bestD);
    const before = k.s;
    this.place(k, p.x, p.z, T.headingAt(s));
    k.y = k.prevY = p.y;
    const pr = T.projectGlobal(k.x, k.z);
    k.u += clamp(T.delta(before, pr.s), -40, 3);
    k.s = pr.s;
    k.hint = pr.i;
    k.stuckU = k.u;
    if (k.wrongWay) {
      k.wrongWay = false;
      if (k.human) this.emit({ type: 'wrongWay', kart: k.idx, on: false });
    }
    this.emit({ type: 'rescue', kart: k.idx });
  }

  private updateBoxes(): void {
    const r2 = TUNE.boxRadius * TUNE.boxRadius;
    for (const b of this.boxes) {
      if (!b.active) {
        b.respawnT -= DT;
        if (b.respawnT <= 0) b.active = true;
        continue;
      }
      for (const k of this.karts) {
        if (k.out) continue;
        const dx = k.x - b.x;
        const dz = k.z - b.z;
        if (dx * dx + dz * dz > r2 || Math.abs(k.y - b.y) > 2.5) continue;
        b.active = false;
        b.respawnT = TUNE.boxRespawnS;
        this.emit({ type: 'pickup', kart: k.idx, box: b.id });
        if (k.finishT === null && !k.item && k.rollT <= 0 && this.phase === 'race') {
          k.stats.boxes++;
          k.rollItem = rollItem(this.rel(k), this.rnd(), this.arena !== null);
          k.rollT = TUNE.rollS;
        }
        break;
      }
    }
  }

  private updateHazards(): void {
    const r2 = TUNE.hazardRadius * TUNE.hazardRadius;
    const keep: Hazard[] = [];
    for (const o of this.hazards) {
      o.life -= DT;
      if (o.life <= 0) continue;
      let hitBy: Kart | null = null;
      for (const k of this.karts) {
        if (k.idx === o.owner && k.ownT > 0) continue;
        if (k.spinT > 0 || k.finishT !== null || k.out || k.airborne) continue;
        const dx = k.x - o.x;
        const dz = k.z - o.z;
        if (dx * dx + dz * dz > r2 || Math.abs(k.y - o.y) > 1.5) continue;
        hitBy = k;
        break;
      }
      if (!hitBy) {
        keep.push(o);
        continue;
      }
      this.hit(hitBy, o.owner, o.kind === 'oil' ? 'oil' : 'durian');
    }
    this.hazards = keep;
  }

  /** Sort: finished by time, then progress (circuits) or lives (arena). Counts overtakes. */
  private updateOrder(count: boolean): void {
    const ks = this.karts;
    const order = ks.map((k) => k.idx);
    if (this.arena) {
      order.sort((a, b) => {
        const A = ks[a]!;
        const B = ks[b]!;
        if (A.out !== B.out) return A.out ? 1 : -1;
        if (A.out && B.out) return B.outT - A.outT;
        if (A.lives !== B.lives) return B.lives - A.lives;
        if (A.stats.hitsGiven !== B.stats.hitsGiven) return B.stats.hitsGiven - A.stats.hitsGiven;
        return a - b;
      });
    } else {
      order.sort((a, b) => {
        const A = ks[a]!;
        const B = ks[b]!;
        if (A.finishT !== null || B.finishT !== null) {
          if (A.finishT === null) return 1;
          if (B.finishT === null) return -1;
          return A.finishT - B.finishT;
        }
        return B.u - A.u;
      });
    }
    order.forEach((idx, i) => {
      const k = ks[idx]!;
      const place = i + 1;
      if (count && place < k.place && k.finishT === null && !this.arena) k.stats.overtakes += k.place - place;
      k.place = place;
    });
    this.order = order;
  }

  /* ---------------------------------------------------------------- queries */

  /** Relative position 0 (leader) .. 1 (last). */
  rel(k: Kart): number {
    return this.karts.length > 1 ? (k.place - 1) / (this.karts.length - 1) : 0;
  }

  bestLap(k: Kart): number | null {
    return k.lapTimes.length ? Math.min(...k.lapTimes) : null;
  }

  /** Displayed lap (1..laps). */
  displayLap(k: Kart): number {
    return clamp(k.lap, 1, this.laps);
  }

  aliveCount(): number {
    return this.karts.filter((k) => !k.out).length;
  }
}
