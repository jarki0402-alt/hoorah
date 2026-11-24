/**
 * The Phaser world of Nyebrang. World units are art pixels (16 per cell); the camera zooms them
 * up with nearest-neighbour filtering so the pixel art stays crisp. It only renders: rules live
 * in logic.ts and lanes.ts. Everything is pooled: lane strips, vehicles, props and effects are
 * reused every frame, and hot paths never allocate. It draws a `StageModel`: the Host's match,
 * or on a far-away main screen the replica rebuilt from the Host's published state.
 */
import { type Look, lookOfFruit, sameLook } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import {
  COLS,
  type ItemPos,
  isLand,
  itemsAt,
  type Lane,
  type LaneKind,
  type MapId,
  trainState,
  X_MAX,
  X_MIN,
} from './lanes';
import type { DeathKind, Phase, Posed, Runner } from './logic';
import { AvatarBank, buildTextures, CELL, laneKey, propKey, textureFor } from './textures';

const colorNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16) || 0xffc928;

/** Canvas pixels per stage pixel, and stage pixels per art pixel. */
export const RENDER_SCALE = 1.5;
export const ART_SCALE = 4;
const STRIP_X = (X_MIN - 1.5) * CELL;
const STRIP_W = (X_MAX - X_MIN + 3) * CELL;
const HOP_HEIGHT = 9;
const OUTSIDE_ALPHA = 0.32;

interface RunnerView {
  shadow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  avatar: Phaser.GameObjects.Image;
  look: Look;
  face: Face;
  landAt: number;
  respawnAt: number;
  flip: boolean;
}

interface LaneSlot {
  ground: Phaser.GameObjects.TileSprite;
  face: Phaser.GameObjects.TileSprite;
}

export interface RunnerLook {
  look: Look;
  color: string;
}

/** What the scene reads of a runner. */
export interface StageRunner extends Posed {
  readonly id: number;
  readonly state: Runner['state'];
  readonly deaths: number;
  readonly deadAt: number;
  readonly deathX: number;
  readonly deathRow: number;
  readonly death: DeathKind | null;
}

/** What the scene draws: the match on the Host's screen, the replica on a far-away one. */
export interface StageModel {
  readonly map: MapId;
  /** Bottom edge row of the camera. */
  readonly cam: number;
  /** Match time (s) the lanes are drawn at. */
  readonly t: number;
  readonly phase: Phase;
  readonly world: { lane(row: number): Lane };
  readonly roster: readonly StageRunner[];
  pose(r: Posed): { x: number; row: number; lift: number };
}

/** Shown for a runner whose player info is not known yet. */
const FALLBACK_LOOK: Look = lookOfFruit('jeruk');

const height = (k: LaneKind): number => (isLand(k) ? 2 : k === 'river' ? 0 : 1);

