/** What the renderer needs to know about one player's station, rebuilt every frame by the driver. */
import type * as THREE from 'three';
import type { Grade, GradeReason, Phase } from '../logic';
import type { DishId } from '../recipes';
import type { Particles } from './fx';

export interface StationModel {
  id: number;
  dish: DishId;
  stepIndex: number;
  phase: Phase;
  /** Current step, 0..1 (count / target, or hold amount / burn). */
  progress: number;
  /** Current step hold amount (0..burn); 0 for count steps. */
  amount: number;
  held: boolean;
  /** Counted inputs + presses this step: each new one fires an animation. */
  pulses: number;
  grade: Grade | null;
  reason: GradeReason | null;
  /** Final amount per step of this dish (count ratio or hold amount); NaN = not played yet. */
  finals: number[];
  connected: boolean;
  /** Showcase / final / poster: everything finished and plated. */
  plated: boolean;
  /** Key-art pose: whole ingredients on the board, a roaring wok, a plated dish. */
  poster?: boolean;
}

/** Per-frame context for a dish actor. */
export interface ActorFrame {
  m: StationModel;
  /** Seconds. */
  t: number;
  dt: number;
  /** Smoothed progress of the current step. */
  sp: number;
  /** Seconds since the current step (or dish) began on this station. */
  since: number;
  /** Progress of step i as it should be shown (finals for earlier steps, sp for the current one). */
  stepP: (i: number) => number;
  /** Is step i the one being cooked right now (cook phase)? */
  active: (i: number) => boolean;
}

export interface DishActor {
  readonly group: THREE.Group;
  /** A new step (or a fresh dish) starts on this station. */
  reset(stepIndex: number, t: number): void;
  /** One input: a tap, a quarter turn, a swipe, or a press. */
  pulse(stepIndex: number, f: ActorFrame): void;
  update(f: ActorFrame): void;
}

export interface RigHooks {
  fx: Particles;
  /** Ask the station camera for a little shake. */
  kick(amount: number): void;
}
