/**
 * Procedural bajaj: a rounded three-wheeler with lofted, clear-coated body panels in the player's
 * colour, a soft canvas roof with piping over tube pillars, a curved windshield, chrome bumpers,
 * mirrors and headlight ring, glowing lamps, rubber tyres with a tread normal map and shiny hubs,
 * vinyl seats and number plates, with the fruit driver inside.
 * Kart-local space: +z forward, +y up, +x to the kart's left; wheels touch y = 0.
 *
 * Draw calls per kart: body, lamps/plates, glass, fork, front wheel, rear wheels, driver,
 * glow sprites (+ helmet while shielded).
 */
import type { Fruit } from '@hoorah/protocol';
import * as THREE from 'three';
import { driverGeometry, driverGeometryLow, helmetGeometry } from './fruit3d';
import { color, displace, GeoBuilder, glow, loft, mix, type Section, SURF, shade, tube } from './geo';
import { forLevel, type LitMaterial, lightMaterials, MAT, reflective, withSurface } from './look';
import { treadNormalTexture, type UvRect } from './textures';

/**
 * Materials shared by every bajaj. Field names are kept from the toon version: `toon` is the
 * clear-coated body/driver material, `unlit` the lamp and number-plate material.
 */
export interface KartMaterials {
  toon: THREE.Material;
  unlit: THREE.Material;
  glass: THREE.Material;
  wheel?: THREE.Material;
  glow?: THREE.ShaderMaterial;
}

/** Local anchor points the effects use. */
export const KART_ANCHORS = {
  exhaust: new THREE.Vector3(-0.36, 0.34, -1.5),
  rearLeft: new THREE.Vector3(0.68, 0.04, -0.95),
  rearRight: new THREE.Vector3(-0.68, 0.04, -0.95),
  front: new THREE.Vector3(0, 0.04, 1.02),
  head: new THREE.Vector3(0, 2.15, 0.2),
};

const WHEEL_R = 0.3;
const I = new THREE.Matrix4();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/* ------------------------------------------------------------------ materials */

/** Low graphics level: Lambert twins (see `forLevel`), the wheel without its tread normal map. */
function bodyMaterial(): LitMaterial {
  return forLevel(
    reflective(
      withSurface(
        new THREE.MeshPhysicalMaterial({
          vertexColors: true,
          roughness: 0.4,
          metalness: 0.1,
          clearcoat: 1,
          clearcoatRoughness: 0.045,
        }),
        'kart-body',
      ),
    ),
  );
}

function lampMaterial(plates: THREE.Texture | null): LitMaterial {
  return forLevel(
    reflective(
      withSurface(
        new THREE.MeshStandardMaterial({ vertexColors: true, map: plates, roughness: 0.35 }),
        'kart-lamp',
      ),
    ),
  );
}

function wheelMaterial(): LitMaterial {
  if (lightMaterials())
    return withSurface(new THREE.MeshLambertMaterial({ vertexColors: true }), 'kart-wheel');
  const n = treadNormalTexture();
  n.repeat.set(3, 1);
  return reflective(
    withSurface(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        normalMap: n,
        normalScale: new THREE.Vector2(1.2, 1.2),
      }),
      'kart-wheel',
    ),
  );
}

const isLit = (m: THREE.Material | undefined): m is LitMaterial =>
  m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial;

const GLOW_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute float aSize;
attribute vec4 aColor;
attribute float aKind;
attribute vec3 aDir;
uniform float uBoost;
uniform float uBrake;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float k = aKind < 0.5 ? 1.0 : (aKind < 1.5 ? 0.55 + uBrake * 0.9 : uBoost);
  vec3 n = normalize(normalMatrix * aDir);
  float facing = smoothstep(-0.1, 0.55, dot(normalize(-mv.xyz), n));
  mv.xyz += normalize(-mv.xyz) * 0.1;
  mv.xy += aCorner * aSize * (0.75 + 0.25 * k);
  gl_Position = projectionMatrix * mv;
  vUv = aCorner;
  vCol = vec4(aColor.rgb, aColor.a * k * facing);
}`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float d = length(vUv);
  float a = exp(-d * d * 3.2) * (1.0 - smoothstep(0.75, 1.0, d));
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}`;

function glowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { uBoost: { value: 0 }, uBrake: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** The material set for every bajaj; `plates` is the number-plate atlas texture. */
export function kartMaterials(plates: THREE.Texture): KartMaterials {
  return {
    toon: bodyMaterial(),
    unlit: lampMaterial(plates),
    glass: MAT.glass(0x163038, 0.24),
    wheel: wheelMaterial(),
    glow: glowMaterial(),
  };
}

let fallback: { body: THREE.Material; wheel: THREE.Material } | null = null;

/** Accept older material sets (toon/basic) by substituting the PBR versions. */
function resolve(m: KartMaterials): Required<KartMaterials> {
  if (!fallback) fallback = { body: bodyMaterial(), wheel: wheelMaterial() };
  const toon = isLit(m.toon) ? m.toon : fallback.body;
  let unlit = m.unlit;
  if (!isLit(unlit)) {
    unlit = lampMaterial(unlit instanceof THREE.MeshBasicMaterial ? unlit.map : null);
    m.unlit = unlit;
  }
  let glass = m.glass;
  if (!isLit(glass)) {
    glass = MAT.glass(0x163038, 0.24);
    m.glass = glass;
  }
  return {
    toon,
    unlit,
    glass,
    wheel: m.wheel ?? fallback.wheel,
    glow: m.glow ?? glowMaterial(),
  };
}

/* ------------------------------------------------------------------ body shells */

/** Rear body: engine housing behind the passenger bench, wheels tucked under its overhang. */
const REAR: Section[] = [
  { z: -1.455, y0: 0.52, y1: 0.95, hw: 0.36, hwb: 0.3, n: 3 },
  { z: -1.43, y0: 0.43, y1: 1.01, hw: 0.53, hwb: 0.44, n: 3.4 },
  { z: -1.37, y0: 0.38, y1: 1.05, hw: 0.615, hwb: 0.49, n: 4 },
  { z: -1.25, y0: 0.36, y1: 1.07, hw: 0.64, hwb: 0.5, n: 4.6 },
  { z: -0.8, y0: 0.36, y1: 1.07, hw: 0.64, hwb: 0.5, n: 4.6 },
  { z: -0.7, y0: 0.37, y1: 1.05, hw: 0.62, hwb: 0.5, n: 4.2 },
  { z: -0.665, y0: 0.4, y1: 1.01, hw: 0.56, hwb: 0.46, n: 3.6 },
  { z: -0.65, y0: 0.47, y1: 0.95, hw: 0.42, hwb: 0.36, n: 3 },
];

/** Floor pan joining the rear body to the front cowl. */
const FLOOR: Section[] = [
  { z: -0.72, y0: 0.37, y1: 0.6, hw: 0.6, hwb: 0.5, n: 6 },
  { z: 0.48, y0: 0.37, y1: 0.6, hw: 0.6, hwb: 0.5, n: 6 },
];

/** Front cowl: dash, the hood over the front wheel and the rounded nose with the headlight. */
const COWL: Section[] = [
  { z: 0.4, y0: 0.42, y1: 1.07, hw: 0.56, hwb: 0.5, n: 4 },
  { z: 0.45, y0: 0.38, y1: 1.13, hw: 0.61, hwb: 0.53, n: 4.4 },
  { z: 0.64, y0: 0.42, y1: 1.165, hw: 0.615, hwb: 0.54, n: 4.4 },
  { z: 0.8, y0: 0.6, y1: 1.175, hw: 0.6, hwb: 0.5, n: 4 },
  { z: 1.02, y0: 0.63, y1: 1.155, hw: 0.56, hwb: 0.45, n: 3.8 },
  { z: 1.2, y0: 0.64, y1: 1.1, hw: 0.5, hwb: 0.4, n: 3.6 },
  { z: 1.33, y0: 0.66, y1: 1.03, hw: 0.44, hwb: 0.35, n: 3.4 },
  { z: 1.43, y0: 0.68, y1: 0.97, hw: 0.38, hwb: 0.31, n: 3.2 },
  { z: 1.49, y0: 0.7, y1: 0.935, hw: 0.32, hwb: 0.26, n: 3 },
  { z: 1.525, y0: 0.73, y1: 0.9, hw: 0.24, hwb: 0.2, n: 2.8 },
  { z: 1.542, y0: 0.765, y1: 0.865, hw: 0.12, hwb: 0.1, n: 2.4 },
];

/** Rear quarter canopy (canvas) between the rear body and the roof. */
const CANOPY: Section[] = [
  { z: -1.452, y0: 1.04, y1: 1.79, hw: 0.5, hwb: 0.56, n: 4 },
  { z: -1.44, y0: 1.02, y1: 1.83, hw: 0.57, hwb: 0.625, n: 4.4 },
  { z: -1.41, y0: 1.0, y1: 1.85, hw: 0.6, hwb: 0.655, n: 4.8 },
  { z: -0.78, y0: 1.0, y1: 1.85, hw: 0.6, hwb: 0.655, n: 4.8 },
  { z: -0.755, y0: 1.02, y1: 1.83, hw: 0.57, hwb: 0.625, n: 4.4 },
  { z: -0.74, y0: 1.04, y1: 1.79, hw: 0.5, hwb: 0.56, n: 4 },
];

/** The canopy's back leans forward as it rises (tumblehome), like a stretched canvas hood. */
const CANOPY_LEAN = 0.09;

/** Interpolated section of a loft at depth z. */
function sectionAt(secs: readonly Section[], z: number): Section {
  if (z <= secs[0]!.z) return secs[0]!;
  for (let i = 1; i < secs.length; i++) {
    const a = secs[i - 1]!;
    const b = secs[i]!;
    if (z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      const l = (p: number, q: number) => p + (q - p) * t;
      return {
        z,
        y0: l(a.y0, b.y0),
        y1: l(a.y1, b.y1),
        hw: l(a.hw, b.hw),
        hwb: l(a.hwb ?? a.hw, b.hwb ?? b.hw),
        n: l(a.n ?? 4, b.n ?? 4),
      };
    }
  }
  return secs[secs.length - 1]!;
}

/** Outer x of a loft surface at (z, y), for placing trim and vents flush on the side. */
function sideX(secs: readonly Section[], z: number, y: number): number {
  const s = sectionAt(secs, z);
  const ny = Math.max(-1, Math.min(1, ((y - s.y0) / (s.y1 - s.y0)) * 2 - 1));
  const hwb = s.hwb ?? s.hw;
  const w = hwb + (s.hw - hwb) * ((ny + 1) / 2);
  const n = s.n ?? 4;
  // Superellipse |x/w|^n + |ny|^n = 1.
  return w * Math.max(0, 1 - Math.abs(ny) ** n) ** (1 / n);
}

/* ------------------------------------------------------------------ parts */

function roofGeometry(around = 24, step = 0.3): THREE.BufferGeometry {
  // Plan: rounded rectangle; section: flat slab with soft edges; then a crown and canvas sag
  // between the roof bows.
  const z0 = -1.47;
  const z1 = 0.99;
  const hw = 0.725;
  const r = 0.27;
  const secs: Section[] = [];
  const add = (z: number, w: number) => secs.push({ z, y0: 1.835, y1: 1.905, hw: w, n: 8 });
  for (const a of [90, 72, 52, 30, 10]) {
    const t = (a * Math.PI) / 180;
    add(z0 + r - r * Math.sin(t), hw - r + r * Math.cos(t));
  }
  for (let z = z0 + r + 0.25; z < z1 - r - 0.1; z += step) add(z, hw);
  for (const a of [10, 30, 52, 72, 90]) {
    const t = (a * Math.PI) / 180;
    add(z1 - r + r * Math.sin(t), hw - r + r * Math.cos(t));
  }
  const g = loft(secs, around);
  const bows = [-1.15, -0.55, 0.05, 0.62];
  return displace(g, (p) => {
    const cx = 1 - (p.x / hw) ** 2;
    const top = p.y > 1.87;
    let y = p.y + 0.045 * cx * (top ? 1 : 0.75);
    if (top) {
      // Sag between bows, a few soft wrinkles running to the edges.
      let near = 1;
      for (const b of bows) near = Math.min(near, Math.abs(p.z - b) / 0.3);
      y -= 0.014 * Math.min(1, near) ** 2 * cx;
      y += 0.0035 * Math.sin(p.z * 23 + p.x * 4) * (1 - cx);
    }
    p.y = y;
  });
}

function windshield(): { glass: THREE.BufferGeometry; frame: THREE.Vector3[] } {
  // Curved pane between the cowl and the roof, bulging forward at the centre.
  const nx = 14;
  const ny = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  const pt = (u: number, v: number) => {
    // u -1..1 across, v 0..1 up; round the corners.
    const hwB = 0.5;
    const hwT = 0.56;
    const hw = hwB + (hwT - hwB) * v;
    const y = 1.17 + v * 0.63;
    const zb = 0.958 - v * 0.085;
    const rc = 0.12;
    let x = u * hw;
    const edge = hw - rc;
    const vy = v * 0.63;
    const cyLo = rc;
    const cyHi = 0.63 - rc;
    if (Math.abs(x) > edge && (vy < cyLo || vy > cyHi)) {
      const cy = vy < cyLo ? cyLo : cyHi;
      const dx = Math.abs(x) - edge;
      const dy = vy - cy;
      const d = Math.hypot(dx, dy);
      if (d > rc) x = Math.sign(x) * (edge + (dx * rc) / d);
    }
    return V(x, y, zb + 0.04 * (1 - (x / hw) ** 2));
  };
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const p = pt((i / nx) * 2 - 1, j / ny);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 2;
      const d = a + nx + 1;
      idx.push(a, c, b, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Frame path around the pane (slightly inset).
  const frame: THREE.Vector3[] = [];
  for (let i = 0; i <= nx; i++) frame.push(pt((i / nx) * 2 - 1, 0));
  for (let j = 1; j <= ny; j++) frame.push(pt(1, j / ny));
  for (let i = nx - 1; i >= 0; i--) frame.push(pt((i / nx) * 2 - 1, 1));
  for (let j = ny - 1; j >= 1; j--) frame.push(pt(-1, j / ny));
  return { glass: g, frame };
}

/**
 * Tyre + chrome rim + painted hubcap for wheels centred at x positions `xs` (axis along x).
 * Rear wheels only detail their outer face (the inner one faces the body).
 */
function wheelGeometry(hub: THREE.Color, xs: readonly number[]): THREE.BufferGeometry {
  const b = new GeoBuilder(true);
  // Rims and hubs sample a flat corner of the tread normal map.
  const flat: UvRect = [0, 0, 0.04, 0.04];
  const lathe = (pts: readonly (readonly [number, number])[], segs: number) =>
    new THREE.LatheGeometry(
      pts.map(([r, a]) => new THREE.Vector2(r, a)),
      segs,
    );
  // Profiles are (radius, axial) and run so the lathe faces outward.
  const tyre = lathe(
    [
      [0.19, 0.074],
      [0.218, 0.088],
      [0.258, 0.092],
      [0.286, 0.082],
      [0.299, 0.055],
      [0.302, 0.02],
      [0.302, -0.02],
      [0.299, -0.055],
      [0.286, -0.082],
      [0.258, -0.092],
      [0.218, -0.088],
      [0.19, -0.074],
    ],
    28,
  );
  const rimA: [number, number][] = [
    [0.07, -0.058],
    [0.15, -0.04],
    [0.188, -0.05],
    [0.2, -0.06],
    [0.192, -0.076],
  ];
  const rimB = rimA.map(([r, a]) => [r, -a] as [number, number]).reverse();
  const rims = [lathe(rimA, 22), lathe(rimB, 22)];
  const caps = [
    new THREE.SphereGeometry(0.075, 16, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.SphereGeometry(0.075, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  ];
  const nut = new THREE.SphereGeometry(0.012, 6, 4);
  const vent = new THREE.SphereGeometry(0.03, 8, 4);
  // Lathe axis is y; turn it onto x.
  const toX = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
  for (const x of xs) {
    const m = new THREE.Matrix4().multiplyMatrices(at(x, 0, 0), toX);
    const local = (l: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(m, l);
    b.surface = SURF.rubber;
    b.addGeometry(tyre, m, 0x1f2023);
    [-1, 1].forEach((side, si) => {
      b.surface = SURF.chrome;
      b.addGeometry(rims[si]!, m, 0xdfe3e8, flat);
      // Lathe +y is world +x after toX: the outer face of a wheel at x > 0 is side +1.
      if (x !== 0 && Math.sign(x) !== side) return;
      b.surface = SURF.paint;
      b.addGeometry(
        caps[si]!,
        local(at(0, side * 0.05, 0).multiply(new THREE.Matrix4().makeScale(1, 0.4, 1))),
        hub,
        flat,
      );
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        b.surface = SURF.chrome;
        b.addGeometry(nut, local(at(Math.cos(a) * 0.105, side * 0.046, Math.sin(a) * 0.105)), 0xeef0f2, flat);
        // Dark vents between the spokes so the spin reads.
        const va = a + Math.PI / 5;
        b.surface = SURF.rubber;
        b.addGeometry(
          vent,
          local(
            at(Math.cos(va) * 0.14, side * 0.043, Math.sin(va) * 0.14)
              .multiply(new THREE.Matrix4().makeRotationY(-va))
              .multiply(new THREE.Matrix4().makeScale(0.7, 0.25, 1)),
          ),
          0x2a2b30,
          flat,
        );
      }
    });
  }
  return b.build();
}

/** Thin coloured bar with soft edges (handy for trims). */
function bar(
  b: GeoBuilder,
  a: THREE.Vector3,
  c: THREE.Vector3,
  r: number,
  col: THREE.ColorRepresentation,
): void {
  b.addGeometry(tube([a, c], r, { radial: 8, segments: 2 }), I, col);
}

/* ------------------------------------------------------------------ far detail level */

/**
 * The bajaj as seen from more than ~30 m: the same silhouette and colours with coarse lofts and
 * no small parts (about a tenth of the triangles). Swapped in per viewport by `KartModel.setDetail`.
 */
function lowBody(base: THREE.Color, canvasC: THREE.Color): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.boxBevel = 0;
  b.surface = SURF.paint;
  b.addGeometry(loft(REAR, 12), I, base);
  b.addGeometry(loft(FLOOR, 8), I, shade(base, 0.92));
  b.addGeometry(loft(COWL, 12), I, base);
  for (const sx of [-1, 1]) {
    const g = new THREE.TorusGeometry(WHEEL_R + 0.055, 0.045, 4, 10, Math.PI + 0.5);
    const m = new THREE.Matrix4()
      .multiply(at(sx * 0.665, WHEEL_R, -0.95))
      .multiply(new THREE.Matrix4().makeScale(2.5, 1, 1))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationZ(-0.25));
    b.addGeometry(g, m, base);
  }
  b.surface = SURF.vinyl;
  b.addGeometry(roofGeometry(10, 0.6), I, canvasC);
  b.surface = SURF.fabric;
  b.addGeometry(
    displace(loft(CANOPY, 10), (p) => {
      if (p.z < -1.1) p.z += Math.max(0, Math.min(1, (p.y - 1.07) / 0.74)) * CANOPY_LEAN;
    }),
    I,
    canvasC,
  );
  b.surface = SURF.metal;
  for (const sx of [-1, 1]) {
    b.addGeometry(
      tube([V(sx * 0.5, 1.12, 0.955), V(sx * 0.6, 1.84, 0.862)], 0.026, {
        radial: 4,
        caps: false,
        segments: 1,
      }),
      I,
      0x232428,
    );
    b.addGeometry(
      tube([V(sx * 0.632, 1.02, -0.74), V(sx * 0.655, 1.84, -0.76)], 0.03, {
        radial: 4,
        caps: false,
        segments: 1,
      }),
      I,
      0x232428,
    );
  }
  b.surface = SURF.glass;
  for (const sx of [-1, 1])
    b.box(sx * (sideX(CANOPY, -1.08, 1.47) + 0.016), 1.47, -1.08, 0.012, 0.4, 0.46, 0x1d2b33);
  b.box(0, 1.5, -1.43, 0.74, 0.38, 0.012, 0x1d2b33);
  b.surface = SURF.vinyl;
  b.box(0, 0.68, -0.47, 1.1, 0.16, 0.44, 0x7a2b22);
  b.box(0, 0.98, -0.7, 1.08, 0.34, 0.11, 0x7a2b22);
  b.box(0, 0.8, 0.08, 0.5, 0.3, 0.38, 0x2a2422);
  b.surface = SURF.chrome;
  for (const pts of [
    [V(0.42, 0.6, 1.24), V(0.36, 0.61, 1.47), V(0, 0.62, 1.565), V(-0.36, 0.61, 1.47), V(-0.42, 0.6, 1.24)],
    [
      V(0.58, 0.44, -1.22),
      V(0.52, 0.43, -1.47),
      V(0, 0.42, -1.535),
      V(-0.52, 0.43, -1.47),
      V(-0.58, 0.44, -1.22),
    ],
  ])
    b.addGeometry(tube(pts, 0.024, { radial: 4, caps: false, segments: 6 }), I, 0xe9ecef);
  b.addGeometry(new THREE.TorusGeometry(0.112, 0.022, 4, 10), at(0, 0.82, 1.53), 0xe9ecef);
  return b.build();
}

function lowWheels(hub: THREE.Color, xs: readonly number[]): THREE.BufferGeometry {
  const b = new GeoBuilder(true);
  const flat: UvRect = [0, 0, 0.04, 0.04];
  const tyre = new THREE.LatheGeometry(
    [
      [0.19, 0.075],
      [0.29, 0.085],
      [0.302, 0],
      [0.29, -0.085],
      [0.19, -0.075],
    ].map(([r, a]) => new THREE.Vector2(r, a)),
    12,
  );
  const toX = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
  for (const x of xs) {
    const m = new THREE.Matrix4().multiplyMatrices(at(x, 0, 0), toX);
    b.surface = SURF.rubber;
    b.addGeometry(tyre, m, 0x1f2023, flat);
    for (const side of [-1, 1]) {
      if (x !== 0 && Math.sign(x) !== side) continue;
      b.surface = SURF.chrome;
      b.addGeometry(
        new THREE.CircleGeometry(0.19, 10),
        new THREE.Matrix4()
          .multiplyMatrices(m, at(0, side * 0.06, 0))
          .multiply(new THREE.Matrix4().makeRotationX((-side * Math.PI) / 2)),
        0xdfe3e8,
        flat,
      );
      b.surface = SURF.paint;
      b.addGeometry(
        new THREE.CircleGeometry(0.075, 8),
        new THREE.Matrix4()
          .multiplyMatrices(m, at(0, side * 0.065, 0))
          .multiply(new THREE.Matrix4().makeRotationX((-side * Math.PI) / 2)),
        hub,
        flat,
      );
    }
  }
  return b.build();
}

function lowFork(base: THREE.Color): THREE.BufferGeometry {
  const f = new GeoBuilder();
  f.surface = SURF.chrome;
  for (const sx of [-1, 1])
    f.addGeometry(
      tube([V(sx * 0.105, 0.44, -0.02), V(sx * 0.105, 0.0, 0.0)], 0.022, {
        radial: 4,
        caps: false,
        segments: 1,
      }),
      I,
      0xe9ecef,
    );
  f.surface = SURF.paint;
  f.addGeometry(
    new THREE.TorusGeometry(WHEEL_R + 0.05, 0.045, 4, 10, Math.PI * 0.95),
    new THREE.Matrix4()
      .multiply(new THREE.Matrix4().makeScale(2.6, 1, 1))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationZ(0.07)),
    base,
  );
  return f.build();
}

/** Car-paint tone: a touch richer and deeper than the flat UI colour, so it survives ACES. */
function paintTone(c: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.08 + 0.04), hsl.l * 0.86);
}

