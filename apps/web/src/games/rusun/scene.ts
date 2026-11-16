/**
 * Phaser world for Rusun: sky, city, a perfectly still tower, the crane, and the effects (gentle
 * squash, dust, PAS sparkles, edge tip-offs and a rigid-body topple). It only reads the logic
 * state; every rule lives in logic.ts.
 *
 * The canvas is 1.5x the stage and the camera zooms 1.5x, so world units equal stage pixels. The
 * 1280x720 world frame is pinned to the stage bottom and centred horizontally: taller stages see
 * more sky, wider stages see more city on both sides (`padX`), and all logic stays in world units.
 */
import * as Phaser from 'phaser';
import {
  CENTER_X,
  type CollapseInfo,
  type Fall,
  FLOOR_H,
  GROUND_Y,
  INTRO_MS,
  type RusunEvent,
  type RusunLogic,
} from './logic';
import { FloorTextures, floorKey, TEX_SCALE } from './textures';
import { WING_W } from './wings';

const S = 1 / TEX_SCALE;
/** The camera keeps the tower top around this screen y once the tower is tall. */
const TOP_SCREEN_Y = 480;
/**
 * Rig geometry in screen space (relative to the camera top). The trolley never moves: the cable
 * hangs from one point (PIVOT) and the floor swings under it like a pendulum.
 */
const TROLLEY_Y = 44;
const PIVOT_Y = 58;
/** Cable length from the pivot to the hook at full reach. */
const ROPE = 276;
const SLING_Y = 24;
/** Pivot to the hanging floor's center: the pendulum length that maps logic x to an angle. */
const SWING_R = ROPE + SLING_Y + FLOOR_H / 2;
/** The load lags the cable a little, so it tilts less than the cable does. */
const FLOOR_TILT = 0.35;
/** How far the hook is reeled up while the crane fetches the next floor. */
const LIFT = ROPE - 26;
const DESCEND_MS = 520;
const GRAVITY = 1500;
const RULER_FLOORS = 120;
const DEG = Math.PI / 180;
/** Collapse: the group leans over the support's corner with an accelerating ease, then slips off. */
const TOPPLE_MAX = 90 * DEG;
const TOPPLE_DETACH = 36 * DEG;
const TOPPLE_MS = 1250;
/** Miss over the edge: a single floor tips off around the corner. */
const TIP_MAX = 90 * DEG;
const TIP_DETACH = 40 * DEG;
const TIP_MS = 640;
/** A loose body keeps turning in the air, slowing down, never past this. */
const AIR_MAX = 62 * DEG;
const SPIN_DAMP = 1.6;

export interface SceneDriver {
  readonly logic: RusunLogic;
  /** Game time (frozen while paused). */
  now(): number;
  step(): void;
  onEvent(fn: (e: RusunEvent) => void): () => void;
  /** Tallest tower to show on the ruler (0 hides the record line). */
  readonly recordFloors: number;
  frame(camY: number, now: number, dtMs: number): void;
  /** Toppled floors hit the street. */
  impact(): void;
}

/**
 * Floors moving as one rigid body:
 * - tip: lean over a pivot (a support's top corner) with an accelerating ease;
 * - fall: let go at `detach`, drop under gravity while the spin dies down;
 * - settle: a corner hits the street, the body lies down on the side its weight is on;
 * - rest: dust, then fade.
 * The body never passes through the floors still standing; it slides down along their face.
 */
interface Tumble {
  imgs: Phaser.GameObjects.Image[];
  /** Each sprite's origin (bottom center) relative to the anchor at phi = 0. */
  rx: number[];
  ry: number[];
  /** Half widths of the slabs, for contact. */
  hw: number[];
  /** Anchor (the pivot when the tumble began); moves as the body falls, slides and settles. */
  ax: number;
  ay: number;
  dir: 1 | -1;
  t0: number;
  maxAngle: number;
  detach: number;
  duration: number;
  phase: 'tip' | 'fall' | 'settle' | 'rest';
  phi: number;
  omega: number;
  vx: number;
  vy: number;
  /** Outer face (on the `dir` side) of each floor still standing, by floor index. */
  wall: number[];
  /** Settle: turn about the contact corner (cx, cy) from phi0 to phi1. */
  cx: number;
  cy: number;
  phi0: number;
  phi1: number;
  settleAt: number;
  settleMs: number;
  landedAt: number;
  /** Collapses report the impact (sound); misses just break. */
  loud: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
/** Put a floor sprite (origin at its bottom center) so its body's center is (cx, cy), turned `rot`. */
const placeFloor = (img: Phaser.GameObjects.Image, cx: number, cy: number, rot: number) =>
  img.setPosition(cx - (FLOOR_H / 2) * Math.sin(rot), cy + (FLOOR_H / 2) * Math.cos(rot)).setRotation(rot);
/** Cable angle (radians, + swings right) that puts the hanging floor's center at `x`. */
const ropeAngle = (x: number) => Math.asin(Math.max(-1, Math.min(1, (x - CENTER_X) / SWING_R)));
/** The outer face of each floor on one side. */
const wallOf = (floors: readonly { x: number; width: number }[], dir: 1 | -1) =>
  floors.map((f) => f.x + (dir * f.width) / 2);

export class RusunScene extends Phaser.Scene {
  readonly ready: Promise<void>;
  private resolveReady: () => void = () => {};
  private driver: SceneDriver | null = null;
  private tex!: FloorTextures;

