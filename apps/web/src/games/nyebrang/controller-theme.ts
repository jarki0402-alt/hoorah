/**
 * Phone theme for Nyebrang: the same warm pixel world as the main screen, seen from above. Grass
 * with little tufts along the top, a road with a zebra crossing in the middle (the swipe zone sits
 * on it), and a river with a log along the bottom. Square pixel shapes only, drawn once per
 * viewport shape.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

function nyebrangScene(w: number, h: number): string {
  const rnd = seeded(25);
  const P = Math.max(4, Math.round(Math.min(w, h) / 90));
  const grassH = Math.round(h * 0.2);
  const riverH = Math.round(h * 0.13);
  const roadTop = grassH;
  const roadBot = h - riverH;

  let tufts = '';
  for (let i = 0; i < Math.round(w / 26); i++) {
    const x = Math.round((rnd() * w) / P) * P;
    const y = Math.round((rnd() * (grassH - 3 * P)) / P) * P;
    tufts += `M${x} ${y}h${P}v${2 * P}h-${P}Z M${x + P} ${y + P}h${P}v${P}h-${P}Z `;
  }

  let zebra = '';
  const zx = w * 0.22;
  const zw = w * 0.56;
  for (let y = roadTop + 3 * P; y < roadBot - 3 * P; y += 6 * P)
    zebra += `M${f1(zx)} ${y}h${f1(zw)}v${3 * P}h${f1(-zw)}Z `;

  let dashes = '';
  for (let y = roadTop + 2 * P; y < roadBot; y += 8 * P) {
    dashes += `M${2 * P} ${y}h${P}v${4 * P}h-${P}Z M${w - 3 * P} ${y}h${P}v${4 * P}h-${P}Z `;
  }

  let ripples = '';
  for (let i = 0; i < Math.round(w / 40); i++) {
    const x = Math.round((rnd() * w) / P) * P;
    const y = roadBot + P * 2 + Math.round((rnd() * (riverH - 5 * P)) / P) * P;
    ripples += `M${x} ${y}h${4 * P}v${P}h-${4 * P}Z `;
  }
  const logY = roadBot + Math.round(riverH * 0.35);
  const logW = Math.round(w * 0.4);

  return [
    `<rect width="${w}" height="${h}" fill="#43464E"/>`,
    `<rect width="${w}" height="${grassH}" fill="#7CC45E"/>`,
    `<path d="${tufts}" fill="#5A9E43"/>`,
    `<rect y="${grassH}" width="${w}" height="${P}" fill="#4E8F3A"/>`,
    `<rect y="${grassH + P}" width="${w}" height="${2 * P}" fill="#7A5230"/>`,
    `<path d="${zebra}" fill="#F7F2E8" opacity="0.16"/>`,
    `<path d="${dashes}" fill="#F2E6B8" opacity="0.5"/>`,
    `<rect y="${roadBot}" width="${w}" height="${riverH}" fill="#2E9EC8"/>`,
    `<rect y="${roadBot}" width="${w}" height="${P}" fill="#7A5230"/>`,
    `<path d="${ripples}" fill="#8FD8F0" opacity="0.7"/>`,
    `<rect x="${w - logW - 3 * P}" y="${logY}" width="${logW}" height="${3 * P}" fill="#7C4A28"/>`,
    `<rect x="${w - logW - 3 * P}" y="${logY}" width="${logW}" height="${P}" fill="#A9774A"/>`,
    `<rect x="${w - 4 * P}" y="${logY}" width="${P}" height="${3 * P}" fill="#E8B985"/>`,
  ].join('');
}

/** Phone theme for Nyebrang. */
export const nyebrangTheme: ControllerTheme = {
  chrome: '#7CC45E',
  scene: nyebrangScene,
};
