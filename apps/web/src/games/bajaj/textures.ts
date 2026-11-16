/**
 * Canvas-painted textures: asphalt grain, the shop-sign/billboard atlas, number plates, kardus,
 * facade windows, the distant skyline and soft sprites, plus the normal and roughness maps that
 * give them relief under PBR lighting. Everything is generated at boot; no files.
 *
 * Textures declare their PBR intent in `texture.userData.surface` (see `TextureSurface` in
 * look.ts): the material upgrade turns e.g. the window tile into recessed, reflective glass.
 */
import * as THREE from 'three';
import { hash01 } from './geo';
import { STR } from './strings';

const DISPLAY = '"Baloo 2", ui-rounded, system-ui, sans-serif';
const UI = '"Plus Jakarta Sans", system-ui, sans-serif';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  return [c, g];
}

function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.needsUpdate = true;
  return t;
}

/** Three-band ramp for MeshToonMaterial. */
export function gradientMap(): THREE.DataTexture {
  const data = new Uint8Array([120, 120, 120, 255, 196, 196, 196, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function asphaltTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#56585e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const x = hash01(i * 3.1) * 256;
    const y = hash01(i * 7.7 + 1) * 256;
    const v = hash01(i * 1.3 + 5);
    const l = v < 0.5 ? 40 + v * 40 : 95 + v * 50;
    g.fillStyle = `rgba(${l},${l},${l + 4},${0.35 + hash01(i) * 0.4})`;
    g.fillRect(x, y, 1 + (v > 0.92 ? 1 : 0), 1 + (v > 0.96 ? 1 : 0));
  }
  // A few faint patches and cracks.
  for (let i = 0; i < 7; i++) {
    g.fillStyle = `rgba(30,32,36,${0.08 + hash01(i + 40) * 0.08})`;
    g.beginPath();
    g.ellipse(
      hash01(i + 9) * 256,
      hash01(i + 19) * 256,
      20 + hash01(i) * 40,
      10 + hash01(i + 3) * 26,
      hash01(i + 5) * 3,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  const t = tex(c, true);
  t.userData.surface = {
    roughness: 1,
    roughnessMap: asphaltRoughness(),
    normalMap: asphaltNormal(),
    normalScale: 0.55,
  };
  return t;
}

let asphaltCache: THREE.CanvasTexture | null = null;
/** Shared asphalt grain (the default for MAT.asphalt). */
export function sharedAsphalt(): THREE.CanvasTexture {
  if (!asphaltCache) asphaltCache = asphaltTexture();
  return asphaltCache;
}

/** Light grain multiplied onto pavements and the ground. */
export function grainTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const v = 205 + hash01(i * 2.3) * 50;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(hash01(i * 5.1) * 128, hash01(i * 9.3 + 2) * 128, 1, 1);
  }
  const t = tex(c, true);
  t.userData.surface = { roughness: 0.94 };
  return t;
}

/* ------------------------------------------------------------------ sign atlas */

export const ATLAS = 2048;
/** Sign slots: 4 x 9 cells of 512 x 112 in the top half. */
export const SIGN_SLOTS = 36;
export type UvRect = readonly [number, number, number, number];

const SIGN_COLORS: readonly [string, string][] = [
  ['#FF5A1F', '#FFF7F0'],
  ['#FFC928', '#111214'],
  ['#2F8CFF', '#FFF7F0'],
  ['#22B35E', '#FFF7F0'],
  ['#F2453D', '#FFF7F0'],
  ['#FFF7F0', '#F2453D'],
  ['#111214', '#FFC928'],
  ['#14B8A6', '#FFF7F0'],
  ['#FFF7F0', '#2F8CFF'],
  ['#FF8A3D', '#111214'],
];

export interface SignAtlas {
  texture: THREE.CanvasTexture;
  /** UV rect of sign slot i (0..31). */
  sign: (i: number) => UvRect;
  billboard: (i: number) => UvRect;
  white: UvRect;
  checker: UvRect;
  chevron: UvRect;
  shopCount: number;
  tentStart: number;
  tentCount: number;
  cartSlot: number;
  flyoverSlot: number;
  roadSlot: number;
  plaqueSlot: number;
}

function fitText(
  g: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  maxW: number,
  px: number,
) {
  let size = px;
  g.font = font(size);
  while (g.measureText(text).width > maxW && size > 10) {
    size -= 2;
    g.font = font(size);
  }
  return size;
}

export function signAtlas(): SignAtlas {
  const [c, g] = canvas(ATLAS, ATLAS);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, ATLAS, ATLAS);
  const slotRect = (i: number): [number, number, number, number] => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return [col * 512, row * 112, 512, 112];
  };
  const toUv = (x: number, y: number, w: number, h: number): UvRect => [
    (x + 2) / ATLAS,
    1 - (y + h - 2) / ATLAS,
    (x + w - 2) / ATLAS,
    1 - (y + 2) / ATLAS,
  ];
  const paintSign = (i: number, text: string, bg: string, fg: string, style: 'shop' | 'tent' | 'plain') => {
    const [x, y, w, h] = slotRect(i);
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    if (style === 'shop') {
      g.strokeStyle = fg;
      g.globalAlpha = 0.85;
      g.lineWidth = 5;
      g.strokeRect(x + 9, y + 9, w - 18, h - 18);
      g.globalAlpha = 1;
    }
    if (style === 'tent') {
      // Painted cloth banner: wavy edge bands.
      g.fillStyle = fg;
      g.globalAlpha = 0.25;
      g.fillRect(x, y, w, 10);
      g.fillRect(x, y + h - 10, w, 10);
      g.globalAlpha = 1;
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const size = fitText(g, text, (px) => `800 ${px}px ${DISPLAY}`, w - 54, style === 'tent' ? 86 : 70);
    g.font = `800 ${size}px ${DISPLAY}`;
    g.fillText(text, x + w / 2, y + h / 2 + size * 0.08);
  };
  const shops = STR.shopSigns;
  shops.forEach((text, i) => {
    const [bg, fg] = SIGN_COLORS[i % SIGN_COLORS.length]!;
    paintSign(i, text, bg, fg, 'shop');
  });
  const tentStart = shops.length;
  STR.tentBanners.forEach((text, i) => {
    const pal: [string, string][] = [
      ['#FFF7F0', '#F2453D'],
      ['#FFC928', '#111214'],
      ['#FFF7F0', '#2F8CFF'],
    ];
    const [bg, fg] = pal[i % pal.length]!;
    paintSign(tentStart + i, text, bg, fg, 'tent');
  });
  const cartSlot = tentStart + STR.tentBanners.length;
  paintSign(cartSlot, STR.cartLabel, '#FFF7F0', '#F2453D', 'plain');
  const flyoverSlot = cartSlot + 1;
  paintSign(flyoverSlot, STR.flyoverSign, '#1F6F43', '#FFFFFF', 'shop');
  const roadSlot = flyoverSlot + 1;
  paintSign(roadSlot, STR.roadSign, '#2F6FD6', '#FFFFFF', 'shop');
  const plaqueSlot = roadSlot + 1;
  paintSign(plaqueSlot, STR.tuguPlaque, '#3A2A1A', '#FFC928', 'shop');

  // Billboards: 2 x 3 cells of 1024 x 320 below the signs.
  const bbRect = (i: number): [number, number, number, number] => [
    (i % 2) * 1024,
    1024 + Math.floor(i / 2) * 320,
    1024,
    320,
  ];
  STR.billboards.forEach((b, i) => {
    const [x, y, w, h] = bbRect(i);
    g.fillStyle = b.bg;
    g.fillRect(x, y, w, h);
    // Simple bold poster: a coloured band and a big round badge.
    g.fillStyle = b.fg;
    g.globalAlpha = 0.14;
    g.beginPath();
    g.arc(x + w - 150, y + h / 2, 210, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = b.fg;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    const size = fitText(g, b.title, (px) => `800 ${px}px ${DISPLAY}`, w - 330, 120);
    g.font = `800 ${size}px ${DISPLAY}`;
    g.fillText(b.title, x + 56, y + h / 2 + size * 0.22);
    g.font = `700 40px ${UI}`;
    g.globalAlpha = 0.9;
    g.fillText(b.sub, x + 60, y + h / 2 + size * 0.22 + 58);
    g.globalAlpha = 1;
    // Badge: a little bajaj silhouette in a circle.
    const bx = x + w - 150;
    const by = y + h / 2;
    g.fillStyle = b.fg;
    g.beginPath();
    g.arc(bx, by, 96, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = b.bg;
    g.beginPath();
    g.moveTo(bx - 62, by + 28);
    g.lineTo(bx - 62, by - 30);
    g.quadraticCurveTo(bx - 60, by - 52, bx - 30, by - 52);
    g.lineTo(bx + 40, by - 52);
    g.quadraticCurveTo(bx + 66, by - 50, bx + 66, by - 10);
    g.lineTo(bx + 66, by + 28);
    g.closePath();
    g.fill();
    g.fillStyle = b.fg;
    g.fillRect(bx - 44, by - 38, 34, 30);
    g.fillRect(bx + 2, by - 38, 44, 30);
    g.fillStyle = b.bg;
    for (const wx of [bx - 40, bx + 44]) {
      g.beginPath();
      g.arc(wx, by + 34, 18, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 8;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
  });

  // Utility strip at the bottom: checker, white, chevrons.
  const sy = 1984;
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? '#111214' : '#FFFFFF';
      g.fillRect(i * 16, sy + j * 16, 16, 16);
    }
  }
  g.fillStyle = '#ffffff';
  g.fillRect(512, sy, 512, 64);
  g.fillStyle = '#FFC928';
  g.fillRect(1024, sy, 512, 64);
  g.fillStyle = '#111214';
  for (let i = 0; i < 8; i++) {
    const x0 = 1024 + i * 64;
    g.beginPath();
    g.moveTo(x0 + 10, sy + 6);
    g.lineTo(x0 + 34, sy + 6);
    g.lineTo(x0 + 54, sy + 32);
    g.lineTo(x0 + 34, sy + 58);
    g.lineTo(x0 + 10, sy + 58);
    g.lineTo(x0 + 30, sy + 32);
    g.closePath();
    g.fill();
  }

  const texture = tex(c);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.userData.surface = { roughness: 0.5, emissive: 0.26 };
  return {
    texture,
    sign: (i: number) => {
      const [x, y, w, h] = slotRect(i);
      return toUv(x, y, w, h);
    },
    billboard: (i: number) => {
      const [x, y, w, h] = bbRect(i % STR.billboards.length);
      return toUv(x, y, w, h);
    },
    white: toUv(600, sy + 8, 300, 48),
    checker: [0, 1 - (sy + 64) / ATLAS, 512 / ATLAS, 1 - sy / ATLAS],
    chevron: [1024 / ATLAS, 1 - (sy + 64) / ATLAS, 1536 / ATLAS, 1 - sy / ATLAS],
    shopCount: shops.length,
    tentStart,
    tentCount: STR.tentBanners.length,
    cartSlot,
    flyoverSlot,
    roadSlot,
    plaqueSlot,
  };
}

/** Start/finish banner (24 m x 1.4 m): left half FINIS (seen when arriving), right half START. */
export function gantryTexture(): THREE.CanvasTexture {
  const HW = 2048;
  const H = 120;
  const [c, g] = canvas(HW * 2, H);
  for (let half = 0; half < 2; half++) {
    const x0 = half * HW;
    g.fillStyle = '#111214';
    g.fillRect(x0, 0, HW, H);
    const sq = H / 4;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? '#111214' : '#FFFFFF';
        g.fillRect(x0 + i * sq, j * sq, sq, sq);
        g.fillRect(x0 + HW - 8 * sq + i * sq, j * sq, sq, sq);
      }
    }
    g.fillStyle = half === 0 ? '#FFC928' : '#FF5A1F';
    g.fillRect(x0 + 8 * sq, 0, HW - 16 * sq, 8);
    g.fillRect(x0 + 8 * sq, H - 8, HW - 16 * sq, 8);
    g.fillStyle = '#FFFFFF';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 96px ${DISPLAY}`;
    const word = half === 0 ? STR.gantryFinish : STR.gantryStart;
    // Letter-spaced so the word fills the banner like a painted race sign.
    const spaced = word.split('').join('\u2009\u2009');
    g.fillText(spaced, x0 + HW / 2, H / 2 + 6);
  }
  const t = tex(c);
  t.userData.surface = { roughness: 0.45, emissive: 0.3 };
  return t;
}

/* ------------------------------------------------------------------ facades */

/**
 * One window bay on a white wall; tiled across mid-rise buildings and tinted per building.
 * Its normal map recesses the pane behind a raised frame and sill, and its roughness map makes
 * the glass mirror-smooth, so flat facades catch the sun and reflect the sky.
 */
export function windowTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const k = S / 128;
  const R = (x: number, y: number, w: number, h: number) => g.fillRect(x * k, y * k, w * k, h * k);
  g.fillStyle = '#ffffff';
  R(0, 0, 128, 128);
  g.fillStyle = '#e8e8e8';
  R(0, 110, 128, 18);
  g.fillStyle = '#d6d6d6';
  R(18, 22, 92, 72);
  // Glass: a vertical gradient (sky reflected from above) under the real reflections.
  const grd = g.createLinearGradient(0, 28 * k, 0, 88 * k);
  grd.addColorStop(0, '#5d7d96');
  grd.addColorStop(1, '#2c4559');
  g.fillStyle = grd;
  R(24, 28, 80, 60);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.beginPath();
  g.moveTo(24 * k, 70 * k);
  g.lineTo(70 * k, 28 * k);
  g.lineTo(84 * k, 28 * k);
  g.lineTo(24 * k, 82 * k);
  g.closePath();
  g.fill();
  g.fillStyle = '#d6d6d6';
  R(62, 28, 4, 60);
  g.fillStyle = '#f4f4f4';
  R(14, 94, 100, 8);
  // Soft shade under the sill and at the top of the recess.
  g.fillStyle = 'rgba(0,0,0,0.10)';
  R(14, 102, 100, 3);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  R(24, 28, 80, 3);
  const t = tex(c, true);
  // Height: wall 0.5, frame 0.62, sill 0.75, glass 0, mullion 0.45, floor band 0.55.
  const height = (u: number, v: number) => {
    const x = u * 128;
    const y = v * 128;
    if (x >= 14 && x < 114 && y >= 94 && y < 102) return 0.75;
    if (x >= 24 && x < 104 && y >= 28 && y < 88) return x >= 62 && x < 66 ? 0.45 : 0;
    if (x >= 18 && x < 110 && y >= 22 && y < 94) return 0.62;
    if (y >= 110) return 0.55;
    return 0.5;
  };
  const rough = (u: number, v: number) => {
    const x = u * 128;
    const y = v * 128;
    if (x >= 24 && x < 104 && y >= 28 && y < 88 && !(x >= 62 && x < 66)) return 0.06;
    if (x >= 18 && x < 110 && y >= 22 && y < 102) return 0.55;
    return 0.92;
  };
  t.userData.surface = {
    roughness: 1,
    normalMap: normalMapFrom(128, 128, height, 3.2, true),
    normalScale: 1,
    roughnessMap: valueMap(128, 128, rough, true),
  };
  return t;
}

/* ------------------------------------------------------------------ number plates */

export interface PlateAtlas {
  texture: THREE.CanvasTexture;
  plate: (i: number) => UvRect;
  white: UvRect;
}

export function plateAtlas(texts: readonly string[]): PlateAtlas {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  const rect = (i: number): [number, number, number, number] => [
    (i % 2) * 256,
    Math.floor(i / 2) * 64,
    256,
    64,
  ];
  texts.forEach((t, i) => {
    const [x, y, w, h] = rect(i);
    g.fillStyle = '#111214';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#f4f4f4';
    g.lineWidth = 4;
    g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = '#f4f4f4';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 40px ${UI}`;
    g.fillText(t, x + w / 2, y + h / 2 + 2);
  });
  const toUv = (x: number, y: number, w: number, h: number): UvRect => [
    x / 512,
    1 - (y + h) / 512,
    (x + w) / 512,
    1 - y / 512,
  ];
  const texture = tex(c);
  texture.userData.surface = { roughness: 0.35, emissive: 0.12 };
  return {
    texture,
    plate: (i: number) => {
      const [x, y, w, h] = rect(i);
      return toUv(x + 2, y + 2, w - 4, h - 4);
    },
    white: toUv(40, 400, 400, 80),
  };
}

