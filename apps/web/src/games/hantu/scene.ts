/**
 * Hantu Tak Terlihat's Phaser world, seen from above: the floor plan, doors, keys, fuse light and
 * exit under a dark layer (a half-resolution render texture with the lights erased out of it,
 * which softens their edges for free), the residents with their flashlight cones on top, film
 * grain over everything. The ghost is drawn only where a flashlight or a firefly lights it
 * (a geometry mask built from the same cones), and in full while dazzled or in the fuse flash.
 * It only renders: rules live in world.ts. It draws a `StageModel`: the Host's world itself, or on a
 * far-away screen in long-distance play the replica rebuilt from the Host's published state.
 *
 * Coordinates: map px (tile 40); the camera scrolls so the 1280×720 map sits centred in the stage.
 */
import { type Look, lookOfFruit, sameLook } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import {
  CONE_RAYS,
  conePolygon,
  FLY_MASK_SHARE,
  GHOST_BOB_TILES,
  GHOST_LIFT_TILES,
  GHOST_SPRITE_TILES,
  type Opaque,
} from './light';
import { COLS, type HauntMap, ROWS } from './maps';
import { drawMap, GLOW, GRAIN, HeadBank, KEY, makeSprites, RENDER_SCALE, skinKey, TILE } from './textures';
import { type GhostPing, PING_S, type Skin, TUNE } from './world';

const MAP_W = COLS * TILE;
const MAP_H = ROWS * TILE;
const DARK_SCALE = 2;

/** A resident as the scene draws it. */
export interface StageResident {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly face: number;
  readonly state: 'in' | 'fly' | 'out';
  /** Heartbeat 0..1 (0.7 and up: a scared face). */
  readonly heart: number;
  /** Below 0.15 the beam flickers. */
  readonly battery: number;
}

/** The ghost as the scene draws it. */
export interface StageGhost {
  readonly x: number;
  readonly y: number;
  readonly inX: number;
  readonly silau: number;
  readonly skin: Skin;
}

/** What the scene reads each frame: a `HauntWorld`, or a far-away screen's replica of one. */
export interface StageModel {
  readonly map: HauntMap;
  readonly tune: { readonly ambient: number; readonly range: number };
  readonly keys: readonly { readonly x: number; readonly y: number; readonly taken: boolean }[];
  readonly residents: readonly StageResident[];
  /** Null: nothing of the ghost is drawn (a far-away screen only learns where it is while it shows). */
  readonly ghost: StageGhost | null;
  readonly ping: GhostPing | null;
  readonly exitOpen: boolean;
  readonly fuse: number;
  readonly fuseOn: boolean;
  readonly flash: number;
  isShut(x: number, y: number): boolean;
  sight(): Opaque;
  shining(r: StageResident): boolean;
  ghostRevealed(): boolean;
  lampOn(): boolean;
}

export interface ResidentLook {
  name: string;
  look: Look;
  color: number;
}

interface ResidentView {
  body: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  face: Face;
  look: Look;
}

export class HantuScene extends Phaser.Scene {
  onFrame: ((deltaMs: number) => void) | null = null;
  readonly ready: Promise<void>;
  ox = 0;
  oy = 0;
  private resolveReady!: () => void;
  private heads!: HeadBank;
  private world: StageModel | null = null;
  private look: (id: number) => ResidentLook = () => ({
    name: '',
    look: lookOfFruit('jeruk'),
    color: 0xffffff,
  });
  private mapImg: Phaser.GameObjects.Image | null = null;
  private mapSeq = 0;
  private under!: Phaser.GameObjects.Graphics;
  private keys: Phaser.GameObjects.Image[] = [];
  private ghost!: Phaser.GameObjects.Image;
  private ghostSkin: Skin = 'bayangan';
  private ghostGlow!: Phaser.GameObjects.Image;
  private maskG!: Phaser.GameObjects.Graphics;
  private mask!: Phaser.Display.Masks.GeometryMask;
  private dark!: Phaser.GameObjects.RenderTexture;
  private lightG!: Phaser.GameObjects.Graphics;
  private beams!: Phaser.GameObjects.Graphics;
  private residents = new Map<number, ResidentView>();
  private grain!: Phaser.GameObjects.TileSprite;
  private flashRect!: Phaser.GameObjects.Rectangle;
  /** The red blink over the ghost's spot (above the darkness). */
  private pingG!: Phaser.GameObjects.Graphics;
  private outside!: Phaser.GameObjects.Graphics;
  private readonly poly: number[] = [];
  private frame = 0;
  private t0 = 0;
  /** A short white flash (catch, fuse): seconds left. */
  private pop = 0;