  private tower: Phaser.GameObjects.Image[] = [];
  private crane!: Phaser.GameObjects.Image;
  private trolley!: Phaser.GameObjects.Image;
  private cable!: Phaser.GameObjects.Rectangle;
  private rig!: Phaser.GameObjects.Container;
  private slings!: Phaser.GameObjects.Graphics;
  private hangFloor!: Phaser.GameObjects.Image;
  private falling!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Image;
  private recordLine!: Phaser.GameObjects.Graphics;
  /** Floor ruler, kept at the stage's left edge (x = 60 on 16:9). */
  private ruler: Phaser.GameObjects.Graphics | null = null;
  private ring!: Phaser.GameObjects.Image;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  private camY = 0;
  /** Stage px above the 16:9 frame on taller screens (more sky; the crane stays at the top). */
  private extra = 0;
  /** Stage px left and right of the 1280-wide frame on wider screens (more city). */
  private padX = 0;
  /** Visual clock (ms of unpaused scene time) for effects. */
  private vis = 0;
  /** Cable angle (radians, + swings right) and how far the hook is reeled up. */
  private angle = 0;
  private lift = LIFT;
  private rigIndex = -1;
  private rigFromAngle = 0;
  private rigFromT = 0;
  private rigFromLift = LIFT;
  /** Where the dropped floor let go: top y, center y and tilt. */
  private fallTop0 = 0;
  private fallCY0 = 0;
  private fallRot0 = 0;
  private tumbles: Tumble[] = [];
  /** While a collapse plays, the camera frames the pivot, then the street. */
  private focus: { pivotY: number; groundAt: number } | null = null;
  private shownRecord = -1;

