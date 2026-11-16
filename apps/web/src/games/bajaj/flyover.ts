/**
 * Circuit preview: a camera gliding along the highlighted circuit (or circling the arena) behind
 * the menus on the main screen.
 */
import * as THREE from 'three';
import type { Arena } from './arena';
import type { MapScene } from './maps/types';
import { fovFor, type SceneContent, type Viewport } from './scene';
import type { Track } from './track';

export class Flyover implements SceneContent {
  private readonly cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 520);
  private s = 0;
  private time = 0;
  private ready = false;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    readonly map: MapScene,
    private readonly track: Track | null,
    private readonly arena: Arena | null,
    /** Start somewhere scenic (arc length), metres per second along the loop. */
    startS = 0,
    private readonly speed = 26,
  ) {
    this.s = startS;
  }

  update(_alpha: number, dt: number, time: number): void {
    this.time = time;
    this.s += this.speed * dt;
    this.map.setLights(3);
  }

  camera(_vi: number, vp: Viewport, dt: number): THREE.PerspectiveCamera {
    const c = this.cam;
    c.aspect = vp.w / vp.h;
    c.fov = fovFor(c.aspect, 70);
    if (this.track) {
      const T = this.track;
      const side = Math.sin(this.time * 0.13) * 9;
      const p = T.point(this.s, side);
      const ahead = T.point(this.s + 38, 0);
      this.tmp.set(p.x, p.y + 11 + Math.sin(this.time * 0.21) * 3, p.z);
      if (!this.ready) this.pos.copy(this.tmp);
      else this.pos.lerp(this.tmp, Math.min(1, dt * 2));
      this.tmp.set(ahead.x, ahead.y + 2, ahead.z);
      if (!this.ready) this.look.copy(this.tmp);
      else this.look.lerp(this.tmp, Math.min(1, dt * 2));
    } else if (this.arena) {
      const a = this.time * 0.12;
      this.pos.set(Math.sin(a) * 62, 34, Math.cos(a) * 52);
      this.look.set(0, 0, 0);
    }
    this.ready = true;
    c.position.copy(this.pos);
    c.updateProjectionMatrix();
    c.lookAt(this.look);
    return c;
  }

  dispose(): void {}
}
