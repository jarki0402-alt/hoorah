/**
 * One texture atlas for everything that moves, so the whole arena draws in very few batches:
 * fruit heads (rasterized from the shared SVG art), round segment frames per snake colour, seed
 * frames per seed colour, and a few white effect frames that are tinted at runtime.
 */
import { FRUITS, type Fruit } from '@hoorah/protocol';
import type * as Phaser from 'phaser';
import { type Face, fruitMarkup } from '../../shared/art/fruits';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { loadImage } from '../common/stage';

/** Canvas pixels per stage pixel. */
export const RENDER_SCALE = 1.5;
export const ATLAS_KEY = 'arena-atlas';
export const FACES: readonly Face[] = ['happy', 'effort', 'wow', 'sad'];
const SIZE = 1024;
const HEAD_PX = 128;
const CELL = 64;
/** Radius of every round frame inside its 64 px cell. */
export const DISC_R = 30;
/** Seed core radius inside its cell. */
export const SEED_R = 26;
export const GLOW_R = 32;

export const headFrame = (fruit: Fruit, face: Face): string => `head:${fruit}:${face}`;
export const segFrame = (color: number): string => `seg:${color}`;
export const bandFrame = (color: number): string => `band:${color}`;
export const seedFrame = (color: number): string => `seed:${color}`;

/** Fruit faces rasterized at 128 px, drawn into the atlas once Phaser is up. */
export async function loadHeads(): Promise<Map<string, HTMLImageElement>> {
  const keys: string[] = [];
  const jobs: Promise<HTMLImageElement>[] = [];
  for (const fruit of FRUITS) {
    for (const face of FACES) {
      const key = headFrame(fruit, face);
      keys.push(key);
      const url = svgUrl(`arena-${key}-${HEAD_PX}`, () =>
        svgDoc(HEAD_PX, HEAD_PX, fruitMarkup(fruit, face), '0 0 64 64'),
      );
      jobs.push(loadImage(url, HEAD_PX, HEAD_PX));
    }
  }
  const images = await Promise.all(jobs);
  const out = new Map<string, HTMLImageElement>();
  keys.forEach((k, i) => {
    const img = images[i];
    if (img) out.set(k, img);
  });
  return out;
}

function rgb(c: number): string {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Blend two 0xRRGGBB colours (t = 0: a, t = 1: b). */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (shift: number) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * t) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class Atlas {
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private slot = 0;
  private readonly colors = new Set<number>();
  private readonly seeds = new Set<number>();
  private dirty = false;

  constructor(textures: Phaser.Textures.TextureManager, heads: Map<string, HTMLImageElement>) {
    const tex = textures.createCanvas(ATLAS_KEY, SIZE, SIZE);
    if (!tex) throw new Error('arena atlas already exists');
    this.tex = tex;
    this.ctx = tex.context;
    // Heads: 8 per row of 128 px cells in the top half.
    let i = 0;
    for (const [key, img] of heads) {
      const x = (i % 8) * HEAD_PX;
      const y = Math.floor(i / 8) * HEAD_PX;
      this.ctx.drawImage(img, x, y, HEAD_PX, HEAD_PX);
      this.tex.add(key, 0, x, y, HEAD_PX, HEAD_PX);
      i++;
    }
    this.effects();
    this.tex.refresh();
  }

  /** Make sure segment frames exist for a snake colour. */
  ensureSnake(color: number): void {
    if (this.colors.has(color)) return;
    this.colors.add(color);
    this.draw(segFrame(color), (cx, cy) => this.segment(cx, cy, color, color));
    this.draw(bandFrame(color), (cx, cy) => this.segment(cx, cy, color, mixColor(color, 0xfff6e3, 0.38)));
    this.ensureSeed(color);
    this.dirty = true;
  }

  ensureSeed(color: number): void {
    if (this.seeds.has(color)) return;
    this.seeds.add(color);
    this.draw(seedFrame(color), (cx, cy) => {
      const g = this.ctx;
      this.circle(cx, cy, SEED_R, rgb(color));
      this.circle(cx, cy, SEED_R * 0.56, rgb(mixColor(color, 0xffffff, 0.55)));
      g.globalAlpha = 0.95;
      this.circle(cx - SEED_R * 0.3, cy - SEED_R * 0.3, SEED_R * 0.22, '#FFFFFF');
      g.globalAlpha = 1;
    });
    this.dirty = true;
  }

  /** Upload new frames to the GPU (once per frame at most). */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.tex.refresh();
  }

  private nextCell(): { x: number; y: number } | null {
    const perRow = SIZE / CELL;
    const firstRow = (HEAD_PX * 4) / CELL;
    const row = firstRow + Math.floor(this.slot / perRow);
    if (row >= SIZE / CELL) return null;
    const x = (this.slot % perRow) * CELL;
    this.slot++;
    return { x, y: row * CELL };
  }

  private draw(name: string, paint: (cx: number, cy: number) => void): void {
    const cell = this.nextCell();
    if (!cell) return;
    this.ctx.save();
    paint(cell.x + CELL / 2, cell.y + CELL / 2);
    this.ctx.restore();
    this.tex.add(name, 0, cell.x, cell.y, CELL, CELL);
  }

  private circle(x: number, y: number, r: number, fill: string): void {
    const g = this.ctx;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  }

  /** Flat-shaded body segment: a darker crescent low right, the fill, a soft highlight. */
  private segment(cx: number, cy: number, color: number, fill: number): void {
    const g = this.ctx;
    this.circle(cx, cy, DISC_R, rgb(mixColor(color, 0x06100b, 0.22)));
    this.circle(cx - DISC_R * 0.08, cy - DISC_R * 0.1, DISC_R * 0.86, rgb(fill));
    g.save();
    g.translate(cx - DISC_R * 0.32, cy - DISC_R * 0.36);
    g.rotate(-0.6);
    g.beginPath();
    g.ellipse(0, 0, DISC_R * 0.3, DISC_R * 0.18, 0, 0, Math.PI * 2);
    g.globalAlpha = 0.8;
    g.fillStyle = rgb(mixColor(fill, 0xffffff, 0.5));
    g.fill();
    g.restore();
  }

  /** White frames tinted at runtime. */
  private effects(): void {
    const g = this.ctx;
    this.draw('disc', (cx, cy) => this.circle(cx, cy, DISC_R, '#FFFFFF'));
    this.draw('glow', (cx, cy) => {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, GLOW_R);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(cx - GLOW_R, cy - GLOW_R, GLOW_R * 2, GLOW_R * 2);
    });
    this.draw('dot', (cx, cy) => this.circle(cx, cy, 12, '#FFFFFF'));
    this.draw('spark', (cx, cy) => {
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 6 : 22;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = '#FFFFFF';
      g.fill();
    });
    this.draw('ring', (cx, cy) => {
      g.beginPath();
      g.arc(cx, cy, 27, 0, Math.PI * 2);
      g.lineWidth = 5;
      g.strokeStyle = '#FFFFFF';
      g.stroke();
    });
    // Forked tongue pointing right from the cell's centre (origin at its root).
    this.draw('tongue', (cx, cy) => {
      g.strokeStyle = '#FF4F6E';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = 4.5;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + 18, cy);
      g.moveTo(cx + 17, cy);
      g.lineTo(cx + 27, cy - 6);
      g.moveTo(cx + 17, cy);
      g.lineTo(cx + 27, cy + 6);
      g.stroke();
    });
  }
}
