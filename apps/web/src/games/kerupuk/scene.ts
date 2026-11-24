/**
 * The Phaser world: the kampung yard, the rope line, contestants and their swinging kerupuk,
 * crumbs and cough puffs. It only renders; rules live in logic.ts. Each frame it reads the game
 * time and every lane's swing from the driver, so the kerupuk on the main screen and the swing
 * on each phone are the same function of synced time.
 * Hot paths (update) reuse objects and never allocate.
 */
import { type Look, sameLook } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import { HEAD, KERUPUK_R, KERUPUK_SKY } from '../../shared/art/kerupuk';
import {
  FEET_Y,
  headCenterY,
  kerupukRestY,
  type LaneLayout,
  laneLayout,
  mouthY,
  ropeWorldY,
  WORLD_H,
  WORLD_W,
} from './layout';
import { BITES, type Swing, swingOffset } from './logic';
import {
  BG_KEY,
  BODY_BOX,
  bodyKey,
  CHAR_PX,
  HEAD_PX,
  HeadBank,
  kerupukKey,
  lookId,
  RENDER_SCALE,
  WING_ART,
  WING_KEY,
} from './textures';

/** What the scene needs to know about a lane each frame (owned and updated by the driver). */
export interface LaneModel {
  id: number;
  look: Look;
  color: string;
  connected: boolean;
  bites: number;
  swing: Swing;
  finished: boolean;
  /** Choking until this game time (0 = not choking). */
  chokeUntil: number;
  /** End of round mood: winner hops, the rest look sad or pleased. */
  mood: 'play' | 'win' | 'ok' | 'sad';
}

export interface SceneDriver {
  /** Game time (frozen while paused). */
  now(): number;
  lanes(): readonly LaneModel[];
}

const BITE_ANIM_MS = 300;
const CHEW_FACE_MS = 650;
const COUGH_EVERY_MS = 380;
const STRING_COLOR = 0xe8352e;

interface Actor {
  id: number;
  x: number;
  look: Look;
  color: string;
  shadow: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  ker: Phaser.GameObjects.Image;
  face: Face;
  kerTex: number;
  anchorY: number;
  restY: number;
  /** Distance rope anchor -> kerupuk centre at rest. */
  len: number;
  mouthDy: number;
  biteAt: number;
  missAt: number;
  jolt: number;
  lastCough: number;
  seed: number;
  /** Current kerupuk centre (world), for effects. */
  kx: number;
  ky: number;
}

export class KerupukScene extends Phaser.Scene {
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private readonly images: Map<string, HTMLImageElement>;
  private driver: SceneDriver | null = null;
  private actors: Actor[] = [];
  private heads!: HeadBank;
  private rosterKey = '';
  private layout: LaneLayout = laneLayout(2);
  private strings!: Phaser.GameObjects.Graphics;
  private crumbs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private puffs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private viewW = WORLD_W;
  private viewH = WORLD_H;
  private readonly clouds: Phaser.GameObjects.Image[] = [];

  constructor(images: Map<string, HTMLImageElement>) {
    super({ key: 'kerupuk' });
    this.images = images;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  attach(driver: SceneDriver): void {
    this.driver = driver;
  }

  get currentLayout(): LaneLayout {
    return this.layout;
  }

  create(): void {
    for (const [key, img] of this.images) {
      if (!this.textures.exists(key)) this.textures.addImage(key, img);
    }
    this.heads = new HeadBank(this.textures, (look) => this.headsReady(look));
    this.makeTextures();
    this.cameras.main.setBackgroundColor(KERUPUK_SKY);
    this.setViewSize(this.viewW, this.viewH);

    this.add.image(0, 0, BG_KEY).setOrigin(0, 0).setDisplaySize(WORLD_W, WORLD_H).setDepth(0);
    const wingW = WING_ART * 2;
    this.add.image(-wingW, 0, WING_KEY.left).setOrigin(0, 0).setDisplaySize(wingW, WORLD_H).setDepth(0);
    this.add.image(WORLD_W, 0, WING_KEY.right).setOrigin(0, 0).setDisplaySize(wingW, WORLD_H).setDepth(0);
    // Clouds for the extra sky of taller screens (4:3, 16:10).
    for (const [x, y, s] of [
      [180, -150, 1.1],
      [760, -210, 0.9],
      [1120, -120, 1],
      [420, -60, 0.7],
    ] as const) {
      this.clouds.push(this.add.image(x, y, 'kp-cloud').setScale(s).setDepth(0));
    }

    this.strings = this.add.graphics().setDepth(12);
    this.crumbs = this.add
      .particles(0, 0, 'kp-crumb', {
        lifespan: { min: 650, max: 1100 },
        speed: { min: 120, max: 300 },
        angle: { min: 200, max: 340 },
        rotate: { min: 0, max: 360 },
        scale: { min: 0.5, max: 1.1 },
        alpha: { start: 1, end: 0.6 },
        gravityY: 980,
        tint: [0xfff4d6, 0xf1ddaa, 0xffffff, 0xe8c98a],
        emitting: false,
      })
      .setDepth(30);
    this.puffs = this.add
      .particles(0, 0, 'kp-puff', {
        lifespan: { min: 380, max: 620 },
        speed: { min: 40, max: 120 },
        angle: { min: 230, max: 310 },
        scale: { start: 0.55, end: 1.1 },
        alpha: { start: 0.9, end: 0 },
        emitting: false,
      })
      .setDepth(31);
    this.resolveReady();
  }

  private makeTextures(): void {
    if (this.textures.exists('kp-crumb')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xd2a85e, 1);
    g.fillPoints(
      [
        { x: 1, y: 4 },
        { x: 6, y: 0 },
        { x: 12, y: 3 },
        { x: 11, y: 10 },
        { x: 4, y: 11 },
      ],
      true,
    );
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      [
        { x: 2.5, y: 4.5 },
        { x: 6, y: 1.8 },
        { x: 10.5, y: 4 },
        { x: 9.8, y: 9 },
        { x: 4.5, y: 9.6 },
      ],
      true,
    );
    g.generateTexture('kp-crumb', 13, 12);
    g.clear();
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(16, 16, 16);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(16, 16, 12);
    g.generateTexture('kp-puff', 32, 32);
    g.clear();
    g.fillStyle(0x111214, 0.2);
    g.fillEllipse(60, 12, 120, 24);
    g.generateTexture('kp-shadow', 120, 24);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(90, 50, 160, 44);
    g.fillCircle(66, 36, 30);
    g.fillCircle(106, 26, 36);
    g.generateTexture('kp-cloud', 180, 80);
    g.destroy();
  }

