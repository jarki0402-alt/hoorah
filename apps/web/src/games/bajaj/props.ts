/**
 * Repeated props as InstancedMeshes (trees, palms, street lamps, crowd, parked motorbikes, traffic)
 * plus the waving-flag material. Each kind is one draw call however many there are (the renderer
 * splits big static sets into cells for culling). Shapes are rounded and carry per-vertex PBR
 * surfaces (glossy car paint, glass, chrome, glowing lamp lenses, soft foliage).
 */
import * as THREE from 'three';
import { displace, GeoBuilder, glow, hash01, loft, mix, noise3, paint, SURF, smooth, tube } from './geo';

/* ------------------------------------------------------------------ geometries */

const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const named = (g: THREE.BufferGeometry, name: string) => {
  g.name = name;
  return g;
};

/** Lathe around y from (radius, height) pairs, smooth shaded. */
function lathe(pts: readonly (readonly [number, number])[], segs: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}

/** A lumpy, softly shaded foliage clump: displaced icosphere, darker underneath. */
function foliageLump(seed: number, detail = 2): THREE.BufferGeometry {
  const g = displace(smooth(new THREE.IcosahedronGeometry(1, detail)), (p, n) => {
    const k =
      noise3(p.x * 1.7 + seed, p.y * 1.7, p.z * 1.7 - seed) * 0.16 +
      noise3(p.x * 4 + seed, p.y * 4, p.z * 4) * 0.05;
    p.addScaledVector(n, k);
    if (p.y < -0.35) p.y = -0.35 + (p.y + 0.35) * 0.45;
  });
  paint(g, (_x, y) => mix(0x2a7438, 0x74c95c, Math.min(1, Math.max(0, (y + 0.6) / 1.5))));
  return g;
}

export function treeGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.surface = SURF.wood;
  // Tapered, slightly leaning trunk with a root flare, and two branches.
  const trunk = displace(
    lathe(
      [
        [0.0001, 0],
        [0.34, 0],
        [0.26, 0.22],
        [0.21, 1.2],
        [0.18, 2.4],
        [0.15, 3.4],
        [0.0001, 3.45],
      ],
      7,
    ),
    (p) => {
      p.x += (p.y / 3.4) ** 2 * 0.25;
    },
  );
  b.addGeometry(trunk, new THREE.Matrix4(), 0x7a5232);
  b.addGeometry(
    tube([V(0.08, 2.3, 0), V(0.6, 2.9, 0.15), V(1.1, 3.6, 0.3)], 0.09, {
      radial: 6,
      segments: 3,
      caps: false,
    }),
    new THREE.Matrix4(),
    0x74502f,
  );
  b.addGeometry(
    tube([V(0.1, 2.6, 0), V(-0.4, 3.2, -0.2), V(-0.9, 3.8, -0.35)], 0.08, {
      radial: 6,
      segments: 3,
      caps: false,
    }),
    new THREE.Matrix4(),
    0x74502f,
  );
  b.surface = SURF.foliage;
  const lumps: [number, number, number, number, number][] = [
    [0.1, 4.5, 0, 1.9, 2],
    [1.3, 4.0, 0.5, 1.35, 1],
    [-1.1, 4.0, -0.4, 1.4, 1],
    [0.25, 5.4, -0.3, 1.25, 1],
    [-0.4, 4.15, 1.2, 1.1, 1],
  ];
  lumps.forEach(([x, y, z, sc, det], i) => {
    b.addGeometry(foliageLump(i * 3.7 + 1, det), M(x, y, z, 0, i, 0, sc, sc * 0.85, sc), 0xffffff);
  });
  return named(b.build(), 'tree');
}

