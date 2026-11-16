/**
 * Shared building blocks for the Pantai, Puncak and arena maps: chunked merged geometry, the sky
 * dome with sun and clouds, a configurable road ribbon (curbs, markings, verges, barriers, piers,
 * bridges, tunnels), a start/finish gantry with its light, and a small painted sign atlas.
 */
import * as THREE from 'three';
import { GeoBuilder, hash01, paint, shade } from '../geo';
import { cloudGeometry, Instancer } from '../props';
import { gantryTexture, gradientMap } from '../textures';
import { CURB_W, ROAD_HALF, type Track } from '../track';

export type V3 = [number, number, number];

/* ------------------------------------------------------------------ materials */

export interface Mats {
  toon: THREE.MeshToonMaterial;
  sign: THREE.MeshBasicMaterial;
  road: THREE.MeshLambertMaterial;
  unlit: THREE.MeshBasicMaterial;
}

let gradient: THREE.DataTexture | null = null;
export function toonMaterial(opts: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  if (!gradient) gradient = gradientMap();
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient, ...opts });
}

/* ------------------------------------------------------------------ chunks */

export interface Chunk {
  toon: GeoBuilder;
  sign: GeoBuilder;
  road: GeoBuilder;
  unlit: GeoBuilder;
}

/** Geometry merged per 100 m cell and material, so frustum culling still works. */
export class Chunks {
  private readonly map = new Map<string, Chunk>();
  constructor(private readonly size = 100) {}

  at(x: number, z: number): Chunk {
    const key = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let c = this.map.get(key);
    if (!c) {
      c = {
        toon: new GeoBuilder(),
        sign: new GeoBuilder(true),
        road: new GeoBuilder(true),
        unlit: new GeoBuilder(),
      };
      for (const b of [c.toon, c.sign, c.road, c.unlit]) b.boxBevel = 0;
      this.map.set(key, c);
    }
    return c;
  }

  flush(root: THREE.Group, mats: Mats): void {
    for (const c of this.map.values()) {
      const add = (b: GeoBuilder, mat: THREE.Material, name: string) => {
        if (b.vertexCount === 0) return;
        const mesh = new THREE.Mesh(b.build(), mat);
        mesh.name = name;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        root.add(mesh);
      };
      add(c.road, mats.road, 'road');
      add(c.toon, mats.toon, 'toon');
      add(c.sign, mats.sign, 'signs');
      add(c.unlit, mats.unlit, 'unlit');
    }
  }
}

/* ------------------------------------------------------------------ painted signs */

export interface TextAtlas {
  texture: THREE.CanvasTexture;
  uv(i: number): [number, number, number, number];
}

