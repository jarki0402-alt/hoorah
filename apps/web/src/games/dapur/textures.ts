/**
 * Rasterizes the SVG art of art.ts into canvases for Phaser: food icons, every station (with its
 * canvas-drawn labels in the brand font), chef parts, stains, and per kitchen the static backdrop.
 * Textures are drawn at TEX x world size so they stay sharp under the 1.5x camera zoom.
 */
import type { Look } from '@hoorah/protocol';
import type { GameFace } from '../../shared/art/people';
import { svgDoc } from '../../shared/art/svg';
import { deviceScale, loadImage, STAGE_H, STAGE_W } from '../common/stage';
import {
  type Backdrop,
  backdropDrawing,
  type CanvasLabel,
  CHEF_APRON,
  CHEF_HAND,
  CHEF_HAT,
  CHEF_LEGS,
  CHEF_SHIRT,
  chefHead,
  type Drawing,
  ICON_IDS,
  iconMarkup,
  lookId,
  STAIN,
  type StationLabels,
  stationDrawing,
} from './art';
import type { StainKind } from './items';
import { KITCHEN_DEFS, type KitchenId, type StationKind } from './kitchens';
import { STR } from './strings';

/**
 * Texture px per world px. Set once at boot (pickResolution) from the largest size the screen can
 * show, so textures stay crisp after going fullscreen: 2 on 1080p, 3 on high-DPI laptops and 4K.
 */
export let TEX = 2;
/**
 * Canvas px per world px of the Phaser canvas (camera zoom). Follows the real device pixels the
 * stage covers (stage scale x devicePixelRatio): the canvas then matches the screen 1:1, sharp on
 * high-DPI laptops and 4K, and no wasted supersampling on a 720p or 1080p Smart TV.
 */
export let RENDER_SCALE = 1.5;

/**
 * Dapur is light 2D, so it always renders at the screen's own sharpness (owner 2026-11-22: "selalu
 * HD"), up to 3 (a 4K panel), whatever the 3D graphics level says. The safety net in main.tsx
 * lowers `ceiling` one step at a time if a device cannot keep up.
 */
const MAX_RENDER_SCALE = 3;
/** The safety net never goes below the old fixed 1.5 (a 1920x1080 canvas, smooth everywhere). */
const MIN_SAFE_SCALE = 1.5;
const STEP = 0.5;
let ceiling = MAX_RENDER_SCALE;

/** Device px per stage px right now (the shell's own scaling included, see common/stage). */
function devicePx(): number {
  return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H) * deviceScale();
}

/** Updates RENDER_SCALE for the current window; returns true when it changed. */
export function updateRenderScale(): boolean {
  const next = Math.min(
    ceiling,
    // Rounded up to a quarter: a canvas a little larger than the screen stays sharp, smaller blurs.
    Math.max(1, Math.ceil(devicePx() * 4 - 0.05) / 4),
  );
  if (next === RENDER_SCALE) return false;
  RENDER_SCALE = next;
  return true;
}

/**
 * Safety net: one step down (3 -> 2.5 -> 2 -> 1.5) for a device that cannot hold the frame rate.
 * Returns true when RENDER_SCALE changed.
 */
export function lowerRenderScale(): boolean {
  if (RENDER_SCALE <= MIN_SAFE_SCALE) return false;
  ceiling = Math.max(MIN_SAFE_SCALE, RENDER_SCALE - STEP);
  return updateRenderScale();
}

/** Picks TEX (from the full screen size) and RENDER_SCALE (from the window). Call before loading textures. */
export function pickResolution(): void {
  // The most the screen can show: the whole monitor (fullscreen) at its pixel ratio.
  const dpr =
    Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const full = Math.max(devicePx(), Math.min(screen.width / STAGE_W, screen.height / STAGE_H) * dpr);
  TEX = full > 2.05 ? 3 : 2;
  updateRenderScale();
}

