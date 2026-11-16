/**
 * Phone theme for Catur: the same quiet room as the main screen, a dark warm floor with an
 * oversized checker, and a wooden board edge peeking in at the top and bottom.
 */
import type { ControllerTheme } from '../../controller/themes';

function scene(w: number, h: number): string {
  const s = Math.max(72, Math.round(Math.min(w, h) / 4.5));
  let d = '';
  for (let y = 0, r = 0; y < h; y += s, r++)
    for (let x = r % 2 ? s : 0; x < w; x += 2 * s) d += `M${x} ${y}h${s}v${s}h${-s}Z`;
  return [
    `<rect width="${w}" height="${h}" fill="#1C1B1A"/>`,
    `<path d="${d}" fill="#211F1E"/>`,
    `<rect y="${h - 10}" width="${w}" height="10" fill="#4A3324"/>`,
    `<rect y="${h - 10}" width="${w}" height="2" fill="#2E1F15"/>`,
  ].join('');
}

export const caturTheme: ControllerTheme = {
  chrome: '#1C1B1A',
  scene,
};
