/**
 * Petualangan Warna option pictures: each stage as a tiny map in its world's colours (drawn from
 * the stage data itself, so a picture never drifts from its stage), and a small scene per world.
 * Keys: `lvl-<levelId>` and `biome-<worldId>`.
 */
import { BIOME_IDS, LEVELS } from '../../games/warna/levels';
import { biomeScene, PALETTE } from '../../games/warna/palette';
import { levelThumbBody } from '../../games/warna/thumb';
import { thumbSvg } from './frame';

export const THUMBS: Record<string, () => string> = Object.fromEntries([
  ...LEVELS.map(
    (lv) => [`lvl-${lv.id}`, () => thumbSvg(PALETTE[lv.biome].sky[2], levelThumbBody(lv))] as const,
  ),
  ...BIOME_IDS.map((id) => [`biome-${id}`, () => thumbSvg(PALETTE[id].sky[1], biomeScene(id))] as const),
]);
