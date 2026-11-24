/**
 * Petualangan Warna's Phaser world: the backdrop of the stage's world with two silhouette bands
 * drifting at different speeds (depth), light shafts, falling leaves or floating spores and
 * fireflies; the stage layer; and everything that moves (pools, gates, doors, plates, levers,
 * wires from switches to what they open, lifts, mushrooms, helper planks, boxes, gems, player
 * characters with their colour aura and symbol badge, the goal pulse on the exits, the hint
 * pointer and path, effects). Ambient motion halves itself on a device that keeps dropping
 * frames. It only renders: rules live in world.ts.
 *
 * Coordinates: stage px. The 32×18 stage (1280×720) sits centred in the stage; taller or wider
 * screens see more cave around it. The camera zooms by RENDER_SCALE for a crisp 1.5x canvas.
 */
import { type Look, lookOfFruit, sameLook } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import { type BiomeId, Cell, COLS, foldSlot, ROWS, type Slot } from './levels';
import type { HintInfo } from './logic';
import { PALETTE } from './palette';
import {
  ARROW,
  BOX,
  BOX_HEAVY,
  badgeKey,
  CHANNEL_COLOR,
  drawBackdrop,
  drawBand,
  drawStage,
  GLOW,
  gemKey,
  HeadBank,
  LEAF,
  makeSprites,
  RENDER_SCALE,
  SHAFT,
  SLOT_COLOR,
  SPARK,
  TILE,
} from './textures';
import { TUNE, type World } from './world';

const STAGE_W = COLS * TILE;
const STAGE_H = ROWS * TILE;
const FIREFLIES = 26;
const LEAVES = 18;
const SHAFTS = 4;
const PING_S = 1.8;
/** Below this frame rate for LITE_AFTER_S seconds, ambient motion is halved. */
const LITE_FPS = 45;
const LITE_AFTER_S = 3;
/** Bands are drawn this much wider than the stage so drifting never shows an edge. */
const BAND_PAD = 80;

export interface CharLook {
  name: string;
  look: Look;
  /** Solo: the character the person is not steering right now. */
  idle: boolean;
}

interface CharView {
  cont: Phaser.GameObjects.Container;
  aura: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Image;
  face: Face;
  look: Look;
  sx: number;
  sy: number;
  wasDead: boolean;
}

interface Run {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  slot: Slot;
  ch: number;
}

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  spin: number;
  alpha: number;
}

interface Fly {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  ph: number;
}

interface Leaf {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vy: number;
  sway: number;
  spin: number;
  ph: number;
}

interface Shaft {
  img: Phaser.GameObjects.Image;
  x: number;
  ph: number;
}

export class WarnaScene extends Phaser.Scene {
  onFrame: ((deltaMs: number) => void) | null = null;
  readonly ready: Promise<void>;
  /** Top-left of the stage in stage px. */
  ox = 0;
  oy = 0;
  private resolveReady!: () => void;
  private heads!: HeadBank;
  private stageW = 1280;
  private stageH = 720;
  private bg: Phaser.GameObjects.Image | null = null;
  private bgSeq = 0;
  private root!: Phaser.GameObjects.Container;
  private stageImg: Phaser.GameObjects.Image | null = null;
  private back!: Phaser.GameObjects.Graphics;
  private dyn!: Phaser.GameObjects.Graphics;
  private boxLayer!: Phaser.GameObjects.Container;
  private gemLayer!: Phaser.GameObjects.Container;
  private charLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private world: World | null = null;
  private look: (key: number) => CharLook = () => ({ name: '', look: lookOfFruit('jeruk'), idle: false });
  private chars: CharView[] = [];
  private boxes: Phaser.GameObjects.Image[] = [];
  private gems: Phaser.GameObjects.Image[] = [];
  private pools: Run[] = [];
  private gates: Run[] = [];
  private doors: Run[] = [];
  private readonly particles: Particle[] = [];
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly flies: Fly[] = [];
  private readonly leaves: Leaf[] = [];
  private readonly shafts: Shaft[] = [];
  private bands: Phaser.GameObjects.Image[] = [];
  private biome: BiomeId = 'gua';
  private stageSeq = 0;
  private time0 = 0;
  private lite = false;
  private slowFor = 0;
  private goal = false;
  private hint: HintInfo | null = null;
  /** Mushroom cell index -> scene time of its last bounce (squash). */
  private readonly caps = new Map<number, number>();
  /** Helper plank cell index -> scene time it appeared. */
  private readonly assistAt = new Map<number, number>();

  constructor() {
    super('warna');
    this.ready = new Promise((r) => {
      this.resolveReady = r;
    });
  }

