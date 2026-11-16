/**
 * Lari Terus runners: each avatar fruit as a round, sculpted mascot (the fruit is the body) with
 * a big glossy face, short rubbery arms and legs that melt into the body, mitten hands, and
 * sneakers, wristbands and a headband with tails in the player's colour (a separate primitive
 * tinted at runtime). One shared 16-bone skeleton and a set of animation clips.
 *
 * Model space: metres, feet on y = 0, facing +z, the character's left is +x.
 */
import * as THREE from 'three';
import { FRUITS, type Fruit } from '../../../packages/protocol/src/constants';
import { bakeAo } from '../src/ao';
import { hex, mixRGB, type RGB } from '../src/color';
import { decal, domeHeight, ellipseShape, surfaceStroke } from '../src/decal';
import { blade } from '../src/foliage';
import { dequantizeMatrix, type Glb } from '../src/gltf';
import { alongY, Mesh, type Paint, paint, type Vec3 } from '../src/mesh';
import { fbm3, hash1, noise3 } from '../src/noise';
import { organic } from '../src/organic';
import { type ClipDef, ease, mixPose as mix, type Pose, Rig, skinFromParts } from '../src/rig';
import {
  blend,
  capsule,
  displace,
  ellipsoid,
  gradient,
  intersect,
  plane,
  rotated,
  roundBox,
  type Sdf,
  smin,
  sphere,
  trace,
} from '../src/sdf';
import { ellipsoid as ellipsoidMesh, tube } from '../src/shapes';

/* ------------------------------------------------------------------ skeleton */

const C: Vec3 = [0, 0.86, 0];

export const RIG = new Rig([
  { name: 'root', parent: null, head: [0, 0, 0] },
  { name: 'hips', parent: 'root', head: [0, 0.44, 0] },
  { name: 'body', parent: 'hips', head: [0, 0.73, 0] },
  { name: 'top', parent: 'body', head: [0, 1.13, 0] },
  { name: 'thighL', parent: 'hips', head: [0.12, 0.46, 0] },
  { name: 'shinL', parent: 'thighL', head: [0.13, 0.26, 0] },
  { name: 'footL', parent: 'shinL', head: [0.13, 0.1, 0] },
  { name: 'thighR', parent: 'hips', head: [-0.12, 0.46, 0] },
  { name: 'shinR', parent: 'thighR', head: [-0.13, 0.26, 0] },
  { name: 'footR', parent: 'shinR', head: [-0.13, 0.1, 0] },
  { name: 'armL', parent: 'body', head: [0.26, 0.78, 0] },
  { name: 'foreL', parent: 'armL', head: [0.42, 0.665, 0] },
  { name: 'handL', parent: 'foreL', head: [0.54, 0.575, 0] },
  { name: 'armR', parent: 'body', head: [-0.26, 0.78, 0] },
  { name: 'foreR', parent: 'armR', head: [-0.42, 0.665, 0] },
  { name: 'handR', parent: 'foreR', head: [-0.54, 0.575, 0] },
]);
const bone = (n: string) => RIG.index(n);

/* ------------------------------------------------------------------ palette */

const INK = hex(0x1a1210);
const WHITE = hex(0xffffff);
const CHEEK = hex(0xff7f86);
const MOUTH = hex(0x5a1a16);
const TONGUE = hex(0xff6f7a);
const BROW = hex(0x3a1f14);
const STEM = hex(0x6b4423);
const LEAF = hex(0x2e9e4f);
const LEAF_DARK = hex(0x1f7a3a);
const SOLE = hex(0xf4f1ea);

const skin = (c: RGB, rough = 0.4) => paint(c, rough, 0, 0);
const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ fruit bodies */

interface FruitSpec {
  body: Sdf;
  paint: (x: number, y: number, z: number) => Paint;
  limb: RGB;
  faceY: number;
  faceScale: number;
  /** Headband height. */
  bandY: number;
  /** Extra parts: [mesh, bone]. */
  extras: (lod: number) => [Mesh, string][];
}

/** A point on the body surface in direction (dx, dy, dz) from the centre. */
function surfaceAt(f: Sdf, dx: number, dy: number, dz: number, from: Vec3 = C): { p: Vec3; n: Vec3 } | null {
  const l = Math.hypot(dx, dy, dz);
  const ox = from[0] + (dx / l) * 1.2;
  const oy = from[1] + (dy / l) * 1.2;
  const oz = from[2] + (dz / l) * 1.2;
  const t = trace(f, ox, oy, oz, -dx / l, -dy / l, -dz / l, 1.5);
  if (t === null) return null;
  const p: Vec3 = [ox - (dx / l) * t, oy - (dy / l) * t, oz - (dz / l) * t];
  return { p, n: gradient(f, p[0], p[1], p[2]) };
}

/** Even directions on a sphere (golden spiral). */
function fibonacci(n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const incl = Math.acos(1 - 2 * t);
    const az = Math.PI * (1 + Math.sqrt(5)) * i;
    out.push([Math.sin(incl) * Math.cos(az), Math.cos(incl), Math.sin(incl) * Math.sin(az)]);
  }
  return out;
}

const inFace = (n: Vec3) => n[2] > 0.5 && Math.abs(n[1] + 0.05) < 0.55 && Math.abs(n[0]) < 0.72;

function stem(top: Vec3, h: number, r = 0.018, col: RGB = STEM): Mesh {
  return tube(
    [top, [top[0] + 0.006, top[1] + h * 0.6, top[2]], [top[0] + 0.018, top[1] + h, top[2] + 0.004]],
    r,
    8,
    paint(col, 0.7),
    { caps: 'round', capSteps: 2 },
  );
}

function leaf(base: Vec3, dir: Vec3, len: number, width: number, droop = 0.6, steps = 6): Mesh {
  return blade({
    base,
    dir,
    side: [dir[2] || 0.0001, 0, -dir[0]],
    length: len,
    width,
    droop,
    fold: 0.3,
    thickness: 0.008,
    steps,
    paint: (s) => paint(mixRGB(LEAF_DARK, LEAF, 0.3 + s * 0.7), 0.45),
  });
}

