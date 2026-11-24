/**
 * The Phaser world of Rebut Wilayah: trail ribbons, player markers, beacons and effects, on a
 * transparent canvas over the ground layer (ground.ts: courtyard, frame, floor and the smooth
 * painted territories). It only renders; rules live in logic.ts and field.ts.
 *
 * Smoothness:
 * - The director advances the logic on a fixed 60 Hz step and writes the step progress (`alpha`)
 *   every frame; markers and trail tips are drawn between steps, headings eased.
 * - Trails are polylines of the real path (points every half unit), drawn as round ribbons with a
 *   dashed light centre drifting toward the head.
 * - What the ground shows lags the logic on purpose: captures reveal outward from the trail as a
 *   fill wave (fresh land flashes light first), spawns and knock-outs ripple from the head. Only
 *   rows that changed are sent to the ground layer.
 * - No allocations per frame in the drawing paths: scratch buffers are reused.
 */
import { type Look, sameLook } from '@hoorah/protocol';
import * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import { Ground } from './ground';
import { FIELD_W, FIELD_X, FIELD_Y, WORLD_H, WORLD_W } from './layout';
import type { MatchEvent, Runner, WilayahMatch } from './logic';
import { HeadBank, RENDER_SCALE } from './textures';
import { hexToInt, mix } from './tiles';
import { wrapAngle } from './trail';

const SPARK_KEY = 'wl-spark';
/** Capture wave: ms per raster cell of distance from the trail, capped so big captures land fast. */
const WAVE_STEP_MS = 9;
const WAVE_MAX_MS = 460;
const SPAWN_STEP_MS = 13;
const CLEAR_STEP_MS = 4;
const FLASH_MS = 190;
const SHIELD_PULSE_MS = 420;
const TRAIL_OUTLINE = 0x121316;

interface Wave {
  cells: ArrayLike<number>;
  dist: ArrayLike<number>;
  t0: number;
  step: number;
  k: number;
  /** 'flash': reveal in the fresh tint; 'settle': end the tint; 'plain': just reveal. */
  kind: 'flash' | 'settle' | 'plain';
}

interface Marker {
  id: number;
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  pointer: Phaser.GameObjects.Graphics;
  shield: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  look: Look;
  color: string;
  face: Face;
  /** Displayed head size (world px). */
  headSize: number;
  angle: number;
  alive: boolean;
  /** Pop-in / knock-out animation in progress: leave scale alone. */
  busy: boolean;
}

interface TrailStyle {
  color: number;
  light: number;
}

export class WilayahScene extends Phaser.Scene {
  /** Called at the start of every rendered frame (the director's tick). */
  onFrame: (() => void) | null = null;
  readonly ready: Promise<void>;
  /** Game clock and step progress for this frame, written by the director. */
  frameT = 0;
  alpha = 1;

  private resolveReady!: () => void;
  private heads!: HeadBank;
  private readonly groundHost: HTMLElement;
  private ground: Ground | null = null;
  private match: WilayahMatch | null = null;
  private viewW = WORLD_W;
  private viewH = WORLD_H;
  private cols = 1;
  /** World px per raster cell, and per unit. */
  private cell = 1;
  private unitPx = 1;
  /** What the ground currently shows (owner per cell), behind the logic during waves. */
  private shown = new Uint8Array(0);
  private fresh = new Uint8Array(0);
  private dirty0 = Number.POSITIVE_INFINITY;
  private dirty1 = -1;
  private waves: Wave[] = [];
  private readonly slotColor = new Map<number, string>();
  private readonly trailStyle = new Map<number, TrailStyle>();
  private readonly markers = new Map<number, Marker>();
  private trailG!: Phaser.GameObjects.Graphics;
  /** Rings pulsing around every marker during the countdown, so players find themselves. */
  private beaconG!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shatter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastUpdate = 0;
  /** Scratch: a trail in world px (x, y pairs). */
  private pts = new Float64Array(512);
  private readonly at = { x: 0, y: 0 };

