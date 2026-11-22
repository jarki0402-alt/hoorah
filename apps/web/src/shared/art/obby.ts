/**
 * Obby key art: the toy island course on a sunny day. Chunky blocks climb from the left to a
 * chequered finish arch on the right over a bright sea; a runner leaps a gap, another is thrown
 * high by a red spring, a third ducks under the striped sweeper bar, and yellow tiles crumble
 * into the water. The top left stays open sky for the logo.
 */
import { box, figure, INK, placed } from './kotak';
import { f1, seeded, svgDoc } from './svg';

function cloud(x: number, y: number, s: number): string {
  return [
    `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(70 * s)}" height="${f1(20 * s)}" rx="${f1(6 * s)}" fill="#FFFFFF"/>`,
    `<rect x="${f1(x + 16 * s)}" y="${f1(y - 14 * s)}" width="${f1(34 * s)}" height="${f1(18 * s)}" rx="${f1(6 * s)}" fill="#FFFFFF"/>`,
  ].join('');
}

export function obbySvg(): string {
  const rnd = seeded(20);
  const out: string[] = [];
  out.push('<rect width="640" height="360" fill="#9FD9FF"/>');
  out.push('<rect y="150" width="640" height="210" fill="#B5E3FF"/>');
  out.push(cloud(300, 52, 1.1), cloud(500, 92, 0.8), cloud(40, 150, 0.7));
  // Sea with wave caps and far islands.
  out.push('<rect y="268" width="640" height="92" fill="#48B4E6"/>');
  let waves = '';
  for (let i = 0; i < 26; i++) waves += `M${f1(rnd() * 640)} ${f1(280 + rnd() * 75)}h${f1(10 + rnd() * 14)}`;
  out.push(`<path d="${waves}" stroke="#BFE6FF" stroke-width="3" stroke-linecap="round"/>`);
  out.push('<rect x="250" y="258" width="70" height="12" rx="3" fill="#FFE2A8"/>');
  out.push(
    '<rect x="283" y="226" width="5" height="34" fill="#B97A4A"/><rect x="268" y="220" width="34" height="9" rx="2" fill="#22B35E"/>',
  );

  // The course, back to front.
  out.push(box(20, 262, 120, 24, 40, '#2F8CFF'));
  // Crumbling yellow tiles, two falling.
  for (let i = 0; i < 3; i++) out.push(box(150 + i * 38, 252, 32, 12, 30, '#FFD84D'));
  out.push(`<g transform="rotate(18 214 300)">${box(196, 292, 30, 12, 28, '#FFD84D')}</g>`);
  out.push(`<g transform="rotate(-12 252 322)">${box(240, 314, 26, 10, 24, '#FFD84D')}</g>`);
  for (let i = 0; i < 6; i++)
    out.push(
      `<rect x="${f1(205 + rnd() * 50)}" y="${f1(270 + rnd() * 40)}" width="7" height="7" fill="#FFD84D" stroke="${INK}" stroke-width="1.5"/>`,
    );
  // Red spring block.
  out.push(box(290, 232, 70, 40, 36, '#F2453D'));
  out.push('<rect x="314" y="214" width="22" height="16" fill="#E9E2D6" stroke="#111214" stroke-width="2"/>');
  out.push('<ellipse cx="327" cy="212" rx="18" ry="6" fill="#F2453D" stroke="#111214" stroke-width="2"/>');
  // Green plate with the sweeper bar.
  out.push(box(380, 206, 120, 34, 46, '#22B35E'));
  out.push('<rect x="436" y="150" width="10" height="56" fill="#FFF7F0" stroke="#111214" stroke-width="2"/>');
  out.push('<circle cx="441" cy="150" r="8" fill="#F2453D" stroke="#111214" stroke-width="2"/>');
  let stripes = '';
  for (let i = 0; i < 9; i++) stripes += `M${392 + i * 14} 182h7v12h-7Z`;
  out.push(
    '<rect x="388" y="182" width="126" height="12" fill="#FFF7F0" stroke="#111214" stroke-width="2"/>',
  );
  out.push(`<path d="${stripes}" fill="#F2453D"/>`);
  // Finish: chequered plate and arch.
  out.push(box(520, 160, 120, 30, 46, '#FFF7F0'));
  let checks = '';
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 12; c++) if ((r + c) % 2) checks += `M${520 + c * 10} ${160 + r * 7}h10v7h-10Z`;
  out.push(`<path d="${checks}" fill="${INK}"/>`);
  out.push(`<rect x="540" y="70" width="9" height="92" fill="#FFF7F0" stroke="${INK}" stroke-width="2"/>`);
  out.push(`<rect x="616" y="70" width="9" height="92" fill="#FFF7F0" stroke="${INK}" stroke-width="2"/>`);
  out.push(`<rect x="536" y="58" width="94" height="18" fill="#FFF7F0" stroke="${INK}" stroke-width="2"/>`);
  let banner = '';
  for (let c = 0; c < 12; c++) banner += `M${538 + c * 7.6} ${c % 2 ? 60 : 67}h7.6v7h-7.6Z`;
  out.push(`<path d="${banner}" fill="${INK}"/>`);

  // Runners.
  out.push(placed(figure('jeruk', '#2F8CFF', 'run'), 92, 248, 0.62));
  out.push(placed(figure('semangka', '#FFC928', 'jump'), 190, 196, 0.62, -8));
  out.push(placed(figure('nanas', '#22B35E', 'jump'), 330, 120, 0.66, 6));
  out.push(placed(figure('stroberi', '#FF8A3D', 'fall'), 470, 168, 0.6, 24));
  out.push(placed(figure('alpukat', '#FF5C9A', 'cheer'), 584, 156, 0.58));
  // Motion puffs under the spring jumper.
  out.push(
    '<path d="M318 196 l-6 10 M330 194 l0 12 M342 196 l6 10" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>',
  );
  return svgDoc(640, 360, out.join(''));
}