function fruitSpec(fruit: Fruit): FruitSpec {
  switch (fruit) {
    case 'jeruk': {
      const body = ellipsoid(C[0], C[1], C[2], 0.39, 0.37, 0.385);
      return {
        body,
        paint: (x, y, z) => {
          const base = mixRGB(hex(0xf27f0c), hex(0xffb447), smooth01(0.6, 1.2, y));
          const pore = Math.max(0, noise3(x * 60, y * 60, z * 60, 3)) * 0.25;
          return skin(mixRGB(base, hex(0xd96a08), pore), 0.42 + pore * 0.3);
        },
        limb: hex(0xd8670c),
        faceY: 0.9,
        faceScale: 1,
        bandY: 1.07,
        extras: (lod) => {
          const top = surfaceAt(body, 0, 1, 0)!.p;
          return [
            [stem(top, 0.06), 'top'],
            [
              leaf(
                [top[0] + 0.012, top[1] + 0.045, top[2]],
                [0.85, 0.42, 0.15],
                0.17,
                0.09,
                0.5,
                lod ? 3 : 6,
              ),
              'top',
            ],
          ];
        },
      };
    }
    case 'semangka': {
      const cut = 1.16;
      const body = intersect(ellipsoid(C[0], C[1], C[2], 0.405, 0.39, 0.405), plane(0, 1, 0, cut), 0.035);
      return {
        body,
        paint: (x, y, z) => {
          const rr = Math.hypot(x, z);
          if (y > cut - 0.006) {
            if (rr < 0.2) return skin(mixRGB(hex(0xff5a4e), hex(0xe8343a), rr / 0.2), 0.5);
            if (rr < 0.222) return skin(mixRGB(hex(0xfff2cc), hex(0xcdea9e), (rr - 0.2) / 0.022), 0.5);
          }
          const lon = Math.atan2(z, x);
          const wave = Math.sin(y * 18) * 0.12 + Math.sin(y * 7 + lon * 3) * 0.05;
          const band = Math.sin((lon + wave) * 7);
          const c = mixRGB(hex(0x1c7038), hex(0x4cb862), smooth01(-0.3, 0.3, band));
          return skin(c, 0.36);
        },
        limb: hex(0x1e6b35),
        faceY: 0.86,
        faceScale: 1,
        bandY: 1.04,
        extras: (lod) => {
          const out: [Mesh, string][] = [];
          const n = lod ? 5 : 8;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + 0.3;
            const r = i % 2 ? 0.08 : 0.135;
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            const t = trace(body, x, 2, z, 0, -1, 0, 3);
            const y = 2 - (t ?? 0.84);
            const seed = ellipsoidMesh(0.014, 0.024, 0.006, paint(INK, 0.2), lod ? 6 : 10, lod ? 4 : 6);
            out.push([seed.transform(alongY([x, y, z], [0, 1, 0]).multiply(rotY(-a))), 'body']);
          }
          return out;
        },
      };
    }
    case 'alpukat': {
      const uncut = displace(
        blend(0.14, ellipsoid(0, 0.79, 0, 0.385, 0.35, 0.36), ellipsoid(0, 1.06, 0, 0.25, 0.25, 0.24)),
        (x, y, z) => (z < 0.2 ? fbm3(x * 22, y * 22, z * 22, 2, 5) * 0.004 : 0),
      );
      const body = intersect(uncut, plane(0, 0, 1, 0.27), 0.02);
      return {
        body,
        paint: (x, y, z) => {
          if (z > 0.255) {
            const depth = -uncut(x, y, z);
            if (depth < 0.012) return skin(hex(0x2f5a1f), 0.5);
            if (depth < 0.045)
              return skin(mixRGB(hex(0x9cc24a), hex(0xd2e47e), (depth - 0.012) / 0.033), 0.45);
            return skin(mixRGB(hex(0xd2e47e), hex(0xf0f3b0), smooth01(0.045, 0.16, depth)), 0.45);
          }
          const b = fbm3(x * 30, y * 30, z * 30, 2, 9);
          return skin(mixRGB(hex(0x2b5a1c), hex(0x46822a), 0.5 + b * 0.8), 0.55);
        },
        limb: hex(0x2f5e1e),
        faceY: 0.99,
        faceScale: 0.88,
        bandY: 1.12,
        extras: (lod) => [
          [
            ellipsoidMesh(
              0.105,
              0.118,
              0.06,
              paint(hex(0x8f5a2c), 0.25),
              lod ? 12 : 22,
              lod ? 7 : 12,
            ).transform(alongY([0, 0.745, 0.272], [0, 1, 0])),
            'body',
          ],
          [stem(surfaceAt(body, 0, 1, 0)!.p, 0.05, 0.016, hex(0x5a3a1c)), 'top'],
        ],
      };
    }
    case 'mangga': {
      const body = rotated(
        blend(0.12, ellipsoid(0, 0.86, 0, 0.35, 0.42, 0.34), sphere(0.07, 0.74, 0, 0.3)),
        C[0],
        C[1],
        C[2],
        -0.26,
      );
      return {
        body,
        paint: (x, y) => {
          const g = smooth01(-0.25, 0.35, x - (y - 0.86) * 0.8);
          let c = mixRGB(hex(0xffb21e), hex(0xff5f1a), g);
          c = mixRGB(c, hex(0x9ccf3a), smooth01(0.2, 0.5, y - 0.86 - x * 0.9) * 0.8);
          return skin(c, 0.38);
        },
        limb: hex(0xe0730f),
        faceY: 0.86,
        faceScale: 0.96,
        bandY: 1.08,
        extras: (lod) => {
          const top = surfaceAt(body, -0.18, 1, 0)!.p;
          return [
            [stem(top, 0.06), 'top'],
            [
              leaf([top[0] + 0.015, top[1] + 0.045, top[2]], [-0.8, 0.5, 0.2], 0.19, 0.095, 0.5, lod ? 3 : 6),
              'top',
            ],
          ];
        },
      };
    }
    case 'nanas': {
      const base = ellipsoid(C[0], C[1], C[2], 0.36, 0.43, 0.36);
      const pattern = (x: number, y: number, z: number) => {
        const lon = Math.atan2(z, x) / (Math.PI * 2);
        const a = Math.sin((lon * 12 + (y - C[1]) * 5.5) * Math.PI * 2);
        const c = Math.sin((lon * 12 - (y - C[1]) * 5.5) * Math.PI * 2);
        return Math.abs(a * c) ** 0.7;
      };
      const faceMask = (x: number, y: number, z: number) =>
        smooth01(0.12, 0.26, z) *
        (1 - smooth01(0.16, 0.26, Math.abs(x))) *
        (1 - smooth01(0.14, 0.24, Math.abs(y - 0.88)));
      const body = displace(base, (x, y, z) => pattern(x, y, z) * 0.014 * (1 - 0.75 * faceMask(x, y, z)));
      return {
        body,
        paint: (x, y, z) => {
          const p = pattern(x, y, z);
          const k = faceMask(x, y, z);
          let c = mixRGB(hex(0xb57a00), hex(0xf7bf1a), p ** 0.6 * (1 - k) + k);
          c = mixRGB(c, hex(0x9a8a20), smooth01(0.6, 0.45, y) * 0.5);
          return skin(c, 0.45);
        },
        limb: hex(0xc98a00),
        faceY: 0.88,
        faceScale: 0.94,
        bandY: 1.14,
        extras: (lod) => {
          const out: [Mesh, string][] = [];
          const top = surfaceAt(base, 0, 1, 0)!.p;
          const n = lod ? 7 : 12;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
            const inner = i % 3 === 0;
            const spread = inner ? 0.25 : 0.55 + (i % 2) * 0.25;
            const len = inner ? 0.3 : 0.24 + (i % 2) * 0.05;
            out.push([
              blade({
                base: [top[0] + Math.sin(a) * 0.03, top[1] - 0.03, top[2] + Math.cos(a) * 0.03],
                dir: [Math.sin(a) * spread, 1, Math.cos(a) * spread],
                side: [Math.cos(a), 0, -Math.sin(a)],
                length: len,
                width: 0.075,
                widthAt: (s) => (1 - s) ** 0.7,
                droop: inner ? 0.2 : 0.9,
                fold: 0.35,
                thickness: 0.008,
                steps: lod ? 3 : 6,
                paint: (s) => paint(mixRGB(hex(0x1f7a3a), hex(0x4cb862), s), 0.45),
              }),
              'top',
            ]);
          }
          return out;
        },
      };
    }
    case 'durian': {
      const R = 0.36;
      const bandY = 1.1;
      const dirs = fibonacci(96).filter(
        (n) => !inFace(n) && Math.abs(C[1] + n[1] * R - bandY) > 0.05 && n[1] > -0.75,
      );
      const spikes = dirs.map((n) =>
        capsule(
          C[0] + n[0] * (R - 0.05),
          C[1] + n[1] * (R - 0.05),
          C[2] + n[2] * (R - 0.05),
          C[0] + n[0] * (R + 0.085),
          C[1] + n[1] * (R + 0.085),
          C[2] + n[2] * (R + 0.085),
          0.05,
          0.006,
        ),
      );
      const ball = sphere(C[0], C[1], C[2], R);
      const body: Sdf = (x, y, z) => {
        let d = ball(x, y, z);
        const dx = x - C[0];
        const dy = y - C[1];
        const dz = z - C[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        for (let i = 0; i < dirs.length; i++) {
          const n = dirs[i]!;
          if ((dx * n[0] + dy * n[1] + dz * n[2]) / l < 0.82) continue;
          d = smin(d, spikes[i]!(x, y, z), 0.025);
        }
        return d;
      };
      return {
        body,
        paint: (x, y, z) => {
          const out = ball(x, y, z);
          let c = mixRGB(hex(0x7fa82e), hex(0xb5d152), smooth01(0.5, 1.2, y));
          c = mixRGB(c, hex(0xd6e57a), smooth01(0.015, 0.07, out));
          return skin(c, 0.55);
        },
        limb: hex(0x6f9628),
        faceY: 0.86,
        faceScale: 0.95,
        bandY,
        extras: () => [[stem(surfaceAt(ball, 0, 1, 0)!.p, 0.07, 0.02), 'top']],
      };
    }
    case 'stroberi': {
      const body = blend(0.16, ellipsoid(0, 0.95, 0, 0.37, 0.3, 0.36), ellipsoid(0, 0.67, 0, 0.2, 0.25, 0.2));
      return {
        body,
        paint: (_x, y) => skin(mixRGB(hex(0xc81d26), hex(0xff4d3f), smooth01(0.45, 1.15, y)), 0.36),
        limb: hex(0xb81a26),
        faceY: 0.9,
        faceScale: 0.92,
        bandY: 1.08,
        extras: (lod) => {
          const out: [Mesh, string][] = [];
          const seeds = fibonacci(lod ? 36 : 64);
          for (const n of seeds) {
            if (inFace(n) || n[1] > 0.72) continue;
            const s = surfaceAt(body, n[0], n[1], n[2], [0, 0.82, 0]);
            if (!s || Math.abs(s.p[1] - 1.08) < 0.035) continue;
            const at: Vec3 = [s.p[0] - s.n[0] * 0.002, s.p[1] - s.n[1] * 0.002, s.p[2] - s.n[2] * 0.002];
            out.push([
              ellipsoidMesh(
                0.011,
                0.007,
                0.017,
                paint(hex(0xffd43b), 0.3),
                lod ? 4 : 6,
                lod ? 3 : 4,
              ).transform(alongY(at, s.n)),
              'body',
            ]);
          }
          const top = surfaceAt(body, 0, 1, 0)!.p;
          const k = lod ? 5 : 7;
          for (let i = 0; i < k; i++) {
            const a = (i / k) * Math.PI * 2;
            out.push([
              leaf(
                [top[0] + Math.sin(a) * 0.04, top[1] - 0.012, top[2] + Math.cos(a) * 0.04],
                [Math.sin(a), -0.2, Math.cos(a)],
                0.15,
                0.085,
                0.9,
                lod ? 3 : 5,
              ),
              'top',
            ]);
          }
          out.push([stem(top, 0.07, 0.018, LEAF), 'top']);
          return out;
        },
      };
    }
    case 'rambutan': {
      const R = 0.355;
      const bandY = 1.08;
      const ball = displace(
        sphere(C[0], C[1], C[2], R),
        (x, y, z) => fbm3(x * 14, y * 14, z * 14, 2, 4) * 0.006,
      );
      return {
        body: ball,
        paint: (x, y, z) =>
          skin(mixRGB(hex(0xb81d33), hex(0xe03045), 0.5 + fbm3(x * 12, y * 12, z * 12, 2, 2)), 0.5),
        limb: hex(0xa3182c),
        faceY: 0.86,
        faceScale: 0.94,
        bandY,
        extras: (lod) => {
          const out: [Mesh, string][] = [];
          const dirs = fibonacci(lod ? 44 : 80);
          dirs.forEach((n, i) => {
            if (inFace(n) || n[1] < -0.8 || Math.abs(C[1] + n[1] * R - bandY) < 0.045) return;
            const p0: Vec3 = [C[0] + n[0] * (R - 0.01), C[1] + n[1] * (R - 0.01), C[2] + n[2] * (R - 0.01)];
            // Curl sideways around the normal.
            const a = hash1(i, 3) * Math.PI * 2;
            const side: Vec3 = [Math.cos(a) - n[0] * 0.3, Math.sin(a) * 0.4 + 0.3, -Math.cos(a) * 0.6];
            const pts: Vec3[] = [];
            const steps = lod ? 2 : 3;
            for (let k = 0; k <= steps; k++) {
              const t = k / steps;
              pts.push([
                p0[0] + n[0] * 0.1 * t + side[0] * 0.05 * t * t,
                p0[1] + n[1] * 0.1 * t + side[1] * 0.05 * t * t,
                p0[2] + n[2] * 0.1 * t + side[2] * 0.05 * t * t,
              ]);
            }
            const hair = tube(pts, (_k, t) => 0.013 * (1 - t * 0.7), 4, paint(hex(0xd7263d), 0.5), {
              caps: 'round',
              capSteps: 1,
            });
            hair.repaint((x, y, z) => {
              const d = Math.hypot(x - C[0], y - C[1], z - C[2]);
              return paint(mixRGB(hex(0xd7263d), hex(0x3aa856), smooth01(R + 0.04, R + 0.1, d)), 0.5);
            });
            out.push([hair, 'body']);
          });
          return out;
        },
      };
    }
  }
}

