/**
 * Graphics levels of Bajaj Rush and Lari Terus: what each level of the shared device profile
 * (`common/gfx.ts`) turns on, and the one step-down ladder each game runs while it plays.
 *
 * Levels:
 *  - high:   MSAA, about 1.5x stage pixels, 2048 shadow maps, PBR with sky reflections, full models.
 *  - medium: MSAA, at most 1.25x stage pixels, 1024 shadow maps on alternate frames.
 *  - low:    no MSAA, 0.75x stage pixels (960x540 on 16:9), no shadow maps (contact shadows and
 *            baked occlusion only), Lambert materials without reflections, the lightest models,
 *            a shorter view and fewer particles.
 *
 * Ladder, one rung per slow verdict of the shared `FrameGovernor`: shadows down one tier at a time
 * until off, then resolution in steps of 0.15 down to the level's floor, then an even 30 fps. The
 * last rung reports the level as too heavy (`noteSlow`), so the next game starts one level lower.
 * Only shadows come back up (after long smooth stretches, never above the starting tier).
 */
import { FrameGovernor, FramePacer, type GfxTier, noteSlow } from '../common/gfx';

/** Shadow quality of the light rig: 3 = 2048 maps every frame ... 0 = no shadow maps (look.ts). */
export type QualityTier = 0 | 1 | 2 | 3;

export interface LevelSpec {
  /** Multisampling (a context flag, fixed for the session). */
  msaa: boolean;
  /** Shadow tier at start. */
  shadow: QualityTier;
  /** Highest backing-store ratio (x stage px) at start. */
  kMax: number;
  /** Lowest ratio the ladder goes to. */
  kFloor: number;
  /** Light materials and models, shorter view, fewer particles. */
  light: boolean;
}

export const LEVELS: Readonly<Record<GfxTier, LevelSpec>> = {
  high: { msaa: true, shadow: 3, kMax: 1.5, kFloor: 0.75, light: false },
  medium: { msaa: true, shadow: 2, kMax: 1.25, kFloor: 0.65, light: false },
  low: { msaa: false, shadow: 0, kMax: 0.75, kFloor: 0.5, light: true },
};

/** Resolution rung size. */
export const K_STEP = 0.15;

/** Debug overrides from the game URL: `?q=0..3` shadow tier, `?k=` pixel ratio, `?aa=0|1` MSAA. */
export interface Overrides {
  shadow: QualityTier | null;
  k: number | null;
  aa: boolean | null;
}

export function readOverrides(params: URLSearchParams): Overrides {
  const q = params.get('q');
  const k = Number(params.get('k'));
  const aa = params.get('aa');
  return {
    shadow: q !== null && /^[0-3]$/.test(q) ? (Number(q) as QualityTier) : null,
    k: params.has('k') && Number.isFinite(k) && k > 0 ? Math.min(3, k) : null,
    aa: aa === '0' ? false : aa === '1' ? true : null,
  };
}

/**
 * Starting backing-store ratio for a level: about `kMax` x stage px, never above the device pixels
 * (high and medium never below the stage either). A stage wider than 1280 (21:9, 2:1) keeps the
 * pixel count of the 1280-wide stage, so the extra width costs no fill rate.
 */
export function startRatio(level: GfxTier, stageScale: number, stageW: number, dpr: number): number {
  const s = LEVELS[level];
  const device = stageScale * (dpr || 1);
  const k = Math.min(s.kMax, Math.max(s.light ? s.kFloor : 1, device));
  return Math.min(k, s.kMax * Math.sqrt(1280 / Math.max(1, stageW)));
}

/** Shadow control of the light rig (look.ts `LightRig`). */
export interface ShadowControl {
  readonly tier: QualityTier;
  /** One tier down; false when already off or pinned. */
  stepDown(): boolean;
  /** One tier up, never from off and never above the starting tier; false when not allowed. */
  stepUp(): boolean;
}

export interface LadderTarget {
  shadows: ShadowControl;
  /** Current backing-store ratio. */
  ratio(): number;
  setRatio(k: number): void;
  /** `?k=` pins the ratio: the ladder leaves it alone. */
  ratioPinned: boolean;
}

/** Let the GPU settle after the game starts running or the layout changes (ms). */
const SETTLE_MS = 2000;
/** After a resolution or frame-rate step (ms). */
const STEP_SETTLE_MS = 1500;
/** Shadow changes recompile every lit material: wait longer before judging again (ms). */
const SHADOW_SETTLE_MS = 3000;
/** Smooth seconds in a row before shadows come back one tier. */
const SMOOTH_SECONDS = 20;
const MAX_UPS = 2;

export type Rung = 'shadows' | 'resolution' | 'cap30';

/**
 * One per game. Feed every rendered frame (`frame`) and the measured fps once a second (`second`);
 * pass `running = false` while loading, during the intro and countdown, and while paused.
 */
export class QualityLadder {
  readonly pacer = new FramePacer();
  private readonly governor = new FrameGovernor();
  private active = false;
  private smooth = 0;
  private ups = 0;
  private bottom = false;
  /** Steps taken this session, newest last (debug, and the soak scripts). */
  readonly steps: Rung[] = [];

  constructor(
    readonly level: GfxTier,
    private readonly target: LadderTarget,
    private readonly onBottom: (level: GfxTier) => void = noteSlow,
  ) {}

  get floor(): number {
    return LEVELS[this.level].kFloor;
  }

  /** Ignore frames for `ms` from `now` (layout change, map change). */
  hold(now: number, ms = SETTLE_MS): void {
    this.governor.hold(now + ms);
    this.smooth = 0;
  }

  frame(now: number, running: boolean): void {
    if (!running) {
      this.active = false;
      return;
    }
    if (!this.active) {
      this.active = true;
      this.hold(now);
      return;
    }
    if (this.governor.frame(now, this.pacer.targetMs)) this.stepDown(now);
  }

  /** Measured fps once a second: long smooth stretches bring shadows back one tier. */
  second(now: number, fps: number): void {
    if (!this.active || this.pacer.cap30 || this.ups >= MAX_UPS) {
      this.smooth = 0;
      return;
    }
    this.smooth = fps >= 0.95 * (1000 / this.pacer.targetMs) ? this.smooth + 1 : 0;
    if (this.smooth < SMOOTH_SECONDS) return;
    this.smooth = 0;
    if (this.target.shadows.stepUp()) {
      this.ups++;
      this.hold(now, SHADOW_SETTLE_MS);
    }
  }

  /** The next rung down; returns what changed (null at the bottom). */
  stepDown(now: number): Rung | null {
    const t = this.target;
    let rung: Rung | null = null;
    if (t.shadows.stepDown()) {
      rung = 'shadows';
    } else if (!t.ratioPinned && t.ratio() > this.floor + 0.01) {
      rung = 'resolution';
      t.setRatio(Math.max(this.floor, Math.round((t.ratio() - K_STEP) * 100) / 100));
    } else if (!this.pacer.cap30) {
      rung = 'cap30';
      this.pacer.cap30 = true;
    }
    if (rung) this.steps.push(rung);
    this.hold(now, rung === 'shadows' ? SHADOW_SETTLE_MS : STEP_SETTLE_MS);
    if (!rung || rung === 'cap30') {
      // Nothing lighter left within this level: the next game on this device starts lower.
      if (!this.bottom) this.onBottom(this.level);
      this.bottom = true;
    }
    return rung;
  }

  /** True once the last rung was reached (`noteSlow` has been called). */
  get atBottom(): boolean {
    return this.bottom;
  }
}
