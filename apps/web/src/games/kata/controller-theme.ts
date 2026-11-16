import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';

/**
 * Sambung Kata phone: the same school notebook as the main screen. Cream paper with pale blue
 * rules, the red double margin along the left edge and a pencil in the top corner. Everything stays faint so the letter keys read clearly.
 */
function kataScene(w: number, h: number): string {
  const gap = Math.max(30, Math.round(h / 24));
  let rules = '';
  for (let y = gap * 2; y < h; y += gap) rules += `M0 ${y}H${w}`;
  const mx = Math.round(Math.min(14, w * 0.035));
  const px = w - 76;
  const pencil = `<g transform="translate(${f1(px)} 18) rotate(18)" stroke="#1D2430" stroke-width="1.5" stroke-linejoin="round"><rect x="0" y="0" width="46" height="9" rx="1.5" fill="#FFC928"/><rect x="-7" y="0" width="7" height="9" rx="1.5" fill="#F0A39B"/><path d="M46 0 L57 4.5 L46 9Z" fill="#F3DDB4"/><path d="M53.5 3 L57 4.5 L53.5 6Z" fill="#1D2430"/></g>`;
  return [
    `<rect width="${w}" height="${h}" fill="#FBF5E9"/>`,
    `<path d="${rules}" stroke="#D5E3EE" stroke-width="1.5"/>`,
    `<path d="M${mx} 0V${h}M${mx + 4} 0V${h}" stroke="#F0A39B" stroke-width="1.5"/>`,
    pencil,
  ].join('');
}

/** Phone theme for Sambung Kata. */
export const kataTheme: ControllerTheme = {
  chrome: '#1D2430',
  scene: kataScene,
};
