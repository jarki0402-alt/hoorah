/**
 * Deterministic randomness for asset authoring: a seeded generator, an integer lattice hash and
 * smooth value noise. Nothing here reads the clock or Math.random, so every build is identical.
 */

/** Mulberry32: small, fast, good enough for placing details. */
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

/** Hash of an integer lattice point to [0, 1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 1440662683) ^
    Math.imul(seed | 0, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Hash of one number to [0, 1). */
export function hash1(x: number, seed = 0): number {
  return hash3(Math.floor(x * 1000), 17, 31, seed);
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth value noise in [-1, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const c = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return (y0 + (y1 - y0) * w) * 2 - 1;
}

/** Fractal sum of `octaves` noise layers, roughly in [-1, 1]. */
export function fbm3(x: number, y: number, z: number, octaves = 3, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * f, y * f, z * f, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
