/**
 * Colours for authored assets. Authors write sRGB hex like a designer would; meshes store linear
 * RGB (what glTF vertex colours and three.js shading expect).
 */

/** Linear RGB, 0..1 per channel. */
export type RGB = readonly [number, number, number];

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB hex (0xff8a3d or '#FF8A3D') to linear RGB. */
export function hex(h: number | string): RGB {
  const n = typeof h === 'number' ? h : Number.parseInt(h.replace('#', ''), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function scaleRGB(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export const WHITE: RGB = [1, 1, 1];
