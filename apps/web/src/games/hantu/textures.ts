/**
 * Canvas-drawn textures for Hantu Tak Terlihat: the floor plan of each map (Rumah Tua: plank
 * floors, rugs, furniture; Kampung Malam: grass, dirt paths, wooden houses, trees, rice field),
 * the six cute-creepy ghosts in pale teal, fruit faces, keys, fuse box, glow and film grain.
 * Drawn at RENDER_SCALE so they stay crisp on the 1.5x canvas.
 */
import { FRUITS, type Fruit } from '@hoorah/protocol';
import type * as Phaser from 'phaser';
import { type Face, fruitMarkup } from '../../shared/art/fruits';
import { seeded, svgDoc, svgUrl } from '../../shared/art/svg';
import { loadImage } from '../common/stage';
import { COLS, type HauntMap, ROWS, Tile, tileAt } from './maps';
import type { Skin } from './world';

export const RENDER_SCALE = 1.5;
export const TILE = 40;
export const FACES: readonly Face[] = ['happy', 'wow', 'sad'];

export const faceKey = (fruit: Fruit, face: Face) => `hf:${fruit}:${face}`;
export const skinKey = (skin: Skin) => `hs:${skin}`;
export const GLOW = 'h-glow';
export const KEY = 'h-key';
export const GRAIN = 'h-grain';

const FACE_PX = 96;
const PALE = '#A6F4E6';
const PALE_HI = '#DFFFF9';
const PALE_DARK = '#5FB8AA';
const INK = '#101214';

export async function loadFaces(): Promise<Map<string, HTMLImageElement>> {
  const jobs: Promise<[string, HTMLImageElement]>[] = [];
  for (const fruit of FRUITS) {
    for (const face of FACES) {
      const key = faceKey(fruit, face);
      const url = svgUrl(`hantu-${key}`, () =>
        svgDoc(FACE_PX, FACE_PX, fruitMarkup(fruit, face), '0 0 64 64'),
      );
      jobs.push(loadImage(url, FACE_PX, FACE_PX).then((img) => [key, img] as [string, HTMLImageElement]));
    }
  }
  return new Map(await Promise.all(jobs));
}

function canvas(textures: Phaser.Textures.TextureManager, key: string, w: number, h: number) {
  if (textures.exists(key)) textures.remove(key);
  const tex = textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  if (!tex) throw new Error(`texture ${key} failed`);
  return tex;
}

