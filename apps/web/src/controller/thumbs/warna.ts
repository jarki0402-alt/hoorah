/**
 * Petualangan Warna option pictures: each stage as a tiny cave map in the game's colours (drawn
 * from the stage data itself, so a picture never drifts from its stage). Keys: `lvl-<levelId>`.
 */
import { LEVELS } from '../../games/warna/levels';
import { levelThumbBody } from '../../games/warna/thumb';
import { thumbSvg } from './frame';

export const THUMBS: Record<string, () => string> = Object.fromEntries(
  LEVELS.map((lv) => [`lvl-${lv.id}`, () => thumbSvg('#0B1F26', levelThumbBody(lv))]),
);
