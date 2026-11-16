/**
 * Canvas-painted textures for Lari Terus, generated at boot (no files): three roof surfaces with
 * matching normal and roughness maps (glazed tiles, painted waterproofing, cement screed), a
 * fabric atlas for laundry, the duck-under sign, shop signs, the painted cloud band and the
 * distant skyline. PBR intent travels in `texture.userData.surface` like the Bajaj Rush textures.
 */
import * as THREE from 'three';
import { hash01 } from '../bajaj/geo';
import type { TextureSurface } from '../bajaj/look';
import { normalMapFrom, valueMap } from '../bajaj/textures';
import { STR } from './strings';

const DISPLAY = '"Baloo 2", ui-rounded, system-ui, sans-serif';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

function tex(c: HTMLCanvasElement, repeat: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.needsUpdate = true;
  return t;
}

/** Tileable value noise on the unit square with period `p` cells, in 0..1. */
export function tnoise(u: number, v: number, p: number, seed: number): number {
  const x = u * p;
  const y = v * p;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const h = (a: number, b: number) =>
    hash01((((a % p) + p) % p) * 17.31 + (((b % p) + p) % p) * 131.7 + seed * 7.13);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * s(xf);
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * s(xf);
  return a + (b - a) * s(yf);
}

/** Three octaves of tileable noise, 0..1. */
function fbm(u: number, v: number, p: number, seed: number): number {
  return (
    tnoise(u, v, p, seed) * 0.55 + tnoise(u, v, p * 2, seed + 1) * 0.3 + tnoise(u, v, p * 4, seed + 2) * 0.15
  );
}

/** Paint every pixel of a canvas from a colour function over [0, 1)^2. */
function pixels(w: number, h: number, fn: (u: number, v: number, out: number[]) => void): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const out = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fn((x + 0.5) / w, (y + 0.5) / h, out);
      const i = (y * w + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, out[0]!));
      img.data[i + 1] = Math.max(0, Math.min(255, out[1]!));
      img.data[i + 2] = Math.max(0, Math.min(255, out[2]!));
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------------------------------------------ roof surfaces */

/** World metres covered by one repeat of a roof texture. */
export const ROOF_TILE_M = 4;

export type RoofKind = 0 | 1 | 2;

interface RoofRecipe {
  /** Albedo (0..255) at (u, v). */
  color: (u: number, v: number, out: number[]) => void;
  height: (u: number, v: number) => number;
  rough: (u: number, v: number) => number;
  normal: number;
}

/** Glazed 40 cm floor tiles, slightly uneven, with grout lines and rain streaks. */
function tiles(): RoofRecipe {
  const n = ROOF_TILE_M / 0.4;
  const cell = (u: number, v: number) => {
    const x = u * n;
    const y = v * n;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    return { ix: Math.floor(x), iy: Math.floor(y), edge };
  };
  return {
    color: (u, v, o) => {
      const c = cell(u, v);
      const tone = hash01(c.ix * 13.1 + c.iy * 71.7) * 0.12 - 0.06;
      const dirt = fbm(u, v, 6, 3) * 0.5 + fbm(u, v, 24, 9) * 0.25;
      if (c.edge < 0.035) {
        const k = 120 - dirt * 50;
        o[0] = k;
        o[1] = k * 0.96;
        o[2] = k * 0.9;
        return;
      }
      // Warm terracotta glaze, sun-faded in patches.
      const k = 1 + tone - dirt * 0.28;
      o[0] = 214 * k;
      o[1] = 132 * k;
      o[2] = 92 * k;
      const fade = Math.max(0, tnoise(u, v, 3, 5) - 0.55) * 1.3;
      o[0] += (236 - o[0]) * fade * 0.5;
      o[1] += (196 - o[1]) * fade * 0.5;
      o[2] += (160 - o[2]) * fade * 0.5;
    },
    height: (u, v) => {
      const c = cell(u, v);
      const groove = c.edge < 0.035 ? 0 : Math.min(1, 0.55 + c.edge * 6);
      return groove + hash01(c.ix * 3.3 + c.iy * 5.9) * 0.08 + fbm(u, v, 40, 4) * 0.05;
    },
    rough: (u, v) => {
      const c = cell(u, v);
      if (c.edge < 0.035) return 0.95;
      return 0.32 + fbm(u, v, 6, 3) * 0.4;
    },
    normal: 2.4,
  };
}

