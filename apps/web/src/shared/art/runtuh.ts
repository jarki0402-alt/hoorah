/**
 * Lantai Runtuh key art: the quiz stage at night. A grid of coloured tiles with symbols floats in
 * the dark under spotlight beams and marquee bulbs; three tiles crumble into the pit, one runner
 * shoves another, a third tumbles with a falling tile, and the call card glows KUNING. The top
 * left stays dark for the logo.
 */
import { box, figure, INK, placed } from './kotak';
import { f1, seeded, svgDoc } from './svg';

const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928'];

function star(cx: number, cy: number, r: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${f1(cx + Math.cos(a) * rr)} ${f1(cy + Math.sin(a) * rr)}`;
  }
  return `<path d="${d}Z" fill="#FFFFFF"/>`;
}

export function runtuhSvg(): string {
  const rnd = seeded(21);
  const out: string[] = [];
  out.push('<rect width="640" height="360" fill="#12141B"/>');
  // Spotlight beams.
  for (const x of [150, 330, 520]) {
    out.push(
      `<path d="M${x - 6} 0 L${x + 6} 0 L${x + 90} 360 L${x - 90} 360Z" fill="#FFE9B8" fill-opacity="0.06"/>`,
    );
  }
  // Marquee sign with the call.
  out.push(
    '<rect x="388" y="30" width="200" height="64" rx="12" fill="#1E2028" stroke="#FFC928" stroke-width="3"/>',
  );
  for (let i = 0; i < 11; i++) {
    out.push(`<circle cx="${398 + i * 18}" cy="30" r="4" fill="${i % 2 ? '#FF8A3D' : '#FFC928'}"/>`);
    out.push(`<circle cx="${398 + i * 18}" cy="94" r="4" fill="${i % 2 ? '#FFC928' : '#FF8A3D'}"/>`);
  }
  out.push('<rect x="420" y="46" width="136" height="34" rx="8" fill="#FFC928"/>');
  out.push(
    `<text x="488" y="72" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="26" fill="${INK}">KUNING</text>`,
  );

  // Tile grid in a three-quarter view: rows from back (small) to front (large).
  const rows = 4;
  const cols = 6;
  const falling = new Set(['1,1', '2,4', '3,2']);
  for (let r = 0; r < rows; r++) {
    const s = 44 + r * 8;
    const y = 158 + r * (s * 0.62);
    const x0 = 320 - (cols * (s + 6)) / 2 + r * 4;
    for (let c = 0; c < cols; c++) {
      const color = COLORS[(r * 3 + c * 5 + (r % 2)) % COLORS.length]!;
      const x = x0 + c * (s + 6);
      if (falling.has(`${r},${c}`)) {
        const drop = 40 + r * 14;
        out.push(
          `<g transform="rotate(${r % 2 ? 16 : -14} ${f1(x + s / 2)} ${f1(y + drop)})">${box(x, y + drop, s, 10, s * 0.5, color)}</g>`,
        );
        for (let k = 0; k < 4; k++)
          out.push(
            `<rect x="${f1(x + rnd() * s)}" y="${f1(y + drop + 18 + rnd() * 30)}" width="6" height="6" fill="${color}" stroke="${INK}" stroke-width="1.5"/>`,
          );
        continue;
      }
      out.push(box(x, y, s, 10, s * 0.5, color));
      if ((r + c) % 3 === 0) out.push(star(x + s / 2 + s * 0.14, y - s * 0.12, s * 0.16));
    }
  }
  // Bulbs along the front rim.
  for (let i = 0; i < 20; i++)
    out.push(`<circle cx="${50 + i * 29}" cy="338" r="4.5" fill="${i % 3 ? '#FFC928' : '#5A4A2A'}"/>`);

  // Players: a shove, a tumble, a cheer on a yellow tile.
  out.push(placed(figure('jeruk', '#2F8CFF', 'push'), 250, 236, 0.6));
  out.push(placed(figure('durian', '#F2453D', 'fall'), 300, 236, 0.6, 28));
  out.push(placed(figure('semangka', '#22B35E', 'cheer'), 430, 212, 0.55));
  out.push(placed(figure('mangga', '#FF5C9A', 'fall'), 240, 290, 0.5, -34));
  out.push(placed(figure('nanas', '#14B8A6', 'stand'), 370, 278, 0.6));
  out.push(
    '<path d="M268 196 l14 -6 M270 210 l16 0 M268 224 l14 6" stroke="#FFF7F0" stroke-width="4" stroke-linecap="round"/>',
  );
  return svgDoc(640, 360, out.join(''));
}
