/**
 * Colours of the floor and of the painted territories. The ground shader (ground.ts) paints
 * every territory as a raised slab: a face in the owner's colour with faint brush strokes, a
 * light rim along top-left edges, a shaded band inside bottom edges and a darker lip below, so
 * territories read as soft-edged painted islands on the grey cement tegel. Fresh captures flash
 * in a light tint of the owner's colour first.
 */

export const FLOOR = {
  base: '#30333A',
  alt: '#34373E',
  grout: '#282A30',
  speck: '#3A3D45',
};

export interface TilePalette {
  face: string;
  faceAlt: string;
  /** Brush strokes over the face (drawn at 40%). */
  stroke: string;
  /** Inner band along bottom edges. */
  shade: string;
  light: string;
  lip: string;
  fresh: string;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(full, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [200, 200, 200];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend `hex` toward `to` by `k` (0..1). */
export function mix(hex: string, to: string, k: number): string {
  const a = parseHex(hex);
  const b = parseHex(to);
  return toHex([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
}

export function hexToInt(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (r << 16) | (g << 8) | b;
}

export function territoryPalette(color: string): TilePalette {
  return {
    face: mix(color, '#FFFFFF', 0.04),
    faceAlt: mix(color, '#000000', 0.018),
    stroke: mix(color, '#FFFFFF', 0.22),
    shade: mix(color, '#111214', 0.16),
    light: mix(color, '#FFFFFF', 0.45),
    lip: mix(color, '#111214', 0.45),
    fresh: mix(color, '#FFFFFF', 0.66),
  };
}