  create(): void {
    makeSprites(this.textures);
    this.heads = new HeadBank(this.textures, (look) => this.headsReady(look));
    const cam = this.cameras.main;
    cam.setOrigin(0, 0);
    cam.setZoom(RENDER_SCALE);
    cam.setBackgroundColor('#0B1F26');
    this.root = this.add.container(0, 0).setDepth(10);
    this.back = this.add.graphics();
    this.dyn = this.add.graphics();
    this.boxLayer = this.add.container(0, 0);
    this.gemLayer = this.add.container(0, 0);
    this.charLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.root.add([this.back, this.gemLayer, this.dyn, this.boxLayer, this.charLayer, this.fxLayer]);
    const rnd = Phaser.Math.RND;
    for (let i = 0; i < SHAFTS; i++) {
      const img = this.add
        .image(0, 0, SHAFT)
        .setOrigin(0.5, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(3);
      this.shafts.push({ img, x: rnd.frac(), ph: rnd.frac() * 10 });
    }
    for (let i = 0; i < LEAVES; i++) {
      const img = this.add
        .image(0, 0, LEAF)
        .setDepth(6)
        .setScale(0.6 / RENDER_SCALE + rnd.frac() * 0.3);
      this.leaves.push({
        img,
        x: rnd.frac(),
        y: rnd.frac(),
        vy: 0.03 + rnd.frac() * 0.04,
        sway: 18 + rnd.frac() * 30,
        spin: (rnd.frac() - 0.5) * 3,
        ph: rnd.frac() * 10,
      });
    }
    for (let i = 0; i < FIREFLIES; i++) {
      const img = this.add
        .image(0, 0, GLOW)
        .setTint(0xffe27a)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(5);
      const size = 8 + rnd.frac() * 10;
      img.setDisplaySize(size, size);
      this.flies.push({
        img,
        x: rnd.frac(),
        y: rnd.frac(),
        ax: 20 + rnd.frac() * 60,
        ay: 14 + rnd.frac() * 40,
        fx: 0.1 + rnd.frac() * 0.25,
        fy: 0.12 + rnd.frac() * 0.3,
        ph: rnd.frac() * 10,
      });
    }
    this.time0 = performance.now();
    this.resolveReady();
  }

  override update(_time: number, delta: number): void {
    this.onFrame?.(delta);
    this.watchSpeed(delta / 1000);
    this.render();
  }

  /** Halves the ambient motion on a device that keeps dropping frames (never switches back). */
  private watchSpeed(dt: number): void {
    if (this.lite) return;
    const fps = this.game.loop.actualFps;
    this.slowFor = fps > 0 && fps < LITE_FPS ? this.slowFor + dt : 0;
    if (this.slowFor < LITE_AFTER_S) return;
    this.lite = true;
    this.leaves.forEach((l, i) => {
      l.img.setVisible(i % 2 === 0 && this.biome === 'hutan');
    });
    this.flies.forEach((f, i) => {
      f.img.setVisible(i % 2 === 0);
    });
    this.shafts.forEach((sh, i) => {
      sh.img.setVisible(i < 2);
    });
  }

  setGoal(on: boolean): void {
    this.goal = on;
  }

  setHint(h: HintInfo | null): void {
    this.hint = h;
  }

  setViewSize(w: number, h: number): void {
    this.stageW = w;
    this.stageH = h;
    this.ox = Math.round((w - STAGE_W) / 2);
    this.oy = Math.round((h - STAGE_H) / 2);
    this.root.setPosition(this.ox, this.oy);
    this.buildBackdrop();
  }

  /** Sky and the two silhouette bands of the current world, sized to the stage. */
  private buildBackdrop(): void {
    const w = this.stageW;
    const h = this.stageH;
    const seq = ++this.bgSeq;
    const key = `w-bg-${seq}`;
    drawBackdrop(this.textures, key, w, h, this.biome);
    const old = [this.bg, ...this.bands];
    this.bg = this.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScale(1 / RENDER_SCALE)
      .setDepth(0);
    this.bands = [false, true].map((near) => {
      const k = `w-band-${near ? 'n' : 'f'}-${seq}`;
      drawBand(this.textures, k, w + BAND_PAD * 2, h, this.biome, near);
      return this.add
        .image(-BAND_PAD, 0, k)
        .setOrigin(0, 0)
        .setScale(1 / RENDER_SCALE)
        .setDepth(near ? 2 : 1)
        .setAlpha(near ? 0.95 : 0.85);
    });
    for (const img of old) {
      if (!img) continue;
      const oldKey = img.texture.key;
      img.destroy();
      this.textures.remove(oldKey);
    }
    const pal = PALETTE[this.biome];
    for (const f of this.flies) f.img.setTint(pal.mote);
    const forest = this.biome === 'hutan';
    this.leaves.forEach((l, i) => {
      l.img.setVisible(forest && (!this.lite || i % 2 === 0));
      l.img.setTint(i % 3 === 0 ? 0xffc928 : i % 3 === 1 ? 0x9bdb5c : 0x5fae3a);
    });
    for (const sh of this.shafts) sh.img.setTint(forest ? 0xfff0be : 0xe8fff9);
  }

  /** Builds the sprites of a fresh stage. */
  attach(world: World, look: (key: number) => CharLook): void {
    this.world = world;
    this.look = look;
    const lv = world.level;
    this.caps.clear();
    this.assistAt.clear();
    if (lv.biome !== this.biome) {
      this.biome = lv.biome;
      this.buildBackdrop();
    }
    const key = `w-stage-${++this.stageSeq}`;
    drawStage(this.textures, key, lv, world.colors);
    const old = this.stageImg;
    this.stageImg = this.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScale(1 / RENDER_SCALE);
    this.root.addAt(this.stageImg, 1);
    if (old) {
      const oldKey = old.texture.key;
      old.destroy();
      this.textures.remove(oldKey);
    }
    for (const c of this.chars) c.cont.destroy();
    for (const b of this.boxes) b.destroy();
    for (const g of this.gems) g.destroy();
    for (const p of this.particles) this.recycle(p.img);
    this.particles.length = 0;
    this.chars = world.chars.map((c) => this.makeChar(c.key, c.slot));
    this.boxes = world.boxes.map((b) =>
      this.add
        .image(0, 0, b.heavy ? BOX_HEAVY : BOX)
        .setOrigin(0, 0)
        .setDisplaySize(b.w * TILE, b.h * TILE),
    );
    this.boxLayer.add(this.boxes);
    this.gems = world.gems.map((g) =>
      this.add.image(g.x * TILE + TILE / 2, g.y * TILE + TILE / 2, gemKey(g.slot)).setScale(1 / RENDER_SCALE),
    );
    this.gemLayer.add(this.gems);
    this.buildRuns(world);
  }

  private showFace(v: CharView): void {
    v.body.setTexture(this.heads.key(v.look, v.face));
    v.body.setDisplaySize(48, 48);
  }

  /** A look's faces finished rasterizing: swap them in for its characters. */
  private headsReady(look: Look): void {
    for (const v of this.chars) if (sameLook(v.look, look)) this.showFace(v);
  }

  private makeChar(key: number, slot: Slot): CharView {
    const look = this.look(key);
    const aura = this.add.image(0, -18, GLOW).setTint(SLOT_COLOR[slot]).setBlendMode(Phaser.BlendModes.ADD);
    aura.setDisplaySize(96, 96).setAlpha(0.55);
    const body = this.add.image(0, 2, this.heads.key(look.look, 'happy')).setOrigin(0.5, 1);
    body.setDisplaySize(48, 48);
    const badge = this.add.image(15, -40, badgeKey(slot)).setScale(1 / RENDER_SCALE);
    const tag = this.add
      .text(0, -58, look.name, {
        fontFamily: '"Baloo 2", sans-serif',
        fontStyle: '800',
        fontSize: '15px',
        color: '#FFFFFF',
        stroke: '#0B1F26',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setResolution(RENDER_SCALE);
    const arrow = this.add
      .image(0, -82, ARROW)
      .setScale(1 / RENDER_SCALE)
      .setTint(SLOT_COLOR[slot])
      .setVisible(false);
    const cont = this.add.container(0, 0, [aura, body, badge, tag, arrow]);
    this.charLayer.add(cont);
    return {
      cont,
      aura,
      body,
      badge,
      tag,
      arrow,
      face: 'happy',
      look: look.look,
      sx: 1,
      sy: 1,
      wasDead: false,
    };
  }

  private buildRuns(world: World): void {
    const lv = world.level;
    this.pools = [];
    this.gates = [];
    this.doors = [];
    for (let y = 0; y < ROWS; y++) {
      let x = 0;
      while (x < COLS) {
        const i = y * COLS + x;
        if (lv.cells[i] !== Cell.Pool) {
          x++;
          continue;
        }
        const slot = foldSlot(lv.meta[i]!, world.colors);
        let x1 = x;
        while (
          x1 + 1 < COLS &&
          lv.cells[i + x1 + 1 - x] === Cell.Pool &&
          foldSlot(lv.meta[i + x1 + 1 - x]!, world.colors) === slot
        )
          x1++;
        this.pools.push({ x0: x, x1, y0: y, y1: y, slot, ch: 0 });
        x = x1 + 1;
      }
    }
    for (let x = 0; x < COLS; x++) {
      let y = 0;
      while (y < ROWS) {
        const i = y * COLS + x;
        const cell = lv.cells[i];
        if (cell !== Cell.Gate && cell !== Cell.Door) {
          y++;
          continue;
        }
        const m = lv.meta[i]!;
        let y1 = y;
        while (y1 + 1 < ROWS && lv.cells[(y1 + 1) * COLS + x] === cell && lv.meta[(y1 + 1) * COLS + x] === m)
          y1++;
        if (cell === Cell.Gate)
          this.gates.push({ x0: x, x1: x, y0: y, y1, slot: foldSlot(m, world.colors), ch: 0 });
        else this.doors.push({ x0: x, x1: x, y0: y, y1, slot: 0, ch: m });
        y = y1 + 1;
      }
    }
  }

  /** Stage px of a world point. */
  toStage(x: number, y: number): { x: number; y: number } {
    return { x: this.ox + x * TILE, y: this.oy + y * TILE };
  }

  /* ------------------------------------------------------------------ effects */

  private take(key: string): Phaser.GameObjects.Image {
    const img = this.pool.pop() ?? this.add.image(0, 0, key);
    img.setTexture(key).setVisible(true).setAlpha(1).setAngle(0).clearTint();
    if (!img.parentContainer) this.fxLayer.add(img);
    return img;
  }

  private recycle(img: Phaser.GameObjects.Image): void {
    img.setVisible(false);
    this.pool.push(img);
  }

  private burst(x: number, y: number, color: number, n: number, speed: number, key = SPARK, size = 12): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const img = this.take(key).setPosition(x, y).setTint(color);
      if (key === GLOW) img.setBlendMode(Phaser.BlendModes.ADD);
      else img.setBlendMode(Phaser.BlendModes.NORMAL);
      const s = size / (key === GLOW ? 128 : 24);
      img.setScale(s);
      this.particles.push({
        img,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.3,
        g: speed * 1.4,
        life: 0,
        max: 0.5 + Math.random() * 0.4,
        s0: s,
        s1: s * 0.2,
        spin: (Math.random() - 0.5) * 600,
        alpha: 1,
      });
    }
  }

  private ring(x: number, y: number, color: number, size: number): void {
    const img = this.take(GLOW).setPosition(x, y).setTint(color).setBlendMode(Phaser.BlendModes.ADD);
    const s = size / 128;
    img.setScale(s * 0.3);
    this.particles.push({
      img,
      vx: 0,
      vy: 0,
      g: 0,
      life: 0,
      max: 0.6,
      s0: s * 0.3,
      s1: s,
      spin: 0,
      alpha: 0.9,
    });
  }

  onDie(key: number, x: number, y: number): void {
    const c = this.world?.chars[key];
    if (!c) return;
    const px = x * TILE;
    const py = y * TILE;
    this.ring(px, py, SLOT_COLOR[c.slot], 120);
    this.burst(px, py, SLOT_COLOR[c.slot], 14, 260);
  }

  onRespawn(key: number): void {
    const c = this.world?.chars[key];
    if (!c) return;
    const px = (c.x + TUNE.charW / 2) * TILE;
    const py = (c.y + TUNE.charH / 2) * TILE;
    this.ring(px, py, 0xffffff, 110);
    this.burst(px, py, SLOT_COLOR[c.slot], 8, 140);
    const v = this.chars[key];
    if (v) {
      v.sx = 0.4;
      v.sy = 1.6;
    }
  }

  onGem(i: number): void {
    const g = this.world?.gems[i];
    const img = this.gems[i];
    if (!g || !img) return;
    img.setVisible(false);
    this.burst(img.x, img.y, SLOT_COLOR[g.slot], 16, 240);
    this.burst(img.x, img.y, 0xffffff, 6, 160);
    this.ring(img.x, img.y, SLOT_COLOR[g.slot], 100);
  }

  onCheckpoint(x: number, y: number): void {
    this.burst(x * TILE + 26, y * TILE + 10, 0xffe27a, 12, 200);
  }

  onJump(key: number): void {
    const v = this.chars[key];
    if (!v) return;
    v.sx = 0.82;
    v.sy = 1.2;
  }

  onLand(key: number, hard: boolean): void {
    const v = this.chars[key];
    const c = this.world?.chars[key];
    if (!v || !c) return;
    v.sx = hard ? 1.28 : 1.14;
    v.sy = hard ? 0.74 : 0.86;
    if (hard)
      this.burst((c.x + TUNE.charW / 2) * TILE, (c.y + TUNE.charH) * TILE, 0x9ff3e6, 6, 120, GLOW, 18);
  }

  onBounce(x: number, y: number): void {
    const cell = Math.floor(y + 0.01) * COLS + Math.floor(x);
    this.caps.set(cell, performance.now() / 1000);
    this.burst(x * TILE, y * TILE, 0xffffff, 6, 160);
  }

  onAssist(y: number, x0: number, x1: number): void {
    const now = performance.now() / 1000;
    for (let x = x0; x <= x1; x++) this.assistAt.set(y * COLS + x, now);
    this.burst(((x0 + x1 + 1) / 2) * TILE, y * TILE, 0xffe27a, 14, 180);
  }

  onClear(): void {
    const w = this.world;
    if (!w) return;
    for (const e of w.level.exits) {
      const slot = foldSlot(e.slot, w.colors);
      this.burst(e.x * TILE + TILE / 2, (e.y - 1) * TILE, SLOT_COLOR[slot], 18, 340);
      this.ring(e.x * TILE + TILE / 2, e.y * TILE, SLOT_COLOR[slot], 160);
    }
  }

  /* ------------------------------------------------------------------ frame */

  private render(): void {
    const now = (performance.now() - this.time0) / 1000;
    const dt = 1 / 60;
    this.renderFlies(now);
    this.renderAmbient(now, dt);
    const w = this.world;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        this.recycle(p.img);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.angle += p.spin * dt;
      p.img.setScale(p.s0 + (p.s1 - p.s0) * k);
      p.img.setAlpha(p.alpha * (1 - k));
    }
    if (!w) return;
    this.drawDynamic(w, now);
    w.boxes.forEach((b, i) => {
      this.boxes[i]?.setPosition(b.x * TILE, b.y * TILE);
    });
    w.gems.forEach((g, i) => {
      const img = this.gems[i];
      if (!img || g.taken) return;
      img.y = g.y * TILE + TILE / 2 + Math.sin(now * 3 + i) * 3;
      img.setAngle(Math.sin(now * 2 + i) * 6);
    });
    for (const c of w.chars) this.renderChar(c.key, now);
  }

