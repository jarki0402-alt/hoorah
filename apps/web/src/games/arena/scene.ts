/**
 * The Phaser world. Two cameras: the main camera draws the backdrop (night garden, hedge, lawn)
 * and the twinkling fairy lights in stage px; the arena camera draws everything that moves in
 * world units, zoomed so the whole arena fits its lawn. It only renders: rules live in logic.ts.
 *
 * Performance: one texture atlas, pooled sprites per snake (outline pass, body pass, head), one
 * pooled sprite pair per seed slot. Hot paths reuse buffers and never allocate.
 */
import type { Fruit } from '@hoorah/protocol';
import { PLAYER_COLORS } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import { loadImage } from '../common/stage';
import { backdropSvg, roundedRectPoints } from './backdrop';
import { type ArenaView, BORDER, fitArena } from './layout';
import { type ArenaMatch, colorNumber, PELLET_FREE, SEED_COLORS, type Snake } from './logic';
import {
  ATLAS_KEY,
  Atlas,
  bandFrame,
  DISC_R,
  GLOW_R,
  headFrame,
  mixColor,
  RENDER_SCALE,
  SEED_R,
  seedFrame,
  segFrame,
} from './textures';

/** Stage px of dark outline around bodies and heads. */
const OUTLINE_PX = 2.2;
const MAX_SAMPLES = 460;
/** Head disc radius over body radius. */
export const HEAD_SCALE = 1.5;
const DEATH_MS = 380;
const SPAWN_MS = 320;
const RINGS = 12;

const D_OUTLINE = 0;
const D_BODY = 1;
const D_GLOW = 2;
const D_TONGUE = 3;
const D_HEADRING = 4;
const D_HEAD = 5;
const D_FRUIT = 6;

interface SnakeView {
  layer: Phaser.GameObjects.Layer;
  color: number;
  dark: number;
  seg: Phaser.Textures.Frame;
  band: Phaser.Textures.Frame;
  outline: Phaser.GameObjects.Image[];
  body: Phaser.GameObjects.Image[];
  shown: number;
  glow: Phaser.GameObjects.Image;
  tongue: Phaser.GameObjects.Image;
  headRing: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  fruit: Phaser.GameObjects.Image;
  fruitKey: string;
  live: boolean;
  dyingAt: number;
  spawnAt: number;
  bulgeAt: number;
  wowUntil: number;
  tongueAt: number;
  lean: number;
  trailAt: number;
}

interface RingFx {
  img: Phaser.GameObjects.Image;
  start: number;
  dur: number;
  r0: number;
  r1: number;
  alpha: number;
}

interface Bulb {
  img: Phaser.GameObjects.Image;
  phase: number;
  speed: number;
}

