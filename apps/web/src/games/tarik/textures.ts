/**
 * SVG art rasterized into Phaser textures. Everything is rendered at the canvas resolution
 * (1.5x the 1280x720 world) or better, so nothing is upscaled on a 1080p screen.
 */
import { FRUITS, type Fruit } from '@hoorah/protocol';
import { type Face, fruitMarkup } from '../../shared/art/fruits';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { TEAM_BLUE, TEAM_RED, tarikBackground, tarikCharacter } from '../../shared/art/tarik';
import { loadImage } from '../common/stage';
import type { Team } from './logic';
import { tarikWing, WING_ART } from './wings';

/** Canvas pixels per world pixel. */
export const RENDER_SCALE = 1.5;

/** Character art box in its own units (feet at 0,0), symmetric in x so flipping keeps the feet. */
export const CHAR_BOX = { x: -62, y: -166, w: 124, h: 178 } as const;
/** Texture pixels per character unit: front pullers draw 2 world px per unit, x1.5 canvas = 3. */
export const CHAR_PX = 3;
/** Fruit head inside tarikCharacter: translate(-30.4 -158) scale(0.95) of a 64x64 grid. */
export const HEAD = { x: -30.4, y: -158, size: 64 * 0.95 } as const;
const HEAD_PX = Math.ceil(HEAD.size * CHAR_PX);

export const FACES: readonly Face[] = ['happy', 'sad', 'wow'];

export const BG_KEY = 'tarik-bg';
/** Field extensions left and right of the main art, seen on stages wider than 16:9. */
export const WING_KEY = { left: 'tarik-wing-left', right: 'tarik-wing-right' } as const;
export const FLAG_KEY = 'tarik-flag';
export const charKey = (team: Team, fruit: Fruit): string => `tarik-${team}-${fruit}`;
export const headKey = (fruit: Fruit, face: Face): string => `tarik-head-${fruit}-${face}`;

/** Merah putih pennant tied to the rope center; the knot sits at (0,0). */
function flagMarkup(): string {
  return [
    '<path d="M0 0 L0 6" stroke="#111214" stroke-width="2"/>',
    '<path d="M-9 4 H9 V15 H-9Z" fill="#E8352E"/>',
    '<path d="M-9 15 H9 V26 L0 22 L-9 26Z" fill="#FFFFFF"/>',
    '<path d="M-9 4 H9 V26 L0 22 L-9 26Z" fill="none" stroke="#111214" stroke-width="2" stroke-linejoin="round"/>',
    '<circle cx="0" cy="1" r="3.2" fill="#FFC928" stroke="#111214" stroke-width="1.6"/>',
  ].join('');
}
export const FLAG_BOX = { x: -12, y: -4, w: 24, h: 34 } as const;
const FLAG_PX = 3;

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
    url: svgUrl(`tarik-bg-${bgW}`, () => svgDoc(bgW, bgH, tarikBackground(), '0 0 640 360')),
    w: bgW,
    h: bgH,
  });
  const wingW = Math.round(WING_ART * 2 * RENDER_SCALE);
  for (const side of ['left', 'right'] as const) {
    const x0 = side === 'left' ? -WING_ART : 640;
    list.push({
      key: WING_KEY[side],
      url: svgUrl(`${WING_KEY[side]}-${wingW}`, () =>
        svgDoc(wingW, bgH, tarikWing(side), `${x0} 0 ${WING_ART} 360`),
      ),
      w: wingW,
      h: bgH,
    });
  }
  const cw = CHAR_BOX.w * CHAR_PX;
  const ch = CHAR_BOX.h * CHAR_PX;
  const vb = `${CHAR_BOX.x} ${CHAR_BOX.y} ${CHAR_BOX.w} ${CHAR_BOX.h}`;
  for (const team of ['red', 'blue'] as const) {
    const look = team === 'red' ? TEAM_RED : TEAM_BLUE;
    for (const fruit of FRUITS) {
      const key = charKey(team, fruit);
      list.push({
        key,
        url: svgUrl(`${key}-${CHAR_PX}`, () => svgDoc(cw, ch, tarikCharacter({ ...look, fruit }), vb)),
        w: cw,
        h: ch,
      });
    }
  }
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
  const fw = FLAG_BOX.w * FLAG_PX;
  const fh = FLAG_BOX.h * FLAG_PX;
  list.push({
    key: FLAG_KEY,
    url: svgUrl(`${FLAG_KEY}-${FLAG_PX}`, () =>
      svgDoc(fw, fh, flagMarkup(), `${FLAG_BOX.x} ${FLAG_BOX.y} ${FLAG_BOX.w} ${FLAG_BOX.h}`),
    ),
    w: fw,
    h: fh,
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
