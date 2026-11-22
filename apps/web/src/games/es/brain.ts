/**
 * Computer skaters of Seluncur Es (PRD 6.4): pick a shot like a person would. Aim at the opponent
 * that is easiest to knock off the floe (closest to the edge behind them) with just enough power,
 * unless standing on the cracked rim, then glide back towards the middle. Skill sets the aim
 * error, how greedy the power is and how fast the thumb settles. Pure (randomness injected).
 */
import type { SlingAim } from '@hoorah/protocol';
import { SLING_MIN_POWER } from '@hoorah/protocol';
import { PHYS, TIMING } from './logic';

export interface ShotInput {
  me: { x: number; y: number };
  others: { id: number; x: number; y: number }[];
  edge: number;
  next: number;
  skill: number;
}

export interface ShotPlan {
  aim: SlingAim;
  /** Game seconds into the aim phase when the thumb starts showing an aim. */
  previewAt: number;
  /** When the aim locks. */
  lockAt: number;
  target: number | null;
}

/** Launch speed that slides exactly `dist` metres. */
const speedFor = (dist: number) => Math.sqrt(2 * PHYS.decel * Math.max(0, dist));

/** Distance from `p` to the edge of a circle of radius `r` going along unit `d`. */
export function toEdge(p: { x: number; y: number }, d: { x: number; y: number }, r: number): number {
  const b = p.x * d.x + p.y * d.y;
  const c = p.x * p.x + p.y * p.y - r * r;
  const disc = b * b - c;
  if (disc < 0) return 0;
  return Math.max(0, -b + Math.sqrt(disc));
}

function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Aim at `target` hard enough to push it off a floe of radius `r`. Null when out of reach. */
function knockShot(
  me: { x: number; y: number },
  t: { x: number; y: number },
  r: number,
): { dir: { x: number; y: number }; power: number; score: number } | null {
  const dx = t.x - me.x;
  const dy = t.y - me.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-3) return null;
  const dir = { x: dx / dist, y: dy / dist };
  const behind = toEdge(t, dir, r);
  const vTarget = speedFor(behind + 0.35);
  const vImpact = vTarget / ((1 + PHYS.restitution) / 2);
  const travel = Math.max(0, dist - PHYS.radius * 2);
  const v0 = Math.sqrt(vImpact * vImpact + 2 * PHYS.decel * travel);
  const power = v0 / PHYS.vmax;
  if (power > 1.08) return null;
  // Prefer short, sure shots on skaters near the edge; avoid ending up on the rim ourselves.
  const myStop = Math.hypot(t.x, t.y);
  const risk = myStop > r - 0.6 ? 2 : 0;
  return { dir, power: Math.min(1, power), score: behind + dist * 0.25 + risk };
}

export function planShot(input: ShotInput, rnd: () => number): ShotPlan {
  const { me, others, next, skill } = input;
  const s = Math.max(0, Math.min(1, skill));
  const fromCentre = Math.hypot(me.x, me.y);
  let dir = { x: 0, y: 0 };
  let power = 0;
  let target: number | null = null;

  const shots = others
    .map((o) => ({ o, shot: knockShot(me, o, next) }))
    .filter(
      (c): c is { o: (typeof others)[number]; shot: NonNullable<ReturnType<typeof knockShot>> } => !!c.shot,
    )
    .sort((a, b) => a.shot.score - b.shot.score);
  const onRim = fromCentre > next - 0.5;
  // Weaker skaters often pick a random victim instead of the best one.
  const pick =
    shots.length > 0 ? (rnd() < s ? shots[0] : shots[Math.floor(rnd() * shots.length)]) : undefined;

  if (pick && (!onRim || rnd() < s * 0.5)) {
    dir = pick.shot.dir;
    power = pick.shot.power * (0.92 + s * 0.12);
    target = pick.o.id;
  } else if (fromCentre > 0.6) {
    // Glide back towards the middle and stop near it.
    dir = { x: -me.x / fromCentre, y: -me.y / fromCentre };
    power = speedFor(fromCentre * (0.85 + rnd() * 0.2)) / PHYS.vmax;
  } else if (others.length > 0) {
    // Already central with nobody in reach: nudge towards the nearest opponent.
    const o = others.reduce((a, b) =>
      Math.hypot(a.x - me.x, a.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y) ? a : b,
    );
    const d = Math.hypot(o.x - me.x, o.y - me.y) || 1;
    dir = { x: (o.x - me.x) / d, y: (o.y - me.y) / d };
    power = 0.55;
    target = o.id;
  }

  // Aim error: about 13° and ±18% power when easy, about 3° and ±4% at the top.
  const angErr = (gauss(rnd) * ((13 - 10 * s) * Math.PI)) / 180;
  const powErr = 1 + gauss(rnd) * (0.18 - 0.14 * s);
  const c = Math.cos(angErr);
  const sn = Math.sin(angErr);
  const p = Math.max(SLING_MIN_POWER + 0.05, Math.min(1, power * powErr));
  const aim =
    dir.x === 0 && dir.y === 0
      ? { x: 0, y: -p }
      : { x: (dir.x * c - dir.y * sn) * p, y: (dir.x * sn + dir.y * c) * p };

  const previewAt = 0.5 + rnd() * (1.6 - s * 0.6);
  const lockAt = Math.min(TIMING.aim - 0.35, previewAt + 0.7 + rnd() * 1.6);
  return { aim, previewAt, lockAt, target };
}
