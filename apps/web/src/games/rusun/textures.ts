/**
 * Rusun textures: SVG art rasterized at TEX_SCALE (matches the 1.5x camera zoom, so sprites map
 * 1:1 onto the canvas, which is 1.5x the stage). Images are decoded before Phaser boots; floors past the
 * preloaded range are generated on demand.
 */
import type * as Phaser from 'phaser';
import { craneMarkup, floorMarkup, floorWidth, RUSUN, rusunBackgroundMarkup } from '../../shared/art/rusun';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { loadImage } from '../common/stage';
import { rusunWing, WING_W } from './wings';

export const TEX_SCALE = 1.5;
/** Workers riding a floor stand in this much headroom above its top. */
export const WORKER_HEAD = 32;
const PRELOAD_FLOORS = 24;

interface Spec {
  key: string;
  /** viewBox in world units. */
  x: number;
  y: number;
  w: number;
  h: number;
  body: () => string;
}

export const floorKey = (i: number, workers: boolean): string => `rs-f${workers ? 'w' : ''}${i}`;

function floorSpec(i: number, workers: boolean): Spec {
  const fw = floorWidth(i);
  const head = workers ? WORKER_HEAD : 0;
  return {
    key: floorKey(i, workers),
    x: 0,
    y: -head,
    w: fw + RUSUN.pad * 2,
    h: RUSUN.floorHeight + head,
    body: () => floorMarkup(fw, i, workers),
  };
}

function cloudBody(): string {
  const puffs = (dy: number, fill: string, base: number) =>
    `<g fill="${fill}" transform="translate(0 ${dy})"><circle cx="-70" cy="10" r="36"/><circle cx="-18" cy="-10" r="48"/><circle cx="42" cy="0" r="40"/><circle cx="92" cy="16" r="28"/><rect x="-100" y="8" width="214" height="${base}" rx="${base / 2}"/></g>`;
  return puffs(10, '#D3EAF7', 36) + puffs(0, '#FFFFFF', 30);
}

function kiteBody(): string {
  // A red and white layangan with a yellow-bowed tail.
  return [
    '<path d="M0 -34 L26 0 L0 44 L-26 0Z" fill="#F2453D" stroke="#111214" stroke-width="2.5" stroke-linejoin="round"/>',
    '<path d="M0 -34 L26 0 L0 0Z M0 44 L-26 0 L0 0Z" fill="#FFFFFF"/>',
    '<path d="M0 -34 L26 0 L0 44 L-26 0Z" fill="none" stroke="#111214" stroke-width="2.5" stroke-linejoin="round"/>',
    '<path d="M0 -34 V44 M-26 0 H26" stroke="#5A4A3C" stroke-width="1.5"/>',
    '<path d="M0 44 C10 60 -10 72 2 88 C12 100 -6 112 4 124" fill="none" stroke="#5A4A3C" stroke-width="1.5"/>',
    '<path d="M-6 62 L6 70 L6 62 L-6 70Z M-4 92 L8 100 L8 92 L-4 100Z M-3 116 L9 124 L9 116 L-3 124Z" fill="#FFC928" stroke="#111214" stroke-width="1"/>',
  ].join('');
}

function star(r: number): string {
  const p = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  return `M${p(0, -r)}L${p(r * 0.3, -r * 0.3)}L${p(r, 0)}L${p(r * 0.3, r * 0.3)}L${p(0, r)}L${p(-r * 0.3, r * 0.3)}L${p(-r, 0)}L${p(-r * 0.3, -r * 0.3)}Z`;
}

