/**
 * SVG art rasterized into Phaser textures, at the canvas resolution (1.5x the 1280x720 world) or
 * better, so nothing is upscaled on a 1080p screen.
 */
import type { Look } from '@hoorah/protocol';
import type * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import {
  BACKDROP_H,
  BACKDROP_W,
  karungBackdrop,
  RACER_BOX,
  RACER_HEAD,
  sackBody,
  sackShirt,
} from '../../shared/art/karung';
import { avatarMarkup } from '../../shared/art/people';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { BLANK_KEY, HeadBank as LookHeads, lookId } from '../common/heads';
import { loadImage } from '../common/stage';

export { BLANK_KEY, lookId };

/** Canvas pixels per world pixel. */
export const RENDER_SCALE = 1.5;
/** Texture pixels per racer unit (racers are drawn at most ~1.15 world px per unit). */
export const RACER_PX = 2;

export const FACES: readonly Face[] = ['happy', 'effort', 'wow', 'sad'];

export const BACKDROP_KEY = 'karung-backdrop';
export const SHIRT_KEY = 'karung-shirt';
export const SACK_KEY = 'karung-sack';
/** Stable text id of a look, for texture keys. */
export const headKey = (look: Look, face: Face): string => `karung-head-${lookId(look)}-${face}`;
/** Transparent built-in texture shown until a head has been rasterized. */
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
