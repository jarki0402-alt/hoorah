/**
 * CPU drivers (and the autopilot that takes over a disconnected or finished human). Pure: reads the
 * race state, returns controls. On circuits it follows a racing line and brakes for corners from
 * a safe-speed model of the same yaw limits humans drive with; in the arena it hunts kardus, chases
 * rivals, aims its throws and reverses out of tight spots. Decent but beatable.
 */
import type { Arena } from './arena';
import { type Controls, type Kart, type Mode, type Race, TUNE, yawCap } from './logic';
import type { Track } from './track';

export interface AiState {
  /** Preferred lateral lane (m), drifts slowly. */
  lane: number;
  laneTarget: number;
  laneT: number;
  /** Top-speed multiplier (CPUs < 1). */
  baseMul: number;
  speedMul: number;
  /** Seconds the current item has been held. */
  holdT: number;
  /** Seconds to wait before using a held item at the first good chance. */
  patience: number;
  steerGain: number;
  /** How close to the cornering limit this driver dares (0.8 timid .. 0.95 brave). */
  nerve: number;
  /** Reverse-out manoeuvre time left and the steer to hold while reversing. */
  reverseT: number;
  reverseSteer: number;
  slowT: number;
}

export function newAiState(idx: number, human: boolean, mode: Mode, rnd: () => number): AiState {
  let baseMul: number;
  if (human) baseMul = 0.97;
  else if (mode === 'duel') baseMul = 0.94 + 0.03 * rnd();
  else baseMul = 0.885 + 0.06 * rnd() + (idx < 2 ? 0.01 : 0);
  return {
    lane: (rnd() - 0.5) * 6,
    laneTarget: 0,
    laneT: 0,
    baseMul,
    speedMul: baseMul,
    holdT: 0,
    patience: 0.6 + rnd() * 2.2,
    steerGain: 2.0 + rnd() * 0.5,
    nerve: human ? 0.9 : 0.82 + rnd() * 0.1,
    reverseT: 0,
    reverseSteer: 0,
    slowT: 0,
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : Math.min(v, b));

function wrap(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

const safeCache = new Map<number, number>();
/** Fastest speed (m/s) at which a kart can hold curvature `k` within `nerve` of its yaw limit. */
export function safeSpeed(k: number, nerve: number): number {
  const ak = Math.abs(k);
  if (ak < 1e-4) return Infinity;
  const key = Math.round(ak * 2000) * 100 + Math.round(nerve * 100);
  const hit = safeCache.get(key);
  if (hit !== undefined) return hit;
  let v = TUNE.topSpeed * 1.4;
  while (v > 3 && v * ak > nerve * yawCap(v)) v -= 0.25;
  safeCache.set(key, v);
  return v;
}

/** Highest speed allowed now so the kart can still brake for every corner it can see. */
export function allowedSpeed(T: Track, s: number, v: number, nerve: number): number {
  const reach = 14 + Math.max(0, v) * 1.7;
  const decel = TUNE.brake * 0.55;
  let allowed = Infinity;
  for (let d = 0; d <= reach; d += 3) {
    const i = T.index(s + d);
    let k = 0;
    for (let o = -2; o <= 2; o++) k = Math.max(k, Math.abs(T.curv[(i + o + T.n) % T.n]!));
    const vc = safeSpeed(k, nerve);
    if (vc === Infinity) continue;
    allowed = Math.min(allowed, Math.sqrt(vc * vc + 2 * decel * Math.max(0, d - 4)));
  }
  return allowed;
}

export function aiControl(race: Race, k: Kart, dt: number): Controls {
  const ai = k.ai;
  // Reverse-out manoeuvre when pinned (both brains).
  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    return { steer: ai.reverseSteer, gas: false, brake: true, useItem: false, back: false };
  }
  if (Math.abs(k.speed) < 1.2 && race.phase === 'race' && k.spinT <= 0) {
    ai.slowT += dt;
    if (ai.slowT > 0.9) {
      ai.slowT = 0;
      ai.reverseT = 0.9;
      ai.reverseSteer = k.steer >= 0 ? -1 : 1;
    }
  } else {
    ai.slowT = 0;
  }
  return race.track ? circuitControl(race, race.track, k, dt) : arenaControl(race, race.arena!, k, dt);
}

/* ------------------------------------------------------------------ circuits */

function circuitControl(race: Race, T: Track, k: Kart, dt: number): Controls {
  const ai = k.ai;
  const v = Math.max(0, k.speed);

  ai.laneT -= dt;
  if (ai.laneT <= 0) {
    ai.laneT = 2 + ((k.idx * 7919 + Math.floor(race.t)) % 1000) / 400;
    ai.laneTarget = (((k.idx * 104729 + Math.floor(race.t / 7)) % 1000) / 1000 - 0.5) * 7;
  }
  ai.lane += clamp(ai.laneTarget - ai.lane, -1.2 * dt, 1.2 * dt);

  // Mild rubber band against the humans (CPUs only).
  ai.speedMul = ai.baseMul;
  if (!k.human && race.phase === 'race' && race.mode !== 'time') {
    let best = -Infinity;
    let worst = Infinity;
    for (const o of race.karts) {
      if (!o.human || o.finishT !== null) continue;
      best = Math.max(best, o.u);
      worst = Math.min(worst, o.u);
    }
    if (best > -Infinity) {
      if (k.u - best > 55) ai.speedMul *= 0.92;
      else if (worst - k.u > 90) ai.speedMul *= 1.05;
    }
  }

  const look = 6 + v * 0.45;
  const turn = T.turnAhead(k.s + 4, 30);
  let targetD = clamp(turn * 3.0, -4.5, 4.5) + ai.lane * 0.45;

  // Want an item: aim for the nearest live box in the next row.
  if (!k.item && k.rollT <= 0 && k.finishT === null) {
    let bestBox: { d: number } | null = null;
    for (const b of race.boxes) {
      if (!b.active) continue;
      const ds = T.delta(k.s, b.s);
      if (ds < 4 || ds > 45) continue;
      if (!bestBox || Math.abs(b.d - k.d) < Math.abs(bestBox.d - k.d)) bestBox = { d: b.d };
    }
    if (bestBox) targetD = bestBox.d;
  }
  // Dodge hazards and karts ahead.
  for (const o of race.hazards) {
    const pr = T.project(o.x, o.z, k.hint, 40);
    const ds = T.delta(k.s, pr.s);
    if (ds < 0 || ds > 30) continue;
    if (Math.abs(pr.d - targetD) < 2.8) targetD = pr.d + (pr.d > 0 ? -3.6 : 3.6);
  }
  for (const o of race.karts) {
    if (o === k || o.out) continue;
    const ds = T.delta(k.s, o.s);
    if (ds < 0.5 || ds > 9) continue;
    if (Math.abs(o.d - targetD) < 2.2 && o.speed < v) targetD = o.d + (o.d > k.d ? -2.6 : 2.6);
  }
  targetD = clamp(targetD, -6.4, 6.4);

  const p = T.point(k.s + look, targetD);
  const err = wrap(Math.atan2(p.x - k.x, p.z - k.z) - k.h);
  // Turning right lowers the heading, so a negative error needs positive (right) steering.
  const steer = clamp(-err * ai.steerGain, -1, 1);

  // Pedals: brake for what is coming, otherwise gas up to this driver's top speed.
  const allowed = allowedSpeed(T, k.s, v, ai.nerve);
  const top = TUNE.topSpeed * ai.speedMul * (k.finishT !== null ? 0.72 : 1);
  const want = Math.min(allowed, top);
  const brake = v > want + 1.8;
  const gas = !brake && v < want - 0.2;

  return { steer, gas, brake, ...circuitItems(race, T, k, dt) };
}

function circuitItems(race: Race, T: Track, k: Kart, dt: number): { useItem: boolean; back: boolean } {
  const ai = k.ai;
  if (!k.item || k.rollT > 0 || race.mode === 'time') {
    ai.holdT = 0;
    return { useItem: false, back: false };
  }
  ai.holdT += dt;
  if (ai.holdT < ai.patience) return { useItem: false, back: false };
  const ahead = (max: number) =>
    race.karts.some(
      (o) =>
        o !== k &&
        !o.out &&
        o.finishT === null &&
        T.delta(k.s, o.s) > 2 &&
        T.delta(k.s, o.s) < max &&
        Math.abs(o.d - k.d) < 3.5,
    );
  const behind = (max: number) =>
    race.karts.some((o) => o !== k && o.finishT === null && k.u - o.u > 3 && k.u - o.u < max);
  const late = ai.holdT > 11;
  switch (k.item) {
    case 'boost':
      return { useItem: Math.abs(T.turnAhead(k.s, 45)) < 0.3 || late, back: false };
    case 'shield':
      return { useItem: true, back: false };
    case 'oil':
      return { useItem: behind(22) || late, back: false };
    case 'durian':
      if (ahead(40)) return { useItem: true, back: false };
      if (behind(16)) return { useItem: true, back: true };
      return { useItem: late, back: false };
    case 'firecracker':
      return { useItem: k.place > 1 || late, back: false };
    case 'horn':
      return {
        useItem:
          race.karts.some(
            (o) => o !== k && !o.out && o.finishT === null && Math.hypot(o.x - k.x, o.z - k.z) < 9,
          ) || late,
        back: false,
      };
    default:
      return { useItem: false, back: false };
  }
}

/* ------------------------------------------------------------------ arena */

function arenaControl(race: Race, A: Arena, k: Kart, dt: number): Controls {
  const ai = k.ai;
  let tx = 0;
  let tz = 0;
  let enemy: Kart | null = null;
  let enemyDist = Infinity;
  for (const o of race.karts) {
    if (o === k || o.out) continue;
    const d = Math.hypot(o.x - k.x, o.z - k.z);
    if (d < enemyDist) {
      enemyDist = d;
      enemy = o;
    }
  }
  const wantsBox = !k.item && k.rollT <= 0;
  let boxTarget: { x: number; z: number } | null = null;
  if (wantsBox) {
    let bd = Infinity;
    for (const b of race.boxes) {
      if (!b.active) continue;
      const d = Math.hypot(b.x - k.x, b.z - k.z);
      if (d < bd) {
        bd = d;
        boxTarget = b;
      }
    }
  }
  if (boxTarget) {
    tx = boxTarget.x;
    tz = boxTarget.z;
  } else if (enemy) {
    // Lead the target a little.
    tx = enemy.x + enemy.vx * 0.4;
    tz = enemy.z + enemy.vz * 0.4;
  }

  // Steer around obstacles between us and the target.
  let want = Math.atan2(tx - k.x, tz - k.z);
  const fx = Math.sin(want);
  const fz = Math.cos(want);
  const distT = Math.hypot(tx - k.x, tz - k.z);
  for (const o of A.obstacles) {
    const r = (o.kind === 'circle' ? o.r : Math.max(o.hw, o.hd) + 0.6) + 2.4;
    const ox = o.x - k.x;
    const oz = o.z - k.z;
    const along = ox * fx + oz * fz;
    if (along < 0 || along > Math.min(18, distT)) continue;
    const across = ox * -fz + oz * fx;
    if (Math.abs(across) > r) continue;
    // Obstacle to the right of our line: pass it on the left, and vice versa.
    const side = across >= 0 ? -1 : 1;
    const px = o.x + -fz * r * 1.15 * side;
    const pz = o.z + fx * r * 1.15 * side;
    want = Math.atan2(px - k.x, pz - k.z);
    break;
  }
  // Keep off the walls.
  const edge = 9;
  if (Math.abs(k.x) > A.halfW - edge || Math.abs(k.z) > A.halfD - edge) {
    const toCentre = Math.atan2(-k.x, -k.z);
    const out = Math.abs(wrap(want - toCentre));
    if (out > 1.4) want = toCentre + Math.sign(wrap(want - toCentre)) * 1.2;
  }
  const err = wrap(want - k.h);
  const steer = clamp(-err * 2.4, -1, 1);
  const v = k.speed;
  const brake = Math.abs(err) > 1.3 && v > 9;
  const gas = !brake;

  // Items
  let useItem = false;
  if (k.item && k.rollT <= 0) {
    ai.holdT += dt;
    if (ai.holdT > ai.patience * 0.6 && enemy) {
      const aim = Math.abs(wrap(Math.atan2(enemy.x - k.x, enemy.z - k.z) - k.h));
      switch (k.item) {
        case 'durian':
          useItem = enemyDist < 30 && aim < 0.18;
          break;
        case 'firecracker':
          useItem = enemyDist < 55 && aim < 0.9;
          break;
        case 'horn':
          useItem = enemyDist < 9;
          break;
        case 'oil':
          useItem = enemyDist < 14 && aim > 2.2;
          break;
        case 'shield':
          useItem = true;
          break;
        case 'boost':
          useItem = enemyDist > 25 && aim < 0.4;
          break;
      }
      if (ai.holdT > 9) useItem = true;
    }
  } else {
    ai.holdT = 0;
  }
  return { steer, gas, brake, useItem, back: false };
}
