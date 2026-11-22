/**
 * One round of Hantu Tak Terlihat (pure, no rendering). Positions are tile units, centres of
 * bodies, +y down.
 *
 * Residents walk (or run on stamina) with a flashlight that drains a battery. The ghost floats
 * through doors and furniture but not walls; it catches a resident by touching them. A flashlight
 * on the ghost for a moment dazzles it (slow, harmless, plainly visible). Residents find three
 * keys and charge the fuse box; then the exit opens and they escape. A caught resident becomes a
 * firefly that drifts freely and lights the way. The round ends when nobody is left inside or
 * the time is up; residents win when at least half of them escaped.
 */

import { inCone, lineOfSight, type Opaque, opaqueFor } from './light';
import { COLS, type HauntMap, type Pt, pickKeys, ROWS, Tile, tileAt } from './maps';

export type Fright = 'ringan' | 'beneran';
export type Skin = 'bayangan' | 'boneka' | 'pocong' | 'tuyul' | 'genderuwo' | 'kuntilanak';

export const SKINS: Record<HauntMap['id'], readonly Skin[]> = {
  rumah: ['bayangan', 'boneka'],
  kampung: ['pocong', 'tuyul', 'genderuwo', 'kuntilanak'],
};

/** Small differences per ghost: speed and reach multipliers. */
const SKIN_TRAITS: Record<Skin, { speed: number; reach: number }> = {
  bayangan: { speed: 1, reach: 1 },
  boneka: { speed: 1.05, reach: 0.94 },
  pocong: { speed: 0.97, reach: 1.05 },
  tuyul: { speed: 1.08, reach: 0.9 },
  genderuwo: { speed: 0.93, reach: 1.15 },
  kuntilanak: { speed: 1.02, reach: 1 },
};

export const TUNE = {
  walk: 3.0,
  run: 4.7,
  runDrain: 0.28,
  runRegen: 0.16,
  regenDelay: 0.6,
  flySpeed: 4.4,
  half: 0.3,
  ghostHalf: 0.32,
  coneHalf: 0.48,
  batteryDrain: 1 / 70,
  batteryCharge: 1 / 24,
  catchDist: 0.62,
  silauAfter: 1.3,
  silauS: 2.6,
  silauSlow: 0.4,
  lightsCd: 24,
  doorCd: 13,
  doorShutS: 5,
  doorRange: 8,
  fuseS: 7,
  fuseReach: 1.35,
  keyReach: 0.7,
  flashS: 3,
  nearIn: 1.15,
  nearOut: 2.6,
  /** Light radius of a firefly (they reveal the ghost too, but never dazzle it). */
  flyGlow: 2,
} as const;

export interface FrightTune {
  ghostSpeed: number;
  range: number;
  roundS: number;
  lightsOutS: number;
  torchOutS: number;
  /** How much of the house stays visible without light (0 pitch dark .. 1 lit). */
  ambient: number;
}

export const FRIGHT: Record<Fright, FrightTune> = {
  ringan: { ghostSpeed: 3.0, range: 7, roundS: 240, lightsOutS: 6, torchOutS: 1.2, ambient: 0.34 },
  beneran: { ghostSpeed: 3.5, range: 6.5, roundS: 210, lightsOutS: 9, torchOutS: 2.2, ambient: 0.12 },
};

export interface ResidentStats {
  keys: number;
  /** Seconds at the fuse box while it charged. */
  fuse: number;
  /** Seconds the ghost was in this resident's light. */
  lit: number;
  near: number;
  /** Round time at escape, or -1. */
  escapedAt: number;
  flyS: number;
}

export interface Resident {
  readonly id: number;
  x: number;
  y: number;
  face: number;
  inX: number;
  inY: number;
  wantRun: boolean;
  running: boolean;
  light: boolean;
  battery: number;
  stamina: number;
  idleRun: number;
  state: 'in' | 'fly' | 'out';
  /** Heartbeat level 0..1. */
  heart: number;
  nearArmed: boolean;
  nearCd: number;
  stats: ResidentStats;
}

