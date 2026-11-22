/**
 * Draws the solids of a `KotakSim`: one object per solid, built by the game (`build`), moved
 * every frame from the same pose function the simulation uses. Crumbling solids shake and flash
 * while they warn, drop away and fade when gone, and rise back when restored.
 *
 * `toyBlock` builds the house style: a chunky plastic block with a lighter top plate and a darker
 * base, so stacked platforms read clearly from the sofa.
 */
import * as THREE from 'three';
import type { KotakSim } from '../sim';
import { type Pose, poseAt, type Solid } from '../solids';
import type { KotakStage } from './stage';

const BOX = new THREE.BoxGeometry(1, 1, 1);

function tint(hex: string, k: number): THREE.Color {
  const c = new THREE.Color(hex);
  if (k >= 1) c.lerp(new THREE.Color('#ffffff'), k - 1);
  else c.multiplyScalar(k);
  return c;
}

export interface ToyOptions {
  /** Texture on the top plate (checker, arrows, symbols). */
  top?: THREE.Texture | null;
  /** Top plate colour (defaults to a lighter shade of the body). */
  topColor?: string;
  /** Skip the darker base band (thin solids). */
  flat?: boolean;
}

/** A plastic toy block of half size (hx, hy, hz) centred on its origin. */
export function toyBlock(
  stage: KotakStage,
  color: string,
  hx: number,
  hy: number,
  hz: number,
  opts: ToyOptions = {},
): THREE.Group {
  const g = new THREE.Group();
  const plate = Math.min(0.12, hy * 0.5);
  const bodyMat = stage.material(tint(color, 0.92), { rough: 0.6 });
  const body = new THREE.Mesh(BOX, bodyMat);
  body.scale.set(hx * 2, hy * 2 - plate, hz * 2);
  body.position.y = -plate / 2;
  g.add(body);
  const topMat = stage.material(
    opts.top ? '#ffffff' : (opts.topColor ?? `#${tint(color, 1.12).getHexString()}`),
    {
      rough: 0.5,
      map: opts.top ?? null,
    },
  );
  const top = new THREE.Mesh(BOX, topMat);
  top.scale.set(hx * 2, plate, hz * 2);
  top.position.y = hy - plate / 2;
  g.add(top);
  if (!opts.flat && hy > 0.25) {
    const base = new THREE.Mesh(BOX, stage.material(tint(color, 0.7), { rough: 0.7 }));
    base.scale.set(hx * 2 + 0.04, Math.min(0.14, hy * 0.4), hz * 2 + 0.04);
    base.position.y = -hy + Math.min(0.07, hy * 0.2);
    g.add(base);
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

/** A diagonal-stripe texture (hazard bars, conveyor belts). Repeat it with `repeat.set`. */
export function stripeTexture(a: string, b: string, size = 64): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = a;
    g.fillRect(0, 0, size, size);
    g.fillStyle = b;
    for (let i = -size; i < size * 2; i += size / 2) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + size / 4, 0);
      g.lineTo(i + size / 4 - size, size);
      g.lineTo(i - size, size);
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A two-colour checker texture (save points, finish line). */
export function checkerTexture(a: string, b: string, cells = 4, size = 128): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    const c = size / cells;
    for (let y = 0; y < cells; y++)
      for (let x = 0; x < cells; x++) {
        g.fillStyle = (x + y) % 2 ? b : a;
        g.fillRect(x * c, y * c, c, c);
      }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** How long the drop and the rise animations take (s). */
const DROP_S = 0.9;
const RISE_S = 0.35;

export type SolidBuilder = (solid: Solid) => THREE.Object3D | null;

export class SolidLayer {
  readonly group = new THREE.Group();
  private readonly views: (THREE.Object3D | null)[] = [];
  private readonly pose: Pose = { x: 0, y: 0, z: 0, yaw: 0 };
  /** Called for objects that warn: lets the game flash its own colours. 0..1 warn progress. */
  onWarn: ((solid: Solid, obj: THREE.Object3D, k: number) => void) | null = null;

  constructor(
    private readonly sim: KotakSim,
    build: SolidBuilder,
  ) {
    for (const s of sim.solids) {
      const obj = build(s);
      this.views.push(obj);
      if (obj) this.group.add(obj);
    }
  }

  object(id: number): THREE.Object3D | null {
    return this.views[id] ?? null;
  }

  /** Place every solid for sim time `t` (interpolated between steps). */
  update(t: number): void {
    const sim = this.sim;
    for (let i = 0; i < sim.solids.length; i++) {
      const obj = this.views[i];
      if (!obj) continue;
      const s = sim.solids[i]!;
      poseAt(s.def, t, this.pose);
      let y = this.pose.y;
      let sx = 0;
      let sz = 0;
      let scale = 1;
      obj.visible = true;
      if (s.state === 'warn') {
        const span = Math.max(0.05, s.until - s.since);
        const k = Math.min(1, (t - s.since) / span);
        const amp = 0.03 + 0.07 * k;
        sx = Math.sin(t * 61) * amp;
        sz = Math.cos(t * 47) * amp;
        this.onWarn?.(s, obj, k);
      } else if (s.state === 'gone') {
        const k = (t - s.since) / DROP_S;
        if (k >= 1) obj.visible = false;
        else {
          y -= k * k * 7;
          scale = 1 - k * 0.35;
        }
      } else if (t - s.since < RISE_S && s.since > 0) {
        const k = (t - s.since) / RISE_S;
        y -= (1 - k) * (1 - k) * 2.5;
      }
      obj.position.set(this.pose.x + sx, y, this.pose.z + sz);
      obj.rotation.y = this.pose.yaw;
      obj.scale.setScalar(scale);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry !== BOX) m.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
