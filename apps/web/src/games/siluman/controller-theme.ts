import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

/**
 * Kampung Siluman phone: the same woodcut night as the main screen, kept very dark so a lit
 * phone shows nothing bright: deep blue sky, a pale moon, faint stars and the black outline of
 * stilt houses along the bottom. Drawn once per viewport shape.
 */
function silumanScene(w: number, h: number): string {
  const rnd = seeded(29);
  let stars = '';
  const count = Math.max(10, Math.round((w * h) / 16_000));
  for (let i = 0; i < count; i++) {
    stars += `<circle cx="${f1(rnd() * w)}" cy="${f1(rnd() * h * 0.55)}" r="${f1(0.6 + rnd() * 1.2)}" fill="#FFF6DA" opacity="${f1(0.15 + rnd() * 0.3)}"/>`;
  }
  const gy = h - Math.max(28, Math.min(56, h * 0.06));
  const mx = w * 0.78;
  const my = Math.min(110, h * 0.12);
  let houses = '';
  for (let x = -20; x < w + 40; x += 120) {
    const s = 0.55 + ((x / 120) % 3) * 0.12;
    const bw = 90 * s;
    const top = gy - 44 * s;
    houses += `<path d="M${f1(x - 8 * s)} ${f1(top)}L${f1(x + bw / 2)} ${f1(top - 36 * s)}L${f1(x + bw + 8 * s)} ${f1(top)}Z"/><rect x="${f1(x)}" y="${f1(top)}" width="${f1(bw)}" height="${f1(gy - top)}"/>`;
  }
  return [
    `<rect width="${w}" height="${h}" fill="#0A1327"/>`,
    stars,
    `<circle cx="${f1(mx)}" cy="${f1(my)}" r="60" fill="#FFE7A3" opacity="0.05"/>`,
    `<circle cx="${f1(mx)}" cy="${f1(my)}" r="26" fill="#FFE7A3" opacity="0.5"/>`,
    `<g fill="#060C1A">${houses}</g>`,
    `<rect x="0" y="${f1(gy)}" width="${w}" height="${f1(h - gy)}" fill="#060C1A"/>`,
  ].join('');
}

/** Phone theme for Kampung Siluman. */
export const silumanTheme: ControllerTheme = {
  chrome: '#0A1327',
  scene: silumanScene,
};
