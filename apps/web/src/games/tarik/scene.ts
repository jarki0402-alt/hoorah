/**
 * The Phaser world: festival field, rope, pullers, dust and mud. It only renders; all rules live
 * in logic.ts. The director writes `view` every frame and calls the effect methods on events.
 * Hot paths (update, rope drawing) reuse preallocated buffers and never allocate.
 */
import { type Look, sameLook } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import type { Team } from './logic';
import {
  BG_KEY,
  CHAR_BOX,
  CHAR_PX,
  charKey,
  FLAG_BOX,
  FLAG_KEY,
  HEAD,
  HeadBank,
  lookId,
  RENDER_SCALE,
  WING_KEY,
} from './textures';
import { WING_ART } from './wings';

export const WORLD_W = 1280;
export const WORLD_H = 720;
/** Feet line of the front pullers. */
const FEET_Y = 636;
const FRONT_X: Record<Team, number> = { red: 400, blue: 880 };
/** World px per character unit for the front puller (same scale as the key art at 1280 wide). */
const UNIT = 2;
/** World px the rope center travels from the middle to a win line (|p| = 1). */
export const TRAVEL = 200;
const HAND = { x: 47, y: -72 } as const;
const HEAD_CENTER_Y = HEAD.y + HEAD.size / 2;
const DEG = Math.PI / 180;
const CURVE_SEGS = 22;
const MAX_POINTS = 96;
const STRAND_GAP = 12;
const MUD_TINT = 0xc49a72;
const ROPE_DARK = 0x5c3a1c;
const ROPE_MAIN = 0xa0692f;
const ROPE_FIBER = 0xdcaa6c;
const TEAM_ORDER: readonly Team[] = ['red', 'blue'];

export interface RosterEntry {
  id: number;
  look: Look;
  connected: boolean;
}

/** Written by the director every frame. */
export interface WorldView {
  /** Rope position in [-1, 1], negative = toward Merah. */
  p: number;
  /** Effective taps/s per player, super bonus included. */
  force: Record<Team, number>;
  /** True while the round is being pulled (dust, strain). */
  pulling: boolean;
}

type Mode = 'pull' | 'stumble' | 'cheer';

interface Puller {
  id: number;
  team: Team;
  slot: number;
  /** +1 faces right (Merah), -1 faces left (Biru). */
  dir: 1 | -1;
  unit: number;
  homeX: number;
  homeY: number;
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  look: Look;
  /** Expression on the head image ('effort' while pulling). */
  faceName: Face;
  bob: number;
  bobV: number;
  seed: number;
  mode: Mode;
  /** 0..1 blend back to the pulling pose after a reset, so nobody teleports out of the mud. */
  recover: number;
}

export class TarikScene extends Phaser.Scene {
  readonly view: WorldView = { p: 0, force: { red: 0, blue: 0 }, pulling: false };
  /** Called at the start of every rendered frame (the director's tick). */
  onFrame: (() => void) | null = null;
  readonly ready: Promise<void>;

  private resolveReady!: () => void;
  private readonly images: Map<string, HTMLImageElement>;
  private readonly teams: Record<Team, Puller[]> = { red: [], blue: [] };
  private heads!: HeadBank;
  private rosterKey = '';
  private dispP = 0;
  private readonly strain: Record<Team, number> = { red: 0, blue: 0 };
  private readonly kick: Record<Team, number> = { red: 0, blue: 0 };
  private readonly dustBudget: Record<Team, number> = { red: 0, blue: 0 };
  private dustTurn = 0;
  private snap = 0;
  private nudge = 0;
  private nudgeV = 0;
  private punch = 0;
  private baseScrollX = 0;
  /** Visible stage size (1280x720 on 16:9; taller screens see more sky, wider ones more field). */
  private viewH = WORLD_H;
  private viewW = WORLD_W;
  private ropeG!: Phaser.GameObjects.Graphics;
  private flag!: Phaser.GameObjects.Image;
  private dust!: Record<Team, Phaser.GameObjects.Particles.ParticleEmitter>;
  private mud!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly ropeX = new Float32Array(MAX_POINTS);
  private readonly ropeY = new Float32Array(MAX_POINTS);
  private ropeN = 0;
  private readonly tmp = { x: 0, y: 0 };