function rotY(a: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(a);
}

/* ------------------------------------------------------------------ limbs and kit */

interface LimbPart {
  bone: string;
  sdf: Sdf;
}

function limbParts(): LimbPart[] {
  const out: LimbPart[] = [];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    out.push(
      { bone: `thigh${L}`, sdf: capsule(s * 0.12, 0.5, 0, s * 0.13, 0.26, 0, 0.074, 0.065) },
      { bone: `shin${L}`, sdf: capsule(s * 0.13, 0.26, 0, s * 0.13, 0.1, 0, 0.065, 0.058) },
      { bone: `arm${L}`, sdf: capsule(s * 0.22, 0.8, 0, s * 0.42, 0.665, 0, 0.06, 0.054) },
      { bone: `fore${L}`, sdf: capsule(s * 0.42, 0.665, 0, s * 0.53, 0.585, 0, 0.054, 0.05) },
      {
        bone: `hand${L}`,
        sdf: blend(
          0.025,
          ellipsoid(s * 0.575, 0.55, 0, 0.074, 0.08, 0.064),
          ellipsoid(s * 0.56, 0.59, 0.05, 0.031, 0.035, 0.029),
        ),
      },
    );
  }
  return out;
}

/** Sneaker for one side: [tinted upper, white sole and laces, sock cuff]. */
function sneaker(s: number, lod: number): { upper: Mesh; sole: Mesh; cuff: Mesh } {
  const x = s * 0.13;
  const upperF = intersect(
    blend(
      0.04,
      ellipsoid(x, 0.072, 0.035, 0.08, 0.07, 0.132),
      ellipsoid(x, 0.112, -0.012, 0.07, 0.058, 0.078),
    ),
    plane(0, -1, 0, -0.026),
  );
  const upper = organic(upperF, {
    min: [x - 0.09, 0.02, -0.11],
    max: [x + 0.09, 0.18, 0.18],
    cell: 0.008,
    tris: lod ? 160 : 520,
    paint: () => paint(WHITE, 0.45),
  });
  const soleF = roundBox(x, 0.02, 0.035, 0.072, 0.02, 0.138, 0.018);
  const sole = organic(soleF, {
    min: [x - 0.09, -0.01, -0.12],
    max: [x + 0.09, 0.06, 0.19],
    cell: 0.008,
    tris: lod ? 120 : 360,
    paint: (_x, y) => paint(y < 0.012 ? hex(0x9a948a) : SOLE, 0.6),
  });
  if (!lod) {
    for (let k = 0; k < 3; k++) {
      const z = 0.055 + k * 0.032;
      const hitY = 2 - (trace(upperF, x, 2, z, 0, -1, 0, 3) ?? 1.87);
      sole.append(
        tube(
          [
            [x - 0.03, hitY - 0.004, z],
            [x, hitY + 0.006, z + 0.004],
            [x + 0.03, hitY - 0.004, z],
          ],
          0.007,
          6,
          paint(SOLE, 0.5),
          { caps: 'round', capSteps: 1 },
        ),
      );
    }
  }
  const cuffPath: Vec3[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    cuffPath.push([x + Math.sin(a) * 0.066, 0.155, Math.cos(a) * 0.066]);
  }
  const cuff = tube(cuffPath, 0.017, lod ? 5 : 8, paint(SOLE, 0.7), { closed: true });
  return { upper, sole, cuff };
}