export function palmGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.surface = SURF.wood;
  // Curved, ringed trunk: rings along a gentle bow, tapering upward.
  const rings = 11;
  const segs = 8;
  const H = 8.1;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const top = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const cx = t * t * 0.9;
    const cy = t * H;
    const r = 0.2 - t * 0.06 + (i % 2 ? 0.012 : 0);
    const c = new THREE.Color(i % 2 ? 0x9b7a55 : 0x84653f);
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      pos.push(cx + Math.cos(a) * r, cy, Math.sin(a) * r);
      col.push(c.r, c.g, c.b);
    }
    if (i === rings) top.set(cx, cy, 0);
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < segs; k++) {
      const a0 = i * segs + k;
      const a1 = i * segs + ((k + 1) % segs);
      const b0 = a0 + segs;
      const b1 = a1 + segs;
      idx.push(a0, b1, a1, a0, b0, b1);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  b.addGeometry(tg, new THREE.Matrix4(), 0xffffff);
  // Fronds: drooping, creased ribbons with serrated leaflet edges, both faces.
  b.surface = SURF.foliage;
  const fronds = 9;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + 0.2;
    const len = 2.6 + (f % 3) * 0.35;
    const droop = 0.5 + (f % 2) * 0.35;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const side = V(-Math.sin(a), 0, Math.cos(a));
    const n = 9;
    const spine: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      spine.push(
        top
          .clone()
          .addScaledVector(dir, t * len)
          .add(V(0, 0.25 + t * 0.6 - t * t * (1.2 + droop), 0)),
      );
    }
    const fp: number[] = [];
    const fc: number[] = [];
    const fi: number[] = [];
    const cDark = new THREE.Color(0x23803e);
    const cLight = new THREE.Color(0x4cb35a);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.42 * (i % 2 ? 0.75 : 1);
      const p = spine[i]!;
      const c = cDark.clone().lerp(cLight, t);
      for (const s of [-1, 0, 1]) {
        const q = p.clone().addScaledVector(side, s * w);
        if (s !== 0) q.y -= w * 0.35;
        fp.push(q.x, q.y, q.z);
        fc.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      // top faces (left half, right half) and the matching undersides
      fi.push(o, o + 1, o + 4, o, o + 4, o + 3, o + 1, o + 2, o + 5, o + 1, o + 5, o + 4);
      fi.push(o, o + 4, o + 1, o, o + 3, o + 4, o + 1, o + 5, o + 2, o + 1, o + 4, o + 5);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    fg.setIndex(fi);
    fg.computeVertexNormals();
    b.addGeometry(fg, new THREE.Matrix4(), 0xffffff);
  }
  b.surface = SURF.gloss;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.prim(
      'sphereLo',
      top.x + Math.cos(a) * 0.22,
      top.y - 0.15,
      Math.sin(a) * 0.22,
      0.3,
      0.32,
      0.3,
      0x6b4a2a,
    );
  }
  return named(b.build(), 'palm');
}

/** Street lamp; the curved arm reaches toward local +z (the road). */
export function lampGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.surface = SURF.metal;
  const dark = 0x4a4f57;
  b.addGeometry(
    lathe(
      [
        [0.0001, 0],
        [0.24, 0],
        [0.24, 0.12],
        [0.17, 0.3],
        [0.1, 0.55],
        [0.085, 4],
        [0.07, 7.6],
        [0.0001, 7.7],
      ],
      8,
    ),
    new THREE.Matrix4(),
    dark,
  );
  b.addGeometry(
    tube([V(0, 7.4, 0), V(0, 8.15, 0.25), V(0, 8.35, 1.0), V(0, 8.15, 1.75)], 0.055, {
      radial: 6,
      segments: 7,
    }),
    new THREE.Matrix4(),
    dark,
  );
  // Lamp head: a flattened, rounded shell with a warm glowing lens underneath.
  b.surface = SURF.paint;
  b.addGeometry(
    loft(
      [
        { z: -0.42, y0: -0.02, y1: 0.02, hw: 0.05, n: 2.5 },
        { z: -0.36, y0: -0.07, y1: 0.07, hw: 0.17, n: 3 },
        { z: 0.2, y0: -0.08, y1: 0.08, hw: 0.2, n: 3 },
        { z: 0.38, y0: -0.05, y1: 0.05, hw: 0.14, n: 3 },
        { z: 0.42, y0: -0.01, y1: 0.01, hw: 0.04, n: 2.5 },
      ],
      10,
    ),
    M(0, 8.08, 1.95, 0.12, 0, 0),
    0x3b3f45,
  );
  b.surface = glow(1.4);
  b.addGeometry(
    new THREE.SphereGeometry(0.5, 8, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    M(0, 8.02, 1.95, 0.12, 0, 0, 0.3, 0.06, 0.62),
    0xfff1c4,
  );
  // Small banner bracket with a red-white pennant pair
  b.surface = SURF.fabric;
  b.boxBevel = 0;
  b.prim('box', 0.25, 5.4, 0, 0.5, 1.6, 0.03, 0xf2453d);
  b.prim('box', -0.25, 5.4, 0, 0.5, 1.6, 0.03, 0xffffff);
  return named(b.build(), 'lamp');
}

