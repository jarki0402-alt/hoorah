/**
 * Phone theme for Obby: the toy island course on a sunny day. A bright sky with box clouds sits
 * behind the header, a row of toy-block bunting hangs under the Host strip, and the sea with a
 * chequered save pad and little block islands lines the bottom edge, so the joystick sits on sky.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

const r = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"/>`;

/** A cloud of stacked rounded boxes. */
function boxCloud(x: number, y: number, s: number): string {
  return [
    `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(56 * s)}" height="${f1(16 * s)}" rx="${f1(5 * s)}" fill="#FFFFFF"/>`,
    `<rect x="${f1(x + 12 * s)}" y="${f1(y - 11 * s)}" width="${f1(28 * s)}" height="${f1(14 * s)}" rx="${f1(5 * s)}" fill="#FFFFFF"/>`,
  ].join('');
}

/** A toy block island with a palm made of boxes, sitting on the waterline y. */
function island(x: number, y: number, s: number, rnd: () => number): string {
  const w = (36 + rnd() * 26) * s;
  return [
    `<rect x="${f1(x - w / 2)}" y="${f1(y - 9 * s)}" width="${f1(w)}" height="${f1(12 * s)}" rx="${f1(3 * s)}" fill="#FFE2A8"/>`,
    r(x - 2 * s, y - 34 * s, 4 * s, 26 * s, '#B97A4A'),
    `<rect x="${f1(x - 14 * s)}" y="${f1(y - 40 * s)}" width="${f1(28 * s)}" height="${f1(8 * s)}" rx="${f1(2 * s)}" fill="#22B35E"/>`,
  ].join('');
}

function obbyScene(w: number, h: number): string {
  const land = w > h;
  const rnd = seeded(20);
  const out: string[] = [];
  out.push(r(0, 0, w, h, '#BFE6FF'));
  out.push(r(0, h * 0.5, w, h * 0.5, '#AEDFFF'));
  out.push(
    boxCloud(w * 0.12, h * (land ? 0.28 : 0.18), 1.1),
    boxCloud(w * 0.62, h * (land ? 0.36 : 0.27), 0.85),
  );
  const sea = h - Math.max(26, h * (land ? 0.1 : 0.07));
  out.push(island(w * 0.15, sea + 2, land ? 0.9 : 1, rnd), island(w * 0.86, sea + 2, land ? 0.8 : 0.9, rnd));
  out.push(r(0, sea, w, h - sea, '#48B4E6'));
  // Wave caps.
  let waves = '';
  for (let x = 6; x < w; x += 34) waves += `M${f1(x)} ${f1(sea + 7)}h14`;
  out.push(`<path d="${waves}" stroke="#BFE6FF" stroke-width="3" stroke-linecap="round"/>`);
  // A chequered save pad floating in the middle.
  const pw = Math.min(150, w * 0.32);
  const px = w / 2 - pw / 2;
  out.push(r(px, sea - 9, pw, 13, '#C99A12'));
  for (let i = 0; i < 10; i++)
    out.push(r(px + (i * pw) / 10, sea - 12, pw / 10, 6, i % 2 ? '#FFF7F0' : '#FFC928'));
  return out.join('');
}

export const obbyTheme: ControllerTheme = {
  chrome: '#2F8CFF',
  scene: obbyScene,
  // Toy-block bunting under the Host strip.
  stripEdge: {
    w: 48,
    h: 10,
    body:
      '<rect x="3" y="0" width="12" height="9" rx="2" fill="#F2453D"/>' +
      '<rect x="18" y="0" width="12" height="9" rx="2" fill="#FFC928"/>' +
      '<rect x="33" y="0" width="12" height="9" rx="2" fill="#22B35E"/>',
  },
};