/* ------------------------------------------------------------------ kardus */

export function kardusTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#C98F55';
  g.fillRect(0, 0, 256, 256);
  // Corrugation streaks
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(120,72,30,${0.05 + hash01(i) * 0.06})`;
    g.fillRect(0, i * 6.4, 256, 2);
  }
  g.strokeStyle = '#8E5B2A';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 246);
  // Tape
  g.fillStyle = '#E8C487';
  g.fillRect(104, 0, 48, 256);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(108, 0, 8, 256);
  // Printed stamp
  g.strokeStyle = '#7A3E14';
  g.lineWidth = 6;
  g.strokeRect(24, 150, 70, 70);
  g.fillStyle = '#7A3E14';
  g.beginPath();
  g.moveTo(59, 160);
  g.lineTo(80, 186);
  g.lineTo(66, 186);
  g.lineTo(66, 210);
  g.lineTo(52, 210);
  g.lineTo(52, 186);
  g.lineTo(38, 186);
  g.closePath();
  g.fill();
  // "Fragile" glass symbol
  g.strokeStyle = '#7A3E14';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(186, 158);
  g.lineTo(226, 158);
  g.quadraticCurveTo(226, 192, 206, 196);
  g.quadraticCurveTo(186, 192, 186, 158);
  g.moveTo(206, 196);
  g.lineTo(206, 222);
  g.moveTo(192, 224);
  g.lineTo(220, 224);
  g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#7A3E14';
  g.font = `800 30px ${DISPLAY}`;
  g.save();
  g.translate(204, 80);
  g.rotate(-0.12);
  g.fillText('PAKET', 0, 0);
  g.restore();
  return tex(c);
}

/* ------------------------------------------------------------------ skyline */

export function skylineTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  let x = 0;
  let i = 0;
  // Back layer (paler) then front layer.
  for (const layer of [0, 1]) {
    x = layer * 30;
    while (x < W) {
      const w = 30 + hash01(i * 3.3 + layer) * 70;
      const h = (layer ? 50 : 80) + hash01(i * 1.7 + layer * 9) * (layer ? 120 : 150);
      g.fillStyle = layer ? '#9DB4C6' : '#B9CCDA';
      g.fillRect(x, H - h, w, h);
      // Some tops: antennas, crowns.
      const top = hash01(i * 5.1);
      if (top > 0.75) g.fillRect(x + w / 2 - 1.5, H - h - 24, 3, 24);
      else if (top > 0.55) g.fillRect(x + w * 0.2, H - h - 10, w * 0.6, 10);
      // Window rows
      if (layer) {
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let yy = H - h + 10; yy < H - 6; yy += 12) g.fillRect(x + 4, yy, w - 8, 3);
      }
      x += w + hash01(i * 7.9) * (layer ? 30 : 12);
      i++;
    }
  }
  const t = tex(c, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/* ------------------------------------------------------------------ sprites */

export function blobTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  // Soft contact shadow (ambient occlusion); the sun's real shadow map adds the hard part.
  grd.addColorStop(0, 'rgba(0,0,0,0.5)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** Painted ripples for the fountain pool and the oil sheen. */
export function waterTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#3FA7D6';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const x = hash01(i * 4.1) * 128;
    const y = hash01(i * 8.3) * 128;
    g.beginPath();
    g.ellipse(x, y, 8 + hash01(i) * 10, 3, 0, 0, Math.PI);
    g.stroke();
  }
  const t = tex(c, true);
  t.userData.surface = { roughness: 0.05, normalMap: waterNormalTexture(), normalScale: 0.7 };
  return t;
}

/* ------------------------------------------------------------------ PBR maps */

/**
 * Tangent-space normal map from a height function over [0, 1)^2 (heights in 0..1, `strength`
 * scales the slopes). Linear data texture, mipmapped, wrapping when `wrap`.
 */
export function normalMapFrom(
  w: number,
  h: number,
  height: (u: number, v: number) => number,
  strength: number,
  wrap = true,
): THREE.DataTexture {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = height((x + 0.5) / w, (y + 0.5) / h);
  const at = (x: number, y: number) => {
    if (wrap) return H[((y + h) % h) * w + ((x + w) % w)]!;
    return H[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  };
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      // Canvas rows go down while texture v goes up: flip the y slope.
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      // Texture row 0 is v = 0 (bottom) in a DataTexture: store rows flipped to match canvas UVs.
      const i = ((h - 1 - y) * w + x) * 4;
      data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return dataTex(data, w, h, wrap);
}

/** Single-value map (roughness reads G) from a function over [0, 1)^2, rows flipped like canvas UVs. */
export function valueMap(
  w: number,
  h: number,
  fn: (u: number, v: number) => number,
  wrap = true,
): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round(Math.min(1, Math.max(0, fn((x + 0.5) / w, (y + 0.5) / h))) * 255);
      const i = ((h - 1 - y) * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return dataTex(data, w, h, wrap);
}

function dataTex(data: Uint8Array, w: number, h: number, wrap: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (wrap) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.needsUpdate = true;
  return t;
}

/** Tileable value noise on the unit square (period `p` cells). */
function tileNoise(u: number, v: number, p: number, seed: number): number {
  const x = u * p;
  const y = v * p;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const h = (a: number, b: number) =>
    hash01((((a % p) + p) % p) * 17.3 + (((b % p) + p) % p) * 131.7 + seed * 7.1);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * s(xf);
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * s(xf);
  return a + (b - a) * s(yf);
}

function asphaltNormal(): THREE.DataTexture {
  return normalMapFrom(
    256,
    256,
    (u, v) =>
      tileNoise(u, v, 64, 1) * 0.5 +
      tileNoise(u, v, 128, 2) * 0.35 +
      tileNoise(u, v, 16, 3) * 0.4 -
      (hash01(Math.floor(u * 256) * 3.1 + Math.floor(v * 256) * 7.7) > 0.93 ? 0.25 : 0),
    2.2,
  );
}

function asphaltRoughness(): THREE.DataTexture {
  // Worn, slightly smoother wheel tracks and patches; the rest is open-graded and rough.
  return valueMap(128, 128, (u, v) => 0.86 - tileNoise(u, v, 4, 9) * 0.22 + tileNoise(u, v, 32, 4) * 0.08);
}

let waterNormal: THREE.DataTexture | null = null;
/** Gentle ripples, tileable; shared by the fountain, pools and the sea. */
export function waterNormalTexture(): THREE.DataTexture {
  if (!waterNormal) {
    waterNormal = normalMapFrom(
      128,
      128,
      (u, v) =>
        Math.sin((u * 3 + v * 2) * Math.PI * 2) * 0.25 +
        Math.sin((u * -2 + v * 5) * Math.PI * 2) * 0.18 +
        tileNoise(u, v, 8, 21) * 0.5,
      1.4,
    );
  }
  return waterNormal;
}

let sandTex: THREE.CanvasTexture | null = null;
/** Warm sand grain for beaches (multiplied with the material colour). */
export function sandTexture(): THREE.CanvasTexture {
  if (sandTex) return sandTex;
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 215 + hash01(i * 2.9) * 40;
    g.fillStyle = `rgb(${v},${Math.round(v * 0.97)},${Math.round(v * 0.9)})`;
    g.fillRect(hash01(i * 4.7) * 256, hash01(i * 8.1 + 3) * 256, 1, 1);
  }
  sandTex = tex(c, true);
  sandTex.userData.surface = {
    roughness: 0.97,
    normalMap: normalMapFrom(128, 128, (u, v) => tileNoise(u, v, 32, 5) * 0.6 + tileNoise(u, v, 8, 6), 1.5),
    normalScale: 0.6,
  };
  return sandTex;
}

let tread: THREE.DataTexture | null = null;
/**
 * Tyre normal map: a block tread in the middle band (v 0.3-0.7) and smooth sidewalls. Repeat it
 * around the tyre with `texture.repeat.x`.
 */
export function treadNormalTexture(): THREE.DataTexture {
  if (tread) return tread;
  tread = normalMapFrom(
    128,
    64,
    (u, v) => {
      if (v < 0.3 || v > 0.7) return 0.5;
      const t = (v - 0.3) / 0.4;
      // Chevron blocks with a centre groove.
      const shift = Math.abs(t - 0.5) * 0.35;
      const block = (u * 8 + shift) % 1 < 0.72 ? 1 : 0;
      const groove = Math.abs(t - 0.5) < 0.05 ? 0 : 1;
      const edge = Math.min(1, Math.min(t, 1 - t) * 12);
      return 0.5 + 0.5 * block * groove * edge;
    },
    3.5,
  );
  tread.wrapT = THREE.ClampToEdgeWrapping;
  return tread;
}