const easeOutBack = (t: number): number => {
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

export class ArenaScene extends Phaser.Scene {
  /** Called at the start of every rendered frame with the frame delta (the driver's tick). */
  onFrame: ((deltaMs: number) => void) | null = null;
  readonly ready: Promise<void>;
  /** Stage px of the arena rect and its scale (stage px per world unit). */
  view: ArenaView = { x: 0, y: 0, w: 1, h: 1, s: 1 };

  private resolveReady!: () => void;
  private readonly heads: Map<string, HTMLImageElement>;
  private atlas!: Atlas;
  private model: ArenaMatch | null = null;
  private arenaCam!: Phaser.Cameras.Scene2D.Camera;
  private stageW = 1280;
  private stageH = 720;
  private worldW = 0;
  private worldH = 0;
  private corner = 0;
  private bg: Phaser.GameObjects.Image | null = null;
  private bgKey = '';
  private bgSeq = 0;
  private bgPending: Promise<void> = Promise.resolve();
  private bulbLayer!: Phaser.GameObjects.Layer;
  private bulbs: Bulb[] = [];
  private glowLayer!: Phaser.GameObjects.Layer;
  private seedLayer!: Phaser.GameObjects.Layer;
  private snakeLayers: Phaser.GameObjects.Layer[] = [];
  private fxLayer!: Phaser.GameObjects.Layer;
  private readonly cores: Phaser.GameObjects.Image[] = [];
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly coreGen: number[] = [];
  private readonly views = new Map<number, SnakeView>();
  private readonly rings: RingFx[] = [];
  private ringIdx = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bursts!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trails!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly buf = new Float32Array(MAX_SAMPLES * 2);
  /** Fairy lights twinkle faster in the last seconds. */
  urgent = false;
  private flashUntil = 0;
  private flashColor = 0xffffff;

  constructor(heads: Map<string, HTMLImageElement>) {
    super({ key: 'arena' });
    this.heads = heads;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  create(): void {
    this.atlas = new Atlas(this.textures, this.heads);
    for (const c of SEED_COLORS) this.atlas.ensureSeed(c);
    for (const c of PLAYER_COLORS) this.atlas.ensureSnake(colorNumber(c));
    this.atlas.flush();

    const main = this.cameras.main;
    main.setBackgroundColor('#0A1A14');
    this.arenaCam = this.cameras.add(0, 0, main.width, main.height, false, 'arena');
    this.arenaCam.transparent = true;

    this.bulbLayer = this.add.layer().setDepth(-5);
    this.glowLayer = this.add.layer().setDepth(0);
    this.seedLayer = this.add.layer().setDepth(1);
    for (let i = 0; i < 16; i++) this.snakeLayers.push(this.add.layer().setDepth(10 + i));
    this.fxLayer = this.add.layer().setDepth(40);
    main.ignore([this.glowLayer, this.seedLayer, this.fxLayer, ...this.snakeLayers]);
    this.arenaCam.ignore(this.bulbLayer);

    this.sparks = this.add.particles(0, 0, ATLAS_KEY, {
      frame: 'dot',
      lifespan: { min: 240, max: 520 },
      speed: { min: 30, max: 150 },
      scale: { start: 0.42, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.bursts = this.add.particles(0, 0, ATLAS_KEY, {
      frame: 'spark',
      lifespan: { min: 450, max: 950 },
      speed: { min: 90, max: 340 },
      scale: { start: 0.62, end: 0 },
      rotate: { min: 0, max: 360 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });
    this.trails = this.add.particles(0, 0, ATLAS_KEY, {
      frame: 'dot',
      lifespan: { min: 280, max: 460 },
      speed: { min: 6, max: 34 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.75, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.fxLayer.add([this.trails, this.sparks, this.bursts]);
    for (let i = 0; i < RINGS; i++) {
      const img = this.make.image({ key: ATLAS_KEY, frame: 'ring' }, false).setVisible(false);
      this.fxLayer.add(img);
      this.rings.push({ img, start: -1, dur: 1, r0: 0, r1: 0, alpha: 1 });
    }
    this.applyView();
    this.resolveReady();
  }

  /** Start drawing a match; resolves once the backdrop for its arena is on screen. */
  attach(model: ArenaMatch): Promise<void> {
    this.model = model;
    this.syncWorld();
    return this.bgPending;
  }

  setViewSize(w: number, h: number): void {
    this.stageW = w;
    this.stageH = h;
    if (!this.arenaCam) return;
    this.applyView();
  }

  /** Stage px of a world point. */
  toStage(x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
    out.x = this.view.x + x * this.view.s;
    out.y = this.view.y + y * this.view.s;
    return out;
  }

  /* ------------------------------------------------------------------ layout */

  private syncWorld(): void {
    const m = this.model;
    if (!m) return;
    if (m.width === this.worldW && m.height === this.worldH && m.corner === this.corner) return;
    this.worldW = m.width;
    this.worldH = m.height;
    this.corner = m.corner;
    this.applyView();
  }

  private applyView(): void {
    const main = this.cameras.main;
    const cw = this.stageW * RENDER_SCALE;
    const ch = this.stageH * RENDER_SCALE;
    main.setSize(cw, ch);
    main.setZoom(RENDER_SCALE);
    main.centerOn(this.stageW / 2, this.stageH / 2);
    if (this.worldW <= 0) return;
    const v = fitArena(this.stageW, this.stageH, this.worldW, this.worldH);
    this.view = v;
    this.arenaCam.setSize(cw, ch);
    this.arenaCam.setZoom(v.s * RENDER_SCALE);
    this.arenaCam.centerOn((this.stageW / 2 - v.x) / v.s, (this.stageH / 2 - v.y) / v.s);
    this.bgPending = this.rebuildBackdrop();
    this.placeBulbs();
  }

  private async rebuildBackdrop(): Promise<void> {
    const seq = ++this.bgSeq;
    const w = Math.round(this.stageW * RENDER_SCALE);
    const h = Math.round(this.stageH * RENDER_SCALE);
    const svg = backdropSvg(this.stageW, this.stageH, this.view, this.corner, RENDER_SCALE);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    let img: HTMLImageElement;
    try {
      img = await loadImage(url, w, h);
    } catch {
      return;
    }
    if (seq !== this.bgSeq || !this.sys.isActive()) return;
    const key = `arena-bg-${seq}`;
    this.textures.addImage(key, img);
    if (!this.bg) {
      this.bg = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-10);
      this.arenaCam.ignore(this.bg);
    } else {
      this.bg.setTexture(key);
    }
    this.bg.setDisplaySize(this.stageW, this.stageH);
    if (this.bgKey && this.textures.exists(this.bgKey)) this.textures.remove(this.bgKey);
    this.bgKey = key;
  }

  /** Twinkling glows over the backdrop's fairy-light bulbs. */
  private placeBulbs(): void {
    const v = this.view;
    const inset = BORDER * 0.48;
    const corner = this.corner * v.s + inset;
    const pts = roundedRectPoints(v.x - inset, v.y - inset, v.w + 2 * inset, v.h + 2 * inset, corner, 34);
    for (let i = 0; i < pts.length; i++) {
      let b = this.bulbs[i];
      if (!b) {
        const img = this.make.image({ key: ATLAS_KEY, frame: 'glow' }, false);
        img.setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc24d);
        this.bulbLayer.add(img);
        b = { img, phase: Math.random() * Math.PI * 2, speed: 1.2 + Math.random() * 1.8 };
        this.bulbs.push(b);
      }
      const [x, y] = pts[i]!;
      b.img
        .setPosition(x, y)
        .setScale(14 / GLOW_R)
        .setVisible(true);
    }
    for (let i = pts.length; i < this.bulbs.length; i++) this.bulbs[i]!.img.setVisible(false);
  }

  /* ------------------------------------------------------------------ effects (driver calls) */

  private ring(x: number, y: number, r0: number, r1: number, color: number, dur: number, alpha = 0.9): void {
    const fx = this.rings[this.ringIdx++ % RINGS]!;
    fx.start = this.model?.now ?? 0;
    fx.dur = dur;
    fx.r0 = r0;
    fx.r1 = r1;
    fx.alpha = alpha;
    fx.img.setTint(color).setPosition(x, y).setVisible(true);
  }

  onEat(id: number, x: number, y: number, value: number, color: number): void {
    this.sparks.setParticleTint(color);
    this.sparks.explode(value >= 3 ? 7 : 2, x, y);
    const v = this.views.get(id);
    if (!v || !this.model) return;
    v.bulgeAt = this.model.now;
    if (value >= 3) v.wowUntil = this.model.now + 450;
  }

  onKo(id: number, x: number, y: number, len: number): void {
    const v = this.views.get(id);
    const color = v?.color ?? 0xffffff;
    const big = Math.min(1, len / 160);
    this.bursts.setParticleTint(color);
    this.bursts.explode(16 + Math.round(big * 18), x, y);
    this.bursts.setParticleTint(0xfff1c9);
    this.bursts.explode(8, x, y);
    this.ring(x, y, 10, 70 + big * 70, color, 520);
    this.ring(x, y, 6, 44 + big * 40, 0xffffff, 380, 0.7);
    this.arenaCam.shake(200 + big * 120, 0.0035 + big * 0.003);
    if (v && this.model) {
      v.dyingAt = this.model.now;
      v.fruitKey = '';
      this.setFace(v, this.model.snake(id)?.fruit, 'sad');
    }
  }

  onRemoved(id: number): void {
    const v = this.views.get(id);
    if (v && this.model) v.dyingAt = this.model.now;
  }

  onSpawn(id: number, x: number, y: number): void {
    const v = this.views.get(id);
    const color = v?.color ?? 0xffffff;
    this.ring(x, y, 4, 60, color, 480);
    this.sparks.setParticleTint(color);
    this.sparks.explode(10, x, y);
    if (v && this.model) {
      v.spawnAt = this.model.now;
      v.wowUntil = this.model.now + 700;
    }
  }

  onBoost(id: number): void {
    const v = this.views.get(id);
    const s = this.model?.snake(id);
    if (!v || !s) return;
    this.sparks.setParticleTint(v.color);
    this.sparks.explode(4, s.x, s.y);
  }

  /** The fairy lights flash a colour (new leader, last seconds). */
  flashLights(color: number, ms: number): void {
    this.flashColor = color;
    this.flashUntil = (this.model?.now ?? 0) + ms;
  }

  /* ------------------------------------------------------------------ frame */

  override update(_time: number, delta: number): void {
    this.onFrame?.(delta);
    const m = this.model;
    if (!m) return;
    this.syncWorld();
    const now = m.now;
    this.renderPellets(m, now);
    this.renderSnakes(m, now);
    this.renderRings(now);
    this.renderBulbs(now);
    this.atlas.flush();
  }

  private renderBulbs(now: number): void {
    const fast = this.urgent ? 3.2 : 1;
    const flashing = now < this.flashUntil;
    const t = now / 1000;
    for (const b of this.bulbs) {
      if (!b.img.visible) continue;
      const k = 0.55 + 0.45 * Math.sin(t * b.speed * fast + b.phase);
      b.img.setAlpha(0.35 + 0.5 * k);
      if (flashing) b.img.setTint(this.flashColor);
      else if (b.img.tintTopLeft !== 0xffc24d) b.img.setTint(0xffc24d);
    }
  }

  private renderRings(now: number): void {
    for (const fx of this.rings) {
      if (fx.start < 0) continue;
      const p = (now - fx.start) / fx.dur;
      if (p >= 1 || p < 0) {
        fx.start = -1;
        fx.img.setVisible(false);
        continue;
      }
      const e = 1 - (1 - p) ** 3;
      fx.img.setScale((fx.r0 + (fx.r1 - fx.r0) * e) / 27).setAlpha(fx.alpha * (1 - p));
    }
  }

  private renderPellets(m: ArenaMatch, now: number): void {
    const P = m.pellets;
    for (let i = this.cores.length; i < P.span; i++) {
      const glow = this.make.image({ key: ATLAS_KEY, frame: 'glow' }, false);
      glow.setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.glowLayer.add(glow);
      const core = this.make.image({ key: ATLAS_KEY, frame: 'disc' }, false).setVisible(false);
      this.seedLayer.add(core);
      this.glows.push(glow);
      this.cores.push(core);
      this.coreGen.push(-1);
    }
    const t = now / 1000;
    for (let i = 0; i < this.cores.length; i++) {
      const core = this.cores[i]!;
      const glow = this.glows[i]!;
      if (i >= P.span || P.kind[i] === PELLET_FREE) {
        if (core.visible) {
          core.setVisible(false);
          glow.setVisible(false);
        }
        continue;
      }
      const gen = P.gen[i]!;
      if (this.coreGen[i] !== gen) {
        this.coreGen[i] = gen;
        const color = P.color[i]!;
        this.atlas.ensureSeed(color);
        core.setFrame(seedFrame(color));
        glow.setTint(color);
        core.setVisible(true);
        glow.setVisible(true);
      }
      const r = P.r[i]!;
      const age = now - P.born[i]!;
      const pop = age < 260 ? Math.max(0.01, easeOutBack(Math.max(0, age) / 260)) : 1;
      const wave = Math.sin(t * 4.2 + i * 1.37);
      const left = P.expires[i]! - now;
      const fade = Number.isFinite(left) ? Math.min(1, Math.max(0, left / 1500)) : 1;
      const blink = left < 1500 && Math.floor(now / 120) % 2 === 0 ? 0.45 : 1;
      core.setPosition(P.x[i]!, P.y[i]!);
      core.setScale((r / SEED_R) * pop * (1 + 0.07 * wave));
      core.setAlpha(fade * blink);
      glow.setPosition(P.x[i]!, P.y[i]!);
      glow.setScale(((r * 2.7) / GLOW_R) * pop);
      glow.setAlpha((0.3 + 0.1 * wave) * fade);
    }
  }

  private makeView(s: Snake, slot: number): SnakeView | null {
    const layer = this.snakeLayers[slot];
    if (!layer) return null;
    const img = (frame: string, depth: number) => {
      const o = this.make.image({ key: ATLAS_KEY, frame }, false).setDepth(depth);
      layer.add(o);
      return o;
    };
    const glow = img('glow', D_GLOW).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    const tongue = img('tongue', D_TONGUE).setVisible(false);
    const headRing = img('disc', D_HEADRING);
    const head = img('disc', D_HEAD);
    const fruit = img(headFrame(s.fruit, 'happy'), D_FRUIT);
    const v: SnakeView = {
      layer,
      color: -1,
      dark: 0,
      seg: head.frame,
      band: head.frame,
      outline: [],
      body: [],
      shown: 0,
      glow,
      tongue,
      headRing,
      head,
      fruit,
      fruitKey: '',
      live: false,
      dyingAt: -1,
      spawnAt: Number.NEGATIVE_INFINITY,
      bulgeAt: Number.NEGATIVE_INFINITY,
      wowUntil: 0,
      tongueAt: 1500 + Math.random() * 2000,
      lean: 0,
      trailAt: 0,
    };
    this.views.set(s.id, v);
    return v;
  }

  private setColor(v: SnakeView, color: number): void {
    if (v.color === color) return;
    v.color = color;
    v.dark = mixColor(color, 0x06100b, 0.55);
    this.atlas.ensureSnake(color);
    const tex = this.textures.get(ATLAS_KEY);
    v.seg = tex.get(segFrame(color));
    v.band = tex.get(bandFrame(color));
    v.head.setFrame(v.seg);
    v.headRing.setTint(v.dark);
    v.glow.setTint(color);
    for (const o of v.outline) o.setTint(v.dark);
  }

  private setFace(v: SnakeView, fruit: Fruit | undefined, face: Face): void {
    if (!fruit) return;
    const key = headFrame(fruit, face);
    if (v.fruitKey === key) return;
    v.fruitKey = key;
    v.fruit.setFrame(key);
  }

  private grow(v: SnakeView, n: number): void {
    while (v.body.length < n) {
      const o = this.make.image({ key: ATLAS_KEY, frame: 'disc' }, false).setDepth(D_OUTLINE).setTint(v.dark);
      const b = this.make.image({ key: ATLAS_KEY, frame: v.seg.name }, false).setDepth(D_BODY);
      o.setVisible(false);
      b.setVisible(false);
      v.layer.add([o, b]);
      v.outline.push(o);
      v.body.push(b);
    }
  }

  private hideBody(v: SnakeView, from: number): void {
    for (let i = from; i < v.shown; i++) {
      v.outline[i]!.setVisible(false);
      v.body[i]!.setVisible(false);
    }
    v.shown = Math.min(v.shown, from);
  }

  private renderSnakes(m: ArenaMatch, now: number): void {
    const all = m.all;
    for (let slot = 0; slot < all.length; slot++) {
      const s = all[slot]!;
      const v = this.views.get(s.id) ?? this.makeView(s, slot);
      if (!v) continue;
      this.setColor(v, s.colorNum);
      if (s.alive && s.inMatch && !s.gone) {
        if (!v.live) {
          v.live = true;
          v.dyingAt = -1;
          v.layer.setVisible(true);
        }
        this.drawSnake(m, s, v, now);
        continue;
      }
      if (v.live && v.dyingAt >= 0) {
        const p = (now - v.dyingAt) / DEATH_MS;
        if (p < 1) {
          v.layer.setAlpha(1 - p);
          v.glow.setVisible(false);
          v.tongue.setVisible(false);
          continue;
        }
      }
      if (v.live || v.layer.visible) {
        v.live = false;
        v.dyingAt = -1;
        this.hideBody(v, 0);
        v.layer.setVisible(false);
        v.layer.setAlpha(1);
      }
    }
  }

  private drawSnake(m: ArenaMatch, s: Snake, v: SnakeView, now: number): void {
    const step = s.bodyLen > 640 ? 3 : s.bodyLen > 300 ? 2 : 1;
    const n = m.sampleBody(s, step, this.buf);
    const buf = this.buf;
    const segs = Math.max(0, n - 1);
    this.grow(v, segs);
    const r = s.radius;
    const ow = OUTLINE_PX / this.view.s;
    for (let i = 0; i < segs; i++) {
      // Tail first so every segment overlaps the one behind it.
      const k = segs - i;
      const x = buf[k * 2]!;
      const y = buf[k * 2 + 1]!;
      const taper = i < 5 ? 0.62 + i * 0.076 : 1;
      const rr = r * taper;
      const o = v.outline[i]!;
      const b = v.body[i]!;
      o.setPosition(x, y).setScale((rr + ow) / DISC_R);
      b.setPosition(x, y).setScale(rr / DISC_R);
      const band = Math.floor((k * step) / 3) % 3 === 0;
      const f = band ? v.band : v.seg;
      if (b.frame !== f) b.setFrame(f);
      if (i >= v.shown) {
        o.setVisible(true);
        b.setVisible(true);
      }
    }
    if (segs < v.shown) this.hideBody(v, segs);
    v.shown = segs;

    // Head.
    const hx = buf[0]!;
    const hy = buf[1]!;
    const sinceSpawn = now - v.spawnAt;
    const pop = sinceSpawn < SPAWN_MS ? Math.max(0.05, easeOutBack(Math.max(0, sinceSpawn) / SPAWN_MS)) : 1;
    const sinceBite = now - v.bulgeAt;
    const bulge = sinceBite < 150 ? 1 + 0.14 * (1 - sinceBite / 150) : 1;
    const hr = r * HEAD_SCALE * pop * bulge;
    v.headRing.setPosition(hx, hy).setScale((hr + ow) / DISC_R);
    v.head.setPosition(hx, hy).setScale(hr / DISC_R);
    v.lean += (s.steer * 0.24 - v.lean) * 0.16;
    v.fruit
      .setPosition(hx, hy)
      .setScale((hr * 2.3) / 128)
      .setRotation(v.lean);
    const face: Face = s.boosting ? 'effort' : now < v.wowUntil ? 'wow' : 'happy';
    this.setFace(v, s.fruit, face);

    // A quick tongue flick now and then.
    const ca = Math.cos(s.angle);
    const sa = Math.sin(s.angle);
    if (now >= v.tongueAt + 240) v.tongueAt = now + 1600 + Math.random() * 2400;
    const flick = now >= v.tongueAt && now < v.tongueAt + 240;
    v.tongue.setVisible(flick);
    if (flick) {
      const out = Math.sin(((now - v.tongueAt) / 240) * Math.PI);
      v.tongue
        .setPosition(hx + ca * hr * (0.55 + out * 0.45), hy + sa * hr * (0.55 + out * 0.45))
        .setRotation(s.angle)
        .setScale((hr * 0.85) / 27);
    }

    // Boost: a warm glow under the head and sparks off the tail.
    v.glow.setVisible(s.boosting);
    if (s.boosting) {
      v.glow
        .setPosition(hx - ca * hr * 0.4, hy - sa * hr * 0.4)
        .setScale((hr * 3.2) / GLOW_R)
        .setAlpha(0.45 + 0.15 * Math.sin(now / 45));
      if (now >= v.trailAt && segs > 0) {
        v.trailAt = now + 45;
        this.trails.setParticleTint(v.color);
        this.trails.emitParticleAt(buf[segs * 2]!, buf[segs * 2 + 1]!, 1);
        const mid = Math.max(1, segs >> 1);
        this.trails.emitParticleAt(buf[mid * 2]!, buf[mid * 2 + 1]!, 1);
      }
    }

    // Spawn protection: blink.
    const safe = m.isProtected(s);
    v.layer.setAlpha(safe ? (Math.floor(now / 110) % 2 ? 0.3 : 0.95) : 1);
  }
}