/** One sign per row (512 x 96 each), painted with the brand display font. */
export function textAtlas(items: readonly { text: string; bg: string; fg: string }[]): TextAtlas {
  const W = 512;
  const H = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H * items.length;
  const g = c.getContext('2d')!;
  items.forEach((it, i) => {
    const y = i * H;
    g.fillStyle = it.bg;
    g.fillRect(0, y, W, H);
    g.strokeStyle = it.fg;
    g.globalAlpha = 0.8;
    g.lineWidth = 5;
    g.strokeRect(8, y + 8, W - 16, H - 16);
    g.globalAlpha = 1;
    g.fillStyle = it.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = 62;
    g.font = `800 ${px}px "Baloo 2", ui-rounded, sans-serif`;
    while (g.measureText(it.text).width > W - 50 && px > 14) {
      px -= 2;
      g.font = `800 ${px}px "Baloo 2", ui-rounded, sans-serif`;
    }
    g.fillText(it.text, W / 2, y + H / 2 + px * 0.08);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const n = items.length;
  return {
    texture: t,
    uv: (i: number) => [0.004, 1 - (i + 1) / n + 0.004, 0.996, 1 - i / n - 0.004],
  };
}

/** Textured quad facing local +z inside frame `m`. */
export function quadIn(
  b: GeoBuilder,
  m: THREE.Matrix4,
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  uv: readonly [number, number, number, number],
  tint: THREE.ColorRepresentation = 0xffffff,
): void {
  const v = new THREE.Vector3();
  const tp = (x: number, y: number, z: number): V3 => {
    v.set(x, y, z).applyMatrix4(m);
    return [v.x, v.y, v.z];
  };
  b.quad(
    tp(cx - w / 2, cy - h / 2, cz),
    tp(cx + w / 2, cy - h / 2, cz),
    tp(cx + w / 2, cy + h / 2, cz),
    tp(cx - w / 2, cy + h / 2, cz),
    tint,
    uv,
  );
}

export function frame(x: number, y: number, z: number, angle: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
    new THREE.Vector3(1, 1, 1),
  );
}

/* ------------------------------------------------------------------ sky */

export interface SkyOptions {
  top: number;
  horizon: number;
  sunDir: THREE.Vector3;
  sunColor: number;
  sunSize: number;
  clouds: number;
  cloudTint?: number;
  /** Optional far layer (mountain ridge, distant islands) added into the sky group. */
  far?: THREE.Object3D;
}

export function buildSky(o: SkyOptions): THREE.Group {
  const sky = new THREE.Group();
  sky.name = 'sky';
  const top = new THREE.Color(o.top);
  const hor = new THREE.Color(o.horizon);
  const dome = new THREE.SphereGeometry(490, 32, 16);
  paint(dome, (_x, y) => hor.clone().lerp(top, Math.max(0, Math.min(1, y / 330)) ** 0.7));
  const domeMesh = new THREE.Mesh(
    dome,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  domeMesh.renderOrder = -10;
  sky.add(domeMesh);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(o.sunSize, 32),
    new THREE.MeshBasicMaterial({ color: o.sunColor, fog: false, depthWrite: false }),
  );
  sun.position.copy(o.sunDir).multiplyScalar(460);
  sun.lookAt(0, 0, 0);
  sun.renderOrder = -9;
  sky.add(sun);
  if (o.far) sky.add(o.far);
  if (o.clouds > 0) {
    const cb = new GeoBuilder();
    for (let k = 0; k < o.clouds; k++) {
      const a = (k / o.clouds) * Math.PI * 2 + hash01(k) * 0.3;
      const r = 330 + hash01(k + 4) * 110;
      cb.addGeometry(
        cloudGeometry(k * 13 + 1),
        new THREE.Matrix4().compose(
          new THREE.Vector3(Math.cos(a) * r, 95 + hash01(k + 8) * 80, Math.sin(a) * r),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
          new THREE.Vector3(0.9, 0.65, 0.9),
        ),
        o.cloudTint ?? 0xffffff,
      );
    }
    const clouds = new THREE.Mesh(
      cb.build(),
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
    );
    clouds.renderOrder = -7;
    clouds.name = 'clouds';
    sky.add(clouds);
  }
  return sky;
}

/* ------------------------------------------------------------------ road */

export interface RoadOptions {
  curb: [number, number];
  /** Verge between the curb and the wall: colour by arc length (sand, grass, paving). */
  verge: (s: number, side: -1 | 1) => number;
  /** Barrier at the wall: 'rail' metal W-beam, 'wood' fence, 'stone' wall, 'none'. */
  barrier: (s: number, side: -1 | 1) => 'rail' | 'wood' | 'stone' | 'none';
  /** Deck under elevated road (piers, bridges): 'wood' planks on piles, 'stone' arch, null = embankment. */
  deck?: (s: number) => 'wood' | 'stone' | null;
  centerLine?: number;
  /** Road surface tint per arc length (wooden pier planks etc.). */
  surface?: (s: number) => 'asphalt' | 'planks';
}

/** Road ribbon, curbs, markings, verges and barriers along a track. */
export function buildRoad(T: Track, chunks: Chunks, o: RoadOptions): Instancer {
  const N = T.n;
  const posts = new Instancer();
  const P = (i: number, d: number, dy = 0): V3 => {
    const k = ((i % N) + N) % N;
    return [T.x[k]! - T.tz[k]! * d, T.y[k]! + dy, T.z[k]! + T.tx[k]! * d];
  };
  const W = ROAD_HALF;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const s0 = i * T.step;
    const mid = P(i, 0);
    const c = chunks.at(mid[0], mid[2]);
    const planks = o.surface?.(s0) === 'planks';
    if (planks) {
      const col = Math.floor(s0 / 0.9) % 2 ? 0xa8754a : 0x9a6a42;
      c.toon.quad(P(i, -W - CURB_W), P(i, W + CURB_W), P(j, W + CURB_W), P(j, -W - CURB_W), col);
      // Racing line markings painted on the planks.
      if (Math.floor(s0 / 3) % 2 === 0)
        c.toon.quad(P(i, -0.08, 0.01), P(i, 0.08, 0.01), P(j, 0.08, 0.01), P(j, -0.08, 0.01), 0xf2f2ee);
    } else {
      c.road.quad(P(i, -W), P(i, W), P(j, W), P(j, -W), 0xffffff, [-2, s0 / 4, 2, (s0 + T.step) / 4]);
      const band = Math.floor(s0 / 2.5) % 2;
      const curb = o.curb[band]!;
      c.toon.quad(P(i, -W - CURB_W, 0.06), P(i, -W, 0.06), P(j, -W, 0.06), P(j, -W - CURB_W, 0.06), curb);
      c.toon.quad(P(i, W, 0.06), P(i, W + CURB_W, 0.06), P(j, W + CURB_W, 0.06), P(j, W, 0.06), curb);
      c.toon.quad(P(j, -W, 0), P(j, -W, 0.06), P(i, -W, 0.06), P(i, -W, 0), shade(curb, 0.8));
      c.toon.quad(P(i, W, 0), P(i, W, 0.06), P(j, W, 0.06), P(j, W, 0), shade(curb, 0.8));
      const dash = Math.floor(s0 / 3) % 2 === 0;
      const lines: [number, number, boolean][] = [
        [o.centerLine ?? 0, 0.16, dash],
        [-W + 0.35, 0.2, true],
        [W - 0.35, 0.2, true],
      ];
      for (const [d, w, on] of lines) {
        if (on)
          c.toon.quad(
            P(i, d - w / 2, 0.015),
            P(i, d + w / 2, 0.015),
            P(j, d + w / 2, 0.015),
            P(j, d - w / 2, 0.015),
            0xf2f2ee,
          );
      }
    }
    const deck = o.deck?.(s0) ?? null;
    for (const side of [-1, 1] as const) {
      const wi = side < 0 ? T.wallL[i]! : T.wallR[i]!;
      const wj = side < 0 ? T.wallL[j]! : T.wallR[j]!;
      const a0 = W + CURB_W;
      const flip = (a: V3, b: V3, cc: V3, d: V3, col: THREE.ColorRepresentation) => {
        if (side < 0) c.toon.quad(b, a, d, cc, col);
        else c.toon.quad(a, b, cc, d, col);
      };
      // Verge
      if (wi - a0 > 0.3 && !deck) {
        const col = o.verge(s0, side);
        const yv = 0.08;
        flip(P(i, side * a0, yv), P(i, side * wi, yv), P(j, side * wj, yv), P(j, side * a0, yv), col);
      }
      if (deck) {
        // Deck edge and underside down to the ground or the sea.
        const out = side * (wi + 0.35);
        const outJ = side * (wj + 0.35);
        const yi = T.y[i]!;
        flip(
          P(j, outJ, -0.5),
          P(i, out, -0.5),
          P(i, out, 0.05),
          P(j, outJ, 0.05),
          deck === 'wood' ? 0x7a5232 : 0xcfc5b4,
        );
        if (side > 0)
          c.toon.quad(
            P(i, -wi - 0.35, -0.5),
            P(j, -wj - 0.35, -0.5),
            P(j, wj + 0.35, -0.5),
            P(i, wi + 0.35, -0.5),
            deck === 'wood' ? 0x5f4128 : 0xb9ae9c,
          );
        if (deck === 'wood' && i % 4 === 0) {
          for (const d of [-wi + 0.3, 0, wi - 0.3]) {
            const p = P(i, d);
            c.toon.prim('cyl8', p[0], (yi - 0.5 - 3) / 2, p[2], 0.42, yi - 0.5 + 3, 0.42, 0x6b4a2a);
          }
        }
      }
      const barrier = o.barrier(s0, side);
      const sI = side * (wi + 0.15);
      const sJ = side * (wj + 0.15);
      if (barrier === 'rail') {
        const col = 0xc7ccd2;
        flip(P(j, sJ, 0.5), P(i, sI, 0.5), P(i, sI, 0.85), P(j, sJ, 0.85), col);
        flip(P(i, sI, 0.5), P(j, sJ, 0.5), P(j, sJ, 0.85), P(i, sI, 0.85), shade(col, 0.8));
        if (i % 3 === 0) {
          const p = P(i, side * (wi + 0.28));
          posts.add(p[0], p[1], p[2], 0, 1, 0x8a9096);
        }
      } else if (barrier === 'wood') {
        for (const [y0, y1] of [
          [0.45, 0.6],
          [0.85, 1.0],
        ] as const) {
          flip(P(j, sJ, y0), P(i, sI, y0), P(i, sI, y1), P(j, sJ, y1), 0xc9955e);
          flip(P(i, sI, y0), P(j, sJ, y0), P(j, sJ, y1), P(i, sI, y1), 0x9c6b3c);
        }
        if (i % 2 === 0) {
          const p = P(i, side * (wi + 0.2));
          posts.add(p[0], p[1], p[2], 0, 1.15, 0x8a5a33);
        }
      } else if (barrier === 'stone') {
        const col = Math.floor(s0 / 3) % 2 ? 0x9a958c : 0xa8a398;
        flip(P(j, sJ, 0), P(i, sI, 0), P(i, sI, 0.9), P(j, sJ, 0.9), col);
        flip(
          P(j, sJ, 0.9),
          P(i, sI, 0.9),
          P(i, side * (wi + 0.6), 0.95),
          P(j, side * (wj + 0.6), 0.95),
          0xc9c3b8,
        );
      }
    }
  }
  return posts;
}

