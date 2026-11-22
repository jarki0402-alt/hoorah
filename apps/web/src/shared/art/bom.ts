/**
 * Bom Oper key art: a comic panel. A fenced backyard on pale yellow halftone paper; one runner
 * flings the black bomb, fuse sparking, to a friend who reaches for it while the others scatter
 * with motion lines. A red and yellow burst sits behind the action. The top left stays clear for
 * the logo.
 */
import { box, figure, INK, placed } from './kotak';
import { f1, svgDoc } from './svg';

function burst(cx: number, cy: number, r1: number, r2: number, n: number, fill: string): string {
  let d = '';
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r1 : r2;
    d += `${i === 0 ? 'M' : 'L'}${f1(cx + Math.cos(a) * r)} ${f1(cy + Math.sin(a) * r)}`;
  }
  return `<path d="${d}Z" fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
}

export function bomSvg(): string {
  const out: string[] = [];
  out.push('<rect width="640" height="360" fill="#FFE98A"/>');
  let dots = '';
  for (let y = 12; y < 200; y += 18)
    for (let x = (y / 18) % 2 ? 12 : 21; x < 640; x += 18) {
      const r = 3 * (1 - y / 200);
      if (r > 0.5)
        dots += `M${f1(x - r)} ${y}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0Z`;
    }
  out.push(`<path d="${dots}" fill="#FFC928"/>`);
  out.push(burst(430, 150, 70, 130, 14, '#FFC928'), burst(430, 150, 40, 80, 12, '#F2453D'));
  out.push(`<rect y="236" width="640" height="124" fill="#7CC86A" stroke="${INK}" stroke-width="3"/>`);
  let fence = '';
  for (let x = 0; x < 640; x += 30)
    fence += `<path d="M${x + 4} 238v-40l9-9 9 9v40Z" fill="#FFF7F0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  out.push(fence, `<rect y="208" width="640" height="8" fill="#FFF7F0" stroke="${INK}" stroke-width="3"/>`);
  out.push(box(60, 286, 70, 34, 26, '#B9B2A6'));
  out.push(`<rect x="560" y="196" width="14" height="70" fill="#9A6B45" stroke="${INK}" stroke-width="3"/>`);
  out.push(
    `<rect x="526" y="140" width="82" height="64" rx="10" fill="#22B35E" stroke="${INK}" stroke-width="3"/>`,
  );
  // The bomb in flight with its arc and spark.
  out.push(
    '<path d="M300 220 Q370 110 450 190" fill="none" stroke="#111214" stroke-width="4" stroke-dasharray="10 8"/>',
  );
  out.push(`<circle cx="392" cy="142" r="26" fill="#22242A" stroke="${INK}" stroke-width="4"/>`);
  out.push('<circle cx="383" cy="132" r="7" fill="#FFFFFF"/>');
  out.push(`<rect x="388" y="110" width="12" height="9" fill="#8B8F99" stroke="${INK}" stroke-width="2"/>`);
  out.push('<path d="M396 110 q8 -14 20 -12" fill="none" stroke="#E9D2A6" stroke-width="4"/>');
  out.push(burst(420, 92, 7, 16, 8, '#FF8A3D'));
  // Runners.
  out.push(placed(figure('jeruk', '#2F8CFF', 'push'), 290, 300, 0.85, -6));
  out.push(placed(figure('semangka', '#F2453D', 'jump'), 470, 302, 0.85, 8));
  out.push(placed(figure('nanas', '#FFC928', 'run'), 170, 330, 0.75, -10));
  out.push(placed(figure('alpukat', '#FF5C9A', 'fall'), 600, 340, 0.72, 16));
  out.push(
    `<path d="M120 300h-40M124 316h-52M118 332h-34M640 310h-10" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
  );
  return svgDoc(640, 360, out.join(''));
}
