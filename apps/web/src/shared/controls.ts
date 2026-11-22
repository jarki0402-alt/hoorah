/**
 * One source for how the controls feel: the floating joystick, the swipe zone, the iPhone haptic
 * ticks, the Lari Terus moves that answer them and the Rusun crane swing. The phone controller and the games read
 * `CONTROL_TUNING`; the Lab Kontrol page (`/lab/`) lets the owner try other values on a real
 * device and stores them per browser (`localStorage`, key `hoorah.controls`), so no rebuild is
 * needed to compare. The defaults below are the best values known so far.
 *
 * Pure math (`stickOutput`, `swipeDir`, ...) lives here too so the controller and the Lab answer a
 * thumb exactly the same way.
 */

export type FlashMode = 'auto' | 'always' | 'off';

export interface StickTuning {
  /** Thumb travel (CSS px) that reaches full output; the centre follows the thumb past it. */
  radius: number;
  /** Share of the radius that still reads as centred (output rescaled past it). */
  dead: number;
  /** Response curve: output = travel^curve. Below 1 reaches speed sooner, above 1 is finer. */
  curve: number;
  /**
   * false (default, as in Roblox): the base stays where the thumb landed and the knob stops at the
   * radius. true: past the radius the base is dragged along behind the thumb.
   */
  follow: boolean;
}

export interface SwipeTuning {
  /** Travel (CSS px) that always counts as a swipe. */
  distance: number;
  /** A fast flick counts from this travel (CSS px)... */
  flickDistance: number;
  /** ...when the finger moves at least this fast (CSS px per ms). */
  flickSpeed: number;
  /** A tap moves at most this far (CSS px) and lasts at most `tapMs`. */
  tapPx: number;
  tapMs: number;
}

export interface HapticTuning {
  /** Shortest gap (ms) between two iPhone ticks of one pattern. */
  tickGap: number;
  /** Small screen-edge flash: when no vibration exists (`auto`), always, or never. */
  flash: FlashMode;
  /** iPhone: a tick asked for while a finger is down without a usable gesture fires on release. */
  releaseFallback: boolean;
}

export interface RunnerTuning {
  /** Seconds for one Lari Terus lane change (sharp ease-out). */
  laneTime: number;
  /** Take-off speed (m/s) and rising gravity (m/s²) of a jump. */
  jumpV: number;
  gravity: number;
  /** Gravity on the way down, as a multiple of the rising one (above 1 = lands a little faster). */
  fallMul: number;
  /** Seconds the runner floats at the top of a jump (gentle gravity around the apex). */
  hang: number;
  /** Phone lag is caught up by running the jump arc this much faster (extra s per s). */
  lagCatch: number;
}

/** Rusun: the crane's swing (runs on the main screen, so it is set from /lab/ on that device). */
export interface RusunTuning {
  /** One full swing there and back (ms) for the first floor players place. */
  periodMs: number;
  /** Each placed floor shortens the period by this share (0.015 = 1.5 % faster per floor). */
  speedup: number;
  /** The swing never gets faster than this period (ms). */
  minPeriodMs: number;
}

export interface ControlTuning {
  stick: StickTuning;
  swipe: SwipeTuning;
  haptic: HapticTuning;
  runner: RunnerTuning;
  rusun: RusunTuning;
}

export const CONTROL_DEFAULTS: Readonly<ControlTuning> = Object.freeze({
  stick: Object.freeze({ radius: 52, dead: 0.14, curve: 1, follow: false }),
  swipe: Object.freeze({ distance: 26, flickDistance: 14, flickSpeed: 0.55, tapPx: 12, tapMs: 260 }),
  haptic: Object.freeze({ tickGap: 70, flash: 'auto' as FlashMode, releaseFallback: true }),
  // About 0.75 s in the air: up in 0.31 s, a 0.17 s float at the top, down in 0.27 s.
  runner: Object.freeze({ laneTime: 0.14, jumpV: 8.4, gravity: 25, fallMul: 1.3, hang: 0.17, lagCatch: 2 }),
  rusun: Object.freeze({ periodMs: 3400, speedup: 0.015, minPeriodMs: 2400 }),
});