/** Post geometry for the barrier posts instancer (unit height ~0.9 m). */
export function postGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.boxBevel = 0;
  b.box(0, 0.5, 0, 0.16, 1.0, 0.16, 0xffffff);
  return b.build();
}

/* ------------------------------------------------------------------ gantry */

export interface Gantry {
  setLights(n: number): void;
}

/** START/FINIS arch over s = 0 with a hanging start light; pillar colour per map. */
export function buildGantry(
  T: Track,
  chunks: Chunks,
  root: THREE.Group,
  pillar: number,
  beam: number,
): Gantry {
  const f = T.frame(0);
  const h = Math.atan2(f.tx, f.tz);
  const m = frame(f.x, f.y, f.z, h);
  const c = chunks.at(f.x, f.z);
  for (const side of [-1, 1]) {
    const x = side * 13.4;
    c.toon.primIn(m, 'box', x, 4, 0, 1.0, 8, 1.0, pillar);
    for (let k = 0; k < 8; k++) c.toon.primIn(m, 'box', x, 0.5 + k, 0, 1.08, 0.12, 1.08, 0x111214);
  }
  c.toon.primIn(m, 'box', 0, 8.6, 0, 27.8, 1.4, 1.2, beam);
  const gb = new GeoBuilder(true);
  const v = new THREE.Vector3();
  const tp = (x: number, y: number, z: number): V3 => {
    v.set(x, y, z).applyMatrix4(m);
    return [v.x, v.y, v.z];
  };
  gb.quad(
    tp(12, 7.9, -0.62),
    tp(-12, 7.9, -0.62),
    tp(-12, 9.3, -0.62),
    tp(12, 9.3, -0.62),
    0xffffff,
    [0, 0, 0.5, 1],
  );
  gb.quad(
    tp(-12, 7.9, 0.62),
    tp(12, 7.9, 0.62),
    tp(12, 9.3, 0.62),
    tp(-12, 9.3, 0.62),
    0xffffff,
    [0.5, 0, 1, 1],
  );
  root.add(new THREE.Mesh(gb.build(), new THREE.MeshBasicMaterial({ map: gantryTexture() })));
  c.toon.primIn(m, 'box', 0, 6.4, -0.2, 1.1, 2.9, 0.7, 0x111214);
  const lamps: THREE.MeshBasicMaterial[] = [];
  for (let k = 0; k < 3; k++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x3a2a2a });
    lamps.push(mat);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), mat);
    const lp = tp(0, 7.15 - k * 0.9, -0.57);
    lamp.position.set(lp[0], lp[1], lp[2]);
    lamp.rotation.y = h + Math.PI;
    root.add(lamp);
  }
  return {
    setLights(n: number) {
      const off = [0x3a2a2a, 0x3a3320, 0x1f3326];
      lamps.forEach((mat, k) => {
        let col = off[k]!;
        if (n === 1 && k === 0) col = 0xff3b30;
        if (n === 2 && k === 1) col = 0xffc928;
        if (n === 3 && k === 2) col = 0x3ee07a;
        mat.color.setHex(col);
      });
    },
  };
}

