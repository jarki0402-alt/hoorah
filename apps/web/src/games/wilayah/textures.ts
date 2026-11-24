/**
 * Player avatars rasterized from the shared SVG art the first time a look shows up, at a
 * resolution that stays sharp on a 4K main screen (markers are ~30 world px, the canvas is 1.5x
 * the world).
 */
import type { Look } from '@hoorah/protocol';
import type * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import { avatarMarkup } from '../../shared/art/people';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { BLANK_KEY, HeadBank as LookHeads, lookId } from '../common/heads';
import { loadImage } from '../common/stage';

export { BLANK_KEY, lookId };

/** Canvas pixels per world pixel. */
export const RENDER_SCALE = 1.5;
const HEAD_PX = 112;

/** Home, out on a trail, freshly back (protected). */
export const FACES: readonly Face[] = ['happy', 'effort', 'wow'];

/** Stable text id of a look, for texture keys. */
export const headKey = (look: Look, face: Face): string => `wl-head-${lookId(look)}-${face}`;
/** Transparent built-in texture shown until a head has been rasterized. */

/** Rasterizes one look's head in every face. */
async function loadHeads(look: Look): Promise<Map<string, HTMLImageElement>> {
  const keys = FACES.map((face) => headKey(look, face));
  const images = await Promise.all(
    FACES.map((face, i) =>
      loadImage(
        svgUrl(`${keys[i]}-${HEAD_PX}`, () =>
          svgDoc(HEAD_PX, HEAD_PX, avatarMarkup(look, face), '0 0 64 64'),
        ),
        HEAD_PX,
        HEAD_PX,
      ),
    ),
  );
  const out = new Map<string, HTMLImageElement>();
  keys.forEach((k, i) => {
    out.set(k, images[i]!);
  });
  return out;
}

/** Player heads as Phaser textures, rasterized the first time a look shows up. */
export class HeadBank extends LookHeads<Face> {
  constructor(textures: Phaser.Textures.TextureManager, onReady: (look: Look) => void) {
    super(textures, headKey, loadHeads, onReady);
  }
}