  private renderFlies(now: number): void {
    for (const f of this.flies) {
      const x = f.x * this.stageW + Math.sin(now * f.fx + f.ph) * f.ax;
      const y = f.y * this.stageH + Math.cos(now * f.fy + f.ph * 1.3) * f.ay;
      f.img.setPosition(x, y);
      f.img.setAlpha(0.35 + 0.45 * (0.5 + 0.5 * Math.sin(now * 2.4 + f.ph * 3)));
    }
  }

  /** Depth bands drifting apart, swaying light shafts, falling leaves. */
  private renderAmbient(now: number, dt: number): void {
    const [far, near] = this.bands;
    if (!this.lite) {
      far?.setX(-BAND_PAD + Math.sin(now * 0.05) * 18);
      near?.setX(-BAND_PAD + Math.sin(now * 0.05 + 0.6) * 40);
    }
    const pal = PALETTE[this.biome];
    this.shafts.forEach((sh, i) => {
      if (!sh.img.visible) return;
      sh.img.setPosition(sh.x * this.stageW + Math.sin(now * 0.07 + sh.ph) * 40, -20);
      sh.img.setDisplaySize(140 + i * 30, this.stageH * 1.1);
      sh.img.setAngle(-12 + Math.sin(now * 0.05 + sh.ph) * 3);
      sh.img.setAlpha((this.biome === 'hutan' ? 0.12 : 0.06) * (0.6 + 0.4 * Math.sin(now * 0.4 + sh.ph)));
    });
    if (this.biome !== 'hutan' || !pal) return;
    for (const l of this.leaves) {
      if (!l.img.visible) continue;
      l.y += l.vy * dt;
      if (l.y > 1.05) {
        l.y = -0.05;
        l.x = Math.random();
      }
      l.img.setPosition(l.x * this.stageW + Math.sin(now * 0.8 + l.ph) * l.sway, l.y * this.stageH);
      l.img.setAngle(Math.sin(now * l.spin + l.ph) * 60);
    }
  }

