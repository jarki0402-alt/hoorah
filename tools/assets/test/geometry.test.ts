import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Bvh, bakeAo } from '../src/ao';
import { hex } from '../src/color';
import { Glb, readGlbJson } from '../src/gltf';
import { Mesh, paint } from '../src/mesh';
import { creaseNormals } from '../src/normals';
import { organic } from '../src/organic';
import { surfaceNets } from '../src/polygonize';
import { blend, sphere } from '../src/sdf';
import { lathe, roundedBox, tube } from '../src/shapes';
import { simplify } from '../src/simplify';

const P = paint(hex(0xff8a3d));

function signedVolume(pos: readonly number[], idx: readonly number[]): number {
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]! * 3;
    const b = idx[t + 1]! * 3;
    const c = idx[t + 2]! * 3;
    v +=
      (pos[a]! * (pos[b + 1]! * pos[c + 2]! - pos[b + 2]! * pos[c + 1]!) -
        pos[a + 1]! * (pos[b]! * pos[c + 2]! - pos[b + 2]! * pos[c]!) +
        pos[a + 2]! * (pos[b]! * pos[c + 1]! - pos[b + 1]! * pos[c]!)) /
      6;
  }
  return v;
}

/** Every edge shared by exactly two triangles in opposite directions. */
function isClosedManifold(idx: readonly number[]): boolean {
  const edges = new Map<string, number>();
  for (let t = 0; t < idx.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k]!;
      const b = idx[t + ((k + 1) % 3)]!;
      const key = `${a}_${b}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  for (const [key, n] of edges) {
    const [a, b] = key.split('_');
    if (n !== 1 || edges.get(`${b}_${a}`) !== 1) return false;
  }
  return true;
}

describe('surface nets', () => {
  it('extracts a closed, outward-facing sphere of the right size', () => {
    const r = 0.5;
    const m = surfaceNets(sphere(0, 0, 0, r), [-r, -r, -r], [r, r, r], 0.05);
    expect(isClosedManifold(m.idx)).toBe(true);
    const vol = signedVolume(m.pos, m.idx);
    expect(vol).toBeGreaterThan(0);
    expect(Math.abs(vol - (4 / 3) * Math.PI * r ** 3) / vol).toBeLessThan(0.05);
  });
});

describe('simplify', () => {
  it('reaches the budget, keeps the mesh closed and the volume close', () => {
    const f = blend(0.1, sphere(0, 0, 0, 0.4), sphere(0.35, 0.1, 0, 0.25));
    const raw = surfaceNets(f, [-0.5, -0.5, -0.5], [0.7, 0.5, 0.5], 0.025);
    const before = signedVolume(raw.pos, raw.idx);
    const s = simplify(raw.pos, raw.idx, 800);
    expect(s.idx.length / 3).toBeLessThanOrEqual(800);
    expect(isClosedManifold(s.idx)).toBe(true);
    expect(Math.abs(signedVolume(s.pos, s.idx) - before) / before).toBeLessThan(0.05);
    expect(s.source.length).toBe(s.pos.length / 3);
  });
});

describe('organic pipeline', () => {
  it('produces unit normals that point outward', () => {
    const m = organic(sphere(0, 0, 0, 0.3), {
      min: [-0.3, -0.3, -0.3],
      max: [0.3, 0.3, 0.3],
      cell: 0.03,
      tris: 400,
      paint: () => P,
    });
    expect(m.triangleCount).toBeLessThanOrEqual(400);
    for (let i = 0; i < m.vertexCount; i++) {
      const x = m.pos[i * 3]!;
      const y = m.pos[i * 3 + 1]!;
      const z = m.pos[i * 3 + 2]!;
      expect(Math.abs(Math.hypot(x, y, z) - 0.3)).toBeLessThan(1e-3);
      const dot = (x * m.nor[i * 3]! + y * m.nor[i * 3 + 1]! + z * m.nor[i * 3 + 2]!) / 0.3;
      expect(dot).toBeGreaterThan(0.99);
    }
  });
});

describe('hard-surface shapes', () => {
  it('rounded boxes are closed with the right size and flat faces', () => {
    const m = roundedBox(1, 0.5, 0.3, 0.05, P);
    expect(isClosedManifold(m.idx)).toBe(true);
    const b = m.bounds();
    expect(b.max[0] - b.min[0]).toBeCloseTo(1, 5);
    expect(b.max[1] - b.min[1]).toBeCloseTo(0.5, 5);
    expect(signedVolume(m.pos, m.idx)).toBeGreaterThan(0.14);
    // Vertices in the middle of the top face have straight-up normals.
    for (let i = 0; i < m.vertexCount; i++)
      if (m.pos[i * 3 + 1]! > 0.249 && Math.abs(m.pos[i * 3]!) < 0.4 && Math.abs(m.pos[i * 3 + 2]!) < 0.09)
        expect(m.nor[i * 3 + 1]).toBeCloseTo(1, 5);
  });

  it('lathes and capped tubes face outward', () => {
    const l = lathe(
      [
        [0, 0],
        [0.5, 0, true],
        [0.5, 1, true],
        [0, 1],
      ],
      16,
      P,
    );
    expect(signedVolume(l.pos, l.idx)).toBeGreaterThan(0.7);
    const t = tube(
      [
        [0, 0, 0],
        [0, 1, 0],
        [0.5, 1.5, 0],
      ],
      0.1,
      10,
      P,
      { caps: 'round' },
    );
    expect(signedVolume(t.pos, t.idx)).toBeGreaterThan(0);
  });

  it('crease normals split sharp edges and keep smooth ones', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = creaseNormals(Mesh.fromGeometry(g, P), 40);
    expect(m.vertexCount).toBe(24);
    const s = creaseNormals(Mesh.fromGeometry(new THREE.SphereGeometry(1, 16, 12), P), 40);
    expect(s.vertexCount).toBeLessThan(16 * 12 + 40);
  });
});

describe('ambient occlusion', () => {
  it('darkens a crease and leaves open faces bright', () => {
    const floor = roundedBox(2, 0.1, 2, 0, P);
    const wall = roundedBox(0.1, 1, 2, 0.02, P).transform(new THREE.Matrix4().makeTranslation(0, 0.55, 0));
    const m = new Mesh().append(floor).append(wall);
    bakeAo(m, { distance: 0.5, rays: 32, strength: 1 });
    let corner = 1;
    let open = 0;
    for (let i = 0; i < m.vertexCount; i++) {
      const x = m.pos[i * 3]!;
      const y = m.pos[i * 3 + 1]!;
      const ao = m.surf[i * 4 + 3]!;
      // Bottom of the wall where it meets the floor, and the top of the wall.
      if (y < 0.08 && Math.abs(x - 0.05) < 1e-3 && m.nor[i * 3]! > 0.99) corner = Math.min(corner, ao);
      if (Math.abs(y - 1.05) < 1e-3 && m.nor[i * 3 + 1]! > 0.99) open = Math.max(open, ao);
    }
    expect(corner).toBeLessThan(0.85);
    expect(open).toBeGreaterThan(0.95);
  });

  it('the BVH finds the nearest triangle', () => {
    const m = roundedBox(1, 1, 1, 0, P);
    const bvh = new Bvh(m.pos, m.idx);
    expect(bvh.cast(0, 0, 3, 0, 0, -1, 10)).toBeCloseTo(2.5, 6);
    expect(bvh.cast(0, 3, 3, 0, 0, -1, 10)).toBe(10);
  });
});

describe('glb writer', () => {
  it('writes a valid header, JSON chunk and quantised attributes', () => {
    const glb = new Glb();
    const mat = glb.addMaterial({ name: 'surface' });
    const ref = glb.addMesh('box', [{ mesh: roundedBox(1, 2, 3, 0.1, P), material: mat }], {
      quantize: true,
    });
    const node = glb.addNode({ name: 'box', mesh: ref.mesh, translation: ref.translation, scale: ref.scale });
    glb.setScene([node]);
    const bytes = glb.toBuffer();
    expect(new DataView(bytes.buffer).getUint32(8, true)).toBe(bytes.byteLength);
    expect(bytes.byteLength % 4).toBe(0);
    const json = readGlbJson(bytes) as { meshes: { primitives: { attributes: Record<string, number> }[] }[] };
    const attrs = json.meshes[0]!.primitives[0]!.attributes;
    expect(Object.keys(attrs).sort()).toEqual(['COLOR_0', 'NORMAL', 'POSITION', '_SURF']);
    expect(ref.scale?.[0]).toBeCloseTo(1.5, 5);
  });
});
