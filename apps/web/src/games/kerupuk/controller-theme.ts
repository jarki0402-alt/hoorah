/**
 * Phone theme for Makan Kerupuk: the same 17 Agustus kampung yard as the main screen. Sky with
 * merah putih bunting, umbul-umbul at the edges, rooftops and the bamboo fence, then the grass
 * yard the GIGIT kerupuk sits on. Decoration stays at the edges and above the first line of
 * text; the middle of the screen is plain sky or grass so text stays readable.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

const r = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"/>`;

/** A slim umbul-umbul hugging the screen edge (side -1 = left, 1 = right). */
function umbul(x: number, top: number, base: number, side: 1 | -1, a: string, b: string): string {
  const tip = x - side * 14;
  const len = (base - top) * 0.55;
  const bx = x - side * 2;
  return [
    `<path d="M${f1(bx)} ${f1(top + 6)} h${-side * 8} q${-side * 3} ${f1(len * 0.5)} ${side * 1} ${f1(len)} l${side * 3} -8 l${side * 3} 7 q${side * 1} ${f1(-len * 0.5)} ${side * 1} ${f1(-len + 1)}Z" fill="${a}"/>`,
    `<path d="M${f1(bx - side * 3)} ${f1(top + 6)} h${-side * 2.5} q${-side * 1} ${f1(len * 0.5)} ${side * 0.5} ${f1(len - 6)} h${side * 2.5} q${-side * 1} ${f1(-len * 0.5)} ${-side * 0.5} ${f1(-len + 6)}Z" fill="${b}"/>`,
    `<path d="M${f1(x)} ${f1(base)} C${f1(x)} ${f1(top + 30)} ${f1(x - side * 2)} ${f1(top)} ${f1(tip)} ${f1(top + 8)}" fill="none" stroke="#C9A35E" stroke-width="2.6" stroke-linecap="round"/>`,
  ].join('');
}

function kerupukScene(w: number, h: number): string {
  // Landscape puts the info beside the button, so the horizon can sit higher.
  const land = w > h;
  const horizon = Math.round(h * (land ? 0.14 : 0.2));
  const fenceY = Math.round(h * (land ? 0.19 : 0.245));
  const yardY = fenceY + 24;
  const rnd = seeded(29);
  // Bunting: small and high so it stays above the first line of text.
  let red = '';
  let white = '';
  for (let x = 7, i = 0; x < w; x += 18, i++) {
    const t = x / w;
    const y = 2 + 34 * t * (1 - t);
    const tri = `M${f1(x - 5.5)} ${f1(y)} L${f1(x + 5.5)} ${f1(y)} L${f1(x)} ${f1(y + 9)}Z `;
    if (i % 2) white += tri;
    else red += tri;
  }
  // Rooftops along the horizon.
  let roofs = '';
  let walls = '';
  for (let x = -10; x < w; ) {
    const bw = 34 + Math.round(rnd() * 22);
    const bh = 10 + Math.round(rnd() * 6);
    const top = horizon - bh + 6;
    walls += r(x + 3, top, bw - 6, bh + 4, rnd() < 0.5 ? '#FFF2DC' : '#F4D9A8');
    roofs += `M${f1(x)} ${f1(top + 1)} L${f1(x + bw / 2)} ${f1(top - bh * 0.6)} L${f1(x + bw)} ${f1(top + 1)}Z `;
    x += bw + 6 + Math.round(rnd() * 14);
  }
  let posts = '';
  for (let x = 5; x < w; x += 15) posts += `M${x} ${fenceY}h4v22h-4Z`;
  let tufts = '';
  for (let k = 0; k < 22; k++) {
    const tx = rnd() * w;
    const ty = yardY + 14 + rnd() * (h - yardY - 20);
    tufts += `M${f1(tx)} ${f1(ty)} l3 -6 l2 6 l3 -5 l1 5Z `;
  }
  return [
    r(0, 0, w, yardY, '#9ADBFF'),
    `<g fill="#FFFFFF"><ellipse cx="${f1(w * 0.2)}" cy="${f1(horizon * 0.6)}" rx="26" ry="8"/><circle cx="${f1(w * 0.2 - 8)}" cy="${f1(horizon * 0.6 - 6)}" r="10"/><circle cx="${f1(w * 0.2 + 8)}" cy="${f1(horizon * 0.6 - 9)}" r="12"/><ellipse cx="${f1(w * 0.78)}" cy="${f1(horizon * 0.42)}" rx="22" ry="7"/><circle cx="${f1(w * 0.78 + 6)}" cy="${f1(horizon * 0.42 - 7)}" r="10"/></g>`,
    `<path d="M0 ${horizon + 4} C${f1(w * 0.3)} ${horizon - 14} ${f1(w * 0.6)} ${horizon - 4} ${w} ${horizon - 6} V${yardY} H0Z" fill="#A8DC86"/>`,
    walls,
    `<path d="${roofs}" fill="#C9733A"/>`,
    `<path d="M0 2 Q${f1(w / 2)} 19 ${w} 2" fill="none" stroke="#6B4423" stroke-width="1.2"/>`,
    `<path d="${red}" fill="#E8352E"/><path d="${white}" fill="#FFFFFF"/>`,
    umbul(5, horizon - 70, fenceY + 4, -1, '#E8352E', '#FFFFFF'),
    umbul(w - 5, horizon - 64, fenceY + 4, 1, '#FFC928', '#E8352E'),
    `<path d="${posts}" fill="#D9B36A"/>`,
    r(0, fenceY + 4, w, 4, '#B8913F'),
    r(0, fenceY + 13, w, 4, '#B8913F'),
    r(0, yardY, w, h - yardY, '#8CCB63'),
    `<path d="${tufts}" fill="#6FB24E"/>`,
  ].join('');
}

/** Phone theme for Makan Kerupuk. */
export const kerupukTheme: ControllerTheme = {
  chrome: '#9ADBFF',
  scene: kerupukScene,
  // The Host strip ends in the wavy edge of a kerupuk.
  stripEdge: {
    w: 20,
    h: 12,
    body: '<path d="M0 0 H20 V5 Q15 12 10 5 Q5 12 0 5Z" fill="#FFF4D6"/><path d="M0 5 Q5 12 10 5 Q15 12 20 5" fill="none" stroke="#D2A85E" stroke-width="1.5"/>',
  },
};
