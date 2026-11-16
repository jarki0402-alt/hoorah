import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';
import { SWATCH } from './colors';

/**
 * Ludo phone: a close-up of the board. Cream surface with the faint squares of the track, the
 * dark frame around the edge, a home column peeking in at the bottom corners and a star square,
 * all kept to the edges so the controls sit on calm paper.
 */
function ludoScene(w: number, h: number): string {
  const cell = Math.max(34, Math.round(Math.min(w, h) / 9));
  let grid = '';
  for (let x = (w % cell) / 2; x <= w; x += cell) grid += `M${f1(x)} 0 V${h} `;
  for (let y = (h % cell) / 2; y <= h; y += cell) grid += `M0 ${f1(y)} H${w} `;
  const frame = 7;
  // A run of coloured squares along the bottom edge, like a home column.
  const row = h - frame - cell * 0.9;
  let cells = '';
  const colors = [SWATCH[0].main, SWATCH[1].main, SWATCH[2].main, SWATCH[3].main];
  const n = Math.ceil(w / cell) + 1;
  for (let i = 0; i < n; i++) {
    const x = i * cell - cell * 0.35;
    const c = colors[Math.floor(i / 2) % 4]!;
    cells += `<rect x="${f1(x + 3)}" y="${f1(row)}" width="${f1(cell - 6)}" height="${f1(cell)}" rx="7" fill="${c}" stroke="#1E1F24" stroke-width="2.5"/>`;
  }
  const star = (cx: number, cy: number, r: number) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      d += `${i ? 'L' : 'M'}${f1(cx + Math.cos(a) * rr)} ${f1(cy + Math.sin(a) * rr)}`;
    }
    return `<path d="${d}Z" fill="#E3CFA6"/>`;
  };
  return [
    `<rect width="${w}" height="${h}" fill="#FFF6E3"/>`,
    `<path d="${grid}" stroke="#EFE2C6" stroke-width="2"/>`,
    star(w - cell * 0.9, h * 0.34, cell * 0.42),
    star(cell * 0.8, h * 0.62, cell * 0.36),
    cells,
    `<rect x="${frame / 2}" y="${frame / 2}" width="${w - frame}" height="${h - frame}" rx="14" fill="none" stroke="#1E1F24" stroke-width="${frame}"/>`,
  ].join('');
}

export const ludoTheme: ControllerTheme = {
  chrome: '#1E1F24',
  scene: ludoScene,
  stripEdge: {
    w: 64,
    h: 9,
    body: `<rect width="64" height="9" fill="#1E1F24"/><rect x="1" y="1" width="14" height="6" rx="2" fill="${SWATCH[0].main}"/><rect x="17" y="1" width="14" height="6" rx="2" fill="${SWATCH[1].main}"/><rect x="33" y="1" width="14" height="6" rx="2" fill="${SWATCH[2].main}"/><rect x="49" y="1" width="14" height="6" rx="2" fill="${SWATCH[3].main}"/>`,
  },
};
