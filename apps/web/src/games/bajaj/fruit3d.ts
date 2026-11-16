/**
 * The drivers: each player's fruit as a smooth, glossy 3D head with shiny eyes, cheeks and a
 * smile, plus a rounded torso and arms. One merged vertex-coloured geometry per driver (one draw
 * call) carrying per-vertex surfaces: clear-coated fruit skin, wet-looking eyes with a glint,
 * soft cotton shirt. The head faces +z and is centred on the origin, about 0.62 m across.
 */
import type { Fruit } from '@hoorah/protocol';
import * as THREE from 'three';
import {
  displace,
  GeoBuilder,
  glow,
  hash01,
  mix,
  noise3,
  paint,
  SURF,
  type Surf,
  shade,
  smooth,
} from './geo';

const INK = 0x16110f;
const WHITE = 0xffffff;
const CHEEK = 0xff7f86;
const SKIN = 0xf3d2a8;

/** Where the face sits on each fruit: centre height and the radius used to hug the surface. */
interface FaceSpot {
  y: number;
  r: number;
  scale: number;
}

function sphereZ(r: number, x: number, y: number): number {
  return Math.sqrt(Math.max(0.0001, r * r - x * x - y * y));
}

const sphereGeo = new Map<string, THREE.BufferGeometry>();
function sph(w: number, h: number): THREE.BufferGeometry {
  const k = `${w}x${h}`;
  let g = sphereGeo.get(k);
  if (!g) {
    g = new THREE.SphereGeometry(0.5, w, h);
    sphereGeo.set(k, g);
  }
  return g;
}

function ellipsoid(
  b: GeoBuilder,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  c: THREE.ColorRepresentation,
  surf: Surf,
  rx = 0,
  ry = 0,
  rz = 0,
  res: [number, number] = [14, 10],
): void {
  b.surface = surf;
  b.addGeometry(
    sph(res[0], res[1]),
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    ),
    c,
  );
}

function addFace(b: GeoBuilder, f: FaceSpot): void {
  const s = f.scale;
  for (const side of [-1, 1]) {
    const ex = side * 0.105 * s;
    const ey = f.y + 0.035 * s;
    const ez = sphereZ(f.r, ex, ey - f.y * 0.4) - 0.012;
    // Sclera, dark iris, and a bright glint up and to the outside.
    ellipsoid(b, ex, ey, ez, 0.125 * s, 0.155 * s, 0.075 * s, WHITE, SURF.eye, 0, side * 0.25, 0, [12, 9]);
    ellipsoid(
      b,
      ex - side * 0.006 * s,
      ey - 0.012 * s,
      ez + 0.028 * s,
      0.078 * s,
      0.094 * s,
      0.05 * s,
      INK,
      SURF.eye,
      0,
      side * 0.25,
      0,
      [10, 7],
    );
    ellipsoid(
      b,
      ex + 0.02 * s,
      ey + 0.022 * s,
      ez + 0.052 * s,
      0.028 * s,
      0.03 * s,
      0.014 * s,
      WHITE,
      glow(1.6),
      0,
      0,
      0,
      [6, 4],
    );
    ellipsoid(
      b,
      ex - 0.016 * s,
      ey - 0.03 * s,
      ez + 0.05 * s,
      0.012 * s,
      0.012 * s,
      0.008 * s,
      WHITE,
      glow(1.2),
      0,
      0,
      0,
      [5, 3],
    );
    // Brows: tiny soft arcs.
    b.surface = SURF.plastic;
    const brow = new THREE.TorusGeometry(0.05 * s, 0.009 * s, 4, 8, Math.PI * 0.7);
    const by = ey + 0.105 * s;
    b.addGeometry(
      brow,
      new THREE.Matrix4().compose(
        new THREE.Vector3(ex, by, sphereZ(f.r, ex, by - f.y * 0.4) - 0.004),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * 0.25, Math.PI * 0.15 + side * 0.08)),
        new THREE.Vector3(1, 1, 1),
      ),
      shade(INK, 1.4),
    );
    // Cheeks
    const cx = side * 0.19 * s;
    const cy = f.y - 0.06 * s;
    ellipsoid(
      b,
      cx,
      cy,
      sphereZ(f.r, cx, cy - f.y * 0.4) - 0.014,
      0.08 * s,
      0.048 * s,
      0.03 * s,
      CHEEK,
      SURF.skin,
      0,
      side * 0.5,
      0,
      [10, 6],
    );
  }
  // Smile: a half torus with a little tongue-pink inside.
  b.surface = SURF.plastic;
  const smile = new THREE.TorusGeometry(0.056 * s, 0.014 * s, 6, 12, Math.PI);
  const my = f.y - 0.066 * s;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(0, my, sphereZ(f.r, 0, my - f.y * 0.4) - 0.004),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI)),
    new THREE.Vector3(1, 1, 1),
  );
  b.addGeometry(smile, m, 0x3a1612);
}