function eyes(c: CanvasRenderingContext2D, x: number, y: number, gap: number, r: number): void {
  c.fillStyle = INK;
  for (const dx of [-gap, gap]) {
    c.beginPath();
    c.ellipse(x + dx, y, r * 0.8, r, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#FFFFFF';
  for (const dx of [-gap, gap]) {
    c.beginPath();
    c.arc(x + dx + r * 0.25, y - r * 0.35, r * 0.28, 0, Math.PI * 2);
    c.fill();
  }
}

/** One ghost on a 100×100 canvas unit square, centred, pale teal, big friendly-spooky eyes. */
function drawSkin(c: CanvasRenderingContext2D, skin: Skin): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = PALE_DARK;
  c.lineWidth = 3;
  switch (skin) {
    case 'bayangan': {
      c.fillStyle = PALE;
      c.beginPath();
      c.moveTo(20, 86);
      c.lineTo(20, 46);
      c.bezierCurveTo(20, 12, 80, 12, 80, 46);
      c.lineTo(80, 86);
      for (let i = 0; i < 4; i++) c.quadraticCurveTo(80 - i * 15 - 7.5, 76, 80 - (i + 1) * 15, 86);
      c.closePath();
      c.fill();
      c.stroke();
      eyes(c, 50, 46, 12, 7);
      c.fillStyle = INK;
      c.beginPath();
      c.ellipse(50, 64, 5, 6, 0, 0, Math.PI * 2);
      c.fill();
      return;
    }
    case 'boneka': {
      c.fillStyle = PALE;
      c.beginPath();
      c.moveTo(30, 90);
      c.lineTo(50, 52);
      c.lineTo(70, 90);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = PALE_DARK;
      for (const x of [22, 78]) {
        c.beginPath();
        c.arc(x, 30, 9, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = PALE_HI;
      c.beginPath();
      c.arc(50, 36, 22, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      // Button eyes and a stitched smile.
      c.fillStyle = INK;
      for (const x of [41, 59]) {
        c.beginPath();
        c.arc(x, 34, 5, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(40, 45);
      c.quadraticCurveTo(50, 52, 60, 45);
      c.stroke();
      for (const x of [44, 50, 56]) {
        c.beginPath();
        c.moveTo(x, 45.5);
        c.lineTo(x, 50);
        c.stroke();
      }
      return;
    }
    case 'pocong': {
      c.fillStyle = PALE_HI;
      c.beginPath();
      c.moveTo(34, 92);
      c.bezierCurveTo(26, 60, 28, 22, 50, 18);
      c.bezierCurveTo(72, 22, 74, 60, 66, 92);
      c.closePath();
      c.fill();
      c.stroke();
      // Top knot tuft.
      c.beginPath();
      c.moveTo(50, 18);
      c.lineTo(42, 6);
      c.lineTo(50, 12);
      c.lineTo(58, 6);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = PALE_DARK;
      c.lineWidth = 2.5;
      for (const y of [58, 72, 84]) {
        c.beginPath();
        c.moveTo(34, y);
        c.quadraticCurveTo(50, y + 4, 66, y);
        c.stroke();
      }
      c.fillStyle = PALE;
      c.beginPath();
      c.ellipse(50, 38, 13, 12, 0, 0, Math.PI * 2);
      c.fill();
      eyes(c, 50, 37, 6, 4.5);
      c.fillStyle = INK;
      c.beginPath();
      c.arc(50, 46, 2.5, 0, Math.PI);
      c.fill();
      return;
    }
    case 'tuyul': {
      c.fillStyle = PALE;
      c.beginPath();
      c.ellipse(50, 76, 16, 14, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      for (const s of [-1, 1]) {
        c.beginPath();
        c.ellipse(50 + s * 27, 44, 9, 12, s * 0.4, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      c.fillStyle = PALE_HI;
      c.beginPath();
      c.arc(50, 46, 22, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      eyes(c, 50, 44, 9, 6);
      c.fillStyle = INK;
      c.beginPath();
      c.moveTo(38, 54);
      c.quadraticCurveTo(50, 66, 62, 54);
      c.closePath();
      c.fill();
      c.fillStyle = '#FFFFFF';
      c.fillRect(47, 54, 6, 4);
      return;
    }
    case 'genderuwo': {
      c.fillStyle = PALE_DARK;
      const rnd = seeded(9);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        c.beginPath();
        c.arc(50 + Math.cos(a) * 34, 52 + Math.sin(a) * 36, 9 + rnd() * 4, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = PALE;
      c.beginPath();
      c.ellipse(50, 52, 36, 38, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#FFE7A8';
      for (const x of [40, 60]) {
        c.beginPath();
        c.arc(x, 44, 4.5, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = INK;
      for (const x of [40, 60]) {
        c.beginPath();
        c.arc(x, 44, 2, 0, Math.PI * 2);
        c.fill();
      }
      c.beginPath();
      c.moveTo(34, 60);
      c.quadraticCurveTo(50, 78, 66, 60);
      c.closePath();
      c.fill();
      c.fillStyle = '#FFFFFF';
      c.fillRect(40, 60, 5, 5);
      c.fillRect(55, 60, 5, 5);
      return;
    }
    case 'kuntilanak': {
      // Long hair behind, a flowing dress, a pale round face.
      c.fillStyle = '#2A4A52';
      c.beginPath();
      c.moveTo(26, 30);
      c.bezierCurveTo(22, 70, 30, 88, 24, 96);
      c.lineTo(76, 96);
      c.bezierCurveTo(70, 88, 78, 70, 74, 30);
      c.bezierCurveTo(70, 8, 30, 8, 26, 30);
      c.fill();
      c.fillStyle = PALE_HI;
      c.beginPath();
      c.moveTo(34, 92);
      c.quadraticCurveTo(42, 60, 50, 52);
      c.quadraticCurveTo(58, 60, 66, 92);
      for (let i = 0; i < 4; i++) c.quadraticCurveTo(66 - i * 8 - 4, 86, 66 - (i + 1) * 8, 92);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = PALE;
      c.beginPath();
      c.ellipse(50, 34, 15, 17, 0, 0, Math.PI * 2);
      c.fill();
      eyes(c, 50, 34, 6, 4.5);
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(50, 41, 4, 0.2, Math.PI - 0.2);
      c.stroke();
      return;
    }
  }
}

export function makeSprites(
  textures: Phaser.Textures.TextureManager,
  faces: Map<string, HTMLImageElement>,
): void {
  const S = RENDER_SCALE;
  for (const [key, img] of faces) if (!textures.exists(key)) textures.addImage(key, img);
  const glow = canvas(textures, GLOW, 128, 128);
  {
    const g = glow.context.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    glow.context.fillStyle = g;
    glow.context.fillRect(0, 0, 128, 128);
    glow.refresh();
  }
  for (const skin of ['bayangan', 'boneka', 'pocong', 'tuyul', 'genderuwo', 'kuntilanak'] as const) {
    const px = Math.round(64 * S);
    const t = canvas(textures, skinKey(skin), px, px);
    t.context.save();
    t.context.scale(px / 100, px / 100);
    drawSkin(t.context, skin);
    t.context.restore();
    t.refresh();
  }
  const kp = Math.round(26 * S);
  const key = canvas(textures, KEY, kp, kp);
  {
    const c = key.context;
    const u = kp / 26;
    c.fillStyle = '#FFC928';
    c.strokeStyle = '#8A5A10';
    c.lineWidth = 2 * u;
    c.beginPath();
    c.arc(8 * u, 13 * u, 6 * u, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillRect(13 * u, 11 * u, 11 * u, 4 * u);
    c.strokeRect(13 * u, 11 * u, 11 * u, 4 * u);
    c.fillRect(19 * u, 15 * u, 3 * u, 4 * u);
    c.fillStyle = '#8A5A10';
    c.beginPath();
    c.arc(8 * u, 13 * u, 2.4 * u, 0, Math.PI * 2);
    c.fill();
    key.refresh();
  }
  const grain = canvas(textures, GRAIN, 160, 160);
  {
    const c = grain.context;
    const img = c.createImageData(160, 160);
    const rnd = seeded(31);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() < 0.5 ? 0 : 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.round(rnd() * 70);
    }
    c.putImageData(img, 0, 0);
    grain.refresh();
  }
}

interface Pal {
  floor: string;
  floor2: string;
  seam: string;
  rug: string;
  rug2: string;
  wall: string;
  wallTop: string;
  prop: string;
  propTop: string;
  label: string;
}

const PAL: Record<HauntMap['id'], Pal> = {
  rumah: {
    floor: '#3A2416',
    floor2: '#2C1B0F',
    seam: '#24160C',
    rug: '#5A1F1C',
    rug2: '#7A2E22',
    wall: '#1C1D21',
    wallTop: '#4A4D55',
    prop: '#5B3A22',
    propTop: '#8A5A33',
    label: 'rgba(243,230,200,0.10)',
  },
  kampung: {
    floor: '#0F2F2C',
    floor2: '#0D2B2C',
    seam: '#0A2322',
    rug: '#2D4A1E',
    rug2: '#3D6026',
    wall: '#3A2416',
    wallTop: '#C08D3E',
    prop: '#4A4D55',
    propTop: '#8E877A',
    label: 'rgba(243,230,200,0.10)',
  },
};

/** The static floor plan of a map (the dark layer and lights are drawn on top each frame). */
export function drawMap(textures: Phaser.Textures.TextureManager, key: string, m: HauntMap): void {
  const S = RENDER_SCALE;
  const W = COLS * TILE;
  const H = ROWS * TILE;
  const tex = canvas(textures, key, W * S, H * S);
  const c = tex.context;
  const p = PAL[m.id];
  const rnd = seeded(m.id === 'rumah' ? 41 : 43);
  c.save();
  c.scale(S, S);
  // Floor.
  c.fillStyle = p.floor;
  c.fillRect(0, 0, W, H);
  if (m.id === 'rumah') {
    c.fillStyle = p.floor2;
    for (let y = 0; y < H; y += 20)
      for (let x = (y / 20) % 2 ? -60 : 0; x < W; x += 120) c.fillRect(x + 2, y + 2, 116, 16);
    c.fillStyle = p.seam;
    for (let y = 0; y < H; y += 20) c.fillRect(0, y, W, 2);
  } else {
    // Grass tufts and a dirt path from the start to the gate.
    c.fillStyle = '#1E4A50';
    for (let i = 0; i < 260; i++) c.fillRect(rnd() * W, rnd() * H, 3, 2);
    c.fillStyle = '#2C2418';
    c.fillRect(13.5 * TILE, 0, 3 * TILE, H);
    c.fillRect(0, 7.6 * TILE, W, 1.8 * TILE);
    c.fillStyle = '#3A2E1E';
    for (let i = 0; i < 90; i++) c.fillRect(13.6 * TILE + rnd() * 2.8 * TILE, rnd() * H, 4, 3);
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = tileAt(m, x, y);
      const px = x * TILE;
      const py = y * TILE;
      if (t === Tile.Rug) {
        c.fillStyle = p.rug;
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = p.rug2;
        if (m.id === 'kampung') for (let k = 6; k < TILE; k += 10) c.fillRect(px + 2, py + k, TILE - 4, 3);
        else c.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
      } else if (t === Tile.Wall) {
        c.fillStyle = p.wall;
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = p.wallTop;
        c.fillRect(px, py, TILE, 6);
        if (m.id === 'kampung' && (y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1)) {
          // Bamboo fence around the village.
          c.fillStyle = '#C08D3E';
          for (let k = 2; k < TILE; k += 10) c.fillRect(px + k, py + 4, 6, TILE - 8);
          c.fillStyle = '#8A5A33';
          c.fillRect(px, py + 14, TILE, 3);
        }
      } else if (t === Tile.Prop) {
        c.fillStyle = p.prop;
        c.fillRect(px + 3, py + 5, TILE - 6, TILE - 8);
        c.fillStyle = p.propTop;
        c.fillRect(px + 3, py + 3, TILE - 6, 8);
      } else if (t === Tile.Tree) {
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.beginPath();
        c.ellipse(px + 22, py + 26, 22, 18, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#123A30';
        c.beginPath();
        c.arc(px + 20, py + 18, 22, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1E4A40';
        c.beginPath();
        c.arc(px + 14, py + 12, 11, 0, Math.PI * 2);
        c.fill();
      } else if (t === Tile.Fuse) {
        c.fillStyle = '#4A4D55';
        c.fillRect(px + 6, py + 4, TILE - 12, TILE - 8);
        c.fillStyle = '#8E877A';
        c.fillRect(px + 9, py + 7, TILE - 18, TILE - 14);
        c.fillStyle = '#FFC928';
        c.beginPath();
        c.moveTo(px + 22, py + 9);
        c.lineTo(px + 14, py + 22);
        c.lineTo(px + 20, py + 22);
        c.lineTo(px + 17, py + 32);
        c.lineTo(px + 27, py + 18);
        c.lineTo(px + 21, py + 18);
        c.closePath();
        c.fill();
      } else if (t === Tile.Door) {
        c.fillStyle = '#2C1B0F';
        c.fillRect(px, py, TILE, TILE);
      } else if (t === Tile.Exit) {
        c.fillStyle = '#5B3A22';
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = '#3A2416';
        c.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
      }
    }
  }
  // Ceiling lamps (the fixture; the light pool is part of the dark layer).
  for (const l of m.lamps) {
    c.fillStyle = '#8E877A';
    c.beginPath();
    c.arc(l.x * TILE + 20, l.y * TILE + 20, 6, 0, Math.PI * 2);
    c.fill();
  }
  // Room names, faint on the floor.
  c.fillStyle = p.label;
  c.font = '800 26px "Baloo 2", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const lb of m.labels) c.fillText(lb.text, lb.x * TILE, lb.y * TILE);
  c.restore();
  tex.refresh();
}