/** Concrete deck under a green waterproof coat: roller marks, re-coated patches, hairline cracks. */
function coating(): RoofRecipe {
  const crack = (u: number, v: number) =>
    tnoise(u, v, 3, 31) > 0.56 && Math.abs(tnoise(u, v, 7, 11) - 0.5) < 0.0055 + tnoise(u, v, 40, 3) * 0.002;
  const patch = (u: number, v: number) => tnoise(u, v, 4, 21) > 0.7;
  return {
    color: (u, v, o) => {
      const roller = tnoise(u * 3, v * 40, 40, 2) * 0.05;
      const dirt = fbm(u, v, 8, 7);
      let r = 104;
      let g = 150;
      let b = 122;
      if (patch(u, v)) {
        r = 118;
        g = 160;
        b = 130;
      }
      const k = 1 - dirt * 0.26 + roller;
      o[0] = r * k;
      o[1] = g * k;
      o[2] = b * k;
      if (crack(u, v)) {
        o[0] *= 0.62;
        o[1] *= 0.62;
        o[2] *= 0.62;
      }
    },
    height: (u, v) => 0.5 + fbm(u, v, 30, 5) * 0.16 + (patch(u, v) ? 0.04 : 0) - (crack(u, v) ? 0.25 : 0),
    rough: (u, v) => 0.48 + fbm(u, v, 8, 7) * 0.3,
    normal: 1.6,
  };
}

/** Cement screed with expansion joints every 2 m, a drain line and damp stains. */
function screed(): RoofRecipe {
  const joint = (u: number, v: number) => {
    const x = (u * 2) % 1;
    const y = (v * 2) % 1;
    return Math.min(x, 1 - x, y, 1 - y);
  };
  return {
    color: (u, v, o) => {
      const stain = Math.max(0, fbm(u, v, 3, 13) - 0.45) * 1.6;
      const grain = hash01(Math.floor(u * 512) * 3.1 + Math.floor(v * 512) * 7.7) * 18;
      const k = 196 - stain * 70 + grain - fbm(u, v, 20, 2) * 22;
      o[0] = k;
      o[1] = k * 0.97;
      o[2] = k * 0.92;
      if (joint(u, v) < 0.008) {
        o[0] = 70;
        o[1] = 66;
        o[2] = 62;
      }
    },
    height: (u, v) =>
      0.5 +
      fbm(u, v, 48, 9) * 0.18 -
      (hash01(Math.floor(u * 256) * 3.1 + Math.floor(v * 256) * 7.7) > 0.97 ? 0.12 : 0) -
      (joint(u, v) < 0.008 ? 0.35 : 0),
    rough: (u, v) => 0.82 + fbm(u, v, 3, 13) * 0.1,
    normal: 2.0,
  };
}

const roofCache = new Map<RoofKind, THREE.CanvasTexture>();

/** Roof surface `kind`, repeating every ROOF_TILE_M metres. */
export function roofTexture(kind: RoofKind): THREE.CanvasTexture {
  const hit = roofCache.get(kind);
  if (hit) return hit;
  const recipe = kind === 0 ? tiles() : kind === 1 ? coating() : screed();
  const t = tex(pixels(512, 512, recipe.color), true);
  const surface: TextureSurface = {
    roughness: 1,
    normalMap: normalMapFrom(256, 256, recipe.height, recipe.normal, true),
    normalScale: 1,
    roughnessMap: valueMap(128, 128, recipe.rough, true),
  };
  t.userData.surface = surface;
  roofCache.set(kind, t);
  return t;
}

/* ------------------------------------------------------------------ fabric */

/** Fabric atlas: 4 x 2 patterns, each a 0.25 x 0.5 UV cell. */
export const CLOTH_CELLS = 8;

export function clothUv(i: number): [number, number, number, number] {
  const k = ((i % CLOTH_CELLS) + CLOTH_CELLS) % CLOTH_CELLS;
  const cx = k % 4;
  const cy = Math.floor(k / 4);
  return [cx * 0.25 + 0.004, cy * 0.5 + 0.008, (cx + 1) * 0.25 - 0.004, (cy + 1) * 0.5 - 0.008];
}

