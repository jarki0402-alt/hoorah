/**
 * Soft blob shadows under the cookware, shown when the shadow map is off (weak devices) so pans,
 * plates and bowls still sit on the counter. One instanced quad per set: a radial alpha texture,
 * unlit, no depth writes.
 */
import * as THREE from 'three';
import { smooth } from './kit';

/** A blob: centre on the surface, radii, and how high the object's bulk sits above it. */
export interface Blob {
  x: number;
  /** Surface height. */
  y: number;
  z: number;
  rx: number;
  rz: number;
  /** Height of the object's middle: the blob slides away from the key light by this much. */
  h: number;
}

/** Key light direction projected on the floor per metre of height (light at -1.3, 3.2, 2.3). */
const SLIDE_X = 0.44;
const SLIDE_Z = -0.78;
/** Warm dark brown, like the toon shadow side of the wood. */
const TINT = 0x4a2412;
const OPACITY = 0.45;
const LIFT = 0.0015;
/** Blobs reach past the footprint so a soft rim shows around the object. */
const SPREAD = 1.3;

let texture: THREE.DataTexture | null = null;
let material: THREE.MeshBasicMaterial | null = null;
let quad: THREE.BufferGeometry | null = null;

function blobTexture(): THREE.DataTexture {
  if (texture) return texture;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = ((i + 0.5) / n) * 2 - 1;
      const dy = ((j + 0.5) / n) * 2 - 1;
      const a = 1 - smooth(0.5, 1, Math.sqrt(dx * dx + dy * dy));
      const o = (j * n + i) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = Math.round(a * 255);
    }
  }
  texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function blobMaterial(): THREE.MeshBasicMaterial {
  material ??= new THREE.MeshBasicMaterial({
    color: TINT,
    map: blobTexture(),
    transparent: true,
    opacity: OPACITY,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  return material;
}

const _o = new THREE.Object3D();

/** All blobs of one set as a single draw call. */
export function blobShadows(blobs: readonly Blob[]): THREE.InstancedMesh {
  quad ??= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(quad, blobMaterial(), blobs.length);
  blobs.forEach((b, i) => {
    // The shadow runs from the footprint to where the top lands: centre and size follow the slide.
    _o.position.set(b.x + b.h * SLIDE_X, b.y + LIFT, b.z + b.h * SLIDE_Z);
    _o.scale.set(
      (b.rx * SPREAD + b.h * Math.abs(SLIDE_X)) * 2,
      1,
      (b.rz * SPREAD + b.h * Math.abs(SLIDE_Z)) * 2,
    );
    _o.updateMatrix();
    im.setMatrixAt(i, _o.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = false;
  im.receiveShadow = false;
  // Drawn after the opaque set, before the particles.
  im.renderOrder = 1;
  return im;
}
