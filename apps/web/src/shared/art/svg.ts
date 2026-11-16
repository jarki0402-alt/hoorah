/** Small helpers for building SVG markup as strings (used for DOM images and Phaser textures). */

export const f1 = (n: number): number => Math.round(n * 10) / 10;

export const rect = (x: number, y: number, w: number, h: number): string =>
  `M${f1(x)} ${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}Z `;

export const circ = (cx: number, cy: number, r: number): string =>
  `M${f1(cx - r)} ${f1(cy)}a${r} ${r} 0 1 0 ${f1(2 * r)} 0a${r} ${r} 0 1 0 ${f1(-2 * r)} 0Z `;

export const path = (d: string, fill: string, extra = ''): string =>
  d ? `<path d="${d}" fill="${fill}" ${extra}/>` : '';

export const svgDoc = (w: number, h: number, body: string, vb = `0 0 ${w} ${h}`): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${body}</svg>`;

const cache = new Map<string, string>();

/** Data URLs for SVG strings, memoized so repeated renders do not re-encode. */
export function svgUrl(key: string, build: () => string): string {
  let url = cache.get(key);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(build())}`;
    cache.set(key, url);
  }
  return url;
}

/** Deterministic pseudo-random generator so illustrations look identical on every device. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