let clothTex: THREE.CanvasTexture | null = null;

export function clothTexture(): THREE.CanvasTexture {
  if (clothTex) return clothTex;
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  const cw = W / 4;
  const ch = H / 2;
  const cellAt = (i: number, fn: (x: number, y: number) => void) => {
    const x = (i % 4) * cw;
    // Canvas y grows down while UV v grows up: row 0 of the atlas is the bottom half.
    const y = (1 - Math.floor(i / 4)) * ch;
    g.save();
    g.beginPath();
    g.rect(x, y, cw, ch);
    g.clip();
    fn(x, y);
    g.restore();
  };
  const fill = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, cw, ch);
  };
  // 0: checked sarong (kotak-kotak), red and cream
  cellAt(0, (x, y) => {
    fill(x, y, '#C8372D');
    g.fillStyle = 'rgba(255,240,214,0.55)';
    for (let i = 0; i < 8; i++) g.fillRect(x + i * 32 + 4, y, 10, ch);
    for (let j = 0; j < 8; j++) g.fillRect(x, y + j * 32 + 4, cw, 10);
    g.fillStyle = 'rgba(40,20,20,0.35)';
    for (let i = 0; i < 8; i++) g.fillRect(x + i * 32 + 20, y, 3, ch);
  });
  // 1: towel with stripes
  cellAt(1, (x, y) => {
    fill(x, y, '#F6EFE2');
    for (const [yy, col] of [
      [30, '#2F8CFF'],
      [46, '#FFC928'],
      [ch - 56, '#FFC928'],
      [ch - 40, '#2F8CFF'],
    ] as const) {
      g.fillStyle = col;
      g.fillRect(x, y + yy, cw, 10);
    }
  });
  // 2: batik-like diagonal waves (parang feel), brown and gold
  cellAt(2, (x, y) => {
    fill(x, y, '#6E4426');
    g.strokeStyle = '#E2B45C';
    g.lineWidth = 7;
    for (let i = -8; i < 16; i++) {
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const px = x + i * 30 + t * ch;
        const py = y + t * ch + Math.sin(t * Math.PI * 6) * 6;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
    g.fillStyle = '#F4E3C1';
    for (let i = 0; i < 40; i++) g.fillRect(x + hash01(i * 3.3) * cw, y + hash01(i * 7.1) * ch, 4, 4);
  });
  // 3: polka dots on teal
  cellAt(3, (x, y) => {
    fill(x, y, '#14A3A0');
    g.fillStyle = '#FFF7F0';
    for (let j = 0; j < 9; j++)
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(x + i * 30 + (j % 2) * 15 + 8, y + j * 30 + 8, 6, 0, Math.PI * 2);
        g.fill();
      }
  });
  // 4: plain yellow tee with a hem
  cellAt(4, (x, y) => {
    fill(x, y, '#FFC928');
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x, y + ch - 22, cw, 6);
    g.fillRect(x, y + 14, cw, 4);
  });
  // 5: blue work shirt with pocket lines
  cellAt(5, (x, y) => {
    fill(x, y, '#3D6FB6');
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 26; i++) g.fillRect(x + i * 10, y, 2, ch);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x + cw / 2 - 2, y, 4, ch);
  });
  // 6: orange and white wide stripes
  cellAt(6, (x, y) => {
    fill(x, y, '#FFF7F0');
    g.fillStyle = '#FF7A2E';
    for (let j = 0; j < 8; j++) g.fillRect(x, y + j * 34, cw, 16);
  });
  // 7: green floral
  cellAt(7, (x, y) => {
    fill(x, y, '#2E9D58');
    for (let i = 0; i < 26; i++) {
      const px = x + hash01(i * 5.3 + 1) * cw;
      const py = y + hash01(i * 9.7 + 2) * ch;
      g.fillStyle = i % 3 === 0 ? '#FFC928' : '#FFF7F0';
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(px + Math.cos(a) * 7, py + Math.sin(a) * 7, 5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#C8372D';
      g.beginPath();
      g.arc(px, py, 4, 0, Math.PI * 2);
      g.fill();
    }
  });
  // Weave: fine cross-hatching over everything.
  g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < W; i += 3) g.fillRect(i, 0, 1, H);
  for (let j = 0; j < H; j += 3) g.fillRect(0, j, W, 1);
  clothTex = tex(c, false);
  const surface: TextureSurface = {
    roughness: 0.92,
    normalMap: normalMapFrom(
      64,
      64,
      (u, v) => (Math.sin(u * 64 * Math.PI) + Math.sin(v * 64 * Math.PI)) * 0.25 + 0.5,
      0.6,
    ),
    normalScale: 0.6,
  };
  clothTex.userData.surface = surface;
  return clothTex;
}

