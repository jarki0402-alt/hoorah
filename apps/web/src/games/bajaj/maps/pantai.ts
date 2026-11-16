/**
 * Pesisir Pantai: a coastal circuit at golden hour. Promenade start, a wooden pier out over the sea
 * and back, a stone humpback bridge over a creek (fast bajaj leave the ground), a beach road lined
 * with stalls, umbrellas and jukung boats, the lighthouse headland, and a fishing village.
 */
import * as THREE from 'three';
import { GeoBuilder, hash01, mix, paint } from '../geo';
import { Instancer, palmGeometry, personBodyGeometry, personHeadGeometry } from '../props';
import { STR } from '../strings';
import { asphaltTexture, waterTexture } from '../textures';
import type { Track } from '../track';
import { PIER_HEIGHT, SHORE_Z } from '../tracks';
import {
  boatGeometry,
  buildGantry,
  buildRoad,
  buildSky,
  Chunks,
  frame,
  type Mats,
  postGeometry,
  quadIn,
  rngFor,
  rockGeometry,
  textAtlas,
  toonMaterial,
} from './kit';
import type { MapScene } from './types';

const SAND = 0xe9d3a3;
const WET_SAND = 0xcdb382;
const TOWN = 0xcdbf9f;
const GRASS = 0x8fbf5a;