  constructor() {
    super('hantu');
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
    cam.setBackgroundColor('#050608');
    this.under = this.add.graphics().setDepth(2);
    this.ghostGlow = this.add
      .image(0, 0, GLOW)
      .setTint(0xa6f4e6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(3);
    this.ghost = this.add
      .image(0, 0, skinKey(this.ghostSkin))
      .setDepth(4)
      .setScale(1 / RENDER_SCALE);
    this.maskG = this.make.graphics({}, false);
    this.mask = this.maskG.createGeometryMask();
    this.dark = this.add
      .renderTexture(0, 0, MAP_W / DARK_SCALE, MAP_H / DARK_SCALE)
      .setOrigin(0, 0)
      .setScale(DARK_SCALE)
      .setDepth(10);
    this.lightG = this.make.graphics({}, false);
    this.beams = this.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    this.pingG = this.add.graphics().setDepth(12);
    this.outside = this.add.graphics().setDepth(30);
    this.grain = this.add.tileSprite(0, 0, 64, 64, GRAIN).setOrigin(0, 0).setDepth(31).setAlpha(0.12);
    this.flashRect = this.add.rectangle(0, 0, MAP_W, MAP_H, 0xfff6dc, 0).setOrigin(0, 0).setDepth(32);
    this.t0 = performance.now();
    this.resolveReady();
  }

  override update(_time: number, delta: number): void {
    this.onFrame?.(delta);
    this.render(delta / 1000);
  }

  setViewSize(w: number, h: number): void {
    this.ox = Math.round((w - MAP_W) / 2);
    this.oy = Math.round((h - MAP_H) / 2);
    this.cameras.main.setScroll(-this.ox, -this.oy);
    this.grain.setPosition(-this.ox, -this.oy).setSize(w, h);
    // Everything around the map stays pitch dark.
    this.outside.clear();
    this.outside.fillStyle(0x050608, 1);
    this.outside.fillRect(-this.ox, -this.oy, w, this.oy);
    this.outside.fillRect(-this.ox, MAP_H, w, h - MAP_H - this.oy);
    this.outside.fillRect(-this.ox, 0, this.ox, MAP_H);
    this.outside.fillRect(MAP_W, 0, w - MAP_W - this.ox, MAP_H);
  }

  attach(world: StageModel, look: (id: number) => ResidentLook): void {
    this.world = world;
    this.look = look;
    const key = `h-map-${++this.mapSeq}`;
    drawMap(this.textures, key, world.map);
    const old = this.mapImg;
    this.mapImg = this.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScale(1 / RENDER_SCALE)
      .setDepth(1);
    if (old) {
      const oldKey = old.texture.key;
      old.destroy();
      this.textures.remove(oldKey);
    }
    for (const k of this.keys) k.destroy();
    this.keys = world.keys.map((k) =>
      this.add
        .image(k.x * TILE + 20, k.y * TILE + 20, KEY)
        .setScale(1 / RENDER_SCALE)
        .setDepth(3),
    );
    for (const v of this.residents.values()) {
      v.body.destroy();
      v.ring.destroy();
      v.tag.destroy();
    }
    this.residents.clear();
    for (const r of world.residents) {
      const l = look(r.id);
      const ring = this.add
        .image(0, 0, GLOW)
        .setTint(l.color)
        .setDepth(12)
        .setAlpha(0.6)
        .setDisplaySize(60, 60);
      const body = this.add.image(0, 0, this.heads.key(l.look, 'happy')).setDepth(13);
      body.setDisplaySize(36, 36);
      const tag = this.add
        .text(0, 0, l.name, {
          fontFamily: '"Baloo 2", sans-serif',
          fontStyle: '800',
          fontSize: '14px',
          color: '#FFE7A8',
          stroke: '#101214',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1)
        .setDepth(14)
        .setResolution(RENDER_SCALE);
      this.residents.set(r.id, { body, ring, tag, face: 'happy', look: l.look });
    }
    if (world.ghost) this.setSkin(world.ghost.skin);
    this.ghost.setMask(this.mask);
  }

  /** Back to the empty dark house (a far-away screen whose Host has no round going). */
  detach(): void {
    this.world = null;
    for (const k of this.keys) k.destroy();
    this.keys = [];
    for (const v of this.residents.values()) {
      v.body.destroy();
      v.ring.destroy();
      v.tag.destroy();
    }
    this.residents.clear();
    this.mapImg?.setVisible(false);
    this.under.clear();
    this.beams.clear();
    this.pingG.clear();
    this.ghost.setVisible(false);
    this.ghostGlow.setVisible(false);
  }

  private setSkin(skin: Skin): void {
    if (skin === this.ghostSkin) return;
    this.ghostSkin = skin;
    this.ghost.setTexture(skinKey(skin));
  }

  toStage(x: number, y: number): { x: number; y: number } {
    return { x: this.ox + x * TILE, y: this.oy + y * TILE };
  }

  flash(strength = 1): void {
    this.pop = 0.35 * strength;
  }

  /* ------------------------------------------------------------------ frame */

  private render(dt: number): void {
    const w = this.world;
    this.frame++;
    if (this.frame % 2 === 0) this.grain.setTilePosition(Math.random() * 160, Math.random() * 160);
    this.pop = Math.max(0, this.pop - dt);
    if (!w) {
      this.dark.clear();
      this.dark.fill(0x050608, 1);
      return;
    }
    const now = (performance.now() - this.t0) / 1000;
    this.drawUnder(w, now);
    this.drawGhost(w, now);
    this.drawLights(w, now);
    this.drawResidents(w, now);
    this.drawPing(w);
    const flash = Math.max(w.flash > 0 ? Math.min(1, w.flash / 1.2) * 0.35 : 0, this.pop);
    this.flashRect.setFillStyle(0xfff6dc, flash);
  }

  private drawUnder(w: StageModel, now: number): void {
    const g = this.under;
    g.clear();
    // Doors: a panel across the doorway while shut, a thin open leaf otherwise.
    for (const d of w.map.doors) {
      const shut = w.isShut(d.x, d.y);
      const x = d.x * TILE;
      const y = d.y * TILE;
      g.fillStyle(shut ? 0x8a5a33 : 0x5b3a22, 1);
      if (shut) g.fillRect(x, y + 12, TILE, 16);
      else g.fillRect(x + 2, y + 2, 6, TILE - 4);
    }
    // Exit: dull while locked, glowing green once open.
    for (const e of w.map.exits) {
      g.fillStyle(w.exitOpen ? 0x22b35e : 0x5b3a22, w.exitOpen ? 0.8 + 0.2 * Math.sin(now * 6) : 1);
      g.fillRect(e.x * TILE + 4, e.y * TILE + 4, TILE - 8, TILE - 8);
    }
    // Fuse progress ring.
    const f = w.map.fuse;
    if (w.fuse > 0) {
      g.lineStyle(4, w.fuseOn ? 0xffc928 : 0xffe7a8, 1);
      g.beginPath();
      g.arc(f.x * TILE + 20, f.y * TILE + 20, 24, -Math.PI / 2, -Math.PI / 2 + w.fuse * Math.PI * 2);
      g.strokePath();
    }
    w.keys.forEach((k, i) => {
      const img = this.keys[i];
      if (!img) return;
      img.setVisible(!k.taken);
      img.y = k.y * TILE + 20 + Math.sin(now * 3 + i) * 2;
    });
  }

  /** Three red blinks with a growing ring where the ghost was when the ping fired. */
  private drawPing(w: StageModel): void {
    const g = this.pingG;
    g.clear();
    const p = w.ping;
    if (!p) return;
    const phase = ((p.age / PING_S) * 3) % 1;
    if (phase > 0.62) return;
    const grow = phase / 0.62;
    const x = p.x * TILE;
    const y = p.y * TILE;
    g.fillStyle(0xff2d2d, 0.5 * (1 - grow * 0.5));
    g.fillCircle(x, y, 20);
    g.lineStyle(5, 0xff3b30, 0.95 * (1 - grow * 0.6));
    g.strokeCircle(x, y, 26 + grow * 22);
  }

  private drawGhost(w: StageModel, now: number): void {
    const gh = w.ghost;
    this.ghost.setVisible(gh !== null);
    this.ghostGlow.setVisible(gh !== null);
    if (!gh) return;
    this.setSkin(gh.skin);
    const x = gh.x * TILE;
    const y = gh.y * TILE + Math.sin(now * 2.6) * GHOST_BOB_TILES * TILE;
    this.ghost.setPosition(x, y - GHOST_LIFT_TILES * TILE);
    this.ghost.setDisplaySize(GHOST_SPRITE_TILES * TILE, GHOST_SPRITE_TILES * TILE);
    this.ghost.setAngle(Math.sin(now * 1.8) * 6);
    this.ghost.setFlipX(gh.inX < 0);
    const revealed = w.ghostRevealed();
    if (revealed) this.ghost.clearMask();
    else this.ghost.setMask(this.mask);
    this.ghost.setAlpha(gh.silau > 0 ? 0.75 + 0.25 * Math.sin(now * 20) : 1);
    this.ghostGlow.setPosition(x, y);
    this.ghostGlow.setDisplaySize(90, 90);
    this.ghostGlow.setAlpha(revealed ? 0.35 : 0);
  }

  private cone(w: StageModel, x: number, y: number, face: number, range: number): number[] {
    return conePolygon(w.sight(), x, y, face, TUNE.coneHalf, range, CONE_RAYS, this.poly);
  }

  private drawLights(w: StageModel, now: number): void {
    const L = this.lightG;
    const M = this.maskG;
    const B = this.beams;
    L.clear();
    M.clear();
    B.clear();
    const k = 1 / DARK_SCALE;
    const lamps = w.lampOn();
    const ambient = w.tune.ambient + (w.flash > 0 ? 0.6 * Math.min(1, w.flash) : 0);
    const darkness = Math.max(0, Math.min(0.95, 1 - ambient + (lamps ? 0 : 0.06)));
    // Lamp pools (flickering a little).
    if (lamps) {
      for (const l of w.map.lamps) {
        const fl = 0.9 + 0.1 * Math.sin(now * 13 + l.x);
        this.softCircle(L, (l.x + 0.5) * TILE * k, (l.y + 0.5) * TILE * k, 2.6 * TILE * k * fl, 0.55);
      }
    }
    M.fillStyle(0xffffff, 1);
    for (const r of w.residents) {
      const px = r.x * TILE;
      const py = r.y * TILE;
      if (r.state === 'fly') {
        const rad = TUNE.flyGlow * TILE * (0.92 + 0.08 * Math.sin(now * 5 + r.id));
        this.softCircle(L, px * k, py * k, rad * k, 0.75);
        M.fillCircle(px, py, rad * FLY_MASK_SHARE);
        continue;
      }
      if (r.state !== 'in') continue;
      // A little light around everyone so their own spot is never pitch black.
      this.softCircle(L, px * k, py * k, 1.2 * TILE * k, 0.45);
      if (!w.shining(r)) continue;
      const flicker = r.battery < 0.15 && Math.sin(now * 40 + r.id) > 0.3 ? 0.5 : 1;
      const pts = this.cone(w, r.x, r.y, r.face, w.tune.range);
      // Three nested passes give the beam a soft end.
      for (const [scale, a] of [
        [1, 0.35],
        [0.75, 0.35],
        [0.45, 0.3],
      ] as const) {
        const ring: Phaser.Types.Math.Vector2Like[] = [];
        for (let i = 0; i < pts.length; i += 2) {
          const dx = pts[i]! - r.x;
          const dy = pts[i + 1]! - r.y;
          const d = Math.hypot(dx, dy);
          const lim = Math.min(d, w.tune.range * scale);
          const f = d > 0 ? lim / d : 0;
          ring.push({ x: (r.x + dx * f) * TILE * k, y: (r.y + dy * f) * TILE * k });
        }
        L.fillStyle(0xffffff, a * flicker);
        L.fillPoints(ring, true);
      }
      const beam: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < pts.length; i += 2) beam.push({ x: pts[i]! * TILE, y: pts[i + 1]! * TILE });
      M.fillPoints(beam, true);
      B.fillStyle(0xffe7a8, 0.08 * flicker);
      B.fillPoints(beam, true);
    }
    this.dark.clear();
    this.dark.fill(0x050608, darkness);
    this.dark.erase(L);
  }

  private softCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, a: number): void {
    g.fillStyle(0xffffff, a * 0.45);
    g.fillCircle(x, y, r);
    g.fillStyle(0xffffff, a * 0.35);
    g.fillCircle(x, y, r * 0.7);
    g.fillStyle(0xffffff, a * 0.3);
    g.fillCircle(x, y, r * 0.4);
  }