export interface Ghost {
  id: number;
  x: number;
  y: number;
  inX: number;
  inY: number;
  skin: Skin;
  litMeter: number;
  silau: number;
  /** Residents whose light is on the ghost right now. */
  litBy: number[];
  catches: number;
  lightsCd: number;
  doorCd: number;
  /** Speed multiplier (computer ghosts by skill, people 1). */
  speedMul: number;
}

export interface Key extends Pt {
  taken: boolean;
  by: number;
}

export type HauntEvent =
  | { type: 'key'; id: number; i: number; found: number }
  | { type: 'fuseOn'; id: number }
  | { type: 'exitOpen' }
  | { type: 'catch'; id: number; x: number; y: number }
  | { type: 'escape'; id: number }
  | { type: 'silau' }
  | { type: 'lit'; by: number }
  | { type: 'lightsOut' }
  | { type: 'slam'; x: number; y: number }
  | { type: 'near'; id: number }
  | { type: 'battery'; id: number }
  | { type: 'over'; winner: 'penghuni' | 'hantu' };

export interface WorldSetup {
  map: HauntMap;
  fright: Fright;
  residents: number[];
  ghostId: number;
  skin: Skin;
  rnd?: () => number;
  ghostSpeedMul?: number;
}

export class HauntWorld {
  readonly map: HauntMap;
  readonly fright: Fright;
  readonly tune: FrightTune;
  readonly residents: Resident[] = [];
  readonly ghost: Ghost;
  readonly keys: Key[];
  keysFound = 0;
  fuse = 0;
  fuseOn = false;
  exitOpen = false;
  /** Seconds each door (index into map.doors) stays shut. */
  readonly doorShut: number[];
  lampsOff = 0;
  torchOff = 0;
  flash = 0;
  t = 0;
  over = false;
  winner: 'penghuni' | 'hantu' | null = null;
  readonly opaque: Opaque;
  private openOpaque: Opaque | null = null;
  private events: HauntEvent[] = [];
  private readonly doorIndex = new Map<number, number>();
  private wasLit = false;

  constructor(s: WorldSetup) {
    this.map = s.map;
    this.fright = s.fright;
    this.tune = FRIGHT[s.fright];
    const rnd = s.rnd ?? Math.random;
    s.residents.forEach((id, i) => {
      const sp = s.map.spawns[i % Math.max(1, s.map.spawns.length)] ?? { x: 2, y: 2 };
      this.residents.push({
        id,
        x: sp.x + 0.5,
        y: sp.y + 0.5,
        face: -Math.PI / 2,
        inX: 0,
        inY: 0,
        wantRun: false,
        running: false,
        light: true,
        battery: 1,
        stamina: 1,
        idleRun: 0,
        state: 'in',
        heart: 0,
        nearArmed: false,
        nearCd: 0,
        stats: { keys: 0, fuse: 0, lit: 0, near: 0, escapedAt: -1, flyS: 0 },
      });
    });
    this.ghost = {
      id: s.ghostId,
      x: s.map.ghost.x + 0.5,
      y: s.map.ghost.y + 0.5,
      inX: 0,
      inY: 0,
      skin: s.skin,
      litMeter: 0,
      silau: 0,
      litBy: [],
      catches: 0,
      lightsCd: 8,
      doorCd: 5,
      speedMul: s.ghostSpeedMul ?? 1,
    };
    this.keys = pickKeys(s.map, rnd).map((k) => ({ ...k, taken: false, by: -1 }));
    this.doorShut = s.map.doors.map(() => 0);
    s.map.doors.forEach((d, i) => {
      this.doorIndex.set(d.y * COLS + d.x, i);
    });
    this.opaque = opaqueFor(s.map, (x, y) => this.isShut(x, y), false);
  }

  get timeLeft(): number {
    return Math.max(0, this.tune.roundS - this.t);
  }

  drainEvents(): HauntEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  isShut(x: number, y: number): boolean {
    const i = this.doorIndex.get(y * COLS + x);
    return i !== undefined && (this.doorShut[i] ?? 0) > 0;
  }