export function buildPantai(T: Track): MapScene {
  const root = new THREE.Group();
  root.name = 'pantai';
  const M = T.marks;
  const pier = M.pier!;
  const bridge = M.bridge!;
  const lh = M.lighthouse!;
  const rnd = rngFor(41);
  const signs = textAtlas([
    ...STR.beachSigns.map((text, i) => ({
      text,
      bg: ['#FF5A1F', '#2F8CFF', '#FFC928', '#22B35E', '#F2453D', '#FFF7F0'][i % 6]!,
      fg: i % 6 === 2 || i % 6 === 5 ? '#111214' : '#FFF7F0',
    })),
    { text: STR.beachGate, bg: '#2F8CFF', fg: '#FFF7F0' },
    { text: STR.pierSign, bg: '#7A5232', fg: '#FFF7F0' },
  ]);
  const asphalt = asphaltTexture();
  const mats: Mats = {
    toon: toonMaterial(),
    sign: new THREE.MeshBasicMaterial({ map: signs.texture, vertexColors: true }),
    road: new THREE.MeshLambertMaterial({ map: asphalt }),
    unlit: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const chunks = new Chunks();
  const steam: THREE.Vector3[] = [];
  const B = T.bounds;
  const cx = (B.minX + B.maxX) / 2;
  const cz = (B.minZ + B.maxZ) / 2;

  /* ---------------------------------------------------------------- ground and sea */
  {
    const g = new THREE.PlaneGeometry(1500, 1500, 150, 150);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0, cz);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      let y = -0.08;
      // Hills behind the village rise to the north.
      if (z < -40) y = Math.min(40, (-40 - z) * 0.22) + Math.sin(x * 0.02) * 3 * Math.min(1, (-40 - z) / 60);
      // The beach slopes under the water.
      if (z > SHORE_Z) y = -0.08 - (z - SHORE_Z) * 0.06;
      p.setY(i, y);
    }
    g.computeVertexNormals();
    paint(g, (x, y, z) => {
      if (z > SHORE_Z - 3) return new THREE.Color(WET_SAND);
      if (z > 30) return mix(SAND, 0xf0dcb0, hash01(Math.floor(x / 9) * 7 + Math.floor(z / 9)) * 0.5);
      if (z < -40) return mix(GRASS, 0x6fa84a, Math.min(1, y / 20));
      return mix(TOWN, GRASS, hash01(Math.floor(x / 14) * 3 + Math.floor(z / 14) * 5) > 0.7 ? 0.6 : 0);
    });
    const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.name = 'ground';
    root.add(ground);

    // Sea: shallow turquoise to deep blue, rippling texture on top.
    const sea = new THREE.PlaneGeometry(1600, 900, 40, 30);
    sea.rotateX(-Math.PI / 2);
    sea.translate(cx, -0.35, SHORE_Z + 450);
    paint(sea, (_x, _y, z) => mix(0x3fc8cf, 0x1d6fa8, Math.min(1, (z - SHORE_Z) / 160)));
    const water = waterTexture();
    water.repeat.set(60, 34);
    const seaMesh = new THREE.Mesh(
      sea,
      new THREE.MeshLambertMaterial({ vertexColors: true, map: water, transparent: true, opacity: 0.94 }),
    );
    seaMesh.name = 'sea';
    root.add(seaMesh);
    (root.userData as { water?: THREE.Texture }).water = water;
    // Foam line
    const foam = new THREE.PlaneGeometry(1600, 2.4, 1, 1);
    foam.rotateX(-Math.PI / 2);
    foam.translate(cx, -0.2, SHORE_Z + 1.5);
    root.add(
      new THREE.Mesh(foam, new THREE.MeshBasicMaterial({ color: 0xfdfbf4, transparent: true, opacity: 0.8 })),
    );
  }

  /* ---------------------------------------------------------------- road */
  const inPier = (s: number) => s > pier.s0 - 2 && s < pier.s1 + 2 && T.heightAt(s) > 0.3;
  const onBridge = (s: number) => s > bridge.s0 - 1 && s < bridge.s1 + 1;
  const posts = buildRoad(T, chunks, {
    curb: [0x2f8cff, 0xf4f4f4],
    verge: (s, side) => (s > M.startStraight.s0 || s < 120 ? (side < 0 ? 0xd9d2c4 : 0xcfc8ba) : SAND),
    barrier: (s) => (inPier(s) || onBridge(s) ? 'wood' : 'rail'),
    deck: (s) => (inPier(s) ? 'wood' : onBridge(s) ? 'stone' : null),
    surface: (s) => (inPier(s) && T.heightAt(s) > PIER_HEIGHT * 0.6 ? 'planks' : 'asphalt'),
  });
  root.add(posts.build(postGeometry(), mats.toon));

  /* ---------------------------------------------------------------- pier platform, lamps, people */
  const people: { x: number; y: number; z: number; r: number }[] = [];
  {
    // Round deck at the U-turn: benches, lamps, anglers.
    const seg3 = (T.segStart[3]! + T.segStart[4]!) / 2;
    const mid = T.frame(seg3);
    const pcx = mid.x - mid.tz * 26;
    const pcz = mid.z + mid.tx * 26;
    const c = chunks.at(pcx, pcz);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      c.toon.prim(
        'box',
        pcx + Math.cos(a) * 9,
        PIER_HEIGHT - 0.05,
        pcz + Math.sin(a) * 9,
        1.6,
        0.12,
        18,
        k % 2 ? 0xa8754a : 0x9a6a42,
        0,
        -a,
        0,
      );
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      c.toon.prim('cyl8', pcx + Math.cos(a) * 15, -1.5, pcz + Math.sin(a) * 15, 0.5, 6, 0.5, 0x6b4a2a);
    }
    // Watch tower in the middle
    c.toon.prim('box', pcx, PIER_HEIGHT + 2.5, pcz, 3, 5, 3, 0xfff7f0);
    c.toon.prim('box', pcx, PIER_HEIGHT + 5.3, pcz, 4.2, 0.4, 4.2, 0xf2453d);
    c.toon.prim('cone8', pcx, PIER_HEIGHT + 6.4, pcz, 3.6, 1.8, 3.6, 0xf2453d);
    const sm = frame(pcx, 0, pcz, Math.atan2(mid.tx, mid.tz));
    quadIn(c.sign, sm, 0, PIER_HEIGHT + 3.6, 1.52, 2.8, 0.55, signs.uv(STR.beachSigns.length + 1));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      people.push({ x: pcx + Math.cos(a) * 6.5, y: PIER_HEIGHT, z: pcz + Math.sin(a) * 6.5, r: a });
    }
  }

  /* ---------------------------------------------------------------- creek under the bridge */
  {
    const bm = T.frame((bridge.s0 + bridge.s1) / 2);
    const c = chunks.at(bm.x, bm.z);
    // The creek runs across the road towards the sea.
    const hx = bm.x;
    c.toon.quad(
      [hx - 3.5, -0.02, bm.z - 40],
      [hx - 3.5, -0.02, SHORE_Z + 2],
      [hx + 3.5, -0.02, SHORE_Z + 2],
      [hx + 3.5, -0.02, bm.z - 40],
      0x3fb3c9,
    );
    for (const sx of [-1, 1]) {
      for (let z = bm.z - 40; z < SHORE_Z; z += 3)
        c.toon.prim('gem', hx + sx * 4.2, 0.1, z + rnd() * 2, 1.4, 0.6, 1.6, 0x9a938a);
    }
  }

  /* ---------------------------------------------------------------- lighthouse headland */
  let lamp: THREE.Mesh;
  {
    const c = chunks.at(lh.x, lh.z);
    const rocks = new Instancer();
    for (let k = 0; k < 26; k++) {
      const a = rnd() * Math.PI * 2;
      const r = 4 + rnd() * 14;
      rocks.add(lh.x + Math.cos(a) * r, -0.2, lh.z + Math.sin(a) * r, rnd() * 6, 1.2 + rnd() * 2.2, 0xffffff);
    }
    root.add(rocks.build(rockGeometry(), mats.toon));
    c.toon.prim('cyl12', lh.x, 1.2, lh.z, 12, 2.4, 12, 0x9a938a);
    const tower = new THREE.CylinderGeometry(1.5, 2.6, 20, 16, 5);
    paint(tower, (_x, y) =>
      Math.floor((y + 10) / 4) % 2 ? new THREE.Color(0xf2453d) : new THREE.Color(0xfff7f0),
    );
    c.toon.addGeometry(tower, new THREE.Matrix4().makeTranslation(lh.x, 12.4, lh.z), 0xffffff);
    c.toon.prim('cyl16', lh.x, 22.6, lh.z, 4.6, 0.4, 4.6, 0x2a2b30);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      c.toon.prim('box', lh.x + Math.cos(a) * 2.2, 23.3, lh.z + Math.sin(a) * 2.2, 0.08, 1.0, 0.08, 0x2a2b30);
    }
    c.toon.prim('cone8', lh.x, 26.4, lh.z, 2.6, 1.6, 2.6, 0xf2453d);
    lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 2.2, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff1b8 }),
    );
    lamp.position.set(lh.x, 24.4, lh.z);
    root.add(lamp);
  }

  /* ---------------------------------------------------------------- beach strip: stalls, umbrellas, boats */
  const palms = new Instancer();
  const boatsOnSand: { x: number; z: number; r: number; c: number }[] = [];
  {
    const sBeach0 = T.segStart[6]!;
    const sBeach1 = T.segStart[13]!;
    for (let s = sBeach0 + 4; s < sBeach1; s += 9) {
      if (s > bridge.s0 - 14 && s < bridge.s1 + 10) continue;
      const i = T.index(s);
      const wall = T.wallR[i]!;
      // Beach road heads west: its left side (-d) is the sea side.
      const p = T.point(s, -(wall + 4.5));
      if (p.z > SHORE_Z - 4) continue;
      const c = chunks.at(p.x, p.z);
      const r = hash01(s * 3.7);
      const h = T.headingAt(s);
      const m = frame(p.x, 0, p.z, h + Math.PI / 2);
      if (r < 0.35) {
        // Bamboo stall with a thatched roof
        for (const sx of [-1.6, 1.6])
          for (const sz of [-1.2, 1.2]) c.toon.primIn(m, 'cyl6', sx, 1.3, sz, 0.18, 2.6, 0.18, 0xc9a35a);
        c.toon.addGeometry(
          new THREE.ConeGeometry(0.5, 1, 4),
          new THREE.Matrix4().multiplyMatrices(
            m,
            new THREE.Matrix4().compose(
              new THREE.Vector3(0, 3.2, 0),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4),
              new THREE.Vector3(5.4, 1.6, 4.2),
            ),
          ),
          0xc8a46a,
        );
        c.toon.primIn(m, 'box', 0, 0.55, 1.0, 3.2, 1.1, 0.5, 0x9c6b3c);
        for (let k = 0; k < 4; k++)
          c.toon.primIn(
            m,
            'sphereLo',
            -1.1 + k * 0.7,
            1.25,
            1.0,
            0.45,
            0.45,
            0.45,
            [0x3fae5a, 0xffc928, 0xf2453d, 0x8fd14f][k]!,
          );
        quadIn(c.sign, m, 0, 2.35, 1.3, 3.0, 0.55, signs.uv(Math.floor(r * 100) % STR.beachSigns.length));
        steam.push(new THREE.Vector3().setFromMatrixPosition(m).add(new THREE.Vector3(0, 1.4, 0)));
      } else if (r < 0.75) {
        // Umbrella and two chairs
        const col = [0xf2453d, 0xffc928, 0x2f8cff, 0xff5a1f, 0x22b35e][Math.floor(r * 50) % 5]!;
        c.toon.primIn(m, 'cyl6', 0, 1.3, 0, 0.1, 2.6, 0.1, 0xe8ecef);
        c.toon.primIn(m, 'cone8', 0, 2.75, 0, 3.4, 0.7, 3.4, col);
        for (const sx of [-0.9, 0.9])
          c.toon.primIn(m, 'box', sx, 0.3, 0.6, 0.7, 0.12, 1.8, 0xfff7f0, 0.25, 0, 0);
      } else {
        boatsOnSand.push({
          x: p.x,
          z: Math.min(SHORE_Z - 3, p.z + 3),
          r: h + 0.3 * (r - 0.85) * 4,
          c: Math.floor(r * 1000),
        });
      }
      if (hash01(s * 9.1) < 0.6) {
        const q = T.point(s + 4, -(wall + 1.5));
        palms.add(q.x, 0, q.z, rnd() * 6, 0.9 + rnd() * 0.4);
      }
    }
  }

  /* ---------------------------------------------------------------- village and promenade */
  {
    const house = (x: number, z: number, h: number, seed: number) => {
      const c = chunks.at(x, z);
      const m = frame(x, 0, z, h);
      const wall = [0xfff7f0, 0xbfe3d0, 0xf9d976, 0xa8d5e8, 0xf7c9b6][Math.floor(hash01(seed) * 5)]!;
      const roof = [0xc2552d, 0xd2693a, 0x8e4a2a][Math.floor(hash01(seed + 1) * 3)]!;
      const w = 6 + hash01(seed + 2) * 3;
      const d = 6 + hash01(seed + 3) * 2;
      c.toon.primIn(m, 'box', 0, 1.7, 0, w, 3.4, d, wall);
      const roofGeo = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1);
      c.toon.addGeometry(
        roofGeo,
        new THREE.Matrix4().multiplyMatrices(
          m,
          new THREE.Matrix4().compose(
            new THREE.Vector3(0, 4.4, 0),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4),
            new THREE.Vector3(w * 0.78, 2.2, d * 0.78),
          ),
        ),
        roof,
      );
      c.toon.primIn(m, 'box', 0, 1.1, d / 2 + 0.01, 1.1, 2.2, 0.06, 0x7a4a2a);
      for (const sx of [-1, 1])
        c.toon.primIn(m, 'box', sx * (w / 4 + 0.3), 1.9, d / 2 + 0.01, 1.1, 0.9, 0.06, 0x3d5a73);
      c.toon.primIn(m, 'box', 0, 0.12, d / 2 + 1.2, w, 0.24, 2.2, 0xd9d2c4);
    };
    // Rows along the start straight (north side) and between promenade and beach road.
    const sA = M.startStraight.s0;
    const L = T.length;
    for (let s = sA; s < L + 110; s += 11) {
      const ss = T.wrap(s);
      const i = T.index(ss);
      const h = T.headingAt(ss);
      for (const side of [-1, 1] as const) {
        const wall = side < 0 ? T.wallL[i]! : T.wallR[i]!;
        const p = T.point(ss, side * (wall + 7));
        if (side > 0 && p.z > 28) continue;
        if (Math.abs(ss) < 6) continue;
        house(p.x, p.z, h + (side < 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI, Math.floor(s * 3 + side));
        if (hash01(s + side) < 0.5) {
          const q = T.point(ss + 5, side * (wall + 1.6));
          palms.add(q.x, 0, q.z, rnd() * 6, 0.85 + rnd() * 0.3);
        }
      }
    }
    // Spectators on the promenade by the gantry.
    for (let s = -40; s < 30; s += 1.7) {
      if (Math.abs(s) < 3) continue;
      const p = T.point(s, -(12.5 + 1.2 + hash01(s) * 0.8));
      people.push({ x: p.x, y: 0, z: p.z, r: T.headingAt(s) - Math.PI / 2 });
    }
    // Gate over the promenade entrance.
    const gs = M.startStraight.s0 + 30;
    const gp = T.point(gs, 0);
    const gm = frame(gp.x, 0, gp.z, T.headingAt(gs));
    const c = chunks.at(gp.x, gp.z);
    for (const sx of [-1, 1]) c.toon.primIn(gm, 'box', sx * 13.2, 3.5, 0, 0.9, 7, 0.9, 0xfff7f0);
    c.toon.primIn(gm, 'box', 0, 7.3, 0, 27.4, 0.9, 0.9, 0x2f8cff);
    quadIn(
      c.sign,
      frame(gp.x, 0, gp.z, T.headingAt(gs) + Math.PI),
      0,
      7.3,
      0.47,
      9,
      0.85,
      signs.uv(STR.beachSigns.length),
    );
  }

  /* ---------------------------------------------------------------- boats */
  const boatGeos = [
    boatGeometry(0x2f8cff, 0xfff7f0),
    boatGeometry(0xf2453d, 0xffc928),
    boatGeometry(0x22b35e, 0xfff7f0),
    boatGeometry(0xffc928, 0x2f8cff),
  ];
  const floating: { mesh: THREE.Mesh; x: number; z: number; ph: number; r: number }[] = [];
  for (const b of boatsOnSand) {
    const mesh = new THREE.Mesh(boatGeos[b.c % 4]!, mats.toon);
    mesh.position.set(b.x, 0, b.z);
    mesh.rotation.set(0, b.r, 0.08);
    root.add(mesh);
  }
  for (let k = 0; k < 12; k++) {
    const x = cx + (rnd() - 0.5) * 520;
    const z = SHORE_Z + 25 + rnd() * 160;
    // Keep clear of the pier.
    if (x > 90 && x < 180 && z < 175) continue;
    const mesh = new THREE.Mesh(boatGeos[k % 4]!, mats.toon);
    mesh.position.set(x, -0.3, z);
    root.add(mesh);
    floating.push({ mesh, x, z, ph: rnd() * 6, r: rnd() * 6 });
  }

  /* ---------------------------------------------------------------- instanced extras */
  for (let k = 0; k < 40; k++) {
    // Palms on the headland and along the far beach.
    const a = rnd() * Math.PI * 2;
    palms.add(
      lh.x + Math.cos(a) * (16 + rnd() * 20),
      0,
      lh.z + Math.sin(a) * (16 + rnd() * 18),
      rnd() * 6,
      0.9 + rnd() * 0.4,
    );
  }
  for (let x = B.minX - 120; x < B.maxX + 120; x += 18) {
    if (x > 92 && x < 176) continue;
    palms.add(x + rnd() * 6, 0, SHORE_Z - 6 - rnd() * 6, rnd() * 6, 0.9 + rnd() * 0.5);
  }
  root.add(palms.build(palmGeometry(), mats.toon));
  {
    const body = new Instancer();
    const head = new Instancer();
    const shirts = [0xf2453d, 0xffc928, 0x2f8cff, 0x22b35e, 0xff8a3d, 0xfff7f0, 0x14b8a6];
    const skin = [0xf3d9b1, 0xe0b98f, 0xc99a6e, 0xa8774d];
    people.forEach((p, i) => {
      body.add(p.x, p.y, p.z, p.r, 0.95, shirts[i % shirts.length]!);
      head.add(p.x, p.y, p.z, p.r, 0.95, skin[i % skin.length]!);
    });
    root.add(body.build(personBodyGeometry(), mats.toon), head.build(personHeadGeometry(), mats.toon));
  }

  const gantry = buildGantry(T, chunks, root, 0x2f8cff, 0xfff7f0);
  chunks.flush(root, mats);

  /* ---------------------------------------------------------------- sky, gulls */
  const sunDir = new THREE.Vector3(-0.72, 0.36, 0.6).normalize();
  const far = new THREE.Group();
  {
    // Distant islands on the horizon.
    const ib = new GeoBuilder();
    ib.boxBevel = 0;
    for (let k = 0; k < 7; k++) {
      const a = 0.5 + (k / 7) * 2.2;
      ib.prim(
        'sphereLo',
        Math.cos(a) * 420,
        -8,
        Math.sin(a) * 420,
        60 + hash01(k) * 70,
        30 + hash01(k + 2) * 26,
        40,
        0x8fa9b8,
      );
    }
    const islands = new THREE.Mesh(
      ib.build(),
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
    );
    islands.renderOrder = -8;
    far.add(islands);
  }
  const sky = buildSky({
    top: 0x4fa3e0,
    horizon: 0xffd6a0,
    sunDir,
    sunColor: 0xfff0c8,
    sunSize: 30,
    clouds: 12,
    cloudTint: 0xfff2e2,
    far,
  });
  root.add(sky);
  const gulls: THREE.Mesh[] = [];
  {
    const gg = new GeoBuilder();
    gg.boxBevel = 0;
    gg.tri([0, 0, 0], [-1.1, 0.3, -0.2], [0, 0.1, 0.3], 0xffffff);
    gg.tri([0, 0, 0], [0, 0.1, 0.3], [1.1, 0.3, -0.2], 0xffffff);
    const geo = gg.build();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    for (let k = 0; k < 8; k++) {
      const m = new THREE.Mesh(geo, mat);
      root.add(m);
      gulls.push(m);
    }
  }
  const water = (root.userData as { water?: THREE.Texture }).water!;

  return {
    id: 'pantai',
    kind: 'circuit',
    root,
    mood: {
      sunDir,
      sunColor: 0xffdfae,
      sunIntensity: 2.3,
      hemiSky: 0xffe9cc,
      hemiGround: 0xc9a77c,
      hemiIntensity: 1.15,
      fog: new THREE.Color(0xf6dcb6),
      fogNear: 160,
      fogFar: 470,
    },
    steam,
    fountain: null,
    setLights: gantry.setLights,
    update(t: number) {
      water.offset.set((t * 0.015) % 1, (t * 0.04) % 1);
      for (const b of floating) {
        b.mesh.position.y = -0.3 + Math.sin(t * 1.3 + b.ph) * 0.12;
        b.mesh.rotation.set(Math.sin(t * 1.1 + b.ph) * 0.05, b.r, Math.sin(t * 0.9 + b.ph) * 0.07);
      }
      gulls.forEach((g, k) => {
        const a = t * (0.25 + k * 0.02) + k;
        const r = 30 + k * 6;
        g.position.set(
          cx + Math.cos(a) * r + k * 20 - 80,
          18 + Math.sin(t + k) * 3,
          SHORE_Z - 10 + Math.sin(a) * r * 0.5,
        );
        g.rotation.set(0, -a, Math.sin(t * 6 + k) * 0.3);
      });
      lamp.rotation.y = t * 1.5;
    },
    followSky(x: number, z: number) {
      sky.position.set(x, 0, z);
    },
  };
}
