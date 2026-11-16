/**
 * Procedural ingredients and hand tools. Geometry is memoised (`shared`) so eight stations reuse
 * the same buffers; anything whose colour changes per station gets its own material in the rig.
 */
import * as THREE from 'three';
import { Batch, isLowDetail, lathe, PAL, rand, rbox, shared, toon, vcToon } from './kit';

/* ------------------------------------------------------------------ ingredients */

/** Shallot bulb, long axis = +Y, base at y = 0, ~5 cm tall. */
export const shallotGeo = () =>
  shared('shallot', () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const r = 0.023 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) ** 0.7 * (1 - 0.15 * t) + 0.002;
      pts.push([r, t * 0.055]);
    }
    pts.push([0.0015, 0.062]);
    const b = new Batch();
    b.addShaded(lathe(pts, 18), (_x, y) => (y < 0.004 ? 0xd8b48a : y > 0.05 ? 0xa83a4c : PAL.shallot));
    return b.geometry();
  });

/** Whole garlic head with cloves, ~4 cm. */
export const garlicGeo = () =>
  shared('garlic', () => {
    const g = new THREE.SphereGeometry(0.022, 24, 16);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const lobe = 1 + 0.09 * Math.abs(Math.cos(a * 4));
      const top = y > 0 ? 1 - (y / 0.022) ** 3 * 0.45 : 1;
      pos.setXYZ(i, x * lobe * top, y * 0.9 + (y > 0.015 ? (y - 0.015) * 0.9 : 0), z * lobe * top);
    }
    g.computeVertexNormals();
    const b = new Batch();
    b.addShaded(g, (_x, y) => (y > 0.012 ? 0xe9dcc2 : y < -0.016 ? 0xcdb48c : PAL.garlic));
    b.add(new THREE.CylinderGeometry(0.002, 0.004, 0.012, 6), 0xcdb48c, { p: [0, 0.026, 0] });
    return b.geometry();
  });

/** A thin ring slice: coloured rim, pale inside with one inner ring. */
export function sliceGeo(key: string, r: number, rim: number, inner: number) {
  return shared(`slice:${key}`, () => {
    const b = new Batch();
    b.add(new THREE.CylinderGeometry(r, r, 0.004, 18), rim);
    b.add(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.0042, 18), inner);
    b.add(new THREE.TorusGeometry(r * 0.52, r * 0.07, 4, 16), rim, {
      p: [0, 0.0021, 0],
      r: [Math.PI / 2, 0, 0],
    });
    return b.geometry();
  });
}

/** Curved red chilli with a green cap, lying along +X, ~8 cm. */
export const chiliGeo = (small = false) =>
  shared(`chili:${small}`, () => {
    const L = small ? 0.045 : 0.085;
    const R = small ? 0.0055 : 0.0085;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([R * (1 - t) ** 0.55 * (0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 3))) + 0.0006, t * L]);
    }
    const body = lathe(pts, 10);
    const pos = body.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = y / L;
      pos.setX(i, pos.getX(i) + Math.sin(t * Math.PI * 0.6) * L * 0.18);
    }
    body.computeVertexNormals();
    const b = new Batch();
    b.add(body, small ? 0xf04a1a : PAL.chili, { r: [0, 0, -Math.PI / 2] });
    b.add(new THREE.CylinderGeometry(R * 0.9, R * 1.1, 0.006, 10), PAL.leafDark, {
      p: [-0.002, 0, 0],
      r: [0, 0, Math.PI / 2],
    });
    b.add(new THREE.CylinderGeometry(0.0012, 0.0016, 0.014, 6), PAL.leaf, {
      p: [-0.011, 0.002, 0],
      r: [0, 0, 1.2],
    });
    return b.geometry();
  });

/** A rice grain: 50 triangles, or 24 on weak devices (hundreds are drawn per station). */
export const grainGeo = () =>
  isLowDetail()
    ? shared('grain:low', () => new THREE.CapsuleGeometry(0.002, 0.0042, 1, 4))
    : shared('grain', () => new THREE.CapsuleGeometry(0.002, 0.0042, 2, 5));

