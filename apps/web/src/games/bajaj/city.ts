/**
 * The static world around the circuit: road with curbs, lane lines and pavements, guardrails,
 * the flyover over a busy boulevard, the roundabout with its tugu and fountain, the start/finish
 * gantry with grandstand and crowd, ruko rows, warung tenda, gerobak bakso, billboards, trees,
 * lamps, bunting, umbul-umbul, sky, clouds, kites and a distant skyline. Geometry is merged per
 * 90 m chunk and material so the whole city costs a few dozen draw calls.
 */
import * as THREE from 'three';
import { addBlock, addRuko, addTower, type ChunkBuilders, frameMatrix, Grid, signQuad } from './buildings';
import { GeoBuilder, hash01, mix, paint, shade } from './geo';
import { lightMaterials } from './look';
import type { MapScene } from './maps/types';
import {
  carGeometry,
  cloudGeometry,
  flagMaterial,
  Instancer,
  kiteGeometry,
  lampGeometry,
  motorbikeGeometry,
  palmGeometry,
  personBodyGeometry,
  personHeadGeometry,
  treeGeometry,
  type WaveUniforms,
} from './props';
import type { SignAtlas } from './textures';
import { CURB_W, ROAD_HALF, type Track } from './track';

export interface CityAssets {
  signs: SignAtlas;
  gantry: THREE.Texture;
  windows: THREE.Texture;
  asphalt: THREE.Texture;
  grain: THREE.Texture;
  water: THREE.Texture;
  skyline: THREE.Texture;
  gradient: THREE.Texture;
}

const CHUNK = 90;
const SKY_TOP = new THREE.Color(0x3e9be0);
const SKY_HORIZON = new THREE.Color(0xcfe6f2);
const PAVING = [0xd3ccbe, 0xc4bdae];
const GRASS = 0x6dbe5a;
const CONCRETE = 0xd9d4cb;

type V3 = [number, number, number];

