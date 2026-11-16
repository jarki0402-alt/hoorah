/**
 * Jago Masak graphics settings per device level (`common/gfx.ts`) and the step-down ladder the
 * frame governor walks while frames stay slow: shadows first, then resolution, then an even
 * 30 fps. No rendering here (unit tested); the view applies each rung.
 */
import { FrameGovernor, FramePacer, type GfxTier, noteSlow } from '../../common/gfx';

/**
 * - full:  2048 shadow map; with one or two stations each view renders its own (the food casts).
 * - light: 1024 map of the fixed set only, redrawn when the dish changes (every other frame in the
 *          wide shot, where the chef moves).
 * - off:   no shadow map; soft blob shadows under the cookware keep the scene grounded.
 */
export type ShadowLevel = 'full' | 'light' | 'off';

export interface Rung {
  shadows: ShadowLevel;
  /** Backing-store scale of the 1280x720 stage (1.5 = 1920x1080). */
  ratio: number;
  /** Render every other display frame. */
  cap30: boolean;
}

export interface TierPlan {
  tier: GfxTier;
  /** Multisampled antialiasing (a context flag: fixed for the whole game). */
  msaa: boolean;
  /** The fixed set's lighting is baked into its colours at load and drawn unlit. */
  bakedSet: boolean;
  /** Share of the steam, smoke and spark particles that is spawned. */
  particles: number;
  /** Fewer, simpler rice grains. Fixed for the whole game. */
  lowDetail: boolean;
  start: Rung;
  /** Lowest backing ratio the ladder goes to. */
  floor: number;
}

/** Resolution step of the ladder. */
export const RATIO_STEP = 0.15;

export const PLANS: Readonly<Record<GfxTier, TierPlan>> = {
  high: {
    tier: 'high',
    msaa: true,
    bakedSet: false,
    particles: 1,
    lowDetail: false,
    start: { shadows: 'full', ratio: 1.5, cap30: false },
    floor: 0.75,
  },
  medium: {
    tier: 'medium',
    msaa: true,
    bakedSet: false,
    particles: 1,
    lowDetail: false,
    start: { shadows: 'light', ratio: 1.15, cap30: false },
    floor: 0.65,
  },
  low: {
    tier: 'low',
    msaa: false,
    bakedSet: true,
    particles: 0.5,
    lowDetail: true,
    start: { shadows: 'off', ratio: 0.75, cap30: false },
    floor: 0.5,
  },
};

/** Shadow map size of a level (0 = none). */
export function shadowMapSize(level: ShadowLevel): number {
  return level === 'full' ? 2048 : level === 'light' ? 1024 : 0;
}

/** The next rung down, or null when there is none left. */
export function stepDown(r: Rung, floor: number): Rung | null {
  if (r.shadows === 'full') return { ...r, shadows: 'light' };
  if (r.shadows === 'light') return { ...r, shadows: 'off' };
  if (r.ratio > floor + 1e-6) {
    return { ...r, ratio: Math.max(floor, Math.round((r.ratio - RATIO_STEP) * 100) / 100) };
  }
  if (!r.cap30) return { ...r, cap30: true };
  return null;
}

/** Every rung from `start` to the bottom, in order (diagnostics and tests). */
export function ladder(plan: TierPlan): Rung[] {
  const out: Rung[] = [plan.start];
  for (let r = stepDown(plan.start, plan.floor); r; r = stepDown(r, plan.floor)) out.push(r);
  return out;
}

/** Short text of a rung for the change log: "shadows light, 1.35x, 30 fps". */
export function describeRung(r: Rung): string {
  return `shadows ${r.shadows}, ${r.ratio}x${r.cap30 ? ', 30 fps' : ''}`;
}

/**
 * The current rung, the 30 fps pacer and the governor that decides when to step down. On reaching
 * the last rung the level is reported as too heavy for this device (`noteSlow`), so the next game
 * starts one level lower.
 */
export class QualityLadder {
  readonly pacer = new FramePacer();
  private readonly governor = new FrameGovernor();
  private current: Rung;
  private bottomed = false;
  /** Every step taken, oldest first ("12.4s shadows off, 1.5x"). */
  readonly log: string[] = [];

  constructor(
    readonly plan: TierPlan,
    /** False: stay on the starting rung (poster capture). */
    private readonly adaptive = true,
    private readonly onBottom: (tier: GfxTier) => void = noteSlow,
  ) {
    this.current = plan.start;
    this.pacer.cap30 = plan.start.cap30;
  }

  get rung(): Rung {
    return this.current;
  }

  /** True once the last rung was reached. */
  get atBottom(): boolean {
    return this.bottomed;
  }

  /** Ignore frames until `until` (performance.now() time): loading, shader compile, intros. */
  hold(until: number): void {
    this.governor.hold(until);
  }

  /** Top of the animation callback: false means skip this display frame. */
  due(now: number): boolean {
    return this.pacer.due(now);
  }

  /** Feed each rendered frame. Returns the new rung when quality just stepped down. */
  frame(now: number): Rung | null {
    if (!this.adaptive || this.bottomed) return null;
    if (!this.governor.frame(now, this.pacer.targetMs)) return null;
    const next = stepDown(this.current, this.plan.floor);
    if (!next) return null;
    this.current = next;
    this.pacer.cap30 = next.cap30;
    this.log.push(`${(now / 1000).toFixed(1)}s ${describeRung(next)}`);
    if (!stepDown(next, this.plan.floor)) {
      this.bottomed = true;
      this.onBottom(this.plan.tier);
    }
    return next;
  }
}
