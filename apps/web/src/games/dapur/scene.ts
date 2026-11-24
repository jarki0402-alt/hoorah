/**
 * The Phaser world of Dapur Heboh: the static kitchen backdrop (one pre-rendered texture, or two
 * carts that slide on Heboh), every station as its own image (so Jam Sibuk can move them),
 * chefs (each player's own character as the head) built from tinted parts, items, throws, rings, bars, fire and smoke. It only
 * renders; rules live in logic.ts.
 *
 * Coordinates: the 1280x720 world is centred on the stage; the kitchen sits at (KX, KY). Logic
 * positions are tiles: x * 80 across, feet at 66 + y * 64 down. Depth is the screen y of an
 * object's base so lower things cover higher ones (3/4 view).
 *
 * Per frame there are no allocations in the hot paths: images come from pools, three Graphics
 * objects are cleared and redrawn.
 */
import type { Look } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { GameFace } from '../../shared/art/people';
import {
  contentSpot,
  feetY,
  heatSpot,
  KITCHEN_H,
  KITCHEN_W,
  lookId,
  rowTop,
  ST_H,
  ST_INSET,
  ST_MARGIN,
  skinColor,
  TILE_W,
} from './art';
import { type Item, plateDish, type StainKind } from './items';
import { CLEAN_MS, DOUSE_MS, type KitchenDef, type Side, sideOfX, WARN_MS, WASH_MS } from './kitchens';
import type { Chef, Flight, MatchEvent, Phase, Station } from './logic';
import { STR } from './strings';
import {
  BACKDROP_PAD,
  BLANK_KEY,
  backdropKey,
  cartKey,
  headKey,
  iconKey,
  loadHeads,
  pillCanvas,
  RENDER_SCALE,
  stainKey,
  stationKey,
  TEX,
} from './textures';

export const WORLD_W = 1280;
export const WORLD_H = 720;
export const KX = 80;
export const KY = 128;

const DEPTH_TOP = 9000;
const DEPTH_TAGS = 9500;
const HIT_BUBBLE_MS = 1_800;
const THROW_PILL_MS = 700;
const ARC_LIFT = 34;
/** Height above a cook's feet that clears the name tag (practice arrow). */
const CHEF_TOP = 108;

interface ChefSprite {
  id: number;
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  legs: Phaser.GameObjects.Image;
  shirt: Phaser.GameObjects.Image;
  handL: Phaser.GameObjects.Image;
  handR: Phaser.GameObjects.Image;
  apron: Phaser.GameObjects.Image;
  stains: Phaser.GameObjects.Image[];
  head: Phaser.GameObjects.Image;
  hat: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Image;
  tagKey: string;
  /** Head texture now shown (BLANK_KEY until the look is rasterized). */
  headKey: string;
  /** `lookId` of the look the hands were tinted for. */
  look: string;
  flip: number;
  stainCount: number;
}

interface Pop {
  x: number;
  y: number;
  t0: number;
  color: number;
}

const hex = (c: string): number => Number.parseInt(c.replace('#', '').slice(0, 6), 16) || 0;

/** A cook as the scene draws it (`pilot` only matters as set or not). */
export type StageChef = Pick<
  Chef,
  | 'id'
  | 'name'
  | 'color'
  | 'look'
  | 'cpu'
  | 'x'
  | 'y'
  | 'prevX'
  | 'prevY'
  | 'faceX'
  | 'moving'
  | 'walked'
  | 'busy'
  | 'held'
  | 'stains'
  | 'target'
  | 'jobMs'
  | 'hitAt'
> & { readonly pilot: unknown };

export type StageStation = Pick<
  Station,
  'id' | 'kind' | 'x' | 'y' | 'w' | 'source' | 'item' | 'pot' | 'fire' | 'douseMs' | 'dirty' | 'plates'
>;

export type StageFlight = Pick<
  Flight,
  'item' | 'from' | 'toChef' | 'toStation' | 'sx' | 'sy' | 'ex' | 'ey' | 't0' | 'dur' | 'color'
>;

/**
 * What the scene draws: the Host's match itself, or on a far-away main screen (long-distance
 * play) the copy rebuilt from the Host's published state (replica.ts). Times are on the clock the
 * scene's `frameT` runs on.
 */
export interface StageModel {
  readonly def: KitchenDef;
  readonly phase: Phase;
  readonly moved: boolean;
  readonly tuning: { readonly burnMs: number | null };
  readonly stations: readonly StageStation[];
  readonly floor: readonly { readonly item: Item; readonly x: number; readonly y: number }[];
  readonly chefs: readonly StageChef[];
  readonly flights: readonly StageFlight[];
  chef(id: number): StageChef | undefined;
  /** Gap between the two carts (tiles) at time t. */
  gap(t: number): number;
  /** Cooker progress: 0..1 cooking, 1..2 toward burnt. */
  heatLevel(s: StageStation): number;
  staggered(c: StageChef): boolean;
}

/** A short scene effect a match event starts (replayed as is on far-away screens). */
export type StageMark =
  | { kind: 'pop'; x: number; y: number; color: string }
  | { kind: 'throw'; id: number }
  | { kind: 'moveWarn' };