export const CHEF_FACES: readonly GameFace[] = ['happy', 'effort', 'wow'];
/** Backdrops get this much room around them for the frame stroke. */
export const BACKDROP_PAD = 8;

export const iconKey = (id: string): string => `dp-i-${id}`;
export const stationKey = (kind: StationKind, source: string | null): string =>
  `dp-st-${kind}${source ? `-${source}` : ''}`;
export const headKey = (look: Look, face: GameFace): string => `dp-head-${lookId(look)}-${face}`;
/** Built-in transparent texture shown while a head is still rasterizing. */
export const BLANK_KEY = '__DEFAULT';
export const stainKey = (k: StainKind): string => `dp-stain-${k}`;
export const backdropKey = (k: KitchenId): string => `dp-bg-${k}`;
export const cartKey = (k: KitchenId, side: 0 | 1): string => `dp-cart-${k}-${side}`;

const LABELS: StationLabels = {
  basket: STR.basketLabel,
  stove: STR.stoveLabel,
  wok: STR.wokLabel,
  fryer: STR.fryerLabel,
  board: STR.boardLabel,
  sink: STR.sinkLabel,
  rack: STR.rackLabel,
  trash: STR.trashLabel,
  soda: STR.sodaLabel,
  drinks: STR.drinksLabel,
  cups: STR.cupsLabel,
  pass: STR.passLabel,
  passSlot: STR.passSlot,
};

