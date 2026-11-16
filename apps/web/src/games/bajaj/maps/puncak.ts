/**
 * Jalur Puncak: a misty morning mountain road. Switchback hairpins climb a tea-plantation slope,
 * the ridge road runs through a tunnel, a lookout gazebo hangs over the valley, and the fast descent
 * loops back past a rest area with coffee stalls, corn carts and villas. Pines on the upper slopes,
 * a volcano ridge on the horizon.
 */
import * as THREE from 'three';
import { GeoBuilder, hash01, mix } from '../geo';
import { Instancer, motorbikeGeometry, personBodyGeometry, personHeadGeometry } from '../props';
import { STR } from '../strings';
import { asphaltTexture, blobTexture } from '../textures';
import type { Track } from '../track';
import {
  buildGantry,
  buildRoad,
  buildSky,
  bushGeometry,
  Chunks,
  frame,
  type Mats,
  pineGeometry,
  postGeometry,
  quadIn,
  rngFor,
  rockGeometry,
  textAtlas,
  toonMaterial,
  type V3,
} from './kit';
import type { MapScene } from './types';

/** Smooth value noise in [-1, 1]. */
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const h = (a: number, b: number) => hash01(a * 157.1 + b * 311.7) * 2 - 1;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * sx;
  const b = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * sx;
  return a + (b - a) * sz;
}

/** Hillside without the road: rising to the north, a valley to the south. */
function natural(x: number, z: number): number {
  const north = Math.max(-140, Math.min(260, -z));
  let y = 3 + north * 0.11 + vnoise(x * 0.012, z * 0.012) * 7 + vnoise(x * 0.05, z * 0.05) * 1.4;
  if (z < -150) y += (-150 - z) * 0.35;
  return y;
}