/** Spectator body (white parts take the instance tint as the shirt colour). */
export function personBodyGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.surface = SURF.fabric;
  b.addGeometry(
    lathe(
      [
        [0.0001, 0.68],
        [0.17, 0.7],
        [0.22, 0.85],
        [0.24, 1.1],
        [0.2, 1.28],
        [0.08, 1.34],
        [0.0001, 1.34],
      ],
      7,
    ),
    M(0, 0, 0, 0, 0, 0, 1, 1, 0.72),
    0xffffff,
  );
  for (const sx of [-1, 1]) {
    b.addGeometry(new THREE.CapsuleGeometry(0.075, 0.5, 1, 5), M(sx * 0.09, 0.38, 0), 0x3a3d45);
    // Raised arms (cheering)
    b.addGeometry(
      new THREE.CapsuleGeometry(0.05, 0.42, 1, 5),
      M(sx * 0.27, 1.45, 0, 0, 0, -sx * 0.35),
      0xffffff,
    );
  }
  return named(b.build(), 'person');
}

export function personHeadGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.surface = SURF.skin;
  b.addGeometry(new THREE.SphereGeometry(0.16, 9, 6), M(0, 1.52, 0, 0, 0, 0, 1, 1.12, 1), 0xffffff);
  b.surface = SURF.satin;
  b.addGeometry(
    new THREE.SphereGeometry(0.168, 9, 3, 0, Math.PI * 2, 0, Math.PI * 0.45),
    M(0, 1.53, -0.01, -0.25, 0, 0, 1, 1.15, 1),
    0x2a1d17,
  );
  return named(b.build(), 'head');
}

