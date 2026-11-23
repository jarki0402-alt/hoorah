/**
 * Phone theme for Petualangan Warna: the same glowing cave, held sideways. Stalactites along the
 * top, a few crystals and fireflies and a plain grassy floor (no colour pools: they read as buttons
 * and sat under the hint). Drawn once per viewport shape.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

function warnaScene(w: number, h: number): string {
  const rnd = seeded(27);
  let stal = '';
  for (let x = -10; x < w; ) {
    const bw = 18 + rnd() * 34;
    const bh = h * (0.04 + rnd() * 0.09);
    stal += `M${f1(x)} 0 L${f1(x + bw)} 0 L${f1(x + bw * 0.55)} ${f1(bh)}Z `;
    x += bw * 0.8;
  }
  let flies = '';
  for (let i = 0; i < Math.round(w / 34); i++)
    flies += `<circle cx="${f1(rnd() * w)}" cy="${f1(h * (0.18 + rnd() * 0.6))}" r="${f1(1.4 + rnd() * 1.6)}"/>`;
  let crystals = '';
  for (let i = 0; i < 4; i++) {
    const x = rnd() * w;
    const y = h * 0.86;
    crystals += `<path d="M${f1(x - 6)} ${f1(y)} L${f1(x)} ${f1(y - 18)} L${f1(x + 6)} ${f1(y)}Z M${f1(x + 4)} ${f1(y)} L${f1(x + 9)} ${f1(y - 11)} L${f1(x + 13)} ${f1(y)}Z" fill="#4FE3C8"/>`;
  }
  const floor = Math.round(h * 0.9);
  return [
    '<defs><linearGradient id="wa-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A2731"/><stop offset="0.6" stop-color="#0B1F26"/><stop offset="1" stop-color="#0E3440"/></linearGradient>',
    '<radialGradient id="wa-glow"><stop offset="0" stop-color="#2FD5C5" stop-opacity="0.22"/><stop offset="1" stop-color="#2FD5C5" stop-opacity="0"/></radialGradient></defs>',
    `<rect width="${w}" height="${h}" fill="url(#wa-sky)"/>`,
    `<circle cx="${f1(w * 0.2)}" cy="${f1(h * 0.55)}" r="${f1(h * 0.5)}" fill="url(#wa-glow)"/>`,
    `<circle cx="${f1(w * 0.82)}" cy="${f1(h * 0.4)}" r="${f1(h * 0.45)}" fill="url(#wa-glow)"/>`,
    `<path d="${stal}" fill="#163A40"/>`,
    `<g fill="#FFE27A" opacity="0.7">${flies}</g>`,
    crystals,
    `<rect y="${floor}" width="${w}" height="${h - floor}" fill="#14262B"/>`,
    `<rect y="${floor}" width="${w}" height="4" fill="#3FA34D"/>`,
  ].join('');
}

/** Phone theme for Petualangan Warna. */
export const warnaTheme: ControllerTheme = {
  chrome: '#0B1F26',
  scene: warnaScene,
};
