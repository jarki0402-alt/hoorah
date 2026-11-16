/**
 * SVG art rasterized into Phaser textures, at the canvas resolution (1.5x the 1280x720 world) or
 * better, so nothing is upscaled on a 1080p screen.
 */
import { FRUITS, type Fruit } from '@hoorah/protocol';
import { type Face, fruitMarkup } from '../../shared/art/fruits';
import {
  BACKDROP_H,
  BACKDROP_W,
  karungBackdrop,
  RACER_BOX,
  RACER_HEAD,
  sackBody,
  sackShirt,
} from '../../shared/art/karung';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { loadImage } from '../common/stage';

/** Canvas pixels per world pixel. */
export const RENDER_SCALE = 1.5;
/** Texture pixels per racer unit (racers are drawn at most ~1.15 world px per unit). */
export const RACER_PX = 2;

export const FACES: readonly Face[] = ['happy', 'effort', 'wow', 'sad'];

export const BACKDROP_KEY = 'karung-backdrop';
export const SHIRT_KEY = 'karung-shirt';
export const SACK_KEY = 'karung-sack';
export const headKey = (fruit: Fruit, face: Face): string => `karung-head-${fruit}-${face}`;
/** Head texture size in racer units (64 grid scaled like in the art). */
export const HEAD_SIZE = 64 * RACER_HEAD.scale;
const HEAD_PX = Math.ceil(HEAD_SIZE * RACER_PX);

interface Job {
  key: string;
  url: string;
  w: number;
  h: number;
}

function jobs(): Job[] {
  const list: Job[] = [];
  const bw = Math.round(BACKDROP_W * RENDER_SCALE);
  const bh = Math.round(BACKDROP_H * RENDER_SCALE);
  list.push({
    key: BACKDROP_KEY,
    url: svgUrl(`${BACKDROP_KEY}-${bw}`, () =>
      svgDoc(bw, bh, karungBackdrop(), `0 0 ${BACKDROP_W} ${BACKDROP_H}`),
    ),
    w: bw,
    h: bh,
  });
  const rw = RACER_BOX.w * RACER_PX;
  const rh = RACER_BOX.h * RACER_PX;
  const vb = `${RACER_BOX.x} ${RACER_BOX.y} ${RACER_BOX.w} ${RACER_BOX.h}`;
  list.push({
    key: SHIRT_KEY,
    url: svgUrl(`${SHIRT_KEY}-${RACER_PX}`, () => svgDoc(rw, rh, sackShirt(), vb)),
    w: rw,
    h: rh,
  });
  list.push({
    key: SACK_KEY,
    url: svgUrl(`${SACK_KEY}-${RACER_PX}`, () => svgDoc(rw, rh, sackBody(), vb)),
    w: rw,
    h: rh,
  });
  for (const fruit of FRUITS) {
    for (const face of FACES) {
      const key = headKey(fruit, face);
      list.push({
        key,
        url: svgUrl(`${key}-${HEAD_PX}`, () =>
          svgDoc(HEAD_PX, HEAD_PX, fruitMarkup(fruit, face), '0 0 64 64'),
        ),
        w: HEAD_PX,
        h: HEAD_PX,
      });
    }
  }
  return list;
}

/** Rasterize every texture up front (a few dozen small SVGs, well under a second). */
export async function loadTextures(): Promise<Map<string, HTMLImageElement>> {
  const list = jobs();
  const images = await Promise.all(list.map((j) => loadImage(j.url, j.w, j.h)));
  const out = new Map<string, HTMLImageElement>();
  for (let i = 0; i < list.length; i++) out.set(list[i]!.key, images[i]!);
  return out;
}
