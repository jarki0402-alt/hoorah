/**
 * A small binary glTF 2.0 (.glb) writer for authored meshes: indexed triangles with compact
 * attributes (KHR_mesh_quantization: 16-bit positions with the scale on the node or folded into
 * the inverse bind matrices, 8- or 16-bit normals, 8-bit colours), a custom `_SURF` attribute (roughness,
 * metalness, emission, baked occlusion), optional UVs, skins and keyframe animations.
 * three.js' GLTFLoader reads all of it without extra decoders.
 */
import type { Mesh, Vec3 } from './mesh';

const BYTE = 5120;
const UNSIGNED_BYTE = 5121;
const SHORT = 5122;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const FLOAT = 5126;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

type Json = Record<string, unknown>;

export interface MaterialDef {
  name: string;
  color?: [number, number, number, number];
  rough?: number;
  metal?: number;
  emissive?: [number, number, number];
  doubleSided?: boolean;
}

export interface PrimitiveDef {
  mesh: Mesh;
  material: number;
}

export interface MeshOptions {
  /** 16-bit positions with the dequantisation on the node (not for skinned meshes). */
  quantize?: boolean;
  /**
   * 16-bit positions in a fixed box: (p - center) / extent. For skinned meshes, fold the same
   * transform into the inverse bind matrices (`dequantizeMatrix`).
   */
  box?: { center: Vec3; extent: number };
  /** 16-bit normals (smooth organic surfaces seen up close). */
  hiPrecision?: boolean;
}

/** Matrix that maps 16-bit normalised positions written with `box` back to model space. */
export function dequantizeMatrix(box: { center: Vec3; extent: number }): number[] {
  const e = box.extent;
  const c = box.center;
  // Column-major 4x4: scale by e, then translate by c.
  return [e, 0, 0, 0, 0, e, 0, 0, 0, 0, e, 0, c[0], c[1], c[2], 1];
}

export interface NodeDef {
  name: string;
  mesh?: number;
  skin?: number;
  children?: number[];
  translation?: Vec3;
  rotation?: [number, number, number, number];
  scale?: Vec3;
  extras?: Json;
}

export interface Channel {
  node: number;
  path: 'translation' | 'rotation' | 'scale';
  times: Float32Array;
  values: Float32Array;
}

export interface MeshRef {
  mesh: number;
  translation?: Vec3;
  scale?: Vec3;
}

export class Glb {
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;
  private readonly bufferViews: Json[] = [];
  private readonly accessors: Json[] = [];
  private readonly meshes: Json[] = [];
  private readonly materials: Json[] = [];
  private readonly nodes: Json[] = [];
  private readonly skins: Json[] = [];
  private readonly animations: Json[] = [];
  private sceneNodes: number[] = [];
  private readonly timeCache = new Map<Float32Array, number>();

  private view(bytes: Uint8Array, target?: number, stride?: number): number {
    const pad = (4 - (this.byteLength % 4)) % 4;
    if (pad) {
      this.chunks.push(new Uint8Array(pad));
      this.byteLength += pad;
    }
    const v: Json = { buffer: 0, byteOffset: this.byteLength, byteLength: bytes.byteLength };
    if (target) v.target = target;
    if (stride) v.byteStride = stride;
    this.chunks.push(bytes);
    this.byteLength += bytes.byteLength;
    this.bufferViews.push(v);
    return this.bufferViews.length - 1;
  }

  private accessor(
    bytes: Uint8Array,
    componentType: number,
    type: string,
    count: number,
    opts: { normalized?: boolean; min?: number[]; max?: number[]; target?: number; stride?: number } = {},
  ): number {
    const a: Json = {
      bufferView: this.view(bytes, opts.target, opts.stride),
      componentType,
      count,
      type,
    };
    if (opts.normalized) a.normalized = true;
    if (opts.min) a.min = opts.min;
    if (opts.max) a.max = opts.max;
    this.accessors.push(a);
    return this.accessors.length - 1;
  }

  addMaterial(def: MaterialDef): number {
    const m: Json = {
      name: def.name,
      pbrMetallicRoughness: {
        baseColorFactor: def.color ?? [1, 1, 1, 1],
        metallicFactor: def.metal ?? 0,
        roughnessFactor: def.rough ?? 0.7,
      },
    };
    if (def.emissive) m.emissiveFactor = def.emissive;
    if (def.doubleSided) m.doubleSided = true;
    this.materials.push(m);
    return this.materials.length - 1;
  }