function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: readonly CanvasLabel[],
  ox: number,
  oy: number,
): void {
  for (const l of labels) {
    const family = l.display
      ? '"Baloo 2", system-ui, sans-serif'
      : '"Plus Jakarta Sans", system-ui, sans-serif';
    ctx.font = `800 ${l.size * TEX}px ${family}`;
    const spacing = (l.track ?? 0) * TEX;
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in c) c.letterSpacing = `${spacing}px`;
    const w = ctx.measureText(l.text).width;
    const x = (l.x + ox) * TEX;
    const y = (l.y + oy) * TEX;
    if (l.bg) {
      const pw = w + 10 * TEX;
      const ph = (l.size + 6) * TEX;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, x - pw / 2, y - ph / 2 + TEX, pw, ph, 4 * TEX);
      ctx.fill();
      ctx.fillStyle = l.bg;
      roundRect(ctx, x - pw / 2, y - ph / 2, pw, ph, 4 * TEX);
      ctx.fill();
    }
    ctx.fillStyle = l.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.text, x + spacing / 2, y + (l.display ? 1.5 * TEX : 0.5 * TEX));
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Rasterize a drawing (with `pad` world px around it) into a canvas. */
async function raster(d: Drawing, pad = 0): Promise<HTMLCanvasElement> {
  const w = d.w + pad * 2;
  const h = d.h + pad * 2;
  const doc = svgDoc(w * TEX, h * TEX, d.svg, `${-pad} ${-pad} ${w} ${h}`);
  const img = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`,
    w * TEX,
    h * TEX,
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * TEX);
  canvas.height = Math.ceil(h * TEX);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawLabels(ctx, d.labels, pad, pad);
  return canvas;
}

const sprite = (w: number, h: number, body: string): Drawing => ({ w, h, svg: body, labels: [] });

/** Everything that does not depend on the kitchen: icons, stations, chef parts, stains. */
export async function loadCommonTextures(): Promise<Map<string, HTMLCanvasElement>> {
  const jobs: { key: string; d: Drawing }[] = [];
  for (const id of ICON_IDS) jobs.push({ key: iconKey(id), d: sprite(40, 40, iconMarkup(id)) });
  const kinds: StationKind[] = [
    'counter',
    'stove',
    'fryer',
    'wok',
    'board',
    'sink',
    'rack',
    'cups',
    'soda',
    'trash',
    'pass',
  ];
  for (const k of kinds) jobs.push({ key: stationKey(k, null), d: stationDrawing(k, null, LABELS) });
  for (const src of ['roti', 'daging', 'tomat', 'selada', 'kentang', 'telur', 'nasi'])
    jobs.push({ key: stationKey('basket', src), d: stationDrawing('basket', src, LABELS) });
  jobs.push({ key: 'dp-legs', d: sprite(64, 84, CHEF_LEGS) });
  jobs.push({ key: 'dp-shirt', d: sprite(64, 84, CHEF_SHIRT) });
  jobs.push({ key: 'dp-apron', d: sprite(64, 84, CHEF_APRON) });
  jobs.push({ key: 'dp-hat', d: sprite(64, 84, CHEF_HAT) });
  jobs.push({ key: 'dp-hand', d: sprite(12, 12, CHEF_HAND) });
  for (const k of Object.keys(STAIN) as StainKind[])
    jobs.push({ key: stainKey(k), d: sprite(24, 20, STAIN[k]) });
  const canvases = await Promise.all(jobs.map((j) => raster(j.d)));
  const out = new Map<string, HTMLCanvasElement>();
  jobs.forEach((j, i) => {
    out.set(j.key, canvases[i]!);
  });
  return out;
}

/** One player's chef head in every face, rasterized when their look first shows up. */
export async function loadHeads(look: Look): Promise<Map<string, HTMLCanvasElement>> {
  const canvases = await Promise.all(CHEF_FACES.map((face) => raster(sprite(64, 84, chefHead(look, face)))));
  const out = new Map<string, HTMLCanvasElement>();
  CHEF_FACES.forEach((face, i) => {
    out.set(headKey(look, face), canvases[i]!);
  });
  return out;
}

/** The static backdrop of one kitchen (and its two carts for Gerobak Kembar). */
export async function loadBackdrop(k: KitchenId): Promise<Map<string, HTMLCanvasElement>> {
  const b: Backdrop = backdropDrawing(KITCHEN_DEFS[k], { wall: STR.wallLabel });
  const out = new Map<string, HTMLCanvasElement>();
  out.set(backdropKey(k), await raster(b.base, BACKDROP_PAD));
  if (b.carts) {
    out.set(cartKey(k, 0), await raster(b.carts[0], BACKDROP_PAD));
    out.set(cartKey(k, 1), await raster(b.carts[1], BACKDROP_PAD));
  }
  return out;
}

/** A rounded pill with text (name tags, "Siap tangkap!", warnings), drawn straight on canvas. */
export function pillCanvas(
  text: string,
  opts: {
    bg: string;
    fg: string;
    size?: number;
    ring?: string;
    shadow?: string;
    radius?: number;
    padX?: number;
  },
): HTMLCanvasElement {
  const size = (opts.size ?? 13) * TEX;
  const padX = (opts.padX ?? 11) * TEX;
  const probe = document.createElement('canvas').getContext('2d');
  const font = `800 ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
  let tw = text.length * size * 0.6;
  if (probe) {
    probe.font = font;
    tw = probe.measureText(text).width;
  }
  const ring = opts.ring ? 2 * TEX : 0;
  const shadow = opts.shadow ? 3 * TEX : 0;
  const w = Math.ceil(tw + padX * 2 + ring * 2);
  const h = Math.ceil(size * 1.9 + ring * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h + shadow;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const radius = opts.radius === undefined ? h / 2 : opts.radius * TEX;
  if (opts.shadow) {
    ctx.fillStyle = opts.shadow;
    roundRect(ctx, 0, shadow, w, h, radius);
    ctx.fill();
  }
  if (opts.ring) {
    ctx.fillStyle = opts.ring;
    roundRect(ctx, 0, 0, w, h, radius);
    ctx.fill();
  }
  ctx.fillStyle = opts.bg;
  roundRect(ctx, ring, ring, w - ring * 2, h - ring * 2, Math.max(0, radius - ring));
  ctx.fill();
  ctx.fillStyle = opts.fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + TEX);
  return canvas;
}