/* ------------------------------------------------------------------ signs */

/** The yellow "duck under" board: a running fruit ducking under a bar, chevrons down. */
let duckTex: THREE.CanvasTexture | null = null;

export function duckSignTexture(): THREE.CanvasTexture {
  if (duckTex) return duckTex;
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#FFC928';
  g.fillRect(0, 0, 512, 256);
  // Black and yellow hazard edge
  g.fillStyle = '#16171A';
  g.fillRect(0, 0, 512, 22);
  g.fillRect(0, 234, 512, 22);
  g.fillStyle = '#FFC928';
  for (let i = -2; i < 26; i++) {
    g.beginPath();
    g.moveTo(i * 24, 22);
    g.lineTo(i * 24 + 12, 22);
    g.lineTo(i * 24 + 24, 0);
    g.lineTo(i * 24 + 12, 0);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(i * 24, 256);
    g.lineTo(i * 24 + 12, 256);
    g.lineTo(i * 24 + 24, 234);
    g.lineTo(i * 24 + 12, 234);
    g.closePath();
    g.fill();
  }
  // Down chevrons on both sides
  g.strokeStyle = '#16171A';
  g.lineWidth = 16;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const cx of [86, 426]) {
    for (const dy of [0, 44]) {
      g.beginPath();
      g.moveTo(cx - 38, 82 + dy);
      g.lineTo(cx, 116 + dy);
      g.lineTo(cx + 38, 82 + dy);
      g.stroke();
    }
  }
  // Ducking figure: round head, crouched body, bar overhead
  g.fillStyle = '#16171A';
  g.fillRect(170, 56, 172, 14);
  g.beginPath();
  g.arc(222, 128, 26, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 22;
  g.beginPath();
  g.moveTo(240, 146);
  g.lineTo(300, 168);
  g.lineTo(330, 204);
  g.moveTo(286, 162);
  g.lineTo(262, 206);
  g.stroke();
  duckTex = tex(c, false);
  const surface: TextureSurface = { roughness: 0.45, emissive: 0.12 };
  duckTex.userData.surface = surface;
  return duckTex;
}

/** Shop sign atlas: 8 painted signs (2 columns x 4 rows), words from STR.signs. */
export const SIGN_SLOTS = 8;

export function signUv(i: number): [number, number, number, number] {
  const k = ((i % SIGN_SLOTS) + SIGN_SLOTS) % SIGN_SLOTS;
  const cx = k % 2;
  const cy = Math.floor(k / 2);
  return [cx * 0.5 + 0.004, cy * 0.25 + 0.006, (cx + 1) * 0.5 - 0.004, (cy + 1) * 0.25 - 0.006];
}

let signTex: THREE.CanvasTexture | null = null;

