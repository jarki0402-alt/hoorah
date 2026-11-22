/**
 * Canvas-drawn textures for Petualangan Warna: the glowing cave backdrop (per stage size), the
 * static stage layer (rock, exit arches, rails), and small sprites (fruit faces, colour badges,
 * gems, boxes, glow). Everything is drawn at RENDER_SCALE so it stays crisp on the 1.5x canvas.
 */
import { FRUITS, type Fruit } from '@hoorah/protocol';
import type * as Phaser from 'phaser';
import { type Face, fruitMarkup } from '../../shared/art/fruits';
import { seeded, svgDoc, svgUrl } from '../../shared/art/svg';
import { loadImage } from '../common/stage';
import { Cell, COLS, cellAt, foldSlot, type Level, ROWS, type Slot } from './levels';

export const RENDER_SCALE = 1.5;
/** Stage px per tile. */
export const TILE = 40;
export const FACES: readonly Face[] = ['happy', 'effort', 'wow'];

export const SLOT_COLOR: Record<Slot, number> = { 0: 0xf2453d, 1: 0x2f7df6, 2: 0x22b35e, 3: 0xffc928 };
export const SLOT_CSS: Record<Slot, string> = { 0: '#F2453D', 1: '#2F7DF6', 2: '#22B35E', 3: '#FFC928' };
export const SLOT_DARK: Record<Slot, string> = { 0: '#A8261F', 1: '#1D4FA8', 2: '#157A3F', 3: '#B88A00' };
export const SLOT_LIGHT: Record<Slot, string> = { 0: '#FF9A8E', 1: '#9CC2FF', 2: '#7BD36A', 3: '#FFE27A' };
/** Wire colour of trigger channels 1..3 (plates, levers, doors, lifts on one channel match). */
export const CHANNEL_COLOR: Record<number, number> = { 1: 0xffe27a, 2: 0x9ff3e6, 3: 0xffc2a8 };
export const CHANNEL_CSS: Record<number, string> = { 1: '#FFE27A', 2: '#9FF3E6', 3: '#FFC2A8' };

const ROCK = '#14262B';
const ROCK_DEEP = '#0F2A30';
const ROCK_EDGE = '#2A4A52';
const MOSS = '#3FA34D';
const MOSS_HI = '#7BD36A';
const CRYSTAL = '#4FE3C8';
const CRYSTAL_HI = '#9FF3E6';

export const faceKey = (fruit: Fruit, face: Face) => `wf:${fruit}:${face}`;
export const badgeKey = (slot: Slot) => `wb:${slot}`;
export const gemKey = (slot: Slot) => `wg:${slot}`;
export const GLOW = 'w-glow';
export const SPARK = 'w-spark';
export const BOX = 'w-box';
export const BOX_HEAVY = 'w-box2';
export const ARROW = 'w-arrow';

const FACE_PX = 96;