/** A closed band around the forearm near the wrist (tinted). */
function wristband(s: number, lod: number): Mesh {
  const a: Vec3 = [s * 0.42, 0.665, 0];
  const b: Vec3 = [s * 0.53, 0.585, 0];
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(d[0]!, d[1]!, d[2]!);
  const t: Vec3 = [d[0]! / l, d[1]! / l, d[2]! / l];
  const c: Vec3 = [a[0] + t[0] * l * 0.82, a[1] + t[1] * l * 0.82, a[2] + t[2] * l * 0.82];
  const n: Vec3 = [-t[1], t[0], 0];
  const bb: Vec3 = [0, 0, 1];
  const path: Vec3[] = [];
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    path.push([
      c[0] + (n[0] * Math.cos(ang) + bb[0] * Math.sin(ang)) * 0.057,
      c[1] + (n[1] * Math.cos(ang) + bb[1] * Math.sin(ang)) * 0.057,
      c[2] + (n[2] * Math.cos(ang) + bb[2] * Math.sin(ang)) * 0.057,
    ]);
  }
  return tube(path, 0.02, lod ? 5 : 8, paint(WHITE, 0.6), { closed: true });
}

/** Headband hugging the body at `y`, knotted at the back with two tails (tinted). */
function headband(body: Sdf, y: number, lod: number): Mesh {
  const path: Vec3[] = [];
  const n = lod ? 20 : 40;
  let back: Vec3 = [0, y, -0.38];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const t = trace(body, dx * 1.2, y, dz * 1.2, -dx, 0, -dz, 1.5) ?? 0.8;
    const r = 1.2 - t + 0.012;
    path.push([dx * r, y, dz * r]);
    if (i === n / 2) back = [dx * (r + 0.01), y, dz * (r + 0.01)];
  }
  const p = paint(WHITE, 0.6);
  const m = tube(path, 0.024, lod ? 5 : 8, p, { closed: true });
  m.transform(alongY([0, y, 0], [0, 1, 0], 1, 0.75, 1).multiply(alongY([0, -y, 0], [0, 1, 0])));
  m.append(
    ellipsoidMesh(0.034, 0.03, 0.026, p, lod ? 8 : 12, lod ? 5 : 8).transform(alongY(back, [0, 1, 0])),
  );
  for (const s of [1, -1]) {
    const pts: Vec3[] = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pts.push([
        back[0] + s * (0.03 + t * 0.07),
        back[1] - t * 0.16 + Math.sin(t * Math.PI) * 0.03,
        back[2] - t * 0.08 - Math.sin(t * 3) * 0.01,
      ]);
    }
    m.append(tube(pts, (_k, t) => 0.02 - t * 0.008, lod ? 5 : 7, p, { caps: 'round', capSteps: 2 }));
  }
  return m;
}

