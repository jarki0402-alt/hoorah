/**
 * Langkah Maut key art: a narrow stone path of steps climbing into the dark over a bottomless
 * abyss. A big glowing arrow hangs ahead, walkers step in a row, one slips and tumbles into the
 * void, and a red laser cuts across the path further up. The top left stays dark for the logo.
 */
import { figure, INK, placed } from './kotak';
import { f1, svgDoc } from './svg';

function arrowUp(cx: number, cy: number, s: number, fill: string): string {
  return `<path d="M${f1(cx)} ${f1(cy - s)} L${f1(cx + s * 0.9)} ${f1(cy)} L${f1(cx + s * 0.35)} ${f1(cy)} L${f1(cx + s * 0.35)} ${f1(cy + s)} L${f1(cx - s * 0.35)} ${f1(cy + s)} L${f1(cx - s * 0.35)} ${f1(cy)} L${f1(cx - s * 0.9)} ${f1(cy)} Z" fill="${fill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
}

export function langkahSvg(): string {
  const out: string[] = [];
  out.push('<rect width="640" height="360" fill="#0E0F13"/>');
  // Faint light from above the path.
  out.push('<path d="M300 0 L420 0 L560 360 L180 360 Z" fill="#FFE2B8" fill-opacity="0.04"/>');
  // Steps receding up the frame: bigger and lower in front.
  const steps = 9;
  for (let i = steps - 1; i >= 0; i--) {
    const k = i / (steps - 1);
    const w = 330 - k * 230;
    const h = 30 - k * 18;
    const cx = 360 + k * 40;
    const y = 330 - k * 250;
    out.push(`<rect x="${f1(cx - w / 2)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="#4A4E5A"/>`);
    out.push(
      `<rect x="${f1(cx - w / 2)}" y="${f1(y)}" width="${f1(w)}" height="${f1(Math.max(2, h * 0.16))}" fill="#FFC928"/>`,
    );
    out.push(
      `<rect x="${f1(cx - w / 2)}" y="${f1(y + h)}" width="${f1(w)}" height="${f1(h * 0.9)}" fill="#22242B"/>`,
    );
  }
  // Laser across the upper path.
  out.push('<rect x="300" y="128" width="200" height="5" fill="#F2453D"/>');
  out.push('<rect x="300" y="125" width="200" height="11" fill="#F2453D" fill-opacity="0.25"/>');
  // The cue arrow.
  out.push('<rect x="500" y="40" width="96" height="96" rx="18" fill="#FFC928"/>');
  out.push(arrowUp(548, 88, 32, '#111214'));
  // Walkers on the front steps, one tumbling into the abyss.
  out.push(placed(figure('jeruk', '#2F8CFF', 'run'), 300, 300, 0.55));
  out.push(placed(figure('semangka', '#22B35E', 'jump'), 365, 268, 0.5));
  out.push(placed(figure('mangga', '#FF5C9A', 'run'), 430, 300, 0.55));
  out.push(placed(figure('durian', '#F2453D', 'fall'), 150, 300, 0.5, -48));
  out.push(
    '<path d="M120 250 l-14 -10 M136 238 l-6 -14 M160 244 l6 -14" stroke="#FFF7F0" stroke-width="4" stroke-linecap="round"/>',
  );
  return svgDoc(640, 360, out.join(''));
}