export interface KartLook {
  color: string;
  fruit: Fruit;
  plate: UvRect;
  lightUv: UvRect;
}

export class KartModel {
  readonly root = new THREE.Group();
  /** Pitch/roll/hop live here so the root only carries position and heading. */
  readonly tilt = new THREE.Group();
  readonly steerPivot = new THREE.Group();
  readonly frontWheel: THREE.Mesh;
  readonly rearWheels: THREE.Mesh;
  readonly driver: THREE.Mesh;
  readonly helmet: THREE.Mesh;
  /** Headlight, tail and turbo glows (camera-facing sprites in one draw call). */
  readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.ShaderMaterial;
  private spin = 0;
  /** [near, far] geometry for each part that has a far version. */
  private readonly levels: [THREE.Mesh, THREE.BufferGeometry, THREE.BufferGeometry][] = [];
  private high = true;
  private seen = false;
  /** Every bajaj alive, for per-viewport detail switching (see `setDetailFor`). */
  private static readonly live = new Set<KartModel>();
  /** Karts closer than this to the camera use the full model. */
  static detailDistance = 30;

  constructor(look: KartLook, materials: KartMaterials) {
    const mats = resolve(materials);
    const base = paintTone(color(look.color));
    const dark = 0x232428;
    const chrome = 0xe9ecef;
    const canvasC = mix(base, 0x2f3034, 0.38);
    const vinyl = 0x2a2422;
    const bench = 0x7a2b22;
    const cream = 0xf3eadb;

    /* ---------------- body (clear-coated physical, per-vertex finishes) */
    const b = new GeoBuilder();
    b.surface = SURF.paint;
    b.addGeometry(loft(REAR, 30), I, base);
    b.addGeometry(loft(FLOOR, 20), I, shade(base, 0.92));
    b.addGeometry(loft(COWL, 30), I, base);

    // Chrome waist trims along the rear body and the cowl.
    b.surface = SURF.chrome;
    for (const sx of [-1, 1]) {
      const rear: THREE.Vector3[] = [];
      for (let z = -1.33; z <= -0.71; z += 0.08) rear.push(V(sx * (sideX(REAR, z, 0.9) + 0.008), 0.9, z));
      b.addGeometry(tube(rear, 0.013, { radial: 8 }), I, chrome);
      const front: THREE.Vector3[] = [];
      for (let z = 0.5; z <= 1.3; z += 0.08) front.push(V(sx * (sideX(COWL, z, 0.98) + 0.008), 0.98, z));
      b.addGeometry(tube(front, 0.012, { radial: 8 }), I, chrome);
    }
    // Engine louvres on the rear body sides (dark, slightly proud of the panel).
    b.surface = SURF.plastic;
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const y = 0.6 + k * 0.065;
        const x = sideX(REAR, -1.08, y) + 0.004;
        b.prim('box', sx * x, y, -1.08, 0.02, 0.034, 0.32, 0x1d1e21, 0, 0, sx * -0.18);
      }
    }
    // Rear fenders over the wheels, in body colour.
    b.surface = SURF.paint;
    for (const sx of [-1, 1]) {
      const g = new THREE.TorusGeometry(WHEEL_R + 0.055, 0.045, 8, 22, Math.PI + 0.5);
      const m = new THREE.Matrix4()
        .multiply(at(sx * 0.665, WHEEL_R, -0.95))
        .multiply(new THREE.Matrix4().makeScale(2.5, 1, 1))
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationZ(-0.25));
      b.addGeometry(g, m, base);
    }

    /* cabin frame, roof, canvas */
    b.surface = SURF.vinyl;
    b.addGeometry(roofGeometry(), I, canvasC);
    // Roof piping in glossy paint.
    b.surface = SURF.paint;
    {
      const pts: THREE.Vector3[] = [];
      const z0 = -1.475;
      const z1 = 0.995;
      const hw = 0.732;
      const r = 0.275;
      const corner = (cx: number, cz: number, a0: number) => {
        for (let k = 0; k <= 6; k++) {
          const a = a0 + (k / 6) * (Math.PI / 2);
          pts.push(V(cx + Math.cos(a) * r, 1.86, cz + Math.sin(a) * r));
        }
      };
      corner(hw - r, z1 - r, 0);
      corner(-hw + r, z1 - r, Math.PI / 2);
      corner(-hw + r, z0 + r, Math.PI);
      corner(hw - r, z0 + r, Math.PI * 1.5);
      b.addGeometry(tube(pts, 0.024, { closed: true, radial: 6, segments: 40 }), I, base);
    }
    // Pillars (satin dark metal)
    b.surface = SURF.metal;
    for (const sx of [-1, 1]) {
      b.addGeometry(
        tube([V(sx * 0.5, 1.12, 0.955), V(sx * 0.545, 1.5, 0.915), V(sx * 0.6, 1.84, 0.862)], 0.026, {
          radial: 8,
          caps: false,
        }),
        I,
        dark,
      );
      b.addGeometry(
        tube([V(sx * 0.632, 1.02, -0.74), V(sx * 0.655, 1.84, -0.76)], 0.03, { radial: 8, caps: false }),
        I,
        dark,
      );
    }
    // Rear quarter: a closed canvas canopy, slightly puffed between its frame, with glass
    // windows on the sides and back.
    b.surface = SURF.fabric;
    b.addGeometry(
      displace(loft(CANOPY, 28), (p, nrm) => {
        const t = Math.max(0, Math.min(1, (p.y - 1.07) / 0.74));
        const puff = Math.sin(Math.PI * t) * 0.01;
        if (Math.abs(nrm.x) > 0.75)
          p.x += Math.sign(p.x) * puff * Math.sin(Math.PI * Math.min(1, Math.max(0, (p.z + 1.43) / 0.67)));
        if (nrm.z < -0.75) p.z -= puff;
        if (p.z < -1.1) p.z += t * CANOPY_LEAN;
      }),
      I,
      canvasC,
    );
    for (const sx of [-1, 1]) {
      // Rolled-up side curtain along the open cabin, with leather straps.
      b.surface = SURF.fabric;
      b.addGeometry(
        tube([V(sx * 0.69, 1.8, -0.72), V(sx * 0.69, 1.8, 0.82)], 0.034, { radial: 8 }),
        I,
        canvasC,
      );
      b.surface = SURF.vinyl;
      for (const z of [-0.4, 0.45]) b.roundBox(sx * 0.69, 1.8, z, 0.082, 0.082, 0.03, 0x3a2f28, 0.012);
    }
    // Windows: dark reflective glass with rubber surrounds.
    const winRect = (
      cx: number,
      cy: number,
      w: number,
      h: number,
      r: number,
      place: (u: number, v: number) => THREE.Vector3,
    ) => {
      const pts: THREE.Vector3[] = [];
      const corner = (ux: number, uy: number, a0: number) => {
        for (let k = 0; k <= 4; k++) {
          const a = a0 + (k / 4) * (Math.PI / 2);
          pts.push(place(cx + ux + Math.cos(a) * r, cy + uy + Math.sin(a) * r));
        }
      };
      corner(w / 2 - r, h / 2 - r, 0);
      corner(-w / 2 + r, h / 2 - r, Math.PI / 2);
      corner(-w / 2 + r, -h / 2 + r, Math.PI);
      corner(w / 2 - r, -h / 2 + r, Math.PI * 1.5);
      return pts;
    };
    for (const sx of [-1, 1]) {
      const x = sx * (sideX(CANOPY, -1.08, 1.47) + 0.016);
      b.surface = SURF.glass;
      b.roundBoxIn(at(x, 1.47, -1.08), 0, 0, 0, 0.012, 0.4, 0.46, 0x1d2b33, 0.005);
      b.surface = SURF.rubber;
      b.addGeometry(
        tube(
          winRect(-1.08, 1.47, 0.5, 0.44, 0.07, (z, y) => V(x, y, z)),
          0.014,
          { closed: true, radial: 5, segments: 24 },
        ),
        I,
        0x18191b,
      );
    }
    {
      // Back window follows the leaning back panel.
      const lean = Math.atan2(CANOPY_LEAN, 0.74);
      const back = (x: number, y: number) => V(x, y, -1.47 + ((y - 1.07) / 0.74) * CANOPY_LEAN);
      b.surface = SURF.glass;
      b.roundBox(0, 1.5, back(0, 1.5).z + 0.004, 0.74, 0.38, 0.012, 0x1d2b33, 0.005, lean, 0, 0);
      b.surface = SURF.rubber;
      b.addGeometry(
        tube(
          winRect(0, 1.5, 0.76, 0.4, 0.08, (x, y) => back(x, y)),
          0.014,
          { closed: true, radial: 5, segments: 24 },
        ),
        I,
        0x18191b,
      );
    }
    // Windshield frame + wiper, parked flat along the bottom edge so it never crosses the driver's face.
    const ws = windshield();
    b.addGeometry(tube(ws.frame, 0.02, { closed: true, radial: 6, segments: 44, tension: 0.2 }), I, 0x18191b);
    b.addGeometry(tube([V(-0.34, 1.19, 0.976), V(0.06, 1.2, 0.974)], 0.008, { radial: 6 }), I, 0x111214);
    // Dashboard, speedometer
    b.surface = SURF.plastic;
    b.roundBox(0, 1.13, 0.66, 1.02, 0.09, 0.24, 0x2b2c30, 0.04, -0.12, 0, 0);
    b.surface = SURF.chrome;
    b.addGeometry(
      new THREE.TorusGeometry(0.055, 0.009, 6, 12),
      new THREE.Matrix4().compose(
        V(0.18, 1.19, 0.62),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, 0)),
        V(1, 1, 1),
      ),
      chrome,
    );
    // Handlebar with rubber grips, steering column.
    b.addGeometry(
      tube([V(-0.33, 1.035, 0.6), V(-0.2, 1.06, 0.655), V(0.2, 1.06, 0.655), V(0.33, 1.035, 0.6)], 0.016, {
        radial: 8,
      }),
      I,
      chrome,
    );
    b.surface = SURF.metal;
    b.addGeometry(tube([V(0, 1.06, 0.66), V(0, 0.84, 0.76)], 0.022, { radial: 8, caps: false }), I, 0x3b3c42);
    b.surface = SURF.rubber;
    for (const sx of [-1, 1]) {
      b.addGeometry(
        new THREE.CapsuleGeometry(0.026, 0.08, 2, 8),
        new THREE.Matrix4().compose(
          V(sx * 0.31, 1.04, 0.606),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sx * 0.45, Math.PI / 2)),
          V(1, 1, 1),
        ),
        0x161719,
      );
    }
    // Seats: driver saddle + backrest (vinyl), passenger bench in two puffy cushions.
    b.surface = SURF.vinyl;
    b.roundBox(0, 0.735, 0.14, 0.5, 0.12, 0.38, vinyl, 0.055);
    b.roundBox(0, 0.95, -0.07, 0.46, 0.32, 0.08, vinyl, 0.04, -0.12, 0, 0);
    b.roundBox(0, 0.68, -0.47, 1.1, 0.16, 0.44, bench, 0.075);
    for (const sx of [-1, 1]) b.roundBox(sx * 0.275, 0.98, -0.7, 0.53, 0.34, 0.11, bench, 0.05, 0.14, 0, 0);
    // Side sills: a rubber skirt and a chrome kick strip break up the long floor panel.
    for (const sx of [-1, 1]) {
      const skirt: THREE.Vector3[] = [];
      const kick: THREE.Vector3[] = [];
      for (let z = -0.62; z <= 0.5; z += 0.28) {
        skirt.push(V(sx * (sideX(FLOOR, z, 0.41) + 0.012), 0.41, z));
        kick.push(V(sx * (sideX(FLOOR, z, 0.52) + 0.006), 0.52, z));
      }
      b.surface = SURF.rubber;
      b.addGeometry(tube(skirt, 0.026, { radial: 6 }), I, 0x1a1b1d);
      b.surface = SURF.chrome;
      b.addGeometry(tube(kick, 0.009, { radial: 5 }), I, cream);
    }
    // Rubber floor mat
    b.surface = SURF.rubber;
    b.roundBox(0, 0.605, 0.32, 0.9, 0.012, 0.3, 0x1a1b1d, 0.005);

    /* front details */
    b.surface = SURF.chrome;
    // Headlight bezel ring and its painted housing.
    b.addGeometry(new THREE.TorusGeometry(0.112, 0.022, 8, 24), at(0, 0.82, 1.53), chrome);
    // Front bumper and its brackets
    b.addGeometry(
      tube(
        [
          V(0.42, 0.6, 1.24),
          V(0.36, 0.61, 1.47),
          V(0, 0.62, 1.565),
          V(-0.36, 0.61, 1.47),
          V(-0.42, 0.6, 1.24),
        ],
        0.024,
        {
          radial: 8,
        },
      ),
      I,
      chrome,
    );
    for (const sx of [-1, 1]) bar(b, V(sx * 0.22, 0.62, 1.53), V(sx * 0.2, 0.71, 1.49), 0.014, chrome);
    // Round mirrors on chrome stalks (dark housings, chrome faces).
    for (const sx of [-1, 1]) {
      b.surface = SURF.chrome;
      b.addGeometry(
        tube([V(sx * 0.5, 1.15, 0.955), V(sx * 0.62, 1.24, 1.0), V(sx * 0.72, 1.3, 0.99)], 0.01, {
          radial: 6,
        }),
        I,
        chrome,
      );
      b.surface = SURF.plastic;
      b.addGeometry(
        new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.Matrix4().compose(
          V(sx * 0.735, 1.315, 0.99),
          new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
            .premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sx * 0.3, 0))),
          V(0.12, 0.05, 0.12),
        ),
        0x1f2023,
      );
      b.surface = SURF.chrome;
      b.addGeometry(
        new THREE.CircleGeometry(0.5, 16),
        new THREE.Matrix4().compose(
          V(sx * 0.735, 1.315, 0.99),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI + sx * 0.3, 0)),
          V(0.105, 0.105, 1),
        ),
        0xd5dce2,
      );
    }
    // Rear: bumper, exhaust with flared tip, mud flaps
    b.surface = SURF.chrome;
    b.addGeometry(
      tube(
        [
          V(0.58, 0.44, -1.22),
          V(0.52, 0.43, -1.47),
          V(0, 0.42, -1.535),
          V(-0.52, 0.43, -1.47),
          V(-0.58, 0.44, -1.22),
        ],
        0.024,
        {
          radial: 10,
        },
      ),
      I,
      chrome,
    );
    b.surface = SURF.metal;
    b.addGeometry(
      tube([V(-0.2, 0.36, -0.9), V(-0.33, 0.34, -1.2), V(-0.36, 0.34, -1.42)], 0.035, { radial: 10 }),
      I,
      0x4a4b52,
    );
    b.surface = SURF.chrome;
    b.addGeometry(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.036, 0),
          new THREE.Vector2(0.05, 0.06),
          new THREE.Vector2(0.056, 0.1),
          new THREE.Vector2(0.046, 0.1),
        ],
        16,
      ),
      new THREE.Matrix4().compose(
        V(-0.36, 0.34, -1.4),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
        V(1, 1, 1),
      ),
      chrome,
    );
    b.surface = SURF.rubber;
    for (const sx of [-1, 1]) b.roundBox(sx * 0.665, 0.21, -1.27, 0.2, 0.26, 0.022, 0x161719, 0.01);
    // Tail-light bezels
    b.surface = SURF.chrome;
    for (const sx of [-1, 1])
      b.addGeometry(
        new THREE.TorusGeometry(0.068, 0.014, 6, 16),
        new THREE.Matrix4().compose(V(sx * 0.4, 0.77, -1.428), new THREE.Quaternion(), V(1, 1, 1)),
        chrome,
      );
    // Antenna with a red-white pennant
    b.surface = SURF.steel;
    b.addGeometry(tube([V(0.6, 1.88, -1.2), V(0.6, 2.5, -1.24)], 0.007, { radial: 6 }), I, 0xb8bec4);
    b.surface = SURF.fabric;
    {
      const p = new GeoBuilder();
      p.boxBevel = 0;
      p.box(0.6, 2.45, -1.36, 0.008, 0.07, 0.22, 0xf2453d);
      p.box(0.6, 2.38, -1.36, 0.008, 0.07, 0.22, 0xfafafa);
      b.addGeometry(p.build(), I, 0xffffff);
    }
    const bodyMesh = new THREE.Mesh(b.build(), mats.toon);
    bodyMesh.name = 'kart-body';

    /* ---------------- glass */
    const gl = new GeoBuilder();
    gl.addGeometry(ws.glass, I, 0xffffff);
    gl.prim('sphereMd', 0, 0.82, 1.538, 0.21, 0.21, 0.05, 0xffffff);
    const glassMesh = new THREE.Mesh(gl.build(), mats.glass);
    glassMesh.renderOrder = 3;

    /* ---------------- lamps and plates (textured, emissive by surface) */
    const u = new GeoBuilder(true);
    const lu = look.lightUv;
    u.surface = glow(2.2);
    u.addGeometry(
      new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.Matrix4().compose(
        V(0, 0.82, 1.515),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        V(0.2, 0.06, 0.2),
      ),
      0xfff1c8,
      lu,
    );
    for (const sx of [-1, 1]) {
      u.surface = glow(2.4);
      u.addGeometry(
        new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.Matrix4().compose(
          V(sx * 0.4, 0.77, -1.43),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
          V(0.13, 0.04, 0.13),
        ),
        0xff1c12,
        lu,
      );
      u.surface = glow(1.6);
      u.prim('sphereMd', sx * 0.33, 0.95, 1.43, 0.08, 0.055, 0.05, 0xffa316, 0, 0, 0, lu);
      u.prim('sphereMd', sx * 0.4, 0.9, -1.428, 0.06, 0.04, 0.03, 0xffa316, 0, 0, 0, lu);
    }
    u.surface = SURF.plastic;
    const plateQuad = (y: number, z: number, facing: 1 | -1) => {
      const hw = 0.19;
      const hh = 0.048;
      if (facing === 1)
        u.quad([-hw, y - hh, z], [hw, y - hh, z], [hw, y + hh, z], [-hw, y + hh, z], 0xffffff, look.plate);
      else u.quad([hw, y - hh, z], [-hw, y - hh, z], [-hw, y + hh, z], [hw, y + hh, z], 0xffffff, look.plate);
    };
    plateQuad(0.53, 1.58, 1);
    plateQuad(0.62, -1.452, -1);
    // Plate holders
    u.roundBox(0, 0.53, 1.572, 0.41, 0.115, 0.012, 0x18191b, 0.005);
    u.roundBox(0, 0.62, -1.444, 0.41, 0.115, 0.012, 0x18191b, 0.005);
    const lampMesh = new THREE.Mesh(u.build(), mats.unlit);
    lampMesh.name = 'kart-lamps';

    /* ---------------- glow sprites */
    this.glowMat = mats.glow.clone();
    this.glow = new THREE.Mesh(glowGeometry(), this.glowMat);
    this.glow.renderOrder = 6;
    this.glow.frustumCulled = false;

    /* ---------------- front wheel + fork + fender (steer) */
    const f = new GeoBuilder();
    f.surface = SURF.chrome;
    for (const sx of [-1, 1])
      f.addGeometry(
        tube([V(sx * 0.105, 0.44, -0.02), V(sx * 0.105, 0.0, 0.0)], 0.022, { radial: 8, caps: false }),
        I,
        chrome,
      );
    f.addGeometry(tube([V(-0.12, 0.42, -0.02), V(0.12, 0.42, -0.02)], 0.02, { radial: 8 }), I, chrome);
    f.surface = SURF.metal;
    for (const sx of [-1, 1])
      f.prim('cyl12', sx * 0.105, 0, 0, 0.05, 0.03, 0.05, 0x55585e, 0, 0, Math.PI / 2);
    f.surface = SURF.paint;
    {
      const g = new THREE.TorusGeometry(WHEEL_R + 0.05, 0.045, 8, 22, Math.PI * 0.95);
      const m = new THREE.Matrix4()
        .multiply(new THREE.Matrix4().makeScale(2.6, 1, 1))
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationZ(0.07));
      f.addGeometry(g, m, base);
    }
    const forkMesh = new THREE.Mesh(f.build(), mats.toon);
    forkMesh.name = 'kart-fork';
    this.frontWheel = new THREE.Mesh(wheelGeometry(base, [0]), mats.wheel);
    this.steerPivot.position.set(0, WHEEL_R, 1.02);
    this.steerPivot.add(forkMesh, this.frontWheel);

    /* ---------------- rear wheels */
    this.rearWheels = new THREE.Mesh(wheelGeometry(base, [0.665, -0.665]), mats.wheel);
    this.rearWheels.name = 'kart-wheels';
    this.rearWheels.position.set(0, WHEEL_R, -0.95);

    /* ---------------- driver */
    this.driver = new THREE.Mesh(driverGeometry(look.fruit, mix(base, 0xfff7f0, 0.55).getStyle()), mats.toon);
    this.driver.name = 'kart-driver';
    this.helmet = new THREE.Mesh(helmetGeometry(), mats.toon);
    this.helmet.visible = false;
    this.driver.add(this.helmet);

    this.tilt.add(bodyMesh, lampMesh, glassMesh, this.steerPivot, this.rearWheels, this.driver, this.glow);
    this.root.add(this.tilt);
    for (const m of [bodyMesh, forkMesh, this.frontWheel, this.rearWheels, this.driver, this.helmet]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.kartPart = 'cast';
    }
    for (const m of [lampMesh, glassMesh, this.glow]) {
      m.castShadow = false;
      m.receiveShadow = m === lampMesh;
      m.userData.kartPart = 'nocast';
    }
    this.levels.push(
      [bodyMesh, bodyMesh.geometry, lowBody(base, canvasC)],
      [forkMesh, forkMesh.geometry, lowFork(base)],
      [this.frontWheel, this.frontWheel.geometry, lowWheels(base, [0])],
      [this.rearWheels, this.rearWheels.geometry, lowWheels(base, [0.665, -0.665])],
      [
        this.driver,
        this.driver.geometry,
        driverGeometryLow(look.fruit, mix(base, 0xfff7f0, 0.55).getStyle()),
      ],
    );
    KartModel.live.add(this);
  }

  /** Full model (`true`) or the far version (`false`). */
  setDetail(high: boolean): void {
    if (high === this.high) return;
    this.high = high;
    for (const [mesh, near, far] of this.levels) mesh.geometry = high ? near : far;
  }

  /**
   * Pick the detail level of every bajaj for a camera at `eye` (call per viewport before drawing
   * it; pass `null` for shadow passes, which use the far version). `viewScale` is the viewport's
   * share of the screen height: small split-screen views switch closer. Karts removed from the
   * scene are forgotten.
   */
  static setDetailFor(eye: THREE.Vector3 | null, viewScale = 1): void {
    const d2 = (KartModel.detailDistance * viewScale) ** 2;
    for (const k of KartModel.live) {
      if (!k.root.parent) {
        if (k.seen) KartModel.live.delete(k);
        continue;
      }
      k.seen = true;
      k.setDetail(eye !== null && k.root.position.distanceToSquared(eye) < d2);
    }
  }

  /**
   * Visual state. `steer` -1..1, `slide` extra yaw while drifting (rad), `hop` metres,
   * `roll`/`pitch` radians, `spinYaw` for oil spins, `travel` metres since last frame.
   * Optional: `boost` 0..1 lights the exhaust glow, `brake` brightens the tail lights.
   */
  pose(o: {
    steer: number;
    slide: number;
    hop: number;
    roll: number;
    pitch: number;
    spinYaw: number;
    travel: number;
    wobble: number;
    shield: boolean;
    t: number;
    boost?: number;
    brake?: boolean;
  }): void {
    this.spin += o.travel / WHEEL_R;
    this.frontWheel.rotation.x = this.spin;
    this.rearWheels.rotation.x = this.spin;
    this.steerPivot.rotation.y = -o.steer * 0.42;
    this.tilt.position.y = o.hop;
    this.tilt.rotation.set(
      o.pitch,
      o.slide + o.spinYaw,
      o.roll + Math.sin(o.t * 0.03) * o.wobble * 0.12,
      'YXZ',
    );
    this.driver.rotation.z = -o.steer * 0.12 + o.roll * 0.6;
    this.driver.rotation.y = -o.steer * 0.2;
    this.driver.position.y = Math.abs(Math.sin(o.t * 0.012)) * 0.015;
    this.helmet.visible = o.shield;
    const u = this.glowMat.uniforms;
    const boost = o.boost ?? 0;
    u.uBoost!.value += (boost - u.uBoost!.value) * 0.3;
    u.uBrake!.value = o.brake ? 1 : 0;
  }
}