  constructor(groundHost: HTMLElement) {
    super({ key: 'wilayah' });
    this.groundHost = groundHost;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  create(): void {
    this.heads = new HeadBank(this.textures, (look) => this.headsReady(look));
    this.makeTextures();
    this.setViewSize(this.viewW, this.viewH);
    this.trailG = this.add.graphics().setDepth(5);
    this.beaconG = this.add.graphics().setDepth(5.5);
    this.burst = this.add
      .particles(0, 0, SPARK_KEY, {
        emitting: false,
        lifespan: { min: 320, max: 640 },
        speed: { min: 60, max: 210 },
        scale: { start: 1, end: 0 },
        alpha: { start: 1, end: 0.2 },
        rotate: { min: 0, max: 360 },
      })
      .setDepth(8);
    this.shatter = this.add
      .particles(0, 0, SPARK_KEY, {
        emitting: false,
        lifespan: { min: 260, max: 520 },
        speed: { min: 8, max: 46 },
        scale: { start: 0.65, end: 0 },
        rotate: { min: 0, max: 360 },
      })
      .setDepth(8);
    this.resolveReady();
  }

  /** Build the layers for this match's floor. Call once, after `ready`. */
  setup(match: WilayahMatch): void {
    this.match = match;
    const { cols, rows, size } = match.field;
    this.cols = cols;
    this.cell = FIELD_W / cols;
    this.unitPx = this.cell * match.geo.unit;
    this.shown = new Uint8Array(size);
    this.fresh = new Uint8Array(size);
    this.ground?.canvas.remove();
    this.ground = new Ground(this.groundHost, cols, rows);
    this.ground.resize(this.viewW, this.viewH);
    for (const r of match.all()) this.ensureOwner(r);
    // Everything starts as floor; the starting homes arrive as spawn waves.
    this.ground.writeRows(this.shown, this.fresh, 0, rows - 1);
    this.ground.render();
    for (const r of match.all()) this.marker(r);
  }

  setViewSize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.ground?.resize(w, h);
    this.ground?.render();
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

  /** World px of a field point (cells, fractional). */
  toWorld(x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
    out.x = FIELD_X + x * this.cell;
    out.y = FIELD_Y + y * this.cell;
    return out;
  }

  /* ------------------------------------------------------------------ events */

  onEvent(e: MatchEvent, t: number): void {
    const m = this.match;
    if (!m) return;
    switch (e.type) {
      case 'spawn': {
        const r = m.runner(e.id);
        if (!r) return;
        this.ensureOwner(r);
        this.queueRadial(e.cells, e.x, e.y, t, SPAWN_STEP_MS, 'plain');
        const mk = this.marker(r);
        if (!e.first) this.popIn(mk);
        return;
      }
      case 'capture': {
        this.waves.push({ cells: e.cells, dist: e.dist, t0: t, step: WAVE_STEP_MS, k: 0, kind: 'flash' });
        this.waves.push({
          cells: e.cells,
          dist: e.dist,
          t0: t + FLASH_MS,
          step: WAVE_STEP_MS,
          k: 0,
          kind: 'settle',
        });
        const r = m.runner(e.id);
        if (r && e.gained >= 0.012) this.ring(e.x, e.y, r.color, Math.min(1, e.gained * 12));
        return;
      }
      case 'out': {
        const r = m.runner(e.id);
        const color = hexToInt(r?.color ?? '#FFFFFF');
        const p = this.toWorld(e.x, e.y, this.at);
        this.burst.setParticleTint(color);
        this.burst.explode(30, p.x, p.y);
        this.shatter.setParticleTint(color);
        // The trail shatters along its length.
        for (let k = 0; k + 1 < e.trail.length; k += 2) {
          const q = this.toWorld(e.trail[k]!, e.trail[k + 1]!, this.at);
          this.shatter.explode(2, q.x, q.y);
        }
        this.queueRadial(e.cleared, e.x, e.y, t + 160, CLEAR_STEP_MS, 'plain');
        const mk = this.markers.get(e.id);
        if (mk) this.knockOut(mk);
        return;
      }
      case 'leave': {
        for (const i of e.cleared) this.reveal(i, false);
        const mk = this.markers.get(e.id);
        if (mk) {
          mk.root.destroy();
          this.markers.delete(e.id);
        }
        return;
      }
      default:
        return;
    }
  }

  /** Short white flash over the whole view (time up). */
  flash(): void {
    this.cameras.main.flash(240, 255, 255, 255);
  }

  /* ------------------------------------------------------------------ frame */

  override update(time: number): void {
    this.onFrame?.();
    const m = this.match;
    if (!m) return;
    const dt = Math.min(100, Math.max(0, time - this.lastUpdate));
    this.lastUpdate = time;
    this.restyle(m);
    this.runWaves(this.frameT);
    this.flushGround();
    this.drawTrails(m);
    this.drawMarkers(m, dt);
    this.drawBeacons(m);
  }

  private drawBeacons(m: WilayahMatch): void {
    const g = this.beaconG;
    g.clear();
    if (m.phase !== 'countdown') return;
    const rad = this.markerSize() / 2;
    for (const r of m.all()) {
      if (!r.alive) continue;
      const p = this.toWorld(r.x, r.y, this.at);
      const color = hexToInt(r.color);
      for (const off of [0, 0.5]) {
        const k = (this.frameT / 1100 + off) % 1;
        g.lineStyle(3.5 * (1 - k) + 1, color, 0.9 * (1 - k));
        g.strokeCircle(p.x, p.y, rad + 4 + k * 34);
      }
    }
  }

  /* ------------------------------------------------------------------ ground */

  private runWaves(t: number): void {
    if (this.waves.length === 0) return;
    let keep = 0;
    for (const w of this.waves) {
      const n = w.cells.length;
      while (w.k < n && w.t0 + Math.min(WAVE_MAX_MS, w.dist[w.k]! * w.step) <= t) {
        const i = w.cells[w.k++]!;
        if (w.kind === 'settle') {
          if (this.fresh[i] === 1) {
            this.fresh[i] = 0;
            this.markRow(i);
          }
        } else this.reveal(i, w.kind === 'flash');
      }
      if (w.k < n) this.waves[keep++] = w;
    }
    this.waves.length = keep;
  }

  private reveal(i: number, flash: boolean): void {
    const m = this.match;
    if (!m) return;
    const o = m.field.owner[i]!;
    this.shown[i] = o;
    this.fresh[i] = flash && o !== 0 ? 1 : 0;
    this.markRow(i);
  }

  private markRow(i: number): void {
    const y = (i / this.cols) | 0;
    if (y < this.dirty0) this.dirty0 = y;
    if (y > this.dirty1) this.dirty1 = y;
  }

  private flushGround(): void {
    const ground = this.ground;
    if (!ground) return;
    if (this.dirty1 >= 0) {
      ground.writeRows(this.shown, this.fresh, this.dirty0, this.dirty1);
      this.dirty0 = Number.POSITIVE_INFINITY;
      this.dirty1 = -1;
    }
    ground.render();
  }

  /** Reveal cells in rings around (cx, cy) (cells), `msPerCell` apart. */
  private queueRadial(
    cells: readonly number[],
    cx: number,
    cy: number,
    t: number,
    msPerCell: number,
    kind: Wave['kind'],
  ): void {
    const n = cells.length;
    if (n === 0) return;
    const cols = this.cols;
    // Counting sort by whole-cell distance: big lands stay cheap.
    const d = new Int32Array(n);
    let top = 0;
    for (let k = 0; k < n; k++) {
      const i = cells[k]!;
      const v = Math.round(Math.hypot((i % cols) + 0.5 - cx, ((i / cols) | 0) + 0.5 - cy));
      d[k] = v;
      if (v > top) top = v;
    }
    const start = new Int32Array(top + 2);
    for (let k = 0; k < n; k++) start[d[k]! + 1]!++;
    for (let v = 1; v <= top + 1; v++) start[v]! += start[v - 1]!;
    const order = new Int32Array(n);
    const dist = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      const at = start[d[k]!]!++;
      order[at] = cells[k]!;
      dist[at] = d[k]!;
    }
    this.waves.push({ cells: order, dist, t0: t, step: msPerCell, k: 0, kind });
  }