  constructor(images: Map<string, HTMLImageElement>) {
    super({ key: 'tarik' });
    this.images = images;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  create(): void {
    for (const [key, img] of this.images) {
      if (!this.textures.exists(key)) this.textures.addImage(key, img);
    }
    this.heads = new HeadBank(this.textures, (look) => this.headsReady(look));
    this.makeParticleTextures();

    this.setViewSize(this.viewW, this.viewH);

    this.add.image(0, 0, BG_KEY).setOrigin(0, 0).setDisplaySize(WORLD_W, WORLD_H).setDepth(0);
    const wingW = WING_ART * 2;
    this.add.image(-wingW, 0, WING_KEY.left).setOrigin(0, 0).setDisplaySize(wingW, WORLD_H).setDepth(0);
    this.add.image(WORLD_W, 0, WING_KEY.right).setOrigin(0, 0).setDisplaySize(wingW, WORLD_H).setDepth(0);
    this.drawChalk();

    this.ropeG = this.add.graphics().setDepth(10);
    this.flag = this.add
      .image(WORLD_W / 2, 470, FLAG_KEY)
      .setOrigin(-FLAG_BOX.x / FLAG_BOX.w, -FLAG_BOX.y / FLAG_BOX.h)
      .setScale(1.4 / 3)
      .setDepth(12);

    const dustConfig = (
      angleMin: number,
      angleMax: number,
    ): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig => ({
      lifespan: { min: 380, max: 720 },
      speed: { min: 30, max: 120 },
      angle: { min: angleMin, max: angleMax },
      scale: { start: 0.9, end: 0.25 },
      alpha: { start: 0.8, end: 0 },
      gravityY: -30,
      tint: 0xf3d9b0,
      emitting: false,
    });
    this.dust = {
      red: this.add.particles(0, 0, 'tarik-puff', dustConfig(195, 250)).setDepth(40),
      blue: this.add.particles(0, 0, 'tarik-puff', dustConfig(290, 345)).setDepth(40),
    };
    this.mud = this.add
      .particles(0, 0, 'tarik-puff', {
        lifespan: { min: 500, max: 900 },
        speed: { min: 140, max: 330 },
        angle: { min: 215, max: 325 },
        scale: { start: 0.85, end: 0.35 },
        alpha: { start: 1, end: 0.2 },
        gravityY: 760,
        tint: [0x7a4e2c, 0x8a5a34, 0x6b4423],
        emitting: false,
      })
      .setDepth(41);

    this.resolveReady();
  }

  private makeParticleTextures(): void {
    if (this.textures.exists('tarik-puff')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(12, 12, 12);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(12, 12, 9);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(12, 12, 6);
    g.generateTexture('tarik-puff', 24, 24);
    g.clear();
    g.fillStyle(0x111214, 0.2);
    g.fillEllipse(60, 12, 120, 24);
    g.generateTexture('tarik-shadow', 120, 24);
    g.destroy();
  }

  /** Chalk win lines with little team pennants where the flag must arrive. */
  private drawChalk(): void {
    const g = this.add.graphics().setDepth(2);
    for (const team of ['red', 'blue'] as const) {
      const x = WORLD_W / 2 + (team === 'red' ? -TRAVEL : TRAVEL);
      g.fillStyle(0xfff7f0, 0.92);
      for (let y = 500; y < WORLD_H; y += 24) {
        if (y > 566 && y < 650 && Math.abs(x - WORLD_W / 2) < 150) continue;
        g.fillRoundedRect(x - 3, y, 6, 14, 3);
      }
      const color = team === 'red' ? 0xf2453d : 0x2f8cff;
      g.fillStyle(0x5a3a1a, 1);
      g.fillRect(x - 2, 666, 4, 46);
      g.fillStyle(color, 1);
      g.lineStyle(2, 0x111214, 1);
      const d = team === 'red' ? -1 : 1;
      g.beginPath();
      g.moveTo(x, 666);
      g.lineTo(x + d * 26, 674);
      g.lineTo(x, 682);
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
  }

  /* ------------------------------------------------------------------ roster */

  setRoster(red: readonly RosterEntry[], blue: readonly RosterEntry[]): void {
    const key = [red, blue]
      .map((list) => list.map((r) => `${r.id}:${lookId(r.look)}:${r.connected ? 1 : 0}`).join(','))
      .join('|');
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    for (const team of ['red', 'blue'] as const) {
      for (const pl of this.teams[team]) {
        this.tweens.killTweensOf(pl.root);
        pl.root.destroy();
        pl.shadow.destroy();
      }
      const list = team === 'red' ? red : blue;
      this.teams[team] = list.map((entry, slot) => this.makePuller(team, slot, list.length, entry));
    }
  }

  private makePuller(team: Team, slot: number, count: number, entry: RosterEntry): Puller {
    const dir: 1 | -1 = team === 'red' ? 1 : -1;
    const spacing = count > 1 ? Math.min(100, 270 / (count - 1)) : 0;
    const unit = UNIT * Math.max(0.7, 1 - 0.08 * slot);
    const homeX = FRONT_X[team] - dir * slot * spacing;
    const homeY = FEET_Y - slot * 12;
    const body = this.add
      .image(0, 0, charKey(team))
      .setOrigin(-CHAR_BOX.x / CHAR_BOX.w, -CHAR_BOX.y / CHAR_BOX.h)
      .setScale(1 / CHAR_PX);
    const face = this.add
      .image(0, HEAD_CENTER_Y, this.heads.key(entry.look, 'effort'))
      .setDisplaySize(HEAD.size, HEAD.size);
    const root = this.add
      .container(homeX, homeY, [body, face])
      .setScale(dir * unit, unit)
      .setRotation(-dir * 20 * DEG)
      .setDepth(30 - slot)
      .setAlpha(entry.connected ? 1 : 0.45);
    const shadow = this.add
      .image(homeX, homeY + 2, 'tarik-shadow')
      .setScale(unit / UNIT)
      .setDepth(5)
      .setAlpha(entry.connected ? 1 : 0.4);
    return {
      id: entry.id,
      team,
      slot,
      dir,
      unit,
      homeX,
      homeY,
      root,
      body,
      face,
      shadow,
      look: entry.look,
      faceName: 'effort',
      bob: 0,
      bobV: 0,
      seed: entry.id * 1.618 + slot * 2.3,
      mode: 'pull',
      recover: 1,
    };
  }

  /* ------------------------------------------------------------------ effects */

  /** Taps landed for a team: pullers bob and dig in. */
  teamTap(team: Team, taps: number): void {
    const impulse = 26 * Math.min(3, taps);
    for (const pl of this.teams[team]) pl.bobV -= impulse;
  }

  /** A super pull: camera nudge toward the team, rope snap, dust burst, hard lean. */
  superPull(team: Team): void {
    const d = team === 'red' ? -1 : 1;
    this.nudgeV += d * 150;
    this.punch = Math.max(this.punch, 0.014);
    this.snap = 1;
    this.kick[team] = 1;
    for (const pl of this.teams[team]) pl.bobV -= 70;
    const front = this.teams[team][0];
    if (front) this.dust[team].explode(10, front.root.x - front.dir * 14, front.homeY - 2);
  }

  roundEnd(winner: Team | null): void {
    if (!winner) {
      for (const team of ['red', 'blue'] as const) for (const pl of this.teams[team]) this.setFace(pl, 'wow');
      return;
    }
    const loser: Team = winner === 'red' ? 'blue' : 'red';
    this.teams[loser].forEach((pl, i) => {
      pl.mode = 'stumble';
      this.setFace(pl, 'wow');
      this.tweens.add({
        targets: pl.root,
        x: pl.root.x + pl.dir * (110 + i * 12),
        y: pl.homeY + 16,
        rotation: pl.dir * 34 * DEG,
        duration: 620,
        delay: i * 90,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.setFace(pl, 'sad');
          pl.body.setTint(MUD_TINT);
          this.mud.explode(i === 0 ? 18 : 8, pl.root.x + pl.dir * 26, pl.homeY + 6);
          if (i === 0) {
            this.nudgeV += -pl.dir * 60;
            this.punch = Math.max(this.punch, 0.01);
          }
        },
      });
    });
    this.teams[winner].forEach((pl, i) => {
      this.cheer(pl, i, 3);
    });
    this.nudgeV += (winner === 'red' ? -1 : 1) * 90;
  }

  /** Match won: the winners keep jumping. */
  celebrate(winner: Team): void {
    this.teams[winner].forEach((pl, i) => {
      this.tweens.killTweensOf(pl.root);
      this.cheer(pl, i, -1);
    });
  }

  private cheer(pl: Puller, i: number, repeat: number): void {
    pl.mode = 'cheer';
    this.setFace(pl, 'happy');
    this.tweens.add({ targets: pl.root, rotation: -pl.dir * 4 * DEG, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: pl.root,
      y: pl.homeY - 26,
      duration: 230,
      delay: 200 + i * 70,
      yoyo: true,
      repeat,
      ease: 'Sine.easeOut',
    });
  }

  /** New round: everyone walks back to the pulling pose. */
  resetRound(): void {
    for (const team of ['red', 'blue'] as const) {
      for (const pl of this.teams[team]) {
        this.tweens.killTweensOf(pl.root);
        pl.mode = 'pull';
        pl.recover = 0;
        this.setFace(pl, 'effort');
        pl.body.clearTint();
      }
    }
  }

  private setFace(pl: Puller, face: Face): void {
    pl.faceName = face;
    pl.face.setTexture(this.heads.key(pl.look, face)).setDisplaySize(HEAD.size, HEAD.size);
  }

  /** A look's head textures finished rasterizing: swap them in for its pullers. */
  private headsReady(look: Look): void {
    for (const team of TEAM_ORDER) {
      for (const pl of this.teams[team]) if (sameLook(pl.look, look)) this.setFace(pl, pl.faceName);
    }
  }

  /** World position of a team's front puller's head (for HUD floaters). World = stage coords. */
  headAnchor(team: Team, out: { x: number; y: number }): { x: number; y: number } {
    const pl = this.teams[team][0];
    if (!pl) {
      out.x = FRONT_X[team];
      out.y = 380;
      return out;
    }
    const r = pl.root;
    const ly = HEAD_CENTER_Y * r.scaleY;
    out.x = r.x - ly * Math.sin(r.rotation);
    out.y = r.y + ly * Math.cos(r.rotation);
    return out;
  }

  /* ------------------------------------------------------------------ frame */

  override update(time: number, delta: number): void {
    this.onFrame?.();
    const dt = Math.min(delta, 50) / 1000;
    const v = this.view;
    this.dispP += (v.p - this.dispP) * (1 - Math.exp(-dt * 9));
    const shift = this.dispP * TRAVEL;
    const ease = 1 - Math.exp(-dt * 6);
    for (let ti = 0; ti < TEAM_ORDER.length; ti++) {
      const team = TEAM_ORDER[ti]!;
      const target = v.pulling ? Math.min(1.3, v.force[team] / 9) : 0;
      this.strain[team] += (target - this.strain[team]) * ease;
      this.kick[team] *= Math.exp(-dt * 5);
      const pullers = this.teams[team];
      for (let i = 0; i < pullers.length; i++) this.posePuller(pullers[i]!, shift, time, dt);
    }
    this.snap *= Math.exp(-dt * 4);
    this.buildRope(time);
    this.drawRope();
    this.emitDust(dt);
    this.updateCamera(dt);
  }

  private posePuller(pl: Puller, shift: number, time: number, dt: number): void {
    pl.bobV += (-220 * pl.bob - 16 * pl.bobV) * dt;
    pl.bob += pl.bobV * dt;
    const root = pl.root;
    if (pl.mode !== 'pull') {
      pl.shadow.x = root.x;
      return;
    }
    const s = this.strain[pl.team];
    const k = this.kick[pl.team];
    const ph = pl.seed;
    const jitterX = s * (Math.sin(time * 0.047 + ph) * 1.6 + Math.sin(time * 0.083 + ph * 1.7) * 0.9);
    const lean =
      18 + s * 9 + k * 7 + Math.sin(time * 0.0035 + ph) * 1.2 + s * Math.sin(time * 0.061 + ph * 2.3) * 1.1;
    const tx = pl.homeX + shift + jitterX;
    const ty = pl.homeY + pl.bob;
    const tr = -pl.dir * lean * DEG;
    if (pl.recover < 1) {
      pl.recover = Math.min(1, pl.recover + dt * 1.8);
      const a = 1 - Math.exp(-dt * 9);
      root.x += (tx - root.x) * a;
      root.y += (ty - root.y) * a;
      root.rotation += (tr - root.rotation) * a;
    } else {
      root.x = tx;
      root.y = ty;
      root.rotation = tr;
    }
    pl.shadow.x = root.x;
  }

  private hand(pl: Puller, out: { x: number; y: number }): void {
    const r = pl.root;
    const lx = HAND.x * r.scaleX;
    const ly = HAND.y * r.scaleY;
    const c = Math.cos(r.rotation);
    const s = Math.sin(r.rotation);
    out.x = r.x + lx * c - ly * s;
    out.y = r.y + lx * s + ly * c;
  }

  private push(x: number, y: number): void {
    if (this.ropeN >= MAX_POINTS) return;
    this.ropeX[this.ropeN] = x;
    this.ropeY[this.ropeN] = y;
    this.ropeN++;
  }

  /** Rope as one polyline: Merah tail, Merah hands, sagging span, Biru hands, Biru tail. */
  private buildRope(time: number): void {
    this.ropeN = 0;
    const h = this.tmp;
    const red = this.teams.red;
    const blue = this.teams.blue;
    const shift = this.dispP * TRAVEL;
    const last = red[red.length - 1];
    if (last) {
      this.push(last.root.x - 86 * (last.unit / UNIT), last.homeY + 4);
      for (let i = red.length - 1; i >= 0; i--) {
        this.hand(red[i]!, h);
        this.push(h.x, h.y);
      }
    } else {
      this.push(FRONT_X.red + shift - 60, FEET_Y);
      this.push(FRONT_X.red + shift + 40, FEET_Y - 6);
    }
    const ax = this.ropeX[this.ropeN - 1]!;
    const ay = this.ropeY[this.ropeN - 1]!;
    let bx: number;
    let by: number;
    const front = blue[0];
    if (front) {
      this.hand(front, h);
      bx = h.x;
      by = h.y;
    } else {
      bx = FRONT_X.blue + shift - 40;
      by = FEET_Y - 6;
    }
    const tension = Math.min(1, (this.view.force.red + this.view.force.blue) / 14);
    const strain = this.strain.red + this.strain.blue;
    const sag =
      26 * (1 - 0.85 * tension) +
      (1 - tension * 0.5) * 2.5 * Math.sin(time * 0.006) +
      strain * 1.3 * Math.sin(time * 0.11) +
      this.snap * 9 * Math.sin(time * 0.045);
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2 + 2 * sag;
    for (let j = 1; j < CURVE_SEGS; j++) {
      const t = j / CURVE_SEGS;
      const u = 1 - t;
      this.push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
    }
    if (front) {
      for (let i = 0; i < blue.length; i++) {
        this.hand(blue[i]!, h);
        this.push(h.x, h.y);
      }
      const tail = blue[blue.length - 1]!;
      this.push(tail.root.x + 86 * (tail.unit / UNIT), tail.homeY + 4);
    } else {
      this.push(bx, by);
      this.push(FRONT_X.blue + shift + 60, FEET_Y);
    }
    // Flag rides the middle of the span.
    this.flag.x = 0.25 * ax + 0.5 * cx + 0.25 * bx;
    this.flag.y = 0.25 * ay + 0.5 * cy + 0.25 * by;
    this.flag.rotation = Math.sin(time * 0.004) * 0.12 + this.snap * Math.sin(time * 0.03) * 0.2;
  }

  private strokeRope(): void {
    const g = this.ropeG;
    g.beginPath();
    g.moveTo(this.ropeX[0]!, this.ropeY[0]!);
    for (let i = 1; i < this.ropeN; i++) g.lineTo(this.ropeX[i]!, this.ropeY[i]!);
    g.strokePath();
  }

  private drawRope(): void {
    const g = this.ropeG;
    g.clear();
    if (this.ropeN < 2) return;
    g.lineStyle(17, ROPE_DARK, 1);
    this.strokeRope();
    g.lineStyle(12, ROPE_MAIN, 1);
    this.strokeRope();
    // Twisted fibers: short diagonal strands at fixed arc-length steps, so they ride with the rope.
    g.lineStyle(3, ROPE_FIBER, 1);
    let next = STRAND_GAP / 2;
    let acc = 0;
    for (let i = 0; i < this.ropeN - 1; i++) {
      const x0 = this.ropeX[i]!;
      const y0 = this.ropeY[i]!;
      const dx = this.ropeX[i + 1]! - x0;
      const dy = this.ropeY[i + 1]! - y0;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) continue;
      const tx = dx / len;
      const ty = dy / len;
      const ex = (tx * 0.5 - ty * 0.85) * 5;
      const ey = (ty * 0.5 + tx * 0.85) * 5;
      while (next <= acc + len) {
        const u = (next - acc) / len;
        const px = x0 + dx * u;
        const py = y0 + dy * u;
        g.lineBetween(px - ex, py - ey, px + ex, py + ey);
        next += STRAND_GAP;
      }
      acc += len;
    }
  }

  private emitDust(dt: number): void {
    if (!this.view.pulling) return;
    for (let ti = 0; ti < TEAM_ORDER.length; ti++) {
      const team = TEAM_ORDER[ti]!;
      const pullers = this.teams[team];
      if (pullers.length === 0) continue;
      this.dustBudget[team] += this.view.force[team] * dt * 1.3;
      while (this.dustBudget[team] >= 1) {
        this.dustBudget[team] -= 1;
        const pl = pullers[this.dustTurn++ % pullers.length]!;
        if (pl.mode !== 'pull') continue;
        this.dust[team].emitParticleAt(pl.root.x - pl.dir * (10 + Math.random() * 22), pl.homeY - 2, 1);
      }
    }
  }

  /**
   * Fit the camera to a `w` x `h` stage (1280x720 on 16:9). The field sits at the bottom and the
   * rope stays centred: extra height is sky, extra width shows the field wings and more crowd.
   */
  setViewSize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    const cam = this.cameras?.main;
    if (!cam) return;
    cam.setSize(w * RENDER_SCALE, h * RENDER_SCALE);
    cam.setZoom(RENDER_SCALE);
    cam.centerOn(WORLD_W / 2, WORLD_H - h / 2);
    this.baseScrollX = cam.scrollX;
  }

  /** Stage px of world (0, 0): HUD floaters add this to world coordinates. */
  worldOrigin(out: { x: number; y: number }): { x: number; y: number } {
    out.x = (this.viewW - WORLD_W) / 2;
    out.y = this.viewH - WORLD_H;
    return out;
  }

  private updateCamera(dt: number): void {
    this.nudgeV += (-160 * this.nudge - 13 * this.nudgeV) * dt;
    this.nudge += this.nudgeV * dt;
    this.punch *= Math.exp(-dt * 6);
    const cam = this.cameras.main;
    cam.scrollX = this.baseScrollX + this.nudge;
    // Zoom in a touch while nudged so the world edges never show.
    cam.zoom = RENDER_SCALE * (1 + (Math.abs(this.nudge) * 2.2) / WORLD_W + this.punch);
  }
}
