/**
 * Adaptive music rules, kept pure so they are tested without Web Audio.
 *
 * Intensity layers: a song channel may carry `tier: 0–3`; it sounds while tier <= intensity.
 * Channels without a tier are tier 0 and always sound, so older songs play exactly as before.
 * Layer changes fade per channel; the song itself keeps playing.
 *
 * Hurry: the tempo eases up by HURRY_RATE (about 8%) and back, measured in musical time so the
 * groove never jumps.
 *
 * Ducking: announcement sounds briefly pull the music down so they read from the sofa.
 */

export type Intensity = 0 | 1 | 2 | 3;
export type Tier = 0 | 1 | 2 | 3;

/** Fade time constant of one layer (≈ 1 s to settle). */
export const TIER_FADE_TAU = 0.3;
/** After a layer is switched off its notes keep being scheduled this long, so the fade is heard. */
export const TIER_TAIL = TIER_FADE_TAU * 6;
/** Tempo factor while hurrying. */
export const HURRY_RATE = 1.08;
/** Time constant (seconds of music) of the tempo ease. */
export const HURRY_TAU = 1.2;

export function clampIntensity(level: number): Intensity {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(3, Math.round(level))) as Intensity;
}

/** Whether a channel with this tier sounds at this intensity. */
export function tierAudible(tier: Tier | undefined, intensity: Intensity): boolean {
  return (tier ?? 0) <= intensity;
}

/**
 * Whether a channel's notes at context time `t` still need scheduling: always while it is on,
 * and for TIER_TAIL after it was switched off at `offAt`. Silent layers cost nothing.
 */
export function layerScheduled(on: boolean, offAt: number, t: number): boolean {
  return on || t < offAt + TIER_TAIL;
}

/** Tempo factor for the hurry flag. */
export function hurryTarget(on: boolean): number {
  return on ? HURRY_RATE : 1;
}

/**
 * Moves the tempo factor toward `target` after `dt` seconds of music (exponential ease).
 * Snaps when within 0.0005 so the factor settles on exactly 1 (or HURRY_RATE) again.
 */
export function easeRate(current: number, target: number, dt: number, tau = HURRY_TAU): number {
  if (current === target) return target;
  const next = target + (current - target) * Math.exp(-Math.max(0, dt) / tau);
  return Math.abs(next - target) < 0.0005 ? target : next;
}

export interface Duck {
  /** Music gain while ducked (1 = untouched). */
  depth: number;
  /** Seconds the music stays down before it recovers. */
  hold: number;
}

/** Sounds that duck the music, with how deep and how long. */
export const DUCKS: Readonly<Record<string, Duck>> = {
  weker: { depth: 0.45, hold: 0.95 },
  gong: { depth: 0.35, hold: 1.4 },
  rooster: { depth: 0.4, hold: 1.1 },
  bell: { depth: 0.5, hold: 0.9 },
  flute: { depth: 0.4, hold: 1.0 },
  round: { depth: 0.4, hold: 0.85 },
  'stinger-win': { depth: 0.3, hold: 1.3 },
  'stinger-fall': { depth: 0.3, hold: 1.4 },
};

/**
 * Overlapping ducks merge: the music stays at the deepest requested level until the latest end.
 * `prev` is the duck still running (null when the music is at full level).
 */
export function mergeDuck(
  prev: { depth: number; until: number } | null,
  now: number,
  duck: Duck,
): { depth: number; until: number } {
  const until = now + duck.hold;
  if (!prev || prev.until <= now) return { depth: duck.depth, until };
  return { depth: Math.min(prev.depth, duck.depth), until: Math.max(prev.until, until) };
}