/** Slider range and step of every number the Lab can change (also clamps stored values). */
export interface Range {
  min: number;
  max: number;
  step: number;
}

export const CONTROL_RANGES: {
  stick: Record<Exclude<keyof StickTuning, 'follow'>, Range>;
  swipe: Record<keyof SwipeTuning, Range>;
  haptic: { tickGap: Range };
  runner: Record<keyof RunnerTuning, Range>;
  rusun: Record<keyof RusunTuning, Range>;
} = {
  stick: {
    radius: { min: 28, max: 96, step: 2 },
    dead: { min: 0, max: 0.4, step: 0.01 },
    curve: { min: 0.5, max: 2, step: 0.05 },
  },
  swipe: {
    distance: { min: 14, max: 60, step: 1 },
    flickDistance: { min: 8, max: 40, step: 1 },
    flickSpeed: { min: 0.2, max: 2, step: 0.05 },
    tapPx: { min: 4, max: 24, step: 1 },
    tapMs: { min: 120, max: 500, step: 10 },
  },
  haptic: { tickGap: { min: 30, max: 200, step: 5 } },
  runner: {
    laneTime: { min: 0.08, max: 0.3, step: 0.01 },
    jumpV: { min: 5, max: 10, step: 0.1 },
    gravity: { min: 12, max: 40, step: 0.5 },
    fallMul: { min: 1, max: 2, step: 0.05 },
    hang: { min: 0, max: 0.4, step: 0.01 },
    lagCatch: { min: 0, max: 6, step: 0.25 },
  },
  rusun: {
    periodMs: { min: 1600, max: 6000, step: 50 },
    speedup: { min: 0, max: 0.05, step: 0.001 },
    minPeriodMs: { min: 1200, max: 5000, step: 50 },
  },
};

const STORE_KEY = 'hoorah.controls';
/**
 * Version of the stored shape. Version 2 (2026-11-22) gave the jump a float and a faster fall:
 * a runner block saved before that described the old, too short jump and is dropped.
 */
const STORE_VERSION = 2;
const FLASH_MODES: readonly FlashMode[] = ['auto', 'always', 'off'];

function clamp(v: number, r: Range): number {
  return Math.min(r.max, Math.max(r.min, v));
}

/** A number from untrusted storage, clamped to its range, or the default. */
function num(raw: unknown, fallback: number, r: Range): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, r) : fallback;
}

