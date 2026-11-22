import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';

/**
 * Juara Eja phone: the same cream paper and ink as the main screen. Faint ruled lines, a red
 * margin and a little ink nib with a drop on the right edge. Everything stays faint so the
 * letter keys read clearly.
 */
function ejaScene(w: number, h: number): string {
  const gap = Math.max(32, Math.round(h / 22));
  let rules = '';
  for (let y = gap * 2; y < h; y += gap) rules += `M0 ${y}H${w}`;
  const mx = Math.round(Math.min(18, w * 0.045));
  // A small ink nib and drop between the hint and the keyboard, clear of the top row.
  const nx = w - 46;
  const ny = Math.round(h * 0.44);
  const nib = `<g transform="translate(${f1(nx)} ${ny}) rotate(28)" opacity="0.5"><path d="M0 0h10l-1 22l-4 10l-4-10Z" fill="#1C1A17"/><circle cx="5" cy="14" r="1.6" fill="#FBF6EC"/></g><path d="M${f1(nx - 16)} ${ny + 46}q4 8 0 12q-4-4 0-12Z" fill="#1C1A17" opacity="0.3"/>`;
  return [
    `<rect width="${w}" height="${h}" fill="#FBF6EC"/>`,
    `<path d="${rules}" stroke="#EADFCB" stroke-width="1.5"/>`,
    `<path d="M${mx} 0V${h}" stroke="#FF5A1F" stroke-width="1.5" opacity="0.45"/>`,
    nib,
  ].join('');
}

/** Phone theme for Juara Eja. */
export const ejaTheme: ControllerTheme = {
  chrome: '#1C1A17',
  scene: ejaScene,
};
