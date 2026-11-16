/**
 * Skeletons and keyframe clips for skinned characters. Bones are joints in the bind pose (no
 * rest rotation, so poses read as plain Euler angles); clips are functions of time sampled into
 * glTF tracks. Skin weights come from labelled distance fields: every vertex leans towards the
 * bones whose parts it is closest to, so joints bend softly where shapes blend.
 */
import * as THREE from 'three';
import type { Channel, Glb } from './gltf';
import type { Mesh, Vec3 } from './mesh';
import type { Sdf } from './sdf';

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Joint position in the bind pose (model space). */
  head: Vec3;
}

export interface BonePose {
  /** Euler XYZ rotation (radians). */
  r?: Vec3;
  /** Offset added to the bone's rest position. */
  t?: Vec3;
  s?: Vec3;
}

export type Pose = Partial<Record<string, BonePose>>;

export interface ClipDef {
  name: string;
  duration: number;
  pose: (t: number) => Pose;
}

export class Rig {
  private readonly byName = new Map<string, number>();

  constructor(readonly bones: readonly BoneDef[]) {
    bones.forEach((b, i) => {
      this.byName.set(b.name, i);
    });
  }

  index(name: string): number {
    const i = this.byName.get(name);
    if (i === undefined) throw new Error(`unknown bone ${name}`);
    return i;
  }

  rest(i: number): Vec3 {
    const b = this.bones[i]!;
    const p = b.parent ? this.bones[this.index(b.parent)]!.head : ([0, 0, 0] as Vec3);
    return [b.head[0] - p[0], b.head[1] - p[1], b.head[2] - p[2]];
  }

  /**
   * Write the bone nodes and the skin; returns node indices (bone order) and the skin index.
   * `post` (column-major) is appended to every inverse bind matrix (position dequantisation).
   */
  write(glb: Glb, post?: readonly number[]): { nodes: number[]; root: number; skin: number } {
    const nodes = this.bones.map((b, i) => glb.addNode({ name: b.name, translation: this.rest(i) }));
    this.bones.forEach((b, i) => {
      const kids = this.bones.map((c, j) => (c.parent === b.name ? nodes[j]! : -1)).filter((j) => j >= 0);
      if (kids.length) glb.setChildren(nodes[i]!, kids);
    });
    const ibm = new Float32Array(this.bones.length * 16);
    const m = new THREE.Matrix4();
    const q = post ? new THREE.Matrix4().fromArray(post) : null;
    this.bones.forEach((b, i) => {
      m.makeTranslation(-b.head[0], -b.head[1], -b.head[2]);
      if (q) m.multiply(q);
      ibm.set(m.elements, i * 16);
    });
    const root = nodes[0]!;
    const skin = glb.addSkin('runner', nodes, ibm, root);
    return { nodes, root, skin };
  }

  /** Sample a clip at `fps` into glTF channels for the given bone nodes. */
  sample(
    clip: ClipDef,
    nodes: readonly number[],
    fps = 30,
    moving: ReadonlySet<string> = new Set(),
  ): Channel[] {
    const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(frames);
    const rot = this.bones.map(() => new Float32Array(frames * 4));
    const pos = this.bones.map(() => new Float32Array(frames * 3));
    const scl = this.bones.map(() => new Float32Array(frames * 3));
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let f = 0; f < frames; f++) {
      const t = (f / (frames - 1)) * clip.duration;
      times[f] = t;
      const pose = clip.pose(t);
      this.bones.forEach((b, i) => {
        const bp = pose[b.name];
        const r = bp?.r ?? [0, 0, 0];
        q.setFromEuler(e.set(r[0], r[1], r[2], 'XYZ'));
        // Keep neighbouring keys in the same hemisphere so interpolation takes the short way.
        if (f > 0) {
          const o = (f - 1) * 4;
          const dot =
            rot[i]![o]! * q.x + rot[i]![o + 1]! * q.y + rot[i]![o + 2]! * q.z + rot[i]![o + 3]! * q.w;
          if (dot < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        }
        rot[i]!.set([q.x, q.y, q.z, q.w], f * 4);
        const rest = this.rest(i);
        const tt = bp?.t ?? [0, 0, 0];
        pos[i]!.set([rest[0] + tt[0], rest[1] + tt[1], rest[2] + tt[2]], f * 3);
        scl[i]!.set(bp?.s ?? [1, 1, 1], f * 3);
      });
    }
    const out: Channel[] = [];
    this.bones.forEach((b, i) => {
      out.push({ node: nodes[i]!, path: 'rotation', times, values: rot[i]! });
      if (moving.has(b.name)) {
        out.push({ node: nodes[i]!, path: 'translation', times, values: pos[i]! });
        out.push({ node: nodes[i]!, path: 'scale', times, values: scl[i]! });
      }
    });
    return out;
  }
}

export interface Part {
  bone: number;
  sdf: Sdf;
}

/**
 * Smooth skin weights: each vertex takes the bones of the labelled parts nearest to it, with a
 * soft falloff over `soft` metres, at most four bones.
 */
export function skinFromParts(m: Mesh, parts: readonly Part[], soft = 0.02): void {
  const joints: number[] = [];
  const weights: number[] = [];
  const best = new Map<number, number>();
  for (let i = 0; i < m.vertexCount; i++) {
    const x = m.pos[i * 3]!;
    const y = m.pos[i * 3 + 1]!;
    const z = m.pos[i * 3 + 2]!;
    best.clear();
    let dmin = Number.POSITIVE_INFINITY;
    const ds = parts.map((p) => p.sdf(x, y, z));
    for (const d of ds) dmin = Math.min(dmin, d);
    parts.forEach((p, k) => {
      const w = Math.exp(-(ds[k]! - dmin) / soft);
      best.set(p.bone, Math.max(best.get(p.bone) ?? 0, w));
    });
    const list = [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((s, [, w]) => s + w, 0);
    for (let k = 0; k < 4; k++) {
      const e = list[k];
      joints.push(e ? e[0] : 0);
      weights.push(e ? e[1] / sum : 0);
    }
  }
  m.joints = joints;
  m.weights = weights;
}

/** Smoothstep easing between keyframes. */
export function ease(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

/** Blend two poses (missing values count as zero rotation / offset and unit scale). */
export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  const lerp3 = (p: Vec3 | undefined, q: Vec3 | undefined, base: number): Vec3 => {
    const u = p ?? [base, base, base];
    const v = q ?? [base, base, base];
    return [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
  };
  for (const n of names) {
    const pa = a[n];
    const pb = b[n];
    const bp: BonePose = { r: lerp3(pa?.r, pb?.r, 0) };
    if (pa?.t || pb?.t) bp.t = lerp3(pa?.t, pb?.t, 0);
    if (pa?.s || pb?.s) bp.s = lerp3(pa?.s, pb?.s, 1);
    out[n] = bp;
  }
  return out;
}
