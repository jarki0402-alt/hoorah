/**
 * One player's station: the dynamic food and tools for each dish, its own particle pool, and the
 * bookkeeping that turns model changes into one-shot animations (pulses, step changes, grades).
 * All stations sit at the same place in the shared kitchen; the view shows one at a time.
 */
import * as THREE from 'three';
import type { DishId } from '../recipes';
import { DISHES } from '../recipes';
import { Particles } from './fx';
import { approach } from './kit';
import { MartabakActor } from './martabak';
import type { ActorFrame, DishActor, StationModel } from './model';
import { NasgorActor } from './nasgor';
import { SateActor } from './sate';
import { SPOT } from './spots';

export class StationRig {
  readonly group = new THREE.Group();
  readonly fx = new Particles(260);
  /** Camera shake amount (metres), decays every frame. */
  shake = 0;
  private readonly actors: Record<DishId, DishActor>;
  private key = '';
  private pulses = 0;
  private sp = 0;
  private since = 0;
  private lastGrade: string | null = null;
  private dish: DishId | null = null;
  private steamAcc = 0;

  constructor() {
    const hooks = { fx: this.fx, kick: (a: number) => (this.shake = Math.max(this.shake, a)) };
    this.actors = {
      nasgor: new NasgorActor(hooks),
      sate: new SateActor(hooks),
      martabak: new MartabakActor(hooks),
    };
    for (const a of Object.values(this.actors)) this.group.add(a.group);
    this.group.add(this.fx.points);
  }

  update(m: StationModel, t: number, dt: number): void {
    const actor = this.actors[m.dish];
    if (this.dish !== m.dish) {
      this.dish = m.dish;
      for (const [k, a] of Object.entries(this.actors)) a.group.visible = k === m.dish;
      this.fx.clear();
    }
    // A new run starts at every 'ready': pulses restart from zero.
    const runKey = `${m.dish}:${m.stepIndex}:${m.plated ? 'p' : m.phase === 'intro' ? 'i' : 's'}`;
    if (runKey !== this.key) {
      this.key = runKey;
      this.pulses = 0;
      this.sp = 0;
      this.since = 0;
      this.lastGrade = null;
      actor.reset(m.stepIndex, t);
    }
    this.since += dt;
    this.sp = approach(this.sp, m.progress, 16, dt);
    if (m.plated) this.sp = 1;
    const f: ActorFrame = {
      m,
      t,
      dt,
      sp: this.sp,
      since: this.since,
      stepP: (i) => {
        if (m.plated) {
          const v = m.finals[i];
          return v === undefined || Number.isNaN(v) ? 1 : v;
        }
        if (i < m.stepIndex) {
          const v = m.finals[i];
          return v === undefined || Number.isNaN(v) ? 1 : v;
        }
        if (i > m.stepIndex || m.phase === 'intro') return 0;
        return this.sp;
      },
      active: (i) => !m.plated && m.stepIndex === i && (m.phase === 'cook' || m.phase === 'reveal'),
    };
    if (m.pulses > this.pulses) {
      const n = Math.min(4, m.pulses - this.pulses);
      this.pulses = m.pulses;
      for (let k = 0; k < n; k++) actor.pulse(m.stepIndex, f);
    }
    if (m.grade !== this.lastGrade) {
      this.lastGrade = m.grade;
      const step = DISHES[m.dish].steps[m.stepIndex];
      if (step && m.grade === 'sempurna') {
        const [x, y, z] = SPOT[step.focus];
        this.fx.sparkle(x, y + 0.06, z, 0.12, 22);
      }
    }
    actor.update(f);
    // Fresh, hot food steams on the plate.
    if (m.plated || m.poster) {
      this.steamAcc += dt * 2.2;
      while (this.steamAcc > 1) {
        this.steamAcc -= 1;
        const spot = m.dish === 'martabak' ? SPOT.board : SPOT.plate;
        this.fx.steam(spot[0], 0.09, spot[2], 0.05, 0.75);
      }
    }
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - dt * 0.05);
  }
}