  /** Add a mesh; returns its index and the node transform that dequantises it (if any). */
  addMesh(name: string, prims: PrimitiveDef[], opts: MeshOptions = {}): MeshRef {
    let center: Vec3 = opts.box ? opts.box.center : [0, 0, 0];
    let extent = opts.box ? opts.box.extent : 1;
    if (opts.quantize && !opts.box) {
      const min: Vec3 = [Infinity, Infinity, Infinity];
      const max: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (const p of prims) {
        const b = p.mesh.bounds();
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k]!, b.min[k]!);
          max[k] = Math.max(max[k]!, b.max[k]!);
        }
      }
      center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
      extent = Math.max((max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2, 1e-6);
    }
    const primitives = prims.map((p) => this.primitive(p, opts, center, extent));
    this.meshes.push({ name, primitives });
    const ref: MeshRef = { mesh: this.meshes.length - 1 };
    if (opts.quantize && !opts.box) {
      ref.translation = center;
      ref.scale = [extent, extent, extent];
    }
    return ref;
  }

  private primitive(p: PrimitiveDef, opts: MeshOptions, center: Vec3, extent: number): Json {
    const m = p.mesh;
    const n = m.vertexCount;
    const attributes: Json = {};
    // Position
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    if (opts.quantize || opts.box) {
      const arr = new Int16Array(n * 4);
      for (let i = 0; i < n; i++)
        for (let k = 0; k < 3; k++) {
          const q = Math.round(((m.pos[i * 3 + k]! - center[k]!) / extent) * 32767);
          const c = Math.max(-32767, Math.min(32767, q));
          arr[i * 4 + k] = c;
          min[k] = Math.min(min[k]!, c / 32767);
          max[k] = Math.max(max[k]!, c / 32767);
        }
      attributes.POSITION = this.accessor(new Uint8Array(arr.buffer), SHORT, 'VEC3', n, {
        normalized: true,
        min,
        max,
        target: ARRAY_BUFFER,
        stride: 8,
      });
    } else {
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) {
        arr[i] = m.pos[i]!;
        const k = i % 3;
        min[k] = Math.min(min[k]!, arr[i]!);
        max[k] = Math.max(max[k]!, arr[i]!);
      }
      attributes.POSITION = this.accessor(new Uint8Array(arr.buffer), FLOAT, 'VEC3', n, {
        min,
        max,
        target: ARRAY_BUFFER,
      });
    }
    // Normal
    if (opts.hiPrecision) {
      const arr = new Int16Array(n * 4);
      for (let i = 0; i < n; i++)
        for (let k = 0; k < 3; k++) arr[i * 4 + k] = Math.round(m.nor[i * 3 + k]! * 32767);
      attributes.NORMAL = this.accessor(new Uint8Array(arr.buffer), SHORT, 'VEC3', n, {
        normalized: true,
        target: ARRAY_BUFFER,
        stride: 8,
      });
    } else {
      const arr = new Int8Array(n * 4);
      for (let i = 0; i < n; i++)
        for (let k = 0; k < 3; k++) arr[i * 4 + k] = Math.round(m.nor[i * 3 + k]! * 127);
      attributes.NORMAL = this.accessor(new Uint8Array(arr.buffer), BYTE, 'VEC3', n, {
        normalized: true,
        target: ARRAY_BUFFER,
        stride: 4,
      });
    }
    // Colour (linear, 8-bit)
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    {
      const arr = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++)
        for (let k = 0; k < 3; k++) arr[i * 4 + k] = Math.round(clamp01(m.col[i * 3 + k]!) * 255);
      attributes.COLOR_0 = this.accessor(arr, UNSIGNED_BYTE, 'VEC3', n, {
        normalized: true,
        target: ARRAY_BUFFER,
        stride: 4,
      });
    }
    // Surface: roughness, metalness, emission, occlusion
    {
      const arr = new Uint8Array(n * 4);
      for (let i = 0; i < n * 4; i++) arr[i] = Math.round(clamp01(m.surf[i]!) * 255);
      attributes._SURF = this.accessor(arr, UNSIGNED_BYTE, 'VEC4', n, {
        normalized: true,
        target: ARRAY_BUFFER,
      });
    }
    if (m.hasUv) {
      const arr = new Float32Array(n * 2);
      for (let i = 0; i < n * 2; i++) arr[i] = m.uv[i]!;
      attributes.TEXCOORD_0 = this.accessor(new Uint8Array(arr.buffer), FLOAT, 'VEC2', n, {
        target: ARRAY_BUFFER,
      });
    }
    if (m.joints && m.weights) {
      const j = new Uint8Array(n * 4);
      const w = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += m.weights[i * 4 + k]!;
        let total = 0;
        let big = 0;
        for (let k = 0; k < 4; k++) {
          j[i * 4 + k] = m.joints[i * 4 + k]!;
          const q = Math.round((m.weights[i * 4 + k]! / (sum || 1)) * 255);
          w[i * 4 + k] = q;
          total += q;
          if (q > w[i * 4 + big]!) big = k;
        }
        w[i * 4 + big] = w[i * 4 + big]! + (255 - total);
      }
      attributes.JOINTS_0 = this.accessor(j, UNSIGNED_BYTE, 'VEC4', n, { target: ARRAY_BUFFER });
      attributes.WEIGHTS_0 = this.accessor(w, UNSIGNED_BYTE, 'VEC4', n, {
        normalized: true,
        target: ARRAY_BUFFER,
      });
    }
    const big = n > 65535;
    const idx = big ? Uint32Array.from(m.idx) : Uint16Array.from(m.idx);
    const indices = this.accessor(
      new Uint8Array(idx.buffer, 0, idx.byteLength),
      big ? UNSIGNED_INT : UNSIGNED_SHORT,
      'SCALAR',
      m.idx.length,
      {
        target: ELEMENT_ARRAY_BUFFER,
      },
    );
    return { attributes, indices, material: p.material, mode: 4 };
  }

  addNode(def: NodeDef): number {
    const n: Json = { name: def.name };
    if (def.mesh !== undefined) n.mesh = def.mesh;
    if (def.skin !== undefined) n.skin = def.skin;
    if (def.children && def.children.length > 0) n.children = def.children;
    if (def.translation) n.translation = def.translation;
    if (def.rotation) n.rotation = def.rotation;
    if (def.scale) n.scale = def.scale;
    if (def.extras) n.extras = def.extras;
    this.nodes.push(n);
    return this.nodes.length - 1;
  }

  /** Attach children to a node created earlier. */
  setChildren(node: number, children: number[]): void {
    this.nodes[node]!.children = children;
  }

  addSkin(name: string, joints: number[], inverseBind: Float32Array, skeleton?: number): number {
    const ibm = this.accessor(new Uint8Array(inverseBind.buffer.slice(0)), FLOAT, 'MAT4', joints.length);
    const s: Json = { name, joints, inverseBindMatrices: ibm };
    if (skeleton !== undefined) s.skeleton = skeleton;
    this.skins.push(s);
    return this.skins.length - 1;
  }

  addAnimation(name: string, channels: Channel[]): number {
    const samplers: Json[] = [];
    const out: Json[] = [];
    for (const c of channels) {
      let input = this.timeCache.get(c.times);
      if (input === undefined) {
        let mn = Infinity;
        let mx = -Infinity;
        for (const t of c.times) {
          mn = Math.min(mn, t);
          mx = Math.max(mx, t);
        }
        input = this.accessor(new Uint8Array(c.times.buffer.slice(0)), FLOAT, 'SCALAR', c.times.length, {
          min: [mn],
          max: [mx],
        });
        this.timeCache.set(c.times, input);
      }
      const type = c.path === 'rotation' ? 'VEC4' : 'VEC3';
      const comps = c.path === 'rotation' ? 4 : 3;
      const output = this.accessor(
        new Uint8Array(c.values.buffer.slice(0)),
        FLOAT,
        type,
        c.values.length / comps,
      );
      samplers.push({ input, output, interpolation: 'LINEAR' });
      out.push({ sampler: samplers.length - 1, target: { node: c.node, path: c.path } });
    }
    this.animations.push({ name, samplers, channels: out });
    return this.animations.length - 1;
  }

  setScene(nodes: number[]): void {
    this.sceneNodes = nodes;
  }

  toBuffer(): Uint8Array {
    const json: Json = {
      asset: { version: '2.0', generator: 'Hoorah tools/assets' },
      extensionsUsed: ['KHR_mesh_quantization'],
      extensionsRequired: ['KHR_mesh_quantization'],
      scene: 0,
      scenes: [{ nodes: this.sceneNodes }],
      nodes: this.nodes,
      buffers: [{ byteLength: this.byteLength }],
      bufferViews: this.bufferViews,
      accessors: this.accessors,
    };
    if (this.meshes.length) json.meshes = this.meshes;
    if (this.materials.length) json.materials = this.materials;
    if (this.skins.length) json.skins = this.skins;
    if (this.animations.length) json.animations = this.animations;
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    const binPad = (4 - (this.byteLength % 4)) % 4;
    const jsonLen = jsonBytes.length + jsonPad;
    const binLen = this.byteLength + binPad;
    const total = 12 + 8 + jsonLen + 8 + binLen;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jsonLen, true);
    dv.setUint32(16, 0x4e4f534a, true);
    out.set(jsonBytes, 20);
    for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20;
    let o = 20 + jsonLen;
    dv.setUint32(o, binLen, true);
    dv.setUint32(o + 4, 0x004e4942, true);
    o += 8;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.byteLength;
    }
    return out;
  }
}

/** Read the JSON chunk of a .glb (tests and reports). */
export function readGlbJson(bytes: Uint8Array): Json {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))) as Json;
}