  private renderChar(key: number, now: number): void {
    const w = this.world;
    const v = this.chars[key];
    const c = w?.chars[key];
    if (!w || !v || !c) return;
    if (c.dead) {
      v.cont.setVisible(false);
      v.wasDead = true;
      return;
    }
    v.cont.setVisible(true);
    const look = this.look(key);
    v.cont.setPosition((c.x + TUNE.charW / 2) * TILE, (c.y + TUNE.charH) * TILE);
    v.cont.setAlpha(look.idle ? 0.62 : c.active ? 1 : 0.45);
    if (v.tag.text !== look.name) v.tag.setText(look.name);
    const face: Face = !c.grounded ? 'wow' : c.inX !== 0 && Math.abs(c.vx) < 1.6 ? 'effort' : 'happy';
    if (face !== v.face || !sameLook(look.look, v.look)) {
      v.face = face;
      v.look = look.look;
      this.showFace(v);
    }
    v.sx += (1 - v.sx) * 0.2;
    v.sy += (1 - v.sy) * 0.2;
    const bob = c.grounded && Math.abs(c.vx) > 0.5 ? Math.abs(Math.sin(now * 14)) * 2.5 : 0;
    v.body.setScale((48 / v.body.width) * v.sx * (c.facing < 0 ? -1 : 1), (48 / v.body.height) * v.sy);
    v.body.y = 2 - bob;
    const glow = c.inExit ? 0.95 : 0.5 + 0.08 * Math.sin(now * 3 + key);
    v.aura.setAlpha(glow);
    v.aura.setDisplaySize(c.inExit ? 116 : 96, c.inExit ? 116 : 96);
    const ping = w.t - c.pingAt;
    if (ping >= 0 && ping < PING_S) {
      v.arrow.setVisible(true);
      v.arrow.y = -84 - Math.abs(Math.sin(ping * 8)) * 10;
      v.arrow.setAlpha(ping > PING_S - 0.3 ? (PING_S - ping) / 0.3 : 1);
    } else v.arrow.setVisible(false);
  }

