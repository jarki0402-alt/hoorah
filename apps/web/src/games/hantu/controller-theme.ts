/**
 * Phone theme for Hantu Tak Terlihat: a dark hallway seen from above, old planks with a warm
 * flashlight pool spilling from the bottom left and two pale eyes hiding in the top right
 * corner. Drawn once per viewport shape.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';

function hantuScene(w: number, h: number): string {
  let planks = '';
  for (let y = 0; y < h; y += 26) planks += `M0 ${y}H${w}`;
  let joints = '';
  for (let y = 0, i = 0; y < h; y += 26, i++)
    for (let x = i % 2 ? 60 : 0; x < w; x += 140) joints += `M${x} ${y}V${y + 26}`;
  const ex = w - Math.max(40, w * 0.07);
  const ey = Math.max(34, h * 0.09);
  return [
    '<defs><radialGradient id="ht-pool" cx="0.15" cy="0.95" r="0.7"><stop offset="0" stop-color="#FFE7A8" stop-opacity="0.22"/><stop offset="1" stop-color="#FFE7A8" stop-opacity="0"/></radialGradient></defs>',
    `<rect width="${w}" height="${h}" fill="#1A120B"/>`,
    `<path d="${planks}" stroke="#0E0A06" stroke-width="2"/>`,
    `<path d="${joints}" stroke="#0E0A06" stroke-width="2"/>`,
    `<rect width="${w}" height="${h}" fill="url(#ht-pool)"/>`,
    `<rect width="${w}" height="${h}" fill="#050608" opacity="0.35"/>`,
    `<ellipse cx="${f1(ex - 10)}" cy="${f1(ey)}" rx="5" ry="6" fill="#A6F4E6" opacity="0.8"/>`,
    `<ellipse cx="${f1(ex + 10)}" cy="${f1(ey)}" rx="5" ry="6" fill="#A6F4E6" opacity="0.8"/>`,
  ].join('');
}

/** Phone theme for Hantu Tak Terlihat. */
export const hantuTheme: ControllerTheme = {
  chrome: '#101214',
  scene: hantuScene,
};
