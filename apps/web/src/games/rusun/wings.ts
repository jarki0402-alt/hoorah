/**
 * More city left and right of the 1280x720 backdrop, seen on stages wider than 16:9. Drawn in
 * world units: the left wing covers x in [-WING_W, 0], the right wing [1280, 1280 + WING_W].
 * Layers match the main backdrop (sky bands, hazy mountains, tower blocks, kampung houses, road)
 * and the main art's shapes that cross x = 0 / 1280 are finished here so the seams do not cut them.
 */
import { f1, rect } from '../../shared/art/svg';

/** Wing width in world px: enough for a 32:9 stage. */
export const WING_W = 640;

type Box = [x: number, y: number, w: number];

const CITY: Record<'left' | 'right', Box[]> = {
  left: [
    [-626, 478, 66],
    [-548, 448, 58],
    [-478, 502, 84],
    [-380, 462, 62],
    [-306, 490, 70],
    [-224, 444, 56],
    [-150, 476, 74],
    [-64, 498, 54],
  ],
  right: [
    [1296, 470, 72],
    [1380, 500, 58],
    [1450, 446, 66],
    [1528, 486, 88],
    [1628, 456, 60],
    [1700, 492, 76],
    [1788, 462, 64],
    [1864, 484, 60],
  ],
};

const HOUSES: Record<'left' | 'right', Box[]> = {
  // The last left house sits under the main art's first one ([0, 616, 110]), redrawn on top.
  left: [
    [-632, 622, 120],
    [-500, 612, 110],
    [-380, 630, 100],
    [-272, 618, 120],
    [-140, 626, 116],
    [0, 616, 110],
  ],
  right: [
    [1150, 620, 130],
    [1292, 626, 110],
    [1410, 616, 124],
    [1546, 630, 96],
    [1652, 620, 120],
    [1784, 628, 110],
  ],
};

function cloud(cx: number, cy: number, s: number): string {
  const puffs = (fill: string, dy: number, base: number) =>
    `<g fill="${fill}" transform="translate(0 ${dy})"><circle cx="-70" cy="10" r="36"/><circle cx="-18" cy="-10" r="48"/><circle cx="42" cy="0" r="40"/><circle cx="92" cy="16" r="28"/><rect x="-100" y="8" width="214" height="${base}" rx="${base / 2}"/></g>`;
  return `<g transform="translate(${cx} ${cy}) scale(${s})">${puffs('#D3EAF7', 10, 36)}${puffs('#fff', 0, 30)}</g>`;
}

function palm(x: number, lean: number): string {
  const top = x + lean;
  return [
    `<path d="M${x} 676 C${x - 4 * Math.sign(lean)} 620 ${x + lean * 0.4} 560 ${top} 524" fill="none" stroke="#8A5A2B" stroke-width="10" stroke-linecap="round"/>`,
    `<g fill="#2E9E4F" transform="translate(${top} 524)"><path d="M0 0 C-26 -20 -56 -16 -76 0 C-50 -8 -26 -6 0 2Z"/><path d="M0 0 C20 -26 52 -28 74 -14 C48 -18 24 -12 0 2Z"/><path d="M0 0 C-6 -30 4 -50 20 -60 C12 -38 8 -20 2 2Z"/><path d="M0 0 C24 12 36 36 36 56 C26 32 14 18 -2 4Z"/></g>`,
  ].join('');
}

export function rusunWing(side: 'left' | 'right'): string {
  const x0 = side === 'left' ? -WING_W : 1280;
  const x1 = x0 + WING_W;
  const out: string[] = [];
  out.push(
    `<rect x="${x0}" y="0" width="${WING_W}" height="720" fill="#AEE0F7"/>`,
    `<rect x="${x0}" y="0" width="${WING_W}" height="420" fill="#92D2F5"/>`,
    `<rect x="${x0}" y="0" width="${WING_W}" height="250" fill="#79C6F2"/>`,
  );
  if (side === 'left') {
    out.push(
      '<path d="M-600 580 L-380 392 Q-350 370 -318 394 L-120 580Z" fill="#A8CCE2"/>',
      // The main art's left mountain starts at x = -60.
      '<path d="M-60 580 L226 300 Q262 274 300 300 L580 580Z" fill="#9CC3DD"/>',
      cloud(-380, 190, 0.8),
      '<path d="M-250 120 l8 6 l8 -6 M-226 138 l6 5 l6 -5" fill="none" stroke="#2B3A55" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    );
  } else {
    out.push(
      // The main art's right mountain runs out to x = 1420.
      '<path d="M860 580 L1110 360 Q1146 336 1180 362 L1420 580Z" fill="#A8CCE2"/>',
      '<path d="M1480 580 L1700 320 Q1734 296 1768 322 L1990 580Z" fill="#9CC3DD"/>',
      '<path d="M1718 314 Q1734 300 1752 312 L1744 320 Q1734 312 1726 320Z" fill="#7FA9C6"/>',
      cloud(1640, 150, 0.9),
      '<path d="M1460 90 l7 5 l7 -5" fill="none" stroke="#2B3A55" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    );
  }
  let bld = '';
  let win = '';
  for (const [x, y, bw] of CITY[side]) {
    bld += rect(x, y, bw, 620 - y);
    for (let yy = y + 10; yy < 600; yy += 18)
      for (let xx = x + 8; xx < x + bw - 8; xx += 14) win += rect(xx, yy, 6, 8);
  }
  out.push(`<path d="${bld}" fill="#7FB3CF"/><path d="${win}" fill="#C9E7F6"/>`);
  out.push(side === 'left' ? palm(-330, 24) : palm(1590, -22));
  let hw = '';
  let hs = '';
  let hwin = '';
  let roof = '';
  let roofLine = '';
  for (const [x, y, w] of HOUSES[side]) {
    hw += rect(x, y, w, 676 - y);
    hs += rect(x + w * 0.8, y, w * 0.2, 676 - y);
    hwin += rect(x + w * 0.2, y + 14, 14, 14) + rect(x + w * 0.52, y + 14, 14, 14);
    roof += `M${x - 8} ${y} L${x + w / 2} ${y - 34} L${x + w + 8} ${y}Z `;
    for (let k = 1; k < 4; k++)
      roofLine += `M${f1(x - 8 + k * 6)} ${f1(y - k * 8)} H${f1(x + w + 8 - k * 6)} `;
  }
  out.push(
    `<path d="${hw}" fill="#F4E1C1"/><path d="${hs}" fill="#DCC6A3"/><path d="${hwin}" fill="#2B3A55"/><path d="${roof}" fill="#D9622B"/><path d="${roofLine}" fill="none" stroke="#B84E1F" stroke-width="2"/>`,
  );
  out.push(
    `<rect x="${x0}" y="676" width="${WING_W}" height="12" fill="#C9CCD1"/><rect x="${x0}" y="688" width="${WING_W}" height="32" fill="#6B6F78"/>`,
  );
  // Lane marks on the main art's 100 px rhythm (x = 20 + 100k).
  let lane = '';
  for (let x = 20 + 100 * Math.ceil((x0 - 20) / 100); x < x1; x += 100) lane += `M${x} 704 h40 `;
  out.push(`<path d="${lane}" stroke="#fff" stroke-width="3"/>`);
  return out.join('');
}