/** The scene effect of a match event, read from the stage as it is right then; null for none. */
export function markOf(e: MatchEvent, m: StageModel): StageMark | null {
  switch (e.type) {
    case 'throw':
      return { kind: 'throw', id: e.flight.from };
    case 'catch': {
      const c = m.chef(e.by);
      return c ? { kind: 'pop', x: c.x, y: c.y, color: e.flight.color } : null;
    }
    case 'land':
      return { kind: 'pop', x: e.x, y: e.y, color: '#FFFFFF' };
    case 'hit': {
      const c = m.chef(e.to);
      return c ? { kind: 'pop', x: c.x, y: c.y, color: e.broke ? '#F2453D' : '#FFC928' } : null;
    }
    case 'chopped': {
      const s = m.stations[e.station];
      return s ? { kind: 'pop', x: s.x + 0.45, y: s.y + 0.1, color: '#8BD46E' } : null;
    }
    case 'served':
      return { kind: 'pop', x: e.x, y: e.y + 0.2, color: '#22B35E' };
    case 'moveWarn':
      return { kind: 'moveWarn' };
    default:
      return null;
  }
}

export class DapurScene extends Phaser.Scene {
  onFrame: (() => void) | null = null;
  readonly ready: Promise<void>;
  frameT = 0;
  alpha = 1;
  /** Highlight the station each person would use (not for computer cooks). */
  showTargets = true;

  private resolveReady!: () => void;
  private readonly sources: Map<string, HTMLCanvasElement>;
  private match: StageModel | null = null;
  private viewW = WORLD_W;
  private viewH = WORLD_H;
  private bg: Phaser.GameObjects.Image | null = null;
  private carts: [Phaser.GameObjects.Image, Phaser.GameObjects.Image] | null = null;
  private stationImgs: Phaser.GameObjects.Image[] = [];
  private cookerG = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly chefSprites = new Map<number, ChefSprite>();
  private gLow!: Phaser.GameObjects.Graphics;
  private gHigh!: Phaser.GameObjects.Graphics;
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private poolIdx = 0;
  private readonly throwAt = new Map<number, number>();
  private readonly pops: Pop[] = [];
  private moveWarnAt = Number.NEGATIVE_INFINITY;
  private readonly scratch = { x: 0, y: 0 };
  /** Looks whose heads are being rasterized (a failed one stays here so it is not retried). */
  private readonly headsPending = new Set<string>();