function leaf(
  b: GeoBuilder,
  x: number,
  y: number,
  z: number,
  len: number,
  rx: number,
  rz: number,
  c = 0x2e9e4f,
): void {
  // A curled, pointed leaf with a centre fold.
  const g = new THREE.SphereGeometry(0.5, 8, 6);
  displace(g, (p) => {
    const t = p.z + 0.5;
    p.x *= 0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.8;
    p.y = p.y * 0.25 + Math.abs(p.x) * 0.35 - t * t * 0.25;
  });
  b.surface = SURF.foliage;
  b.addGeometry(
    g,
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)),
      new THREE.Vector3(len * 0.9, len * 0.5, len * 2),
    ),
    c,
  );
}

function stem(b: GeoBuilder, x: number, y: number, z: number, h: number, c = 0x6b4423): void {
  b.surface = SURF.wood;
  b.addGeometry(
    new THREE.CylinderGeometry(0.014, 0.022, h, 10),
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y + h / 2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.18)),
      new THREE.Vector3(1, 1, 1),
    ),
    c,
  );
}

function lathe(points: [number, number][], segs = 32): THREE.BufferGeometry {
  return smooth(
    new THREE.LatheGeometry(
      points.map(([r, y]) => new THREE.Vector2(r, y)),
      segs,
    ),
  );
}

/** Smooth closed sphere (merged seam) with optional organic displacement along the normal. */
function blob(r: number, amp = 0, freq = 30, w = 30, h = 22): THREE.BufferGeometry {
  const g = smooth(new THREE.SphereGeometry(r, w, h));
  if (amp > 0) displace(g, (p, n) => p.addScaledVector(n, noise3(p.x * freq, p.y * freq, p.z * freq) * amp));
  return g;
}

const I = new THREE.Matrix4();
const SEED = new THREE.IcosahedronGeometry(0.5, 0);