  /** The opacity test including the exit's state. */
  sight(): Opaque {
    if (!this.exitOpen) return this.opaque;
    this.openOpaque ??= opaqueFor(this.map, (x, y) => this.isShut(x, y), true);
    return this.openOpaque;
  }

  resident(id: number): Resident | undefined {
    return this.residents.find((r) => r.id === id);
  }

  /* ------------------------------------------------------------------ input */

  setStick(id: number, x: number, y: number): void {
    const len = Math.hypot(x, y);
    const k = len > 1 ? 1 / len : 1;
    const ix = len < 0.15 ? 0 : x * k;
    const iy = len < 0.15 ? 0 : y * k;
    if (id === this.ghost.id) {
      this.ghost.inX = ix;
      this.ghost.inY = iy;
      return;
    }
    const r = this.resident(id);
    if (!r) return;
    r.inX = ix;
    r.inY = iy;
  }

  setRun(id: number, on: boolean): void {
    const r = this.resident(id);
    if (r) r.wantRun = on;
  }

  toggleLight(id: number): boolean {
    const r = this.resident(id);
    if (r?.state !== 'in') return false;
    if (!r.light && r.battery <= 0.02) return false;
    r.light = !r.light;
    return true;
  }

  /** Ghost power: every lamp off and flashlights flicker out for a moment. */
  lightsOut(): boolean {
    const g = this.ghost;
    if (this.over || g.lightsCd > 0) return false;
    g.lightsCd = TUNE.lightsCd;
    this.lampsOff = this.tune.lightsOutS;
    this.torchOff = this.tune.torchOutS;
    this.events.push({ type: 'lightsOut' });
    return true;
  }

  /** Ghost power: slam a door (the given one, or the nearest open one in reach). */
  slam(door = -1): boolean {
    const g = this.ghost;
    if (this.over || g.doorCd > 0) return false;
    let best = -1;
    let bestD: number = TUNE.doorRange;
    this.map.doors.forEach((d, i) => {
      if ((this.doorShut[i] ?? 0) > 0) return;
      if (door >= 0 && i !== door) return;
      const dist = Math.hypot(d.x + 0.5 - g.x, d.y + 0.5 - g.y);
      if (dist > bestD) return;
      // Never on someone standing in the doorway.
      if (
        this.residents.some(
          (r) => r.state === 'in' && Math.abs(r.x - d.x - 0.5) < 0.85 && Math.abs(r.y - d.y - 0.5) < 0.85,
        )
      )
        return;
      best = i;
      bestD = dist;
    });
    if (best < 0) return false;
    // Doorways are two cells wide: shut the neighbour too.
    const d = this.map.doors[best]!;
    this.map.doors.forEach((o, i) => {
      if (i === best || (Math.abs(o.x - d.x) + Math.abs(o.y - d.y) === 1 && (this.doorShut[i] ?? 0) === 0))
        this.doorShut[i] = TUNE.doorShutS;
    });
    g.doorCd = TUNE.doorCd;
    this.events.push({ type: 'slam', x: d.x, y: d.y });
    return true;
  }

  /* ------------------------------------------------------------------ movement */

  private solidFor(who: 'resident' | 'ghost', x: number, y: number): boolean {
    const t = tileAt(this.map, x, y);
    if (t === Tile.Wall) return true;
    if (t === Tile.Exit) return who === 'ghost' || !this.exitOpen;
    if (who === 'ghost') return false;
    if (t === Tile.Prop || t === Tile.Tree || t === Tile.Fuse) return true;
    if (t === Tile.Door) return this.isShut(x, y);
    return false;
  }

