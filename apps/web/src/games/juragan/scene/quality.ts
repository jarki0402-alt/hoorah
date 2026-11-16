/**
 * Graphics settings of the tabletop per device level (see `common/gfx.ts`), and the ladder the
 * frame governor walks down when frames run slow. Pure, unit tested.
 *
 *  - high:   laptops and desktops. The full look: antialiasing, up to 2x the 1280x720 stage,
 *            2048 soft shadows, clear-coated pieces with reflections, the sharpest board print.
 *  - medium: tablets, phones, small iGPUs. Antialiasing, about stage resolution, 1024 shadows.
 *  - low:    Smart TVs and weak GPUs. No antialiasing, 0.75 of the stage (960x540), no shadow map
 *            (soft blob shadows instead), Lambert/Phong materials without reflections, a smaller
 *            board print and fewer particles.
 */
import { type GfxTier, isGfxTier } from '../../common/gfx';

export interface Quality {
  tier: GfxTier;
  /** MSAA (a context flag: fixed for the whole game). */
  antialias: boolean;
  /** Backing pixels per stage px at start; never above the real screen density. */
  maxRatio: number;
  /** The governor never goes below this. */
  minRatio: number;
  /** Shadow map size; 0 = no shadow map (blob shadows under the pieces). */
  shadowMap: number;
  shadowRadius: number;
  /** Clear-coated physical materials lit by the room reflection; false = Lambert/Phong only. */
  rich: boolean;
  /** Board print size (high uses 3072 when the GPU allows 4096 textures). */
  boardPrint: number;
  wood: number;
  /** Segments of the table plane (it carries the vignette in vertex colours). */
  tableSegments: number;
  /** Upper limit for anisotropic filtering of the board and the table. */
  anisotropy: number;
  /** Paint drops of a takeover splash. */
  splashDrops: number;
  /** Most coins flying for one payment. */
  coinsMax: number;
}

export const QUALITY: Readonly<Record<GfxTier, Readonly<Quality>>> = {
  high: {
    tier: 'high',
    antialias: true,
    maxRatio: 2,
    minRatio: 0.75,
    shadowMap: 2048,
    shadowRadius: 3,
    rich: true,
    boardPrint: 3072,
    wood: 1024,
    tableSegments: 64,
    anisotropy: 16,
    splashDrops: 16,
    coinsMax: 14,
  },
  medium: {
    tier: 'medium',
    antialias: true,
    maxRatio: 1.25,
    minRatio: 0.65,
    shadowMap: 1024,
    shadowRadius: 2,
    rich: true,
    boardPrint: 2048,
    wood: 1024,
    tableSegments: 64,
    anisotropy: 8,
    splashDrops: 16,
    coinsMax: 14,
  },
  low: {
    tier: 'low',
    antialias: false,
    maxRatio: 0.75,
    minRatio: 0.5,
    shadowMap: 0,
    shadowRadius: 0,
    rich: false,
    boardPrint: 1024,
    wood: 512,
    tableSegments: 32,
    anisotropy: 4,
    splashDrops: 8,
    coinsMax: 8,
  },
};

const Q_PARAM: Readonly<Record<string, GfxTier>> = { '1': 'low', '2': 'medium', '3': 'high' };

/**
 * The level to start at: the debug parameter `?q=1|2|3` (low, medium, high) wins, then the device
 * profile (which already honours `?gfx=`).
 */
export function pickTier(profile: GfxTier, search: string): GfxTier {
  const q = new URLSearchParams(search).get('q');
  if (q !== null && Q_PARAM[q]) return Q_PARAM[q];
  return isGfxTier(profile) ? profile : 'high';
}

/** Resolution step of the governor (backing px per stage px). */
export const RATIO_STEP = 0.15;

export interface LadderState {
  shadowMap: number;
  /** Effective backing ratio now (already limited by the screen). */
  ratio: number;
  minRatio: number;
  cap30: boolean;
}

export type Rung =
  | { kind: 'shadow'; size: number }
  | { kind: 'ratio'; ratio: number }
  | { kind: 'cap30' }
  | { kind: 'none' };

/**
 * The next step down: halve a big shadow map, then drop shadows (blob shadows take over), then
 * lower the resolution in steps to the level's floor, then cap at an even 30 fps.
 */
export function nextRung(s: LadderState): Rung {
  if (s.shadowMap > 1024) return { kind: 'shadow', size: s.shadowMap / 2 };
  if (s.shadowMap > 0) return { kind: 'shadow', size: 0 };
  if (s.ratio > s.minRatio + 0.01) {
    const next = Math.round((s.ratio - RATIO_STEP) * 100) / 100;
    return { kind: 'ratio', ratio: Math.max(s.minRatio, next) };
  }
  if (!s.cap30) return { kind: 'cap30' };
  return { kind: 'none' };
}

/** Text for the step log (`window.__juraganStats().steps`). */
export function rungLabel(r: Rung): string {
  switch (r.kind) {
    case 'shadow':
      return r.size > 0 ? `shadow ${r.size}` : 'shadow off';
    case 'ratio':
      return `ratio ${r.ratio.toFixed(2)}`;
    case 'cap30':
      return 'cap30';
    case 'none':
      return 'none';
  }
}