/** Boulevard traffic: rounded sedan or angkot minibus (white body takes the instance tint). */
export function carGeometry(kind: 'sedan' | 'angkot'): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const glass = 0x26323b;
  if (kind === 'sedan') {
    b.surface = SURF.gloss;
    b.addGeometry(
      loft(
        [
          { z: -2.12, y0: 0.4, y1: 0.78, hw: 0.7, n: 3 },
          { z: -2.05, y0: 0.3, y1: 0.86, hw: 0.86, n: 4 },
          { z: -1.6, y0: 0.26, y1: 0.9, hw: 0.9, n: 5 },
          { z: 1.5, y0: 0.26, y1: 0.84, hw: 0.9, n: 5 },
          { z: 2.02, y0: 0.3, y1: 0.72, hw: 0.84, n: 4 },
          { z: 2.12, y0: 0.38, y1: 0.62, hw: 0.68, n: 3 },
        ],
        20,
      ),
      new THREE.Matrix4(),
      0xffffff,
    );
    b.surface = SURF.glass;
    b.addGeometry(
      loft(
        [
          { z: -1.35, y0: 0.82, y1: 0.88, hw: 0.74, hwb: 0.8, n: 4 },
          { z: -1.05, y0: 0.82, y1: 1.3, hw: 0.68, hwb: 0.8, n: 4 },
          { z: 0.45, y0: 0.82, y1: 1.32, hw: 0.68, hwb: 0.8, n: 4 },
          { z: 0.95, y0: 0.82, y1: 0.88, hw: 0.74, hwb: 0.8, n: 4 },
        ],
        16,
      ),
      new THREE.Matrix4(),
      glass,
    );
    b.surface = SURF.gloss;
    b.roundBox(0, 1.335, -0.3, 1.36, 0.06, 1.3, 0xffffff, 0.03);
    b.surface = glow(1.6);
    for (const sx of [-1, 1]) {
      b.roundBox(sx * 0.6, 0.66, 2.08, 0.32, 0.1, 0.04, 0xfff3c4, 0.02);
      b.roundBox(sx * 0.62, 0.7, -2.1, 0.3, 0.1, 0.04, 0xf2453d, 0.02);
    }
  } else {
    b.surface = SURF.gloss;
    b.addGeometry(
      loft(
        [
          { z: -2.02, y0: 0.32, y1: 1.62, hw: 0.8, n: 5 },
          { z: -1.96, y0: 0.28, y1: 1.7, hw: 0.86, n: 6 },
          { z: 1.6, y0: 0.28, y1: 1.7, hw: 0.86, n: 6 },
          { z: 1.92, y0: 0.3, y1: 1.4, hw: 0.84, n: 5 },
          { z: 2.02, y0: 0.34, y1: 1.0, hw: 0.78, n: 4 },
        ],
        20,
      ),
      new THREE.Matrix4(),
      0xffffff,
    );
    b.surface = SURF.glass;
    for (const sx of [-1, 1]) b.roundBox(sx * 0.865, 1.32, -0.1, 0.02, 0.42, 3.1, glass, 0.01);
    b.roundBox(0, 1.25, 1.83, 1.5, 0.4, 0.2, glass, 0.04, -0.6, 0, 0);
    b.surface = SURF.satin;
    for (const sx of [-1, 1]) b.roundBox(sx * 0.868, 0.92, 0, 0.02, 0.12, 3.6, 0xf4f4f4, 0.01);
    b.surface = SURF.metal;
    b.roundBox(0, 1.76, -0.2, 1.4, 0.06, 2.6, 0x3b3c42, 0.02);
    b.surface = glow(1.6);
    for (const sx of [-1, 1]) b.roundBox(sx * 0.58, 0.62, 2.02, 0.26, 0.12, 0.04, 0xfff3c4, 0.02);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1.35, 1.35]) {
      b.surface = SURF.rubber;
      b.addGeometry(
        new THREE.TorusGeometry(0.24, 0.09, 6, 14),
        M(sx * 0.82, 0.32, sz, 0, Math.PI / 2, 0),
        0x1e1f23,
      );
      b.surface = SURF.chrome;
      b.addGeometry(
        new THREE.CylinderGeometry(0.17, 0.17, 0.14, 12),
        M(sx * 0.82, 0.32, sz, 0, 0, Math.PI / 2),
        0xcfd3d8,
      );
    }
  }
  return named(b.build(), kind);
}

export function motorbikeGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (const z of [-0.6, 0.6]) {
    b.surface = SURF.rubber;
    b.addGeometry(new THREE.TorusGeometry(0.24, 0.06, 5, 12), M(0, 0.3, z, 0, Math.PI / 2, 0), 0x1e1f23);
    b.surface = SURF.chrome;
    b.addGeometry(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), M(0, 0.3, z, 0, 0, Math.PI / 2), 0xcfd3d8);
  }
  b.surface = SURF.gloss;
  b.addGeometry(
    new THREE.CapsuleGeometry(0.15, 0.7, 2, 7),
    M(0, 0.58, 0.05, Math.PI / 2, 0, 0, 1, 1, 0.9),
    0xffffff,
  );
  b.surface = SURF.vinyl;
  b.roundBox(0, 0.8, -0.22, 0.28, 0.1, 0.62, 0x2a2b30, 0.045);
  b.surface = SURF.chrome;
  b.addGeometry(
    tube([V(0, 0.55, 0.45), V(0, 0.95, 0.6)], 0.025, { radial: 5, caps: false, segments: 2 }),
    new THREE.Matrix4(),
    0x9aa0a6,
  );
  b.addGeometry(
    tube([V(-0.32, 1.02, 0.56), V(0, 0.97, 0.62), V(0.32, 1.02, 0.56)], 0.022, { radial: 5, segments: 5 }),
    new THREE.Matrix4(),
    0x9aa0a6,
  );
  b.surface = glow(1.2);
  b.addGeometry(new THREE.SphereGeometry(0.07, 6, 4), M(0, 0.9, 0.68), 0xfff3c4);
  return named(b.build(), 'motorbike');
}

