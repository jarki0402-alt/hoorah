/**
 * Fruit avatars rasterized from the shared SVG art, at a resolution that stays sharp on a 4K
 * main screen (markers are ~30 world px, the canvas is 1.5x the world).
 */
import { FRUITS, type Fruit } from '@hoorah/protocol';
import { type Face, fruitMarkup } from '../../shared/art/fruits';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { loadImage } from '../common/stage';

/** Canvas pixels per world pixel. */
export const RENDER_SCALE = 1.5;
const HEAD_PX = 112;

/** Home, out on a trail, freshly back (protected). */
export const FACES: readonly Face[] = ['happy', 'effort', 'wow'];

export const headKey = (fruit: Fruit, face: Face): string => `wl-head-${fruit}-${face}`;

/** Rasterize every avatar up front (24 small SVGs). */
export async function loadTextures(): Promise<Map<string, HTMLImageElement>> {
  const jobs: { key: string; url: string }[] = [];
  for (const fruit of FRUITS) {
    for (const face of FACES) {
      const key = headKey(fruit, face);
      jobs.push({
        key,
        url: svgUrl(`${key}-${HEAD_PX}`, () =>
          svgDoc(HEAD_PX, HEAD_PX, fruitMarkup(fruit, face), '0 0 64 64'),
        ),
      });
    }
  }
  const images = await Promise.all(jobs.map((j) => loadImage(j.url, HEAD_PX, HEAD_PX)));
  const out = new Map<string, HTMLImageElement>();
  jobs.forEach((j, i) => {
    out.set(j.key, images[i]!);
  });
  return out;
}
