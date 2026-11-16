/**
 * Lapangan Pasar, the Arena Tempur ground at dusk: a walled market square with parking bays, a
 * fountain island, planters, parked angkot, crate stacks and three kicker ramps, ringed by market
 * shophouses, festoon string lights and light towers.
 */
import * as THREE from 'three';
import type { Arena } from '../arena';
import { addRuko, type ChunkBuilders } from '../buildings';
import { GeoBuilder, hash01 } from '../geo';
import {
  carGeometry,
  Instancer,
  lampGeometry,
  personBodyGeometry,
  personHeadGeometry,
  treeGeometry,
} from '../props';
import { STR } from '../strings';
import { asphaltTexture, signAtlas, waterTexture } from '../textures';
import { buildSky, Chunks, frame, type Mats, quadIn, rngFor, textAtlas, toonMaterial, type V3 } from './kit';
import type { MapScene } from './types';

export function buildLapangan(A: Arena): MapScene {
  const root = new THREE.Group();
  root.name = 'lapangan';
  const rnd = rngFor(13);
  const signs = textAtlas([
    ...STR.arenaSigns.map((text, i) => ({
      text,
      bg: ['#FF5A1F', '#2F8CFF', '#22B35E', '#F2453D', '#FFC928', '#FFF7F0'][i % 6]!,
      fg: i % 6 >= 4 ? '#111214' : '#FFF7F0',
    })),
    { text: STR.arenaGate, bg: '#111214', fg: '#FFC928' },
  ]);
  const mats: Mats = {
    toon: toonMaterial(),
    sign: new THREE.MeshBasicMaterial({ map: signs.texture, vertexColors: true }),
    road: new THREE.MeshLambertMaterial({ map: asphaltTexture() }),
    unlit: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const chunks = new Chunks(60);
  const W = A.halfW;
  const D = A.halfD;
  const steam: THREE.Vector3[] = [];

  /* ---------------------------------------------------------------- ground */
  {
    const g = new GeoBuilder(true);
    g.boxBevel = 0;
    g.quad([-W, 0, D], [W, 0, D], [W, 0, -D], [-W, 0, -D], 0xffffff, [-W / 4, -D / 4, W / 4, D / 4]);
    root.add(new THREE.Mesh(g.build(), mats.road));
    const out = new GeoBuilder();
    out.boxBevel = 0;
    out.quad([-400, -0.05, 400], [400, -0.05, 400], [400, -0.05, -400], [-400, -0.05, -400], 0xbcb3a3);
    root.add(new THREE.Mesh(out.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const c = chunks.at(0, 0);
    // Plaza paving ring around the fountain.
    const ring = new THREE.RingGeometry(6, 11, 40, 1);
    ring.rotateX(-Math.PI / 2);
    c.toon.addGeometry(ring, new THREE.Matrix4().makeTranslation(0, 0.02, 0), 0xd9d2c4);
    // Parking bays on the north side and a dashed ring.
    for (let k = -8; k <= 8; k++) {
      const x = k * 3;
      if (Math.abs(x) < 4) continue;
      c.toon.quad(
        [x - 0.08, 0.02, -24],
        [x + 0.08, 0.02, -24],
        [x + 0.08, 0.02, -36],
        [x - 0.08, 0.02, -36],
        0xf2f2ee,
      );
    }
    c.toon.quad([-25, 0.02, -23.9], [25, 0.02, -23.9], [25, 0.02, -24.1], [-25, 0.02, -24.1], 0xf2f2ee);
    for (let k = 0; k < 48; k++) {
      if (k % 2) continue;
      const a0 = (k / 48) * Math.PI * 2;
      const a1 = ((k + 1) / 48) * Math.PI * 2;
      const pt = (a: number, r: number): V3 => [Math.cos(a) * r, 0.025, Math.sin(a) * r];
      c.toon.quad(pt(a0, 18), pt(a0, 18.3), pt(a1, 18.3), pt(a1, 18), 0xffc928);
    }
  }

  /* ---------------------------------------------------------------- boundary wall */
  const path: [number, number][] = [];
  {
    const ix = W - A.corner;
    const iz = D - A.corner;
    const corners: [number, number, number][] = [
      [ix, iz, 0],
      [-ix, iz, Math.PI / 2],
      [-ix, -iz, Math.PI],
      [ix, -iz, (3 * Math.PI) / 2],
    ];
    for (const [cx, cz, a0] of corners) {
      for (let k = 0; k <= 6; k++) {
        const a = a0 + (k / 6) * (Math.PI / 2);
        path.push([cx + Math.cos(a) * (A.corner + 0.4), cz + Math.sin(a) * (A.corner + 0.4)]);
      }
    }
    for (let i = 0; i < path.length; i++) {
      const [x0, z0] = path[i]!;
      const [x1, z1] = path[(i + 1) % path.length]!;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2));
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const mx = x0 + ((x1 - x0) * (t0 + t1)) / 2;
        const mz = z0 + ((z1 - z0) * (t0 + t1)) / 2;
        const c = chunks.at(mx, mz);
        c.toon.prim(
          'box',
          mx,
          0.6,
          mz,
          0.6,
          1.2,
          len / n + 0.02,
          (i * 31 + k) % 2 ? 0xffc928 : 0x2a2b30,
          0,
          Math.atan2(x1 - x0, z1 - z0),
          0,
        );
      }
    }
  }

  /* ---------------------------------------------------------------- obstacles */
  const trees = new Instancer();
  const angkot = new Instancer();
  const lamps = new Instancer();
  for (const o of A.obstacles) {
    const c = chunks.at(o.x, o.z);
    if (o.kind === 'circle') {
      if (o.tag === 'fountain') {
        c.toon.prim('cyl16', o.x, 0.4, o.z, o.r * 2, 0.8, o.r * 2, 0xd8ccb2);
        c.toon.prim('cyl16', o.x, 0.85, o.z, o.r * 2 + 0.4, 0.12, o.r * 2 + 0.4, 0xe8dcc4);
        c.toon.prim('cyl12', o.x, 1.2, o.z, 3.2, 1.6, 3.2, 0xe8dcc4);
        c.toon.prim('cyl12', o.x, 2.1, o.z, 4.6, 0.3, 4.6, 0xd8ccb2);
        c.toon.prim('sphereLo', o.x, 2.6, o.z, 1, 1, 1, 0xe0a526);
        const water = new THREE.Mesh(
          new THREE.CircleGeometry(o.r - 0.3, 32),
          new THREE.MeshBasicMaterial({ map: waterTexture() }),
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(o.x, 0.75, o.z);
        root.add(water);
      } else if (o.tag === 'planter') {
        c.toon.prim('cyl12', o.x, 0.45, o.z, o.r * 2, 0.9, o.r * 2, 0xc9c3b8);
        c.toon.prim('cyl12', o.x, 0.92, o.z, o.r * 2 - 0.3, 0.06, o.r * 2 - 0.3, 0x6b4a2a);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          c.toon.prim(
            'gem',
            o.x + Math.cos(a) * 1.5,
            1.05,
            o.z + Math.sin(a) * 1.5,
            0.6,
            0.4,
            0.6,
            [0xf2453d, 0xffc928, 0xff8a3d][k % 3]!,
          );
        }
        trees.add(o.x, 0.9, o.z, rnd() * 6, 0.55, 0xffffff);
      } else {
        lamps.add(o.x, 0, o.z, rnd() * 6, 1);
      }
    } else {
      if (o.tag === 'angkot') {
        angkot.add(o.x, 0, o.z, o.rot, 1, 0x2f8cff);
      } else if (o.tag === 'crates') {
        const m = frame(o.x, 0, o.z, o.rot);
        for (let a = -1; a <= 1; a += 2) {
          for (let b = -1; b <= 1; b += 2) {
            for (let h = 0; h < (a + b === 0 ? 3 : 2); h++) {
              c.toon.primIn(
                m,
                'box',
                a * o.hw * 0.48,
                0.45 + h * 0.92,
                b * o.hd * 0.48,
                o.hw * 0.92,
                0.9,
                o.hd * 0.92,
                (a + b + h) % 2 ? 0xc98f55 : 0xb5793f,
              );
            }
          }
        }
      } else {
        const m = frame(o.x, 0, o.z, o.rot);
        c.toon.primIn(m, 'box', 0, 0.85, 0, o.hw * 2, 0.7, o.hd * 2, 0x22b35e);
        c.toon.primIn(m, 'box', 0, 1.6, -0.3, o.hw * 1.6, 0.6, o.hd * 1.2, 0xbfe4f0);
        c.toon.primIn(m, 'cyl6', 0, 1.6, 0, 0.12, 3.2, 0.12, 0xe8ecef);
        c.toon.primIn(m, 'cone8', 0, 3.2, 0, 4.2, 0.8, 4.2, 0xf2453d);
        steam.push(new THREE.Vector3(o.x, 1.8, o.z));
      }
    }
  }

  /* ---------------------------------------------------------------- ramps */
  for (const r of A.ramps) {
    const c = chunks.at(r.x, r.z);
    const fx = Math.sin(r.rot);
    const fz = Math.cos(r.rot);
    const rx = -fz;
    const rz = fx;
    const P = (u: number, v: number, y: number): V3 => [r.x + fx * u + rx * v, y, r.z + fz * u + rz * v];
    const hl = r.len / 2;
    const hw = r.w / 2;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const u0 = -hl + (k / n) * hl;
      const u1 = -hl + ((k + 1) / n) * hl;
      const y0 = r.h * (1 - Math.abs(u0) / hl);
      const y1 = r.h * (1 - Math.abs(u1) / hl);
      const col = k % 2 ? 0xffc928 : 0x2a2b30;
      c.toon.quad(P(u0, -hw, y0), P(u0, hw, y0), P(u1, hw, y1), P(u1, -hw, y1), col);
      c.toon.quad(P(-u1, -hw, y1), P(-u1, hw, y1), P(-u0, hw, y0), P(-u0, -hw, y0), col);
    }
    for (const side of [-1, 1]) {
      c.toon.tri(P(-hl, side * hw, 0), P(hl, side * hw, 0), P(0, side * hw, r.h), 0x8a9096);
      c.toon.tri(P(hl, side * hw, 0), P(-hl, side * hw, 0), P(0, side * hw, r.h), 0x8a9096);
    }
  }

  /* ---------------------------------------------------------------- market around the square */
  const people: { x: number; y: number; z: number; r: number }[] = [];
  {
    const atlas = signAtlas();
    // Ruko signs come from the shared shop-sign atlas: their own builder and material.
    const rukoSigns = new GeoBuilder(true);
    const rukoFacade = new GeoBuilder(true);
    let slot = 0;
    const row = (x0: number, z0: number, x1: number, z1: number, facing: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len;
      const uz = (z1 - z0) / len;
      let t = 0;
      while (t < len - 5) {
        const w = 5 + Math.floor(hash01(t + x0) * 3) * 1.1;
        if (t + w > len) break;
        const cx = x0 + ux * (t + w / 2);
        const cz = z0 + uz * (t + w / 2);
        const c: ChunkBuilders = { toon: chunks.at(cx, cz).toon, sign: rukoSigns, facade: rukoFacade };
        const seed = Math.floor(cx * 7 + cz * 13);
        // Gate gap in the middle of the south side.
        if (!(Math.abs(cx) < 7 && z0 > 0)) {
          addRuko(c, frame(cx, 0, cz, facing), atlas, {
            w,
            depth: 10,
            floors: 2 + Math.floor(hash01(seed) * 2),
            seed,
            signSlot: slot++ % atlas.shopCount,
          });
        }
        t += w;
      }
    };
    const off = 6;
    row(-W - off, D + off, W + off, D + off, Math.PI); // south side, facing north into the square
    row(W + off, -D - off, -W - off, -D - off, 0);
    row(W + off, D + off - 4, W + off, -D - off + 4, -Math.PI / 2);
    row(-W - off, -D - off + 4, -W - off, D + off - 4, Math.PI / 2);
    if (rukoSigns.vertexCount)
      root.add(
        new THREE.Mesh(
          rukoSigns.build(),
          new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true }),
        ),
      );
    // Sidewalk ring and spectators behind the wall.
    for (let k = 0; k < 70; k++) {
      const p = path[Math.floor(rnd() * path.length)]!;
      const l = Math.hypot(p[0], p[1]);
      const x = p[0] + (p[0] / l) * 2.2;
      const z = p[1] + (p[1] / l) * 2.2;
      people.push({ x, y: 0, z, r: Math.atan2(-x, -z) });
    }
    // Gate sign over the south entrance.
    const gc = chunks.at(0, D + 6);
    const gm = frame(0, 0, D + 6, Math.PI);
    for (const sx of [-1, 1]) gc.toon.primIn(gm, 'box', sx * 6.5, 3.5, 0, 0.8, 7, 0.8, 0xfff7f0);
    gc.toon.primIn(gm, 'box', 0, 7.2, 0, 14, 1.1, 0.8, 0xff5a1f);
    quadIn(gc.sign, gm, 0, 7.2, 0.42, 9, 0.9, signs.uv(STR.arenaSigns.length));
    // Corner light towers.
    for (const [x, z] of [
      [W - 6, D - 6],
      [-W + 6, D - 6],
      [W - 6, -D + 6],
      [-W + 6, -D + 6],
    ] as const) {
      const c = chunks.at(x, z);
      c.toon.prim('cyl8', x * 1.12, 7, z * 1.12, 0.6, 14, 0.6, 0x5b616a);
      c.toon.prim('box', x * 1.12, 14.3, z * 1.12, 3.2, 1.4, 0.5, 0x3b3c42, 0, Math.atan2(-x, -z), 0);
      c.unlit.prim('box', x * 1.12, 14.3, z * 1.12, 2.8, 1.0, 0.56, 0xfff1b8, 0, Math.atan2(-x, -z), 0);
    }
  }

  /* ---------------------------------------------------------------- festoon lights */
  {
    const c = chunks.at(0, 0);
    const wire = (a: V3, b: V3, sag: number) => {
      const n = 22;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const sg = (t: number) => -Math.sin(t * Math.PI) * sag;
        const p0: V3 = [
          a[0] + (b[0] - a[0]) * t0,
          a[1] + (b[1] - a[1]) * t0 + sg(t0),
          a[2] + (b[2] - a[2]) * t0,
        ];
        const p1: V3 = [
          a[0] + (b[0] - a[0]) * t1,
          a[1] + (b[1] - a[1]) * t1 + sg(t1),
          a[2] + (b[2] - a[2]) * t1,
        ];
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        c.toon.prim(
          'box',
          (p0[0] + p1[0]) / 2,
          (p0[1] + p1[1]) / 2,
          (p0[2] + p1[2]) / 2,
          0.04,
          0.04,
          len,
          0x2a2b30,
          -Math.asin((p1[1] - p0[1]) / len),
          Math.atan2(p1[0] - p0[0], p1[2] - p0[2]),
          0,
        );
        c.unlit.prim(
          'sphereLo',
          p0[0],
          p0[1] - 0.18,
          p0[2],
          0.32,
          0.38,
          0.32,
          [0xffc928, 0xff8a3d, 0xfff1b8, 0xf2453d, 0x3ee07a][k % 5]!,
        );
      }
    };
    const top = 8.5;
    wire([-W - 4, top, -D - 4], [W + 4, top, D + 4], 2.4);
    wire([W + 4, top, -D - 4], [-W - 4, top, D + 4], 2.4);
    wire([-W - 4, top, 0], [W + 4, top, 0], 2.0);
    wire([0, top, -D - 4], [0, top, D + 4], 2.0);
    for (const [x, z] of [
      [-10, 25],
      [10, 25],
    ] as const) {
      wire([x, 7.6, z], [x * 3.4, top, D + 4], 1.2);
    }
  }

  root.add(
    trees.build(treeGeometry(), mats.toon),
    angkot.build(carGeometry('angkot'), mats.toon),
    lamps.build(lampGeometry(), mats.toon),
  );
  {
    const body = new Instancer();
    const head = new Instancer();
    const shirts = [0xf2453d, 0xffc928, 0x2f8cff, 0x22b35e, 0xff8a3d, 0xfff7f0, 0x14b8a6];
    const skin = [0xf3d9b1, 0xe0b98f, 0xc99a6e, 0xa8774d];
    people.forEach((p, i) => {
      body.add(p.x, p.y, p.z, p.r, 0.95, shirts[i % shirts.length]!);
      head.add(p.x, p.y, p.z, p.r, 0.95, skin[i % skin.length]!);
    });
    const bm = body.build(personBodyGeometry(), mats.toon);
    const hm = head.build(personHeadGeometry(), mats.toon);
    root.add(bm, hm);
  }
  chunks.flush(root, mats);

  /* ---------------------------------------------------------------- dusk sky */
  const sunDir = new THREE.Vector3(0.82, 0.14, 0.4).normalize();
  const sky = buildSky({
    top: 0x2c4f80,
    horizon: 0xffb070,
    sunDir,
    sunColor: 0xffd59a,
    sunSize: 34,
    clouds: 10,
    cloudTint: 0xffc89a,
  });
  root.add(sky);

  return {
    id: 'arena',
    kind: 'arena',
    root,
    mood: {
      sunDir,
      sunColor: 0xffc58a,
      sunIntensity: 1.7,
      hemiSky: 0xf6d2b0,
      hemiGround: 0x5a4a4a,
      hemiIntensity: 1.15,
      fog: new THREE.Color(0xeab48a),
      fogNear: 110,
      fogFar: 360,
    },
    steam,
    fountain: new THREE.Vector3(0, 2.2, 0),
    setLights() {},
    update() {},
    followSky(x: number, z: number) {
      sky.position.set(x, 0, z);
    },
  };
}
