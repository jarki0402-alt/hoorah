/**
 * Loads the Lari Terus model packs (GLB files authored by tools/assets/lari) on the main screen
 * and turns them into ready-to-instance geometry: node transforms (16-bit position
 * dequantisation) are baked in, interleaved attributes are unpacked, and the per-vertex surface
 * attribute `_surf` (roughness, metalness, emission, baked occlusion) becomes `aSurf`.
 *
 * Runners keep their skeleton and clips; everything else is a map of named parts.
 */
import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LARI_PACKS } from './asset-manifest';

/** One primitive of a named model: geometry plus the glTF material name it was authored with. */
export interface Part {
  geometry: THREE.BufferGeometry;
  material: string;
}

export interface RunnerKit {
  /** Template skeleton root (cloned per runner). */
  root: THREE.Bone;
  /** Bone names in skin order. */
  boneNames: string[];
  boneInverses: THREE.Matrix4[];
  /** `runner_<fruit>_<lod>` -> [base, tint] geometries. */
  meshes: Map<string, THREE.BufferGeometry[]>;
  clips: Map<string, THREE.AnimationClip>;
}

export interface LariAssets {
  runners: RunnerKit;
  /** Obstacles, coin, rooftop clutter, building modules, clouds: name -> parts. */
  models: Map<string, Part[]>;
}

/** Plain, non-interleaved copy of an attribute (optionally converted to float). */
function plain(
  a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  float: boolean,
): THREE.BufferAttribute {
  const n = a.count;
  const size = a.itemSize;
  if (float) {
    const out = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = a.getComponent(i, k);
    return new THREE.BufferAttribute(out, size);
  }
  const src = (a instanceof THREE.InterleavedBufferAttribute ? a.data.array : a.array) as THREE.TypedArray;
  const Ctor = src.constructor as new (len: number) => THREE.TypedArray;
  const out = new Ctor(n * size);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < size; k++) {
      // getComponent denormalises; read raw values from the source instead.
      const raw =
        a instanceof THREE.InterleavedBufferAttribute
          ? src[i * a.data.stride + a.offset + k]!
          : src[i * size + k]!;
      out[i * size + k] = raw;
    }
  return new THREE.BufferAttribute(out, size, a.normalized);
}

/** Geometry in the model's own space, attributes unpacked, `aSurf` named for our shaders. */
function bake(src: THREE.BufferGeometry, matrix: THREE.Matrix4 | null): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const a = attr as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const float = name === 'position' || name === 'normal' || name === 'uv';
    const out = plain(a, float);
    g.setAttribute(name === '_surf' ? 'aSurf' : name, out);
  }
  const index = src.getIndex();
  if (index) g.setIndex(new THREE.BufferAttribute((index.array as THREE.TypedArray).slice(), 1));
  if (matrix) g.applyMatrix4(matrix);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function collectModels(gltf: GLTF, into: Map<string, Part[]>): void {
  gltf.scene.updateMatrixWorld(true);
  for (const node of gltf.scene.children) {
    const parts: Part[] = [];
    node.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      parts.push({ geometry: bake(o.geometry, o.matrixWorld), material: (mat as THREE.Material).name });
    });
    if (parts.length) into.set(node.name, parts);
  }
}

function collectRunners(gltf: GLTF): RunnerKit {
  let skinned: THREE.SkinnedMesh | null = null;
  const meshes = new Map<string, THREE.BufferGeometry[]>();
  for (const node of gltf.scene.children) {
    const list: THREE.BufferGeometry[] = [];
    node.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        skinned ??= o;
        list.push(bake(o.geometry, null));
      }
    });
    if (list.length) meshes.set(node.name, list);
  }
  const first = skinned as THREE.SkinnedMesh | null;
  if (!first) throw new Error('runners pack has no skinned mesh');
  const skeleton = first.skeleton;
  const root = skeleton.bones[0]!;
  return {
    root,
    boneNames: skeleton.bones.map((b) => b.name),
    boneInverses: skeleton.boneInverses.map((m) => m.clone()),
    meshes,
    clips: new Map(gltf.animations.map((c) => [c.name, c])),
  };
}

let pending: Promise<LariAssets> | null = null;

/**
 * Fetch and prepare every pack once (later calls share the same promise). `onProgress` gets
 * 0..1 as bytes arrive.
 */
export function loadLariAssets(onProgress?: (k: number) => void): Promise<LariAssets> {
  if (pending) return pending;
  const loader = new GLTFLoader();
  const urls = [LARI_PACKS.runners, LARI_PACKS.props, LARI_PACKS.city];
  const loaded = new Array<number>(urls.length).fill(0);
  const total = new Array<number>(urls.length).fill(0);
  const report = () => {
    const t = total.reduce((s, v) => s + v, 0);
    if (t > 0) onProgress?.(loaded.reduce((s, v) => s + v, 0) / t);
  };
  pending = Promise.all(
    urls.map((url, i) =>
      loader.loadAsync(url, (e) => {
        loaded[i] = e.loaded;
        total[i] = e.total || e.loaded;
        report();
      }),
    ),
  ).then(([runners, props, city]) => {
    const models = new Map<string, Part[]>();
    collectModels(props!, models);
    collectModels(city!, models);
    onProgress?.(1);
    return { runners: collectRunners(runners!), models };
  });
  return pending;
}

/** Parts of a model, or an error naming it (a pack built from an older workshop). */
export function model(a: LariAssets, name: string): Part[] {
  const p = a.models.get(name);
  if (!p) throw new Error(`Lari model missing: ${name}`);
  return p;
}