/** Eyes, brows, cheeks and an open smile on the front of the body. */
function face(body: Sdf, y: number, s: number, lod: number): Mesh {
  const m = new Mesh();
  const segs = lod ? 12 : 24;
  const rings = lod ? 2 : 3;
  for (const side of [-1, 1]) {
    const ex = side * 0.112 * s;
    const ey = y + 0.035 * s;
    const sa = 0.062 * s;
    const sb = 0.077 * s;
    const sclera = domeHeight(sa, sb, 0.016 * s);
    m.append(
      decal(body, {
        cx: ex,
        cy: ey,
        shape: ellipseShape(sa, sb),
        height: sclera,
        paint: paint(WHITE, 0.15),
        rings,
        segs,
      }),
    );
    const px = ex - side * 0.008 * s;
    const py = ey - 0.01 * s;
    const pa = 0.041 * s;
    const pb = 0.053 * s;
    const pupilDome = domeHeight(pa, pb, 0.004 * s, 0.001);
    const pupilH = (u: number, v: number) => sclera(u + px - ex, v + py - ey) + pupilDome(u, v);
    m.append(
      decal(body, {
        cx: px,
        cy: py,
        shape: ellipseShape(pa, pb),
        height: pupilH,
        paint: paint(INK, 0.1),
        rings,
        segs,
      }),
    );
    const glints: [number, number, number][] = lod
      ? [[0.016, 0.022, 0.017]]
      : [
          [0.016, 0.022, 0.017],
          [-0.014, -0.02, 0.008],
        ];
    for (const [gx, gy, gr] of glints) {
      const hx = px + gx * s;
      const hy = py + gy * s;
      m.append(
        decal(body, {
          cx: hx,
          cy: hy,
          shape: ellipseShape(gr * s, gr * s),
          height: (u, v) => pupilH(u + hx - px, v + hy - py) + 0.0015,
          paint: paint(WHITE, 0.1, 0, 0.6),
          rings: 1,
          segs: lod ? 8 : 12,
        }),
      );
    }
    // Brow
    const brow: [number, number][] = [];
    for (let k = 0; k <= 6; k++) {
      const a = Math.PI * (0.3 + 0.4 * (k / 6));
      brow.push([ex + Math.cos(a) * 0.075 * s, ey + 0.035 * s + Math.sin(a) * 0.06 * s]);
    }
    m.append(surfaceStroke(body, brow, 0.0105 * s, 0.006, paint(BROW, 0.5)));
    // Cheek
    m.append(
      decal(body, {
        cx: side * 0.178 * s,
        cy: y - 0.04 * s,
        shape: ellipseShape(0.046 * s, 0.027 * s),
        height: () => 0.0018,
        paint: paint(CHEEK, 0.6),
        rings: 2,
        segs: lod ? 12 : 20,
        sink: 0.004,
      }),
    );
  }
  // Mouth: an open "D", teeth and tongue.
  const my = y - 0.072 * s;
  const ma = 0.054 * s;
  const mb = 0.044 * s;
  const flat = 0.006 * s;
  const ell = ellipseShape(ma, mb);
  const dShape = (th: number) => {
    const r = ell(th);
    const sn = Math.sin(th);
    return sn > 0.01 ? Math.min(r, flat / sn) : r;
  };
  m.append(
    decal(body, {
      cx: 0,
      cy: my,
      shape: dShape,
      height: () => 0.0035,
      paint: paint(MOUTH, 0.45),
      rings: 3,
      segs: lod ? 16 : 32,
    }),
  );
  m.append(
    decal(body, {
      cx: 0,
      cy: my - 0.022 * s,
      shape: ellipseShape(0.029 * s, 0.015 * s),
      height: () => 0.005,
      paint: paint(TONGUE, 0.4),
      rings: 2,
      segs: lod ? 10 : 18,
      sink: 0.003,
    }),
  );
  if (!lod)
    m.append(
      decal(body, {
        cx: 0,
        cy: my - 0.0015 * s,
        shape: ellipseShape(0.03 * s, 0.0065 * s),
        height: () => 0.005,
        paint: paint(WHITE, 0.3),
        rings: 1,
        segs: 16,
        sink: 0.003,
      }),
    );
  return m;
}