  /** A runner changed colour (a computer player making way for a newcomer): repaint its land. */
  private restyle(m: WilayahMatch): void {
    for (const r of m.all()) this.ensureOwner(r);
  }

  /** Ground palette and trail colours for a runner's slot. */
  private ensureOwner(r: Runner): void {
    if (this.slotColor.get(r.v) === r.color) return;
    this.slotColor.set(r.v, r.color);
    this.ground?.setOwnerColor(r.v, r.color);
    this.trailStyle.set(r.v, { color: hexToInt(r.color), light: hexToInt(mix(r.color, '#FFFFFF', 0.82)) });
  }

  /* ------------------------------------------------------------------ trails */

  private drawTrails(m: WilayahMatch): void {
    const g = this.trailG;
    g.clear();
    const u = this.unitPx;
    const w = Math.max(5, u * 0.66);
    const ow = w + Math.max(3, u * 0.24);
    const period = Math.max(10, u * 1.7);
    const dash = period * 0.52;
    const dw = Math.max(1.6, w * 0.36);
    const flow = (this.frameT * 0.024) % period;
    const a = this.alpha;
    for (const r of m.all()) {
      if (!r.alive || r.trail.len === 0) continue;
      const style = this.trailStyle.get(r.v);
      if (!style) continue;
      const n = this.trailPoints(r, a);
      const pts = this.pts;
      g.lineStyle(ow, TRAIL_OUTLINE, 1);
      this.stroke(g, n);
      g.fillStyle(TRAIL_OUTLINE, 1);
      g.fillCircle(pts[0]!, pts[1]!, ow / 2);
      g.lineStyle(w, style.color, 1);
      this.stroke(g, n);
      g.fillStyle(style.color, 1);
      g.fillCircle(pts[0]!, pts[1]!, w / 2);
      g.lineStyle(dw, style.light, 0.95);
      this.dashes(g, n, period, dash, flow);
    }
  }

