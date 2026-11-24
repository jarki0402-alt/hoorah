/**
 * Light and sight on a Hantu Tak Terlihat map (pure): grid ray casts for flashlight cones, the
 * cone test, and line of sight. Walls, trees, closed doors and the locked exit stop light;
 * furniture and the fuse box do not (they are low).
 */
import { COLS, type HauntMap, ROWS, Tile, tileAt } from './maps';

export type Opaque = (x: number, y: number) => boolean;

/** Rays per flashlight cone outline (the scene's beams and mask, and the mirror's ghost test). */
export const CONE_RAYS = 28;
/** A firefly's glow reveals the ghost within this share of its light radius. */
export const FLY_MASK_SHARE = 0.8;
/** The ghost sprite's width and height in tiles, and how far it floats above its body centre. */
export const GHOST_SPRITE_TILES = 1.6;
export const GHOST_LIFT_TILES = 0.15;
/** How far the ghost bobs up and down (tiles). */
export const GHOST_BOB_TILES = 0.075;

/** The opacity test for a map given which doors are shut and whether the exit is open. */
export function opaqueFor(
  m: HauntMap,
  doorShut: (x: number, y: number) => boolean,
  exitOpen: boolean,
): Opaque {
  return (x, y) => {
    const t = tileAt(m, x, y);
    if (t === Tile.Wall || t === Tile.Tree) return true;
    if (t === Tile.Door) return doorShut(x, y);
    if (t === Tile.Exit) return !exitOpen;
    return false;
  };
}

/** Distance from (x, y) along `angle` to the first opaque cell, at most `max` (grid DDA). */
export function castRay(opaque: Opaque, x: number, y: number, angle: number, max: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let cx = Math.floor(x);
  let cy = Math.floor(y);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tdx = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const tdy = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
  let tx = dx === 0 ? Number.POSITIVE_INFINITY : (dx > 0 ? cx + 1 - x : x - cx) * tdx;
  let ty = dy === 0 ? Number.POSITIVE_INFINITY : (dy > 0 ? cy + 1 - y : y - cy) * tdy;
  for (let i = 0; i < 128; i++) {
    let t: number;
    if (tx < ty) {
      t = tx;
      tx += tdx;
      cx += stepX;
    } else {
      t = ty;
      ty += tdy;
      cy += stepY;
    }
    if (t >= max) return max;
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS || opaque(cx, cy)) return t;
  }
  return max;
}

export function lineOfSight(opaque: Opaque, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d < 1e-6) return true;
  return castRay(opaque, x0, y0, Math.atan2(y1 - y0, x1 - x0), d) >= d - 1e-6;
}

/** Smallest signed difference between two angles (radians). */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** True when point q (with radius r) is inside the cone from p facing `face`. */
export function inCone(
  px: number,
  py: number,
  face: number,
  half: number,
  range: number,
  qx: number,
  qy: number,
  r = 0,
): boolean {
  const d = Math.hypot(qx - px, qy - py);
  if (d > range + r) return false;
  if (d < r + 0.2) return true;
  const slack = Math.atan2(r, d);
  return Math.abs(angleDiff(Math.atan2(qy - py, qx - px), face)) <= half + slack;
}

/** Outline of a flashlight cone clipped by walls: the origin then `rays + 1` points along the arc. */
export function conePolygon(
  opaque: Opaque,
  x: number,
  y: number,
  face: number,
  half: number,
  range: number,
  rays: number,
  out: number[] = [],
): number[] {
  out.length = 0;
  out.push(x, y);
  for (let i = 0; i <= rays; i++) {
    const a = face - half + (2 * half * i) / rays;
    const d = castRay(opaque, x, y, a, range);
    out.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  return out;
}