export function buildCity(T: Track, A: CityAssets): MapScene {
  const root = new THREE.Group();
  root.name = 'city';
  const waves: WaveUniforms = { uTime: { value: 0 } };

  /* ---------------------------------------------------------------- materials */
  const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: A.gradient });
  const signMat = new THREE.MeshBasicMaterial({ map: A.signs.texture, vertexColors: true });
  const facadeMat = new THREE.MeshLambertMaterial({ map: A.windows, vertexColors: true });
  const roadMat = new THREE.MeshLambertMaterial({ map: A.asphalt });
  const groundMat = new THREE.MeshLambertMaterial({ map: A.grain, vertexColors: true });
  const decalMat = new THREE.MeshBasicMaterial({
    map: A.signs.texture,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const flagMat = flagMaterial(waves);
  A.grain.repeat.set(1, 1);

  /* ---------------------------------------------------------------- chunks */
  const chunks = new Map<
    string,
    ChunkBuilders & {
      ground: GeoBuilder;
      road: GeoBuilder;
      decal: GeoBuilder;
      flag: GeoBuilder;
    }
  >();
  const chunk = (x: number, z: number) => {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let c = chunks.get(key);
    if (!c) {
      // The chunk's main geometry keeps a coarse twin for far-away viewing (see the flush).
      const toonB = new GeoBuilder();
      toonB.lod = new GeoBuilder();
      toonB.lod.boxBevel = 0;
      c = {
        toon: toonB,
        sign: new GeoBuilder(true),
        facade: new GeoBuilder(true),
        ground: new GeoBuilder(true),
        road: new GeoBuilder(true),
        decal: new GeoBuilder(true),
        flag: new GeoBuilder(false, true),
      };
      chunks.set(key, c);
    }
    return c;
  };

  const N = T.n;
  const L = T.length;
  const P = (i: number, d: number, dy = 0): V3 => {
    const k = ((i % N) + N) % N;
    return [T.x[k]! - T.tz[k]! * d, T.y[k]! + dy, T.z[k]! + T.tx[k]! * d];
  };
  const Ps = (s: number, d: number, dy = 0): V3 => {
    const p = T.point(s, d);
    return [p.x, p.y + dy, p.z];
  };
  const heading = (s: number) => T.headingAt(s);
  const M = T.marks;
  const fly = M.flyover!;
  const rb = M.roundabout!;
  const market = M.market!;
  const elevated = (i: number) => T.y[((i % N) + N) % N]! > 0.35;

  /* ---------------------------------------------------------------- road surface */
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const s0 = i * T.step;
    const s1 = s0 + T.step;
    const mid = P(i, 0);
    const c = chunk(mid[0], mid[2]);
    const W = ROAD_HALF;
    c.road.quad(P(i, -W), P(i, W), P(j, W), P(j, -W), 0xffffff, [-2, s0 / 4, 2, s1 / 4]);
    // Curbs: red/white on the ground, yellow-black on the flyover.
    const band = Math.floor(s0 / 2.5) % 2;
    const curbCol = elevated(i) ? (band ? 0xffc928 : 0x2a2b30) : band ? 0xe8332b : 0xf4f4f4;
    c.toon.quad(P(i, -W - CURB_W, 0.06), P(i, -W, 0.06), P(j, -W, 0.06), P(j, -W - CURB_W, 0.06), curbCol);
    c.toon.quad(P(i, W, 0.06), P(i, W + CURB_W, 0.06), P(j, W + CURB_W, 0.06), P(j, W, 0.06), curbCol);
    c.toon.quad(P(j, -W, 0), P(j, -W, 0.06), P(i, -W, 0.06), P(i, -W, 0), shade(curbCol, 0.8));
    c.toon.quad(P(i, W, 0), P(i, W, 0.06), P(j, W, 0.06), P(j, W, 0), shade(curbCol, 0.8));

    // Lane lines: dashed at -4, 0, 4, solid edges.
    const dash = Math.floor(s0 / 3) % 2 === 0;
    const lines: [number, number, boolean][] = [
      [-4, 0.16, dash],
      [0, 0.16, dash],
      [4, 0.16, dash],
      [-W + 0.35, 0.2, true],
      [W - 0.35, 0.2, true],
    ];
    for (const [d, w, on] of lines) {
      if (!on) continue;
      c.toon.quad(
        P(i, d - w / 2, 0.015),
        P(i, d + w / 2, 0.015),
        P(j, d + w / 2, 0.015),
        P(j, d - w / 2, 0.015),
        0xf2f2ee,
      );
    }

    // Pavements (ground level only)
    for (const side of [-1, 1] as const) {
      const wallI = side < 0 ? T.wallL[i]! : T.wallR[i]!;
      const wallJ = side < 0 ? T.wallL[j]! : T.wallR[j]!;
      if (elevated(i) || elevated(j)) continue;
      const a0 = W + CURB_W;
      if (wallI - a0 < 0.3) continue;
      const inner = side * a0;
      const p0 = P(i, inner, 0.16);
      const p1 = P(i, side * wallI, 0.16);
      const p2 = P(j, side * wallJ, 0.16);
      const p3 = P(j, inner, 0.16);
      const islandSide = side > 0 && s0 > rb.s0 - 12 && s0 < rb.s1 + 12;
      const col = islandSide ? GRASS : PAVING[(Math.floor(s0 / 2) + (side > 0 ? 1 : 0)) % 2]!;
      if (side < 0) c.toon.quad(p1, p0, p3, p2, col);
      else c.toon.quad(p0, p1, p2, p3, col);
      // Kerb face toward the road
      if (side < 0)
        c.toon.quad(P(j, inner, 0.06), P(j, inner, 0.16), P(i, inner, 0.16), P(i, inner, 0.06), 0xb8b1a3);
      else c.toon.quad(P(i, inner, 0.06), P(i, inner, 0.16), P(j, inner, 0.16), P(j, inner, 0.06), 0xb8b1a3);
    }
  }

  // Start line (checker) and grid boxes
  {
    const c = chunk(0, 0);
    const ck = A.signs.checker;
    for (let k = -4; k < 4; k++) {
      const d0 = k * 2;
      c.decal.quad(
        Ps(-0.9, d0, 0.02),
        Ps(-0.9, d0 + 2, 0.02),
        Ps(0.9, d0 + 2, 0.02),
        Ps(0.9, d0, 0.02),
        0xffffff,
        [ck[0], ck[1], ck[0] + (ck[2] - ck[0]) * 0.125, ck[3]],
      );
    }
    for (let k = 0; k < 8; k++) {
      const row = Math.floor(k / 2);
      const side = k % 2 === 0 ? -1 : 1;
      const s = -7 - row * 7.5 - (side > 0 ? 3.2 : 0) + 1.6;
      const d = side * 3.4;
      const cg = chunk(...([Ps(s, d)[0], Ps(s, d)[2]] as [number, number]));
      cg.toon.quad(
        Ps(s - 0.15, d - 1.1, 0.016),
        Ps(s - 0.15, d + 1.1, 0.016),
        Ps(s + 0.15, d + 1.1, 0.016),
        Ps(s + 0.15, d - 1.1, 0.016),
        0xf2f2ee,
      );
      for (const e of [-1.1, 1.1]) {
        cg.toon.quad(
          Ps(s - 2.4, d + e - 0.12, 0.016),
          Ps(s - 2.4, d + e + 0.12, 0.016),
          Ps(s, d + e + 0.12, 0.016),
          Ps(s, d + e - 0.12, 0.016),
          0xf2f2ee,
        );
      }
    }
    // Zebra crossings in the market street
    for (const s of [market.s0 + 20, market.s1 - 20]) {
      const zc = chunk(Ps(s, 0)[0], Ps(s, 0)[2]);
      for (let k = -7; k <= 7; k += 1) {
        const d0 = k * 1.05 - 0.3;
        zc.toon.quad(
          Ps(s - 1.8, d0, 0.016),
          Ps(s - 1.8, d0 + 0.6, 0.016),
          Ps(s + 1.8, d0 + 0.6, 0.016),
          Ps(s + 1.8, d0, 0.016),
          0xf2f2ee,
        );
      }
    }
  }

  /* ---------------------------------------------------------------- guardrails & parapets */
  const posts = new Instancer();
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const mid = P(i, 0);
    const c = chunk(mid[0], mid[2]);
    for (const side of [-1, 1] as const) {
      const wi = side < 0 ? T.wallL[i]! : T.wallR[i]!;
      const wj = side < 0 ? T.wallL[j]! : T.wallR[j]!;
      const sI = side * (wi + 0.15);
      const sJ = side * (wj + 0.15);
      if (elevated(i)) {
        // Concrete parapet: inner face, top, outer face down to the deck bottom.
        const inI = side * (wi - 0.35);
        const inJ = side * (wj - 0.35);
        const outI = side * (wi + 0.3);
        const outJ = side * (wj + 0.3);
        const quadSide = (a: V3, b: V3, cc: V3, d: V3, col: number) => {
          if (side < 0) c.toon.quad(b, a, d, cc, col);
          else c.toon.quad(a, b, cc, d, col);
        };
        quadSide(P(j, inJ, 0), P(i, inI, 0), P(i, inI, 1.0), P(j, inJ, 1.0), CONCRETE);
        quadSide(P(j, inJ, 1.0), P(i, inI, 1.0), P(i, outI, 1.05), P(j, outJ, 1.05), 0xffc928);
        quadSide(P(j, outJ, 1.05), P(i, outI, 1.05), P(i, outI, -1.2), P(j, outJ, -1.2), 0xc9c3b8);
        // Embankment down to the ground on the low ramps; open with piers in the middle.
        if (T.y[i]! < 4.5) {
          const gi = P(i, outI);
          const gj = P(j, outJ);
          quadSide(
            [gj[0], gj[1] - 1.2, gj[2]],
            [gi[0], gi[1] - 1.2, gi[2]],
            [gi[0], -0.05, gi[2]],
            [gj[0], -0.05, gj[2]],
            Math.floor(i / 4) % 2 ? 0xc2bbb0 : 0xcbc4b8,
          );
        } else if (side > 0) {
          // Deck underside
          c.toon.quad(
            P(i, -wi - 0.3, -1.2),
            P(j, -wj - 0.3, -1.2),
            P(j, wj + 0.3, -1.2),
            P(i, wi + 0.3, -1.2),
            0x9d978d,
          );
        }
        continue;
      }
      // Ground-level W-beam guardrail, both faces.
      const lo = 0.5;
      const hi = 0.85;
      const col = 0xc7ccd2;
      const front = (a: V3, b: V3, cc: V3, d: V3, k: THREE.ColorRepresentation) => {
        if (side < 0) c.toon.quad(a, b, cc, d, k);
        else c.toon.quad(b, a, d, cc, k);
      };
      front(P(j, sJ, lo), P(i, sI, lo), P(i, sI, hi), P(j, sJ, hi), col);
      front(P(i, sI, lo), P(j, sJ, lo), P(j, sJ, hi), P(i, sI, hi), shade(col, 0.8));
      if (i % 3 === 0) {
        const p = P(i, side * (wi + 0.28));
        posts.add(p[0], p[1], p[2], 0, 1);
      }
    }
  }
  const postGeo = new GeoBuilder();
  postGeo.box(0, 0.45, 0, 0.14, 0.9, 0.14, 0x8a9096);
  root.add(posts.build(postGeo.build(), toon));

  /* ---------------------------------------------------------------- flyover piers + boulevard */
  const bx = fly.crossX;
  {
    for (let k = -3; k <= 3; k++) {
      const s = (fly.s0 + fly.s1) / 2 + k * 16;
      const y = T.heightAt(s);
      if (y < 4.5) continue;
      const p = Ps(s, 0);
      const c = chunk(p[0], p[2]);
      const h = heading(s);
      const m = frameMatrix(p[0], 0, p[2], h);
      c.toon.primIn(m, 'box', 0, (y - 1.2) / 2, 0, 1.6, y - 1.2, 1.6, 0xc9c3b8);
      c.toon.primIn(m, 'box', 0, y - 1.6, 0, 19, 0.8, 1.9, 0xbdb6aa);
      c.toon.primIn(m, 'box', 0, 1.2, 0, 1.9, 0.3, 1.9, 0xffc928);
    }
    // Flyover name board on the parapet
    const sb = fly.top0 - 4;
    for (const side of [-1, 1]) {
      const p = Ps(sb, side * (9.3 + 0.35));
      const c = chunk(p[0], p[2]);
      const m = frameMatrix(p[0], p[1] - 0.6, p[2], heading(sb) + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
      signQuad(c.sign, m, 0, 0, 0.02, 7, 1.6, A.signs.sign(A.signs.flyoverSlot));
    }

    // Boulevard under the flyover: asphalt, median, lane lines, pavements.
    const z0 = 28;
    const z1 = 470;
    for (let z = z0; z < z1; z += 10) {
      const c = chunk(bx, z + 5);
      const zz = Math.min(z1, z + 10);
      c.road.quad(
        [bx - 10, -0.02, z],
        [bx - 10, -0.02, zz],
        [bx + 10, -0.02, zz],
        [bx + 10, -0.02, z],
        0xffffff,
        [0, z / 4, 5, zz / 4],
      );
      c.toon.quad([bx - 1, 0.18, z], [bx - 1, 0.18, zz], [bx + 1, 0.18, zz], [bx + 1, 0.18, z], GRASS);
      c.toon.quad([bx + 1, 0.18, z], [bx + 1, 0.18, zz], [bx + 1, 0, zz], [bx + 1, 0, z], 0xf4f4f4);
      c.toon.quad([bx - 1, 0, z], [bx - 1, 0, zz], [bx - 1, 0.18, zz], [bx - 1, 0.18, z], 0xf4f4f4);
      for (const lx of [-5.5, 5.5]) {
        if (Math.floor(z / 10) % 2 === 0)
          c.toon.quad(
            [bx + lx - 0.08, 0.0, z],
            [bx + lx - 0.08, 0.0, z + 4],
            [bx + lx + 0.08, 0.0, z + 4],
            [bx + lx + 0.08, 0.0, z],
            0xf2f2ee,
          );
      }
      for (const side of [-1, 1]) {
        const a = bx + side * 10;
        const b = bx + side * 13;
        const col = PAVING[Math.floor(z / 10) % 2]!;
        if (side > 0) c.toon.quad([a, 0.16, z], [a, 0.16, zz], [b, 0.16, zz], [b, 0.16, z], col);
        else c.toon.quad([b, 0.16, z], [b, 0.16, zz], [a, 0.16, zz], [a, 0.16, z], col);
      }
    }
  }

  /* ---------------------------------------------------------------- ground */
  {
    const B = T.bounds;
    const cx = (B.minX + B.maxX) / 2;
    const cz = (B.minZ + B.maxZ) / 2;
    const S = 1300;
    const g = new GeoBuilder(true);
    const n = 13;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const x0 = cx - S / 2 + (a * S) / n;
        const z0 = cz - S / 2 + (b * S) / n;
        const x1 = x0 + S / n;
        const z1 = z0 + S / n;
        g.quad([x0, -0.06, z0], [x0, -0.06, z1], [x1, -0.06, z1], [x1, -0.06, z0], 0xb4ac9e, [
          x0 / 6,
          z0 / 6,
          x1 / 6,
          z1 / 6,
        ]);
      }
    }
    const ground = new THREE.Mesh(g.build(), groundMat);
    ground.name = 'ground';
    root.add(ground);
  }

  /* ---------------------------------------------------------------- occupancy */
  const B = T.bounds;
  const grid = new Grid(B.minX - 260, B.minZ - 260, B.maxX + 260, B.maxZ + 360);
  for (let i = 0; i < N; i++) {
    const w = Math.max(T.wallL[i]!, T.wallR[i]!) + 2.2;
    grid.markCircle(T.x[i]!, T.z[i]!, w);
  }
  const islandR = rb.radius - 10.2;
  grid.markCircle(rb.cx, rb.cz, islandR + 2);
  // Boulevard corridor
  for (let z = 26; z < 480; z += 2) for (let x = -14; x <= 14; x += 2) grid.markCircle(bx + x, z, 1);

  const steam: THREE.Vector3[] = [];
  // Low graphics level: a thinner crowd and half the traffic (each person or car is hundreds of
  // triangles, drawn again in every split-screen view).
  const thin = lightMaterials();
  const crowdBody = new Instancer();
  const crowdHead = new Instancer();
  const crowdBase: {
    i: number;
    p: THREE.Vector3;
    q: THREE.Quaternion;
    s: number;
    phase: number;
    amp: number;
  }[] = [];
  const SHIRTS = [0xf2453d, 0xffc928, 0x2f8cff, 0x22b35e, 0xff8a3d, 0xfff7f0, 0x14b8a6, 0xff5c9a, 0x111214];
  const SKIN = [0xf3d9b1, 0xe0b98f, 0xc99a6e, 0xa8774d, 0x8a5a3a];
  const addPerson = (x: number, y: number, z: number, rot: number, seed: number) => {
    const shirt = SHIRTS[Math.floor(hash01(seed) * SHIRTS.length)]!;
    const skin = SKIN[Math.floor(hash01(seed + 7) * SKIN.length)]!;
    const s = 0.9 + hash01(seed + 3) * 0.2;
    const i = crowdBody.add(x, y, z, rot, s, shirt);
    crowdHead.add(x, y, z, rot, s, skin);
    crowdBase.push({
      i,
      p: new THREE.Vector3(x, y, z),
      q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
      s,
      phase: hash01(seed + 11) * 6.28,
      amp: hash01(seed + 13) > 0.4 ? 0.18 : 0.05,
    });
  };

  /* ---------------------------------------------------------------- gantry */
  const lampMats: THREE.MeshBasicMaterial[] = [];
  {
    const c = chunk(0, 0);
    const h = heading(0);
    const p = Ps(0, 0);
    // Local +z = driving direction, local x across the road.
    const m = frameMatrix(p[0], 0, p[2], h);
    for (const side of [-1, 1]) {
      const x = side * 13.4;
      c.toon.primIn(m, 'box', x, 4, 0, 1.0, 8, 1.0, 0xff5a1f);
      for (let k = 0; k < 8; k++) c.toon.primIn(m, 'box', x, 0.5 + k, 0, 1.08, 0.12, 1.08, 0x111214);
      c.toon.primIn(m, 'box', x, 0.15, 0, 1.8, 0.3, 1.8, 0x3b3c42);
    }
    c.toon.primIn(m, 'box', 0, 8.6, 0, 27.8, 1.4, 1.2, 0x2a2b30);
    const gb = new GeoBuilder(true);
    const tp = (x: number, y: number, z: number): V3 => {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
      return [v.x, v.y, v.z];
    };
    // FINIS faces the arriving racers (-z), START faces away (+z).
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
    root.add(new THREE.Mesh(gb.build(), new THREE.MeshBasicMaterial({ map: A.gantry })));
    // Traffic light hanging from the beam, facing the grid.
    c.toon.primIn(m, 'box', 0, 6.4, -0.2, 1.1, 2.9, 0.7, 0x111214);
    c.toon.primIn(m, 'box', 0, 7.85, -0.2, 0.12, 0.3, 0.12, 0x111214);
    for (let k = 0; k < 3; k++) {
      c.toon.primIn(m, 'box', 0, 7.42 - k * 0.9, -0.66, 0.9, 0.1, 0.4, 0x111214, -0.4, 0, 0);
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a2a2a });
      lampMats.push(mat);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), mat);
      const lp = tp(0, 7.15 - k * 0.9, -0.57);
      lamp.position.set(lp[0], lp[1], lp[2]);
      lamp.rotation.y = h + Math.PI;
      root.add(lamp);
    }
  }

  /* ---------------------------------------------------------------- grandstand */
  {
    const s0 = L - 104;
    const s1 = L - 14;
    for (let s = s0; s < s1; s += 8) {
      const sm = s + 4;
      const side = -1;
      const base = Ps(sm, side * (12.5 + 1.2));
      const c = chunk(base[0], base[2]);
      const h = heading(sm);
      const m = frameMatrix(base[0], 0, base[2], h - Math.PI / 2);
      // local +z points to the road (right of a left-side stand), x along the track.
      for (let k = 0; k < 5; k++) {
        c.toon.primIn(
          m,
          'box',
          0,
          0.3 + k * 0.6,
          -0.45 - k * 0.9,
          8.05,
          0.6 + k * 1.2,
          0.9,
          k % 2 ? 0xe8e2d6 : 0xd9d2c4,
        );
        c.toon.primIn(
          m,
          'box',
          0,
          0.62 + k * 1.2,
          -0.25 - k * 0.9,
          8.05,
          0.06,
          0.5,
          [0x2f8cff, 0xff5a1f][k % 2]!,
        );
      }
      c.toon.primIn(m, 'box', 0, 3.2, -5.0, 8.05, 6.4, 0.3, 0xb9b1a3);
      // Canopy on posts, striped
      c.toon.primIn(
        m,
        'box',
        0,
        7.0,
        -2.2,
        8.1,
        0.15,
        6.4,
        Math.floor(s / 8) % 2 ? 0xff5a1f : 0xfff7f0,
        -0.12,
        0,
        0,
      );
      for (const px of [-3.9, 3.9]) c.toon.primIn(m, 'box', px, 3.4, -4.8, 0.18, 6.8, 0.18, 0x3b3c42);
      c.toon.primIn(m, 'box', 0, 0.55, 0.3, 8.05, 1.1, 0.12, 0x2f6fd6);
      if (Math.floor((s - s0) / 8) % 3 === 1)
        signQuad(c.sign, m, 0, 0.55, 0.38, 6, 0.9, A.signs.sign(A.signs.roadSlot));
      // Crowd on the tiers
      for (let k = 0; k < 5; k++) {
        for (let n = 0; n < 5; n++) {
          const seed = s * 13 + k * 7 + n;
          if (hash01(seed) < (thin ? 0.55 : 0.15)) continue;
          const lx = -3.4 + n * 1.65 + (hash01(seed + 1) - 0.5) * 0.4;
          const lz = -0.45 - k * 0.9;
          const ly = 0.6 + k * 1.2;
          const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
          addPerson(v.x, ly, v.z, h - Math.PI / 2, seed);
        }
      }
    }
    // Spectators along the planting strip opposite the stand, by the gantry.
    for (let s = -18; s < 30; s += 1.6) {
      if (Math.abs(s) < 2.5) continue;
      const seed = 9000 + s * 10;
      const p = Ps(s, 12.5 + 1.0 + hash01(seed) * 0.9);
      addPerson(p[0], 0, p[2], heading(s) - Math.PI / 2, seed);
    }
  }

  /* ---------------------------------------------------------------- roundabout + tugu */
  const fountain = new THREE.Vector3(rb.cx, 2.2, rb.cz);
  {
    const c = chunk(rb.cx, rb.cz);
    const g = new THREE.CircleGeometry(islandR, 48).toNonIndexed();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(rb.cx, 0.2, rb.cz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    c.toon.addGeometry(g, m, GRASS);
    const rim = new THREE.CylinderGeometry(islandR, islandR + 0.1, 0.25, 48, 1, true).toNonIndexed();
    c.toon.addGeometry(rim, new THREE.Matrix4().makeTranslation(rb.cx, 0.08, rb.cz), 0xf4f4f4);
    // Path ring and spokes
    const ring = new THREE.RingGeometry(14, 16.5, 48).toNonIndexed();
    c.toon.addGeometry(
      ring,
      new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().makeTranslation(rb.cx, 0.22, rb.cz),
        new THREE.Matrix4().makeRotationX(-Math.PI / 2),
      ),
      0xe8dcc4,
    );
    // Flower beds
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const r = islandR - 2.2;
      c.toon.prim(
        'sphereLo',
        rb.cx + Math.cos(a) * r,
        0.5,
        rb.cz + Math.sin(a) * r,
        1.6,
        0.8,
        1.6,
        k % 3 === 0 ? 0xf2453d : k % 3 === 1 ? 0xffc928 : 0xff8a3d,
      );
    }
    // Fountain pool
    const pool = new THREE.CylinderGeometry(9, 9, 0.7, 40, 1, true).toNonIndexed();
    c.toon.addGeometry(pool, new THREE.Matrix4().makeTranslation(rb.cx, 0.55, rb.cz), 0xe8dcc4);
    c.toon.prim('cyl16', rb.cx, 0.92, rb.cz, 18.6, 0.12, 18.6, 0xd8ccb2);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(8.9, 40),
      new THREE.MeshBasicMaterial({ map: A.water }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(rb.cx, 0.8, rb.cz);
    A.water.repeat.set(3, 3);
    root.add(water);
    // Tugu: stepped octagonal base, tapering column with gold bands, golden orb and star.
    const t = c.toon;
    const X = rb.cx;
    const Z = rb.cz;
    t.prim('cyl8', X, 1.2, Z, 9, 1.0, 9, 0xe8dcc4);
    t.prim('cyl8', X, 2.0, Z, 6.6, 0.8, 6.6, 0xd8ccb2);
    t.prim('cyl8', X, 2.7, Z, 4.6, 0.7, 4.6, 0xe8dcc4);
    const col = new THREE.CylinderGeometry(0.75, 1.5, 22, 4, 1).toNonIndexed();
    t.addGeometry(
      col,
      new THREE.Matrix4().compose(
        new THREE.Vector3(X, 14, Z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4),
        new THREE.Vector3(1, 1, 1),
      ),
      0xf4f1ea,
    );
    for (const y of [6, 12, 18]) {
      const r = 1.5 - ((y - 3) / 22) * 0.75;
      const band = new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.5, 4, 1).toNonIndexed();
      t.addGeometry(
        band,
        new THREE.Matrix4().compose(
          new THREE.Vector3(X, y, Z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4),
          new THREE.Vector3(1, 1, 1),
        ),
        0xe0a526,
      );
    }
    t.prim('cyl8', X, 25.3, Z, 2.2, 0.6, 2.2, 0xe0a526);
    t.prim('sphere', X, 27.0, Z, 2.8, 2.8, 2.8, 0xf2b632);
    const torus = new THREE.TorusGeometry(1.9, 0.18, 6, 24).toNonIndexed();
    t.addGeometry(
      torus,
      new THREE.Matrix4().compose(
        new THREE.Vector3(X, 27.0, Z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.35, 0, 0.3)),
        new THREE.Vector3(1, 1, 1),
      ),
      0xe0a526,
    );
    t.prim('cone6', X, 29.4, Z, 0.5, 1.8, 0.5, 0xf2b632);
    // Plaque
    const pm = frameMatrix(X, 0, Z + 4.65, 0);
    signQuad(c.sign, pm, 0, 2.7, 0.02, 3.6, 0.6, A.signs.sign(A.signs.plaqueSlot));
    // Flag poles with red-white flags around the pool
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const fx = X + Math.cos(a) * 12;
      const fz = Z + Math.sin(a) * 12;
      t.prim('cyl6', fx, 4.5, fz, 0.16, 9, 0.16, 0xe8ecef);
      t.prim('gem', fx, 9.05, fz, 0.3, 0.3, 0.3, 0xe0a526);
      addFlag(chunk(fx, fz).flag, fx, 8.6, fz, a + Math.PI / 2, 2.4, 1.6, [0xf2453d, 0xffffff]);
    }
    grid.markCircle(X, Z, islandR);
  }

  /* ---------------------------------------------------------------- ruko rows along the circuit */
  let signSeq = 0;
  const lamps = new Instancer();
  const trees = new Instancer();
  const palms = new Instancer();
  const bikes = new Instancer();
  const FRONT = 2.6;
  const startZone = (s: number) => s > L - 108 || s < 4;
  const marketZone = (s: number) => s > market.s0 && s < market.s1;
  const billboardS = [150, market.s1 - 4, fly.s1 + 20, L - 150];

  const placeRow = (side: -1 | 1) => {
    let s = 2;
    let guard = 0;
    while (s < L - 2 && guard++ < 4000) {
      const w = 5 + Math.floor(hash01(s * 3.1 + side) * 3) * 1.1;
      const depth = 11;
      const sm = s + w / 2;
      const wall = side < 0 ? T.wallL[T.index(sm)]! : T.wallR[T.index(sm)]!;
      if (T.y[T.index(sm)]! > 0.35 || (side < 0 && startZone(sm))) {
        s += 2;
        continue;
      }
      const dFront = wall + FRONT;
      const center = T.point(sm, side * (dFront + depth / 2));
      const facing = heading(sm) + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
      if (!grid.rectFree(center.x, center.z, facing, w, depth)) {
        s += 1.5;
        continue;
      }
      grid.markRect(center.x, center.z, facing, w, depth);
      const front = T.point(sm, side * dFront);
      const m = frameMatrix(front.x, 0, front.z, facing);
      const c = chunk(front.x, front.z);
      const seed = Math.floor(s * 7 + (side > 0 ? 5000 : 0));
      if (marketZone(sm) && hash01(seed + 0.5) < 0.42) {
        addWarung(c, m, w, seed);
      } else {
        const floors = 2 + Math.floor(hash01(seed + 2) * 2.4);
        addRuko(c, m, A.signs, { w, depth, floors, seed, signSlot: signSeq++ % A.signs.shopCount });
        if (hash01(seed + 3) > 0.6) {
          // Parked motorbikes in front of the shop
          for (let k = 0; k < 2 + Math.floor(hash01(seed + 4) * 3); k++) {
            const v = new THREE.Vector3(-w / 2 + 0.8 + k * 0.85, 0.16, 1.2).applyMatrix4(m);
            bikes.add(
              v.x,
              0.0,
              v.z,
              facing + Math.PI / 2 + (hash01(seed + k) - 0.5) * 0.3,
              1,
              SHIRTS[Math.floor(hash01(seed + k * 3) * SHIRTS.length)]!,
            );
          }
        }
      }
      s += w + (hash01(seed + 9) > 0.86 ? 3 : 0);
    }
  };
  placeRow(-1);
  placeRow(1);

  /* ---------------------------------------------------------------- pocket parks in the gaps */
  // Wherever the shophouse row could not fit (outside of bends, between landmarks) the strip
  // becomes a small park, so no bare paving shows next to the circuit.
  const benches: { x: number; z: number; h: number }[] = [];
  for (const side of [-1, 1] as const) {
    for (let s = 0; s < L; s += 4) {
      const i = T.index(s);
      if (T.y[i]! > 0.35) continue;
      const wall = side < 0 ? T.wallL[i]! : T.wallR[i]!;
      const facing = heading(s) + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
      for (const depthOff of [4.5, 13]) {
        const c0 = T.point(s, side * (wall + FRONT + depthOff));
        if (!grid.rectFree(c0.x, c0.z, facing, 6.5, 8)) continue;
        grid.markRect(c0.x, c0.z, facing, 6.5, 8);
        const c = chunk(c0.x, c0.z);
        const m = frameMatrix(c0.x, 0, c0.z, facing);
        const seed = Math.floor(s * 13 + side * 7 + depthOff);
        const r = hash01(seed);
        c.toon.primIn(m, 'box', 0, 0.05, 0, 6.6, 0.1, 8.1, GRASS);
        c.toon.primIn(m, 'box', 0, 0.12, 3.95, 6.6, 0.24, 0.2, 0xd9d2c4);
        if (r < 0.22) {
          // Kiosk: a little coffee/pulsa stall with a coloured awning.
          const col = [0xff5a1f, 0x2f8cff, 0x22b35e, 0xffc928][Math.floor(hash01(seed + 1) * 4)]!;
          c.toon.primIn(m, 'box', 0, 1.2, -1, 2.6, 2.4, 2.2, 0xfff7f0);
          c.toon.primIn(m, 'box', 0, 2.5, -0.6, 3.0, 0.15, 3.0, col, 0.12, 0, 0);
          c.toon.primIn(m, 'box', 0, 1.0, 0.12, 2.2, 0.9, 0.06, 0x3a332c);
          for (let k = 0; k < 4; k++)
            c.toon.primIn(
              m,
              'box',
              -0.8 + k * 0.53,
              1.0,
              0.16,
              0.35,
              0.35,
              0.05,
              [0xf2453d, 0xffc928, 0x22b35e, 0x2f8cff][k]!,
            );
          signQuad(c.sign, m, 0, 2.05, 0.15, 2.4, 0.5, A.signs.sign(signSeq++ % A.signs.shopCount));
        } else {
          trees.add(
            c0.x + (r - 0.5) * 2,
            0,
            c0.z,
            r * 9,
            0.75 + hash01(seed + 2) * 0.35,
            mix(0xffffff, 0xcfe8b8, hash01(seed + 3)),
          );
          if (hash01(seed + 4) < 0.5) benches.push({ x: c0.x, z: c0.z, h: facing });
          for (let k = 0; k < 3; k++) {
            const fx = -2.4 + k * 2.4;
            c.toon.primIn(m, 'cyl8', fx, 0.35, 3.2, 0.7, 0.5, 0.7, 0xb5653a);
            c.toon.primIn(m, 'sphereLo', fx, 0.75, 3.2, 0.8, 0.6, 0.8, [0xf2453d, 0xffc928, 0xff8a3d][k]!);
          }
        }
      }
    }
  }
  for (const b of benches) {
    const c = chunk(b.x, b.z);
    const m = frameMatrix(b.x, 0, b.z, b.h);
    c.toon.primIn(m, 'box', 1.8, 0.45, 2.2, 1.8, 0.08, 0.5, 0x8a5a3a);
    c.toon.primIn(m, 'box', 1.8, 0.75, 1.98, 1.8, 0.4, 0.06, 0x8a5a3a);
    for (const lx of [1.05, 2.55]) c.toon.primIn(m, 'box', lx, 0.22, 2.2, 0.08, 0.45, 0.45, 0x3b3c42);
  }

  /* ---------------------------------------------------------------- planting strip: lamps, trees, carts */
  for (let s = 6; s < L; s += 32) {
    for (const side of [-1, 1] as const) {
      const i = T.index(s);
      const wall = side < 0 ? T.wallL[i]! : T.wallR[i]!;
      const h = heading(s);
      if (T.y[i]! > 0.35) {
        // On the flyover: lamps on the parapet.
        const p = Ps(s, side * (wall + 0.05));
        lamps.add(p[0], p[1] + 1.0, p[2], h + (side < 0 ? Math.PI / 2 : -Math.PI / 2), 0.85);
        continue;
      }
      if (side > 0 && s > rb.s0 - 6 && s < rb.s1 + 6) continue;
      if (side < 0 && startZone(s)) continue;
      const p = Ps(s, side * (wall + 1.0));
      lamps.add(p[0], 0, p[2], h + (side < 0 ? Math.PI / 2 : -Math.PI / 2));
    }
  }
  const carts: { x: number; z: number; h: number }[] = [];
  for (let s = 10; s < L; s += 16) {
    for (const side of [-1, 1] as const) {
      const i = T.index(s + 8);
      if (T.y[i]! > 0.35) continue;
      if (side > 0 && s > rb.s0 - 6 && s < rb.s1 + 6) continue;
      if (side < 0 && startZone(s + 8)) continue;
      const wall = side < 0 ? T.wallL[i]! : T.wallR[i]!;
      const p = Ps(s + 8, side * (wall + 1.3));
      const seed = s * 5 + side;
      const r = hash01(seed);
      if (marketZone(s + 8) && r < 0.3) {
        carts.push({ x: p[0], z: p[2], h: heading(s + 8) });
        continue;
      }
      if (r < 0.55)
        trees.add(
          p[0],
          0,
          p[2],
          r * 20,
          0.65 + hash01(seed + 1) * 0.3,
          mix(0xffffff, 0xd9f2c2, hash01(seed + 2)),
        );
      else if (r < 0.75 && (s > M.startStraight.s0 || s < 160))
        palms.add(p[0], 0, p[2], r * 30, 0.9 + hash01(seed + 3) * 0.3);
    }
  }
  for (const k of carts) {
    const c = chunk(k.x, k.z);
    const m = frameMatrix(k.x, 0, k.z, k.h);
    addGerobak(c, m, k.x * 3 + k.z);
    steam.push(
      new THREE.Vector3(k.x, 1.7, k.z).add(
        new THREE.Vector3(0.35, 0, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), k.h),
      ),
    );
  }

  /* ---------------------------------------------------------------- billboards */
  billboardS.forEach((s, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    const i = T.index(s);
    const wall = side < 0 ? T.wallL[i]! : T.wallR[i]!;
    const p = Ps(s, side * (wall + 4.5));
    const c = chunk(p[0], p[2]);
    // Face back down the track towards arriving racers, turned a bit to the road.
    const face = heading(s) + Math.PI + side * 0.45;
    const m = frameMatrix(p[0], 0, p[2], face);
    for (const lx of [-3.5, 3.5]) c.toon.primIn(m, 'box', lx, 5.2, -0.4, 0.5, 10.4, 0.5, 0x5b616a);
    c.toon.primIn(m, 'box', 0, 12.5, -0.2, 13, 4.8, 0.4, 0x8a9096);
    for (const y of [10.6, 12.5, 14.4]) c.toon.primIn(m, 'box', 0, y, -0.5, 13.2, 0.18, 0.2, 0x5b616a);
    c.toon.primIn(m, 'box', 0, 12.5, 0.02, 13.2, 5.0, 0.12, 0xf4f4f4);
    c.toon.primIn(m, 'box', 0, 9.9, 0.4, 13, 0.12, 1.0, 0x5b616a);
    signQuad(c.sign, m, 0, 12.5, 0.1, 12.4, 4.2, A.signs.billboard(idx + 1));
    grid.markCircle(p[0], p[2], 6);
  });
  // Rooftop billboard over the boulevard
  {
    const p: V3 = [bx + 22, 0, fly.z + 30];
    const c = chunk(p[0], p[2]);
    const m = frameMatrix(p[0], 0, p[2], Math.PI / 2);
    for (const lx of [-3.5, 3.5]) c.toon.primIn(m, 'box', lx, 6, 0, 0.5, 12, 0.5, 0x5b616a);
    c.toon.primIn(m, 'box', 0, 14, 0.1, 13, 4.8, 0.4, 0x8a9096);
    for (const y of [12.1, 14, 15.9]) c.toon.primIn(m, 'box', 0, y, -0.2, 13.2, 0.18, 0.2, 0x5b616a);
    c.toon.primIn(m, 'box', 0, 14, 0.32, 13.2, 5.0, 0.12, 0xf4f4f4);
    signQuad(c.sign, m, 0, 14, 0.4, 12.4, 4.2, A.signs.billboard(0));
    grid.markCircle(p[0], p[2], 6);
  }

  /* ---------------------------------------------------------------- chevron boards on tight corners */
  for (let i = 0; i < N; i += 5) {
    const k = T.curv[i]!;
    if (Math.abs(k) < 1 / 46 || T.y[i]! > 0.35) continue;
    const side = k > 0 ? -1 : 1; // outside of the turn
    const wall = side < 0 ? T.wallL[i]! : T.wallR[i]!;
    const s = i * T.step;
    const p = Ps(s, side * (wall + 0.35));
    const c = chunk(p[0], p[2]);
    const m = frameMatrix(p[0], 0, p[2], heading(s) + Math.PI - side * 0.5);
    c.toon.primIn(m, 'box', 0, 0.7, -0.05, 0.1, 1.4, 0.1, 0x3b3c42);
    const ch = A.signs.chevron;
    // Arrows point right in the texture; flip for left turns.
    const uv: [number, number, number, number] =
      k > 0
        ? [ch[0], ch[1], ch[0] + (ch[2] - ch[0]) * 0.25, ch[3]]
        : [ch[0] + (ch[2] - ch[0]) * 0.25, ch[1], ch[0], ch[3]];
    signQuad(c.sign, m, 0, 1.3, 0.02, 1.4, 0.75, uv);
  }

  /* ---------------------------------------------------------------- bunting and umbul-umbul */
  const buntingS = [
    40,
    95,
    market.s0 + 10,
    market.s0 + 45,
    market.s0 + 80,
    rb.s1 + 30,
    fly.s1 + 40,
    L - 60,
    L - 30,
  ];
  for (const s of buntingS) {
    const i = T.index(s);
    if (T.y[i]! > 0.35) continue;
    const a = Ps(s, -(T.wallL[i]! + 0.8), 6.4);
    const b = Ps(s, T.wallR[i]! + 0.8, 6.4);
    const c = chunk((a[0] + b[0]) / 2, (a[2] + b[2]) / 2);
    const n = 16;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const sag = (t: number) => -Math.sin(t * Math.PI) * 1.2;
      const p0: V3 = [a[0] + (b[0] - a[0]) * t0, a[1] + sag(t0), a[2] + (b[2] - a[2]) * t0];
      const p1: V3 = [a[0] + (b[0] - a[0]) * t1, a[1] + sag(t1), a[2] + (b[2] - a[2]) * t1];
      c.toon.prim(
        'box',
        (p0[0] + p1[0]) / 2,
        (p0[1] + p1[1]) / 2,
        (p0[2] + p1[2]) / 2,
        0.04,
        0.04,
        Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) + 0.05,
        0x2a2b30,
        0,
        heading(s) + Math.PI / 2,
        0,
      );
      const tip: V3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.85, (p0[2] + p1[2]) / 2];
      const col = k % 2 ? 0xffffff : 0xf2453d;
      c.flag.tri(p0, p1, tip, col, undefined, [0, 0, 1]);
    }
  }
  // Umbul-umbul: tall curved bamboo poles with long vertical banners along the start straight.
  for (let s = 18; s < 150; s += 11) {
    const i = T.index(s);
    const wall = T.wallR[i]!;
    const p = Ps(s, wall + 0.6);
    const c = chunk(p[0], p[2]);
    const h = heading(s);
    for (let k = 0; k < 5; k++)
      c.toon.prim(
        'cyl6',
        p[0],
        1 + k * 2,
        p[2],
        0.14 - k * 0.012,
        2.05,
        0.14 - k * 0.012,
        k % 2 ? 0xd9b46a : 0xc9a35a,
      );
    const cols = [
      [0xf2453d, 0xffc928],
      [0x22b35e, 0xfff7f0],
      [0x2f8cff, 0xffc928],
      [0xff5a1f, 0xfff7f0],
    ][Math.floor(hash01(s) * 4)]!;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    for (let k = 0; k < 6; k++) {
      const y0 = 9.4 - k * 0.8;
      const y1 = y0 - 0.8;
      const w0 = 0.75;
      c.flag.quad(
        [p[0], y1, p[2]],
        [p[0] - fx * w0, y1, p[2] - fz * w0],
        [p[0] - fx * w0, y0, p[2] - fz * w0],
        [p[0], y0, p[2]],
        cols[k % 2]!,
        undefined,
        [0, 0.3 + k * 0.12, 0.3 + k * 0.1, 0],
      );
    }
  }

  /* ---------------------------------------------------------------- second row and boulevard blocks */
  const placeBlocksAlong = (side: -1 | 1) => {
    for (let s = 0; s < L; s += 6) {
      const w = 12 + hash01(s * 1.3 + side) * 8;
      const d = 14;
      const sm = s + w / 2;
      const i = T.index(sm);
      const wall = side < 0 ? T.wallL[i]! : T.wallR[i]!;
      const dist = Math.max(wall, 12.5) + FRONT + 11 + 4 + d / 2;
      const center = T.point(sm, side * dist);
      const facing = heading(sm) + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
      if (!grid.rectFree(center.x, center.z, facing, w, d)) continue;
      grid.markRect(center.x, center.z, facing, w, d);
      const front = T.point(sm, side * (dist - d / 2));
      const m = frameMatrix(front.x, 0, front.z, facing);
      addBlock(
        chunk(front.x, front.z),
        m,
        w,
        d,
        4 + Math.floor(hash01(s * 2.7 + side) * 5),
        Math.floor(s * 3 + side * 100),
      );
      s += w - 6;
    }
  };
  placeBlocksAlong(-1);
  placeBlocksAlong(1);
  // Ruko rows on both sides of the boulevard south of the flyover, then blocks behind.
  for (const side of [-1, 1] as const) {
    let z = fly.z + 20;
    while (z < 360) {
      const w = 5 + Math.floor(hash01(z + side) * 3) * 1.1;
      const x = bx + side * (13 + 1.5 + 5.5);
      const facing = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      if (grid.rectFree(x, z + w / 2, facing, w, 11)) {
        grid.markRect(x, z + w / 2, facing, w, 11);
        const fx = bx + side * 14.5;
        const m = frameMatrix(fx, 0, z + w / 2, facing);
        const c = chunk(fx, z);
        const seed = Math.floor(z * 11 + side * 77);
        if (hash01(seed) < 0.2) {
          addWarung(c, m, w, seed);
        } else {
          addRuko(c, m, A.signs, {
            w,
            depth: 11,
            floors: 2 + Math.floor(hash01(seed + 1) * 3),
            seed,
            signSlot: signSeq++ % A.signs.shopCount,
          });
        }
        if (Math.floor(z) % 3 === 0) lamps.add(bx + side * 12.2, 0, z, facing);
      }
      z += w;
    }
  }

  /* ---------------------------------------------------------------- parks and far towers */
  {
    const step = 22;
    for (let x = B.minX - 240; x < B.maxX + 240; x += step) {
      for (let z = B.minZ - 240; z < B.maxZ + 330; z += step) {
        const seed = x * 31 + z * 17;
        const cx = x + (hash01(seed) - 0.5) * 6;
        const cz = z + (hash01(seed + 1) - 0.5) * 6;
        if (!grid.rectFree(cx, cz, 0, 16, 16)) continue;
        let near = Infinity;
        for (let i = 0; i < N; i += 6) near = Math.min(near, Math.hypot(T.x[i]! - cx, T.z[i]! - cz));
        const c = chunk(cx, cz);
        if (near < 52) {
          // Pocket park
          c.toon.quad(
            [cx - 9, -0.03, cz + 9],
            [cx + 9, -0.03, cz + 9],
            [cx + 9, -0.03, cz - 9],
            [cx - 9, -0.03, cz - 9],
            GRASS,
          );
          for (let k = 0; k < 3; k++) {
            if (hash01(seed + k * 5) < 0.3) continue;
            trees.add(
              cx + (hash01(seed + k) - 0.5) * 13,
              0,
              cz + (hash01(seed + k + 9) - 0.5) * 13,
              hash01(seed + k) * 6,
              0.8 + hash01(seed + k * 2) * 0.5,
              mix(0xffffff, 0xcfe8b8, hash01(seed + k + 3)),
            );
          }
          grid.markRect(cx, cz, 0, 18, 18);
          continue;
        }
        const w = 12 + hash01(seed + 2) * 8;
        const d = 12 + hash01(seed + 3) * 8;
        const far = near > 110;
        const h = far ? 26 + hash01(seed + 4) * 60 : 14 + hash01(seed + 4) * 22;
        grid.markRect(cx, cz, 0, w + 4, d + 4);
        const m = frameMatrix(cx, 0, cz, Math.floor(hash01(seed + 5) * 4) * (Math.PI / 2));
        if (far) addTower(c, m, w, d, h, seed);
        else
          addBlock(
            c,
            new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, 0, d / 2)),
            w,
            d,
            Math.floor(h / 3.2),
            seed,
          );
      }
    }
  }

  /* ---------------------------------------------------------------- flush chunks into meshes */
  // Detailed geometry near the camera, the coarse twin (plain boxes, no small details) beyond
  // LOD_FAR from the chunk centre; shadow passes use the coarse one too.
  const LOD_FAR = 105;
  const addLod = (b: GeoBuilder, mat: THREE.Material, name: string) => {
    if (b.vertexCount === 0) return;
    const hi = b.build();
    const lo = b.lod && b.lod.vertexCount > 0 ? b.lod.build() : null;
    if (!lo) {
      const mesh = new THREE.Mesh(hi, mat);
      mesh.name = name;
      root.add(mesh);
      return;
    }
    const centre = hi.boundingBox!.getCenter(new THREE.Vector3()).setY(0);
    hi.translate(-centre.x, 0, -centre.z);
    lo.translate(-centre.x, 0, -centre.z);
    const lod = new THREE.LOD();
    lod.position.copy(centre);
    for (const [g, d] of [
      [hi, 0],
      [lo, LOD_FAR],
    ] as const) {
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name;
      lod.addLevel(mesh, d, 0.1);
    }
    lod.updateMatrix();
    root.add(lod);
  };
  for (const c of chunks.values()) {
    const add = (b: GeoBuilder, mat: THREE.Material, name: string) => {
      if (b.vertexCount === 0) return;
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);
    };
    add(c.road, roadMat, 'road');
    add(c.decal, decalMat, 'decals');
    addLod(c.toon, toon, 'toon');
    add(c.sign, signMat, 'signs');
    add(c.facade, facadeMat, 'facade');
    add(c.ground, groundMat, 'groundpatch');
    add(c.flag, flagMat, 'flags');
  }

  /* ---------------------------------------------------------------- instanced props */
  const lampMesh = lamps.build(lampGeometry(), toon);
  const treeMesh = trees.build(treeGeometry(), toon);
  const palmMesh = palms.build(palmGeometry(), toon);
  const bikeMesh = bikes.build(motorbikeGeometry(), toon);
  root.add(lampMesh, treeMesh, palmMesh, bikeMesh);
  // Palms around the island
  {
    const ip = new Instancer();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ip.add(
        rb.cx + Math.cos(a) * (islandR - 6),
        0.2,
        rb.cz + Math.sin(a) * (islandR - 6),
        a * 3,
        1.0 + hash01(k) * 0.25,
      );
    }
    root.add(ip.build(palmGeometry(), toon));
  }
  const bodyMesh = crowdBody.build(personBodyGeometry(), toon);
  const headMesh = crowdHead.build(personHeadGeometry(), toon);
  // The crowd only bounces in place: cull it as a whole (bounds from its rest pose plus the hop),
  // so views and shadow passes away from the grandstand skip it.
  for (const m of [bodyMesh, headMesh]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.computeBoundingSphere();
    if (m.boundingSphere) m.boundingSphere.radius += 2;
    m.userData.noShadow = true;
  }
  root.add(bodyMesh, headMesh);

  /* ---------------------------------------------------------------- boulevard traffic */
  interface Car {
    mesh: THREE.InstancedMesh;
    i: number;
    x: number;
    z: number;
    dir: 1 | -1;
    speed: number;
  }
  const cars: Car[] = [];
  const carColors = [0xf4f4f4, 0x2a2b30, 0xc4c7cc, 0xf2453d, 0x2f8cff, 0xffc928];
  const sedanI = new Instancer();
  const angkotI = new Instancer();
  const lanes: [number, 1 | -1][] = [
    [bx + 3, 1],
    [bx + 7, 1],
    [bx - 3, -1],
    [bx - 7, -1],
  ];
  const carSpecs: { kind: 'sedan' | 'angkot'; lane: number; z: number; speed: number; color: number }[] = [];
  for (let k = 0; k < 22; k += thin ? 2 : 1) {
    const lane = k % 4;
    const kind = hash01(k * 3.3) < 0.3 ? 'angkot' : 'sedan';
    carSpecs.push({
      kind,
      lane,
      z: 30 + hash01(k * 5.1) * 440,
      speed: 7 + hash01(k * 2.2) * 6,
      color: kind === 'angkot' ? 0x2f8cff : carColors[k % carColors.length]!,
    });
  }
  for (const c of carSpecs) (c.kind === 'sedan' ? sedanI : angkotI).add(0, 0, 0, 0, 1, c.color);
  const sedanMesh = sedanI.build(carGeometry('sedan'), toon);
  const angkotMesh = angkotI.build(carGeometry('angkot'), toon);
  // Traffic stays on the boulevard under the flyover: bound it by the whole boulevard.
  for (const m of [sedanMesh, angkotMesh]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(bx, 1, 251), 226);
    m.userData.noShadow = true;
  }
  root.add(sedanMesh, angkotMesh);
  {
    let si = 0;
    let ai = 0;
    for (const c of carSpecs) {
      const [x, dir] = lanes[c.lane]!;
      cars.push({
        mesh: c.kind === 'sedan' ? sedanMesh : angkotMesh,
        i: c.kind === 'sedan' ? si++ : ai++,
        x,
        z: c.z,
        dir,
        speed: c.speed,
      });
    }
  }

  /* ---------------------------------------------------------------- warung tenda + gerobak */
  function addWarung(
    c: ChunkBuilders & { flag: GeoBuilder },
    m: THREE.Matrix4,
    w: number,
    seed: number,
  ): void {
    const t = c.toon;
    const stripe = hash01(seed) > 0.5 ? 0xff5a1f : 0x2f8cff;
    const depth = 4.2;
    // A small ruko behind the tent keeps the street wall continuous.
    addRuko(c, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -4.7)), A.signs, {
      w,
      depth: 6.3,
      floors: 2,
      seed: seed + 17,
      signSlot: signSeq++ % A.signs.shopCount,
    });
    // Posts
    for (const sx of [-1, 1]) {
      for (const sz of [0, -depth])
        t.primIn(m, 'cyl6', sx * (w / 2 - 0.3), 1.35, sz + 0.3, 0.1, 2.7, 0.1, 0xb9bec4);
    }
    // Striped roof as slats
    const slats = 8;
    for (let k = 0; k < slats; k++) {
      const x = -w / 2 + (w / slats) * (k + 0.5);
      t.primIn(
        m,
        'box',
        x,
        2.95,
        -depth / 2 + 0.3,
        w / slats + 0.02,
        0.06,
        depth + 0.5,
        k % 2 ? stripe : 0xfff7f0,
        0.1,
        0,
        0,
      );
    }
    // Front banner (cloth) with the warung name
    t.primIn(m, 'box', 0, 2.4, 0.42, w - 0.4, 0.9, 0.04, 0xfff7f0);
    signQuad(c.sign, m, 0, 2.4, 0.45, w - 0.6, 0.82, signsTent(seed));
    // Table, benches, cook station
    t.primIn(m, 'box', 0, 0.75, -2.0, w - 1.4, 0.08, 0.9, 0xfff7f0);
    t.primIn(m, 'box', 0, 0.38, -2.0, w - 1.5, 0.7, 0.1, 0x8a9096);
    for (const z of [-1.2, -2.8]) t.primIn(m, 'box', 0, 0.42, z, w - 1.4, 0.08, 0.32, 0x6b4a2a);
    t.primIn(m, 'box', -w / 2 + 1.0, 0.5, -0.4, 1.0, 1.0, 0.7, 0xc9ccd1);
    t.primIn(m, 'cyl12', -w / 2 + 1.0, 1.1, -0.4, 0.7, 0.18, 0.7, 0x2a2b30);
    t.primIn(m, 'cyl8', -w / 2 + 1.8, 0.35, -0.4, 0.35, 0.7, 0.35, 0x2f8cff);
    // Plates and glasses
    for (let k = 0; k < 4; k++) {
      t.primIn(m, 'cyl8', -w / 2 + 1.4 + k * 1.1, 0.82, -2.0, 0.35, 0.04, 0.35, 0xffffff);
      t.primIn(m, 'cyl6', -w / 2 + 1.7 + k * 1.1, 0.88, -1.8, 0.12, 0.18, 0.12, 0xd9883a);
    }
    const v = new THREE.Vector3(-w / 2 + 1.0, 1.5, -0.4).applyMatrix4(m);
    steam.push(v);
  }

  function signsTent(seed: number) {
    return A.signs.sign(A.signs.tentStart + (Math.floor(hash01(seed + 1) * 100) % A.signs.tentCount));
  }

  function addGerobak(c: ChunkBuilders, m: THREE.Matrix4, seed: number): void {
    const t = c.toon;
    const body = hash01(seed) > 0.5 ? 0x2f8cff : 0x22b35e;
    t.primIn(m, 'box', 0, 0.85, 0, 0.8, 0.7, 1.7, body);
    t.primIn(m, 'box', 0, 1.25, 0, 0.82, 0.08, 1.72, 0xf4f4f4);
    t.primIn(m, 'box', 0, 1.6, -0.25, 0.7, 0.6, 1.0, 0xbfe4f0);
    t.primIn(m, 'box', 0, 1.92, -0.25, 0.78, 0.06, 1.1, 0xf4f4f4);
    t.primIn(m, 'cyl12', 0.05, 1.45, 0.5, 0.5, 0.4, 0.5, 0xc9ccd1);
    t.primIn(m, 'cyl12', 0.05, 1.67, 0.5, 0.52, 0.06, 0.52, 0x9aa0a6);
    for (const sz of [-0.6, 0.6])
      t.primIn(m, 'cyl12', 0.42, 0.4, sz, 0.8, 0.08, 0.8, 0x2a2b30, 0, 0, Math.PI / 2);
    t.primIn(m, 'box', -0.42, 0.85, 0, 0.02, 0.5, 1.4, 0xf4f4f4);
    for (const r of [Math.PI / 2, -Math.PI / 2]) {
      const sm = m.clone().multiply(new THREE.Matrix4().makeRotationY(r));
      signQuad(c.sign, sm, 0, 0.85, 0.42, 1.3, 0.36, A.signs.sign(A.signs.cartSlot));
    }
    // Stool
    t.primIn(m, 'cyl8', -0.9, 0.25, 0.4, 0.35, 0.5, 0.35, 0xf2453d);
  }

  /* ---------------------------------------------------------------- flags helper */
  function addFlag(
    b: GeoBuilder,
    x: number,
    y: number,
    z: number,
    ang: number,
    w: number,
    h: number,
    cols: number[],
  ): void {
    const fx = Math.cos(ang);
    const fz = -Math.sin(ang);
    const bands = cols.length;
    for (let k = 0; k < bands; k++) {
      const y0 = y - (h / bands) * k;
      const y1 = y0 - h / bands;
      for (let seg = 0; seg < 3; seg++) {
        const a0 = (seg / 3) * w;
        const a1 = ((seg + 1) / 3) * w;
        b.quad(
          [x + fx * a0, y1, z + fz * a0],
          [x + fx * a1, y1, z + fz * a1],
          [x + fx * a1, y0, z + fz * a1],
          [x + fx * a0, y0, z + fz * a0],
          cols[k]!,
          undefined,
          [seg / 3, (seg + 1) / 3, (seg + 1) / 3, seg / 3],
        );
      }
    }
  }

  /* ---------------------------------------------------------------- sky */
  // Sky dome, sun, distant skyline and clouds travel with the camera (see `followSky`), so the
  // camera far plane can stay short and fogged-out city chunks are culled.
  const sunDir = new THREE.Vector3(-0.55, 0.78, 0.3).normalize();
  const fogColor = SKY_HORIZON.clone();
  const sky = new THREE.Group();
  sky.name = 'sky';
  {
    const dome = new THREE.SphereGeometry(490, 32, 16);
    paint(dome, (_x, y) => {
      const t = Math.max(0, Math.min(1, y / 330));
      return SKY_HORIZON.clone().lerp(SKY_TOP, t ** 0.7);
    });
    const skyMesh = new THREE.Mesh(
      dome,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    skyMesh.renderOrder = -10;
    sky.add(skyMesh);
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(20, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, depthWrite: false }),
    );
    sun.position.copy(sunDir).multiplyScalar(460);
    sun.lookAt(0, 0, 0);
    sun.renderOrder = -9;
    sky.add(sun);
    const ring = new THREE.CylinderGeometry(440, 440, 96, 64, 1, true);
    const uv = ring.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 4);
    const skyline = new THREE.Mesh(
      ring,
      new THREE.MeshBasicMaterial({
        map: A.skyline,
        transparent: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    skyline.position.y = 44;
    skyline.renderOrder = -8;
    sky.add(skyline);
  }
  const cloudGroup = new THREE.Group();
  {
    const cb = new GeoBuilder();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + hash01(k) * 0.3;
      const r = 330 + hash01(k + 4) * 110;
      const g = cloudGeometry(k * 13 + 1);
      cb.addGeometry(
        g,
        new THREE.Matrix4().compose(
          new THREE.Vector3(Math.cos(a) * r, 95 + hash01(k + 8) * 80, Math.sin(a) * r),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
          new THREE.Vector3(0.9, 0.65, 0.9),
        ),
        0xffffff,
      );
    }
    const clouds = new THREE.Mesh(
      cb.build(),
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
    );
    clouds.renderOrder = -7;
    cloudGroup.add(clouds);
    sky.add(cloudGroup);
  }
  root.add(sky);
  // Kites over the city
  const kites: { mesh: THREE.Mesh; base: THREE.Vector3; ph: number }[] = [];
  {
    const spots: [number, number, number, number, number][] = [
      [60, 70, -70, 0xf2453d, 0xffc928],
      [-90, 58, 150, 0x22b35e, 0xfff7f0],
      [230, 64, 110, 0x2f8cff, 0xffc928],
      [120, 75, 260, 0xff5a1f, 0x111214],
      [-200, 66, -40, 0xffc928, 0xf2453d],
    ];
    const kmat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    for (const [x, y, z, a, b] of spots) {
      const mesh = new THREE.Mesh(kiteGeometry(a, b), kmat);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(1.6);
      root.add(mesh);
      kites.push({ mesh, base: new THREE.Vector3(x, y, z), ph: hash01(x + z) * 6 });
    }
  }

  /* ---------------------------------------------------------------- animation */
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return {
    id: 'kota',
    kind: 'circuit',
    root,
    mood: {
      sunDir,
      sunColor: 0xfff1d6,
      sunIntensity: 2.1,
      hemiSky: 0xdcefff,
      hemiGround: 0x9c8f7a,
      hemiIntensity: 1.25,
      fog: fogColor,
      fogNear: 140,
      fogFar: 460,
    },
    steam,
    fountain,
    followSky(x: number, z: number) {
      sky.position.set(x, 0, z);
    },
    setLights(n: number) {
      const cols = [0x3a2a2a, 0x3a3320, 0x1f3326];
      lampMats.forEach((mat, k) => {
        let c = cols[k]!;
        if (n === 1 && k === 0) c = 0xff3b30;
        if (n === 2 && k === 1) c = 0xffc928;
        if (n === 3 && k === 2) c = 0x3ee07a;
        mat.color.setHex(c);
      });
    },
    update(t: number, dt: number) {
      waves.uTime.value = t;
      A.water.offset.set((t * 0.05) % 1, (t * 0.03) % 1);
      cloudGroup.rotation.y = t * 0.002;
      // Crowd bounce
      for (const p of crowdBase) {
        tmpP.copy(p.p);
        tmpP.y += Math.abs(Math.sin(t * 5.5 + p.phase)) * p.amp;
        tmpM.compose(tmpP, p.q, tmpS.setScalar(p.s));
        bodyMesh.setMatrixAt(p.i, tmpM);
        headMesh.setMatrixAt(p.i, tmpM);
      }
      bodyMesh.instanceMatrix.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
      // Traffic
      for (const c of cars) {
        c.z += c.dir * c.speed * dt;
        if (c.z > 470) c.z = 32;
        if (c.z < 32) c.z = 470;
        const edge = Math.min(1, (c.z - 32) / 10, (470 - c.z) / 10);
        tmpQ.setFromAxisAngle(up, c.dir > 0 ? 0 : Math.PI);
        tmpM.compose(tmpP.set(c.x, 0, c.z), tmpQ, tmpS.setScalar(Math.max(0.001, edge)));
        c.mesh.setMatrixAt(c.i, tmpM);
      }
      sedanMesh.instanceMatrix.needsUpdate = true;
      angkotMesh.instanceMatrix.needsUpdate = true;
      for (const k of kites) {
        k.mesh.position.set(
          k.base.x + Math.sin(t * 0.4 + k.ph) * 4,
          k.base.y + Math.sin(t * 0.7 + k.ph) * 2,
          k.base.z,
        );
        k.mesh.rotation.set(Math.sin(t * 0.9 + k.ph) * 0.15, k.ph, Math.sin(t * 1.1 + k.ph) * 0.3);
      }
    },
  };
}