const STATIC: Spec[] = [
  { key: 'rs-bg', x: 0, y: 0, w: 1280, h: 720, body: rusunBackgroundMarkup },
  // More city either side, seen on stages wider than 16:9.
  { key: 'rs-wing-l', x: -WING_W, y: 0, w: WING_W, h: 720, body: () => rusunWing('left') },
  { key: 'rs-wing-r', x: 1280, y: 0, w: WING_W, h: 720, body: () => rusunWing('right') },
  // Jib only: the trolley is drawn separately so it can travel, so park the built-in one off-canvas.
  { key: 'rs-crane', x: 0, y: 0, w: 1280, h: 80, body: () => craneMarkup(-400) },
  {
    key: 'rs-trolley',
    x: 0,
    y: 0,
    w: 34,
    h: 14,
    body: () =>
      '<rect width="34" height="14" rx="2" fill="#2B3A55"/><rect x="3" y="3" width="28" height="3" rx="1.5" fill="#3D5078"/><circle cx="8" cy="10" r="2" fill="#FFC928"/><circle cx="26" cy="10" r="2" fill="#FFC928"/>',
  },
  {
    key: 'rs-hook',
    x: -2,
    y: -2,
    w: 26,
    h: 16,
    body: () =>
      '<path d="M0 0 h22 v12 h-22Z" fill="#FFC928" stroke="#111214" stroke-width="2"/><path d="M5 6 h12" stroke="#111214" stroke-width="2"/>',
  },
  {
    // PAS target: two yellow posts 16 px apart (the +-8 px PAS zone), centered on x = 8.
    key: 'rs-marker',
    x: -5,
    y: -2,
    w: 26,
    h: 16,
    body: () =>
      '<path d="M-3 0 h3 v12 h-3Z M16 0 h3 v12 h-3Z" fill="#FFC928" stroke="#111214" stroke-width="1"/>',
  },
  { key: 'rs-cloud', x: -110, y: -64, w: 240, h: 120, body: cloudBody },
  {
    key: 'rs-dust',
    x: -17,
    y: -17,
    w: 34,
    h: 34,
    body: () => '<circle r="16" fill="#F3EEE6"/><circle cx="-4" cy="-4" r="9" fill="#FFFFFF" opacity="0.6"/>',
  },
  {
    key: 'rs-spark',
    x: -15,
    y: -15,
    w: 30,
    h: 30,
    body: () =>
      `<path d="${star(12)}" fill="#FFC928" stroke="#111214" stroke-width="1.5" stroke-linejoin="round"/>`,
  },
  {
    key: 'rs-debris',
    x: -2,
    y: -2,
    w: 16,
    h: 16,
    body: () => '<path d="M0 2 L10 0 L12 9 L3 12Z" fill="#6B5B4B" stroke="#4A3E33" stroke-width="1"/>',
  },
  {
    key: 'rs-ring',
    x: -36,
    y: -36,
    w: 72,
    h: 72,
    body: () => '<circle r="30" fill="none" stroke="#FFC928" stroke-width="6"/>',
  },
  {
    key: 'rs-bird',
    x: -2,
    y: -2,
    w: 22,
    h: 12,
    body: () =>
      '<path d="M1 1 l8 6 l8 -6" fill="none" stroke="#2B3A55" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  { key: 'rs-kite', x: -30, y: -38, w: 60, h: 166, body: kiteBody },
];

function rasterize(spec: Spec): Promise<HTMLImageElement> {
  const W = Math.ceil(spec.w * TEX_SCALE);
  const H = Math.ceil(spec.h * TEX_SCALE);
  const url = svgUrl(`rusun:${spec.key}`, () =>
    svgDoc(W, H, spec.body(), `${spec.x} ${spec.y} ${spec.w} ${spec.h}`),
  );
  return loadImage(url, W, H);
}

/** Decode everything the first turns need. Call before booting Phaser. */
export async function preloadTextures(): Promise<Map<string, HTMLImageElement>> {
  const specs = [...STATIC];
  for (let i = 0; i < PRELOAD_FLOORS; i++) specs.push(floorSpec(i, false), floorSpec(i, true));
  const images = await Promise.all(specs.map(rasterize));
  const out = new Map<string, HTMLImageElement>();
  specs.forEach((s, k) => {
    out.set(s.key, images[k]!);
  });
  return out;
}

/** Registers preloaded images and lazily builds floors for very tall towers. */
export class FloorTextures {
  private readonly pending = new Set<string>();

  constructor(private readonly textures: Phaser.Textures.TextureManager) {}

  register(images: Map<string, HTMLImageElement>): void {
    for (const [key, img] of images) {
      if (!this.textures.exists(key)) this.textures.addImage(key, img);
    }
  }

  /** Make sure floors [from, from + count) exist (async; falls back meanwhile). */
  ensure(from: number, count = 4): void {
    for (let i = from; i < from + count; i++) {
      for (const workers of [false, true]) {
        const spec = floorSpec(i, workers);
        if (this.textures.exists(spec.key) || this.pending.has(spec.key)) continue;
        this.pending.add(spec.key);
        rasterize(spec)
          .then((img) => {
            if (!this.textures.exists(spec.key)) this.textures.addImage(spec.key, img);
          })
          .catch(() => {
            // Keep using the fallback texture.
          })
          .finally(() => this.pending.delete(spec.key));
      }
    }
  }

  /** Texture key for floor i, or a same-width stand-in while it is still being built. */
  key(i: number, workers: boolean): string {
    const want = floorKey(i, workers);
    if (this.textures.exists(want)) return want;
    // Every floor from 14 up has the minimum width, so any of them fits.
    const stand = i >= 14 ? 14 + ((i - 14) % (PRELOAD_FLOORS - 14)) : i % PRELOAD_FLOORS;
    return floorKey(stand, workers);
  }
}