  /** A runner's trail in world px into `pts`, ending at its head drawn between steps. Returns the point count. */
  private trailPoints(r: Runner, alpha: number): number {
    const tr = r.trail;
    const need = (tr.len + 1) * 2;
    if (this.pts.length < need) this.pts = new Float64Array(need * 2);
    const pts = this.pts;
    const c = this.cell;
    for (let k = 0; k < tr.len; k++) {
      pts[k * 2] = FIELD_X + tr.xs[k]! * c;
      pts[k * 2 + 1] = FIELD_Y + tr.ys[k]! * c;
    }
    pts[tr.len * 2] = FIELD_X + (r.px + (r.x - r.px) * alpha) * c;
    pts[tr.len * 2 + 1] = FIELD_Y + (r.py + (r.y - r.py) * alpha) * c;
    return tr.len + 1;
  }

  private stroke(g: Phaser.GameObjects.Graphics, n: number): void {
    const pts = this.pts;
    g.beginPath();
    g.moveTo(pts[0]!, pts[1]!);
    for (let k = 1; k < n; k++) g.lineTo(pts[k * 2]!, pts[k * 2 + 1]!);
    g.strokePath();
  }

  /** Dashes along the path, continuous across points, drifting toward the head. */
  private dashes(
    g: Phaser.GameObjects.Graphics,
    n: number,
    period: number,
    dash: number,
    flow: number,
  ): void {
    const pts = this.pts;
    let along = 0;
    let open = false;
    for (let k = 0; k + 1 < n; k++) {
      const ax = pts[k * 2]!;
      const ay = pts[k * 2 + 1]!;
      const bx = pts[k * 2 + 2]!;
      const by = pts[k * 2 + 3]!;
      const len = Math.hypot(bx - ax, by - ay);
      if (len <= 1e-6) continue;
      const end = along + len;
      let s = along;
      while (s < end) {
        const ph = (((s - flow) % period) + period) % period;
        const on = ph < dash;
        let next = Math.min(end, s + (on ? dash - ph : period - ph));
        if (next - s < 1e-4) next = Math.min(end, s + 1e-3);
        if (on) {
          if (!open) {
            const f0 = (s - along) / len;
            g.beginPath();
            g.moveTo(ax + (bx - ax) * f0, ay + (by - ay) * f0);
            open = true;
          }
          const f1 = (next - along) / len;
          g.lineTo(ax + (bx - ax) * f1, ay + (by - ay) * f1);
        } else if (open) {
          g.strokePath();
          open = false;
        }
        s = next;
      }
      along = end;
    }
    if (open) g.strokePath();
  }

  /* ------------------------------------------------------------------ markers */

  private showHead(mk: Marker): void {
    mk.img.setTexture(this.heads.key(mk.look, mk.face)).setDisplaySize(mk.headSize, mk.headSize);
  }

  /** A look's head textures finished rasterizing: swap them in for its markers. */
  private headsReady(look: Look): void {
    for (const mk of this.markers.values()) if (sameLook(mk.look, look)) this.showHead(mk);
  }

  private markerSize(): number {
    return Math.min(38, Math.max(30, this.unitPx * 3));
  }