/** Flattened noisy blob (sambal paste, peanut sauce, butter). Radius 1 in XZ, height ~0.5. */
export const blobGeo = (seed = 1) =>
  shared(`blob:${seed}`, () => {
    const g = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const n =
        1 +
        0.08 * Math.sin(a * 3 + seed) +
        0.05 * Math.sin(a * 7 + seed * 2) +
        0.04 * Math.sin(y * 9 + a * 2);
      pos.setXYZ(i, x * n, y * 0.5 * (1 + 0.1 * Math.sin(a * 5 + seed)), z * n);
    }
    g.computeVertexNormals();
    return g;
  });

/** Rounded cube of chicken, ~2.2 cm. */
export const cubeGeo = () => shared('cube', () => rbox(0.022, 0.019, 0.022, 0.006, 2));

/** Bamboo skewer along +X with a pointed tip at +X. */
export const skewerGeo = () =>
  shared('skewer', () => {
    const b = new Batch();
    b.add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.2, 6), PAL.bamboo, { r: [0, 0, Math.PI / 2] });
    b.add(new THREE.ConeGeometry(0.0022, 0.012, 6), PAL.bamboo, {
      p: [0.106, 0, 0],
      r: [0, 0, -Math.PI / 2],
    });
    return b.geometry();
  });

/** Dome with a bumpy profile (rice mound on the plate). Radius 1, height ~0.6. */
export const domeGeo = () =>
  shared('dome', () => {
    const g = new THREE.SphereGeometry(1, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const n = 1 + 0.04 * Math.sin(a * 9) * Math.sin(y * 7) + 0.03 * Math.sin(a * 4 + y * 5);
      pos.setXYZ(i, x * n, y * 0.62 * n, z * n);
    }
    g.computeVertexNormals();
    return g;
  });

/** Fried egg white: an irregular flat blob, radius ~1 (scale per use). */
export const eggWhiteGeo = () =>
  shared('eggWhite', () => {
    const segs = 48;
    const rings = 6;
    const shapeR = (a: number) =>
      1 + 0.09 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5 + 2) + 0.04 * Math.sin(a * 11);
    const positions: number[] = [];
    const idx: number[] = [];
    positions.push(0, 0.09, 0);
    for (let r = 1; r <= rings; r++) {
      const f = r / rings;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const R = f * shapeR(a);
        positions.push(Math.cos(a) * R, 0.09 * (1 - f ** 2.2) + 0.01, Math.sin(a) * R);
      }
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let r = 1; r < rings; r++) {
      const a0 = 1 + (r - 1) * segs;
      const b0 = 1 + r * segs;
      for (let s = 0; s < segs; s++) {
        const s1 = (s + 1) % segs;
        idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });

/** Lacy crisp edge following the egg white outline. */
export const eggEdgeGeo = () =>
  shared('eggEdge', () => {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s < 48; s++) {
      const a = (s / 48) * Math.PI * 2;
      const R =
        (1 + 0.09 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5 + 2) + 0.04 * Math.sin(a * 11)) * 0.99;
      pts.push(new THREE.Vector3(Math.cos(a) * R, 0.012, Math.sin(a) * R));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.045, 5, true);
  });

/* ------------------------------------------------------------------ tools */

/** Chef's knife. Origin at the middle of the cutting edge; blade in the XY plane, handle at +X. */
export function knife(): THREE.Group {
  const g = new THREE.Group();
  const blade = shared('knifeBlade', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.12, 0);
    s.quadraticCurveTo(-0.11, 0.03, -0.08, 0.045);
    s.lineTo(0.05, 0.048);
    s.lineTo(0.05, 0.0);
    s.quadraticCurveTo(-0.04, -0.006, -0.12, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false });
    geo.translate(0, 0, -0.0015);
    return geo;
  });
  const steel = new THREE.Mesh(blade, toon(0xd9e0e6));
  steel.castShadow = true;
  const spine = new THREE.Mesh(
    shared('knifeSpine', () => new THREE.BoxGeometry(0.13, 0.004, 0.0035)),
    toon(0x9aa3ab),
  );
  spine.position.set(-0.015, 0.046, 0);
  const handle = new THREE.Mesh(
    shared('knifeHandle', () => rbox(0.1, 0.024, 0.017, 0.007)),
    toon(0x3b2416),
  );
  handle.position.set(0.1, 0.03, 0);
  handle.castShadow = true;
  g.add(steel, spine, handle);
  for (const x of [0.075, 0.105, 0.135]) {
    const rivet = new THREE.Mesh(
      shared('rivet', () => new THREE.CylinderGeometry(0.003, 0.003, 0.019, 8)),
      toon(0xd9e0e6),
    );
    rivet.rotation.x = Math.PI / 2;
    rivet.position.set(x, 0.03, 0);
    g.add(rivet);
  }
  return g;
}