export function signTexture(): THREE.CanvasTexture {
  if (signTex) return signTex;
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  const looks = [
    ['#C8372D', '#FFF7F0', '#FFC928'],
    ['#FFC928', '#16171A', '#C8372D'],
    ['#2F8CFF', '#FFFFFF', '#FFC928'],
    ['#22B35E', '#FFFFFF', '#FFF7F0'],
    ['#FF7A2E', '#FFFFFF', '#16171A'],
    ['#FFF7F0', '#C8372D', '#2F8CFF'],
    ['#16171A', '#FFC928', '#FFF7F0'],
    ['#14A3A0', '#FFF7F0', '#FFC928'],
  ] as const;
  for (let i = 0; i < SIGN_SLOTS; i++) {
    const x = (i % 2) * (W / 2);
    const y = (3 - Math.floor(i / 2)) * (H / 4);
    const [bg, fg, accent] = looks[i]!;
    g.fillStyle = bg;
    g.fillRect(x, y, W / 2, H / 4);
    g.fillStyle = accent;
    g.fillRect(x, y + H / 4 - 16, W / 2, 10);
    g.fillRect(x, y + 6, W / 2, 6);
    g.fillStyle = fg;
    g.font = `800 64px ${DISPLAY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const word = STR.signs[i % STR.signs.length]!;
    g.fillText(word, x + W / 4, y + H / 8 + 4, W / 2 - 40);
    // Weathering
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let k = 0; k < 30; k++)
      g.fillRect(
        x + hash01(i * 31 + k) * (W / 2),
        y + hash01(i * 17 + k * 3) * (H / 4),
        2 + hash01(k) * 30,
        2,
      );
  }
  signTex = tex(c, false);
  const surface: TextureSurface = { roughness: 0.55, emissive: 0.18 };
  signTex.userData.surface = surface;
  return signTex;
}

/* ------------------------------------------------------------------ sky */

/**
 * Panoramic cloud band (u = azimuth, v = elevation 0..~40 degrees): soft cumulus with sunlit
 * tops, white in the red channel, shade in green, cover in alpha. The sky shader tints them.
 */
export function cloudTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 384;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const puff = (x: number, y: number, r: number, lit: number) => {
    for (const ox of [-W, 0, W]) {
      const grd = g.createRadialGradient(x + ox - r * 0.25, y - r * 0.35, r * 0.1, x + ox, y, r);
      const top = Math.round(255 * lit);
      grd.addColorStop(0, `rgba(255,${top},0,0.95)`);
      grd.addColorStop(0.55, `rgba(235,${Math.round(top * 0.7)},0,0.75)`);
      grd.addColorStop(1, 'rgba(200,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x + ox, y, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let k = 0; k < 16; k++) {
    const cx = hash01(k * 9.13 + 2) * W;
    const cy = H * (0.5 + hash01(k * 3.7) * 0.38);
    const size = 22 + hash01(k * 5.1) * 44;
    const n = 6 + Math.floor(hash01(k * 1.9) * 8);
    for (let i = 0; i < n; i++) {
      const px = cx + (hash01(k * 31 + i * 2.1) - 0.5) * size * 4;
      const py = cy - Math.abs(hash01(k * 17 + i * 1.3) - 0.5) * size * 1.2;
      puff(px, py, size * (0.5 + hash01(k * 7 + i) * 0.7), 0.6 + hash01(k + i * 3) * 0.4);
    }
    // Flat dark base
    g.fillStyle = 'rgba(160,0,0,0.25)';
    g.fillRect(cx - size * 2, cy + size * 0.2, size * 4, size * 0.25);
  }
  const t = tex(c, false);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  // The azimuth wraps behind the camera: mipmaps would draw a seam there, and soft clouds do
  // not need them.
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

/**
 * Two skyline layers (top half: far towers, bottom half: nearer blocks) as white silhouettes on
 * transparent; the backdrop shader tints them with the haze. Spires, domes and cranes break up
 * the line.
 */
export function skylineTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  for (const layer of [0, 1]) {
    const base = layer === 0 ? H / 2 : H;
    let x = 0;
    let i = layer * 500;
    while (x < W) {
      const w = 26 + hash01(i * 3.3) * (layer ? 70 : 50);
      const h = (layer ? 40 : 60) + hash01(i * 1.7) * (layer ? 110 : 170);
      g.fillStyle = '#ffffff';
      g.fillRect(x, base - h, w, h);
      const top = hash01(i * 5.1);
      if (top > 0.86 && layer === 0) {
        // Slim spire
        g.fillRect(x + w / 2 - 2, base - h - 48, 4, 48);
      } else if (top > 0.78) {
        // Dome
        g.beginPath();
        g.arc(x + w / 2, base - h, w * 0.32, Math.PI, 0);
        g.fill();
      } else if (top > 0.7 && layer === 0) {
        // Crane
        g.fillRect(x + w * 0.3, base - h - 70, 3, 70);
        g.fillRect(x + w * 0.3 - 30, base - h - 70, 90, 3);
      } else if (top > 0.5) {
        g.fillRect(x + w * 0.2, base - h - 8, w * 0.25, 8);
      }
      x += w + hash01(i * 7.9) * (layer ? 14 : 8);
      i++;
    }
  }
  const t = tex(c, false);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Soft white streak for speed lines (alpha fades at both ends). */
export function streakTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 8);
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 8);
  return tex(c, false);
}
