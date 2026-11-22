/**
 * Draws a `Rope` as thick yellow cord: one sagging `RopeStrand` per link between the bodies'
 * waists (interpolated like the avatars), bent over ledges, resting on floors. The cord warms from
 * yellow through orange to red as a link nears its hard limit, so the strain reads from the sofa.
 * One instanced mesh for every piece, so the rope costs a single draw call.
 */
import * as THREE from 'three';
import { lerp, type V3 } from '../math';
import { type Rope, RopeStrand } from '../rope';
import type { KotakSim } from '../sim';
import type { KotakStage } from './stage';

/** Height of the knot on a body above its feet (m). */
export const ROPE_WAIST = 0.8;

const SLACK = new THREE.Color('#FFC928');
const TIGHT = new THREE.Color('#FF8A3D');
const LIMIT = new THREE.Color('#F2453D');

export class RopeLayer {
  readonly mesh: THREE.InstancedMesh;
  private readonly strands: RopeStrand[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly a: V3 = { x: 0, y: 0, z: 0 };
  private readonly b: V3 = { x: 0, y: 0, z: 0 };
  private readonly via: V3 = { x: 0, y: 0, z: 0 };

  constructor(
    stage: KotakStage,
    private readonly maxLinks = 4,
    private readonly segments = 10,
    thickness = 0.065,
  ) {
    const geo = new THREE.CylinderGeometry(thickness, thickness, 1, 6, 1, true);
    const mat = stage.material('#ffffff', { rough: 0.85 });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxLinks * segments);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < maxLinks; i++) this.strands.push(new RopeStrand(segments));
  }

  /** Forget every strand's shape (after a teleport such as a team respawn). */
  reset(): void {
    for (const s of this.strands) s.reset();
  }

  update(sim: KotakSim, rope: Rope, alpha: number, dt: number): void {
    let n = 0;
    const floor = (x: number, z: number, y: number) => sim.supportAt(x, z, y);
    const links = Math.min(this.maxLinks, rope.links.length);
    for (let i = 0; i < links; i++) {
      const l = rope.links[i]!;
      const A = sim.body(l.a);
      const B = sim.body(l.b);
      if (!A?.active || !B?.active) continue;
      this.a.x = lerp(A.prev.x, A.pos.x, alpha);
      this.a.y = lerp(A.prev.y, A.pos.y, alpha) + ROPE_WAIST;
      this.a.z = lerp(A.prev.z, A.pos.z, alpha);
      this.b.x = lerp(B.prev.x, B.pos.x, alpha);
      this.b.y = lerp(B.prev.y, B.pos.y, alpha) + ROPE_WAIST;
      this.b.z = lerp(B.prev.z, B.pos.z, alpha);
      const bend = rope.bend[i];
      if (bend) {
        this.via.x = bend.x;
        this.via.y = bend.y + 0.07;
        this.via.z = bend.z;
      }
      const strand = this.strands[i]!;
      strand.update(this.a, this.b, rope.restOf(i), dt, floor, bend ? this.via : null);
      const k = rope.strain(i);
      if (k < 0.5) this.color.copy(SLACK).lerp(TIGHT, k * 2);
      else this.color.copy(TIGHT).lerp(LIMIT, (k - 0.5) * 2);
      const pts = strand.points;
      for (let s = 0; s < this.segments; s++) {
        const p = pts[s]!;
        const q = pts[s + 1]!;
        this.dir.set(q.x - p.x, q.y - p.y, q.z - p.z);
        const len = this.dir.length();
        if (len < 1e-4) continue;
        this.dir.divideScalar(len);
        this.dummy.position.set((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
        this.dummy.quaternion.setFromUnitVectors(this.up, this.dir);
        this.dummy.scale.set(1, len + 0.02, 1);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        this.mesh.setColorAt(n, this.color);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
