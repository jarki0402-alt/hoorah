/**
 * Phone theme for Balap Karung: the racer's own lane on the village field in the late afternoon.
 * The lane runs up the phone toward the red-white finish ribbon under the fence; the sky with the
 * low sun and the umbul-umbul banners sits behind the Host strip and the header.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

const r = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;

function umbul(x: number, base: number, height: number, a: string, b: string, bend: number): string {
  const top = base - height;
  return [
    `<path d="M${f1(x)} ${f1(base)} Q${f1(x + bend * 0.1)} ${f1(base - height * 0.6)} ${f1(x + bend)} ${f1(top)}" fill="none" stroke="#B98F47" stroke-width="2.5" stroke-linecap="round"/>`,
    `<path d="M${f1(x + bend * 0.6)} ${f1(top + 10)} l9 1 L${f1(x + 7)} ${f1(base - 18)} l-4 7 l-4 -7Z" fill="${a}"/>`,
    `<path d="M${f1(x + bend * 0.6 + 4.5)} ${f1(top + 10)} L${f1(x + 3)} ${f1(base - 12)}" stroke="${b}" stroke-width="3"/>`,
  ].join('');
}

function karungScene(w: number, h: number): string {
  const land = w > h;
  // The fence sits between the header and the first line of text on message screens.
  const horizon = Math.round(h * (land ? 0.15 : 0.2));
  const fenceY = Math.round(h * (land ? 0.2 : 0.245));
  const grassY = fenceY + 22;
  const finishY = grassY + 16;
  const rnd = seeded(29);
  const out: string[] = [];
  out.push(r(0, 0, w, grassY, '#FFE3A6'));
  // Low sun on the right, mostly above the hills.
  out.push(
    `<circle cx="${f1(w * 0.82)}" cy="${f1(horizon * 0.7)}" r="${f1(Math.min(42, horizon * 0.42))}" fill="#FFC24D"/>`,
    `<circle cx="${f1(w * 0.82)}" cy="${f1(horizon * 0.7)}" r="${f1(Math.min(31, horizon * 0.31))}" fill="#FFD772"/>`,
  );
  out.push(
    `<path d="M0 ${horizon + 4} C${f1(w * 0.22)} ${horizon - 20} ${f1(w * 0.45)} ${horizon - 4} ${f1(w * 0.6)} ${horizon} C${f1(w * 0.78)} ${horizon - 16} ${f1(w * 0.92)} ${horizon - 8} ${w} ${horizon} V${grassY} H0Z" fill="#C9CF7E"/>`,
    `<path d="M0 ${fenceY - 4} C${f1(w * 0.3)} ${fenceY - 14} ${f1(w * 0.7)} ${fenceY - 8} ${w} ${fenceY - 6} V${grassY} H0Z" fill="#A9C566"/>`,
  );
  // Umbul-umbul at both edges, clear of the centred header text.
  const tall = Math.min(110, fenceY * 0.8);
  out.push(umbul(10, fenceY + 4, tall, '#E8352E', '#FFFFFF', 10));
  out.push(umbul(26, fenceY + 4, tall * 0.8, '#FFC928', '#E8352E', 8));
  out.push(umbul(w - 30, fenceY + 4, tall * 0.85, '#22B35E', '#FFC928', -8));
  out.push(umbul(w - 14, fenceY + 4, tall, '#2F8CFF', '#FFFFFF', -10));
  // Bamboo fence.
  let posts = '';
  for (let x = 8; x < w; x += 38) posts += `M${x} ${fenceY - 4}h6v26h-6Z`;
  out.push(
    `<path d="M0 ${fenceY + 2} H${w} V${fenceY + 8} H0Z M0 ${fenceY + 13} H${w} V${fenceY + 19} H0Z" fill="#D9B46A" stroke="#A57E3C" stroke-width="1"/>`,
    `<path d="${posts}" fill="#C9A15A" stroke="#A57E3C" stroke-width="1"/>`,
  );
  // Grass with mown lanes running up to the finish.
  out.push(r(0, grassY, w, h - grassY, '#9BC25A'));
  const lane = Math.max(64, Math.round(w / (land ? 7 : 4)));
  const x0 = Math.round((w - lane) / 2) % lane;
  for (let x = x0 - lane, i = 0; x < w; x += lane, i++) {
    if (i % 2 === 0) out.push(r(x, grassY, lane, h - grassY, '#A7CB65'));
  }
  let chalk = '';
  for (let x = x0 - lane; x <= w + lane; x += lane) chalk += `M${x} ${finishY} V${h} `;
  out.push(`<path d="${chalk}" stroke="#FFFDF4" stroke-width="3" opacity="0.85"/>`);
  // Tufts.
  let tufts = '';
  for (let k = 0; k < 16; k++) {
    const tx = rnd() * w;
    const ty = finishY + 30 + rnd() * (h - finishY - 40);
    tufts += `M${f1(tx)} ${f1(ty)} l3 -7 l2 7 l3 -5 l1 5Z `;
  }
  out.push(`<path d="${tufts}" fill="#86AC45"/>`);
  // Finish ribbon across the lanes.
  out.push(r(0, finishY - 3, w, 6, '#FFFFFF'));
  let red = '';
  for (let x = 0; x < w; x += 16) red += `M${x} ${finishY - 3}h8v6h-8Z`;
  out.push(`<path d="${red}" fill="#E8352E"/>`);
  return out.join('');
}

export const karungTheme: ControllerTheme = {
  chrome: '#FFE3A6',
  scene: karungScene,
  stripEdge: {
    w: 16,
    h: 8,
    body: '<rect width="16" height="6" fill="#FFFFFF"/><rect width="8" height="6" fill="#E8352E"/><path d="M0 6.5 H16" stroke="#A57E3C" stroke-width="1.5"/>',
  },
};
