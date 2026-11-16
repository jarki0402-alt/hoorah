/**
 * The runners: each player's fruit mascot from the runners pack (sculpted body, face, rubbery
 * limbs; sneakers, wristbands and headband in the player's colour), skinned to a shared
 * 16-bone skeleton and animated with the authored clips: run (tied to speed), jump (scrubbed by
 * vertical speed), slide, trip roll, knock-back, fall, climb, crouched start, idle and victory.
 * States cross-fade; a slight lean into lane changes is added on top.
 *
 * Model space: feet on y = 0, facing +z. The group is turned to face the run (world -z).
 */
import type { Fruit } from '@hoorah/protocol';
import * as THREE from 'three';
import type { RunnerKit } from './assets';
import { LARI_MAT } from './materials';

/** World scale of the character (authored about 1.3 m tall; shown a little larger to read well). */
export const RUNNER_SCALE = 1.12;
/** Height of the name tag anchor above the feet (world m). */
export const TAG_HEIGHT = 1.95;

export type PoseState = 'run' | 'air' | 'slide' | 'stumble' | 'fall' | 'climb' | 'ready' | 'cheer' | 'idle';

export interface PoseInput {
  state: PoseState;
  /** Forward speed (m/s), drives the stride. */
  speed: number;
  /** Vertical speed while airborne. */
  vy: number;
  /** 0..1 through the stumble (tumble / bounce). */
  t: number;
  /** What tripped them. */
  kind: 'low' | 'high' | 'block' | 'gap' | null;
  /** Lateral speed (m/s) for leaning into lane changes. */
  side: number;
  /** Blink while protected after a stumble. */
  blink: boolean;
}

/** Body lean into a lane change: at most this roll (rad), reached around `LEAN_SPEED` m/s sideways. */
const MAX_LEAN = 0.2;
const LEAN_SPEED = 8;
/** Vertical take-off speed (m/s) the jump clip is scrubbed against (rules: TUNING.jumpV). */
const JUMP_V = 6.6;
/** Length of the run clip at time scale 1 (one stride cycle). */
const RUN_CYCLE = 0.5;
const JUMP_LEN = 0.6;

type ClipName = 'idle' | 'ready' | 'run' | 'jump' | 'slide' | 'trip' | 'hit' | 'fall' | 'climb' | 'victory';

/** Which clip shows a state, and whether its time is driven by the rules instead of the clock. */
function clipFor(p: PoseInput): ClipName {
  switch (p.state) {
    case 'run':
      return 'run';
    case 'air':
      return 'jump';
    case 'slide':
      return 'slide';
    case 'stumble':
      return p.kind === 'low' ? 'trip' : 'hit';
    case 'fall':
      return 'fall';
    case 'climb':
      return 'climb';
    case 'ready':
      return 'ready';
    case 'cheer':
      return 'victory';
    default:
      return 'idle';
  }
}

const DRIVEN = new Set<ClipName>(['jump', 'trip', 'hit']);
const FADE: Partial<Record<ClipName, number>> = { jump: 0.08, slide: 0.08, trip: 0.06, hit: 0.06, run: 0.14 };

export class RunnerModel {
  readonly group = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly meshes: THREE.SkinnedMesh[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private current: ClipName | null = null;
  private roll = 0;
  private time = 0;

  constructor(
    readonly id: number,
    fruit: Fruit,
    readonly color: string,
    kit: RunnerKit,
    lod: 0 | 1,
    reflect: boolean,
  ) {
    const geos = kit.meshes.get(`runner_${fruit}_${lod}`) ?? kit.meshes.get(`runner_${fruit}_0`);
    if (!geos) throw new Error(`no runner model for ${fruit}`);
    const root = kit.root.clone(true);
    const byName = new Map<string, THREE.Bone>();
    root.traverse((o) => {
      if (o instanceof THREE.Bone) byName.set(o.name, o);
    });
    const bones = kit.boneNames.map((n) => {
      const b = byName.get(n);
      if (!b) throw new Error(`bone ${n} missing`);
      return b;
    });
    const skeleton = new THREE.Skeleton(bones, kit.boneInverses);
    this.pivot.add(root);
    const mats = [LARI_MAT.runner(null, reflect), LARI_MAT.runner(color, reflect)];
    geos.forEach((g, i) => {
      const mesh = new THREE.SkinnedMesh(g, mats[Math.min(i, 1)]!);
      mesh.frustumCulled = false;
      mesh.userData.kartPart = 'cast';
      mesh.bind(skeleton, new THREE.Matrix4());
      this.meshes.push(mesh);
      this.pivot.add(mesh);
    });
    this.materials.push(...mats);
    this.group.add(this.pivot);
    this.group.scale.setScalar(RUNNER_SCALE);
    this.group.rotation.y = Math.PI;
    this.mixer = new THREE.AnimationMixer(this.pivot);
    for (const [name, clip] of kit.clips) {
      const action = this.mixer.clipAction(clip);
      if (DRIVEN.has(name as ClipName)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.timeScale = 0;
      }
      this.actions.set(name as ClipName, action);
    }
    // Different runners start their cycles at different points.
    this.time = (id * 0.37) % 1;
  }

  private play(name: ClipName): void {
    if (this.current === name) return;
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset();
    if (!DRIVEN.has(name)) next.time = name === 'run' ? (this.time * RUN_CYCLE) % RUN_CYCLE : 0;
    next.play();
    const fade = this.current === null ? 0 : (FADE[name] ?? 0.16);
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  /** Pose for this frame; `dt` in seconds (0 keeps the pose). */
  animate(dt: number, p: PoseInput): void {
    this.time += dt;
    const name = clipFor(p);
    this.play(name);
    const action = this.actions.get(name);
    if (action) {
      if (name === 'run') action.timeScale = (1.3 + p.speed * 0.075) * RUN_CYCLE;
      else if (name === 'jump') {
        const u = Math.max(0, Math.min(1, (JUMP_V - p.vy) / (2 * JUMP_V)));
        action.time = u * JUMP_LEN * 0.999;
      } else if (name === 'trip' || name === 'hit') action.time = Math.max(0, Math.min(0.999, p.t));
    }
    if (dt > 0) this.mixer.update(dt);
    else this.mixer.update(0);
    // A slight lean into a lane change, never more than about 11 degrees.
    const roll = -MAX_LEAN * Math.tanh(p.side / LEAN_SPEED);
    const k = dt > 0 ? 1 - Math.exp(-dt * 18) : 1;
    this.roll += (roll - this.roll) * k;
    this.pivot.rotation.z = this.roll;
    const show = !p.blink || Math.floor(this.time * 14) % 2 === 0;
    for (const m of this.meshes) m.visible = show;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const m of this.meshes) m.skeleton.dispose();
    for (const m of this.materials) m.dispose();
  }
}