/* ------------------------------------------------------------------ assembly */

export interface RunnerMeshes {
  base: Mesh;
  tint: Mesh;
}

/** The fruits are authored around y = 0.86; the body sits this much lower on its short legs. */
const DROP = 0.07;

function lowered(s: FruitSpec): FruitSpec {
  const down = new THREE.Matrix4().makeTranslation(0, -DROP, 0);
  return {
    body: (x, y, z) => s.body(x, y + DROP, z),
    paint: (x, y, z) => s.paint(x, y + DROP, z),
    limb: s.limb,
    faceY: s.faceY - DROP,
    faceScale: s.faceScale,
    bandY: s.bandY - DROP,
    extras: (lod) => s.extras(lod).map(([m, b]) => [m.transform(down), b]),
  };
}

export function buildRunner(fruit: Fruit, lod: number): RunnerMeshes {
  const spec = lowered(fruitSpec(fruit));
  const limbs = limbParts();
  const sdf: Sdf = (x, y, z) => {
    let d = spec.body(x, y, z);
    for (const l of limbs) d = smin(d, l.sdf(x, y, z), 0.03);
    return d;
  };
  const limbPaint = paint(spec.limb, 0.5);
  const bodyMesh = organic(sdf, {
    min: [-0.7, 0.06, -0.48],
    max: [0.7, 1.28, 0.48],
    cell: lod ? 0.016 : 0.0105,
    tris: lod ? 1500 : 5200,
    paint: (x, y, z) => {
      const db = spec.body(x, y, z);
      let dl = Number.POSITIVE_INFINITY;
      for (const l of limbs) dl = Math.min(dl, l.sdf(x, y, z));
      return db <= dl + 0.004 ? spec.paint(x, y, z) : limbPaint;
    },
    detail: (x, y, z) => (z > 0.15 && Math.abs(y - spec.faceY) < 0.2 && Math.abs(x) < 0.3 ? 2 : 1),
  });
  skinFromParts(bodyMesh, [
    { bone: bone('body'), sdf: spec.body },
    ...limbs.map((l) => ({ bone: bone(l.bone), sdf: l.sdf })),
  ]);
  const base = new Mesh().append(bodyMesh);
  base.append(face(spec.body, spec.faceY, spec.faceScale, lod).bindRigid(bone('body')));
  for (const [m, b] of spec.extras(lod)) base.append(m.bindRigid(bone(b)));
  const tint = new Mesh();
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const k = sneaker(s, lod);
    tint.append(k.upper.bindRigid(bone(`foot${L}`)));
    base.append(k.sole.bindRigid(bone(`foot${L}`)));
    base.append(k.cuff.bindRigid(bone(`shin${L}`)));
    tint.append(wristband(s, lod).bindRigid(bone(`fore${L}`)));
  }
  tint.append(headband(spec.body, spec.bandY, lod).bindRigid(bone('body')));
  // Occlusion over the whole character in the bind pose (arms out, so it stays local).
  const all = [tint];
  bakeAo(base, { distance: 0.16, rays: lod ? 16 : 40, strength: 0.75, occluders: all });
  bakeAo(tint, { distance: 0.16, rays: lod ? 16 : 40, strength: 0.75, occluders: [base] });
  return { base, tint };
}

/* ------------------------------------------------------------------ animation */

const TAU = Math.PI * 2;

/** A stride: legs and arms swing, the fruit bobs and squashes on every footfall. */
const run: ClipDef = {
  name: 'run',
  duration: 0.5,
  pose: (t) => {
    const ph = (t / 0.5) * TAU;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const bounce = Math.abs(c);
    return {
      root: { t: [0, bounce * 0.07 - 0.02, 0] },
      hips: { r: [0, -s * 0.12, s * 0.04] },
      body: {
        r: [0.2, s * 0.14, 0],
        s: [1 + (1 - bounce) * 0.03, 1 - (1 - bounce) * 0.05, 1 + (1 - bounce) * 0.03],
      },
      top: { r: [-0.12 + Math.sin(ph * 2 - 0.8) * 0.08, 0, 0] },
      thighL: { r: [-s * 0.95, 0, 0] },
      thighR: { r: [s * 0.95, 0, 0] },
      shinL: { r: [0.2 + 1.35 * Math.max(0, c) ** 1.4, 0, 0] },
      shinR: { r: [0.2 + 1.35 * Math.max(0, -c) ** 1.4, 0, 0] },
      footL: { r: [-0.35 * Math.max(0, -s), 0, 0] },
      footR: { r: [-0.35 * Math.max(0, s), 0, 0] },
      armL: { r: [s * 0.9, 0, -0.35] },
      armR: { r: [-s * 0.9, 0, 0.35] },
      foreL: { r: [-1.25 - Math.max(0, -s) * 0.3, 0, 0] },
      foreR: { r: [-1.25 - Math.max(0, s) * 0.3, 0, 0] },
    };
  },
};

const idle: ClipDef = {
  name: 'idle',
  duration: 2.4,
  pose: (t) => {
    const br = Math.sin((t / 2.4) * TAU);
    const look = Math.sin((t / 2.4) * TAU * 2) * 0.5 + Math.sin((t / 2.4) * TAU) * 0.5;
    return {
      body: { r: [0.03, look * 0.22, 0], s: [1 - br * 0.012, 1 + br * 0.025, 1 - br * 0.012] },
      top: { r: [0, 0, Math.sin((t / 2.4) * TAU * 3) * 0.06] },
      armL: { r: [0.05, 0, -0.75 + br * 0.04] },
      armR: { r: [0.05, 0, 0.75 - br * 0.04] },
      foreL: { r: [-0.35, 0, 0] },
      foreR: { r: [-0.35, 0, 0] },
    };
  },
};