  constructor(private readonly images: Map<string, HTMLImageElement>) {
    super({ key: 'rusun' });
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  create(): void {
    this.tex = new FloorTextures(this.textures);
    this.tex.register(this.images);
    this.images.clear();

    const cam = this.cameras.main;
    cam.setOrigin(0, 0);
    cam.setZoom(TEX_SCALE);
    cam.setScroll(0, 0);
    cam.setBackgroundColor('#79C6F2');

    this.buildSky();
    this.add.image(0, 0, 'rs-bg').setOrigin(0, 0).setScale(S).setDepth(2);
    this.add.image(-WING_W, 0, 'rs-wing-l').setOrigin(0, 0).setScale(S).setDepth(2);
    this.add.image(1280, 0, 'rs-wing-r').setOrigin(0, 0).setScale(S).setDepth(2);
    this.buildRuler();

    this.falling = this.add.image(0, 0, floorKey(1, true)).setOrigin(0.5, 1).setScale(S).setDepth(11);
    this.falling.setVisible(false);
    this.marker = this.add.image(0, 0, 'rs-marker').setOrigin(0.5, 1).setScale(S).setDepth(14);
    this.ring = this.add.image(0, 0, 'rs-ring').setScale(S).setDepth(15).setVisible(false);

    this.slings = this.add.graphics().setDepth(20);
    this.hangFloor = this.add.image(0, 0, floorKey(1, true)).setOrigin(0.5, 1).setScale(S).setDepth(20);
    const hook = this.add.image(0, 0, 'rs-hook').setScale(S);
    this.rig = this.add.container(CENTER_X, PIVOT_Y + ROPE - LIFT, [hook]).setDepth(20.5);
    this.cable = this.add.rectangle(CENTER_X, PIVOT_Y, 2.5, 1, 0x111214).setOrigin(0.5, 0).setDepth(21);
    this.crane = this.add.image(0, 0, 'rs-crane').setOrigin(0, 0).setScale(S).setDepth(22);
    this.trolley = this.add
      .image(CENTER_X, TROLLEY_Y, 'rs-trolley')
      .setOrigin(0.5, 0)
      .setScale(S)
      .setDepth(23);

    // Soft, low dust that rolls sideways; nothing is flung upward.
    this.dust = this.add
      .particles(0, 0, 'rs-dust', {
        lifespan: { min: 600, max: 1100 },
        speed: { min: 18, max: 70 },
        scale: { start: 0.8 * S, end: 1.5 * S },
        alpha: { start: 0.85, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: -12,
        emitting: false,
      })
      .setDepth(13);
    this.sparks = this.add
      .particles(0, 0, 'rs-spark', {
        lifespan: { min: 500, max: 800 },
        speed: { min: 90, max: 200 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.9 * S, end: 0 },
        rotate: { start: 0, end: 220 },
        gravityY: 260,
        emitting: false,
      })
      .setDepth(16);

    this.resolveReady();
  }

  /** Hook up a started driver and sync to its current (intro) state. */
  attach(driver: SceneDriver): void {
    this.driver = driver;
    driver.onEvent((e) => this.onEvent(e));
    this.onIntro();
  }

  /* ---------------------------------------------------------------- scenery */

  private buildSky(): void {
    // Flat bands, slightly deeper blue the higher we climb.
    const bands: [number, number, number][] = [
      [-800, 0, 0x79c6f2],
      [-1700, -800, 0x6ebff0],
      [-2700, -1700, 0x63b7ec],
      [-3900, -2700, 0x59aee6],
      [-7000, -3900, 0x50a5df],
    ];
    for (const [top, bottom, color] of bands) {
      this.add
        .rectangle(-WING_W - 20, top, 1280 + 2 * WING_W + 40, bottom - top + 1, color)
        .setOrigin(0, 0)
        .setDepth(0);
    }
    const clouds: [number, number, number][] = [
      [1090, -140, 0.7],
      [230, -400, 0.9],
      [1000, -720, 1.05],
      [170, -1040, 0.8],
      [1110, -1380, 1],
      [300, -1720, 1.15],
      [930, -2060, 0.9],
      [210, -2420, 1],
      [1060, -2800, 1.1],
      [340, -3200, 0.85],
      [960, -3600, 1],
      [200, -4000, 1.1],
      // Wider screens: a few more out to the sides.
      [-240, -300, 0.9],
      [1560, -560, 1],
      [-300, -1260, 1.05],
      [1500, -1900, 0.9],
      [-220, -2600, 1],
      [1540, -3400, 1.1],
    ];
    for (const [x, y, s] of clouds) {
      this.add
        .image(x, y, 'rs-cloud')
        .setScale(s * S)
        .setScrollFactor(0.8)
        .setDepth(1)
        .setAlpha(0.95);
    }
    const birds: [number, number][] = [
      [980, -260],
      [1010, -240],
      [260, -900],
      [1120, -1560],
      [1140, -1540],
    ];
    for (const [x, y] of birds) {
      const b = this.add.image(x, y, 'rs-bird').setScale(S).setScrollFactor(0.85).setDepth(1);
      this.tweens.add({
        targets: b,
        y: y - 8,
        x: x + 18,
        duration: 1600 + ((x * 7) % 900),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    // A layangan on a long string, drifting in the breeze.
    const kx = 1030;
    const ky = -560;
    const string = this.add.graphics().setScrollFactor(0.85).setDepth(1);
    string.lineStyle(1.5, 0x5a4a3c, 0.8);
    string.beginPath();
    string.moveTo(kx, ky);
    string.lineTo(kx + 120, ky + 260);
    string.lineTo(kx + 260, ky + 760);
    // On to the ground behind the city, so wider screens never see a loose end.
    string.lineTo(kx + 420, ky + 1500);
    string.strokePath();
    const kite = this.add
      .image(kx, ky, 'rs-kite')
      .setOrigin(0.5, 38 / 166)
      .setScale(S)
      .setScrollFactor(0.85)
      .setDepth(1);
    this.tweens.add({
      targets: kite,
      angle: { from: -7, to: 7 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private buildRuler(): void {
    const g = this.add.graphics().setDepth(3);
    this.ruler = g;
    g.lineStyle(3, 0x111214, 0.35);
    g.lineBetween(60, GROUND_Y, 60, GROUND_Y - RULER_FLOORS * FLOOR_H);
    g.lineStyle(2, 0x111214, 0.45);
    for (let i = 0; i <= RULER_FLOORS; i++) {
      const y = GROUND_Y - i * FLOOR_H;
      g.lineBetween(i % 5 === 0 ? 48 : 52, y, 68, y);
    }
    this.recordLine = this.add.graphics().setDepth(4).setVisible(false);
    this.drawRecordLine();
  }

  /** Dashed record line from the ruler (pinned to the stage's left edge) to just past the tower. */
  private drawRecordLine(): void {
    const g = this.recordLine;
    if (!g) return;
    g.clear().lineStyle(2.5, 0xff5a1f, 1);
    for (let x = 60 - this.padX; x < 520; x += 18) g.lineBetween(x, 0, Math.min(520, x + 10), 0);
  }

  /* ---------------------------------------------------------------- events */

  private onEvent(e: RusunEvent): void {
    switch (e.type) {
      case 'intro':
        this.onIntro();
        break;
      case 'drop':
        this.onDrop(e.fall);
        break;
      case 'land':
        this.onLand(e.fall, e.pas);
        break;
      case 'miss':
        this.onMiss(e.fall);
        break;
      case 'collapse':
        this.onCollapse(e.info, e.fall);
        break;
      case 'topped':
        this.onTopped();
        break;
      default:
        break;
    }
  }

  private floorSprite(i: number, workers: boolean): Phaser.GameObjects.Image {
    return this.add
      .image(0, 0, this.tex.key(i, workers))
      .setOrigin(0.5, 1)
      .setScale(S)
      .setDepth(10 + i * 0.001);
  }

  private onIntro(): void {
    const L = this.driver!.logic;
    for (let k = 1; k < this.tower.length; k++) this.sink(this.tower[k]!);
    const base = this.tower[0] ?? this.floorSprite(0, false);
    base.setPosition(L.floors[0]!.x, GROUND_Y).setRotation(0);
    this.tower = [base];
    this.rigIndex = -1;
    this.rigFromAngle = this.angle;
    this.rigFromT = L.phaseEndsAt - INTRO_MS;
    this.rigFromLift = this.lift;
    this.focus = null;
    this.tex.ensure(1, 4);
  }

  private sink(img: Phaser.GameObjects.Image): void {
    this.puff(img.x, img.y - 6, 3);
    this.tweens.add({
      targets: img,
      y: img.y + 46,
      alpha: 0,
      duration: 560,
      ease: 'Quad.easeIn',
      onComplete: () => img.destroy(),
    });
  }

  /** A little dust rolling out to both sides at (x, y). */
  private puff(x: number, y: number, count: number): void {
    this.dust.setEmitterAngle({ min: 170, max: 200 });
    this.dust.explode(count, x, y);
    this.dust.setEmitterAngle({ min: 340, max: 370 });
    this.dust.explode(count, x, y);
  }

  /** Let go exactly where the floor hangs (same x, height and tilt); it then falls straight down. */
  private onDrop(fall: Fall): void {
    const a = ropeAngle(fall.dropX);
    this.fallCY0 = this.camY - this.extra + PIVOT_Y + (SWING_R - this.lift) * Math.cos(a);
    this.fallTop0 = this.fallCY0 - FLOOR_H / 2;
    this.fallRot0 = -a * FLOOR_TILT;
    this.falling.setTexture(this.tex.key(fall.floorIndex, true)).setScale(S).setVisible(true);
    placeFloor(this.falling, fall.dropX, this.fallCY0, this.fallRot0);
    this.hangFloor.setVisible(false);
    this.slings.setVisible(false);
  }

  private resetRigFrom(t: number): void {
    this.rigFromAngle = this.angle;
    this.rigFromT = t;
    this.rigFromLift = this.lift;
  }

  private onLand(fall: Fall, pas: boolean): void {
    const L = this.driver!.logic;
    const i = fall.floorIndex;
    this.falling.setVisible(false);
    const prev = this.tower[i - 1];
    if (prev && i - 1 > 0) prev.setTexture(this.tex.key(i - 1, false));
    const img = this.floorSprite(i, true);
    const bottom = GROUND_Y - i * FLOOR_H;
    img.setPosition(fall.outcome.x, bottom);
    this.tower[i] = img;
    // A small squash that settles without bouncing.
    img.setScale(S * 1.05, S * 0.9);
    this.tweens.add({ targets: img, scaleX: S, scaleY: S, duration: 200, ease: 'Quad.easeOut' });
    const half = fall.width / 2 + 4;
    this.puff(img.x - half, bottom - 3, 2);
    this.puff(img.x + half, bottom - 3, 2);
    if (pas) {
      const cy = bottom - FLOOR_H / 2;
      this.sparks.explode(10, img.x, cy);
      this.ring
        .setPosition(img.x, cy)
        .setScale(0.3 * S)
        .setAlpha(1)
        .setVisible(true);
      this.tweens.add({
        targets: this.ring,
        scale: 2.6 * S,
        alpha: 0,
        duration: 460,
        ease: 'Cubic.easeOut',
        onComplete: () => this.ring.setVisible(false),
      });
    }
    this.resetRigFrom(fall.landAt);
    this.tex.ensure(L.floorIndex, 4);
  }

  /** A miss: tips off the top's edge (if it touched it) or drops clear, then breaks on the street. */
  private onMiss(fall: Fall): void {
    const L = this.driver!.logic;
    this.falling.setVisible(false);
    const n = L.floors.length;
    const top = L.top;
    const y = GROUND_Y - n * FLOOR_H;
    const img = this.floorSprite(fall.floorIndex, true).setDepth(12.5);
    img.setPosition(fall.outcome.x, y);
    const dir: 1 | -1 = fall.outcome.offset >= 0 ? 1 : -1;
    const wall = wallOf(L.floors, dir);
    if (fall.outcome.tip) {
      this.startTumble(
        [img],
        top.x + (dir * top.width) / 2,
        y,
        dir,
        wall,
        TIP_MAX,
        TIP_DETACH,
        TIP_MS,
        false,
      );
    } else {
      // Clear of the tower: keep falling straight down at the speed it had.
      const speed = (2 * (y - FLOOR_H - this.fallTop0)) / (Math.max(1, fall.landAt - fall.startAt) / 1000);
      const t = this.startTumble([img], img.x, y, dir, wall, 0, 0, 1, false);
      t.phase = 'fall';
      t.vy = Math.max(200, speed);
    }
    this.resetRigFrom(fall.landAt);
  }

  private onCollapse(info: CollapseInfo, fall: Fall): void {
    const L = this.driver!.logic;
    this.falling.setVisible(false);
    const start = info.fromIndex;
    const group: Phaser.GameObjects.Image[] = [];
    for (let j = start; j < this.tower.length; j++) group.push(this.tower[j]!);
    this.tower.length = Math.min(this.tower.length, start);
    if (info.dropped) {
      const dropped = this.floorSprite(fall.floorIndex, true);
      dropped.setPosition(fall.outcome.x, GROUND_Y - fall.floorIndex * FLOOR_H);
      group.push(dropped);
    }
    if (!group.length) {
      this.driver!.impact();
      return;
    }
    for (const img of group) img.setDepth(img.depth + 2);
    // Pivot: the failing support's top corner on the side the load leans to.
    const base = L.floors[start - 1]!;
    const px = base.x + (info.dir * base.width) / 2;
    const py = GROUND_Y - start * FLOOR_H;
    const wall = wallOf(L.floors.slice(0, start), info.dir);
    this.startTumble(group, px, py, info.dir, wall, TOPPLE_MAX, TOPPLE_DETACH, TOPPLE_MS, true);
    this.focus = { pivotY: py, groundAt: this.vis + TOPPLE_MS * 0.8 };
  }

  /** Skyscraper finish: sparkles over the top floors. */
  private onTopped(): void {
    const L = this.driver!.logic;
    const n = L.floors.length;
    for (let k = Math.max(1, n - 4); k < n; k++) {
      const img = this.tower[k];
      if (img) this.sparks.explode(8, img.x, img.y - FLOOR_H / 2);
    }
  }

  private startTumble(
    imgs: Phaser.GameObjects.Image[],
    px: number,
    py: number,
    dir: 1 | -1,
    wall: number[],
    maxAngle: number,
    detach: number,
    duration: number,
    loud: boolean,
  ): Tumble {
    const t: Tumble = {
      imgs,
      rx: imgs.map((img) => img.x - px),
      ry: imgs.map((img) => img.y - py),
      hw: imgs.map((img) => img.displayWidth / 2 - 6),
      ax: px,
      ay: py,
      dir,
      t0: this.vis,
      maxAngle,
      detach,
      duration,
      phase: 'tip',
      phi: 0,
      omega: 0,
      vx: 0,
      vy: 0,
      wall,
      cx: 0,
      cy: 0,
      phi0: 0,
      phi1: 0,
      settleAt: 0,
      settleMs: 1,
      landedAt: -1,
      loud,
    };
    this.tumbles.push(t);
    return t;
  }

  /**
   * Fit the camera to a `w` x `h` stage (1280x720 on 16:9): taller screens see more sky, wider
   * screens more city to both sides. The tower and crane stay centred.
   */
  setViewSize(w: number, h: number): void {
    this.extra = Math.max(0, h - 720);
    this.padX = Math.max(0, (w - 1280) / 2);
    const cam = this.cameras?.main;
    if (!cam) return;
    cam.setSize(w * TEX_SCALE, h * TEX_SCALE);
    cam.scrollX = -this.padX;
    if (this.ruler) this.ruler.x = -this.padX;
    this.drawRecordLine();
  }

  /* ---------------------------------------------------------------- frame */

  override update(_time: number, delta: number): void {
    const d = this.driver;
    if (!d) return;
    d.step();
    const L = d.logic;
    const t = d.now();
    const dt = Math.min(0.05, delta / 1000);
    this.vis += dt * 1000;

    this.updateCamera(L, dt);
    this.updateRig(L, t);
    this.updateFalling(L, t);
    this.updateTumbles(dt);
    this.updateMarker(L);
    this.updateRecord(d.recordFloors);
    d.frame(this.camY, t, dt * 1000);
  }

  private updateCamera(L: RusunLogic, dt: number): void {
    let target = Math.min(0, GROUND_Y - L.floors.length * FLOOR_H - TOP_SCREEN_Y);
    let rate = 3;
    if (this.focus) {
      target = this.vis < this.focus.groundAt ? Math.min(0, this.focus.pivotY - 420) : 0;
      rate = 2.4;
    }
    this.camY += (target - this.camY) * (1 - Math.exp(-dt * rate));
    if (Math.abs(target - this.camY) < 0.05) this.camY = target;
    this.cameras.main.scrollX = -this.padX;
    this.cameras.main.scrollY = this.camY - this.extra;
    this.crane.y = this.camY - this.extra;
    this.trolley.y = this.camY - this.extra + TROLLEY_Y;
  }

  private setRigFloor(index: number): void {
    if (this.rigIndex === index) return;
    this.rigIndex = index;
    this.hangFloor.setTexture(this.tex.key(index, true));
  }

  private updateRig(L: RusunLogic, t: number): void {
    let angle = this.angle;
    let lift = this.lift;
    let showFloor = false;
    switch (L.phase) {
      case 'swing':
      case 'waiting':
        angle = ropeAngle(L.swingX(t));
        lift = 0;
        showFloor = true;
        break;
      case 'intro':
      case 'settle': {
        // Reel the empty hook up, hang the next floor and lower it while it already swings, so
        // the turn starts with the pendulum at its far end.
        const turnAt = L.phaseEndsAt;
        const moveEnd = turnAt - DESCEND_MS;
        if (t < moveEnd) {
          const e = easeInOut(clamp01((t - this.rigFromT) / Math.max(1, moveEnd - this.rigFromT)));
          angle = lerp(this.rigFromAngle, ropeAngle(L.swingX(moveEnd)), e);
          lift = lerp(this.rigFromLift, LIFT, e);
        } else {
          angle = ropeAngle(L.swingX(t));
          lift = LIFT * (1 - easeOutCubic(clamp01((t - moveEnd) / DESCEND_MS)));
          showFloor = true;
        }
        break;
      }
      case 'falling': {
        // The empty hook swings on and bobs up a touch when the load lets go.
        const f = L.fall;
        angle = ropeAngle(L.swingX(t));
        lift = f ? 10 * Math.sin(Math.PI * clamp01((t - f.startAt) / 320)) : 0;
        break;
      }
      default:
        angle = this.angle * 0.96;
        lift = this.lift + (120 - this.lift) * 0.05;
        break;
    }
    this.angle = angle;
    this.lift = lift;

    // Everything hangs from one fixed point under the trolley.
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const px = CENTER_X;
    const py = this.camY - this.extra + PIVOT_Y;
    const r = ROPE - lift;
    this.cable
      .setPosition(px, py)
      .setRotation(-angle)
      .setVisible(r > 7);
    this.cable.scaleY = Math.max(0.01, r - 6);
    this.rig.setPosition(px + r * s, py + r * c).setRotation(-angle);
    this.hangFloor.setVisible(showFloor);
    this.slings.setVisible(showFloor);
    if (!showFloor) return;

    this.setRigFloor(L.floorIndex);
    const d = r + SLING_Y + FLOOR_H / 2;
    const cx = px + d * s;
    const cy = py + d * c;
    const tilt = -angle * FLOOR_TILT;
    placeFloor(this.hangFloor, cx, cy, tilt);
    // Two slings from the hook to the floor's top corners.
    const half = this.hangFloor.displayWidth / 2 - 4;
    const tc = Math.cos(tilt);
    const ts = Math.sin(tilt);
    const ly = -FLOOR_H / 2;
    this.slings.clear().lineStyle(2.5, 0x111214, 1);
    for (const side of [-1, 1]) {
      const lx = side * half;
      this.slings.lineBetween(
        px + r * s + side * 3 * c + 5 * s,
        py + r * c - side * 3 * s + 5 * c,
        cx + lx * tc - ly * ts,
        cy + lx * ts + ly * tc,
      );
    }
  }

  /** Straight down from where it hung, levelling out on the way; x never changes. */
  private updateFalling(L: RusunLogic, t: number): void {
    const f = L.fall;
    if (L.phase !== 'falling' || !f || !this.falling.visible) return;
    const p = clamp01((t - f.startAt) / Math.max(1, f.landAt - f.startAt));
    const cy1 = GROUND_Y - f.floorIndex * FLOOR_H - FLOOR_H / 2;
    const cy = this.fallCY0 + (cy1 - this.fallCY0) * p * p;
    const rot = this.fallRot0 * (1 - easeOutCubic(clamp01(p * 1.6)));
    placeFloor(this.falling, f.dropX, cy, rot);
  }

  private updateTumbles(dt: number): void {
    for (let k = this.tumbles.length - 1; k >= 0; k--) {
      const tb = this.tumbles[k]!;
      if (tb.phase !== 'rest') {
        this.stepTumble(tb, dt);
        this.placeTumble(tb);
      } else {
        // Floors part a little on impact, then fade.
        const since = this.vis - tb.landedAt;
        const spread = Math.min(1, since / 400);
        for (let i = 0; i < tb.imgs.length; i++) {
          const img = tb.imgs[i]!;
          img.x += tb.dir * (i + 1) * 6 * spread * dt;
          if (since > (tb.loud ? 1300 : 350)) img.alpha = Math.max(0, img.alpha - dt * (tb.loud ? 1.4 : 2.5));
        }
        if (tb.imgs[0]!.alpha <= 0) {
          for (const img of tb.imgs) img.destroy();
          this.tumbles.splice(k, 1);
        }
      }
    }
  }

  private stepTumble(tb: Tumble, dt: number): void {
    if (tb.phase === 'tip') {
      const e = clamp01((this.vis - tb.t0) / tb.duration);
      tb.phi = tb.dir * tb.maxAngle * e * e;
      if (Math.abs(tb.phi) >= tb.detach || e >= 1) {
        // Slip off the corner, keeping the spin it had.
        tb.phase = 'fall';
        tb.omega = (tb.dir * tb.maxAngle * 2 * e) / (tb.duration / 1000);
        tb.vx = tb.dir * 50;
      }
    } else if (tb.phase === 'fall') {
      tb.vy += GRAVITY * dt;
      tb.ay += tb.vy * dt;
      tb.ax += tb.vx * dt;
      tb.omega *= Math.exp(-SPIN_DAMP * dt);
      tb.phi = Math.max(-AIR_MAX, Math.min(AIR_MAX, tb.phi + tb.omega * dt));
    } else if (tb.phase === 'settle') {
      // Gravity pulls it down faster and faster: ease in.
      const e = clamp01((this.vis - tb.settleAt) / tb.settleMs);
      this.turnAbout(tb, lerp(tb.phi0, tb.phi1, e * e) - tb.phi);
    }

    // Contact: slide along the standing floors, stop on the street.
    const corners = this.corners(tb);
    let push = 0;
    let lowest = Number.NEGATIVE_INFINITY;
    let lowX = 0;
    for (let j = 0; j < corners.length; j += 2) {
      const x = corners[j]!;
      const y = corners[j + 1]!;
      if (y > lowest) {
        lowest = y;
        lowX = x;
      }
      const face = tb.wall[Math.floor((GROUND_Y - y) / FLOOR_H)];
      if (face !== undefined) push = tb.dir > 0 ? Math.max(push, face - x) : Math.min(push, face - x);
    }
    tb.ax += push;
    tb.cx += push;
    lowX += push;
    if (lowest > GROUND_Y) {
      tb.ay -= lowest - GROUND_Y;
      tb.cx = lowX;
      tb.cy = GROUND_Y;
    }
    if ((tb.phase === 'tip' || tb.phase === 'fall') && lowest >= GROUND_Y) this.beginSettle(tb, lowX);
    else if (tb.phase === 'settle' && this.vis - tb.settleAt >= tb.settleMs) {
      tb.phase = 'rest';
      tb.landedAt = this.vis;
      this.placeTumble(tb);
      this.landTumble(tb);
    }
  }

  /** A corner touched the street: lie down on the side the weight is on (flat, or on its side). */
  private beginSettle(tb: Tumble, cx: number): void {
    const c = Math.cos(tb.phi);
    const s = Math.sin(tb.phi);
    let mass = 0;
    let comX = 0;
    for (let i = 0; i < tb.imgs.length; i++) {
      const x = tb.ax + tb.rx[i]! * c - tb.ry[i]! * s;
      // Slab centre is half a floor above its bottom-centre origin.
      comX += tb.hw[i]! * (x + (FLOOR_H / 2) * s);
      mass += tb.hw[i]!;
    }
    comX /= Math.max(1, mass);
    const over = tb.phi !== 0 && (comX - cx) * tb.phi > 0;
    tb.phase = 'settle';
    tb.cx = cx;
    tb.cy = GROUND_Y;
    tb.phi0 = tb.phi;
    tb.phi1 = over ? Math.sign(tb.phi) * 90 * DEG : 0;
    tb.settleAt = this.vis;
    tb.settleMs = 150 + (280 * Math.abs(tb.phi1 - tb.phi0)) / (90 * DEG);
    this.puff(cx, GROUND_Y - 4, tb.loud ? 2 : 1);
  }

  /** Rotate the whole body by `delta` about its contact corner. */
  private turnAbout(tb: Tumble, delta: number): void {
    const c = Math.cos(delta);
    const s = Math.sin(delta);
    const dx = tb.ax - tb.cx;
    const dy = tb.ay - tb.cy;
    tb.ax = tb.cx + dx * c - dy * s;
    tb.ay = tb.cy + dx * s + dy * c;
    tb.phi += delta;
  }

  /** World corners of every slab, flattened as x0, y0, x1, y1, ... */
  private corners(tb: Tumble): number[] {
    const c = Math.cos(tb.phi);
    const s = Math.sin(tb.phi);
    const out: number[] = [];
    for (let i = 0; i < tb.imgs.length; i++) {
      const x = tb.ax + tb.rx[i]! * c - tb.ry[i]! * s;
      const y = tb.ay + tb.rx[i]! * s + tb.ry[i]! * c;
      const hw = tb.hw[i]!;
      for (const lx of [-hw, hw]) {
        for (const ly of [0, -FLOOR_H]) out.push(x + lx * c - ly * s, y + lx * s + ly * c);
      }
    }
    return out;
  }

  private placeTumble(tb: Tumble): void {
    const c = Math.cos(tb.phi);
    const s = Math.sin(tb.phi);
    for (let i = 0; i < tb.imgs.length; i++) {
      const img = tb.imgs[i]!;
      img.x = tb.ax + tb.rx[i]! * c - tb.ry[i]! * s;
      img.y = tb.ay + tb.rx[i]! * s + tb.ry[i]! * c;
      img.rotation = tb.phi;
    }
  }

  private landTumble(tb: Tumble): void {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (const img of tb.imgs) {
      minX = Math.min(minX, img.x);
      maxX = Math.max(maxX, img.x);
    }
    const steps = Math.min(6, 1 + Math.round((maxX - minX) / 80));
    for (let i = 0; i < steps; i++) {
      const x = steps === 1 ? minX : lerp(minX, maxX, i / (steps - 1));
      this.puff(x, GROUND_Y - 6, tb.loud ? 3 : 2);
    }
    if (tb.loud) {
      this.cameras.main.shake(260, 0.0012);
      this.driver?.impact();
    }
  }

  private updateMarker(L: RusunLogic): void {
    const on = L.phase === 'swing' || L.phase === 'waiting';
    this.marker.setVisible(on);
    if (!on) return;
    this.marker.x = L.top.x;
    this.marker.y = GROUND_Y - L.floors.length * FLOOR_H - 4;
    this.marker.alpha = 0.75 + 0.25 * Math.sin(this.vis / 140);
  }

  private updateRecord(record: number): void {
    if (record === this.shownRecord) return;
    this.shownRecord = record;
    this.recordLine.setVisible(record > 0);
    this.recordLine.y = GROUND_Y - record * FLOOR_H;
  }
}
