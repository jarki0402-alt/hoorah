/**
 * Phone theme for Kompak Gak?: the same angkringan night as the main screen. A striped tarp
 * with a scalloped hem along the top (the menu pill hangs from it), a string of warm bulbs, a
 * navy sky with a few stars, and the wooden counter along the bottom with the teapot and two
 * glasses of tea. Flat shapes, drawn once per viewport shape.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

function kompakScene(w: number, h: number): string {
  const rnd = seeded(17);
  const counter = Math.round(Math.max(40, Math.min(84, h * 0.085)));
  const top = h - counter;

  let stars = '';
  for (let i = 0; i < Math.round((w * h) / 9000); i++) {
    const x = rnd() * w;
    const y = 80 + rnd() * (top - 120);
    const r = rnd() < 0.2 ? 1.5 : 1;
    stars += `M${f1(x - r)} ${f1(y)}a${r} ${r} 0 1 0 ${f1(2 * r)} 0a${r} ${r} 0 1 0 ${f1(-2 * r)} 0Z`;
  }

  const tarp = 20;
  const sw = 24;
  let stripes = '';
  let hemA = '';
  let hemB = '';
  for (let x = 0; x < w; x += sw * 2) {
    stripes += `M${x} 0h${sw}v${tarp}h-${sw}Z`;
    hemA += `M${x} ${tarp - 1} Q${x + sw / 2} ${tarp + 11} ${x + sw} ${tarp - 1}Z`;
    hemB += `M${x + sw} ${tarp - 1} Q${x + sw * 1.5} ${tarp + 11} ${x + sw * 2} ${tarp - 1}Z`;
  }

  const span = Math.max(110, Math.round(w / 3));
  let wire = '';
  let bulbs = '';
  let glow = '';
  for (let x0 = -span / 2; x0 < w; x0 += span) {
    const y0 = tarp + 4;
    const sag = 10;
    wire += `M${f1(x0)} ${y0} Q${f1(x0 + span / 2)} ${y0 + sag * 2} ${f1(x0 + span)} ${y0} `;
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const x = x0 + span * t;
      const y = y0 + 2 * sag * 2 * t * (1 - t);
      bulbs += `M${f1(x - 3.5)} ${f1(y + 5)}a3.5 4.5 0 1 0 7 0a3.5 4.5 0 1 0 -7 0Z`;
      glow += `M${f1(x - 11)} ${f1(y + 5)}a11 11 0 1 0 22 0a11 11 0 1 0 -22 0Z`;
    }
  }

  let seams = '';
  for (let y = top + 26; y < h; y += 24) seams += `M0 ${y}H${w}`;

  const s = Math.min(1, counter / 70);
  const teko = `<g transform="translate(10 ${f1(top - 36 * s)}) scale(${f1(s * 0.8)})"><path d="M8 44 C2 30 6 14 26 12 C46 14 50 30 44 44Z" fill="#3C4651"/><path d="M42 24 C54 20 60 12 62 6 L66 8 C62 22 56 30 46 34Z" fill="#3C4651"/><path d="M8 22 C-4 22 -4 38 10 38" fill="none" stroke="#3C4651" stroke-width="5"/><rect x="18" y="5" width="16" height="8" rx="3" fill="#2B333C"/></g>`;
  const gelas = `<g transform="translate(${f1(w - 54 * s)} ${f1(top - 26 * s)}) scale(${f1(s * 0.85)})"><path d="M0 0 H20 L18 30 H2Z" fill="#F6E3C6" opacity="0.35"/><path d="M1.5 10 H18.5 L18 30 H2Z" fill="#C8742C"/><path d="M26 2 H46 L44 30 H28Z" fill="#F6E3C6" opacity="0.35"/><path d="M27.2 8 H44.8 L44 30 H28Z" fill="#8A4A1E"/></g>`;

  return [
    `<rect width="${w}" height="${h}" fill="#16202C"/>`,
    `<path d="${stars}" fill="#FFF2C2" opacity="0.45"/>`,
    `<path d="${glow}" fill="#FFC928" opacity="0.1"/>`,
    `<path d="${wire}" fill="none" stroke="#0B1118" stroke-width="1.5"/>`,
    `<path d="${bulbs}" fill="#FFD866"/>`,
    `<rect width="${w}" height="${tarp}" fill="#F6E3C6"/>`,
    `<path d="${stripes}${hemA}" fill="#E8692E"/>`,
    `<path d="${hemB}" fill="#F6E3C6"/>`,
    teko,
    gelas,
    `<rect x="0" y="${top}" width="${w}" height="${counter}" fill="#6B4423"/>`,
    `<rect x="0" y="${top}" width="${w}" height="8" fill="#8A5A2B"/>`,
    `<rect x="0" y="${top + 8}" width="${w}" height="3" fill="#4E3018"/>`,
    `<path d="${seams}" stroke="#58371C" stroke-width="1.5"/>`,
  ].join('');
}

/** Phone theme for Kompak Gak?. */
export const kompakTheme: ControllerTheme = {
  chrome: '#E8692E',
  scene: kompakScene,
};