const ready: ClipDef = {
  name: 'ready',
  duration: 1,
  pose: (t) => {
    const bob = Math.sin((t / 1) * TAU) * 0.012;
    return {
      root: { t: [0, -0.1 + bob, 0] },
      body: { r: [0.42, 0, 0] },
      top: { r: [-0.2, 0, 0] },
      thighL: { r: [-0.9, 0, 0] },
      shinL: { r: [1.35, 0, 0] },
      thighR: { r: [0.4, 0, 0] },
      shinR: { r: [0.95, 0, 0] },
      footR: { r: [-0.4, 0, 0] },
      armL: { r: [0.6, 0, -0.4] },
      armR: { r: [-0.8, 0, 0.4] },
      foreL: { r: [-1.1, 0, 0] },
      foreR: { r: [-1.1, 0, 0] },
    };
  },
};

/** Driven by height: 0 take-off, 0.3 apex, 0.6 touch-down. */
const jump: ClipDef = {
  name: 'jump',
  duration: 0.6,
  pose: (t) => {
    const u = t / 0.6;
    const rise: Pose = {
      body: { r: [0.15, 0, 0], s: [0.95, 1.08, 0.95] },
      top: { r: [0.25, 0, 0] },
      thighL: { r: [-1.35, 0, 0] },
      shinL: { r: [1.7, 0, 0] },
      thighR: { r: [0.45, 0, 0] },
      shinR: { r: [1.0, 0, 0] },
      footR: { r: [0.5, 0, 0] },
      armL: { r: [-2.2, 0, 0.1] },
      armR: { r: [0.7, 0, 0.2] },
      foreL: { r: [-0.4, 0, 0] },
      foreR: { r: [-1.1, 0, 0] },
    };
    const apex: Pose = {
      body: { r: [0.05, 0, 0], s: [1.02, 0.98, 1.02] },
      top: { r: [-0.1, 0, 0] },
      thighL: { r: [-1.2, 0, 0.1] },
      shinL: { r: [1.9, 0, 0] },
      thighR: { r: [-1.0, 0, -0.1] },
      shinR: { r: [1.8, 0, 0] },
      armL: { r: [-0.6, 0, 0.9] },
      armR: { r: [-0.6, 0, -0.9] },
      foreL: { r: [-0.5, 0, 0] },
      foreR: { r: [-0.5, 0, 0] },
    };
    const fall: Pose = {
      body: { r: [-0.05, 0, 0], s: [0.97, 1.05, 0.97] },
      top: { r: [-0.3, 0, 0] },
      thighL: { r: [-0.55, 0, 0.05] },
      shinL: { r: [0.45, 0, 0] },
      thighR: { r: [-0.25, 0, -0.05] },
      shinR: { r: [0.35, 0, 0] },
      armL: { r: [-1.2, 0, 0.9] },
      armR: { r: [-1.2, 0, -0.9] },
      foreL: { r: [-0.3, 0, 0] },
      foreR: { r: [-0.3, 0, 0] },
    };
    return u < 0.5 ? mix(rise, apex, ease(u / 0.5)) : mix(apex, fall, ease((u - 0.5) / 0.5));
  },
};

/** Feet first, leaning back, low enough to pass under the high obstacles. */
const slide: ClipDef = {
  name: 'slide',
  duration: 0.4,
  pose: (t) => {
    const j = Math.sin((t / 0.4) * TAU * 2) * 0.03;
    return {
      root: { t: [0, -0.3, 0] },
      hips: { r: [-0.15, 0, 0] },
      body: { r: [-0.55 + j, 0, 0], s: [1.03, 0.95, 1.03] },
      top: { r: [0.45, 0, 0] },
      thighL: { r: [-1.45, 0, 0.08] },
      shinL: { r: [0.15, 0, 0] },
      thighR: { r: [-1.2, 0, -0.08] },
      shinR: { r: [0.55, 0, 0] },
      footL: { r: [0.5, 0, 0] },
      footR: { r: [0.4, 0, 0] },
      armL: { r: [0.5, 0, 0.55 + j] },
      armR: { r: [0.4, 0, -0.6 - j] },
      foreL: { r: [-0.3, 0, 0] },
      foreR: { r: [-0.3, 0, 0] },
    };
  },
};

/** Tripped by a low barrier: a full forward roll in a tuck, back on the feet. Driven 0..1. */
const trip: ClipDef = {
  name: 'trip',
  duration: 1,
  pose: (t) => {
    const roll = ease(Math.min(1, t / 0.75));
    const a = roll * TAU;
    const lift = Math.sin(roll * Math.PI) * 0.4;
    const h = 0.8;
    const tuck = Math.sin(Math.min(1, t / 0.8) * Math.PI);
    return {
      root: { r: [a, 0, 0], t: [0, h - h * Math.cos(a) + lift, -h * Math.sin(a)] },
      body: { r: [0.6 * tuck, 0, 0], s: [1 + tuck * 0.04, 1 - tuck * 0.06, 1 + tuck * 0.04] },
      top: { r: [0.4 * tuck, 0, 0] },
      thighL: { r: [-1.7 * tuck, 0, 0] },
      thighR: { r: [-1.5 * tuck, 0, 0] },
      shinL: { r: [2.0 * tuck, 0, 0] },
      shinR: { r: [1.9 * tuck, 0, 0] },
      armL: { r: [-1.1 * tuck, 0, -0.2] },
      armR: { r: [-1.2 * tuck, 0, 0.2] },
      foreL: { r: [-1.6 * tuck, 0, 0] },
      foreR: { r: [-1.6 * tuck, 0, 0] },
    };
  },
};

