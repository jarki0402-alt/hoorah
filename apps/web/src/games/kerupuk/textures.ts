/**
 * SVG art rasterized into Phaser textures, all at the canvas resolution (1.5x the 1280x720 world)
 * or better so nothing is upscaled on a 1080p screen.
 */
import { type Look, PLAYER_COLORS } from '@hoorah/protocol';
import type * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import { HEAD, KERUPUK_R, kerupukBackdrop, kerupukBody, kerupukMarkup } from '../../shared/art/kerupuk';
import { avatarMarkup } from '../../shared/art/people';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { BLANK_KEY, HeadBank as LookHeads, lookId } from '../common/heads';
import { loadImage } from '../common/stage';
import { BITES } from './logic';

export { BLANK_KEY, lookId };

/** Canvas pixels per world pixel. */
export const RENDER_SCALE = 1.5;
/** Texture pixels per character unit (characters are drawn up to 1.8 world px per unit). */
export const CHAR_PX = 3;
/** Wing width in art units (world px = 2x): enough for a 32:9 stage. */
export const WING_ART = 320;

export const BODY_BOX = { x: -44, y: -110, w: 88, h: 116 } as const;
export const KER_BOX = KERUPUK_R + 4;
export const FACES: readonly Face[] = ['happy', 'effort', 'wow', 'sad'];

export const BG_KEY = 'kp-bg';
export const WING_KEY = { left: 'kp-wing-left', right: 'kp-wing-right' } as const;
export const bodyKey = (color: string): string => `kp-body-${color.slice(1).toLowerCase()}`;
/** Stable text id of a look, for texture keys. */
export const headKey = (look: Look, face: Face): string => `kp-head-${lookId(look)}-${face}`;
/** Transparent built-in texture shown until a head has been rasterized. */
export const kerupukKey = (bites: number): string => `kp-ker-${bites}`;
export const HEAD_PX = Math.ceil(HEAD.size * CHAR_PX);

interface Job {
  key: string;
  url: string;
  w: number;
  h: number;
}

function jobs(): Job[] {
  const list: Job[] = [];
  const bgW = Math.round(1280 * RENDER_SCALE);
  const bgH = Math.round(720 * RENDER_SCALE);
  list.push({
    key: BG_KEY,
    url: svgUrl(`kp-bg-${bgW}`, () => svgDoc(bgW, bgH, kerupukBackdrop(0, 640), '0 0 640 360')),
    w: bgW,
    h: bgH,
  });
  const wingW = Math.round(WING_ART * 2 * RENDER_SCALE);
  for (const side of ['left', 'right'] as const) {
    const x0 = side === 'left' ? -WING_ART : 640;
    list.push({
      key: WING_KEY[side],
      url: svgUrl(`${WING_KEY[side]}-${wingW}`, () =>
        svgDoc(wingW, bgH, kerupukBackdrop(x0, x0 + WING_ART), `${x0} 0 ${WING_ART} 360`),
      ),
      w: wingW,
      h: bgH,
    });
  }
  const bw = BODY_BOX.w * CHAR_PX;
  const bh = BODY_BOX.h * CHAR_PX;
  const bvb = `${BODY_BOX.x} ${BODY_BOX.y} ${BODY_BOX.w} ${BODY_BOX.h}`;
  for (const color of PLAYER_COLORS) {
    const key = bodyKey(color);
    list.push({
      key,
      url: svgUrl(`${key}-${CHAR_PX}`, () => svgDoc(bw, bh, kerupukBody(color), bvb)),
      w: bw,
      h: bh,
    });
  }
  const kp = KER_BOX * 2 * CHAR_PX;
  for (let b = 0; b < BITES; b++) {
    const key = kerupukKey(b);
    list.push({
      key,
      url: svgUrl(`${key}-${kp}`, () =>
        svgDoc(kp, kp, kerupukMarkup(b, String(b)), `${-KER_BOX} ${-KER_BOX} ${KER_BOX * 2} ${KER_BOX * 2}`),
      ),
      w: kp,
      h: kp,
    });
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
