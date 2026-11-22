/**
 * Seluncur Es key art: a round ice floe on a dark cold sea, seen from above at a slant. The rim is
 * cracked and two chunks drift away; dotted aim lines run between the skaters, one bump flashes
 * DUK! and a skater tumbles into the water with a splash. The top left stays dark for the logo.
 */
import { figure, INK, placed } from './kotak';
import { f1, seeded, svgDoc } from './svg';

const CX = 360;
const CY = 214;
const RX = 210;
const RY = 104;

function rimPath(rx: number, ry: number, dy = 0): string {
  let d = '';
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.03 * Math.sin(7 * a + 0.4) + 0.018 * Math.sin(13 * a + 2.1);
    d += `${i ? 'L' : 'M'}${f1(CX + Math.cos(a) * rx * k)} ${f1(CY + dy + Math.sin(a) * ry * k)}`;
  }
  return `${d}Z`;
}

function dots(x0: number, y0: number, x1: number, y1: number, color: string): string {
  const out: string[] = [];
  const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 16));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    out.push(
      `<ellipse cx="${f1(x0 + (x1 - x0) * t)}" cy="${f1(y0 + (y1 - y0) * t)}" rx="4" ry="2.6" fill="${color}"/>`,
    );
  }
  return out.join('');
}

export function esSvg(): string {
  const rnd = seeded(23);
  const out: string[] = [];
  out.push('<rect width="640" height="360" fill="#0B2C3D"/>');
  // Light ripples on the sea.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 640;
    const y = 40 + rnd() * 320;
    const w = 14 + rnd() * 30;
    out.push(
      `<path d="M${f1(x)} ${f1(y)} q${f1(w / 2)} -4 ${f1(w)} 0" stroke="#1C5468" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    );
  }
  // Far floes.
  for (const [x, y, w] of [
    [70, 300, 46],
    [590, 70, 38],
    [600, 320, 54],
    [40, 170, 30],
  ] as const) {
    out.push(`<ellipse cx="${x}" cy="${y + 5}" rx="${w}" ry="${w * 0.36}" fill="#3F8FAB"/>`);
    out.push(`<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * 0.36}" fill="#E1F2F8"/>`);
  }
  // The floe: side, top, cracked rim band.
  out.push(`<path d="${rimPath(RX, RY, 18)}" fill="#3F8FAB"/>`);
  out.push(`<path d="${rimPath(RX, RY, 9)}" fill="#8ECFE3"/>`);
  out.push(`<path d="${rimPath(RX, RY)}" fill="#EEF8FC"/>`);
  out.push(
    `<path d="${rimPath(RX * 0.8, RY * 0.8)}" fill="none" stroke="#3F8FAB" stroke-width="2.5" stroke-dasharray="9 5"/>`,
  );
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const x0 = CX + Math.cos(a) * RX * 0.8;
    const y0 = CY + Math.sin(a) * RY * 0.8;
    const x1 = CX + Math.cos(a + 0.06) * RX * 0.97;
    const y1 = CY + Math.sin(a + 0.06) * RY * 0.97;
    out.push(
      `<path d="M${f1(x0)} ${f1(y0)} L${f1((x0 + x1) / 2 + 4)} ${f1((y0 + y1) / 2)} L${f1(x1)} ${f1(y1)}" stroke="#3F8FAB" stroke-width="2" fill="none"/>`,
    );
  }
  // Two chunks drifting off.
  out.push(
    '<path d="M560 262 l34 -10 l18 14 l-30 16 Z" fill="#8ECFE3"/><path d="M560 256 l34 -10 l18 14 l-30 16 Z" fill="#EEF8FC"/>',
  );
  out.push(
    '<path d="M150 300 l40 4 l-6 18 l-42 -4 Z" fill="#8ECFE3"/><path d="M150 294 l40 4 l-6 18 l-42 -4 Z" fill="#EEF8FC"/>',
  );

  // Aim lines and skaters.
  out.push(dots(290, 230, 380, 196, '#F2453D'));
  out.push(dots(470, 250, 410, 210, '#2F8CFF'));
  out.push(dots(330, 150, 300, 205, '#22B35E'));
  out.push(placed(figure('durian', '#F2453D', 'push'), 280, 250, 0.52));
  out.push(placed(figure('jeruk', '#2F8CFF', 'run'), 476, 268, 0.52));
  out.push(placed(figure('semangka', '#22B35E', 'stand'), 336, 160, 0.46));
  out.push(placed(figure('mangga', '#FF5C9A', 'cheer'), 420, 170, 0.46));
  out.push(placed(figure('nanas', '#FFC928', 'fall'), 196, 262, 0.5, -38));
  // Splash where the pineapple hits the water.
  out.push('<ellipse cx="170" cy="290" rx="36" ry="10" fill="none" stroke="#BFE6F2" stroke-width="3"/>');
  for (const [x, y] of [
    [150, 270],
    [190, 266],
    [168, 258],
  ] as const)
    out.push(`<circle cx="${x}" cy="${y}" r="5" fill="#BFE6F2"/>`);
  // DUK! burst between two skaters.
  out.push(
    `<text x="392" y="196" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="30" fill="#FFC928" stroke="${INK}" stroke-width="5" paint-order="stroke">DUK!</text>`,
  );
  return svgDoc(640, 360, out.join(''));
}