  constructor(sources: Map<string, HTMLCanvasElement>) {
    super({ key: 'dapur' });
    this.sources = sources;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  create(): void {
    this.addCanvases(this.sources);
    this.makePill('dp-pill-catch', STR.ready, { bg: '#111214', fg: '#FFC928', ring: '#FFC928', size: 13 });
    this.makePill('dp-pill-throw', STR.throwPill, {
      bg: '#FFC928',
      fg: '#111214',
      shadow: '#C99A12',
      size: 13,
    });
    this.makePill('dp-pill-burn', STR.nearlyBurnt, {
      bg: '#F2453D',
      fg: '#FFFFFF',
      shadow: '#B52A23',
      size: 13,
    });
    this.makePill('dp-pill-hit', STR.hitBubble, {
      bg: '#FFF7F0',
      fg: '#1B1C20',
      shadow: 'rgba(0,0,0,0.25)',
      size: 13,
      radius: 12,
    });
    this.gLow = this.add.graphics().setDepth(1);
    this.gHigh = this.add.graphics().setDepth(DEPTH_TOP);
    this.setViewSize(this.viewW, this.viewH);
    this.resolveReady();
  }

  override update(): void {
    this.onFrame?.();
    if (this.match) this.draw(this.frameT, this.alpha);
  }

  addCanvases(map: Map<string, HTMLCanvasElement>): void {
    for (const [key, canvas] of map) if (!this.textures.exists(key)) this.textures.addCanvas(key, canvas);
  }

  /** Rasterizes the heads of these looks before the round shows them (no blank heads at the start). */
  async preloadHeads(looks: readonly Look[]): Promise<void> {
    const todo = looks.filter((l) => !this.textures.exists(headKey(l, 'happy')));
    const maps = await Promise.all(todo.map((l) => loadHeads(l)));
    for (const map of maps) this.addCanvases(map);
  }

  /** Texture key of a cook's head, or BLANK_KEY while it is still rasterizing (a newcomer). */
  private headTexture(look: Look, face: GameFace): string {
    const key = headKey(look, face);
    if (this.textures.exists(key)) return key;
    const id = lookId(look);
    if (!this.headsPending.has(id)) {
      this.headsPending.add(id);
      loadHeads(look).then(
        (map) => {
          this.addCanvases(map);
          this.headsPending.delete(id);
        },
        // A failed head stays pending so it is not retried every frame; the blank stand-in remains.
        () => undefined,
      );
    }
    return BLANK_KEY;
  }

  private makePill(key: string, text: string, opts: Parameters<typeof pillCanvas>[1]): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, pillCanvas(text, opts));
  }

  /** The carry bubble behind a held item: a cream disc with a ring in the cook's colour. */
  private makeDisc(key: string, ring: string): void {
    const s = 36 * TEX;
    const canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s + 2 * TEX;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2 + 2 * TEX, s / 2 - TEX, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF7F0';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - TEX, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ring;
      ctx.lineWidth = 3 * TEX;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - 2.5 * TEX, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.textures.addCanvas(key, canvas);
  }

  /* ------------------------------------------------------------------ setup */

  setup(match: StageModel): void {
    this.match = match;
    for (const img of this.stationImgs) img.destroy();
    this.stationImgs = [];
    for (const g of this.cookerG.values()) g.destroy();
    this.cookerG.clear();
    this.bg?.destroy();
    this.bg = null;
    if (this.carts) for (const c of this.carts) c.destroy();
    this.carts = null;
    const k = match.def.id;
    const pad = BACKDROP_PAD;
    this.bg = this.add
      .image(KX - pad, KY - pad, backdropKey(k))
      .setOrigin(0, 0)
      .setScale(1 / TEX)
      .setDepth(0);
    if (match.def.carts) {
      this.carts = [
        this.add
          .image(KX - pad, KY - pad, cartKey(k, 0))
          .setOrigin(0, 0)
          .setScale(1 / TEX)
          .setDepth(0.5),
        this.add
          .image(KX + 8 * TILE_W - pad, KY - pad, cartKey(k, 1))
          .setOrigin(0, 0)
          .setScale(1 / TEX)
          .setDepth(0.5),
      ];
    }
    for (const s of match.stations) {
      const img = this.add
        .image(0, 0, stationKey(s.kind, s.kind === 'basket' ? s.source : null))
        .setOrigin(0, 0)
        .setScale(1 / TEX);
      this.stationImgs[s.id] = img;
      if (heatSpot(s.kind)) this.cookerG.set(s.id, this.add.graphics());
    }
    for (const sp of this.chefSprites.values()) this.destroyChef(sp);
    this.chefSprites.clear();
  }

  setViewSize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    const cam = this.cameras?.main;
    if (!cam) return;
    cam.setSize(w * RENDER_SCALE, h * RENDER_SCALE);
    cam.setZoom(RENDER_SCALE);
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
  }

  /** Stage px of world (0, 0): HUD elements add this to world coordinates. */
  worldOrigin(out: { x: number; y: number }): { x: number; y: number } {
    out.x = (this.viewW - WORLD_W) / 2;
    out.y = (this.viewH - WORLD_H) / 2;
    return out;
  }

  /* ------------------------------------------------------------------ mapping */

  private shift(side: Side, t: number): number {
    const m = this.match;
    if (!m?.def.carts) return 0;
    const g = m.gap(t) * 40;
    return side === 0 ? -g : g;
  }

  /** World px of a logic point (tile x, feet y). */
  toWorld(x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
    out.x = KX + x * TILE_W + this.shift(sideOfX(x), this.frameT);
    out.y = KY + feetY(y);
    return out;
  }

  private stationLeft(s: StageStation, t: number): number {
    return KX + s.x * TILE_W + this.shift(sideOfX(s.x + s.w / 2), t);
  }

  private stationTop(s: StageStation): number {
    return KY + rowTop(s.y);
  }

  /**
   * Where the practice arrow points (world px, like the HUD) for a station or a cook: the tip just
   * above it pointing down, or just below it pointing up when there is no room above (the top row,
   * under the order bar). False when the target is gone.
   */
  anchorOf(
    target: { kind: 'station' | 'chef'; id: number },
    out: { x: number; y: number; up: boolean },
  ): boolean {
    const m = this.match;
    if (!m) return false;
    if (target.kind === 'station') {
      const s = m.stations[target.id];
      if (!s) return false;
      const top = this.stationTop(s);
      out.x = this.stationLeft(s, this.frameT) + (s.w * TILE_W) / 2;
      out.up = s.y === 0;
      out.y = out.up ? top + ST_H - ST_MARGIN + 6 : top - ST_MARGIN + 4;
      return true;
    }
    const c = m.chef(target.id);
    if (!c) return false;
    const p = this.toWorld(c.x, c.y, this.scratch);
    out.x = p.x;
    out.up = p.y - CHEF_TOP < KY + 20;
    out.y = out.up ? p.y + 8 : p.y - CHEF_TOP;
    return true;
  }

  /* ------------------------------------------------------------------ events */

  /** Plays a scene effect at time t (see `markOf`). */
  mark(mk: StageMark, t: number): void {
    switch (mk.kind) {
      case 'pop':
        this.pop(mk.x, mk.y, mk.color, t);
        return;
      case 'throw':
        this.throwAt.set(mk.id, t);
        return;
      case 'moveWarn':
        this.moveWarnAt = t;
        return;
    }
  }

  private pop(x: number, y: number, color: string, t: number): void {
    if (this.pops.length > 24) this.pops.shift();
    this.pops.push({ x, y, t0: t, color: hex(color) });
  }

  /* ------------------------------------------------------------------ pool */

  private img(key: string, x: number, y: number, size: number, depth: number): Phaser.GameObjects.Image {
    let im = this.pool[this.poolIdx];
    if (!im) {
      im = this.add.image(0, 0, key);
      this.pool.push(im);
    }
    this.poolIdx++;
    if (im.texture.key !== key) im.setTexture(key);
    im.setVisible(true)
      .setPosition(x, y)
      .setDisplaySize(size, size)
      .setDepth(depth)
      .setAngle(0)
      .setAlpha(1)
      .setOrigin(0.5, 0.5);
    return im;
  }

  private pill(key: string, x: number, y: number, depth: number, alpha = 1): void {
    const im = this.img(key, x, y, 1, depth);
    const src = im.texture.getSourceImage() as { width: number; height: number };
    im.setDisplaySize(src.width / TEX, src.height / TEX).setAlpha(alpha);
  }

  /** Draw an item centred at (x, y) `size` px wide. */
  private item(it: Item, x: number, y: number, size: number, depth: number, angle = 0): void {
    switch (it.k) {
      case 'food':
        this.img(iconKey(it.food), x, y, size, depth).setAngle(angle);
        return;
      case 'extinguisher':
        this.img(iconKey('pemadam'), x, y, size, depth).setAngle(angle);
        return;
      case 'glass':
        this.img(iconKey(it.fill >= 1 ? 'soda' : 'gelas'), x, y, size, depth).setAngle(angle);
        if (it.fill > 0 && it.fill < 1) {
          // Partly filled: orange up to the level.
          const h = size * 0.6 * it.fill;
          this.gHigh.fillStyle(0xff8a2e, 0.9);
          this.gHigh.fillRect(x - size * 0.2, y + size * 0.4 - h, size * 0.4, h);
        }
        return;
      case 'plate': {
        const dish = plateDish(it.on);
        if (dish === 'burger' || dish === 'salad') {
          this.img(iconKey(dish), x, y, size, depth).setAngle(angle);
          return;
        }
        this.img(iconKey('piring'), x, y, size, depth).setAngle(angle);
        const n = it.on.length;
        for (let i = 0; i < n; i++) {
          const f = it.on[i]!;
          const a = n === 1 ? 0 : (i / n) * Math.PI * 2 - Math.PI / 2;
          const r = n === 1 ? 0 : size * 0.17;
          const s = n === 1 ? size * 0.72 : size * 0.48;
          this.img(iconKey(f), x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, s, depth + 0.01 * (i + 1));
        }
        return;
      }
    }
  }

  /* ------------------------------------------------------------------ frame */

  private draw(t: number, alpha: number): void {
    const m = this.match;
    if (!m) return;
    this.poolIdx = 0;
    this.gLow.clear();
    this.gHigh.clear();
    // Slide the carts (Gerobak Kembar on Heboh).
    if (this.carts) {
      const pad = BACKDROP_PAD;
      this.carts[0].x = KX - pad + this.shift(0, t);
      this.carts[1].x = KX + 8 * TILE_W - pad + this.shift(1, t);
    }
    for (const s of m.stations) this.drawStation(m, s, t);
    for (const f of m.floor) {
      this.toWorld(f.x, f.y, this.scratch);
      this.gLow.fillStyle(0x3c2814, 0.18);
      this.gLow.fillEllipse(this.scratch.x, this.scratch.y + 2, 30, 9);
      this.item(f.item, this.scratch.x, this.scratch.y - 10, 32, this.scratch.y - 1);
    }
    const seen = new Set<number>();
    for (const c of m.chefs) {
      seen.add(c.id);
      this.drawChef(m, c, t, alpha);
    }
    for (const [id, sp] of this.chefSprites) {
      if (seen.has(id)) continue;
      this.destroyChef(sp);
      this.chefSprites.delete(id);
    }
    for (const f of m.flights) this.drawFlight(m, f, t);
    this.drawPops(t);
    this.drawMoveWarning(m, t);
    for (let i = this.poolIdx; i < this.pool.length; i++) {
      const im = this.pool[i]!;
      if (im.visible) im.setVisible(false);
    }
  }

  private drawStation(m: StageModel, s: StageStation, t: number): void {
    const img = this.stationImgs[s.id];
    if (!img) return;
    const left = this.stationLeft(s, t);
    const top = this.stationTop(s);
    const base = top + 80;
    img.setPosition(left, top - ST_MARGIN).setDepth(base);
    const spot = contentSpot(s.kind);
    const cx = left + spot.x;
    const cy = top + spot.y;
    const g = this.cookerG.get(s.id);
    if (g) this.drawCooker(m, s, g, left, top, base, t);
    if (s.kind === 'rack') {
      const n = Math.min(6, s.plates);
      for (let i = 0; i < n; i++) {
        const im = this.img(iconKey('piring'), left + 40, top + 38 - i * 6, 46, base + 0.5 + i * 0.01);
        im.setDisplaySize(48, 17);
      }
    }
    if (s.kind === 'sink' && s.dirty > 0) {
      const n = Math.min(3, s.dirty);
      for (let i = 0; i < n; i++) {
        const im = this.img(iconKey('piring'), left + 40, top + 36 - i * 5, 40, base + 0.5 + i * 0.01);
        im.setDisplaySize(40, 15).setAlpha(0.95);
      }
      // Grubby dots on the top plate.
      this.gHigh.fillStyle(0x9a6232, 0.8);
      this.gHigh.fillCircle(left + 34, top + 36 - (n - 1) * 5, 2.4);
      this.gHigh.fillCircle(left + 46, top + 37 - (n - 1) * 5, 1.8);
      this.badge(s.dirty, left + 76, top - 2, base + 0.6);
    }
    if (s.item) {
      const size = s.kind === 'counter' && s.item.k === 'extinguisher' ? 40 : spot.size;
      this.item(s.item, cx, cy, size, base + 0.5);
    }
    if (s.pot.length > 0) {
      s.pot.forEach((f, i) => {
        this.img(iconKey(f), cx + (i ? 8 : -8), cy + (i ? 3 : -2), 26, base + 0.5 + i * 0.01);
      });
    }
    // Chop progress.
    if (s.kind === 'board' && s.item?.k === 'food' && (s.item.chop ?? 0) > 0)
      this.ring(left + 40, top - 20, s.item.chop ?? 0, 'work');
    // Washing at the sink.
    if (s.kind === 'sink') {
      for (const c of m.chefs) {
        if (c.target !== s.id || (c.busy !== 'wash' && c.busy !== 'clean')) continue;
        const full = c.busy === 'wash' ? WASH_MS : CLEAN_MS;
        this.ring(left + 40, top - 20, c.jobMs / full, 'wash');
      }
    }
    if (s.fire) this.drawFire(s, left, top, base, t);
  }

  private drawCooker(
    m: StageModel,
    s: StageStation,
    g: Phaser.GameObjects.Graphics,
    left: number,
    top: number,
    base: number,
    t: number,
  ): void {
    g.clear();
    g.setDepth(base + 0.3);
    const level = m.heatLevel(s);
    const hot = level > 0 && level < 2 && !s.fire;
    const burn = m.tuning.burnMs;
    const warnFrom = burn === null ? 2 : 1 + (burn - WARN_MS) / burn;
    const warn = hot && level >= warnFrom;
    const heat = heatSpot(s.kind);
    if (heat && hot) {
      const hx = left + heat.x;
      const hy = top + heat.y;
      if (heat.look === 'flame') {
        // Flame tongues peeking out under the front rim of the pan.
        for (let i = 0; i < 7; i++) {
          const a = (Math.PI * (i + 0.5)) / 7;
          const k = 0.7 + 0.3 * Math.sin(t / 55 + i * 1.7 + s.id);
          const fx = hx - Math.cos(a) * heat.rx * 0.92;
          const fy = hy + Math.sin(a) * heat.ry + 3;
          g.fillStyle(warn ? 0xf2453d : i % 2 ? 0xff5a1f : 0xffc928, 1);
          g.fillEllipse(fx, fy - 4 * k, 6, 11 * k);
        }
      } else {
        // Oil bubbles rising and popping.
        for (let i = 0; i < 5; i++) {
          const f = (t / 700 + i / 5) % 1;
          const bx = hx - heat.rx * 0.7 + ((i * 37) % 10) * heat.rx * 0.14;
          const by = hy - heat.ry * 0.4 + ((i * 13) % 7) * heat.ry * 0.12;
          g.fillStyle(0xfff3c4, 0.9 * (1 - f));
          g.fillCircle(bx, by, 1.5 + f * 3);
        }
      }
    }
    if (level > 0 && level < 1) {
      this.ring(left + 40, top - 22, level, 'cook');
    } else if (warn) {
      const p = (level - warnFrom) / (2 - warnFrom);
      this.ring(left + 40, top - 22, 1 - p, 'burn');
      this.smoke(left + 50, top + 4, t, 0x5a5d66);
      if (Math.floor(t / 400) % 2 === 0 || p < 0.5)
        this.pill('dp-pill-burn', left + 40, top - 54, DEPTH_TOP + 1);
    } else if (level >= 1 && level < 2) {
      // Done: a green tick so the team sees it is ready.
      this.ring(left + 40, top - 22, 1, 'done');
    }
  }

  private drawFire(s: StageStation, left: number, top: number, base: number, t: number): void {
    const cx = left + 40;
    for (let i = 0; i < 3; i++) {
      const k = 0.85 + 0.2 * Math.sin(t / 70 + i * 2.1);
      const im = this.img(iconKey('api'), cx - 18 + i * 18, top + 14 - (i === 1 ? 8 : 0), 34 * k, base + 0.8);
      im.setOrigin(0.5, 0.8);
    }
    this.smoke(cx, top - 14, t, 0x3a3d45);
    if (s.douseMs > 0) {
      this.bar(left + 8, top - 28, s.douseMs / DOUSE_MS, 0x5aa9ff);
      // Foam.
      this.gHigh.fillStyle(0xffffff, 0.85);
      for (let i = 0; i < 5; i++) {
        const a = t / 90 + i * 1.3;
        this.gHigh.fillCircle(cx + Math.cos(a) * 18, top + 18 + Math.sin(a) * 8, 6 + (i % 3));
      }
    }
  }

  private smoke(x: number, y: number, t: number, color: number): void {
    for (let i = 0; i < 3; i++) {
      const f = (t / 1100 + i / 3) % 1;
      this.gHigh.fillStyle(color, 0.55 * (1 - f));
      this.gHigh.fillCircle(x + Math.sin(f * 5 + i) * 6 + (i - 1) * 8, y - f * 42, 6 + f * 9);
    }
  }

  /**
   * Status disc over a station (HD board): a white disc with a progress arc while cooking,
   * chopping or washing, a green tick when done, a red disc with "!" counting down before it burns.
   */
  private ring(cx: number, cy: number, p: number, state: 'cook' | 'work' | 'wash' | 'done' | 'burn'): void {
    const g = this.gHigh;
    const f = Math.max(0, Math.min(1, p));
    g.fillStyle(0x000000, 0.22);
    g.fillCircle(cx, cy + 2, 14);
    if (state === 'done') {
      g.fillStyle(0x22b35e, 1);
      g.fillCircle(cx, cy, 14);
      g.lineStyle(3.5, 0xffffff, 1);
      g.beginPath();
      g.moveTo(cx - 6, cy);
      g.lineTo(cx - 2, cy + 4.5);
      g.lineTo(cx + 6.5, cy - 4.5);
      g.strokePath();
      return;
    }
    const burn = state === 'burn';
    g.fillStyle(burn ? 0xf2453d : 0xffffff, 1);
    g.fillCircle(cx, cy, 14);
    g.lineStyle(4, burn ? 0xb3261e : 0xe2e4e8, 1);
    g.strokeCircle(cx, cy, 10);
    if (f > 0.01) {
      const color = burn ? 0xffffff : state === 'wash' ? 0x2f8cff : state === 'work' ? 0xff8a2e : 0x22b35e;
      g.lineStyle(4, color, 1);
      g.beginPath();
      g.arc(cx, cy, 10, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false);
      g.strokePath();
    }
    if (burn) {
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(cx - 1.6, cy - 6, 3.2, 8, 1.6);
      g.fillCircle(cx, cy + 5, 1.8);
    }
  }

  private bar(x: number, y: number, p: number, color: number): void {
    const g = this.gHigh;
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(x - 2, y - 2, 68, 14, 7);
    g.fillStyle(0x111214, 1);
    g.fillRoundedRect(x, y, 64, 10, 5);
    const w = Math.max(0, Math.min(1, p)) * 64;
    if (w > 1) {
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, y, Math.max(w, 6), 10, Math.min(5, w / 2));
    }
  }

  private badge(n: number, x: number, y: number, depth: number): void {
    const key = `dp-badge-${n}`;
    if (!this.textures.exists(key))
      this.textures.addCanvas(
        key,
        pillCanvas(String(n), { bg: '#F2453D', fg: '#FFFFFF', size: 12, padX: 6 }),
      );
    this.pill(key, x, y, depth);
  }

  /* ------------------------------------------------------------------ chefs */

  private chefSprite(c: StageChef): ChefSprite {
    const sp = this.chefSprites.get(c.id);
    if (sp) return sp;
    const part = (key: string) =>
      this.add
        .image(-32, -80, key)
        .setOrigin(0, 0)
        .setScale(1 / TEX);
    const legs = part('dp-legs');
    const shirt = part('dp-shirt');
    const apron = part('dp-apron');
    const head = part(BLANK_KEY);
    const hat = part('dp-hat');
    const hand = () => this.add.image(0, 0, 'dp-hand').setScale(1 / TEX);
    const handL = hand();
    const handR = hand();
    const stains: Phaser.GameObjects.Image[] = [];
    const body = this.add.container(0, 0, [shirt, handL, handR, apron, head, hat]);
    const root = this.add.container(0, 0, [legs, body]);
    const created: ChefSprite = {
      id: c.id,
      root,
      body,
      legs,
      shirt,
      handL,
      handR,
      apron,
      stains,
      head,
      hat,
      tag: this.add.image(0, 0, '__DEFAULT').setDepth(DEPTH_TAGS),
      tagKey: '',
      headKey: BLANK_KEY,
      look: '',
      flip: 1,
      stainCount: -1,
    };
    this.chefSprites.set(c.id, created);
    return created;
  }

  private destroyChef(sp: ChefSprite): void {
    sp.root.destroy();
    sp.tag.destroy();
  }

  private drawChef(m: StageModel, c: StageChef, t: number, alpha: number): void {
    const sp = this.chefSprite(c);
    const x = c.prevX + (c.x - c.prevX) * alpha;
    const y = c.prevY + (c.y - c.prevY) * alpha;
    const p = this.toWorld(x, y, this.scratch);
    const wx = p.x;
    const wy = p.y;
    sp.root.setPosition(wx, wy).setDepth(wy);
    // Colours and look (a restyled computer cook can change them).
    sp.shirt.setTint(hex(c.color));
    const look = lookId(c.look);
    if (sp.look !== look) {
      sp.look = look;
      const hand = hex(skinColor(c.look));
      sp.handL.setTint(hand);
      sp.handR.setTint(hand);
    }
    const staggered = m.staggered(c);
    const face: GameFace = staggered ? 'wow' : c.busy ? 'effort' : 'happy';
    const headTex = this.headTexture(c.look, face);
    if (sp.headKey !== headTex) {
      sp.headKey = headTex;
      sp.head.setTexture(headTex);
    }
    if (Math.abs(c.faceX) > 0.25) sp.flip = c.faceX < 0 ? -1 : 1;
    sp.root.scaleX = sp.flip;
    // Walk bob, work jiggle, stagger wobble.
    const step = c.moving ? Math.sin(c.walked * Math.PI * 2.2) : 0;
    sp.body.y = c.moving ? -Math.abs(step) * 2.5 : 0;
    sp.legs.scaleY = (1 / TEX) * (c.moving ? 1 - Math.abs(step) * 0.06 : 1);
    sp.root.rotation = staggered ? Math.sin(t / 45) * 0.16 : 0;
    const holding = !!c.held;
    const jig = c.busy ? Math.sin(t / 38) * 3 : 0;
    // Hands: at the sides, or both forward around the held item.
    if (holding) {
      sp.handL.setPosition(14, -27 + jig * 0.3);
      sp.handR.setPosition(26, -24);
    } else {
      sp.handL.setPosition(-18, -22 + jig);
      sp.handR.setPosition(18, -22 - jig);
    }
    this.syncStains(sp, c.stains);
    // Name tag in the player's colour.
    const tagKey = `dp-tag-${c.id}-${c.color}-${c.name}`;
    if (sp.tagKey !== tagKey) {
      if (!this.textures.exists(tagKey))
        this.textures.addCanvas(
          tagKey,
          pillCanvas(c.name, { bg: c.color, fg: '#111214', size: 12, padX: 9 }),
        );
      sp.tag.setTexture(tagKey);
      const src = sp.tag.texture.getSourceImage() as { width: number; height: number };
      sp.tag.setDisplaySize(src.width / TEX, src.height / TEX);
      sp.tagKey = tagKey;
    }
    sp.tag.setPosition(wx, wy - 96 + sp.body.y);
    // Held item in front, on the side the cook faces.
    if (c.held) {
      const hx = wx + 22 * sp.flip;
      const hy = wy - 30 + sp.body.y;
      // Carry bubble ringed in the cook's colour, so everyone sees whose hands are full.
      const disc = `dp-disc-${c.color}`;
      if (!this.textures.exists(disc)) this.makeDisc(disc, c.color);
      this.img(disc, hx, hy, 38, wy + 0.2);
      this.item(c.held, hx, hy, 28, wy + 0.3);
    }
    // Filling soda: a little bar over the head.
    if (c.busy === 'fill' && c.held?.k === 'glass') {
      const over = (c.held.over ?? 0) > 0;
      this.bar(wx - 32, wy - 124, c.held.fill, over ? 0xf2453d : 0xff8a2e);
    }
    // Target highlight (people only): an outline in the cook's colour plus a small arrow.
    if (this.showTargets && !c.cpu && !c.pilot && c.target !== null && m.phase === 'play') {
      const s = m.stations[c.target];
      if (s) this.drawTarget(s, c, t);
    }
    // Throw pill and hit bubble.
    const thrown = this.throwAt.get(c.id);
    if (thrown !== undefined && t - thrown < THROW_PILL_MS)
      this.pill('dp-pill-throw', wx, wy - 118, DEPTH_TAGS + 1);
    if (t - c.hitAt < HIT_BUBBLE_MS) this.pill('dp-pill-hit', wx + 34, wy - 122, DEPTH_TAGS + 2);
  }

  /**
   * The station a person's cook will use. The arrow sits above the station, or below it when the
   * cook stands right behind it (bottom row), so it never covers the cook.
   */
  private drawTarget(s: StageStation, c: StageChef, t: number): void {
    const left = this.stationLeft(s, t);
    const top = this.stationTop(s);
    const color = hex(c.color);
    const w = s.w * TILE_W - ST_INSET * 2;
    this.gHigh.lineStyle(3, color, 0.9);
    this.gHigh.strokeRoundedRect(left + ST_INSET - 1.5, top - 1.5, w + 3, 59, 11);
    const bob = Math.sin(t / 180) * 2;
    // Cook beside the station (side columns): the arrow sits on the floor next to it, pointing in,
    // so it never covers the name plate of the station above.
    const side = c.x < s.x ? -1 : c.x > s.x + s.w ? 1 : 0;
    if (side !== 0) {
      const d = -side;
      const sx = side < 0 ? left + ST_INSET - 12 - bob : left + s.w * TILE_W - ST_INSET + 12 + bob;
      const sy = top + 28;
      this.gHigh.fillStyle(0x111214, 1);
      this.gHigh.fillTriangle(sx - 9 * d, sy - 11, sx - 9 * d, sy + 11, sx + 6 * d, sy);
      this.gHigh.fillStyle(color, 1);
      this.gHigh.fillTriangle(sx - 7 * d, sy - 8, sx - 7 * d, sy + 8, sx + 3 * d, sy);
      return;
    }
    const ax = left + (s.w * TILE_W) / 2;
    const below = c.y < s.y && c.x >= s.x && c.x <= s.x + s.w;
    const tall = s.kind === 'soda' ? 50 : s.kind === 'basket' ? 30 : 12;
    const ay = below ? top + 88 + bob : top - tall - bob;
    const dir = below ? -1 : 1;
    this.gHigh.fillStyle(0x111214, 1);
    this.gHigh.fillTriangle(ax - 11, ay - 9 * dir, ax + 11, ay - 9 * dir, ax, ay + 6 * dir);
    this.gHigh.fillStyle(color, 1);
    this.gHigh.fillTriangle(ax - 8, ay - 7 * dir, ax + 8, ay - 7 * dir, ax, ay + 3 * dir);
  }

  private syncStains(sp: ChefSprite, stains: Chef['stains']): void {
    if (sp.stainCount === stains.length) return;
    sp.stainCount = stains.length;
    while (sp.stains.length < stains.length) {
      const im = this.add.image(0, 0, stainKey('tomat')).setScale(1 / TEX);
      sp.body.addAt(im, sp.body.getIndex(sp.apron) + 1);
      sp.stains.push(im);
    }
    sp.stains.forEach((im, i) => {
      const s = stains[i];
      if (!s) {
        im.setVisible(false);
        return;
      }
      im.setVisible(true).setTexture(stainKey(s.kind as StainKind));
      im.setPosition(s.u * 9, -20 + s.v * 6).setScale((1.25 / TEX) * s.s);
    });
  }

  /* ------------------------------------------------------------------ throws */

  private drawFlight(m: StageModel, f: StageFlight, t: number): void {
    const p = Math.max(0, Math.min(1, (t - f.t0) / f.dur));
    const a = this.toWorld(f.sx, f.sy, { x: 0, y: 0 });
    const b = this.toWorld(f.ex, f.ey, { x: 0, y: 0 });
    a.y -= ARC_LIFT;
    b.y -= ARC_LIFT;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const h = 70 + dist * 0.18;
    const ctrlX = (a.x + b.x) / 2;
    const ctrlY = Math.min(a.y, b.y) - h;
    const at = (u: number, out: { x: number; y: number }) => {
      const v = 1 - u;
      out.x = v * v * a.x + 2 * v * u * ctrlX + u * u * b.x;
      out.y = v * v * a.y + 2 * v * u * ctrlY + u * u * b.y;
      return out;
    };
    // Dashed path ahead of the item.
    const dots = Math.max(6, Math.round(dist / 16));
    this.gHigh.fillStyle(0xffffff, 0.9);
    const q = { x: 0, y: 0 };
    for (let i = 0; i <= dots; i++) {
      const u = i / dots;
      if (u < p) continue;
      at(u, q);
      this.gHigh.fillCircle(q.x, q.y, 2.6);
    }
    // Shadow on the floor, the catch ring under the receiver.
    const sx = a.x + (b.x - a.x) * p;
    const sy = a.y + (b.y - a.y) * p + ARC_LIFT;
    this.gLow.fillStyle(0x3c2814, 0.22);
    this.gLow.fillEllipse(sx, sy, 30, 10);
    const receiver = f.toChef === null ? undefined : m.chef(f.toChef);
    if (receiver) {
      const rp = this.toWorld(receiver.x, receiver.y, { x: 0, y: 0 });
      this.dashedEllipse(rp.x, rp.y, 40, 13, hex(f.color), (t / 900) % 1);
      this.pill('dp-pill-catch', rp.x, rp.y + 22, DEPTH_TAGS + 1);
    } else if (f.toStation !== null) {
      const s = m.stations[f.toStation];
      if (s) {
        const left = this.stationLeft(s, t);
        const top = this.stationTop(s);
        this.gHigh.lineStyle(3, hex(f.color), 0.9);
        this.gHigh.strokeRoundedRect(left + ST_INSET + 2, top + 2, s.w * TILE_W - ST_INSET * 2 - 4, 52, 10);
      }
    }
    at(p, q);
    this.item(f.item, q.x, q.y, 38, DEPTH_TOP + 2, p * 400);
  }

  private dashedEllipse(cx: number, cy: number, rx: number, ry: number, color: number, phase: number): void {
    const g = this.gLow;
    const n = 14;
    g.lineStyle(4, color, 1);
    for (let i = 0; i < n; i++) {
      const a0 = ((i + phase) / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI / n) * 1.1;
      g.beginPath();
      for (let k = 0; k <= 4; k++) {
        const a = a0 + ((a1 - a0) * k) / 4;
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  private drawPops(t: number): void {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]!;
      const f = (t - p.t0) / 420;
      if (f >= 1 || f < 0) {
        if (f >= 1) this.pops.splice(i, 1);
        continue;
      }
      const w = this.toWorld(p.x, p.y, this.scratch);
      this.gHigh.lineStyle(4 * (1 - f), p.color, 1 - f);
      this.gHigh.strokeCircle(w.x, w.y - 26, 12 + f * 30);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        this.gHigh.fillStyle(p.color, 1 - f);
        this.gHigh.fillCircle(
          w.x + Math.cos(a) * (14 + f * 34),
          w.y - 26 + Math.sin(a) * (10 + f * 24),
          3.5 * (1 - f) + 1,
        );
      }
    }
  }

  private drawMoveWarning(m: StageModel, t: number): void {
    const move = m.def.move;
    if (!move || m.moved || t - this.moveWarnAt > 8_000 || t < this.moveWarnAt) return;
    if (Math.floor(t / 250) % 2) return;
    this.gHigh.lineStyle(4, 0xf2453d, 1);
    for (const [a, b] of move.swaps) {
      for (const [x, y] of [a, b]) {
        const left = KX + x * TILE_W;
        const top = KY + rowTop(y);
        this.gHigh.strokeRoundedRect(left + ST_INSET + 3, top + 3, TILE_W - ST_INSET * 2 - 6, 50, 10);
      }
    }
  }

  /** A short flash over the whole kitchen (time up). */
  flash(): void {
    this.cameras.main.flash(260, 255, 255, 255, false);
  }

  /** Bounds of the kitchen in world px (for HUD floats). */
  static readonly KITCHEN = { x: KX, y: KY, w: KITCHEN_W, h: KITCHEN_H };
}