  private symbol(g: Phaser.GameObjects.Graphics, slot: Slot, x: number, y: number, r: number): void {
    if (slot === 0) g.fillTriangle(x, y - r, x + r * 0.95, y + r * 0.72, x - r * 0.95, y + r * 0.72);
    else if (slot === 1) g.fillCircle(x, y, r * 0.85);
    else if (slot === 2) g.fillRect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
    else {
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
      }
      g.fillPoints(pts, true);
    }
  }

  private drawDynamic(w: World, now: number): void {
    const g = this.dyn;
    const b = this.back;
    g.clear();
    b.clear();
    const lv = w.level;
    this.drawWires(w, now);
    // Lifts.
    w.lifts.forEach((l) => {
      const x = l.def.x * TILE;
      const y = l.y * TILE;
      const width = l.def.w * TILE;
      const col = CHANNEL_COLOR[l.def.ch] ?? 0xffe27a;
      const on = w.active.get(l.def.ch) ?? false;
      b.fillStyle(col, on ? 0.22 : 0.1);
      b.fillEllipse(x + width / 2, y + 6, width + 30, 34);
      g.fillStyle(0x111214, 1);
      g.fillRoundedRect(x - 1, y - 1, width + 2, 18, 5);
      g.fillStyle(0x2a4a52, 1);
      g.fillRoundedRect(x + 1, y + 1, width - 2, 14, 4);
      g.fillStyle(col, on ? 1 : 0.55);
      g.fillRect(x + 6, y + 3, width - 12, 4);
    });
    // Pools.
    for (const p of this.pools) {
      const x0 = p.x0 * TILE;
      const x1 = (p.x1 + 1) * TILE;
      const y = p.y0 * TILE;
      const col = SLOT_COLOR[p.slot];
      b.fillStyle(col, 0.16);
      b.fillEllipse((x0 + x1) / 2, y + 10, x1 - x0 + 40, 60);
      const pts: Phaser.Types.Math.Vector2Like[] = [{ x: x0, y: y + TILE - 2 }];
      for (let x = x0; x <= x1; x += 5) {
        pts.push({ x, y: y + 12 + Math.sin(now * 3 + x * 0.09) * 2 + Math.sin(now * 1.7 + x * 0.04) * 1.5 });
      }
      pts.push({ x: x1, y: y + TILE - 2 });
      g.fillStyle(col, 0.92);
      g.fillPoints(pts, true);
      g.fillStyle(0xffffff, 0.35);
      for (let x = x0 + 6; x < x1 - 6; x += 22) {
        const yy = y + 12 + Math.sin(now * 3 + x * 0.09) * 2;
        g.fillRect(x, yy, 9, 2);
      }
      g.fillStyle(0x0b1f26, 1);
      g.fillRect(x0, y + TILE - 3, x1 - x0, 3);
      // Rising bubbles and the colour's symbol floating at the middle.
      g.fillStyle(0xffffff, 0.5);
      for (let k = 0; k < 3; k++) {
        const t = (now * 0.6 + k / 3 + p.x0 * 0.13) % 1;
        g.fillCircle(
          x0 + ((k * 37 + p.x0 * 11) % Math.max(1, x1 - x0 - 8)) + 4,
          y + TILE - 6 - t * 22,
          2.2 * (1 - t) + 0.6,
        );
      }
      const mx = (x0 + x1) / 2;
      const my = y + 2 + Math.sin(now * 2.2 + p.x0) * 2;
      g.fillStyle(0x111214, 0.85);
      g.fillCircle(mx, my, 11);
      g.fillStyle(0xffffff, 1);
      this.symbol(g, p.slot, mx, my + (p.slot === 0 ? 0.8 : 0), 6.5);
    }
    // Colour gates: shimmering bars with the symbol.
    for (const gt of this.gates) {
      const x = gt.x0 * TILE;
      const y0 = gt.y0 * TILE;
      const y1 = (gt.y1 + 1) * TILE;
      const col = SLOT_COLOR[gt.slot];
      b.fillStyle(col, 0.14);
      b.fillRect(x - 6, y0, TILE + 12, y1 - y0);
      for (let k = 0; k < 4; k++) {
        const a = 0.45 + 0.35 * Math.sin(now * 4 + k * 1.6 + gt.y0);
        g.fillStyle(col, a);
        g.fillRect(x + 5 + k * 9, y0, 4, y1 - y0);
      }
      const n = Math.max(1, Math.round((gt.y1 - gt.y0 + 1) / 2));
      for (let k = 0; k < n; k++) {
        const my = y0 + ((k + 0.5) * (y1 - y0)) / n;
        g.fillStyle(0x111214, 0.9);
        g.fillCircle(x + TILE / 2, my, 11);
        g.fillStyle(0xffffff, 1);
        this.symbol(g, gt.slot, x + TILE / 2, my + (gt.slot === 0 ? 0.8 : 0), 6.5);
      }
    }
    // Doors: stone slabs that slide up into the ceiling.
    for (const d of this.doors) {
      const open = w.doorShown.get(d.ch) ?? 0;
      const x = d.x0 * TILE;
      const y0 = d.y0 * TILE;
      const full = (d.y1 - d.y0 + 1) * TILE;
      const h = full * (1 - open);
      const col = CHANNEL_COLOR[d.ch] ?? 0xffe27a;
      g.fillStyle(0x3a3d44, 1);
      g.fillRect(x + 4, y0, TILE - 8, Math.max(6, h));
      g.fillStyle(0x8e877a, 1);
      g.fillRect(x + 7, y0, TILE - 14, Math.max(4, h - 3));
      g.fillStyle(col, 0.9);
      for (let yy = y0 + 18; yy < y0 + h - 10; yy += 46) g.fillRect(x + 12, yy, TILE - 24, 6);
      g.fillStyle(0x5b5e66, 1);
      g.fillRect(x + 4, y0 + Math.max(0, h - 4), TILE - 8, 4);
    }
    // Plates.
    lv.plates.forEach((p, i) => {
      const on = w.plateOn[i];
      const col = CHANNEL_COLOR[p.ch] ?? 0xffe27a;
      const x = p.x * TILE;
      const y = p.y * TILE + TILE - (on ? 6 : 10);
      if (on) {
        b.fillStyle(col, 0.3);
        b.fillEllipse(x + TILE / 2, y + 4, 70, 26);
      }
      g.fillStyle(0x111214, 1);
      g.fillRoundedRect(x + 4, y, TILE - 8, 8, 3);
      g.fillStyle(col, on ? 1 : 0.7);
      g.fillRoundedRect(x + 6, y + 1, TILE - 12, 5, 2);
    });
    // Levers.
    lv.levers.forEach((l, i) => {
      const on = w.leverOn[i];
      const col = CHANNEL_COLOR[l.ch] ?? 0xffe27a;
      const bx = l.x * TILE + TILE / 2;
      const by = l.y * TILE + TILE - 8;
      const a = (on ? 35 : -35) * (Math.PI / 180);
      const tx = bx + Math.sin(a) * 24;
      const ty = by - Math.cos(a) * 24;
      if (on) {
        b.fillStyle(col, 0.25);
        b.fillCircle(tx, ty, 18);
      }
      g.lineStyle(5, 0x111214, 1);
      g.lineBetween(bx, by, tx, ty);
      g.lineStyle(3, 0xc9b98f, 1);
      g.lineBetween(bx, by, tx, ty);
      g.fillStyle(0x111214, 1);
      g.fillCircle(tx, ty, 7);
      g.fillStyle(col, 1);
      g.fillCircle(tx, ty, 5);
    });
    // Checkpoint flags.
    lv.checkpoints.forEach((k, i) => {
      const lit = w.checkpointLit[i];
      const x = k.x * TILE + 21;
      const y = k.y * TILE + 5;
      const wave = Math.sin(now * 5 + i) * 3;
      g.fillStyle(lit ? 0xffe27a : 0x5b5e66, 1);
      g.fillTriangle(x, y, x + 18, y + 6 + wave * 0.5, x, y + 13);
      if (lit) {
        b.fillStyle(0xffe27a, 0.18);
        b.fillCircle(x + 6, y + 8, 22);
      }
    });
    // Exit doors: a glow and one dot per character of that colour (filled = at the door).
    const seen = new Set<number>();
    for (const e of lv.exits) {
      const slot = foldSlot(e.slot, w.colors);
      const x = e.x * TILE + TILE / 2;
      const y = (e.y - 1) * TILE;
      const cnt = w.exitCount(slot);
      const mine = w.chars.filter(
        (c) => c.slot === slot && c.inExit && Math.abs(c.x + TUNE.charW / 2 - x / TILE) < 0.6,
      );
      if (mine.length) {
        b.fillStyle(SLOT_COLOR[slot], 0.3 + 0.1 * Math.sin(now * 6));
        b.fillEllipse(x, y + TILE, 70, 100);
      }
      if (seen.has(slot) || cnt.total === 0) continue;
      seen.add(slot);
      const n = cnt.total;
      for (let k = 0; k < n; k++) {
        const dx = (k - (n - 1) / 2) * 11;
        g.fillStyle(0x111214, 1);
        g.fillCircle(x + dx, y - 12, 5);
        g.fillStyle(k < cnt.in ? SLOT_COLOR[slot] : 0x3d4047, 1);
        g.fillCircle(x + dx, y - 12, 3.5);
      }
    }
    // Heavy box: how many pushers it has of the two it needs.
    w.boxes.forEach((bx) => {
      if (!bx.heavy || bx.need < 2 || bx.pushers === 0) return;
      const cx = (bx.x + bx.w / 2) * TILE;
      const cy = bx.y * TILE - 12;
      for (let k = 0; k < bx.need; k++) {
        g.fillStyle(0x111214, 1);
        g.fillCircle(cx + (k - 0.5) * 18, cy, 7);
        g.fillStyle(k < bx.pushers ? 0xffe27a : 0x3d4047, 1);
        g.fillCircle(cx + (k - 0.5) * 18, cy, 5);
      }
    });
    // Mushroom caps (squash after a bounce).
    const tNow = performance.now() / 1000;
    for (let i = 0; i < lv.cells.length; i++) {
      if (lv.cells[i] !== Cell.Bounce) continue;
      const x = (i % COLS) * TILE + TILE / 2;
      const y = Math.floor(i / COLS) * TILE + 24;
      const k = Math.max(0, 1 - (tNow - (this.caps.get(i) ?? -9)) / 0.35);
      const sq = 1 - 0.35 * k * Math.cos((1 - k) * 9);
      const rx = 19 * (2 - sq);
      const ry = 12 * sq;
      g.fillStyle(0x8a1f1a, 1);
      g.fillEllipse(x, y + 2, rx * 2, ry * 2);
      g.fillStyle(0xf2453d, 1);
      g.fillEllipse(x, y, rx * 2, ry * 2);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(x - rx * 0.45, y - ry * 0.25, 3.2);
      g.fillCircle(x + rx * 0.3, y - ry * 0.45, 2.6);
      g.fillCircle(x + rx * 0.05, y + ry * 0.2, 2);
    }
    // Helper planks over pools (fade in).
    for (const i of w.assist) {
      const x = (i % COLS) * TILE;
      const y = Math.floor(i / COLS) * TILE;
      const a = Math.min(1, (tNow - (this.assistAt.get(i) ?? tNow - 1)) / 0.6);
      b.fillStyle(0xffe27a, 0.18 * a);
      b.fillRect(x - 2, y - 6, TILE + 4, 18);
      g.fillStyle(0x6b4423, a);
      g.fillRect(x, y + 2, TILE, 10);
      g.fillStyle(0xd9a066, a);
      g.fillRect(x, y, TILE, 8);
    }
    if (this.goal) this.drawGoal(w, now);
    if (this.hint) this.drawHint(this.hint, now);
    // Ping rings.
    for (const c of w.chars) {
      const t = w.t - c.pingAt;
      if (c.dead || t < 0 || t > 0.9) continue;
      const k = t / 0.9;
      g.lineStyle(4 * (1 - k), SLOT_COLOR[c.slot], 1 - k);
      g.strokeCircle((c.x + TUNE.charW / 2) * TILE, (c.y + TUNE.charH / 2) * TILE, 20 + k * 60);
    }
  }

  /**
   * Dashed wires from every plate and lever to what it moves (doors and lifts of its channel):
   * along the floor, then up or down. Lit and marching while the channel is on.
   */
  private drawWires(w: World, now: number): void {
    const b = this.back;
    const lv = w.level;
    const switches = [...lv.plates, ...lv.levers];
    for (const sw of switches) {
      const on = w.active.get(sw.ch) ?? false;
      const col = CHANNEL_COLOR[sw.ch] ?? 0xffe27a;
      const sx = sw.x * TILE + TILE / 2;
      const sy = sw.y * TILE + TILE - 4;
      const targets: { x: number; y: number }[] = [];
      for (const d of this.doors)
        if (d.ch === sw.ch) targets.push({ x: d.x0 * TILE + TILE / 2, y: (d.y1 + 1) * TILE - 4 });
      for (const l of w.lifts)
        if (l.def.ch === sw.ch) targets.push({ x: (l.def.x + l.def.w / 2) * TILE, y: l.y * TILE + 8 });
      let best: { x: number; y: number } | undefined;
      for (const t of targets)
        if (!best || Math.abs(t.x - sx) + Math.abs(t.y - sy) < Math.abs(best.x - sx) + Math.abs(best.y - sy))
          best = t;
      if (!best) continue;
      const pts = [
        { x: sx, y: sy },
        { x: best.x, y: sy },
        { x: best.x, y: best.y },
      ];
      if (on) {
        b.lineStyle(8, col, 0.18);
        b.beginPath();
        b.moveTo(pts[0]!.x, pts[0]!.y);
        b.lineTo(pts[1]!.x, pts[1]!.y);
        b.lineTo(pts[2]!.x, pts[2]!.y);
        b.strokePath();
      }
      b.lineStyle(3, col, on ? 1 : 0.5);
      const dash = 9;
      const gap = 7;
      let phase = on ? (now * 40) % (dash + gap) : 0;
      for (let k = 0; k < 2; k++) {
        const a = pts[k]!;
        const c = pts[k + 1]!;
        const len = Math.hypot(c.x - a.x, c.y - a.y);
        if (len < 1) continue;
        const ux = (c.x - a.x) / len;
        const uy = (c.y - a.y) / len;
        for (let t = -phase; t < len; t += dash + gap) {
          const t0 = Math.max(0, t);
          const t1 = Math.min(len, t + dash);
          if (t1 <= t0) continue;
          b.lineBetween(a.x + ux * t0, a.y + uy * t0, a.x + ux * t1, a.y + uy * t1);
        }
        phase = 0;
      }
    }
  }

  /** The stage opening: rings pulsing on every exit door, an arrow bobbing above each. */
  private drawGoal(w: World, now: number): void {
    const g = this.dyn;
    for (const e of w.level.exits) {
      const slot = foldSlot(e.slot, w.colors);
      const x = e.x * TILE + TILE / 2;
      const y = (e.y - 0.4) * TILE;
      const k = (now * 1.4) % 1;
      g.lineStyle(5 * (1 - k), SLOT_COLOR[slot], 1 - k);
      g.strokeCircle(x, y, 30 + k * 50);
      const bob = Math.abs(Math.sin(now * 5)) * 10;
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(x - 11, y - 64 - bob, x + 11, y - 64 - bob, x, y - 48 - bob);
    }
  }

  /** Hint: a ring and a bobbing arrow on the target; at level 2 also a dotted path with a ghost. */
  private drawHint(h: HintInfo, now: number): void {
    const g = this.dyn;
    const x = h.x * TILE;
    const y = h.y * TILE;
    const pulse = 0.5 + 0.5 * Math.sin(now * 6);
    g.lineStyle(5, 0xffc928, 0.6 + 0.4 * pulse);
    g.strokeCircle(x, y, 30 + pulse * 6);
    const bob = Math.abs(Math.sin(now * 5)) * 12;
    g.fillStyle(0x111214, 1);
    g.fillTriangle(x - 15, y - 78 - bob, x + 15, y - 78 - bob, x, y - 54 - bob);
    g.fillStyle(0xffc928, 1);
    g.fillTriangle(x - 11, y - 76 - bob, x + 11, y - 76 - bob, x, y - 58 - bob);
    if (h.level < 2 || !h.from) return;
    const fx = h.from.x * TILE;
    const fy = h.from.y * TILE;
    const mx = (fx + x) / 2;
    const my = Math.min(fy, y) - 90;
    const at = (t: number) => ({
      x: (1 - t) * (1 - t) * fx + 2 * (1 - t) * t * mx + t * t * x,
      y: (1 - t) * (1 - t) * fy + 2 * (1 - t) * t * my + t * t * y,
    });
    g.fillStyle(0xffffff, 0.8);
    for (let t = 0; t <= 1.001; t += 0.05) {
      const p = at(t);
      g.fillCircle(p.x, p.y, 3);
    }
    const ghost = at((now * 0.5) % 1);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(ghost.x, ghost.y, 16);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(ghost.x, ghost.y, 8);
  }
}