/** Stone pestle (ulekan), origin at the grinding end, handle up along +Y with a bend. */
export function pestle(): THREE.Group {
  const g = new THREE.Group();
  const geo = shared('pestle', () => {
    const b = new Batch();
    // Grinding knob at the bottom, a bent stone handle above.
    b.add(new THREE.SphereGeometry(0.02, 14, 10), 0x6a615b, { p: [0, 0.016, 0], s: [1, 0.85, 1] });
    b.add(new THREE.CapsuleGeometry(0.0135, 0.07, 6, 10), 0x7b716a, {
      p: [0.008, 0.06, 0],
      r: [0, 0, -0.18],
    });
    b.add(new THREE.CapsuleGeometry(0.012, 0.035, 6, 10), 0x7b716a, {
      p: [0.03, 0.115, 0],
      r: [0, 0, -0.75],
    });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Wok spatula (sutil): blade at the origin, handle up along +Y and back. */
export function spatula(): THREE.Group {
  const g = new THREE.Group();
  const geo = shared('spatula', () => {
    const b = new Batch();
    b.add(rbox(0.07, 0.006, 0.06, 0.004), 0xc9d1d8, { p: [0, 0, 0], r: [0.25, 0, 0] });
    b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 8), 0x9aa3ab, {
      p: [0, 0.055, -0.045],
      r: [-0.9, 0, 0],
    });
    b.add(rbox(0.024, 0.13, 0.022, 0.01), PAL.woodDark, { p: [0, 0.155, -0.11], r: [-0.9, 0, 0] });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Rice paddle (centong). Bowl at origin, handle up along +Y. */
export function paddle(): THREE.Group {
  const g = new THREE.Group();
  const geo = shared('paddle', () => {
    const b = new Batch();
    b.add(new THREE.SphereGeometry(0.035, 16, 10), PAL.wood3, { s: [1, 0.25, 1.15] });
    b.add(rbox(0.02, 0.14, 0.012, 0.006), PAL.wood2, { p: [0, 0.07, -0.04], r: [-0.7, 0, 0] });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Salt-shaker style jar with holes; origin at the cap (pointing down when shaking). */
export function shaker(body: number): THREE.Group {
  const g = new THREE.Group();
  const geo = shared(`shaker:${body}`, () => {
    const b = new Batch();
    b.add(new THREE.CylinderGeometry(0.026, 0.026, 0.07, 18), body, { p: [0, 0.055, 0] });
    b.add(new THREE.CylinderGeometry(0.028, 0.026, 0.02, 18), 0xd7dadf, { p: [0, 0.01, 0] });
    b.add(new THREE.SphereGeometry(0.028, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xd7dadf, {
      p: [0, 0.0, 0],
    });
    b.add(rbox(0.04, 0.03, 0.002, 0.004), PAL.cream, { p: [0, 0.06, 0.026] });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Soup ladle (irus) full of sauce; the bowl's lip is at the origin, handle up and back (-X). */
export function ladle(fill: number): THREE.Group {
  const g = new THREE.Group();
  const geo = shared(`ladle:${fill}`, () => {
    const b = new Batch();
    b.add(
      lathe(
        [
          [0.0005, -0.03],
          [0.025, -0.026],
          [0.038, -0.012],
          [0.04, 0],
          [0.036, 0],
          [0.034, -0.01],
          [0.022, -0.022],
          [0.0005, -0.025],
        ],
        24,
      ),
      0xd7dde3,
      { p: [-0.04, 0, 0] },
    );
    b.add(new THREE.CylinderGeometry(0.034, 0.034, 0.003, 24), fill, { p: [-0.04, -0.004, 0] });
    b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8), 0xb7bfc6, {
      p: [-0.13, 0.08, 0],
      r: [0, 0, 0.95],
    });
    b.add(rbox(0.07, 0.016, 0.016, 0.007), PAL.woodDark, { p: [-0.21, 0.135, 0], r: [0, 0, 0.6] });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Small saucepan for pouring; spout at the origin, body behind (-X). */
export function saucepan(fill: number): THREE.Group {
  const g = new THREE.Group();
  const geo = shared(`saucepan:${fill}`, () => {
    const b = new Batch();
    b.add(
      lathe(
        [
          [0.0005, 0],
          [0.045, 0],
          [0.05, 0.045],
          [0.046, 0.045],
          [0.041, 0.004],
          [0.0005, 0.004],
        ],
        24,
      ),
      0xd7dadf,
      { p: [-0.05, -0.02, 0] },
    );
    b.add(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 24), fill, { p: [-0.05, 0.015, 0] });
    b.add(rbox(0.1, 0.012, 0.02, 0.005), PAL.ink, { p: [-0.14, 0.015, 0] });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Woven bamboo fan (kipas sate). Handle at origin pointing -Y. */
export function fan(): THREE.Group {
  const g = new THREE.Group();
  const geo = shared('fan', () => {
    const b = new Batch();
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        b.add(new THREE.BoxGeometry(0.019, 0.019, 0.003), (i + j) % 2 ? 0xe9c98b : 0xc99a55, {
          p: [-0.05 + i * 0.02, 0.06 + j * 0.02, 0],
        });
      }
    b.add(new THREE.BoxGeometry(0.125, 0.006, 0.006), PAL.woodDark, { p: [0, 0.048, 0] });
    b.add(new THREE.BoxGeometry(0.125, 0.006, 0.006), PAL.woodDark, { p: [0, 0.172, 0] });
    b.add(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 8), PAL.woodDark, { p: [0, 0.03, 0] });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Balloon whisk; wires at the origin, handle up along +Y. */
export function whisk(): THREE.Group {
  const g = new THREE.Group();
  const geo = shared('whisk', () => {
    const b = new Batch();
    for (let i = 0; i < 4; i++) {
      b.add(new THREE.TorusGeometry(0.03, 0.0016, 4, 24), 0xd7dadf, {
        p: [0, 0.045, 0],
        r: [0, (i / 4) * Math.PI, 0],
        s: [1, 1.6, 1],
      });
    }
    b.add(new THREE.CylinderGeometry(0.008, 0.01, 0.1, 10), PAL.orange, { p: [0, 0.14, 0] });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Plastic jug for batter; spout at the origin. */
export function jug(fill: number): THREE.Group {
  const g = new THREE.Group();
  const geo = shared(`jug:${fill}`, () => {
    const b = new Batch();
    b.add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 20, 1, true), 0xeaf6ff, { p: [-0.045, -0.02, 0] });
    b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 20), 0xeaf6ff, { p: [-0.045, -0.07, 0] });
    b.add(new THREE.CylinderGeometry(0.041, 0.038, 0.07, 20), fill, { p: [-0.045, -0.032, 0] });
    b.add(new THREE.TorusGeometry(0.028, 0.006, 6, 12, Math.PI), 0x9ec9e8, {
      p: [-0.09, -0.02, 0],
      r: [0, 0, Math.PI / 2],
    });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Butter spreader (small offset spatula). Blade at origin, handle +Y. */
export function spreader(): THREE.Group {
  const g = new THREE.Group();
  const geo = shared('spreader', () => {
    const b = new Batch();
    b.add(rbox(0.09, 0.003, 0.022, 0.0014), 0xd7dadf, { p: [-0.02, 0, 0] });
    b.add(rbox(0.012, 0.09, 0.012, 0.005), PAL.woodDark, { p: [0.03, 0.04, 0], r: [0, 0, -0.6] });
    return b.geometry();
  });
  const m = new THREE.Mesh(geo, vcToon());
  m.castShadow = true;
  g.add(m);
  return g;
}

/* ------------------------------------------------------------------ instancing helpers */

const _o = new THREE.Object3D();

export function setInstance(
  im: THREE.InstancedMesh,
  i: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  s: number | [number, number, number] = 1,
): void {
  _o.position.set(x, y, z);
  _o.rotation.set(rx, ry, rz);
  if (typeof s === 'number') _o.scale.setScalar(s);
  else _o.scale.set(s[0], s[1], s[2]);
  _o.updateMatrix();
  im.setMatrixAt(i, _o.matrix);
}

export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadow = false) {
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.castShadow = shadow;
  im.receiveShadow = true;
  im.frustumCulled = false;
  im.count = 0;
  return im;
}

/** Deterministic scatter in a disc, area-uniform. */
export function discPoint(seed: number, r: number): [number, number] {
  const a = rand(seed) * Math.PI * 2;
  const d = Math.sqrt(rand(seed + 7777)) * r;
  return [Math.cos(a) * d, Math.sin(a) * d];
}
