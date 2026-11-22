/**
 * Solids of the box world: boxes that may turn around the y axis, slide back and forth, spin,
 * carry players (conveyors), launch them (springs), knock them away (sweeper bars) or crumble
 * (fragile tiles). Their pose is a pure function of time, so the renderer draws exactly what the
 * simulation collides with, at any interpolated time.
 */
import { rotY, type V3 } from './math';

export type Motion =
  /** Back and forth along `offset` (rest = centre), one full cycle every `period` seconds. */
  | { type: 'slide'; offset: V3; period: number; phase?: number }
  /** Turns around its own centre at `speed` rad/s (positive = counter-clockwise from above). */
  | { type: 'spin'; speed: number; phase?: number }
  /** Rocks around its centre: yaw = amp * sin(2 PI t / period). */
  | { type: 'swing'; amp: number; period: number; phase?: number };

export type SolidRole = 'floor' | 'wall' | 'sweeper' | 'spring' | 'checkpoint' | 'finish' | 'tile';

export interface SolidDef {
  /** Centre at rest. */
  pos: V3;
  /** Half extents in the solid's own frame. */
  half: V3;
  yaw?: number;
  motion?: Motion;
  role?: SolidRole;
  /** Surface speed of a conveyor in the solid's own frame (m/s), carried while standing on it. */
  conveyor?: { x: number; z: number };
  /** Spring: upward launch speed (m/s) when landed on. */
  spring?: number;
  /** Crumbles when stood on: warns for `warn` s, gone for `gone` s, then comes back. */
  fragile?: { warn: number; gone: number };
  /** Game data (checkpoint index, tile index, looks). */
  tag?: number;
  /** Renderer hint, ignored by the simulation. */
  look?: string;
}

export type SolidState = 'solid' | 'warn' | 'gone';

export interface Solid {
  readonly id: number;
  readonly def: SolidDef;
  state: SolidState;
  /** Sim time when the current warn/gone state ends (Infinity = stays). */
  until: number;
  /** Sim time the current state began (renderer: shake and fall animations). */
  since: number;
  /** What comes after `warn`: gone for this many seconds (Infinity = until restored). */
  goneFor: number;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const TAU = Math.PI * 2;

/** Pose of a solid at sim time `t` (seconds). */
export function poseAt(def: SolidDef, t: number, out: Pose = { x: 0, y: 0, z: 0, yaw: 0 }): Pose {
  out.x = def.pos.x;
  out.y = def.pos.y;
  out.z = def.pos.z;
  out.yaw = def.yaw ?? 0;
  const m = def.motion;
  if (!m) return out;
  if (m.type === 'slide') {
    const k = Math.sin((TAU * t) / m.period + (m.phase ?? 0));
    out.x += m.offset.x * k;
    out.y += m.offset.y * k;
    out.z += m.offset.z * k;
  } else if (m.type === 'spin') {
    out.yaw += m.speed * t + (m.phase ?? 0);
  } else {
    out.yaw += m.amp * Math.sin((TAU * t) / m.period + (m.phase ?? 0));
  }
  return out;
}

/** Velocity of the solid's surface at world point (px, pz) at time t (m/s), from its motion. */
export function surfaceVelocity(
  def: SolidDef,
  t: number,
  px: number,
  pz: number,
): { x: number; y: number; z: number } {
  const m = def.motion;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  if (m?.type === 'slide') {
    const w = TAU / m.period;
    const k = Math.cos(w * t + (m.phase ?? 0)) * w;
    vx = m.offset.x * k;
    vy = m.offset.y * k;
    vz = m.offset.z * k;
  } else if (m) {
    const p = poseAt(def, t);
    const omega =
      m.type === 'spin'
        ? m.speed
        : ((m.amp * TAU) / m.period) * Math.cos((TAU * t) / m.period + (m.phase ?? 0));
    // d/dt of rotY(r, yaw) for the offset r = p - centre: (omega * rz, -omega * rx).
    const rx = px - p.x;
    const rz = pz - p.z;
    vx = omega * rz;
    vz = -omega * rx;
  }
  return { x: vx, y: vy, z: vz };
}

/** World point -> the solid's local frame (relative to its centre, unrotated). */
export function toLocal(p: Pose, x: number, z: number): { x: number; z: number } {
  return rotY(x - p.x, z - p.z, -p.yaw);
}

export function toWorld(p: Pose, lx: number, lz: number): { x: number; z: number } {
  const r = rotY(lx, lz, p.yaw);
  return { x: r.x + p.x, z: r.z + p.z };
}

/** Top surface height of a solid at its pose. */
export function topOf(def: SolidDef, p: Pose): number {
  return p.y + def.half.y;
}

export function isSolidNow(s: Solid): boolean {
  return s.state !== 'gone';
}
