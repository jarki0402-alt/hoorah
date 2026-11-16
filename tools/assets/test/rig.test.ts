import { describe, expect, it } from 'vitest';
import { hex } from '../src/color';
import { decal, ellipseShape } from '../src/decal';
import { Glb, readGlbJson } from '../src/gltf';
import { decimate } from '../src/lod';
import { paint } from '../src/mesh';
import { organic } from '../src/organic';
import { Rig, skinFromParts } from '../src/rig';
import { capsule, sphere } from '../src/sdf';
import { lathe } from '../src/shapes';

const P = paint(hex(0x22b35e), 0.5);

const rig = new Rig([
  { name: 'root', parent: null, head: [0, 0, 0] },
  { name: 'upper', parent: 'root', head: [0, 1, 0] },
  { name: 'lower', parent: 'upper', head: [0, 0.5, 0] },
]);

describe('rig', () => {
  it('rest offsets are relative to the parent joint', () => {
    expect(rig.rest(2)).toEqual([0, -0.5, 0]);
  });

  it('skin weights are normalised and follow the nearest part', () => {
    const f = (x: number, y: number, z: number) =>
      Math.min(capsule(0, 1, 0, 0, 0.5, 0, 0.1)(x, y, z), capsule(0, 0.5, 0, 0, 0, 0, 0.1)(x, y, z));
    const m = organic(f, {
      min: [-0.2, -0.2, -0.2],
      max: [0.2, 1.2, 0.2],
      cell: 0.03,
      tris: 600,
      paint: () => P,
    });
    skinFromParts(m, [
      { bone: 1, sdf: capsule(0, 1, 0, 0, 0.5, 0, 0.1) },
      { bone: 2, sdf: capsule(0, 0.5, 0, 0, 0, 0, 0.1) },
    ]);
    for (let i = 0; i < m.vertexCount; i++) {
      const w = m.weights!.slice(i * 4, i * 4 + 4);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      const y = m.pos[i * 3 + 1]!;
      if (y > 0.85) expect(m.joints![i * 4]).toBe(1);
      if (y < 0.15) expect(m.joints![i * 4]).toBe(2);
    }
  });

  it('samples clips into keyframes on the short rotation path', () => {
    const channels = rig.sample(
      { name: 'spin', duration: 1, pose: (t) => ({ upper: { r: [t * Math.PI * 2, 0, 0] } }) },
      [0, 1, 2],
      30,
      new Set(['root']),
    );
    const rot = channels.find((c) => c.node === 1 && c.path === 'rotation')!;
    expect(rot.times.length).toBe(31);
    for (let f = 1; f < rot.times.length; f++) {
      let dot = 0;
      for (let k = 0; k < 4; k++) dot += rot.values[(f - 1) * 4 + k]! * rot.values[f * 4 + k]!;
      expect(dot).toBeGreaterThan(0);
    }
    expect(channels.some((c) => c.node === 0 && c.path === 'translation')).toBe(true);
    expect(channels.some((c) => c.node === 1 && c.path === 'translation')).toBe(false);
  });

  it('writes a skinned, animated glb', () => {
    const glb = new Glb();
    const out = rig.write(glb);
    const m = lathe(
      [
        [0, 0],
        [0.1, 0.1],
        [0.1, 1.4],
        [0, 1.5],
      ],
      8,
      P,
    ).bindRigid(1);
    const ref = glb.addMesh('stick', [{ mesh: m, material: glb.addMaterial({ name: 'm' }) }], {
      box: { center: [0, 0.75, 0], extent: 1 },
    });
    const node = glb.addNode({ name: 'stick', mesh: ref.mesh, skin: out.skin });
    glb.addAnimation('wave', rig.sample({ name: 'wave', duration: 0.5, pose: () => ({}) }, out.nodes));
    glb.setScene([out.root, node]);
    const json = readGlbJson(glb.toBuffer()) as {
      skins: { joints: number[] }[];
      animations: unknown[];
      meshes: { primitives: { attributes: Record<string, number> }[] }[];
    };
    expect(json.skins[0]!.joints).toEqual(out.nodes);
    expect(json.animations.length).toBe(1);
    expect(Object.keys(json.meshes[0]!.primitives[0]!.attributes)).toContain('JOINTS_0');
  });
});

describe('details and levels of detail', () => {
  it('a decal sits on the front of the surface', () => {
    const body = sphere(0, 0, 0, 0.5);
    const d = decal(body, { cx: 0, cy: 0, shape: ellipseShape(0.1, 0.06), height: () => 0.01, paint: P });
    let maxZ = 0;
    for (let i = 0; i < d.vertexCount; i++) maxZ = Math.max(maxZ, d.pos[i * 3 + 2]!);
    expect(maxZ).toBeGreaterThan(0.505);
    expect(maxZ).toBeLessThan(0.52);
  });

  it('decimation keeps colours and occlusion of the surviving vertices', () => {
    const m = organic(sphere(0, 0, 0, 0.4), {
      min: [-0.4, -0.4, -0.4],
      max: [0.4, 0.4, 0.4],
      cell: 0.03,
      tris: 2000,
      paint: (_x, y) => paint(y > 0 ? hex(0xff0000) : hex(0x0000ff), 0.5),
    });
    for (let i = 0; i < m.vertexCount; i++) m.surf[i * 4 + 3] = 0.5;
    const low = decimate(m, 400);
    expect(low.triangleCount).toBeLessThanOrEqual(400);
    for (let i = 0; i < low.vertexCount; i++) {
      expect(low.surf[i * 4 + 3]).toBeCloseTo(0.5, 5);
      const red = low.col[i * 3]! > 0.5;
      const blue = low.col[i * 3 + 2]! > 0.5;
      expect(red !== blue).toBe(true);
    }
  });
});
