import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';
import { GROUP_COLOR, GROUPS } from './board';

const PAPER = '#F8EEDA';
const RIM = '#0B2E37';
const GOLD = '#E9B43C';
const INK = '#1E1F24';

/**
 * Juragan Nusantara phone: the printed board up close. Cream board paper in the middle, the teal
 * rim with its gold pinstripe around the edge, and a row of city tiles with their island colour
 * bands along the bottom, plus a couple of gold coins and an ivory die. Everything hugs the edges
 * so the controls sit on calm paper.
 */
function juraganScene(w: number, h: number): string {
  const rim = 8;
  const tileH = Math.round(Math.max(34, Math.min(54, h * 0.065)));
  const tileW = Math.max(46, Math.round(w / 7));
  const y0 = h - rim - tileH;
  let tiles = '';
  const n = Math.ceil(w / tileW) + 1;
  for (let i = 0; i < n; i++) {
    const x = i * tileW - tileW * 0.3;
    const band = GROUP_COLOR[GROUPS[i % GROUPS.length]!];
    tiles += `<rect x="${f1(x + 2)}" y="${f1(y0)}" width="${f1(tileW - 4)}" height="${tileH}" rx="4" fill="#FFF8EA" stroke="${RIM}" stroke-width="1.5"/>`;
    tiles += `<rect x="${f1(x + 2)}" y="${f1(y0)}" width="${f1(tileW - 4)}" height="${f1(tileH * 0.3)}" fill="${band}"/>`;
    tiles += `<rect x="${f1(x + tileW * 0.22)}" y="${f1(y0 + tileH * 0.55)}" width="${f1(tileW * 0.56)}" height="${f1(tileH * 0.1)}" rx="2" fill="#D9C9A8"/>`;
  }
  const coin = (cx: number, cy: number, r: number) =>
    `<ellipse cx="${f1(cx)}" cy="${f1(cy + r * 0.28)}" rx="${f1(r)}" ry="${f1(r * 0.62)}" fill="#B98512"/>` +
    `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(r)}" ry="${f1(r * 0.62)}" fill="${GOLD}" stroke="#8C6410" stroke-width="1.2"/>` +
    `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(r * 0.62)}" ry="${f1(r * 0.38)}" fill="none" stroke="#FFE08A" stroke-width="1.2"/>`;
  const die = (cx: number, cy: number, s: number, rot: number) => {
    const p = (x: number, y: number) =>
      `<circle cx="${f1(s * x)}" cy="${f1(s * y)}" r="${f1(s * 0.09)}" fill="#D8322A"/>`;
    return `<g transform="translate(${f1(cx)} ${f1(cy)}) rotate(${rot}) translate(${f1(-s / 2)} ${f1(-s / 2)})"><rect width="${f1(s)}" height="${f1(s)}" rx="${f1(s * 0.2)}" fill="#FFF8EC" stroke="${INK}" stroke-width="2.5"/>${p(0.28, 0.28)}${p(0.72, 0.28)}${p(0.28, 0.72)}${p(0.72, 0.72)}</g>`;
  };
  const s = Math.min(w, h);
  return [
    `<rect width="${w}" height="${h}" fill="${PAPER}"/>`,
    coin(w - s * 0.12, y0 - s * 0.05, s * 0.045),
    coin(w - s * 0.22, y0 - s * 0.03, s * 0.04),
    die(s * 0.12, y0 - s * 0.08, s * 0.1, -14),
    tiles,
    `<rect x="${rim / 2}" y="${rim / 2}" width="${w - rim}" height="${h - rim}" rx="14" fill="none" stroke="${RIM}" stroke-width="${rim}"/>`,
    `<rect x="${rim + 3}" y="${rim + 3}" width="${w - rim * 2 - 6}" height="${h - rim * 2 - 6}" rx="10" fill="none" stroke="${GOLD}" stroke-width="1.5"/>`,
  ].join('');
}

const band = (i: number) => GROUP_COLOR[GROUPS[i % GROUPS.length]!];

export const juraganTheme: ControllerTheme = {
  chrome: RIM,
  scene: juraganScene,
  stripEdge: {
    w: 96,
    h: 9,
    body: `<rect width="96" height="9" fill="${RIM}"/>${[0, 1, 2, 3, 4, 5]
      .map((i) => `<rect x="${i * 16 + 1}" y="1" width="14" height="6" rx="2" fill="${band(i)}"/>`)
      .join('')}`,
  },
};
