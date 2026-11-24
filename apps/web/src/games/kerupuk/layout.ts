/**
 * Where the contestants stand on the 1280x720 world, shared by the Phaser scene and the HUD
 * (name plates, floating words). Pure.
 */
import { HEAD, KERUPUK_R, ropeY } from '../../shared/art/kerupuk';

export const WORLD_W = 1280;
export const WORLD_H = 720;
/** Feet line of the contestants (world px). */
export const FEET_Y = 604;
/** Usable width for lanes (world px). */
const SPAN = 1180;
const MAX_SPACING = 340;

export interface LaneLayout {
  /** Lane centres (world x), left to right. */
  xs: number[];
  /** World px per character unit. */
  unit: number;
  /** Horizontal swing amplitude of the kerupuk (world px). */
  amp: number;
  /** Lane spacing (world px). */
  spacing: number;
}

export function laneLayout(n: number): LaneLayout {
  const count = Math.max(1, Math.floor(n));
  const spacing = Math.min(SPAN / count, MAX_SPACING);
  const unit = Math.max(1.15, Math.min(1.8, spacing / 118));
  const x0 = WORLD_W / 2 - (spacing * (count - 1)) / 2;
  const xs = Array.from({ length: count }, (_, i) => x0 + i * spacing);
  const amp = Math.min(spacing * 0.36, 40 * unit);
  return { xs, unit, amp, spacing };
}

/** Rope height in world px at world x. */
export function ropeWorldY(x: number): number {
  return ropeY(x / 2) * 2;
}

/** World y of the head centre (head image origin) at rest. */
export function headCenterY(unit: number): number {
  return FEET_Y + (HEAD.y + HEAD.size / 2) * unit;
}

/** Mouth height on the 64 grid of a player's head (every cast face puts it 38 to 40 down). */
const MOUTH_Y = 39;

/** World y of the mouth at rest. */
export function mouthY(unit: number): number {
  return FEET_Y + (HEAD.y + HEAD.scale * MOUTH_Y) * unit;
}

/** Where the kerupuk centre hangs at rest: its lower part right in front of the mouth. */
export function kerupukRestY(unit: number): number {
  return mouthY(unit) - KERUPUK_R * unit * 0.55;
}