function record(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Full, valid settings from anything (stored JSON, a partial override): unknown keys dropped. */
export function normalizeTuning(raw: unknown): ControlTuning {
  const src = record(raw);
  const d = CONTROL_DEFAULTS;
  const R = CONTROL_RANGES;
  const st = record(src.stick);
  const sw = record(src.swipe);
  const ha = record(src.haptic);
  const ru = record(src.runner);
  const rs = record(src.rusun);
  const minPeriodMs = num(rs.minPeriodMs, d.rusun.minPeriodMs, R.rusun.minPeriodMs);
  const swipe: SwipeTuning = {
    distance: num(sw.distance, d.swipe.distance, R.swipe.distance),
    flickDistance: num(sw.flickDistance, d.swipe.flickDistance, R.swipe.flickDistance),
    flickSpeed: num(sw.flickSpeed, d.swipe.flickSpeed, R.swipe.flickSpeed),
    tapPx: num(sw.tapPx, d.swipe.tapPx, R.swipe.tapPx),
    tapMs: num(sw.tapMs, d.swipe.tapMs, R.swipe.tapMs),
  };
  // A flick must travel further than a tap may, and never further than a plain swipe.
  swipe.flickDistance = Math.min(swipe.distance, Math.max(swipe.flickDistance, swipe.tapPx + 1));
  const flash = FLASH_MODES.includes(ha.flash as FlashMode) ? (ha.flash as FlashMode) : d.haptic.flash;
  return {
    stick: {
      radius: num(st.radius, d.stick.radius, R.stick.radius),
      dead: num(st.dead, d.stick.dead, R.stick.dead),
      curve: num(st.curve, d.stick.curve, R.stick.curve),
      follow: typeof st.follow === 'boolean' ? st.follow : d.stick.follow,
    },
    swipe,
    haptic: {
      tickGap: num(ha.tickGap, d.haptic.tickGap, R.haptic.tickGap),
      flash,
      releaseFallback:
        typeof ha.releaseFallback === 'boolean' ? ha.releaseFallback : d.haptic.releaseFallback,
    },
    runner: {
      laneTime: num(ru.laneTime, d.runner.laneTime, R.runner.laneTime),
      jumpV: num(ru.jumpV, d.runner.jumpV, R.runner.jumpV),
      gravity: num(ru.gravity, d.runner.gravity, R.runner.gravity),
      fallMul: num(ru.fallMul, d.runner.fallMul, R.runner.fallMul),
      hang: num(ru.hang, d.runner.hang, R.runner.hang),
      lagCatch: num(ru.lagCatch, d.runner.lagCatch, R.runner.lagCatch),
    },
    rusun: {
      // The first floor never swings faster than the fastest allowed one.
      periodMs: Math.max(minPeriodMs, num(rs.periodMs, d.rusun.periodMs, R.rusun.periodMs)),
      speedup: num(rs.speedup, d.rusun.speedup, R.rusun.speedup),
      minPeriodMs,
    },
  };
}

/** Stored JSON as of the current version: blocks whose meaning changed since are dropped. */
export function migrateStored(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const src = raw as Record<string, unknown>;
  if (src.version === STORE_VERSION) return raw;
  const { runner: _oldJump, ...rest } = src;
  return rest;
}

function readStored(): unknown {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw === null ? null : migrateStored(JSON.parse(raw) as unknown);
  } catch {
    // No storage (private mode, tests) or broken JSON: the defaults apply.
    return null;
  }
}

/**
 * The live settings: defaults plus this browser's Lab override. Mutated in place by
 * `applyControlTuning`, so readers that look it up at event time follow the Lab at once.
 */
export const CONTROL_TUNING: ControlTuning = normalizeTuning(readStored());

/** True when this browser runs on values saved from the Lab instead of the defaults. */
export function hasTuningOverride(): boolean {
  return readStored() !== null;
}

function copyInto(target: ControlTuning, src: ControlTuning): void {
  Object.assign(target.stick, src.stick);
  Object.assign(target.swipe, src.swipe);
  Object.assign(target.haptic, src.haptic);
  Object.assign(target.runner, src.runner);
  Object.assign(target.rusun, src.rusun);
}

/** Use these settings now on this page (the Lab's live preview); `save` keeps them for next time. */
export function applyControlTuning(next: ControlTuning, save = false): ControlTuning {
  const clean = normalizeTuning(next);
  copyInto(CONTROL_TUNING, clean);
  if (save) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: STORE_VERSION, ...clean }));
    } catch {
      // Storage full or blocked: the values still apply to this page.
    }
  }
  return clean;
}

/** Back to the built-in defaults, and forget the stored override. */
export function resetControlTuning(): ControlTuning {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing stored to forget.
  }
  const clean = normalizeTuning(null);
  copyInto(CONTROL_TUNING, clean);
  return clean;
}

/** A deep copy to edit freely (the Lab's sliders). */
export function cloneTuning(t: ControlTuning = CONTROL_TUNING): ControlTuning {
  return normalizeTuning(JSON.parse(JSON.stringify(t)) as unknown);
}

/** Short text with every value, for the owner to send to the developer. */
export function tuningSummary(t: ControlTuning): string {
  const f = (v: number, digits = 2) => String(Number(v.toFixed(digits)));
  return [
    `stick radius=${f(t.stick.radius, 0)} dead=${f(t.stick.dead)} curve=${f(t.stick.curve)} base=${t.stick.follow ? 'follow' : 'fixed'}`,
    `swipe distance=${f(t.swipe.distance, 0)} flick=${f(t.swipe.flickDistance, 0)}px@${f(t.swipe.flickSpeed)}px/ms tap=${f(t.swipe.tapPx, 0)}px/${f(t.swipe.tapMs, 0)}ms`,
    `haptic gap=${f(t.haptic.tickGap, 0)}ms flash=${t.haptic.flash} release=${t.haptic.releaseFallback ? 'on' : 'off'}`,
    `runner laneTime=${f(t.runner.laneTime)} jumpV=${f(t.runner.jumpV, 1)} gravity=${f(t.runner.gravity, 1)} fall=${f(t.runner.fallMul)}x hang=${f(t.runner.hang)} lagCatch=${f(t.runner.lagCatch)}`,
    `rusun period=${f(t.rusun.periodMs, 0)}ms speedup=${f(t.rusun.speedup * 100, 1)}% min=${f(t.rusun.minPeriodMs, 0)}ms`,
  ].join('\n');
}

