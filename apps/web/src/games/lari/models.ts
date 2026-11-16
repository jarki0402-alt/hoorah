/**
 * Catalogue of the Lari Terus model packs (built by tools/assets/lari, loaded by assets.ts):
 * which model shows each obstacle and the sizes the game lays them out with. Every model also
 * has a lighter `<name>@1` level of detail.
 *
 * Model space: y up, ground at y = 0, the face a runner sees first points to +z, centred on x.
 * Single-lane obstacles fit in 1.75 m of width; wide ones span the three lanes (6.6 m).
 */
import type { Obstacle } from './track';

/** Obstacle models (each also has `@1`). */
export const OBSTACLE_MODELS = [
  'low0',
  'low1',
  'low2',
  'high0',
  'high1-0',
  'high1-1',
  'high2',
  'block0',
  'block1',
  'block2',
  'block3',
] as const;

/** Rooftop clutter (each also has `@1` and the very light `@2`). */
export const DECOR_KINDS = [
  'tankOrange',
  'tankBlue',
  'ac',
  'antenna',
  'dish',
  'plants',
  'hut',
  'coop',
  'solar',
  'chairs',
  'vents',
  'tree',
  'planter',
] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/** Building pieces and sky from the city pack. */
export const CITY_MODELS = [
  'parapet',
  'parapet@1',
  'parapet_s',
  'parapet_s@1',
  'facade_a',
  'facade_a@1',
  'facade_b',
  'facade_b@1',
  'facade_c',
  'facade_c@1',
  'facade_d',
  'facade_d@1',
  'edge',
  'rim',
  'span',
  'span@1',
  'billboard',
  'cloud0',
  'cloud1',
  'cloud2',
  'cloud3',
] as const;

/** Every model name the game asks the packs for. */
export function requiredModels(): string[] {
  return [
    ...OBSTACLE_MODELS.flatMap((n) => [n, `${n}@1`]),
    ...DECOR_KINDS.flatMap((n) => [n, `${n}@1`, `${n}@2`]),
    ...CITY_MODELS,
    'coin',
    'coin@1',
    'post',
    'post@1',
  ];
}

/** Length of one AC-row segment (block variant 3); long blocks repeat it. */
export const AC_ROW_STEP = 1.25;

/**
 * Model name for an obstacle. low: 0 pipe rack, 1 striped barrier, 2 duct across the roof.
 * high: 0 duck-under sign, 1 laundry line (two cloth sets), 2 laundry line across the roof.
 * block: 0 AC stack, 1 water tank on a stand, 2 crates and sacks, 3 row of AC units.
 */
export function obstacleModel(o: Obstacle): string {
  if (o.kind === 'high' && o.variant === 1) return `high1-${o.id % 2}`;
  return `${o.kind}${o.variant}`;
}
