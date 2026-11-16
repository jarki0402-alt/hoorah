/**
 * The Phaser world: afternoon village field, grass lanes, start line, finish ribbon and the sack
 * racers. It only renders; all rules live in logic.ts. The director calls the effect methods on
 * events and writes `beatPhase` every frame so idle racers bounce on the beat.
 * Hot paths (update, racer poses) never allocate.
 */
import type { Fruit } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import { BACKDROP_H, BACKDROP_W, KARUNG, RACER_BOX, RACER_HEAD } from '../../shared/art/karung';
import type { HopKind } from './logic';
import { STR } from './strings';
import { BACKDROP_KEY, HEAD_SIZE, headKey, RACER_PX, RENDER_SCALE, SACK_KEY, SHIRT_KEY } from './textures';

export const WORLD_W = 1280;
export const WORLD_H = 720;
/** Grass starts here (the backdrop's bottom strip is already grass). */
const FIELD_TOP = BACKDROP_H - 14;
const LANES_TOP = 322;
const LANES_BOTTOM = 704;
const MAX_SPACING = 128;
/** START and FINIS signs hang at fence height, above every lane layout. */
const BANNER_Y = FIELD_TOP - 34;
/** Racers' feet sit behind the start line at distance 0 and the sack front meets the finish line. */
export const START_X = 262;
export const FINISH_X = 1184;
/** Racer art: body centre above the feet, sack half width, in racer units. */
const BODY_MID = 80;
const SACK_HALF = 32;
const DEG = Math.PI / 180;
const HEAD_Y = RACER_HEAD.y + HEAD_SIZE / 2;

export interface RosterEntry {
  id: number;
  fruit: Fruit;
  color: string;
  connected: boolean;
  /** Distance already covered (metres), e.g. after a reconnect or a roster change. */
  dist: number;
}

type Mode = 'idle' | 'race' | 'stumble' | 'finished' | 'cheer' | 'sulk';

interface Hop {
  fromX: number;
  toX: number;
  start: number;
  dur: number;
  height: number;
  flip: boolean;
}

interface Racer {
  id: number;
  lane: number;
  fruit: Fruit;
  connected: boolean;
  scale: number;
  ground: number;
  x: number;
  root: Phaser.GameObjects.Container;
  shirt: Phaser.GameObjects.Image;
  sack: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  hop: Hop | null;
  landAt: number;
  mode: Mode;
  modeStart: number;
  modeEnd: number;
  face: Face;
  seed: number;
}

export interface LaneLayout {
  /** Lane centre y in world px, top lane first. */
  centers: number[];
  spacing: number;
}

export class KarungScene extends Phaser.Scene {
  /** Called at the start of every rendered frame (the director's tick). */
  onFrame: (() => void) | null = null;
  readonly ready: Promise<void>;
  /** 0..1 position inside the current beat (0 = on the beat), written by the director. */
  beatPhase = 0.5;
  trackLength = 50;
  hopMs = 380;

  private resolveReady!: () => void;
  private readonly images: Map<string, HTMLImageElement>;
  private racers: Racer[] = [];
  private readonly byId = new Map<number, Racer>();
  private rosterKey = '';
  private layout: LaneLayout = { centers: [], spacing: MAX_SPACING };
  private viewW = WORLD_W;
  private viewH = WORLD_H;
  private lanesG!: Phaser.GameObjects.Graphics;
  private ribbonG!: Phaser.GameObjects.Graphics;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkle!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ribbonBroken: { y: number; at: number } | null = null;
  private now = 0;