/* ------------------------------------------------------------------ joystick math */

export interface StickOutput {
  /** Output vector, length 0..1 (screen axes: +y is down). */
  x: number;
  y: number;
  /** Raw travel 0..1 before the dead zone and the curve. */
  travel: number;
}

export interface StickTrack {
  /** Stick centre (base) after this move. */
  cx: number;
  cy: number;
  /** Thumb offset from the centre (feeds `stickOutput`). */
  dx: number;
  dy: number;
  /** Where to draw the knob: the offset capped at the radius. */
  kx: number;
  ky: number;
}

/**
 * One thumb move of the floating stick, centre and thumb in the same CSS px space. A fixed base
 * keeps its centre; a following base is dragged along once the thumb is past the radius, so
 * reversing answers at once. The phone controller and the Lab both call this.
 */
export function trackStick(cx: number, cy: number, px: number, py: number, s: StickTuning): StickTrack {
  let dx = px - cx;
  let dy = py - cy;
  let len = Math.hypot(dx, dy);
  if (s.follow && len > s.radius) {
    const k = (len - s.radius) / len;
    cx += dx * k;
    cy += dy * k;
    dx = px - cx;
    dy = py - cy;
    len = Math.hypot(dx, dy);
  }
  const shown = len > s.radius ? s.radius / len : 1;
  return { cx, cy, dx, dy, kx: dx * shown, ky: dy * shown };
}

/** Thumb offset from the stick centre (CSS px) to the analog output the games receive. */
export function stickOutput(dx: number, dy: number, s: StickTuning): StickOutput {
  const len = Math.hypot(dx, dy);
  const travel = Math.min(1, len / s.radius);
  if (len === 0 || travel < s.dead) return { x: 0, y: 0, travel };
  const lin = s.dead >= 1 ? 1 : (travel - s.dead) / (1 - s.dead);
  const mag = lin ** s.curve;
  return { x: (dx / len) * mag, y: (dy / len) * mag, travel };
}

/* ------------------------------------------------------------------ swipe math */

export type SwipeDir = 'up' | 'down' | 'left' | 'right';

/** Main direction of a stroke (screen axes). */
export function dirOf(dx: number, dy: number): SwipeDir {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

/**
 * Whether a stroke counts as a swipe yet: far enough, or a shorter flick that is fast enough.
 * `travel` = CSS px from where the stroke is measured, `speed` = recent finger speed (px/ms).
 */
export function isSwipe(travel: number, speed: number, s: SwipeTuning): boolean {
  if (travel >= s.distance) return true;
  return travel >= s.flickDistance && speed >= s.flickSpeed;
}

/**
 * Finger speed smoothed over the last few moves (px/ms). Pointer moves can arrive in bursts, so
 * one sample is averaged with the previous estimate instead of read alone.
 */
export class FingerSpeed {
  private x = 0;
  private y = 0;
  private t = 0;
  private v = 0;

  reset(x: number, y: number, t: number): void {
    this.x = x;
    this.y = y;
    this.t = t;
    this.v = 0;
  }

  /** Add a sample and return the smoothed speed. */
  push(x: number, y: number, t: number): number {
    const dt = t - this.t;
    if (dt <= 0) return this.v;
    const inst = Math.hypot(x - this.x, y - this.y) / Math.max(dt, 4);
    this.v = dt > 80 ? inst : this.v * 0.3 + inst * 0.7;
    this.x = x;
    this.y = y;
    this.t = t;
    return this.v;
  }
}