/* ------------------------------------------------------------------ small geometry */

/** Tall stylised pine: trunk and three stacked cones. */
export function pineGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.boxBevel = 0;
  b.prim('cyl6', 0, 1.4, 0, 0.36, 2.8, 0.36, 0x6b4a2a);
  b.prim('cone8', 0, 3.8, 0, 3.6, 3.2, 3.6, 0x2f6b3e);
  b.prim('cone8', 0, 5.6, 0, 2.8, 2.8, 2.8, 0x37784a);
  b.prim('cone8', 0, 7.2, 0, 1.9, 2.4, 1.9, 0x3f8553);
  return b.build();
}

/** Rounded tea bush clump. */
export function bushGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.boxBevel = 0;
  b.prim('gem', 0, 0.45, 0, 1.6, 0.95, 1.4, 0x2f8a3f);
  b.prim('gem', 0.5, 0.6, 0.2, 1.0, 0.7, 0.9, 0x3a9d4a);
  return b.build();
}

/** Grey-brown boulder. */
export function rockGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.boxBevel = 0;
  b.prim('gem', 0, 0.6, 0, 2.2, 1.5, 1.9, 0x8d857a);
  b.prim('gem', 0.9, 0.4, 0.6, 1.2, 0.9, 1.1, 0x7a7268);
  return b.build();
}

