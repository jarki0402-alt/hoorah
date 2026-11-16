/**
 * Angkringan-at-night backdrop sized to the live stage (1280x720 on 16:9; wider or taller on
 * other screens): a striped tarp along the top with a string of warm bulbs, a navy night sky,
 * and the wooden counter along the bottom where the players sit. The tarp and the counter pin
 * to the stage edges; extra height becomes more sky. Flat shapes only, drawn once per size.
 */
import { f1, seeded, svgDoc, svgUrl } from '../../shared/art/svg';

export const TARP_H = 40;
/** Counter (bench) band height at the bottom of the stage. */
export const COUNTER_H = 132;

const SKY = '#16202C';
const TARP_A = '#E8692E';
const TARP_B = '#F6E3C6';

export function kompakBackdropSvg(w: number, h: number): string {
  const rnd = seeded(31);
  const top = h - COUNTER_H;

  // Stars: sparse, small, mostly in the side margins and between rows.
  let stars = '';
  for (let i = 0; i < Math.round((w * h) / 26000); i++) {
    const x = rnd() * w;
    const y = TARP_H + 30 + rnd() * (top - TARP_H - 60);
    const r = rnd() < 0.2 ? 1.8 : 1.1;
    stars += `M${f1(x - r)} ${f1(y)}a${r} ${r} 0 1 0 ${f1(2 * r)} 0a${r} ${r} 0 1 0 ${f1(-2 * r)} 0Z`;
  }

  // Tarp: vertical stripes, scalloped hem.
  const sw = 40;
  let stripes = '';
  for (let x = 0; x < w; x += sw * 2) stripes += `M${x} 0h${sw}v${TARP_H}h-${sw}Z`;
  const scallop = (x: number) => `M${x} ${TARP_H - 2} Q${x + sw / 2} ${TARP_H + 14} ${x + sw} ${TARP_H - 2}Z`;
  let hemA = '';
  let hemB = '';
  for (let x = 0; x < w; x += sw * 2) hemA += scallop(x);
  for (let x = sw; x < w; x += sw * 2) hemB += scallop(x);

  // String lights: a sagging wire between hooks every 220 px, bulbs along it.
  const span = 220;
  const off = ((w / 2) % span) - span;
  let wire = '';
  let bulbs = '';
  let glow = '';
  for (let x0 = off; x0 < w; x0 += span) {
    const y0 = TARP_H + 8;
    const sag = 26;
    wire += `M${f1(x0)} ${y0} Q${f1(x0 + span / 2)} ${y0 + sag * 2} ${f1(x0 + span)} ${y0} `;
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      const x = x0 + span * t;
      const y = y0 + 2 * sag * 2 * t * (1 - t);
      bulbs += `M${f1(x - 5)} ${f1(y + 7)}a5 6 0 1 0 10 0a5 6 0 1 0 -10 0Z`;
      glow += `M${f1(x - 15)} ${f1(y + 7)}a15 15 0 1 0 30 0a15 15 0 1 0 -30 0Z`;
    }
  }

  // Counter: planks with seams, a lighter top edge.
  let seams = '';
  for (let y = top + 34; y < h; y += 34) seams += `M0 ${y}H${w}`;
  let joints = '';
  for (let x = 90, row = 0; row < 4; row++, x = 90 + row * 137)
    for (let jx = x; jx < w; jx += 420) joints += `M${jx} ${top + 14 + row * 34}v34`;

  // Teapot and glasses at the outer ends of the counter.
  const teko = (x: number) =>
    `<g transform="translate(${f1(x)} ${top - 44})"><path d="M8 44 C2 30 6 14 26 12 C46 14 50 30 44 44Z" fill="#3C4651"/><path d="M42 24 C54 20 60 12 62 6 L66 8 C62 22 56 30 46 34Z" fill="#3C4651"/><path d="M8 22 C-4 22 -4 38 10 38" fill="none" stroke="#3C4651" stroke-width="5"/><rect x="18" y="5" width="16" height="8" rx="3" fill="#2B333C"/><path d="M13 20 H39" stroke="#566270" stroke-width="3"/></g>`;
  const gelas = (x: number) =>
    `<g transform="translate(${f1(x)} ${top - 30})"><path d="M0 0 H20 L18 30 H2Z" fill="#F6E3C6" opacity="0.35"/><path d="M1.5 10 H18.5 L18 30 H2Z" fill="#C8742C"/><path d="M26 2 H46 L44 30 H28Z" fill="#F6E3C6" opacity="0.35"/><path d="M27.2 8 H44.8 L44 30 H28Z" fill="#8A4A1E"/></g>`;

  const body = [
    `<rect width="${w}" height="${h}" fill="${SKY}"/>`,
    `<path d="${stars}" fill="#FFF2C2" opacity="0.5"/>`,
    `<path d="${glow}" fill="#FFC928" opacity="0.1"/>`,
    `<path d="${wire}" fill="none" stroke="#0B1118" stroke-width="2"/>`,
    `<path d="${bulbs}" fill="#FFD866"/>`,
    `<rect width="${w}" height="${TARP_H}" fill="${TARP_B}"/>`,
    `<path d="${stripes}" fill="${TARP_A}"/>`,
    `<path d="${hemA}" fill="${TARP_A}"/>`,
    `<path d="${hemB}" fill="${TARP_B}"/>`,
    `<rect y="0" width="${w}" height="5" fill="#B8481A"/>`,
    teko(26),
    gelas(w - 74),
    `<rect x="0" y="${top}" width="${w}" height="${COUNTER_H}" fill="#6B4423"/>`,
    `<rect x="0" y="${top}" width="${w}" height="14" fill="#8A5A2B"/>`,
    `<rect x="0" y="${top + 14}" width="${w}" height="4" fill="#4E3018"/>`,
    `<path d="${seams}${joints}" stroke="#58371C" stroke-width="2"/>`,
  ].join('');
  return svgDoc(w, h, body);
}

export const backdropUrl = (w: number, h: number): string =>
  svgUrl(`kompak-stage-${w}x${h}`, () => kompakBackdropSvg(w, h));