  /** A look's faces finished rasterizing: swap them in for its residents. */
  private headsReady(look: Look): void {
    for (const v of this.residents.values()) {
      if (sameLook(v.look, look)) v.body.setTexture(this.heads.key(v.look, v.face));
    }
  }

  private drawResidents(w: StageModel, now: number): void {
    for (const r of w.residents) {
      const v = this.residents.get(r.id);
      if (!v) continue;
      const out = r.state === 'out';
      v.body.setVisible(!out);
      v.ring.setVisible(!out);
      v.tag.setVisible(!out);
      if (out) continue;
      const fly = r.state === 'fly';
      const x = r.x * TILE;
      const y = r.y * TILE + (fly ? Math.sin(now * 4 + r.id) * 4 : 0);
      const look = this.look(r.id);
      const face: Face = fly ? 'sad' : r.heart >= 0.7 ? 'wow' : 'happy';
      if (face !== v.face || !sameLook(look.look, v.look)) {
        v.face = face;
        v.look = look.look;
        v.body.setTexture(this.heads.key(look.look, face));
      }
      const size = fly ? 22 : 36;
      v.body
        .setPosition(x, y)
        .setDisplaySize(size, size)
        .setAlpha(fly ? 0.85 : 1);
      v.ring.setPosition(x, y);
      v.ring.setTint(fly ? 0xffe7a8 : look.color);
      v.ring.setDisplaySize(fly ? 70 : 60, fly ? 70 : 60);
      v.ring.setAlpha(fly ? 0.8 : 0.55);
      v.tag.setPosition(x, y - (fly ? 14 : 22));
      if (v.tag.text !== look.name) v.tag.setText(look.name);
    }
  }
}