/** A diamond kite with a tail, for the sky. */
export function kiteGeometry(c1: number, c2: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.boxBevel = 0;
  b.quad([0, -1.6, 0], [1.2, 0, 0], [0, 1.6, 0], [-1.2, 0, 0], c1);
  b.quad([-1.2, 0, 0], [0, 1.6, 0], [1.2, 0, 0], [0, -1.6, 0], c1);
  b.quad([0, -0.6, 0.02], [0.45, 0, 0.02], [0, 1.6, 0.02], [-0.45, 0, 0.02], c2);
  for (let i = 0; i < 6; i++)
    b.box(Math.sin(i * 0.9) * 0.3, -2.1 - i * 0.7, 0, 0.35, 0.18, 0.05, i % 2 ? c2 : c1);
  return named(b.build(), 'kite');
}

/** Puffy flat-bottomed cumulus: overlapping lumps, softly shaded from a bright top to a cool base. */
export function cloudGeometry(seed: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const n = 6 + Math.floor(hash01(seed) * 4);
  const lump = smooth(new THREE.SphereGeometry(0.5, 16, 10));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const x = t * n * 8 + (hash01(seed + i) - 0.5) * 5;
    // Big lumps in the middle, smaller toward the ends: a domed outline.
    const s = (14 + hash01(seed * 3 + i) * 10) * (1 - Math.abs(t) * 0.9);
    const z = (hash01(seed * 7 + i) - 0.5) * 10;
    b.addGeometry(lump, M(x, s * 0.18, z, 0, hash01(i) * 3, 0, s, s * 0.78, s * 0.9), 0xffffff);
  }
  const g = b.build();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  // Flatten the underside.
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.25);
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const base = new THREE.Color(0xd4e2ee);
  const top = new THREE.Color(0xffffff);
  const k = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const h = Math.min(1, Math.max(0, (p.getY(i) + 1) / 12));
    const lit = Math.min(1, Math.max(0, 0.55 + nrm.getY(i) * 0.45));
    k.copy(base).lerp(top, Math.min(1, h * 0.6 + lit * 0.6));
    col[i * 3] = k.r;
    col[i * 3 + 1] = k.g;
    col[i * 3 + 2] = k.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return named(g, 'cloud');
}

/* ------------------------------------------------------------------ instancing */

export class Instancer {
  readonly matrices: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];

  add(x: number, y: number, z: number, rotY = 0, scale = 1, tint?: THREE.ColorRepresentation): number {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, scale, scale),
    );
    this.matrices.push(m);
    this.colors.push(new THREE.Color(tint ?? 0xffffff));
    return this.matrices.length - 1;
  }

  build(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.matrices.length));
    mesh.count = this.matrices.length;
    this.matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, this.colors[i]!);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/* ------------------------------------------------------------------ waving flags */

export interface WaveUniforms {
  uTime: { value: number };
}

/**
 * Lambert material whose vertices flap along their normal, weighted by the `aWave` attribute
 * (0 at the pole or rope, 1 at the free edge).
 */
export function flagMaterial(uniforms: WaveUniforms): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x3a3a3a });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWave;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = position.x * 0.45 + position.z * 0.45 + position.y * 0.6;
        transformed += objectNormal * (sin(uTime * 6.0 + ph) * 0.22 + sin(uTime * 9.7 + ph * 1.7) * 0.07) * aWave;`,
      );
  };
  m.customProgramCacheKey = () => 'bajaj-flag';
  return m;
}