/** Camera-facing glow quads: headlight, tail lights, exhaust (kind 0 = always, 1 = tail, 2 = turbo). */
function glowGeometry(): THREE.BufferGeometry {
  const spots: [number, number, number, number, number, number, number, number, number, number, number][] = [
    // x, y, z, size, r, g, b, a, kind, dirZ, dirX
    [0, 0.82, 1.56, 0.3, 1.0, 0.86, 0.6, 0.32, 0, 1, 0],
    [0.4, 0.77, -1.45, 0.26, 1.0, 0.12, 0.06, 0.7, 1, -1, 0],
    [-0.4, 0.77, -1.45, 0.26, 1.0, 0.12, 0.06, 0.7, 1, -1, 0],
    [-0.36, 0.34, -1.55, 0.5, 1.0, 0.45, 0.1, 1.0, 2, -1, 0],
  ];
  const pos: number[] = [];
  const corner: number[] = [];
  const size: number[] = [];
  const col: number[] = [];
  const kind: number[] = [];
  const dirs: number[] = [];
  const idx: number[] = [];
  spots.forEach(([x, y, z, s, r, g, bl, a, k, dz, dx], i) => {
    for (const [cx, cy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      pos.push(x, y, z);
      corner.push(cx, cy);
      size.push(s);
      col.push(r, g, bl, a);
      kind.push(k);
      dirs.push(dx, 0, dz);
    }
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 3));
  g.setIndex(idx);
  return g;
}
