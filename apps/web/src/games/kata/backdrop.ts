/**
 * Main-screen backdrop: a page of an Indonesian school notebook (buku tulis). Cream paper, pale
 * blue rules, the red double margin and a few pencil doodles in the corners. Drawn for the live
 * stage size; the margin follows the centred 1280-wide core so the chain is always written
 * right of it.
 */
import { f1, svgDoc, svgUrl } from '../../shared/art/svg';

export const PAPER = '#FBF5E9';
export const RULE_GAP = 48;
/** Margin line x inside the 1280-wide core. */
export const MARGIN_X = 104;

function star(cx: number, cy: number, r: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${f1(cx + Math.cos(a) * rr)} ${f1(cy + Math.sin(a) * rr)}`;
  }
  return `<path d="${d}Z" fill="none" stroke="#B9CBDA" stroke-width="3" stroke-linejoin="round"/>`;
}

function spiral(cx: number, cy: number): string {
  let d = `M${cx} ${cy}`;
  for (let i = 1; i <= 34; i++) {
    const a = i * 0.55;
    const r = 1.2 * i;
    d += ` L${f1(cx + Math.cos(a) * r)} ${f1(cy + Math.sin(a) * r)}`;
  }
  return `<path d="${d}" fill="none" stroke="#B9CBDA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function plane(x: number, y: number): string {
  return `<g transform="translate(${x} ${y}) rotate(-14)" fill="none" stroke="#B9CBDA" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M0 18 L56 0 L30 34 L24 22 Z M24 22 L56 0"/><path d="M-10 40 C-28 44 -40 58 -60 56" stroke-dasharray="6 7"/></g>`;
}

function build(w: number, h: number): string {
  const core = (w - 1280) / 2;
  let rules = '';
  for (let y = 96; y < h; y += RULE_GAP) rules += `M0 ${y}H${w}`;
  const mx = core + MARGIN_X;
  let holes = '';
  for (let y = 190; y < h - 150; y += 160)
    holes += `<circle cx="${f1(core + 50)}" cy="${y}" r="12" fill="#EDE3CF"/>`;
  return svgDoc(
    w,
    h,
    [
      `<rect width="${w}" height="${h}" fill="${PAPER}"/>`,
      `<path d="${rules}" stroke="#D5E3EE" stroke-width="2"/>`,
      `<path d="M${f1(mx)} 0V${h}M${f1(mx + 7)} 0V${h}" stroke="#F0A39B" stroke-width="2"/>`,
      holes,
      star(core + 52, 52, 17),
      spiral(core + 52, h - 64),
      plane(core + 1150, 30),
    ].join(''),
  );
}

export function paperUrl(w: number, h: number): string {
  return svgUrl(`kata-paper:${w}x${h}`, () => build(w, h));
}