/** Seated/standing spectator body + head are in props.ts; a simple flag pole is here. */
export function poleGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.boxBevel = 0;
  b.prim('cyl6', 0, 4, 0, 0.14, 8, 0.14, 0xe8ecef);
  return b.build();
}

/** A jukung fishing boat with outriggers (bow towards +z), coloured hull. */
export function boatGeometry(hull: number, stripe: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.boxBevel = 0;
  const shape = new THREE.Shape();
  shape.moveTo(-3.4, 0.9);
  shape.quadraticCurveTo(-3.0, 0.1, -1.8, 0);
  shape.lineTo(1.8, 0);
  shape.quadraticCurveTo(3.0, 0.1, 3.6, 1.1);
  shape.lineTo(2.8, 0.75);
  shape.lineTo(-2.7, 0.7);
  shape.closePath();
  const side = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false });
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-1, 0, 0),
  );
  m.setPosition(0.5, 0, 0);
  b.addGeometry(side, m, hull);
  b.box(0, 0.62, 0, 0.9, 0.06, 4.6, stripe);
  // Outrigger arms and floats
  for (const z of [-1.2, 1.2]) b.box(0, 0.85, z, 5.2, 0.1, 0.12, 0xc9a35a);
  for (const x of [-2.6, 2.6]) b.prim('cyl8', x, 0.35, 0, 0.22, 4.6, 0.22, 0xd9b46a, Math.PI / 2, 0, 0);
  // Little mast and a rolled sail
  b.prim('cyl6', 0, 2.0, 0.4, 0.08, 2.6, 0.08, 0x8a6a48);
  b.prim('cyl6', 0, 1.6, 0.4, 0.18, 1.6, 0.18, 0xfff7f0, Math.PI / 2, 0, 0);
  return b.build();
}

export function rngFor(seed: number): () => number {
  let s = seed;
  return () => hash01(s++ * 1.618 + 3.3);
}