  private marker(r: Runner): Marker {
    let mk = this.markers.get(r.id);
    if (mk && sameLook(mk.look, r.look) && mk.color === r.color) return mk;
    mk?.root.destroy();
    const d = this.markerSize();
    const rad = d / 2;
    const color = hexToInt(r.color);
    const root = this.add.container(0, 0).setDepth(6);
    const body = this.add.container(0, 0);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.32);
    shadow.fillEllipse(0, rad * 0.7, d * 0.95, d * 0.42);
    const shield = this.add.graphics();
    shield.lineStyle(2.5, 0xffffff, 1);
    shield.strokeCircle(0, 0, rad + 6);
    shield.setVisible(false);
    const pointer = this.add.graphics();
    pointer.fillStyle(0x111214, 1);
    pointer.fillTriangle(rad + 1, -7.5, rad + 1, 7.5, rad + 11, 0);
    pointer.fillStyle(color, 1);
    pointer.fillTriangle(rad + 2.5, -5, rad + 2.5, 5, rad + 8.5, 0);
    const disc = this.add.graphics();
    disc.fillStyle(0x111214, 1);
    disc.fillCircle(0, 0, rad + 1.5);
    disc.fillStyle(color, 1);
    disc.fillCircle(0, 0, rad);
    disc.fillStyle(0xfffaf0, 1);
    disc.fillCircle(0, 0, rad - 3.2);
    const headSize = (rad - 1.6) * 2;
    const img = this.add.image(0, 0, this.heads.key(r.look, 'happy'));
    img.setDisplaySize(headSize, headSize);
    body.add([pointer, disc, img]);
    const label = this.add
      .text(0, rad + 9, r.name, {
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        fontStyle: '800',
        fontSize: '12px',
        color: '#FFFFFF',
        stroke: '#111214',
        strokeThickness: 3.5,
      })
      .setOrigin(0.5, 0.5)
      .setResolution(RENDER_SCALE * 2);
    root.add([shadow, shield, body, label]);
    mk = {
      id: r.id,
      root,
      body,
      img,
      pointer,
      shield,
      label,
      look: r.look,
      color: r.color,
      face: 'happy',
      headSize,
      angle: r.angle,
      alive: r.alive,
      busy: false,
    };
    pointer.setRotation(mk.angle);
    this.markers.set(r.id, mk);
    return mk;
  }

  private popIn(mk: Marker): void {
    mk.busy = true;
    mk.root.setAlpha(1).setVisible(true);
    mk.body.setScale(0.2);
    this.tweens.add({
      targets: mk.body,
      scale: 1,
      duration: 420,
      ease: 'Back.Out',
      onComplete: () => {
        mk.busy = false;
      },
    });
  }

  private knockOut(mk: Marker): void {
    mk.busy = true;
    this.tweens.add({
      targets: mk.root,
      alpha: 0,
      duration: 360,
      ease: 'Quad.In',
      onComplete: () => {
        mk.busy = false;
      },
    });
    this.tweens.add({ targets: mk.body, scale: 1.5, duration: 360, ease: 'Quad.Out' });
  }

  private ring(cx: number, cy: number, color: string, power: number): void {
    const p = this.toWorld(cx, cy, { x: 0, y: 0 });
    const g = this.add.graphics().setDepth(4).setPosition(p.x, p.y);
    g.lineStyle(4, hexToInt(mix(color, '#FFFFFF', 0.5)), 1);
    g.strokeCircle(0, 0, 18);
    g.setScale(0.4);
    this.tweens.add({
      targets: g,
      scale: 2.2 + power * 4,
      alpha: 0,
      duration: 520 + power * 300,
      ease: 'Cubic.Out',
      onComplete: () => g.destroy(),
    });
  }

  private drawMarkers(m: WilayahMatch, dt: number): void {
    const alpha = this.alpha;
    for (const r of m.all()) {
      const mk = this.marker(r);
      if (!r.alive) {
        mk.alive = false;
        if (!mk.busy) mk.root.setVisible(false);
        continue;
      }
      if (!mk.alive) {
        mk.alive = true;
        mk.angle = r.angle;
        if (!mk.busy) mk.root.setAlpha(1).setVisible(true);
      }
      const p = this.toWorld(r.px + (r.x - r.px) * alpha, r.py + (r.y - r.py) * alpha, this.at);
      mk.root.setPosition(p.x, p.y);
      // Ease the pointer toward the (interpolated) heading along the shortest turn.
      const target = r.pangle + wrapAngle(r.angle - r.pangle) * alpha;
      mk.angle += wrapAngle(target - mk.angle) * Math.min(1, dt / 40);
      mk.pointer.setRotation(mk.angle);
      const shielded = m.isProtected(r, this.frameT);
      mk.shield.setVisible(shielded);
      if (shielded)
        mk.shield.setAlpha(0.45 + 0.45 * Math.abs(Math.sin((this.frameT / SHIELD_PULSE_MS) * Math.PI)));
      const outside = r.trail.len > 0 || !m.isHome(r);
      const face: Face = shielded ? 'wow' : outside ? 'effort' : 'happy';
      if (face !== mk.face) {
        mk.face = face;
        this.showHead(mk);
      }
      // Whoever is out on a trail draws above those at home.
      mk.root.setDepth(outside ? 7 : 6);
      if (mk.label.text !== r.name) mk.label.setText(r.name);
    }
  }

  /* ------------------------------------------------------------------ static art */

  private makeTextures(): void {
    if (!this.textures.exists(SPARK_KEY)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, 9, 9, 2);
      g.generateTexture(SPARK_KEY, 9, 9);
      g.destroy();
    }
  }
}