/** Cheap stable hash for scenery placement. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export class NyebrangScene extends Phaser.Scene {
  onFrame: ((deltaMs: number) => void) | null = null;
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private avatars!: AvatarBank;
  private model: StageModel | null = null;
  private looks = new Map<number, RunnerLook>();
  private stageW = 1280;
  private stageH = 720;
  private slots: LaneSlot[] = [];
  private readonly items: Phaser.GameObjects.Image[] = [];
  private readonly itemShadows: Phaser.GameObjects.Image[] = [];
  private readonly props: Phaser.GameObjects.Image[] = [];
  private readonly signals: Phaser.GameObjects.Image[] = [];
  private readonly trains: { body: Phaser.GameObjects.TileSprite; loco: Phaser.GameObjects.Image }[] = [];
  private readonly runners = new Map<number, RunnerView>();
  private sideL!: Phaser.GameObjects.Rectangle;
  private sideR!: Phaser.GameObjects.Rectangle;
  /** Night: a dark veil with holes where the lights are (inverted bitmap mask of a light map). */
  private dark: { veil: Phaser.GameObjects.Rectangle; lights: Phaser.GameObjects.RenderTexture } | null =
    null;
  private stamp!: Phaser.GameObjects.Image;
  private splash!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars!: Phaser.GameObjects.Particles.ParticleEmitter;
  private party!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly buf: ItemPos[] = [];
  private map: MapId = 'kota';
  /** Camera bottom row (the logic's, copied each frame). */
  private camRow = 0;
  private hornFlash = { row: -1, until: 0 };

  constructor() {
    super({ key: 'nyebrang' });
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  create(): void {
    buildTextures(this.textures);
    this.avatars = new AvatarBank(this.textures, (look) => this.avatarsReady(look));
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.sideL = this.add.rectangle(0, 0, 10, 10, 0x0a0f1e, OUTSIDE_ALPHA).setOrigin(1, 0).setDepth(9000);
    this.sideR = this.add.rectangle(0, 0, 10, 10, 0x0a0f1e, OUTSIDE_ALPHA).setOrigin(0, 0).setDepth(9000);
    this.stamp = this.make.image({ key: 'ny-light' }, false);
    const particle = (tint: number[], speed: [number, number], life: [number, number], gravityY: number) =>
      this.add
        .particles(0, 0, 'ny-dot', {
          lifespan: { min: life[0], max: life[1] },
          speed: { min: speed[0], max: speed[1] },
          angle: { min: 200, max: 340 },
          gravityY,
          scale: { start: 1, end: 0.4 },
          alpha: { start: 1, end: 0 },
          tint,
          emitting: false,
        })
        .setDepth(9500);
    this.splash = particle([0xffffff, 0x8fd8f0, 0x2e9ec8], [30, 90], [300, 600], 220);
    this.dust = particle([0xe8dcc0, 0xc9bfa6], [10, 40], [200, 380], 40);
    this.stars = particle([0xffd86b, 0xffffff, 0xff8a1f], [40, 110], [350, 700], 120);
    this.party = particle([0xffc928, 0xff5a1f, 0x22b35e, 0x2f7df6, 0xff6fa8], [60, 160], [600, 1100], 160);
    this.applyView();
    this.resolveReady();
  }

  override update(_time: number, delta: number): void {
    this.onFrame?.(delta);
    this.draw();
  }

  attach(model: StageModel, looks: Map<number, RunnerLook>): void {
    this.model = model;
    this.looks = looks;
  }

  setLooks(looks: Map<number, RunnerLook>): void {
    this.looks = looks;
  }

  setViewSize(w: number, h: number): void {
    this.stageW = w;
    this.stageH = h;
    if (this.sideL) this.applyView();
  }

  /** Stage px of a world point given in cells/rows (for the DOM HUD's tags and pop-ups). */
  toStage(x: number, row: number, out: { x: number; y: number }): { x: number; y: number } {
    const cam = this.cameras.main;
    const view = cam.worldView;
    out.x = (x * CELL - view.x) * ART_SCALE;
    out.y = (-row * CELL - view.y) * ART_SCALE;
    return out;
  }

  /* ------------------------------------------------------------------ effects */

  fxSplash(x: number, row: number): void {
    this.splash.explode(18, x * CELL, -row * CELL);
  }

  fxDust(x: number, row: number): void {
    this.dust.explode(4, x * CELL, -row * CELL + 6);
  }

  fxHit(x: number, row: number): void {
    this.stars.explode(14, x * CELL, -row * CELL - 4);
    this.cameras.main.shake(140, 0.004);
  }

  fxFinish(x: number, row: number): void {
    this.party.explode(30, x * CELL, -row * CELL - 6);
  }

  fxHorn(row: number): void {
    this.hornFlash = { row, until: this.time.now + 500 };
  }

  landed(id: number): void {
    const v = this.runners.get(id);
    if (v) v.landAt = this.time.now;
  }

  respawned(id: number): void {
    const v = this.runners.get(id);
    if (v) v.respawnAt = this.time.now;
  }

  /* ------------------------------------------------------------------ layout */

  private applyView(): void {
    const cam = this.cameras.main;
    cam.setSize(this.stageW * RENDER_SCALE, this.stageH * RENDER_SCALE);
    cam.setZoom(ART_SCALE * RENDER_SCALE);
    const rows = Math.ceil(this.stageH / (CELL * ART_SCALE)) + 5;
    while (this.slots.length < rows) {
      const ground = this.add
        .tileSprite(STRIP_X, 0, STRIP_W, CELL, 'ny-start')
        .setOrigin(0, 0)
        .setDepth(-20000);
      const face = this.add.tileSprite(STRIP_X, 0, STRIP_W, 5, 'ny-start').setOrigin(0, 0).setDepth(-19000);
      this.slots.push({ ground, face });
    }
    if (this.dark) {
      this.dark.veil.destroy();
      this.dark.lights.destroy();
      this.dark = null;
    }
  }

  private ensureDark(): { veil: Phaser.GameObjects.Rectangle; lights: Phaser.GameObjects.RenderTexture } {
    if (!this.dark) {
      const w = Math.ceil(this.stageW / ART_SCALE) + 8;
      const h = Math.ceil(this.stageH / ART_SCALE) + 8;
      const webgl = this.renderer.type === Phaser.WEBGL;
      // Without WebGL (old Smart TV browsers) there are no bitmap masks: a lighter flat veil keeps
      // the night mood while everything stays readable.
      const veil = this.add
        .rectangle(0, 0, w, h, 0x050816, webgl ? 0.86 : 0.4)
        .setOrigin(0, 0)
        .setDepth(9200);
      const lights = this.make.renderTexture({ x: 0, y: 0, width: w, height: h }, false).setOrigin(0, 0);
      if (webgl) {
        const mask = new Phaser.Display.Masks.BitmapMask(this, lights);
        mask.invertAlpha = true;
        veil.setMask(mask);
      }
      this.dark = { veil, lights };
    }
    return this.dark;
  }

  /* ------------------------------------------------------------------ frame */

  private draw(): void {
    const m = this.model;
    if (!m) return;
    if (m.map !== this.map) this.map = m.map;
    const cam = this.cameras.main;
    // Exactly the logic's camera: the bottom edge is where runners go out.
    this.camRow = m.cam;
    const viewH = this.stageH / ART_SCALE;
    const bottomY = (0.5 - this.camRow) * CELL;
    cam.centerOn(((COLS - 1) / 2) * CELL, bottomY - viewH / 2 + 2);
    const view = cam.worldView;
    const lo = Math.max(0, Math.floor(-(view.y + view.height) / CELL) - 1);
    const hi = Math.ceil(-view.y / CELL) + 2;

    this.drawLanes(m, lo, hi);
    this.drawItems(m, lo, hi);
    this.drawRunners(m);
    const left = -0.5 * CELL;
    const right = (COLS - 0.5) * CELL;
    this.sideL.setPosition(left, view.y - 4).setSize(left - view.x + 8, view.height + 8);
    this.sideR.setPosition(right, view.y - 4).setSize(view.x + view.width - right + 8, view.height + 8);
    this.drawDarkness(m, lo, hi);
  }

  private laneTexture(lane: Lane, above: Lane, t: number): { key: string; scroll: number } {
    const map = this.map;
    switch (lane.kind) {
      case 'start':
        return { key: 'ny-start', scroll: 0 };
      case 'finish':
        return { key: 'ny-finish', scroll: 0 };
      case 'grass':
        if (lane.variant === 1) return { key: laneKey(map, 'side'), scroll: 0 };
        return { key: laneKey(map, lane.row % 2 ? 'grassA' : 'grassB'), scroll: 0 };
      case 'road':
        return { key: laneKey(map, above.kind === 'road' ? 'roadLine' : 'road'), scroll: 0 };
      case 'river':
        return { key: laneKey(map, 'water'), scroll: -((lane.speed || 0.25) * t * CELL) % 32 };
      case 'rail':
        return { key: laneKey(map, 'rail'), scroll: 0 };
    }
  }

  private drawLanes(m: StageModel, lo: number, hi: number): void {
    const t = m.t;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      const row = lo + i;
      if (row > hi) {
        slot.ground.setVisible(false);
        slot.face.setVisible(false);
        continue;
      }
      const lane = m.world.lane(row);
      const above = m.world.lane(row + 1);
      const below = row > 0 ? m.world.lane(row - 1) : lane;
      const tex = this.laneTexture(lane, above, t);
      const y = -row * CELL - CELL / 2;
      slot.ground.setVisible(true).setTexture(tex.key).setY(y);
      slot.ground.tilePositionX = tex.scroll;
      // The lane's front face hangs over the lane below when it stands higher.
      if (height(lane.kind) > height(below.kind)) {
        const key = laneKey(this.map, isLand(lane.kind) ? 'faceLand' : 'faceRoad');
        slot.face
          .setVisible(true)
          .setTexture(key)
          .setY(y + CELL)
          .setDepth(-19000 + row);
      } else slot.face.setVisible(false);
    }
  }

  private take<T extends Phaser.GameObjects.Image>(pool: T[], i: number, make: () => T): T {
    let o = pool[i];
    if (!o) {
      o = make();
      pool.push(o);
    }
    return o;
  }

  private drawItems(m: StageModel, lo: number, hi: number): void {
    const t = m.t;
    let ni = 0;
    let ns = 0;
    let np = 0;
    let nsig = 0;
    let ntr = 0;
    const blink = Math.floor(this.time.now / 260) % 2;
    for (let row = lo; row <= hi; row++) {
      const lane = m.world.lane(row);
      const yMid = -row * CELL;
      if (lane.kind === 'road' || lane.kind === 'river') {
        for (const it of itemsAt(lane, t, this.buf)) {
          const img = this.take(this.items, ni++, () => this.add.image(0, 0, 'ny-dot'));
          const key = textureFor(it.kind, it.tint, it.len);
          img.setTexture(key).setVisible(true).setAlpha(1).clearTint();
          const wx = it.left * CELL;
          if (lane.kind === 'river') {
            img
              .setOrigin(0, 0.5)
              .setPosition(wx, yMid + 1)
              .setFlipX(false);
            img.setDepth(yMid - 6);
          } else {
            img
              .setOrigin(0, 1)
              .setPosition(wx, yMid + 7)
              .setFlipX(lane.speed < 0);
            img.setDepth(yMid + 7);
            if (this.hornFlash.row === row && this.time.now < this.hornFlash.until) img.setTint(0xfff2a8);
            const sh = this.take(this.itemShadows, ns++, () => this.add.image(0, 0, 'ny-shadow'));
            sh.setVisible(true)
              .setOrigin(0, 0.5)
              .setPosition(wx, yMid + 7)
              .setScale((it.len * CELL) / 16, 1)
              .setDepth(yMid + 6);
          }
        }
      } else if (lane.kind === 'rail') {
        const state = trainState(lane, t);
        for (const col of [-1, COLS]) {
          const sig = this.take(this.signals, nsig++, () => this.add.image(0, 0, 'ny-signal-0'));
          const on = state === 0 ? 0 : blink ? 1 : 2;
          sig
            .setTexture(`ny-signal-${on}`)
            .setVisible(true)
            .setOrigin(0.5, 1)
            .setPosition(col * CELL, yMid + 2)
            .setDepth(yMid + 2);
        }
        const tr = state === 2 ? itemsAt(lane, t, this.buf)[0] : undefined;
        if (tr) {
          let pair = this.trains[ntr];
          if (!pair) {
            pair = {
              body: this.add.tileSprite(0, 0, 32, 22, 'ny-carriage').setOrigin(0, 1),
              loco: this.add.image(0, 0, 'ny-loco').setOrigin(0, 1),
            };
            this.trains.push(pair);
          }
          ntr++;
          const dirRight = (lane.train?.speed ?? 1) > 0;
          const wx = tr.left * CELL;
          const w = tr.len * CELL;
          pair.body
            .setVisible(true)
            .setPosition(dirRight ? wx : wx + 32, yMid + 8)
            .setDepth(yMid + 8);
          pair.body.setSize(w - 32, 22);
          pair.loco
            .setVisible(true)
            .setFlipX(!dirRight)
            .setPosition(dirRight ? wx + w - 32 : wx, yMid + 8)
            .setDepth(yMid + 8.1);
        }
      } else if (lane.kind === 'grass' || lane.kind === 'start' || lane.kind === 'finish') {
        for (let c = X_MIN + 2; c <= X_MAX - 2; c++) {
          let kind = c >= 0 && c < COLS ? lane.props[c] : null;
          if (!kind && (c < -1 || c > COLS) && lane.kind === 'grass') {
            const h = hash(row, c);
            if (h < 0.34) kind = this.sceneryFor(h);
          }
          if (!kind) continue;
          const img = this.take(this.props, np++, () => this.add.image(0, 0, 'ny-dot'));
          img
            .setTexture(propKey(kind))
            .setVisible(true)
            .setOrigin(0.5, 1)
            .setPosition(c * CELL, yMid + 6)
            .setDepth(yMid + 6);
        }
      }
    }
    for (let i = ni; i < this.items.length; i++) this.items[i]!.setVisible(false);
    for (let i = ns; i < this.itemShadows.length; i++) this.itemShadows[i]!.setVisible(false);
    for (let i = np; i < this.props.length; i++) this.props[i]!.setVisible(false);
    for (let i = nsig; i < this.signals.length; i++) this.signals[i]!.setVisible(false);
    for (let i = ntr; i < this.trains.length; i++) {
      this.trains[i]!.body.setVisible(false);
      this.trains[i]!.loco.setVisible(false);
    }
  }

  private sceneryFor(h: number): 'pohon' | 'semak' | 'lampu' | 'batu' | 'peti' {
    switch (this.map) {
      case 'kota':
        return h < 0.2 ? 'pohon' : 'semak';
      case 'sungai':
        return h < 0.15 ? 'pohon' : h < 0.25 ? 'batu' : 'semak';
      case 'rel':
        return h < 0.15 ? 'peti' : 'semak';
      case 'malam':
        return h < 0.12 ? 'lampu' : 'pohon';
    }
  }

  private viewFor(r: StageRunner): RunnerView {
    let v = this.runners.get(r.id);
    if (!v) {
      const look = this.looks.get(r.id);
      v = {
        shadow: this.add.image(0, 0, 'ny-shadow').setOrigin(0.5, 0.5),
        ring: this.add.image(0, 0, 'ny-ring').setOrigin(0.5, 0.5),
        avatar: this.add
          .image(0, 0, this.avatars.key(look?.look ?? FALLBACK_LOOK, 'happy'))
          .setOrigin(0.5, 1),
        look: look?.look ?? FALLBACK_LOOK,
        face: 'happy',
        landAt: 0,
        respawnAt: 0,
        flip: false,
      };
      v.ring.setTint(colorNumber(look?.color ?? '#FFC928'));
      this.runners.set(r.id, v);
    }
    return v;
  }

  /** A look's avatars finished rasterizing: swap them in for its runners. */
  private avatarsReady(look: Look): void {
    for (const v of this.runners.values()) {
      if (sameLook(v.look, look)) v.avatar.setTexture(this.avatars.key(v.look, v.face));
    }
  }

  private drawRunners(m: StageModel): void {
    const now = this.time.now;
    const seen = new Set<number>();
    for (const r of m.roster) {
      seen.add(r.id);
      const v = this.viewFor(r);
      const look = this.looks.get(r.id);
      if (look && !sameLook(look.look, v.look)) {
        v.look = look.look;
        v.ring.setTint(colorNumber(look.color));
      }
      const hidden =
        m.phase === 'setup' ||
        (r.state === 'out' && (r.deaths === 0 || m.t - r.deadAt > 0.9)) ||
        (r.state === 'dead' && m.t - r.deadAt > 0.9);
      if (hidden) {
        v.shadow.setVisible(false);
        v.ring.setVisible(false);
        v.avatar.setVisible(false);
        continue;
      }
      const dying = r.state === 'dead' || r.state === 'out';
      const pose = dying ? { x: r.deathX, row: r.deathRow, lift: 0 } : m.pose(r);
      const wx = pose.x * CELL;
      const wy = -pose.row * CELL;
      if (r.hop) v.flip = r.hop.dir === 'left' ? true : r.hop.dir === 'right' ? false : v.flip;
      let face: Face = 'happy';
      if (r.hop) face = 'effort';
      if (r.state === 'done') face = 'wow';
      if (dying) face = 'sad';
      v.face = face;
      v.avatar.setTexture(this.avatars.key(v.look, face));
      const since = (now - v.landAt) / 1000;
      const squash = !r.hop && since < 0.12 ? 1 - Math.sin((since / 0.12) * Math.PI) * 0.18 : 1;
      let sy = squash;
      let sx = 2 - squash;
      let alpha = 1;
      let lift = pose.lift * HOP_HEIGHT;
      if (dying) {
        const k = Math.min(1, (m.t - r.deadAt) / 0.9);
        if (r.death === 'hit' || r.death === 'train') {
          sy = 0.35;
          sx = 1.5;
        } else if (r.death === 'water' || r.death === 'drift') {
          lift = -k * 10;
          alpha = 1 - k;
        } else {
          alpha = 1 - k;
        }
      } else if (r.state === 'done') {
        lift = Math.abs(Math.sin(now / 180)) * 5;
      }
      const blink = now - v.respawnAt < 1000 && Math.floor(now / 90) % 2 === 0;
      const depth = wy + 7.5;
      const riverSink = m.world.lane(Math.round(pose.row)).kind === 'river' && !r.hop && !dying ? 1 : 0;
      v.shadow
        .setVisible(!dying || r.death === 'hit' || r.death === 'train')
        .setPosition(wx, wy + 5)
        .setScale(1 - pose.lift * 0.3)
        .setDepth(depth - 0.3);
      v.ring
        .setVisible(!dying)
        .setPosition(wx, wy + 5)
        .setDepth(depth - 0.2)
        .setAlpha(blink ? 0.3 : 0.9);
      v.avatar
        .setVisible(true)
        .setPosition(wx, wy + 6 - lift + riverSink)
        .setScale(sx * (v.flip ? -1 : 1), sy)
        .setAlpha(blink ? 0.35 : alpha)
        .setDepth(depth);
    }
    for (const [id, v] of this.runners) {
      if (seen.has(id)) continue;
      v.shadow.destroy();
      v.ring.destroy();
      v.avatar.destroy();
      this.runners.delete(id);
    }
  }

  private drawDarkness(m: StageModel, lo: number, hi: number): void {
    if (this.map !== 'malam' || m.phase === 'setup') {
      this.dark?.veil.setVisible(false);
      return;
    }
    const { veil, lights: rt } = this.ensureDark();
    const view = this.cameras.main.worldView;
    const ox = Math.floor(view.x) - 4;
    const oy = Math.floor(view.y) - 4;
    veil.setVisible(true).setPosition(ox, oy);
    rt.setPosition(ox, oy);
    rt.clear();
    const light = (x: number, y: number, scale: number, key = 'ny-light') => {
      this.stamp
        .setTexture(key)
        .setScale(scale)
        .setPosition(x - ox, y - oy);
      rt.draw(this.stamp);
    };
    for (const r of m.roster) {
      if (r.state !== 'run' && r.state !== 'done') continue;
      const p = m.pose(r);
      light(p.x * CELL, -p.row * CELL, 0.62);
    }
    for (let row = lo; row <= hi; row++) {
      const lane = m.world.lane(row);
      const y = -row * CELL;
      if (lane.kind === 'grass') {
        for (let c = X_MIN + 2; c <= X_MAX - 2; c++) {
          const inside = c >= 0 && c < COLS;
          const kind = inside ? lane.props[c] : hash(row, c) < 0.12 && (c < -1 || c > COLS) ? 'lampu' : null;
          if (kind === 'lampu') light(c * CELL, y - 2, 0.6);
        }
      } else if (lane.kind === 'road') {
        for (const it of itemsAt(lane, m.t, this.buf)) {
          const front = lane.speed > 0 ? (it.left + it.len) * CELL + 20 : it.left * CELL - 20;
          light(front, y + 2, 0.6, 'ny-beam');
        }
      } else if (lane.kind === 'rail') {
        const state = trainState(lane, m.t);
        if (state === 1) {
          light(-CELL, y - 8, 0.3);
          light(COLS * CELL, y - 8, 0.3);
        }
        const tr = state === 2 ? itemsAt(lane, m.t, this.buf)[0] : undefined;
        if (tr)
          light(
            (lane.train?.speed ?? 1) > 0 ? (tr.left + tr.len) * CELL + 24 : tr.left * CELL - 24,
            y,
            1.1,
            'ny-beam',
          );
      }
    }
  }
}