export function buildPuncak(T: Track): MapScene {
  const root = new THREE.Group();
  root.name = 'puncak';
  const M = T.marks;
  const tun = M.tunnel!;
  const vp = M.viewpoint!;
  const rnd = rngFor(77);
  const signs = textAtlas([
    ...STR.mountainSigns.map((text, i) => ({
      text,
      bg: ['#22B35E', '#FF5A1F', '#3A2A1A', '#F2453D', '#FFF7F0'][i % 5]!,
      fg: i % 5 === 4 ? '#22B35E' : '#FFF7F0',
    })),
    { text: STR.mountainGate, bg: '#1F6F43', fg: '#FFF7F0' },
    { text: STR.tunnelSign, bg: '#2A2B30', fg: '#FFC928' },
  ]);
  const mats: Mats = {
    toon: toonMaterial(),
    sign: new THREE.MeshBasicMaterial({ map: signs.texture, vertexColors: true }),
    road: new THREE.MeshLambertMaterial({ map: asphaltTexture() }),
    unlit: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const chunks = new Chunks();
  const steam: THREE.Vector3[] = [];
  const B = T.bounds;

  /* ---------------------------------------------------------------- terrain */
  // Nearest road sample lookup on a 20 m hash.
  const cell = 20;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < T.n; i++) {
    const key = `${Math.floor(T.x[i]! / cell)},${Math.floor(T.z[i]! / cell)}`;
    const b = buckets.get(key);
    if (b) b.push(i);
    else buckets.set(key, [i]);
  }
  const nearestRoad = (x: number, z: number): { d: number; i: number } => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    let best = Infinity;
    let bi = 0;
    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const list = buckets.get(`${cx + a},${cz + b}`);
        if (!list) continue;
        for (const i of list) {
          const d = (T.x[i]! - x) ** 2 + (T.z[i]! - z) ** 2;
          if (d < best) {
            best = d;
            bi = i;
          }
        }
      }
    }
    return { d: Math.sqrt(best), i: bi };
  };
  const inTunnel = (i: number) => {
    const s = i * T.step;
    return s > tun.s0 && s < tun.s1;
  };
  const height = (x: number, z: number): number => {
    const nat = natural(x, z);
    const r = nearestRoad(x, z);
    if (r.d > 46) return nat;
    const ry = T.y[r.i]!;
    if (inTunnel(r.i)) return Math.max(nat, ry + 10.5 - Math.max(0, r.d - 20) * 0.1);
    if (r.d < 13.5) return ry - 0.12;
    const t = (r.d - 13.5) / 32.5;
    const e = t * t * (3 - 2 * t);
    return ry - 0.12 + (nat - ry + 0.12) * e;
  };
  const GX0 = B.minX - 230;
  const GZ0 = B.minZ - 260;
  const GS = 5;
  const NX = Math.ceil((B.maxX + 230 - GX0) / GS);
  const NZ = Math.ceil((B.maxZ + 230 - GZ0) / GS);
  const hgrid = new Float32Array((NX + 1) * (NZ + 1));
  for (let j = 0; j <= NZ; j++)
    for (let i = 0; i <= NX; i++) hgrid[j * (NX + 1) + i] = height(GX0 + i * GS, GZ0 + j * GS);
  const groundAt = (x: number, z: number): number => {
    const fx = Math.max(0, Math.min(NX - 0.001, (x - GX0) / GS));
    const fz = Math.max(0, Math.min(NZ - 0.001, (z - GZ0) / GS));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h = (a: number, b: number) => hgrid[(j + b) * (NX + 1) + i + a]!;
    return (h(0, 0) * (1 - tx) + h(1, 0) * tx) * (1 - tz) + (h(0, 1) * (1 - tx) + h(1, 1) * tx) * tz;
  };
  {
    const pos = new Float32Array((NX + 1) * (NZ + 1) * 3);
    const col = new Float32Array((NX + 1) * (NZ + 1) * 3);
    const c = new THREE.Color();
    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) {
        const k = j * (NX + 1) + i;
        const x = GX0 + i * GS;
        const z = GZ0 + j * GS;
        const y = hgrid[k]!;
        pos.set([x, y, z], k * 3);
        const r = nearestRoad(x, z);
        const n = vnoise(x * 0.03, z * 0.03);
        if (r.d < 15 && !inTunnel(r.i)) c.setHex(0xa79a7c);
        else
          c.copy(mix(0x7fb453, 0x5f9a45, 0.5 + n * 0.5)).lerp(
            new THREE.Color(0x4f7f3f),
            Math.min(1, Math.max(0, (y - 20) / 40)),
          );
        col.set([c.r, c.g, c.b], k * 3);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i;
        idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    terrain.name = 'terrain';
    root.add(terrain);
  }

  /* ---------------------------------------------------------------- road */
  const uphill = new Int8Array(T.n);
  for (let i = 0; i < T.n; i++) {
    const s = i * T.step;
    const l = T.point(s, -26);
    const r = T.point(s, 26);
    const hl = natural(l.x, l.z) - T.y[i]!;
    const hr = natural(r.x, r.z) - T.y[i]!;
    uphill[i] = hl > 3 && hl > hr ? -1 : hr > 3 && hr > hl ? 1 : 0;
  }
  const posts = buildRoad(T, chunks, {
    curb: [0xf4f4f4, 0xf2453d],
    verge: (s) => (Math.floor(s / 4) % 2 ? 0x9aa067 : 0x8f965e),
    barrier: (s, side) => {
      if (s > tun.s0 - 4 && s < tun.s1 + 4) return 'none';
      return uphill[T.index(s)] === side ? 'stone' : 'rail';
    },
  });
  root.add(posts.build(postGeometry(), mats.toon));

  /* ---------------------------------------------------------------- tunnel */
  {
    const step = 2;
    const rx = 10.4;
    const ry = 7.6;
    const segs = 12;
    for (let s = tun.s0 - 2; s < tun.s1 + 2; s += step) {
      const f0 = T.frame(s);
      const f1 = T.frame(s + step);
      const c = chunks.at(f0.x, f0.z);
      const ring = Math.floor(s / 6) % 2 ? 0xd9d4cb : 0xcbc5ba;
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * Math.PI;
        const a1 = ((k + 1) / segs) * Math.PI;
        const pt = (f: typeof f0, a: number): V3 => {
          const d = Math.cos(a) * rx;
          return [f.x - f.tz * d, f.y + Math.sin(a) * ry, f.z + f.tx * d];
        };
        // Faces point into the tube.
        c.toon.quad(pt(f0, a1), pt(f1, a1), pt(f1, a0), pt(f0, a0), k < 2 || k >= segs - 2 ? 0xa8a398 : ring);
      }
      if (Math.floor(s / 8) !== Math.floor((s + step) / 8)) {
        c.unlit.prim(
          'box',
          f0.x,
          f0.y + ry - 0.25,
          f0.z,
          0.5,
          0.15,
          1.4,
          0xfff1b8,
          0,
          Math.atan2(f0.tx, f0.tz),
          0,
        );
      }
    }
    for (const [s, dir] of [
      [tun.s0 - 2, 1],
      [tun.s1 + 2, -1],
    ] as const) {
      const f = T.frame(s);
      const h = Math.atan2(f.tx, f.tz) + (dir < 0 ? Math.PI : 0);
      const m = frame(f.x, f.y, f.z, h);
      const c = chunks.at(f.x, f.z);
      for (const sx of [-1, 1]) c.toon.primIn(m, 'box', sx * 11.4, 4.2, 0, 2.2, 8.4, 1.8, 0xb9b3a8);
      c.toon.primIn(m, 'box', 0, 9.1, 0, 25, 2.2, 1.8, 0xb9b3a8);
      c.toon.primIn(m, 'box', 0, 9.1, -0.95, 25.2, 0.4, 0.1, 0xffc928);
      quadIn(
        c.sign,
        frame(f.x, f.y, f.z, h + Math.PI),
        0,
        9.1,
        0.95,
        7,
        1.2,
        signs.uv(STR.mountainSigns.length + 1),
      );
    }
  }

  /* ---------------------------------------------------------------- lookout */
  const people: { x: number; y: number; z: number; r: number }[] = [];
  {
    const i = T.index(vp.s);
    const wall = vp.side < 0 ? T.wallL[i]! : T.wallR[i]!;
    const p = T.point(vp.s, vp.side * (wall + 7));
    const y = T.y[i]!;
    const h = T.headingAt(vp.s) + (vp.side < 0 ? Math.PI / 2 : -Math.PI / 2);
    const m = frame(p.x, y, p.z, h);
    const c = chunks.at(p.x, p.z);
    c.toon.primIn(m, 'box', 0, -1.4, 0, 13, 3, 11, 0xa8a398);
    c.toon.primIn(m, 'box', 0, 0.12, 0, 12, 0.25, 10, 0xc9a35a);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) c.toon.primIn(m, 'cyl8', sx * 3.4, 1.9, sz * 3.4, 0.35, 3.6, 0.35, 0x7a5232);
    const roof = new THREE.ConeGeometry(0.5, 1, 4);
    c.toon.addGeometry(
      roof,
      new THREE.Matrix4().multiplyMatrices(
        m,
        new THREE.Matrix4().compose(
          new THREE.Vector3(0, 4.6, 0),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4),
          new THREE.Vector3(11, 2.4, 11),
        ),
      ),
      0x8e4a2a,
    );
    // Railing on the valley side.
    for (let k = -5; k <= 5; k++) c.toon.primIn(m, 'box', k * 1.1, 0.7, -4.9, 0.12, 1.1, 0.12, 0x7a5232);
    c.toon.primIn(m, 'box', 0, 1.2, -4.9, 12, 0.12, 0.14, 0x9c6b3c);
    c.toon.primIn(m, 'box', 0, 0.45, 1.5, 4, 0.12, 0.6, 0x9c6b3c);
    quadIn(c.sign, m, 0, 3.6, 3.75, 4.8, 0.85, signs.uv(4));
    for (let k = 0; k < 5; k++) {
      const v = new THREE.Vector3(-3 + k * 1.5, 0.25, -3.6).applyMatrix4(m);
      people.push({ x: v.x, y: v.y, z: v.z, r: h + Math.PI });
    }
  }

  /* ---------------------------------------------------------------- rest area by the start */
  const bikes = new Instancer();
  {
    const stall = (s: number, d: number, seed: number) => {
      const p = T.point(s, d);
      const gy = groundAt(p.x, p.z);
      const h = T.headingAt(s) + (d < 0 ? -Math.PI / 2 : Math.PI / 2);
      const m = frame(p.x, gy, p.z, h);
      const c = chunks.at(p.x, p.z);
      const roof = [0xf2453d, 0x2f8cff, 0x22b35e, 0xff8a3d][seed % 4]!;
      c.toon.primIn(m, 'box', 0, 0.1, -1.5, 6, 0.2, 5, 0xc9c3b8);
      for (const sx of [-1, 1])
        for (const sz of [0.3, -3.3]) c.toon.primIn(m, 'cyl6', sx * 2.6, 1.4, sz, 0.12, 2.8, 0.12, 0x8a9096);
      for (let k = 0; k < 6; k++)
        c.toon.primIn(m, 'box', -2.5 + k, 2.95, -1.5, 1.0, 0.06, 4.6, k % 2 ? roof : 0xfff7f0, 0.12, 0, 0);
      c.toon.primIn(m, 'box', 0, 0.8, -2.5, 4, 0.08, 1, 0x9c6b3c);
      c.toon.primIn(m, 'box', 0, 2.4, 0.42, 5.4, 0.8, 0.06, 0xfff7f0);
      quadIn(c.sign, m, 0, 2.4, 0.46, 5.2, 0.72, signs.uv(seed % STR.mountainSigns.length));
      steam.push(new THREE.Vector3(0, 1.6, -1).applyMatrix4(m));
      for (let k = 0; k < 3; k++) {
        const v = new THREE.Vector3(-2 + k * 2, 0, -2.6).applyMatrix4(m);
        people.push({ x: v.x, y: v.y, z: v.z, r: h + Math.PI });
      }
      for (let k = 0; k < 3; k++) {
        const v = new THREE.Vector3(-2 + k * 1.1, 0, 2.2).applyMatrix4(m);
        bikes.add(v.x, v.y, v.z, h + Math.PI / 2, 1, [0x2f8cff, 0xf2453d, 0x2a2b30][k]!);
      }
    };
    const sA = M.startStraight.s0;
    stall(sA + 6, 18, 0);
    stall(sA + 22, 18, 1);
    stall(T.length - 6, 18, 2);
    stall(30, 18, 3);
    stall(52, 18, 4);
    // Strawberry rows south-west of the start.
    const fieldC = T.point(sA + 20, 42);
    const c = chunks.at(fieldC.x, fieldC.z);
    for (let r = 0; r < 8; r++) {
      for (let k = 0; k < 14; k++) {
        const x = fieldC.x - 20 + k * 3;
        const z = fieldC.z - 10 + r * 2.6;
        const y = groundAt(x, z);
        c.toon.prim('box', x, y + 0.15, z, 2.6, 0.3, 1.0, 0x6a8f3a);
        c.toon.prim('gem', x - 0.5 + (k % 2) * 0.6, y + 0.4, z, 0.25, 0.25, 0.25, 0xf2453d);
      }
    }
  }
  // Villas with steep tile roofs on the lower slopes.
  {
    let placed = 0;
    for (let tries = 0; tries < 260 && placed < 22; tries++) {
      const x = B.minX - 60 + rnd() * (B.maxX - B.minX + 120);
      const z = B.minZ + 40 + rnd() * (B.maxZ - B.minZ + 60);
      const r = nearestRoad(x, z);
      if (r.d < 24 || r.d > 70) continue;
      const y = groundAt(x, z);
      const m = frame(x, y, z, rnd() * Math.PI * 2);
      const c = chunks.at(x, z);
      const wall = [0xfff7f0, 0xf4e3c1, 0xbfe3d0, 0xe8e2d6][placed % 4]!;
      c.toon.primIn(m, 'box', 0, 0.6, 0, 9, 3.6, 7, wall);
      c.toon.primIn(m, 'box', 0, -1.5, 0, 9.2, 1.6, 7.2, 0x9a938a);
      const roof = new THREE.ConeGeometry(0.5, 1, 4);
      c.toon.addGeometry(
        roof,
        new THREE.Matrix4().multiplyMatrices(
          m,
          new THREE.Matrix4().compose(
            new THREE.Vector3(0, 4.0, 0),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4),
            new THREE.Vector3(13.2, 3.4, 10.4),
          ),
        ),
        0xb5532a,
      );
      for (const sx of [-2.6, 0, 2.6]) c.toon.primIn(m, 'box', sx, 1.3, 3.51, 1.4, 1.2, 0.06, 0x3d5a73);
      c.toon.primIn(m, 'box', 0, 0.2, 4.2, 9, 0.2, 1.4, 0xc9c3b8);
      placed++;
    }
  }

  /* ---------------------------------------------------------------- tea bushes, pines, rocks */
  const tea = new Instancer();
  const pines = new Instancer();
  const rocks = new Instancer();
  for (let z = B.minZ - 200; z < B.maxZ + 150; z += 3.2) {
    for (let x = B.minX - 180; x < B.maxX + 180; x += 3.6) {
      const jx = x + (hash01(x * 0.7 + z) - 0.5) * 1.2;
      const r = nearestRoad(jx, z);
      if (r.d < 16) continue;
      const mask = vnoise(jx * 0.02 + 7, z * 0.02 - 3);
      const y = groundAt(jx, z);
      if (r.d < 110 && mask > 0.05 && y < 30) {
        tea.add(
          jx,
          y,
          z,
          hash01(jx + z * 3) * 3,
          0.9 + hash01(jx * 3 + z) * 0.3,
          mix(0xffffff, 0xd8f0c0, hash01(z * 0.1)),
        );
      } else if ((y > 18 || r.d > 130) && hash01(jx * 1.3 + z * 0.7) > 0.93) {
        pines.add(jx, y - 0.2, z, hash01(jx) * 6, 0.9 + hash01(z) * 0.7);
      } else if (r.d < 60 && hash01(jx * 2.1 + z * 1.7) > 0.992) {
        rocks.add(jx, y - 0.3, z, hash01(jx + 1) * 6, 0.6 + hash01(z + 1) * 0.8, 0xffffff);
      }
    }
  }
  root.add(
    tea.build(bushGeometry(), mats.toon),
    pines.build(pineGeometry(), mats.toon),
    rocks.build(rockGeometry(), mats.toon),
    bikes.build(motorbikeGeometry(), mats.toon),
  );
  // Tea pickers with caping hats among the rows.
  for (let k = 0; k < 18; k++) {
    for (let t = 0; t < 30; t++) {
      const x = B.minX + rnd() * (B.maxX - B.minX);
      const z = B.minZ - 20 + rnd() * 80;
      const r = nearestRoad(x, z);
      if (r.d < 20 || r.d > 60) continue;
      people.push({ x, y: groundAt(x, z), z, r: rnd() * 6 });
      const c = chunks.at(x, z);
      c.toon.prim('cone8', x, groundAt(x, z) + 1.95, z, 1.0, 0.35, 1.0, 0xd9b46a);
      break;
    }
  }
  {
    const body = new Instancer();
    const head = new Instancer();
    const shirts = [0x22b35e, 0xffc928, 0x2f8cff, 0xf2453d, 0xfff7f0, 0xff8a3d];
    const skin = [0xf3d9b1, 0xe0b98f, 0xc99a6e, 0xa8774d];
    people.forEach((p, i) => {
      body.add(p.x, p.y, p.z, p.r, 0.95, shirts[i % shirts.length]!);
      head.add(p.x, p.y, p.z, p.r, 0.95, skin[i % skin.length]!);
    });
    root.add(body.build(personBodyGeometry(), mats.toon), head.build(personHeadGeometry(), mats.toon));
  }

  // Gateway arch over the start straight.
  {
    const gs = M.startStraight.s0 + 12;
    const gp = T.point(gs, 0);
    const m = frame(gp.x, gp.y, gp.z, T.headingAt(gs));
    const c = chunks.at(gp.x, gp.z);
    for (const sx of [-1, 1]) c.toon.primIn(m, 'box', sx * 13.2, 3.4, 0, 1.2, 6.8, 1.2, 0x7a5232);
    c.toon.primIn(m, 'box', 0, 7.2, 0, 28, 1.0, 1.4, 0x8e4a2a);
    quadIn(
      c.sign,
      frame(gp.x, gp.y, gp.z, T.headingAt(gs) + Math.PI),
      0,
      7.2,
      0.72,
      9,
      0.9,
      signs.uv(STR.mountainSigns.length),
    );
  }

  const gantry = buildGantry(T, chunks, root, 0x22b35e, 0xfff7f0);
  chunks.flush(root, mats);

  /* ---------------------------------------------------------------- sky and mist */
  const sunDir = new THREE.Vector3(0.5, 0.55, -0.67).normalize();
  const far = new THREE.Group();
  {
    const fb = new GeoBuilder();
    fb.boxBevel = 0;
    for (let k = 0; k < 9; k++) {
      const a = -2.6 + (k / 9) * 2.2;
      const r = 420;
      const hgt = 70 + hash01(k * 3) * 70;
      fb.prim(
        'cone8',
        Math.cos(a) * r,
        hgt / 2 - 20,
        Math.sin(a) * r,
        150 + hash01(k) * 120,
        hgt,
        150,
        k % 2 ? 0x9db0bc : 0xa9bcc6,
      );
    }
    // The volcano with its crater rim.
    fb.addGeometry(
      new THREE.CylinderGeometry(22, 120, 140, 10, 1, true),
      new THREE.Matrix4().makeTranslation(-120, 50, -410),
      0x8fa3b0,
    );
    fb.prim('cyl12', -120, 120, -410, 46, 4, 46, 0x7f93a0);
    const ridge = new THREE.Mesh(
      fb.build(),
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
    );
    ridge.renderOrder = -8;
    far.add(ridge);
  }
  const sky = buildSky({
    top: 0x8ec2e6,
    horizon: 0xe4ecec,
    sunDir,
    sunColor: 0xfffbea,
    sunSize: 22,
    clouds: 14,
    far,
  });
  root.add(sky);
  const mistTex = blobTexture();
  const mists: { s: THREE.Sprite; x: number; z: number; ph: number }[] = [];
  for (let k = 0; k < 14; k++) {
    const mat = new THREE.SpriteMaterial({
      map: mistTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    const x = B.minX - 60 + rnd() * (B.maxX - B.minX + 120);
    const z = B.maxZ - 40 + rnd() * 160;
    s.position.set(x, groundAt(x, z) + 6 + rnd() * 6, z);
    s.scale.set(70, 22, 1);
    root.add(s);
    mists.push({ s, x, z, ph: rnd() * 6 });
  }

  return {
    id: 'puncak',
    kind: 'circuit',
    root,
    mood: {
      sunDir,
      sunColor: 0xfff4e0,
      sunIntensity: 1.9,
      hemiSky: 0xdfeef2,
      hemiGround: 0x7c8a5a,
      hemiIntensity: 1.35,
      fog: new THREE.Color(0xd8e3e5),
      fogNear: 70,
      fogFar: 340,
    },
    steam,
    fountain: null,
    setLights: gantry.setLights,
    update(t: number) {
      for (const m of mists) m.s.position.x = m.x + Math.sin(t * 0.05 + m.ph) * 25;
    },
    followSky(x: number, z: number) {
      sky.position.set(x, 0, z);
    },
  };
}