  constructor(images: Map<string, HTMLImageElement>) {
    super({ key: 'karung' });
    this.images = images;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  create(): void {
    for (const [key, img] of this.images) {
      if (!this.textures.exists(key)) this.textures.addImage(key, img);
    }
    this.makeTextures();
    this.cameras.main.setBackgroundColor(KARUNG.sky);
    this.setViewSize(this.viewW, this.viewH);

    // The backdrop, plus mirrored copies that continue it on stages wider than 16:9.
    this.add.image(0, 0, BACKDROP_KEY).setOrigin(0, 0).setDisplaySize(BACKDROP_W, BACKDROP_H).setDepth(0);
    for (const x of [-BACKDROP_W, BACKDROP_W]) {
      this.add
        .image(x, 0, BACKDROP_KEY)
        .setOrigin(0, 0)
        .setDisplaySize(BACKDROP_W, BACKDROP_H)
        .setFlipX(true)
        .setDepth(0);
    }
    const field = this.add.graphics().setDepth(1);
    field.fillStyle(Phaser.Display.Color.HexStringToColor(KARUNG.grass).color, 1);
    field.fillRect(-BACKDROP_W, FIELD_TOP, BACKDROP_W * 3, WORLD_H - FIELD_TOP + 400);

    this.lanesG = this.add.graphics().setDepth(2);
    this.ribbonG = this.add.graphics().setDepth(7);
    this.banner(STR.startBanner, 0xfff6e3, '#111214').setPosition(START_X, BANNER_Y);
    this.banner(STR.finishBanner, 0xe8352e, '#FFFFFF').setPosition(FINISH_X, BANNER_Y);

    this.dust = this.add
      .particles(0, 0, 'karung-puff', {
        lifespan: { min: 320, max: 620 },
        speed: { min: 30, max: 110 },
        angle: { min: 190, max: 350 },
        scale: { start: 0.8, end: 0.2 },
        alpha: { start: 0.85, end: 0 },
        gravityY: -20,
        tint: 0xf3e2b6,
        emitting: false,
      })
      .setDepth(200);
    this.sparkle = this.add
      .particles(0, 0, 'karung-spark', {
        lifespan: { min: 420, max: 760 },
        speed: { min: 80, max: 220 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.9, end: 0 },
        rotate: { min: 0, max: 180 },
        gravityY: 260,
        tint: [0xffc928, 0xffffff, 0xff7a1a],
        emitting: false,
      })
      .setDepth(201);

    this.drawLanes();
    this.resolveReady();
  }

  /** A cloth sign on a bamboo stake, hung at fence height above the lanes. */
  private banner(text: string, fill: number, color: string): Phaser.GameObjects.Container {
    const label = this.add
      .text(0, 1, text, {
        fontFamily: '"Baloo 2", sans-serif',
        fontStyle: '800',
        fontSize: '24px',
        color,
        resolution: RENDER_SCALE,
      })
      .setOrigin(0.5, 0.5);
    const w = Math.ceil(label.width) + 30;
    const g = this.add.graphics();
    g.fillStyle(0xc9a15a, 1);
    g.lineStyle(2, 0xa57e3c, 1);
    g.fillRect(-4, 16, 8, 40);
    g.strokeRect(-4, 16, 8, 40);
    g.fillStyle(fill, 1);
    g.lineStyle(3, 0x111214, 1);
    g.fillRoundedRect(-w / 2, -19, w, 38, 6);
    g.strokeRoundedRect(-w / 2, -19, w, 38, 6);
    return this.add.container(0, 0, [g, label]).setDepth(8);
  }

  private makeTextures(): void {
    if (this.textures.exists('karung-puff')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(12, 12, 12);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(12, 12, 9);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(12, 12, 6);
    g.generateTexture('karung-puff', 24, 24);
    g.clear();
    g.fillStyle(0xffffff, 1);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 4.5 : 11;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      pts.push(new Phaser.Math.Vector2(12 + Math.cos(a) * r, 12 + Math.sin(a) * r));
    }
    g.fillPoints(pts, true);
    g.generateTexture('karung-spark', 24, 24);
    g.clear();
    g.fillStyle(0x3a2a10, 0.22);
    g.fillEllipse(60, 12, 120, 24);
    g.generateTexture('karung-shadow', 120, 24);
    g.destroy();
  }

  /* ------------------------------------------------------------------ layout */

  private computeLayout(n: number): LaneLayout {
    const lanes = Math.max(2, n);
    const spacing = Math.min(MAX_SPACING, (LANES_BOTTOM - LANES_TOP) / lanes);
    const top = LANES_TOP + (LANES_BOTTOM - LANES_TOP - spacing * lanes) / 2;
    const centers: number[] = [];
    for (let i = 0; i < lanes; i++) centers.push(top + spacing * (i + 0.5));
    return { centers, spacing };
  }

  get lanes(): LaneLayout {
    return this.layout;
  }

  /** World x of a racer's feet at `dist` metres. */
  xAt(dist: number, scale: number): number {
    const d = Math.min(dist, this.trackLength + 1.6);
    return START_X - SACK_HALF * scale + (d / this.trackLength) * (FINISH_X - START_X);
  }

  private drawLanes(): void {
    const g = this.lanesG;
    g.clear();
    const { centers, spacing } = this.layout;
    const top = (centers[0] ?? LANES_TOP) - spacing / 2;
    const bottom = (centers[centers.length - 1] ?? LANES_BOTTOM) + spacing / 2;
    const x0 = -BACKDROP_W;
    const w = BACKDROP_W * 3;
    const light = Phaser.Display.Color.HexStringToColor(KARUNG.grassLight).color;
    const dark = Phaser.Display.Color.HexStringToColor(KARUNG.grassDark).color;
    // Mown stripes, one per lane.
    centers.forEach((c, i) => {
      g.fillStyle(i % 2 ? light : dark, i % 2 ? 1 : 0.55);
      g.fillRect(x0, c - spacing / 2, w, spacing);
    });
    // Chalk lane lines.
    g.fillStyle(0xfffdf4, 0.9);
    for (let i = 0; i <= centers.length; i++) g.fillRect(x0, top + i * spacing - 1.5, w, 3);
    // Ten-metre ticks on every lane line.
    g.fillStyle(0xfffdf4, 0.65);
    for (let m = 10; m < this.trackLength; m += 10) {
      const x = START_X + (m / this.trackLength) * (FINISH_X - START_X);
      for (let i = 0; i <= centers.length; i++) g.fillRect(x - 1.5, top + i * spacing - 6, 3, 12);
    }
    // Start line and the wide finish line.
    g.fillStyle(0xfffdf4, 1);
    g.fillRect(START_X - 3, top - 4, 6, bottom - top + 8);
    g.fillRect(FINISH_X - 4, top - 4, 8, bottom - top + 8);
    this.drawRibbon();
  }

  /** Red-white ribbon between two bamboo poles; it hangs in two halves once someone breaks it. */
  private drawRibbon(): void {
    const g = this.ribbonG;
    g.clear();
    const { centers, spacing } = this.layout;
    const top = (centers[0] ?? LANES_TOP) - spacing / 2 - 22;
    const bottom = (centers[centers.length - 1] ?? LANES_BOTTOM) + spacing / 2 + 6;
    const x = FINISH_X;
    const pole = (y0: number, y1: number) => {
      g.fillStyle(0xc9a15a, 1);
      g.lineStyle(2, 0xa57e3c, 1);
      g.fillRect(x - 4, y0, 8, y1 - y0);
      g.strokeRect(x - 4, y0, 8, y1 - y0);
    };
    pole(Math.min(top - 30, BANNER_Y + 16), top + 6);
    pole(bottom - 6, Math.min(WORLD_H + 20, bottom + 40));
    const seg = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
      // Quadratic curve as short dashes: red and white alternating.
      const n = 24;
      let px = ax;
      let py = ay;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        const qx = u * u * ax + 2 * u * t * cx + t * t * bx;
        const qy = u * u * ay + 2 * u * t * cy + t * t * by;
        g.lineStyle(5, i % 2 ? 0xe8352e : 0xffffff, 1);
        g.lineBetween(px, py, qx, qy);
        px = qx;
        py = qy;
      }
    };
    const br = this.ribbonBroken;
    if (!br) {
      seg(x, top, x, bottom, x, (top + bottom) / 2);
      return;
    }
    const k = Math.min(1, (this.now - br.at) / 500);
    const sway = Math.sin(this.now * 0.006) * 4 * k;
    const ease = 1 - (1 - k) * (1 - k);
    const upLen = (br.y - top) * (1 - 0.45 * ease);
    const dnLen = (bottom - br.y) * (1 - 0.45 * ease);
    seg(x, top, x + 22 * ease + sway, top + upLen, x + 30 * ease, top + upLen * 0.6);
    seg(x, bottom, x + 22 * ease - sway, bottom - dnLen, x + 30 * ease, bottom - dnLen * 0.6);
  }

  /* ------------------------------------------------------------------ roster */

  /** Racers in lane order (top lane first). Rebuilds sprites only when the field changes. */
  setRoster(entries: readonly RosterEntry[]): void {
    const key = entries.map((e) => `${e.id}:${e.fruit}:${e.color}:${e.connected ? 1 : 0}`).join(',');
    if (key === this.rosterKey) return;
    const sameField =
      this.racers.length === entries.length && entries.every((e, i) => this.racers[i]?.id === e.id);
    this.rosterKey = key;
    if (sameField) {
      entries.forEach((e, i) => {
        const r = this.racers[i]!;
        r.connected = e.connected;
        r.root.setAlpha(e.connected ? 1 : 0.45);
        r.shadow.setAlpha(e.connected ? 1 : 0.4);
      });
      return;
    }
    for (const r of this.racers) {
      r.root.destroy();
      r.shadow.destroy();
    }
    this.byId.clear();
    this.layout = this.computeLayout(entries.length);
    this.drawLanes();
    this.racers = entries.map((e, i) => this.makeRacer(e, i, entries.length));
    for (const r of this.racers) this.byId.set(r.id, r);
  }

  private makeRacer(e: RosterEntry, lane: number, count: number): Racer {
    const { centers, spacing } = this.layout;
    // Back lanes a touch smaller for depth.
    const depth = count > 1 ? lane / (count - 1) : 1;
    const scale = Math.min(0.88, (spacing * 1.85) / RACER_BOX.h) * (0.92 + 0.08 * depth);
    const ground = (centers[lane] ?? LANES_TOP) + spacing * 0.3;
    const unit = 1 / RACER_PX;
    const ox = -RACER_BOX.x / RACER_BOX.w;
    const oy = -RACER_BOX.y / RACER_BOX.h;
    const shirt = this.add
      .image(0, BODY_MID, SHIRT_KEY)
      .setOrigin(ox, oy)
      .setScale(unit)
      .setTint(Phaser.Display.Color.HexStringToColor(e.color).color);
    const sack = this.add.image(0, BODY_MID, SACK_KEY).setOrigin(ox, oy).setScale(unit);
    const head = this.add
      .image(0, BODY_MID + HEAD_Y, headKey(e.fruit, 'happy'))
      .setDisplaySize(HEAD_SIZE, HEAD_SIZE);
    const x = this.xAt(e.dist, scale);
    const root = this.add
      .container(x, ground - BODY_MID * scale, [shirt, sack, head])
      .setScale(scale)
      .setDepth(10 + lane * 2)
      .setAlpha(e.connected ? 1 : 0.45);
    const shadow = this.add
      .image(x - 8 * scale, ground + 2, 'karung-shadow')
      .setScale(scale * 0.62, scale * 0.7)
      .setDepth(5)
      .setAlpha(e.connected ? 1 : 0.4);
    return {
      id: e.id,
      lane,
      fruit: e.fruit,
      connected: e.connected,
      scale,
      ground,
      x,
      root,
      shirt,
      sack,
      head,
      shadow,
      hop: null,
      landAt: Number.NEGATIVE_INFINITY,
      mode: 'idle',
      modeStart: 0,
      modeEnd: 0,
      face: 'happy',
      seed: e.id * 1.618 + lane * 2.3,
    };
  }

  /** Stage px of a racer's head (for HUD floaters); world = stage coordinates minus origin. */
  headAnchor(id: number, out: { x: number; y: number }): { x: number; y: number } | null {
    const r = this.byId.get(id);
    if (!r) return null;
    out.x = r.root.x;
    out.y = r.root.y + (BODY_MID + HEAD_Y - HEAD_SIZE * 0.5) * r.scale;
    return out;
  }

  /* ------------------------------------------------------------------ effects */

  private setFace(r: Racer, face: Face): void {
    if (r.face === face) return;
    r.face = face;
    r.head.setTexture(headKey(r.fruit, face)).setDisplaySize(HEAD_SIZE, HEAD_SIZE);
  }

  /** New race: everyone walks back behind the start line. */
  resetRace(): void {
    this.ribbonBroken = null;
    this.drawRibbon();
    for (const r of this.racers) {
      r.hop = null;
      r.mode = 'idle';
      r.root.rotation = 0;
      this.setFace(r, 'happy');
      const to = this.xAt(0, r.scale);
      if (Math.abs(r.x - to) > 1) {
        r.hop = { fromX: r.x, toX: to, start: this.now, dur: 700, height: 0, flip: false };
      }
    }
  }

  /** The race is on. */
  go(): void {
    for (const r of this.racers) {
      if (r.mode === 'idle') r.mode = 'race';
      this.setFace(r, 'effort');
    }
  }

  hop(id: number, kind: HopKind, to: number): void {
    const r = this.byId.get(id);
    if (!r || kind === 'none' || kind === 'stumble') return;
    if (r.mode === 'stumble') r.mode = 'race';
    if (r.mode === 'idle') r.mode = 'race';
    r.root.rotation = 0;
    const height = kind === 'super' ? 70 : kind === 'long' ? 34 : 14;
    r.hop = {
      fromX: r.x,
      toX: this.xAt(to, r.scale),
      start: this.now,
      dur: kind === 'super' ? this.hopMs * 1.25 : kind === 'short' ? this.hopMs * 0.7 : this.hopMs,
      height: height * r.scale,
      flip: kind === 'super',
    };
    this.setFace(r, kind === 'super' ? 'happy' : 'effort');
    if (kind === 'super') this.sparkle.explode(10, r.x, r.ground - 40 * r.scale);
  }

  stumble(id: number, durMs: number): void {
    const r = this.byId.get(id);
    if (!r) return;
    if (r.hop) {
      r.x = r.hop.toX;
      r.hop = null;
    }
    r.mode = 'stumble';
    r.modeStart = this.now;
    r.modeEnd = this.now + durMs;
    this.setFace(r, 'wow');
    this.dust.explode(9, r.x + 30 * r.scale, r.ground);
  }

  finish(id: number, first: boolean): void {
    const r = this.byId.get(id);
    if (!r) return;
    if (first) {
      this.ribbonBroken = { y: r.ground - 50 * r.scale, at: this.now };
    }
    this.sparkle.explode(first ? 22 : 10, FINISH_X, r.ground - 50 * r.scale);
    this.setFace(r, 'happy');
    r.mode = 'finished';
    r.modeStart = this.now;
  }

  /** Race over: the winner keeps jumping, the rest look happy or sad by place. */
  raceEnd(order: readonly number[]): void {
    order.forEach((id, i) => {
      const r = this.byId.get(id);
      if (!r) return;
      r.hop = null;
      r.root.rotation = 0;
      if (i === 0) {
        r.mode = 'cheer';
        this.setFace(r, 'happy');
      } else {
        r.mode = i < 3 ? 'finished' : 'sulk';
        this.setFace(r, i < 3 ? 'happy' : 'sad');
      }
      r.modeStart = this.now;
    });
  }

  /** Photo finish: a camera flash. */
  flash(): void {
    this.cameras.main.flash(260, 255, 255, 255);
  }

  /* ------------------------------------------------------------------ frame */

  override update(time: number, _delta: number): void {
    this.now = time;
    this.onFrame?.();
    const beatSquash = Math.exp(-this.beatPhase * 7);
    for (let i = 0; i < this.racers.length; i++) this.pose(this.racers[i]!, time, beatSquash);
    if (this.ribbonBroken && time - this.ribbonBroken.at < 4000) this.drawRibbon();
  }

  private pose(r: Racer, time: number, beatSquash: number): void {
    const s = r.scale;
    let lift = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    let lie = 0;
    const hop = r.hop;
    if (hop) {
      const p = Math.min(1, (time - hop.start) / hop.dur);
      r.x = hop.fromX + (hop.toX - hop.fromX) * p;
      lift = hop.height * 4 * p * (1 - p);
      if (hop.flip) rot = p * Math.PI * 2;
      // Stretch in the air.
      sy = 1 + 0.1 * Math.sin(Math.PI * p);
      sx = 1 - 0.05 * Math.sin(Math.PI * p);
      if (p >= 1) {
        r.hop = null;
        r.landAt = time;
        if (hop.height > 0) this.dust.explode(hop.flip ? 6 : 2, r.x - 4 * s, r.ground);
      }
    } else if (r.mode === 'stumble') {
      const span = Math.max(1, r.modeEnd - r.modeStart);
      const p = (time - r.modeStart) / span;
      if (p >= 1) {
        r.mode = 'race';
        this.setFace(r, 'effort');
      } else {
        // Fall forward, lie and wriggle, then hop back up.
        const fall = p < 0.16 ? p / 0.16 : p > 0.84 ? (1 - p) / 0.16 : 1;
        const e = fall * fall * (3 - 2 * fall);
        lie = e;
        rot = e * 92 * DEG + (fall >= 1 ? Math.sin(time * 0.03 + r.seed) * 5 * DEG : 0);
        if (p > 0.4 && r.face === 'wow') this.setFace(r, 'sad');
      }
    } else if (r.mode === 'cheer') {
      const t = (time - r.modeStart) / 420;
      lift = Math.abs(Math.sin(t * Math.PI)) * 34 * s;
    } else if (r.mode === 'finished') {
      const t = (time - r.modeStart) / 520;
      lift = Math.abs(Math.sin(t * Math.PI)) * 10 * s;
    } else {
      // Bounce on the beat while waiting for the next tap.
      sy = 1 - 0.07 * beatSquash;
      sx = 1 + 0.04 * beatSquash;
    }
    const since = time - r.landAt;
    if (since < 150) {
      const k = 1 - since / 150;
      sy *= 1 - 0.14 * k;
      sx *= 1 + 0.08 * k;
    }
    const root = r.root;
    root.x = r.x + lie * 34 * s;
    // Body centre: BODY_MID above the feet standing, the sack's half width above the grass lying.
    root.y = r.ground - lift - (BODY_MID * (1 - lie) + (SACK_HALF + 4) * lie) * s * sy;
    root.rotation = rot;
    root.scaleX = s * sx;
    root.scaleY = s * sy;
    const sh = r.shadow;
    sh.x = root.x - 8 * s;
    const away = Math.max(0.45, 1 - lift / (90 * s));
    sh.scaleX = s * 0.62 * away * (1 + lie * 0.9);
    sh.scaleY = s * 0.7 * away;
  }

  /**
   * Fit the camera to a `w` x `h` stage (1280x720 on 16:9). The field sits at the bottom and the
   * track stays centred: extra height is sky, extra width shows more field to the sides.
   */
  setViewSize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    const cam = this.cameras?.main;
    if (!cam) return;
    cam.setSize(w * RENDER_SCALE, h * RENDER_SCALE);
    cam.setZoom(RENDER_SCALE);
    cam.centerOn(WORLD_W / 2, WORLD_H - h / 2);
  }

  /** Stage px of world (0, 0): HUD elements add this to world coordinates. */
  worldOrigin(out: { x: number; y: number }): { x: number; y: number } {
    out.x = (this.viewW - WORLD_W) / 2;
    out.y = this.viewH - WORLD_H;
    return out;
  }
}
