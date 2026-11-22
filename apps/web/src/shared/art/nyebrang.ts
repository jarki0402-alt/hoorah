import type { Fruit } from '@hoorah/protocol';
import { fruitMarkup } from './fruits';
import { svgDoc } from './svg';

/**
 * Key art (640x360) for Nyebrang in the game's warm pixel style, 3/4 view: from the bottom up a
 * paved start, two roads with an angkot and a bajaj, a sidewalk, a river with a log and lily
 * pads, grass, and a rail with its warning lights on. Four fruits hop across mid-jump. The logo
 * sits on the grass at the top left (see LOGO_POS in keyart.tsx).
 */
export function nyebrangSvg(): string {
  const C = 32;
  const r = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const rowY = (i: number) => 360 - (i + 1) * C;
  const out: string[] = [];

  // Lanes, bottom (row 0) to top.
  out.push(r(0, rowY(0), 640, C, '#D9CDB4'));
  for (let x = 0; x < 640; x += 16) out.push(r(x, rowY(0), 2, C, '#C2B597'));
  for (const i of [1, 2]) out.push(r(0, rowY(i), 640, C, '#43464E'));
  for (let x = 8; x < 640; x += 64) out.push(r(x, rowY(2) + C - 2, 32, 2, '#F2E6B8'));
  out.push(r(0, rowY(3), 640, C, '#CFC6B4'));
  for (let x = 0; x < 640; x += 16) out.push(r(x, rowY(3), 2, C, '#AFA591'));
  out.push(r(0, rowY(3) + C, 640, 6, '#7A5230'));
  for (const i of [4, 5]) out.push(r(0, rowY(i), 640, C, '#2E9EC8'));
  for (const [x, y] of [
    [40, 4],
    [180, 5],
    [330, 4],
    [470, 5],
    [590, 4],
  ] as const)
    out.push(r(x, rowY(y) + 12, 24, 3, '#8FD8F0'));
  out.push(r(0, rowY(6), 640, C, '#7CC45E'));
  out.push(r(0, rowY(6) + C, 640, 8, '#7A5230'));
  out.push(r(0, rowY(6) + C, 640, 2, '#4E8F3A'));
  out.push(r(0, rowY(7), 640, C, '#8C8577'));
  for (let x = 2; x < 640; x += 8) out.push(r(x, rowY(7) + 6, 4, 22, '#6B4A2E'));
  out.push(r(0, rowY(7) + 10, 640, 2, '#D8D8DC'));
  out.push(r(0, rowY(7) + 22, 640, 2, '#D8D8DC'));
  for (const i of [8, 9, 10]) out.push(r(0, rowY(i), 640, C, i % 2 ? '#6DB552' : '#7CC45E'));
  out.push(r(0, rowY(8) + C, 640, 6, '#6E4E30'));

  // Rail warning lights, both on.
  for (const x of [196, 600]) {
    out.push(r(x + 6, rowY(7) - 16, 4, 30, '#3D4047'));
    out.push(r(x, rowY(7) - 24, 16, 10, '#1A1816'));
    out.push(r(x + 2, rowY(7) - 22, 5, 6, '#FF3B2E'), r(x + 9, rowY(7) - 22, 5, 6, '#FF3B2E'));
  }
  // Trees and bushes on the grass.
  const tree = (x: number, y: number) =>
    r(x + 12, y - 18, 8, 18, '#6B4A2E') +
    r(x + 2, y - 46, 28, 30, '#2E7A3A') +
    r(x + 6, y - 42, 14, 12, '#3FA04C') +
    r(x + 8, y - 40, 6, 4, '#5BBE5E');
  out.push(
    tree(420, rowY(8) + 26),
    tree(540, rowY(9) + 26),
    tree(300, rowY(6) + 28),
    tree(600, rowY(6) + 28),
  );

  // Log and lily pads.
  out.push(
    r(60, rowY(5) + 8, 128, 14, '#7C4A28'),
    r(62, rowY(5) + 8, 124, 5, '#A9774A'),
    r(182, rowY(5) + 8, 6, 14, '#E8B985'),
  );
  for (const x of [360, 430, 520]) {
    out.push(r(x, rowY(4) + 8, 26, 14, '#3E9A6E'), r(x + 4, rowY(4) + 9, 16, 5, '#5BBE82'));
  }
  out.push(r(442, rowY(4) + 6, 6, 6, '#FF6FA8'));

  // Angkot (right-facing) and bajaj (left).
  const ak = 250;
  const ay = rowY(2) + 2;
  out.push(r(ak - 2, ay + 26, 70, 6, 'rgba(0,0,0,0.25)'));
  out.push(r(ak + 4, ay, 56, 10, '#5AA8FF'), r(ak, ay + 10, 64, 16, '#2878D8'));
  for (let x = ak + 6; x < ak + 50; x += 14) out.push(r(x, ay + 12, 10, 8, '#9CC9E0'));
  out.push(r(ak + 52, ay + 12, 10, 8, '#9CC9E0'), r(ak + 2, ay + 22, 60, 2, '#F7F2E8'));
  out.push(r(ak + 6, ay + 26, 10, 6, '#1A1816'), r(ak + 46, ay + 26, 10, 6, '#1A1816'));
  const bj = 470;
  const by = rowY(1) + 4;
  out.push(r(bj + 2, by, 26, 8, '#FF8A5C'), r(bj, by + 8, 30, 16, '#E8542A'));
  out.push(
    r(bj + 2, by + 10, 8, 8, '#9CC9E0'),
    r(bj, by + 24, 8, 6, '#1A1816'),
    r(bj + 22, by + 24, 8, 6, '#1A1816'),
  );

  // Fruits mid-hop with shadows.
  const fruits: [Fruit, number, number, number, 'happy' | 'wow' | 'effort'][] = [
    ['jeruk', 120, 0.5, 12, 'effort'],
    ['semangka', 150, 3.4, 4, 'happy'],
    ['stroberi', 380, 4.4, 10, 'wow'],
    ['mangga', 520, 6.3, 14, 'effort'],
  ];
  for (const [f, x, row, lift, face] of fruits) {
    const y = rowY(row) + C;
    out.push(`<ellipse cx="${x}" cy="${y - 4}" rx="14" ry="4" fill="rgba(0,0,0,0.28)"/>`);
    out.push(`<g transform="translate(${x - 22} ${y - 46 - lift}) scale(0.69)">${fruitMarkup(f, face)}</g>`);
  }

  return svgDoc(640, 360, `<g shape-rendering="crispEdges">${out.join('')}</g>`);
}