/** Fruit faces rasterized once (SVG → image) before Phaser starts. */
export async function loadFaces(): Promise<Map<string, HTMLImageElement>> {
  const jobs: Promise<[string, HTMLImageElement]>[] = [];
  for (const fruit of FRUITS) {
    for (const face of FACES) {
      const key = faceKey(fruit, face);
      const url = svgUrl(`warna-${key}`, () =>
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

/** The shape of a colour slot, centred at (x, y) with radius r. */
export function symbolPath(ctx: CanvasRenderingContext2D, slot: Slot, x: number, y: number, r: number): void {
  ctx.beginPath();
  if (slot === 0) {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.95, y + r * 0.72);
    ctx.lineTo(x - r * 0.95, y + r * 0.72);
    ctx.closePath();
  } else if (slot === 1) {
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
  } else if (slot === 2) {
    ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
  } else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
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
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    glow.context.fillStyle = g;
    glow.context.fillRect(0, 0, 128, 128);
    glow.refresh();
  }
  const spark = canvas(textures, SPARK, 24, 24);
  {
    const c = spark.context;
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rr = i % 2 ? 3 : 11;
      c.lineTo(12 + Math.cos(a) * rr, 12 + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    spark.refresh();
  }
  for (const slot of [0, 1, 2, 3] as const) {
    const px = Math.round(20 * S);
    const b = canvas(textures, badgeKey(slot), px, px);
    const c = b.context;
    c.fillStyle = '#111214';
    c.beginPath();
    c.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = SLOT_CSS[slot];
    c.beginPath();
    c.arc(px / 2, px / 2, px / 2 - 2 * S, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#FFFFFF';
    symbolPath(c, slot, px / 2, px / 2 + (slot === 0 ? 0.6 * S : 0), px * 0.27);
    c.fill();
    b.refresh();

    const gp = Math.round(30 * S);
    const gem = canvas(textures, gemKey(slot), gp, gp);
    const g = gem.context;
    const m = gp / 2;
    g.fillStyle = SLOT_DARK[slot];
    g.beginPath();
    g.moveTo(m, 1);
    g.lineTo(gp - 2, m * 0.8);
    g.lineTo(m, gp - 1);
    g.lineTo(2, m * 0.8);
    g.closePath();
    g.fill();
    g.fillStyle = SLOT_CSS[slot];
    g.beginPath();
    g.moveTo(m, 4 * S);
    g.lineTo(gp - 5 * S, m * 0.8);
    g.lineTo(m, gp - 4 * S);
    g.lineTo(5 * S, m * 0.8);
    g.closePath();
    g.fill();
    g.fillStyle = SLOT_LIGHT[slot];
    g.beginPath();
    g.moveTo(m, 4 * S);
    g.lineTo(gp - 5 * S, m * 0.8);
    g.lineTo(m, m * 0.8);
    g.closePath();
    g.fill();
    g.fillStyle = '#FFFFFF';
    symbolPath(g, slot, m, m * 1.05, gp * 0.15);
    g.fill();
    gem.refresh();
  }
  const bp = Math.round(TILE * S);
  const box = canvas(textures, BOX, bp, bp);
  {
    const c = box.context;
    const u = bp / 40;
    c.fillStyle = '#5A3A22';
    c.fillRect(0, 0, bp, bp);
    c.fillStyle = '#A9774A';
    c.fillRect(2 * u, 2 * u, bp - 4 * u, bp - 4 * u);
    c.fillStyle = '#C08D3E';
    c.fillRect(2 * u, 2 * u, bp - 4 * u, 5 * u);
    c.strokeStyle = '#7C4A28';
    c.lineWidth = 4 * u;
    c.beginPath();
    c.moveTo(6 * u, 6 * u);
    c.lineTo(bp - 6 * u, bp - 6 * u);
    c.moveTo(bp - 6 * u, 6 * u);
    c.lineTo(6 * u, bp - 6 * u);
    c.stroke();
    box.refresh();
  }
  const hp = bp * 2;
  const heavy = canvas(textures, BOX_HEAVY, hp, hp);
  {
    const c = heavy.context;
    const u = hp / 80;
    c.fillStyle = '#3A3D44';
    roundRect(c, 0, 0, hp, hp, 8 * u);
    c.fill();
    c.fillStyle = '#8E877A';
    roundRect(c, 3 * u, 3 * u, hp - 6 * u, hp - 6 * u, 6 * u);
    c.fill();
    c.fillStyle = '#BDAF94';
    roundRect(c, 3 * u, 3 * u, hp - 6 * u, 10 * u, 6 * u);
    c.fill();
    c.fillStyle = '#5B5E66';
    for (const [x, y] of [
      [14, 26],
      [56, 30],
      [30, 56],
      [62, 62],
    ] as const) {
      c.beginPath();
      c.arc(x * u, y * u, 4 * u, 0, Math.PI * 2);
      c.fill();
    }
    // Two hands: "push together".
    c.fillStyle = '#E8DCC0';
    for (const x of [28, 52]) {
      roundRect(c, (x - 7) * u, 34 * u, 14 * u, 16 * u, 5 * u);
      c.fill();
    }
    heavy.refresh();
  }
  const ap = Math.round(26 * S);
  const arrow = canvas(textures, ARROW, ap, ap);
  {
    const c = arrow.context;
    c.fillStyle = '#FFFFFF';
    c.strokeStyle = '#111214';
    c.lineWidth = 2.4 * S;
    c.beginPath();
    c.moveTo(ap / 2, ap - 3 * S);
    c.lineTo(ap - 3 * S, ap * 0.42);
    c.lineTo(ap * 0.66, ap * 0.42);
    c.lineTo(ap * 0.66, 3 * S);
    c.lineTo(ap * 0.34, 3 * S);
    c.lineTo(ap * 0.34, ap * 0.42);
    c.lineTo(3 * S, ap * 0.42);
    c.closePath();
    c.fill();
    c.stroke();
    arrow.refresh();
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Cave behind the stage, filling the whole stage (wider or taller screens see more cave). */
export function drawBackdrop(
  textures: Phaser.Textures.TextureManager,
  key: string,
  w: number,
  h: number,
): void {
  const S = RENDER_SCALE;
  const tex = canvas(textures, key, w * S, h * S);
  const c = tex.context;
  c.save();
  c.scale(S, S);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0A2731');
  sky.addColorStop(0.55, '#0B1F26');
  sky.addColorStop(1, '#0E3440');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const rnd = seeded(27);
  // Far glows behind the rock.
  for (let i = 0; i < 9; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const rr = 120 + rnd() * 160;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, rnd() < 0.5 ? 'rgba(47,213,197,0.16)' : 'rgba(255,226,122,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // Two layers of hanging and standing rock.
  const layer = (color: string, depth: number, count: number) => {
    c.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const bw = 30 + rnd() * 70;
      const bh = depth * (0.4 + rnd() * 0.8);
      c.beginPath();
      c.moveTo(x - bw / 2, 0);
      c.lineTo(x + bw / 2, 0);
      c.lineTo(x + bw * 0.08, bh);
      c.closePath();
      c.fill();
      const by = h;
      c.beginPath();
      c.moveTo(x - bw / 2 + 20, by);
      c.lineTo(x + bw / 2 + 20, by);
      c.lineTo(x + 20 - bw * 0.1, by - bh * 0.7);
      c.closePath();
      c.fill();
    }
  };
  layer('#0E3440', h * 0.32, 22);
  layer('#163A40', h * 0.2, 16);
  // Light shafts.
  c.fillStyle = 'rgba(232,255,249,0.035)';
  for (let i = 0; i < 4; i++) {
    const x = rnd() * w;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + 60, 0);
    c.lineTo(x + 220, h);
    c.lineTo(x + 100, h);
    c.closePath();
    c.fill();
  }
  c.restore();
  tex.refresh();
}

function isSolidish(lv: Level, x: number, y: number): boolean {
  const c = cellAt(lv, x, y);
  return c === Cell.Rock;
}

/**
 * The fixed part of a stage: rock with mossy lips, glowing crystals and stalactites, exit arches
 * in their colour with the colour's symbol, checkpoint poles and lift rails.
 */
export function drawStage(
  textures: Phaser.Textures.TextureManager,
  key: string,
  lv: Level,
  colors: number,
): void {
  const S = RENDER_SCALE;
  const W = COLS * TILE;
  const H = ROWS * TILE;
  const tex = canvas(textures, key, W * S, H * S);
  const c = tex.context;
  c.save();
  c.scale(S, S);
  const rnd = seeded(101 + lv.index * 7);
  // Lift rails first (behind everything).
  for (const l of lv.lifts) {
    const top = l.yUp * TILE - 6;
    const bot = l.yDown * TILE + 16;
    c.fillStyle = '#1E4A50';
    c.fillRect(l.x * TILE + 4, top, 4, bot - top);
    c.fillRect((l.x + l.w) * TILE - 8, top, 4, bot - top);
    c.fillStyle = '#2A4A52';
    for (let y = top; y < bot; y += 14) {
      c.fillRect(l.x * TILE + 3, y, 6, 3);
      c.fillRect((l.x + l.w) * TILE - 9, y, 6, 3);
    }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!isSolidish(lv, x, y)) continue;
      const px = x * TILE;
      const py = y * TILE;
      const openUp = !isSolidish(lv, x, y - 1) && y > 0;
      const openDown = !isSolidish(lv, x, y + 1) && y < ROWS - 1;
      const openL = !isSolidish(lv, x - 1, y) && x > 0;
      const openR = !isSolidish(lv, x + 1, y) && x < COLS - 1;
      c.fillStyle = ROCK;
      c.fillRect(px, py, TILE, TILE);
      // Speckles.
      c.fillStyle = ROCK_DEEP;
      for (let k = 0; k < 3; k++) c.fillRect(px + rnd() * 34, py + rnd() * 34, 4 + rnd() * 5, 3 + rnd() * 3);
      if (openL) {
        c.fillStyle = '#1B3137';
        c.fillRect(px, py, 4, TILE);
      }
      if (openR) {
        c.fillStyle = '#0D2025';
        c.fillRect(px + TILE - 4, py, 4, TILE);
      }
      if (openDown) {
        c.fillStyle = '#0B1B20';
        c.fillRect(px, py + TILE - 5, TILE, 5);
        if (rnd() < 0.22) {
          // Stalactite with a glowing drip.
          const sx = px + 8 + rnd() * 24;
          c.fillStyle = ROCK;
          c.beginPath();
          c.moveTo(sx - 6, py + TILE);
          c.lineTo(sx + 6, py + TILE);
          c.lineTo(sx, py + TILE + 12 + rnd() * 8);
          c.closePath();
          c.fill();
        }
      }
      if (openUp) {
        c.fillStyle = ROCK_EDGE;
        c.fillRect(px, py, TILE, 7);
        c.fillStyle = MOSS;
        c.fillRect(px, py, TILE, 3);
        c.fillStyle = MOSS_HI;
        for (let k = 0; k < 3; k++) c.fillRect(px + rnd() * 36, py - 1, 3 + rnd() * 4, 2);
        if (rnd() < 0.12) {
          // Crystal cluster on the ground.
          const cx = px + 8 + rnd() * 24;
          const g = c.createRadialGradient(cx, py - 6, 0, cx, py - 6, 26);
          g.addColorStop(0, 'rgba(79,227,200,0.45)');
          g.addColorStop(1, 'rgba(79,227,200,0)');
          c.fillStyle = g;
          c.fillRect(cx - 26, py - 32, 52, 52);
          for (const [dx, hh, col] of [
            [-5, 12, CRYSTAL],
            [0, 18, CRYSTAL_HI],
            [5, 10, CRYSTAL],
          ] as const) {
            c.fillStyle = col;
            c.beginPath();
            c.moveTo(cx + dx - 3, py + 1);
            c.lineTo(cx + dx + 3, py + 1);
            c.lineTo(cx + dx, py + 1 - hh);
            c.closePath();
            c.fill();
          }
        }
      }
    }
  }
  // Exit arches.
  for (const e of lv.exits) {
    const slot = foldSlot(e.slot, colors);
    const px = e.x * TILE;
    const py = (e.y - 1) * TILE;
    c.fillStyle = '#2A2B30';
    roundTop(c, px + 2, py - 4, TILE - 4, TILE * 2 + 4, 18);
    c.fillStyle = SLOT_CSS[slot];
    roundTop(c, px + 5, py - 1, TILE - 10, TILE * 2 + 1, 15);
    c.fillStyle = '#0B1F26';
    roundTop(c, px + 9, py + 5, TILE - 18, TILE * 2 - 5, 11);
    c.fillStyle = '#FFFFFF';
    symbolPath(c, slot, px + TILE / 2, py + 16, 6.5);
    c.fill();
  }
  // Checkpoint poles.
  for (const k of lv.checkpoints) {
    c.fillStyle = '#C9B98F';
    c.fillRect(k.x * TILE + 17, k.y * TILE + 4, 4, TILE - 4);
    c.fillStyle = '#5B5E66';
    c.fillRect(k.x * TILE + 12, k.y * TILE + TILE - 4, 14, 4);
  }
  // Plate housings.
  for (const p of lv.plates) {
    c.fillStyle = '#2A2B30';
    c.fillRect(p.x * TILE + 2, p.y * TILE + TILE - 6, TILE - 4, 6);
  }
  // Lever bases.
  for (const l of lv.levers) {
    c.fillStyle = '#3D4047';
    roundTop(c, l.x * TILE + 8, l.y * TILE + TILE - 10, TILE - 16, 10, 5);
  }
  c.restore();
  tex.refresh();
}

function roundTop(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h);
  c.closePath();
  c.fill();
}
