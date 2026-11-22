/**
 * Group camera for the main screen: frames a set of points (the pack of players) from a fixed
 * viewing direction, zooming out only as far as `maxDist`, with smoothing so it never jerks.
 * Pure math (a pinhole projection), so games can ask "is this player on screen?" in tests too.
 */
import { clamp, damp, type V3, v3 } from './math';

export interface CameraRig {
  /** Vertical field of view (degrees). */
  fov: number;
  /** Pitch below the horizon (radians, positive looks down). */
  pitch: number;
  /** Heading around y (radians): 0 = the camera sits on +z looking towards -z. */
  yaw: number;
  minDist: number;
  maxDist: number;
  /** Fraction of the half screen the points may use (0.8 leaves a 20% border). */
  fill: number;
  /** Smoothing rates (1/s) for the focus and the distance. */
  followRate: number;
  zoomRate: number;
  /** Shift of the focus from the points' centre (e.g. look a little ahead). */
  lead: V3;
}

export const DEFAULT_RIG: CameraRig = {
  fov: 42,
  pitch: 0.62,
  yaw: 0,
  minDist: 13,
  maxDist: 30,
  fill: 0.8,
  followRate: 3.2,
  zoomRate: 1.8,
  lead: v3(),
};

export interface CamView {
  /** Point looked at. */
  focus: V3;
  /** Distance from the focus to the eye. */
  dist: number;
}

/** Eye position for a view. */
export function eyeOf(rig: CameraRig, view: CamView): V3 {
  const c = Math.cos(rig.pitch);
  return {
    x: view.focus.x + Math.sin(rig.yaw) * c * view.dist,
    y: view.focus.y + Math.sin(rig.pitch) * view.dist,
    z: view.focus.z + Math.cos(rig.yaw) * c * view.dist,
  };
}

/**
 * Normalised screen position of a world point (-1..1 on both axes inside the picture, +y up), or
 * null when it is behind the eye.
 */
export function project(
  rig: CameraRig,
  view: CamView,
  aspect: number,
  p: V3,
): { x: number; y: number } | null {
  const eye = eyeOf(rig, view);
  // Camera basis: forward f (eye -> focus), right r, up u.
  let fx = view.focus.x - eye.x;
  let fy = view.focus.y - eye.y;
  let fz = view.focus.z - eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // r = f x worldUp(0,1,0) = (-fz, 0, fx) normalised.
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // u = r x f
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const dx = p.x - eye.x;
  const dy = p.y - eye.y;
  const dz = p.z - eye.z;
  const depth = dx * fx + dy * fy + dz * fz;
  if (depth <= 0.05) return null;
  const t = Math.tan((rig.fov * Math.PI) / 360);
  return {
    x: (dx * rx + dz * rz) / (depth * t * aspect),
    y: (dx * ux + dy * uy + dz * uz) / (depth * t),
  };
}

/** Whether a point is inside the picture, with `margin` extra (0.1 = 10% beyond the edge). */
export function onScreen(rig: CameraRig, view: CamView, aspect: number, p: V3, margin = 0): boolean {
  const s = project(rig, view, aspect, p);
  return !!s && Math.abs(s.x) <= 1 + margin && Math.abs(s.y) <= 1 + margin;
}

/** The view that frames all points as close as allowed (focus at their bounds' centre). */
export function frameTarget(rig: CameraRig, aspect: number, points: readonly V3[]): CamView {
  if (points.length === 0) return { focus: v3(), dist: rig.minDist };
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  const focus = {
    x: (x0 + x1) / 2 + rig.lead.x,
    y: (y0 + y1) / 2 + rig.lead.y,
    z: (z0 + z1) / 2 + rig.lead.z,
  };
  const fits = (dist: number) => {
    const view = { focus, dist };
    for (const p of points) {
      const s = project(rig, view, aspect, p);
      if (!s || Math.abs(s.x) > rig.fill || Math.abs(s.y) > rig.fill) return false;
    }
    return true;
  };
  if (fits(rig.minDist)) return { focus, dist: rig.minDist };
  if (!fits(rig.maxDist)) return { focus, dist: rig.maxDist };
  let lo = rig.minDist;
  let hi = rig.maxDist;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return { focus, dist: hi };
}

/** A smoothed group camera. */
export class GroupCamera {
  readonly view: CamView;
  private started = false;

  constructor(
    public rig: CameraRig = DEFAULT_RIG,
    public aspect = 16 / 9,
  ) {
    this.view = { focus: v3(), dist: rig.minDist };
  }

  /** Jump straight to framing these points (round start, respawns of the whole group). */
  snap(points: readonly V3[]): void {
    const t = frameTarget(this.rig, this.aspect, points);
    this.view.focus.x = t.focus.x;
    this.view.focus.y = t.focus.y;
    this.view.focus.z = t.focus.z;
    this.view.dist = t.dist;
    this.started = true;
  }

  update(points: readonly V3[], dt: number): void {
    if (points.length === 0) return;
    if (!this.started) {
      this.snap(points);
      return;
    }
    const t = frameTarget(this.rig, this.aspect, points);
    const kf = damp(this.rig.followRate, dt);
    // Zoom out faster than in, so nobody slips off the edge while the camera catches up.
    const kz = damp(t.dist > this.view.dist ? this.rig.zoomRate * 1.8 : this.rig.zoomRate, dt);
    this.view.focus.x += (t.focus.x - this.view.focus.x) * kf;
    this.view.focus.y += (t.focus.y - this.view.focus.y) * kf;
    this.view.focus.z += (t.focus.z - this.view.focus.z) * kf;
    this.view.dist = clamp(
      this.view.dist + (t.dist - this.view.dist) * kz,
      this.rig.minDist,
      this.rig.maxDist,
    );
  }

  visible(p: V3, margin = 0): boolean {
    return onScreen(this.rig, this.view, this.aspect, p, margin);
  }

  eye(): V3 {
    return eyeOf(this.rig, this.view);
  }
}