  private blocked(who: 'resident' | 'ghost', x: number, y: number, h: number): boolean {
    const x0 = Math.floor(x - h);
    const x1 = Math.floor(x + h - 1e-6);
    const y0 = Math.floor(y - h);
    const y1 = Math.floor(y + h - 1e-6);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) if (this.solidFor(who, cx, cy)) return true;
    return false;
  }

  private move(
    b: { x: number; y: number },
    dx: number,
    dy: number,
    who: 'resident' | 'ghost',
    h: number,
  ): void {
    // Small steps so a fast body never skips a thin wall.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps;
      const sy = dy / steps;
      if (sx && !this.blocked(who, b.x + sx, b.y, h)) b.x += sx;
      if (sy && !this.blocked(who, b.x, b.y + sy, h)) b.y += sy;
    }
  }

  /* ------------------------------------------------------------------ step */

  update(dt: number): void {
    if (this.over) return;
    const step = Math.max(0, Math.min(dt, 0.1));
    this.t += step;
    this.lampsOff = Math.max(0, this.lampsOff - step);
    this.torchOff = Math.max(0, this.torchOff - step);
    this.flash = Math.max(0, this.flash - step);
    for (let i = 0; i < this.doorShut.length; i++)
      this.doorShut[i] = Math.max(0, (this.doorShut[i] ?? 0) - step);
    const g = this.ghost;
    g.lightsCd = Math.max(0, g.lightsCd - step);
    g.doorCd = Math.max(0, g.doorCd - step);
    g.silau = Math.max(0, g.silau - step);

    for (const r of this.residents) this.stepResident(r, step);
    const gs =
      this.tune.ghostSpeed * SKIN_TRAITS[g.skin].speed * g.speedMul * (g.silau > 0 ? TUNE.silauSlow : 1);
    this.move(g, g.inX * gs * step, g.inY * gs * step, 'ghost', TUNE.ghostHalf);
    g.x = Math.max(0.6, Math.min(COLS - 0.6, g.x));
    g.y = Math.max(0.6, Math.min(ROWS - 0.6, g.y));

    this.updateLight(step);
    this.updateCatch();
    this.updateObjectives(step);
    this.checkOver();
  }

  private stepResident(r: Resident, dt: number): void {
    r.nearCd = Math.max(0, r.nearCd - dt);
    if (r.state === 'out') return;
    if (r.state === 'fly') {
      r.stats.flyS += dt;
      r.x = Math.max(0.5, Math.min(COLS - 0.5, r.x + r.inX * TUNE.flySpeed * dt));
      r.y = Math.max(0.5, Math.min(ROWS - 0.5, r.y + r.inY * TUNE.flySpeed * dt));
      return;
    }
    const moving = r.inX !== 0 || r.inY !== 0;
    r.running = r.wantRun && moving && r.stamina > 0.02;
    if (r.running) {
      r.stamina = Math.max(0, r.stamina - TUNE.runDrain * dt);
      r.idleRun = 0;
    } else {
      r.idleRun += dt;
      if (r.idleRun >= TUNE.regenDelay) r.stamina = Math.min(1, r.stamina + TUNE.runRegen * dt);
    }
    if (moving) r.face = Math.atan2(r.inY, r.inX);
    const speed = r.running ? TUNE.run : TUNE.walk;
    this.move(r, r.inX * speed * dt, r.inY * speed * dt, 'resident', TUNE.half);
    if (r.light) {
      r.battery = Math.max(0, r.battery - TUNE.batteryDrain * dt);
      if (r.battery <= 0) {
        r.light = false;
        this.events.push({ type: 'battery', id: r.id });
      }
    } else r.battery = Math.min(1, r.battery + TUNE.batteryCharge * dt);
  }

  /** A resident's flashlight is shining right now. */
  shining(r: Resident): boolean {
    return r.state === 'in' && r.light && r.battery > 0 && this.torchOff <= 0;
  }

  private updateLight(dt: number): void {
    const g = this.ghost;
    const sight = this.sight();
    g.litBy = [];
    for (const r of this.residents) {
      if (!this.shining(r)) continue;
      if (!inCone(r.x, r.y, r.face, TUNE.coneHalf, this.tune.range, g.x, g.y, 0.35)) continue;
      if (!lineOfSight(sight, r.x, r.y, g.x, g.y)) continue;
      g.litBy.push(r.id);
      r.stats.lit += dt;
    }
    const lit = g.litBy.length > 0;
    if (lit && !this.wasLit) this.events.push({ type: 'lit', by: g.litBy[0]! });
    this.wasLit = lit;
    if (g.silau > 0) return;
    g.litMeter = lit ? g.litMeter + dt : Math.max(0, g.litMeter - 0.7 * dt);
    if (g.litMeter >= TUNE.silauAfter) {
      g.litMeter = 0;
      g.silau = TUNE.silauS;
      this.events.push({ type: 'silau' });
    }
  }

  /** The ghost shows on the main screen right now (dazzled, the fuse flash, the round's end). */
  ghostRevealed(): boolean {
    return this.ghost.silau > 0 || this.flash > 0 || this.over;
  }

  private updateCatch(): void {
    const g = this.ghost;
    const reach = TUNE.catchDist * SKIN_TRAITS[g.skin].reach;
    for (const r of this.residents) {
      if (r.state !== 'in') {
        r.heart = 0;
        continue;
      }
      const d = Math.hypot(r.x - g.x, r.y - g.y);
      r.heart = Math.max(0, Math.min(1, (7 - d) / 5.5));
      if (g.silau <= 0 && d < reach) {
        r.state = 'fly';
        r.light = false;
        r.heart = 0;
        g.catches++;
        this.events.push({ type: 'catch', id: r.id, x: r.x, y: r.y });
        continue;
      }
      if (d < TUNE.nearIn && g.silau <= 0) r.nearArmed = true;
      else if (r.nearArmed && d > TUNE.nearOut) {
        r.nearArmed = false;
        if (r.nearCd <= 0) {
          r.stats.near++;
          r.nearCd = 4;
          this.events.push({ type: 'near', id: r.id });
        }
      }
    }
  }

  private updateObjectives(dt: number): void {
    for (const r of this.residents) {
      if (r.state !== 'in') continue;
      this.keys.forEach((k, i) => {
        if (k.taken || Math.hypot(r.x - k.x - 0.5, r.y - k.y - 0.5) > TUNE.keyReach) return;
        k.taken = true;
        k.by = r.id;
        r.stats.keys++;
        this.keysFound++;
        this.events.push({ type: 'key', id: r.id, i, found: this.keysFound });
      });
    }
    if (!this.fuseOn) {
      const f = this.map.fuse;
      const at = this.residents.filter(
        (r) => r.state === 'in' && Math.hypot(r.x - f.x - 0.5, r.y - f.y - 0.5) <= TUNE.fuseReach,
      );
      if (at.length) {
        // Helpers speed it up, with diminishing returns.
        this.fuse = Math.min(1, this.fuse + ((1 + 0.55 * (at.length - 1)) / TUNE.fuseS) * dt);
        for (const r of at) r.stats.fuse += dt;
        if (this.fuse >= 1) {
          this.fuseOn = true;
          this.flash = TUNE.flashS;
          this.lampsOff = 0;
          this.events.push({ type: 'fuseOn', id: at[0]!.id });
        }
      }
    }
    if (!this.exitOpen && this.fuseOn && this.keysFound >= this.keys.length) {
      this.exitOpen = true;
      this.events.push({ type: 'exitOpen' });
    }
    if (this.exitOpen) {
      for (const r of this.residents) {
        if (r.state !== 'in') continue;
        if (this.map.exits.some((e) => Math.floor(r.x) === e.x && Math.floor(r.y) === e.y)) {
          r.state = 'out';
          r.light = false;
          r.heart = 0;
          r.stats.escapedAt = this.t;
          this.events.push({ type: 'escape', id: r.id });
        }
      }
    }
  }

  escapedCount(): number {
    return this.residents.filter((r) => r.state === 'out').length;
  }

  /** Escapes the residents need to win. */
  needed(): number {
    return Math.max(1, Math.ceil(this.residents.length / 2));
  }

  private checkOver(): void {
    const inside = this.residents.some((r) => r.state === 'in');
    if (inside && this.t < this.tune.roundS) return;
    this.over = true;
    this.winner = this.escapedCount() >= this.needed() ? 'penghuni' : 'hantu';
    this.events.push({ type: 'over', winner: this.winner });
  }

  /** Lamps are lit (they go out with the ghost's power until it wears off or the fuse comes on). */
  lampOn(): boolean {
    return this.lampsOff <= 0;
  }
}