function buildHead(fruit: Fruit, b: GeoBuilder): void {
  b.surface = SURF.skin;
  switch (fruit) {
    case 'jeruk': {
      // Orange peel: fine pores and a soft gradient.
      const g = blob(0.31, 0.0035, 60);
      paint(g, (x, y, z) =>
        mix(0xf58a12, 0xffb447, Math.max(0, y) * 1.3).lerp(
          new THREE.Color(0xe7790c),
          Math.max(0, noise3(x * 40, y * 40, z * 40)) * 0.35,
        ),
      );
      b.addGeometry(g, I, WHITE);
      stem(b, 0, 0.29, 0, 0.07);
      leaf(b, 0.08, 0.34, 0, 0.12, 0, -0.5);
      addFace(b, { y: -0.02, r: 0.31, scale: 1 });
      return;
    }
    case 'semangka': {
      const g = blob(0.32, 0, 1, 36, 26);
      paint(g, (x, y, z) => {
        const lon = Math.atan2(z, x);
        const wave = Math.sin(y * 18) * 0.12 + Math.sin(y * 7 + lon * 3) * 0.05;
        const band = Math.sin(((lon + wave) / (Math.PI * 2)) * 14 * Math.PI * 2);
        return mix(0x1e7a3e, 0x4cb862, THREE.MathUtils.smoothstep(band, -0.25, 0.25));
      });
      b.addGeometry(g, new THREE.Matrix4().makeScale(1, 0.94, 1), WHITE);
      // A red-slice cap with seeds: the bit everyone knows from the avatar.
      const cap = smooth(new THREE.SphereGeometry(0.326, 40, 8, 0, Math.PI * 2, 0, 0.62));
      paint(cap, (_x, y) =>
        y > 0.283
          ? new THREE.Color(0xf2453d)
          : y > 0.27
            ? new THREE.Color(0xfff2cc)
            : new THREE.Color(0x2c8f48),
      );
      b.addGeometry(cap, new THREE.Matrix4().makeTranslation(0, 0.005, 0), WHITE);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ellipsoid(
          b,
          Math.cos(a) * 0.1,
          0.316,
          Math.sin(a) * 0.1,
          0.022,
          0.012,
          0.036,
          INK,
          SURF.eye,
          0,
          a,
          0,
          [8, 6],
        );
      }
      addFace(b, { y: -0.04, r: 0.31, scale: 1 });
      return;
    }
    case 'alpukat': {
      const prof: [number, number][] = [
        [0.0001, -0.3],
        [0.12, -0.29],
        [0.21, -0.25],
        [0.27, -0.17],
        [0.3, -0.06],
        [0.29, 0.04],
        [0.25, 0.15],
        [0.19, 0.26],
        [0.13, 0.34],
        [0.06, 0.385],
        [0.0001, 0.395],
      ];
      const skin = displace(lathe(prof, 28), (p, n) =>
        p.addScaledVector(n, noise3(p.x * 45, p.y * 45, p.z * 45) * 0.006),
      );
      paint(skin, (_x, y) => mix(0x2f6a1f, 0x4a8a2c, (y + 0.3) * 1.2));
      b.addGeometry(skin, I, WHITE);
      // Cut face: flesh plate with the pit.
      const flesh = lathe(
        prof.map(([r, y]) => [r * 0.86, y * 0.92] as [number, number]),
        32,
      );
      paint(flesh, (x, y) => mix(0xe7f0a0, 0xb9d45e, Math.min(1, Math.hypot(x, y) * 3.2)));
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, 0.13),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 0.62),
      );
      b.addGeometry(flesh, m, WHITE);
      b.surface = SURF.gloss;
      b.addGeometry(
        blob(0.075),
        new THREE.Matrix4().compose(
          new THREE.Vector3(0, -0.13, 0.27),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 0.55),
        ),
        0x8f5a2c,
      );
      stem(b, 0, 0.37, 0, 0.05, 0x5a3a1c);
      addFace(b, { y: 0.06, r: 0.3, scale: 0.85 });
      return;
    }
    case 'mangga': {
      const g = blob(0.3);
      paint(g, (x, y) =>
        mix(0xffb21e, 0xff5f1a, Math.min(1, Math.max(0, (x + y) * 1.4 + 0.15))).lerp(
          new THREE.Color(0x9ccf3a),
          Math.max(0, -y - x * 0.5 - 0.12) * 1.6,
        ),
      );
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.32)),
        new THREE.Vector3(1.0, 1.18, 0.95),
      );
      b.addGeometry(g, m, WHITE);
      stem(b, 0.1, 0.3, 0, 0.06);
      leaf(b, 0.2, 0.38, 0.02, 0.14, 0.2, -0.9);
      addFace(b, { y: -0.03, r: 0.28, scale: 0.95 });
      return;
    }
    case 'nanas': {
      // Pineapple: raised diamond "eyes" in a criss-cross pattern.
      const pat = (x: number, y: number, z: number) => {
        const lon = Math.atan2(z, x) / (Math.PI * 2);
        const a = Math.sin((lon * 12 + y * 5) * Math.PI * 2);
        const c = Math.sin((lon * 12 - y * 5) * Math.PI * 2);
        return Math.abs(a) * Math.abs(c);
      };
      const g = displace(blob(0.29, 0, 1, 40, 30), (p, n) =>
        p.addScaledVector(n, pat(p.x, p.y / 1.15, p.z) * 0.016),
      );
      paint(g, (x, y, z) => mix(0xb57a00, 0xf7bf1a, pat(x, y, z) ** 0.6));
      b.addGeometry(g, new THREE.Matrix4().makeScale(1, 1.15, 1), WHITE);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const tilt = i % 2 ? 0.45 : 0.25;
        const len = i % 2 ? 0.2 : 0.27;
        b.surface = SURF.foliage;
        b.addGeometry(
          new THREE.ConeGeometry(0.5, 1, 10),
          new THREE.Matrix4().compose(
            new THREE.Vector3(Math.cos(a) * 0.05, 0.38 + len * 0.35, Math.sin(a) * 0.05),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * tilt, -a, -Math.cos(a) * tilt)),
            new THREE.Vector3(0.07, len, 0.025),
          ),
          i % 3 ? 0x2e9e4f : 0x23803e,
        );
      }
      addFace(b, { y: -0.05, r: 0.29, scale: 0.95 });
      return;
    }
    case 'durian': {
      const g = blob(0.29, 0.004, 40);
      paint(g, (_x, y) => mix(0x9cbf3c, 0xc4dc62, (y + 0.3) * 1.4));
      b.addGeometry(g, I, WHITE);
      const ico = new THREE.IcosahedronGeometry(1, 1);
      const p = ico.getAttribute('position') as THREE.BufferAttribute;
      const seen = new Set<string>();
      const up = new THREE.Vector3(0, 1, 0);
      const cone = new THREE.ConeGeometry(0.5, 1, 10);
      paint(cone, (_x, y) => mix(0x6f9628, 0xa9c84a, y + 0.5));
      for (let i = 0; i < p.count; i++) {
        const n = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
        const key = `${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (n.z > 0.55 && Math.abs(n.y) < 0.55 && Math.abs(n.x) < 0.75) continue;
        const q = new THREE.Quaternion().setFromUnitVectors(up, n);
        const m = new THREE.Matrix4().compose(
          n.clone().multiplyScalar(0.3),
          q,
          new THREE.Vector3(0.09, 0.13, 0.09),
        );
        b.addGeometry(cone, m, WHITE);
      }
      stem(b, 0, 0.3, 0, 0.1);
      addFace(b, { y: -0.02, r: 0.29, scale: 0.95 });
      return;
    }
    case 'stroberi': {
      const prof: [number, number][] = [
        [0.0001, -0.33],
        [0.06, -0.315],
        [0.12, -0.275],
        [0.2, -0.17],
        [0.26, -0.06],
        [0.3, 0.05],
        [0.305, 0.12],
        [0.27, 0.2],
        [0.15, 0.25],
        [0.0001, 0.26],
      ];
      const g = lathe(prof, 30);
      paint(g, (_x, y) => mix(0xd8232a, 0xff4d3f, (y + 0.33) * 1.3));
      b.addGeometry(g, I, WHITE);
      for (let i = 0; i < 46; i++) {
        const y = -0.27 + hash01(i * 2.1) * 0.45;
        const a = hash01(i * 7.3) * Math.PI * 2;
        const nz = Math.sin(a);
        if (nz > 0.45 && y > -0.18 && y < 0.12) continue;
        let r = 0.0;
        for (let k = 1; k < prof.length; k++) {
          const [r0, y0] = prof[k - 1]!;
          const [r1, y1] = prof[k]!;
          if (y >= y0 && y <= y1) r = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
        }
        b.surface = SURF.eye;
        b.addGeometry(
          SEED,
          new THREE.Matrix4().compose(
            new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)),
            new THREE.Vector3(0.02, 0.03, 0.02),
          ),
          0xffd43b,
        );
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        leaf(b, Math.cos(a) * 0.12, 0.27, Math.sin(a) * 0.12, 0.13, 0, -a);
      }
      stem(b, 0, 0.27, 0, 0.08, 0x2e9e4f);
      addFace(b, { y: -0.02, r: 0.29, scale: 0.92 });
      return;
    }
    case 'rambutan': {
      const g = blob(0.27, 0.004, 35);
      paint(g, () => new THREE.Color(0xd7263d));
      b.addGeometry(g, I, WHITE);
      const up = new THREE.Vector3(0, 1, 0);
      // Soft curled hairs: tapered, bent cones.
      const hair = displace(new THREE.ConeGeometry(0.5, 1, 6, 2), (p) => {
        const t = p.y + 0.5;
        p.x += t * t * 0.35;
      });
      paint(hair, (_x, y) => (y > 0.15 ? new THREE.Color(0x3aa856) : new THREE.Color(0xff6b4a)));
      for (let i = 0; i < 70; i++) {
        const t = (i + 0.5) / 70;
        const incl = Math.acos(1 - 2 * t);
        const az = Math.PI * (1 + Math.sqrt(5)) * i;
        const n = new THREE.Vector3(
          Math.sin(incl) * Math.cos(az),
          Math.cos(incl),
          Math.sin(incl) * Math.sin(az),
        );
        if (n.z > 0.5 && Math.abs(n.y) < 0.6 && Math.abs(n.x) < 0.8) continue;
        const bend = new THREE.Vector3(n.x + 0.3 * Math.sin(i), n.y + 0.25, n.z).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(up, bend);
        const m = new THREE.Matrix4().compose(
          n.clone().multiplyScalar(0.28),
          q,
          new THREE.Vector3(0.05, 0.15, 0.05),
        );
        b.surface = SURF.skin;
        b.addGeometry(hair, m, WHITE);
      }
      addFace(b, { y: -0.02, r: 0.27, scale: 0.92 });
      return;
    }
  }
}

/**
 * Driver geometry in kart-local space: torso on the seat, head on top, hands on the handlebar.
 * `shirt` tints the torso.
 */
export function driverGeometry(fruit: Fruit, shirt: string): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const head = new GeoBuilder();
  buildHead(fruit, head);
  const hg = head.build();
  // Head sits at y 1.42 above the seat at z 0.18.
  b.addGeometry(hg, new THREE.Matrix4().makeTranslation(0, 1.43, 0.2), WHITE);
  const shirtC = new THREE.Color(shirt);
  // Neck
  b.surface = SURF.skin;
  b.addGeometry(
    new THREE.CylinderGeometry(0.06, 0.07, 0.12, 14),
    new THREE.Matrix4().makeTranslation(0, 1.13, 0.17),
    SKIN,
  );
  // Torso: a rounded bean of cotton.
  b.surface = SURF.fabric;
  const torso = lathe(
    [
      [0.0001, -0.2],
      [0.13, -0.19],
      [0.2, -0.13],
      [0.215, -0.02],
      [0.205, 0.09],
      [0.17, 0.17],
      [0.09, 0.21],
      [0.0001, 0.215],
    ],
    20,
  );
  b.addGeometry(
    torso,
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.92, 0.14),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 0.78),
    ),
    shirtC,
  );
  // Collar
  b.surface = SURF.satin;
  b.addGeometry(
    new THREE.TorusGeometry(0.075, 0.022, 8, 20),
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, 1.1, 0.16),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.25, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    ),
    shade(shirtC, 1.25),
  );
  // Arms reach forward to the handlebar grips (z ~0.62, y ~1.02, x +-0.3).
  for (const side of [-1, 1]) {
    const sx = side * 0.19;
    const hx = side * 0.29;
    const sy = 1.0;
    const hy = 1.03;
    const sz = 0.17;
    const hz = 0.58;
    const len = Math.hypot(hx - sx, hy - sy, hz - sz);
    const dir = new THREE.Vector3(hx - sx, hy - sy, hz - sz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.surface = SURF.fabric;
    b.addGeometry(
      new THREE.CapsuleGeometry(0.048, len - 0.06, 4, 8),
      new THREE.Matrix4().compose(
        new THREE.Vector3((sx + hx) / 2, (sy + hy) / 2, (sz + hz) / 2),
        q,
        new THREE.Vector3(1, 1, 1),
      ),
      shirtC,
    );
    b.surface = SURF.skin;
    b.addGeometry(blob(0.055, 0, 1, 10, 8), new THREE.Matrix4().makeTranslation(hx, hy, hz + 0.02), SKIN);
  }
  return b.build();
}

/** Steel helmet ("Helm Baja") that sits on any fruit head while the shield is up. */
export function helmetGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.surface = SURF.steel;
  const dome = smooth(new THREE.SphereGeometry(0.37, 24, 9, 0, Math.PI * 2, 0, Math.PI / 2));
  paint(dome, (_x, y) => mix(0x9aa1a8, 0xdfe3e7, Math.min(1, y * 3)));
  b.addGeometry(dome, new THREE.Matrix4().makeTranslation(0, 1.47, 0.2), WHITE);
  // Rolled brim and rivet band
  b.surface = SURF.metal;
  b.addGeometry(
    new THREE.TorusGeometry(0.385, 0.022, 6, 32),
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, 1.475, 0.2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    ),
    0x7d848b,
  );
  b.surface = SURF.chrome;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.addGeometry(
      new THREE.SphereGeometry(0.018, 6, 4),
      new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.37, 1.525, 0.2 + Math.sin(a) * 0.37),
      0xeef0f2,
    );
  }
  // Little golden spike on top
  b.surface = SURF.metal;
  b.addGeometry(
    new THREE.ConeGeometry(0.035, 0.11, 14),
    new THREE.Matrix4().makeTranslation(0, 1.885, 0.2),
    0xffc928,
  );
  b.addGeometry(
    new THREE.SphereGeometry(0.045, 14, 10),
    new THREE.Matrix4().makeTranslation(0, 1.84, 0.2),
    0xffc928,
  );
  return b.build();
}

/** Main skin colour of each fruit, for the far-away driver. */
const FRUIT_TONE: Record<Fruit, number> = {
  jeruk: 0xf78f1a,
  semangka: 0x2f9a4c,
  alpukat: 0x3e7d27,
  mangga: 0xffa31a,
  nanas: 0xe3a30c,
  durian: 0xa8c64a,
  stroberi: 0xe8332f,
  rambutan: 0xd7263d,
};

/** The driver seen from far away: a smooth fruit-coloured head on a simple torso (~300 tris). */
export function driverGeometryLow(fruit: Fruit, shirt: string): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.surface = SURF.skin;
  b.addGeometry(
    new THREE.SphereGeometry(0.31, 12, 8),
    new THREE.Matrix4().makeTranslation(0, 1.43, 0.2),
    FRUIT_TONE[fruit],
  );
  b.surface = SURF.fabric;
  b.addGeometry(
    new THREE.SphereGeometry(0.21, 8, 6),
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.92, 0.14),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 0.78),
    ),
    new THREE.Color(shirt),
  );
  return b.build();
}
