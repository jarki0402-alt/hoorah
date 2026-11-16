import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

/**
 * Congklak phone: the warm walnut table the board sits on, with a strip of the board's carved
 * rim (holes and a few cowries) along the bottom edge, below every control.
 */
function congklakScene(w: number, h: number): string {
  const rnd = seeded(29);
  const plank = Math.max(70, Math.round(h / 9));
  let seams = '';
  let grain = '';
  for (let y = plank; y < h; y += plank) {
    seams += `M0 ${y} H${w} `;
    for (let k = 0; k < 2; k++) {
      const gy = y - plank * (0.3 + k * 0.35) + rnd() * 6;
      const x0 = -20 + rnd() * w * 0.3;
      const x1 = x0 + w * (0.5 + rnd() * 0.6);
      grain += `M${f1(x0)} ${f1(gy)} C${f1(x0 + w * 0.2)} ${f1(gy - 5)} ${f1(x1 - w * 0.2)} ${f1(gy + 5)} ${f1(x1)} ${f1(gy)} `;
    }
  }
  // Board rim along the bottom: a few carved holes, partly cut by the screen edge.
  const rimH = Math.round(Math.min(46, h * 0.06));
  const rimY = h - rimH;
  let holes = '';
  const step = 64;
  for (let x = 30; x < w + step; x += step) {
    holes += `<circle cx="${x}" cy="${rimY + rimH + 4}" r="24" fill="#8E5226"/><circle cx="${x}" cy="${rimY + rimH + 4}" r="19" fill="#4A260F"/>`;
  }
  const shell = (x: number, y: number, r: number) =>
    `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${r})"><ellipse rx="7" ry="5.4" fill="#F3DDB4"/><path d="M-4.2 0.3 Q0 -1.2 4.2 0.3" fill="none" stroke="#8C6A3C" stroke-width="1.3"/></g>`;
  return [
    `<rect width="${w}" height="${h}" fill="#5A3218"/>`,
    `<path d="${grain}" fill="none" stroke="#673A1C" stroke-width="2" stroke-linecap="round"/>`,
    `<path d="${seams}" stroke="#46260F" stroke-width="3"/>`,
    `<rect y="${rimY - 6}" width="${w}" height="${rimH + 6}" fill="#6E3D1B"/>`,
    `<rect y="${rimY}" width="${w}" height="${rimH}" fill="#B87436"/>`,
    holes,
    shell(54, rimY + rimH - 12, 20),
    shell(w - 70, rimY + rimH - 10, 140),
    shell(w * 0.52, rimY + rimH - 9, 70),
  ].join('');
}

export const congklakTheme: ControllerTheme = {
  chrome: '#3A200E',
  scene: congklakScene,
  stripEdge: {
    w: 24,
    h: 10,
    body: '<rect width="24" height="4" fill="#3A200E"/><path d="M0 3 Q12 14 24 3Z" fill="#3A200E"/>',
  },
};
