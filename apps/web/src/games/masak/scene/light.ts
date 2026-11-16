/**
 * The set's lights in one place: the view builds the real lights from them, and on weak devices
 * the fixed set (room, island, cookware) gets the same toon lighting baked into its vertex colours
 * once at load, so those pixels draw unlit (`MeshBasicMaterial`) at the same colour.
 */
import * as THREE from 'three';
import { TOON_LEVELS } from './kit';

export interface DirSpec {
  color: number;
  intensity: number;
  position: readonly [number, number, number];
  /** Where it points (three's default target is the origin). */
  target: readonly [number, number, number];
}

export const HEMI = { sky: 0xfff2e0, ground: 0x9a6a48, intensity: 1.55 } as const;
export const KEY: DirSpec = {
  color: 0xfff0dc,
  intensity: 2.1,
  position: [-1.3, 3.2, 2.3],
  target: [0.1, 0, -0.2],
};
export const FILL: DirSpec = {
  color: 0xd8ecff,
  intensity: 0.55,
  position: [2.2, 2.0, -0.6],
  target: [0, 0, 0],
};
export const RIM: DirSpec = {
  color: 0xffe2b8,
  intensity: 0.5,
  position: [0.5, 1.5, -2.5],
  target: [0, 0, 0],
};

export function directional(d: DirSpec): THREE.DirectionalLight {
  const l = new THREE.DirectionalLight(d.color, d.intensity);
  l.position.set(d.position[0], d.position[1], d.position[2]);
  l.target.position.set(d.target[0], d.target[1], d.target[2]);
  return l;
}

/** Light of one direction in linear RGB (colour x intensity) and its unit direction toward the light. */
interface Baked {
  r: number;
  g: number;
  b: number;
  dx: number;
  dy: number;
  dz: number;
}

const _c = new THREE.Color();

function bakedDir(d: DirSpec): Baked {
  _c.setHex(d.color).multiplyScalar(d.intensity);
  const v = new THREE.Vector3(
    d.position[0] - d.target[0],
    d.position[1] - d.target[1],
    d.position[2] - d.target[2],
  ).normalize();
  return { r: _c.r, g: _c.g, b: _c.b, dx: v.x, dy: v.y, dz: v.z };
}

/** The toon ramp lookup of three's `getGradientIrradiance` (nearest texel of a 4-texel map). */
export function toonBand(dotNL: number): number {
  const u = dotNL * 0.5 + 0.5;
  const i = Math.min(TOON_LEVELS.length - 1, Math.max(0, Math.floor(u * TOON_LEVELS.length)));
  return TOON_LEVELS[i]! / 255;
}

/**
 * Light every vertex the way `MeshToonMaterial` lights a pixel (hemisphere + directional lights
 * through the toon ramp, Lambert 1/pi), in place: `color` becomes the final linear colour. Exact on
 * flat faces; curved ones blend between bands instead of stepping.
 */
export function bakeToonLight(geo: THREE.BufferGeometry, dirs: readonly DirSpec[] = [KEY, FILL, RIM]): void {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  if (!pos || !nor || !col) return;
  const lights = dirs.map(bakedDir);
  const sky = new THREE.Color(HEMI.sky).multiplyScalar(HEMI.intensity);
  const ground = new THREE.Color(HEMI.ground).multiplyScalar(HEMI.intensity);
  const k = 1 / Math.PI;
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    // Hemisphere light from straight up.
    const w = 0.5 * ny + 0.5;
    let r = ground.r + (sky.r - ground.r) * w;
    let g = ground.g + (sky.g - ground.g) * w;
    let b = ground.b + (sky.b - ground.b) * w;
    for (const l of lights) {
      const band = toonBand(nx * l.dx + ny * l.dy + nz * l.dz);
      r += band * l.r;
      g += band * l.g;
      b += band * l.b;
    }
    col.setXYZ(i, col.getX(i) * r * k, col.getY(i) * g * k, col.getZ(i) * b * k);
  }
  col.needsUpdate = true;
}
