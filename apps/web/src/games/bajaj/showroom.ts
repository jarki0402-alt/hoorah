/**
 * Garage on the start line: every player's bajaj on its own turntable, rebuilt live when they pick
 * another colour, with a slow camera dolly along the row. Shown while players choose colours.
 */
import type { Fruit } from '@hoorah/protocol';
import * as THREE from 'three';
import type { KartModel } from './kart3d';
import type { MapScene } from './maps/types';
import { fovFor, type RaceRenderer, type SceneContent, type Viewport } from './scene';

export interface ShowroomKart {
  key: number;
  color: string;
  fruit: Fruit;
}

interface Slot {
  key: number;
  color: string;
  fruit: Fruit;
  model: KartModel;
  table: THREE.Mesh;
  rim: THREE.Mesh;
  spin: number;
}

export interface ShowroomTag {
  key: number;
  x: number;
  y: number;
}

export class Showroom implements SceneContent {
  private slots: Slot[] = [];
  private readonly group = new THREE.Group();
  private readonly cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 520);
  private readonly tableGeo = new THREE.CylinderGeometry(1.95, 2.1, 0.22, 40);
  private readonly rimGeo = new THREE.TorusGeometry(2.0, 0.07, 6, 48);
  private readonly tableMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d6 });
  private time = 0;
  private readonly tmp = new THREE.Vector3();

  /** `anchor`: centre of the line-up, facing (sin h, cos h) towards the camera side. */
  constructor(
    private readonly core: RaceRenderer,
    readonly map: MapScene,
    readonly anchor: { x: number; y: number; z: number; h: number },
  ) {
    this.group.position.set(anchor.x, anchor.y, anchor.z);
    this.group.rotation.y = anchor.h;
    core.scene.add(this.group);
  }

  /** Sync the line-up with the players' current picks. */
  setKarts(list: readonly ShowroomKart[]): void {
    const keep: Slot[] = [];
    for (const item of list) {
      let slot = this.slots.find((s) => s.key === item.key);
      if (slot && (slot.color !== item.color || slot.fruit !== item.fruit)) {
        this.group.remove(slot.model.root);
        slot.model = this.core.makeKart(item.color, item.fruit, item.key);
        slot.color = item.color;
        slot.fruit = item.fruit;
        (slot.rim.material as THREE.MeshBasicMaterial).color.set(item.color);
        this.group.add(slot.model.root);
      }
      if (!slot) {
        const model = this.core.makeKart(item.color, item.fruit, item.key);
        const table = new THREE.Mesh(this.tableGeo, this.tableMat);
        const rim = new THREE.Mesh(this.rimGeo, new THREE.MeshBasicMaterial({ color: item.color }));
        rim.rotation.x = Math.PI / 2;
        slot = {
          key: item.key,
          color: item.color,
          fruit: item.fruit,
          model,
          table,
          rim,
          spin: item.key * 0.9,
        };
        this.group.add(model.root, table, rim);
      }
      keep.push(slot);
    }
    for (const s of this.slots) {
      if (keep.includes(s)) continue;
      this.group.remove(s.model.root, s.table, s.rim);
    }
    this.slots = keep;
    // Lay out: one or two rows across the road, centred.
    const n = this.slots.length;
    const perRow = n > 4 ? Math.ceil(n / 2) : n;
    this.slots.forEach((s, i) => {
      const row = Math.floor(i / perRow);
      const inRow = row === 0 ? Math.min(perRow, n) : n - perRow;
      const col = i % perRow;
      const x = (col - (inRow - 1) / 2) * 4.6;
      const z = -row * 6;
      s.table.position.set(x, 0.11, z);
      s.rim.position.set(x, 0.2, z);
      s.model.root.position.set(x, 0.22, z);
    });
  }

  update(_alpha: number, dt: number, time: number): void {
    this.time = time;
    for (const s of this.slots) {
      s.spin += dt * 0.45;
      s.model.root.rotation.y = s.spin;
      s.model.pose({
        steer: Math.sin(time + s.key) * 0.4,
        slide: 0,
        hop: 0,
        roll: 0,
        pitch: 0,
        spinYaw: 0,
        travel: 0,
        wobble: 0,
        shield: false,
        t: time * 1000,
      });
    }
    this.map.setLights(0);
  }

  camera(_vi: number, vp: Viewport): THREE.PerspectiveCamera {
    this.group.updateMatrixWorld();
    const n = Math.max(1, this.slots.length);
    const width = Math.min(4, n) * 4.6;
    const dist = 7 + width * 0.75 + (n > 4 ? 3 : 0);
    const sway = Math.sin(this.time * 0.25) * 0.35;
    const c = this.cam;
    c.aspect = vp.w / vp.h;
    c.fov = fovFor(c.aspect, 62);
    // Camera in front of the row (local +z), a little above.
    const lx = Math.sin(sway) * dist;
    const lz = Math.cos(sway) * dist;
    this.tmp.set(lx, 3.2 + (n > 4 ? 1.5 : 0), lz).applyMatrix4(this.group.matrixWorld);
    c.position.copy(this.tmp);
    this.tmp.set(0, 0.9, n > 4 ? -2.5 : 0).applyMatrix4(this.group.matrixWorld);
    c.updateProjectionMatrix();
    c.lookAt(this.tmp);
    return c;
  }

  /** Screen positions (stage px) for the name plates above each bajaj. */
  tags(vp: Viewport): ShowroomTag[] {
    this.group.updateMatrixWorld();
    return this.slots.map((s) => {
      const p = this.tmp
        .set(s.model.root.position.x, 2.6, s.model.root.position.z)
        .applyMatrix4(this.group.matrixWorld)
        .project(this.cam);
      return { key: s.key, x: vp.x + ((p.x + 1) / 2) * vp.w, y: vp.y + ((1 - p.y) / 2) * vp.h };
    });
  }

  dispose(): void {
    this.core.scene.remove(this.group);
  }
}