  setViewSize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    const cam = this.cameras?.main;
    if (!cam) return;
    cam.setSize(w * RENDER_SCALE, h * RENDER_SCALE);
    cam.setZoom(RENDER_SCALE);
    cam.centerOn(WORLD_W / 2, WORLD_H - h / 2);
  }

  /** Stage px of world (0, 0). */
  worldOrigin(out: { x: number; y: number }): { x: number; y: number } {
    out.x = (this.viewW - WORLD_W) / 2;
    out.y = this.viewH - WORLD_H;
    return out;
  }

  /* ---------------------------------------------------------------- effects (driver calls) */

  bite(id: number, perfect: boolean, finished: boolean): void {
    const a = this.actor(id);
    if (!a) return;
    const now = this.driver?.now() ?? 0;
    a.biteAt = now;
    a.jolt = 1;
    const u = this.layout.unit;
    const n = finished ? 34 : perfect ? 20 : 12;
    this.crumbs.explode(n, a.kx, a.ky + KERUPUK_R * u * 0.5);
  }

  choke(id: number): void {
    const a = this.actor(id);
    if (!a) return;
    const now = this.driver?.now() ?? 0;
    a.missAt = now;
    a.lastCough = now - COUGH_EVERY_MS + 160;
  }

  /** Mouth position of a lane (world px), e.g. for floating words. */
  mouthOf(id: number, out: { x: number; y: number }): boolean {
    const a = this.actor(id);
    if (!a) return false;
    out.x = a.x;
    out.y = a.restY;
    return true;
  }

  /* ---------------------------------------------------------------- frame */

  override update(): void {
    const d = this.driver;
    if (!d) return;
    const lanes = d.lanes();
    this.syncActors(lanes);
    const now = d.now();
    const u = this.layout.unit;
    const amp = this.layout.amp;
    const g = this.strings;
    g.clear();
    g.lineStyle(Math.max(1.6, 1.4 * u), STRING_COLOR, 1);
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i]!;
      const l = lanes[i]!;
      const t = now * 0.001 + a.seed;
      const off = swingOffset(l.swing, now);
      const dx = off * amp;
      const dy = Math.sqrt(Math.max(1, a.len * a.len - dx * dx));
      const kx = a.x + dx;
      const ky = a.anchorY + dy;
      a.kx = kx;
      a.ky = ky;
      const rot = -Math.atan2(dx, dy);

      // Kerupuk.
      a.jolt *= 0.86;
      if (l.finished || l.bites >= BITES) {
        a.ker.setVisible(false);
        // A short leftover string end swinging.
        const ex = a.x + dx * 0.3;
        g.lineBetween(a.x, a.anchorY, ex, a.anchorY + 26 * u);
      } else {
        const tex = Math.min(BITES - 1, l.bites);
        if (tex !== a.kerTex) {
          a.kerTex = tex;
          a.ker.setTexture(kerupukKey(tex));
        }
        const s = (u / CHAR_PX) * (1 + a.jolt * 0.08);
        a.ker.setVisible(true).setPosition(kx, ky).setRotation(rot).setScale(s);
        // The string is tied at the top edge of the (rotated) kerupuk.
        const r = (KERUPUK_R - 2) * u;
        g.lineBetween(a.x, a.anchorY, kx + Math.sin(rot) * r, ky - Math.cos(rot) * r);
      }

      // Contestant.
      let bodyDx = 0;
      let bodyDy = Math.sin(t * 2.2) * 1.2 * u;
      let headDx = Math.max(-1, Math.min(1, dx / amp)) * 5 * u;
      let headDy = 0;
      let tilt = Math.max(-1, Math.min(1, dx / amp)) * 0.08;
      let face: Face = 'happy';
      const sinceBite = now - a.biteAt;
      const choking = l.chokeUntil > now && !l.finished;
      if (l.mood === 'win') {
        bodyDy = -Math.abs(Math.sin(t * 7)) * 16 * u;
        headDy = 0;
        tilt = Math.sin(t * 7) * 0.08;
        face = 'happy';
      } else if (l.mood === 'sad') {
        face = 'sad';
        headDy = 3 * u;
        tilt = 0;
      } else if (l.mood === 'ok') {
        face = 'happy';
      } else if (choking) {
        const since = now - a.missAt;
        face = since < 140 ? 'wow' : 'sad';
        if (now - a.lastCough >= COUGH_EVERY_MS) {
          a.lastCough = now;
          this.puffs.explode(3, a.x + headDx, a.restY + a.mouthDy);
        }
        const cough = Math.max(0, 1 - (now - a.lastCough) / 220);
        bodyDx = Math.sin(t * 45) * 2.2 * u * cough;
        headDy = cough * 6 * u - (since < 160 ? Math.sin((since / 160) * Math.PI) * 8 * u : 0);
        headDx += Math.sin(t * 50) * 2 * u * cough;
        tilt = 0.12 * cough;
      } else if (sinceBite >= 0 && sinceBite < CHEW_FACE_MS) {
        const k = sinceBite / BITE_ANIM_MS;
        if (k < 1) headDy = -Math.sin(k * Math.PI) * 9 * u;
        face = sinceBite < 140 ? 'wow' : 'effort';
        if (sinceBite >= 140) headDy += Math.abs(Math.sin(sinceBite * 0.03)) * 1.6 * u;
      } else if (Math.abs(off) < 0.5 && !l.finished) {
        // Mouth open as the kerupuk comes past.
        face = 'wow';
      }
      if (l.finished && l.mood === 'play') {
        bodyDy = -Math.abs(Math.sin(t * 7)) * 14 * u;
        face = 'happy';
      }
      if (a.face !== face) {
        a.face = face;
        a.head.setTexture(this.heads.key(a.look, face));
      }
      const alpha = l.connected ? 1 : 0.45;
      a.body.setPosition(a.x + bodyDx, FEET_Y + bodyDy).setAlpha(alpha);
      a.head
        .setPosition(a.x + bodyDx + headDx, headCenterY(u) + bodyDy + headDy)
        .setRotation(tilt)
        .setAlpha(alpha);
      a.shadow.setScale(u * 0.62 * (1 + bodyDy / 200), u * 0.5);
    }
  }

  /** A look's head textures finished rasterizing: swap them in for its contestants. */
  private headsReady(look: Look): void {
    for (const a of this.actors)
      if (sameLook(a.look, look)) a.head.setTexture(this.heads.key(a.look, a.face));
  }

  private actor(id: number): Actor | undefined {
    for (const a of this.actors) if (a.id === id) return a;
    return undefined;
  }

  /** Rebuild the contestants when the lanes change (new round, new player). */
  private syncActors(lanes: readonly LaneModel[]): void {
    let key = `${lanes.length}`;
    for (const l of lanes) key += `|${l.id}:${lookId(l.look)}:${l.color}`;
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    for (const a of this.actors) {
      a.shadow.destroy();
      a.body.destroy();
      a.head.destroy();
      a.ker.destroy();
    }
    this.layout = laneLayout(lanes.length);
    const { unit: u, xs } = this.layout;
    this.actors = lanes.map((l, i) => {
      const x = xs[i]!;
      const anchorY = ropeWorldY(x);
      const restY = kerupukRestY(u);
      const color = this.textures.exists(bodyKey(l.color)) ? l.color : '#F2453D';
      return {
        id: l.id,
        x,
        look: l.look,
        color,
        shadow: this.add.image(x, FEET_Y, 'kp-shadow').setDepth(5),
        body: this.add
          .image(x, FEET_Y, bodyKey(color))
          .setOrigin(-BODY_BOX.x / BODY_BOX.w, -BODY_BOX.y / BODY_BOX.h)
          .setScale(u / CHAR_PX)
          .setDepth(10),
        head: this.add
          .image(x, headCenterY(u), this.heads.key(l.look, 'happy'))
          .setScale((u * HEAD.scale * 64) / HEAD_PX)
          .setDepth(11),
        ker: this.add
          .image(x, restY, kerupukKey(0))
          .setOrigin(0.5, 0.5)
          .setScale(u / CHAR_PX)
          .setDepth(13),
        face: 'happy',
        kerTex: 0,
        anchorY,
        restY,
        len: restY - anchorY,
        mouthDy: mouthY(u) - restY,
        biteAt: Number.NEGATIVE_INFINITY,
        missAt: Number.NEGATIVE_INFINITY,
        jolt: 0,
        lastCough: Number.NEGATIVE_INFINITY,
        seed: i * 1.7,
        kx: x,
        ky: restY,
      };
    });
  }
}
