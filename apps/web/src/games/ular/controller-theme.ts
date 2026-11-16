/**
 * Phone theme for Ular Tangga: the same woven pandan mat the board lies on and a bamboo ladder
 * up the right edge. The LEMPAR button is a big die; the Host strip is edged with board squares.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';
import { ladderMarkup } from '../../shared/art/ular';

function matPattern(): string {
  const s = 40;
  const h = s / 2;
  const q = s / 6;
  let a = '';
  let b = '';
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * h;
    const oy = Math.floor(k / 2) * h;
    const across = k === 0 || k === 3;
    for (let i = 0; i < 3; i++) {
      const r = across ? `M${ox} ${oy + i * q}h${h}v${q}h${-h}Z` : `M${ox + i * q} ${oy}h${q}v${h}h${-q}Z`;
      if (i % 2) a += r;
      else b += r;
    }
  }
  return `<pattern id="ul-mat" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><path d="${b}" fill="#ECCD93"/><path d="${a}" fill="#E6C487"/><path d="M0 0H${s}M0 ${h}H${s}M0 0V${s}M${h} 0V${s}" stroke="#D2AC6E" stroke-width="1" opacity="0.5"/></pattern>`;
}

function ularScene(w: number, h: number): string {
  // The ladder hugs the right edge, outside the text column.
  const lx = w - 14;
  return [
    `<defs>${matPattern()}</defs>`,
    `<rect width="${w}" height="${h}" fill="#EBCB90"/>`,
    `<rect width="${w}" height="${h}" fill="url(#ul-mat)"/>`,
    ladderMarkup({ x: lx, y: h + 20 }, { x: lx, y: -20 }, 15, 26),
    `<rect x="0" y="0" width="${f1(w)}" height="3" fill="#8A5A2B"/>`,
  ].join('');
}

const CELLS = ['#FFF1C9', '#FFD9A0', '#CDEBB0', '#B9E2F0'];

/** Die face for the LEMPAR button (five pips), drawn as a texture behind the label. */
const DIE_FACE =
  '<g fill="#E2543A"><circle cx="14" cy="14" r="6"/><circle cx="46" cy="14" r="6"/><circle cx="30" cy="30" r="6"/><circle cx="14" cy="46" r="6"/><circle cx="46" cy="46" r="6"/></g>';

export const ularTheme: ControllerTheme = {
  chrome: '#8A5A2B',
  scene: ularScene,
  stripEdge: {
    w: 40,
    h: 10,
    body:
      CELLS.map((c, i) => `<rect x="${i * 10}" width="10" height="10" fill="${c}"/>`).join('') +
      '<path d="M0 9.4H40" stroke="#6B4423" stroke-width="1.2"/>',
  },
  textures: {
    '--t-die': { w: 60, h: 60, body: DIE_FACE },
  },
};
