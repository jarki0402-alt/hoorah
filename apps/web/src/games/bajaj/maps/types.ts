/** What every Bajaj Rush map (three circuits and the arena) hands to the renderer. */
import type * as THREE from 'three';

export type CircuitId = 'kota' | 'pantai' | 'puncak';
export type MapId = CircuitId | 'arena';
export const CIRCUITS: readonly CircuitId[] = ['kota', 'pantai', 'puncak'];

/** Time of day: sun, sky fill, fog. Each map has its own. */
export interface Mood {
  sunDir: THREE.Vector3;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
}

export interface MapScene {
  id: MapId;
  kind: 'circuit' | 'arena';
  root: THREE.Group;
  mood: Mood;
  /** Steam sources (food carts, stalls). */
  steam: THREE.Vector3[];
  /** Fountain jet origin, if the map has one. */
  fountain: THREE.Vector3 | null;
  /** Start light: 0 = off, 1 = red, 2 = yellow, 3 = green. */
  setLights(n: number): void;
  update(t: number, dt: number): void;
  /** Centre the sky dome, skyline and clouds on a camera before rendering its view. */
  followSky(x: number, z: number): void;
}
