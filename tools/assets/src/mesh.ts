/**
 * The authoring mesh: indexed triangles with per-vertex position, normal, linear colour, surface
 * (roughness, metalness, emission, baked ambient occlusion), optional UVs and optional skin.
 * Generators in shapes.ts / sdf.ts produce these; gltf.ts writes them out.
 */
import * as THREE from 'three';
import type { RGB } from './color';

/** How a part looks: linear colour plus PBR finish. `emit` 0..1 is a self-lit glow. */
export interface Paint {
  readonly color: RGB;
  readonly rough: number;
  readonly metal: number;
  readonly emit: number;
}

export function paint(color: RGB, rough = 0.7, metal = 0, emit = 0): Paint {
  return { color, rough, metal, emit };
}

export type Vec3 = [number, number, number];

/** Push without spreading (spreads overflow the stack on big meshes). */
export function pushAll(dst: number[], src: readonly number[]): void {
  for (let i = 0; i < src.length; i++) dst.push(src[i]!);
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class Mesh {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  /** roughness, metalness, emission, ambient occlusion (1 = open) per vertex. */
  readonly surf: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];
  hasUv = false;
  /** Four joint indices and weights per vertex (skinned meshes only). */
  joints: number[] | null = null;
  weights: number[] | null = null;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  vertex(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    p: Paint,
    u = 0,
    v = 0,
  ): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    const l = Math.hypot(nx, ny, nz) || 1;
    this.nor.push(nx / l, ny / l, nz / l);
    this.col.push(p.color[0], p.color[1], p.color[2]);
    this.surf.push(p.rough, p.metal, p.emit, 1);
    this.uv.push(u, v);
    if (this.joints && this.weights) {
      this.joints.push(0, 0, 0, 0);
      this.weights.push(1, 0, 0, 0);
    }
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Append `o` (optionally transformed by `m`). */
  append(o: Mesh, m?: THREE.Matrix4): this {
    const base = this.vertexCount;
    const flip = m ? m.determinant() < 0 : false;
    if (m) _nm.getNormalMatrix(m);
    for (let i = 0; i < o.vertexCount; i++) {
      _v.set(o.pos[i * 3]!, o.pos[i * 3 + 1]!, o.pos[i * 3 + 2]!);
      _n.set(o.nor[i * 3]!, o.nor[i * 3 + 1]!, o.nor[i * 3 + 2]!);
      if (m) {
        _v.applyMatrix4(m);
        _n.applyMatrix3(_nm).normalize();
      }
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
    }
    for (const v of o.col) this.col.push(v);
    for (const v of o.surf) this.surf.push(v);
    for (const v of o.uv) this.uv.push(v);
    this.hasUv = this.hasUv || o.hasUv;
    if (this.joints || o.joints) {
      if (!this.joints || !this.weights) {
        this.joints = [];
        this.weights = [];
        for (let i = 0; i < base; i++) {
          this.joints.push(0, 0, 0, 0);
          this.weights.push(1, 0, 0, 0);
        }
      }
      for (let i = 0; i < o.vertexCount; i++) {
        if (o.joints && o.weights) {
          for (let k = 0; k < 4; k++) {
            this.joints.push(o.joints[i * 4 + k]!);
            this.weights.push(o.weights[i * 4 + k]!);
          }
        } else {
          this.joints.push(0, 0, 0, 0);
          this.weights.push(1, 0, 0, 0);
        }
      }
    }
    for (let t = 0; t < o.idx.length; t += 3) {
      const a = o.idx[t]! + base;
      const b = o.idx[t + 1]! + base;
      const c = o.idx[t + 2]! + base;
      if (flip) this.idx.push(a, c, b);
      else this.idx.push(a, b, c);
    }
    return this;
  }

  /** Transform in place. */
  transform(m: THREE.Matrix4): this {
    const copy = this.clone();
    this.pos.length = 0;
    this.nor.length = 0;
    this.col.length = 0;
    this.surf.length = 0;
    this.uv.length = 0;
    this.idx.length = 0;
    this.joints = null;
    this.weights = null;
    return this.append(copy, m);
  }

  clone(): Mesh {
    const c = new Mesh();
    pushAll(c.pos, this.pos);
    pushAll(c.nor, this.nor);
    pushAll(c.col, this.col);
    pushAll(c.surf, this.surf);
    pushAll(c.uv, this.uv);
    pushAll(c.idx, this.idx);
    c.hasUv = this.hasUv;
    if (this.joints && this.weights) {
      c.joints = this.joints.slice();
      c.weights = this.weights.slice();
    }
    return c;
  }

  /** Recolour every vertex with `fn` (return null to keep a vertex as it is). */
  repaint(fn: (x: number, y: number, z: number, i: number) => Paint | null): this {
    for (let i = 0; i < this.vertexCount; i++) {
      const p = fn(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!, i);
      if (!p) continue;
      this.col[i * 3] = p.color[0];
      this.col[i * 3 + 1] = p.color[1];
      this.col[i * 3 + 2] = p.color[2];
      this.surf[i * 4] = p.rough;
      this.surf[i * 4 + 1] = p.metal;
      this.surf[i * 4 + 2] = p.emit;
    }
    return this;
  }

  /** Give every vertex one bone with full weight. */
  bindRigid(joint: number): this {
    this.joints = [];
    this.weights = [];
    for (let i = 0; i < this.vertexCount; i++) {
      this.joints.push(joint, 0, 0, 0);
      this.weights.push(1, 0, 0, 0);
    }
    return this;
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = this.pos[i + k]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
    }
    return { min, max };
  }

  /** Copy a three.js geometry (indexed or not) with one paint. */
  static fromGeometry(g: THREE.BufferGeometry, p: Paint): Mesh {
    const m = new Mesh();
    const P = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const N = g.getAttribute('normal');
    const UV = g.getAttribute('uv');
    for (let i = 0; i < P.count; i++) {
      m.vertex(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), p, UV?.getX(i), UV?.getY(i));
    }
    const I = g.getIndex();
    if (I) for (let i = 0; i < I.count; i++) m.idx.push(I.getX(i));
    else for (let i = 0; i < P.count; i++) m.idx.push(i);
    return m;
  }
}

/** Merge several meshes into one. */
export function merge(...parts: Mesh[]): Mesh {
  const out = new Mesh();
  for (const p of parts) out.append(p);
  return out;
}

/** Translation-rotation-scale matrix (Euler XYZ in radians). */
export function trs(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/** Rotation taking +y to direction `d`, placed at `at`. */
export function alongY(at: Vec3, d: Vec3, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  const dir = new THREE.Vector3(...d).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(sx, sy, sz));
}