/** Bounced off something tall: knocked back with arms flung up, a wobble. Driven 0..1. */
const hit: ClipDef = {
  name: 'hit',
  duration: 1,
  pose: (t) => {
    const k = Math.min(1, t);
    const w = Math.sin(t * 22) * (1 - k);
    const back = Math.sin(Math.min(1, t * 2.5) * Math.PI * 0.5) * (1 - ease((t - 0.6) / 0.4));
    return {
      root: { r: [0, 0, w * 0.2], t: [0, 0.03, -0.05 * back] },
      body: { r: [-0.55 * back + w * 0.12, 0, w * 0.15], s: [1 + w * 0.05, 1 - w * 0.06, 1 + w * 0.05] },
      top: { r: [-0.4 * back, 0, w * 0.3] },
      armL: { r: [-2.3 * back + w * 0.4, 0, 0.8 * back] },
      armR: { r: [-2.1 * back - w * 0.4, 0, -0.8 * back] },
      foreL: { r: [-0.3, 0, 0] },
      foreR: { r: [-0.3, 0, 0] },
      thighL: { r: [-0.5 * back, 0, 0] },
      thighR: { r: [0.3 * back, 0, 0] },
      shinL: { r: [0.6 * back, 0, 0] },
      shinR: { r: [0.9 * back, 0, 0] },
    };
  },
};

/** Falling into a gap: arms and legs flailing. */
const fall: ClipDef = {
  name: 'fall',
  duration: 0.5,
  pose: (t) => {
    const w = Math.sin((t / 0.5) * TAU * 2);
    const v = Math.cos((t / 0.5) * TAU * 2);
    return {
      body: { r: [-0.3, 0, w * 0.08], s: [0.96, 1.07, 0.96] },
      top: { r: [-0.5, 0, v * 0.2] },
      armL: { r: [-2.6 + w * 0.5, 0, 0.5] },
      armR: { r: [-2.6 - w * 0.5, 0, -0.5] },
      foreL: { r: [-0.3 - v * 0.3, 0, 0] },
      foreR: { r: [-0.3 + v * 0.3, 0, 0] },
      thighL: { r: [-0.5 + w * 0.5, 0, 0.1] },
      thighR: { r: [-0.5 - w * 0.5, 0, -0.1] },
      shinL: { r: [0.6, 0, 0] },
      shinR: { r: [0.6, 0, 0] },
    };
  },
};

/** Climbing back up the far wall after a gap. */
const climb: ClipDef = {
  name: 'climb',
  duration: 0.5,
  pose: (t) => {
    const w = Math.sin((t / 0.5) * TAU);
    return {
      body: { r: [0.5, 0, 0] },
      top: { r: [-0.2, 0, 0] },
      armL: { r: [-2.7 + w * 0.3, 0, 0.1] },
      armR: { r: [-2.7 - w * 0.3, 0, -0.1] },
      foreL: { r: [-0.6 - w * 0.3, 0, 0] },
      foreR: { r: [-0.6 + w * 0.3, 0, 0] },
      thighL: { r: [-1.0 + w * 0.5, 0, 0] },
      thighR: { r: [-1.0 - w * 0.5, 0, 0] },
      shinL: { r: [1.4, 0, 0] },
      shinR: { r: [1.4, 0, 0] },
    };
  },
};

/** Winner: hopping with both arms up, squashing on each landing. */
const victory: ClipDef = {
  name: 'victory',
  duration: 0.8,
  pose: (t) => {
    const ph = (t / 0.8) * TAU;
    const hop = Math.abs(Math.sin(ph / 2 + 0.0001));
    const land = 1 - Math.min(1, hop * 4);
    const wave = Math.sin(ph);
    return {
      root: { t: [0, hop * 0.32, 0] },
      body: {
        r: [-0.08, Math.sin(ph / 2) * 0.15, 0],
        s: [1 + land * 0.08, 1 - land * 0.12, 1 + land * 0.08],
      },
      top: { r: [0, 0, wave * 0.15] },
      armL: { r: [-0.4 + wave * 0.15, 0, 1.6] },
      armR: { r: [-0.4 - wave * 0.15, 0, -1.6] },
      foreL: { r: [0, 0, 0.4 + wave * 0.3] },
      foreR: { r: [0, 0, -0.4 + wave * 0.3] },
      thighL: { r: [-0.4 * hop, 0, 0.1] },
      thighR: { r: [-0.4 * hop, 0, -0.1] },
      shinL: { r: [0.8 * hop, 0, 0] },
      shinR: { r: [0.8 * hop, 0, 0] },
    };
  },
};

export const CLIPS: readonly ClipDef[] = [idle, ready, run, jump, slide, trip, hit, fall, climb, victory];

/* ------------------------------------------------------------------ export */

export interface RunnerStats {
  name: string;
  tris: number;
}

/** Add the skeleton, every fruit at two levels of detail, and the clips. */
export function writeRunners(glb: Glb, log: (s: RunnerStats) => void): void {
  // Every runner fits this box; positions are stored as 16-bit within it.
  const box = { center: [0, 0.85, 0] as Vec3, extent: 0.95 };
  const rig = RIG.write(glb, dequantizeMatrix(box));
  const baseMat = glb.addMaterial({ name: 'runner', rough: 0.45 });
  const tintMat = glb.addMaterial({ name: 'runnerTint', rough: 0.55 });
  const meshNodes: number[] = [];
  for (const fruit of FRUITS) {
    for (const lod of [0, 1]) {
      const { base, tint } = buildRunner(fruit, lod);
      const ref = glb.addMesh(
        `runner_${fruit}_${lod}`,
        [
          { mesh: base, material: baseMat },
          { mesh: tint, material: tintMat },
        ],
        { box, hiPrecision: lod === 0 },
      );
      meshNodes.push(glb.addNode({ name: `runner_${fruit}_${lod}`, mesh: ref.mesh, skin: rig.skin }));
      log({ name: `runner_${fruit}_${lod}`, tris: base.triangleCount + tint.triangleCount });
    }
  }
  const moving = new Set(['root', 'hips', 'body', 'top']);
  for (const clip of CLIPS) glb.addAnimation(clip.name, RIG.sample(clip, rig.nodes, 30, moving));
  glb.setScene([rig.root, ...meshNodes]);
}
