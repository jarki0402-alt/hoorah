/**
 * Phone theme for Dapur Heboh: the kitchen wall behind the controls. Dark subway tiles with
 * grout lines, a wooden shelf with jars along the top, a pan and a ladle hanging from a rail,
 * and the steel counter edge along the bottom with a few ingredients on it. The middle stays calm
 * so the joystick, the buttons and the "Siap tangkap!" callout read at a glance.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';
import { iconMarkup } from './art';

const WALL = '#1A1B1F';
const TILE = '#202127';
const GROUT = '#141518';

function icon(id: string, x: number, y: number, size: number): string {
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(size / 40)})">${iconMarkup(id)}</g>`;
}

function jar(x: number, y: number, s: number, lid: string, fill: string): string {
  return [
    `<rect x="${f1(x)}" y="${f1(y + s * 0.25)}" width="${f1(s)}" height="${f1(s * 1.1)}" rx="${f1(s * 0.22)}" fill="#3A3C42"/>`,
    `<rect x="${f1(x + s * 0.12)}" y="${f1(y + s * 0.55)}" width="${f1(s * 0.76)}" height="${f1(s * 0.7)}" rx="${f1(s * 0.15)}" fill="${fill}"/>`,
    `<rect x="${f1(x - s * 0.06)}" y="${f1(y)}" width="${f1(s * 1.12)}" height="${f1(s * 0.32)}" rx="${f1(s * 0.12)}" fill="${lid}"/>`,
  ].join('');
}

function dapurScene(w: number, h: number): string {
  const t = Math.round(Math.min(44, Math.max(26, Math.min(w, h) / 9)));
  const out: string[] = [];
  out.push(
    `<defs><pattern id="dp-tile" width="${t * 2}" height="${t}" patternUnits="userSpaceOnUse">`,
    `<rect width="${t * 2}" height="${t}" fill="${TILE}"/>`,
    `<path d="M0 ${t - 1}h${t * 2}v1H0Z M${t * 2 - 1} 0v${t / 2}h1V0Z M${t - 1} ${t / 2}v${t / 2}h1v-${t / 2}Z M0 ${t / 2 - 1}h${t * 2}v1H0Z" fill="${GROUT}"/>`,
    `</pattern></defs>`,
  );
  out.push(
    `<rect width="${w}" height="${h}" fill="${WALL}"/>`,
    `<rect width="${w}" height="${h}" fill="url(#dp-tile)"/>`,
  );

  // Shelf with jars, top left; utensil rail with a pan and a ladle, top right.
  const shelfY = Math.round(t * 1.4);
  const shelfW = Math.min(w * 0.34, t * 7);
  out.push(
    `<rect x="${f1(t * 0.6)}" y="${shelfY}" width="${f1(shelfW)}" height="${f1(t * 0.18)}" rx="3" fill="#B9824C"/>`,
    `<rect x="${f1(t * 0.6)}" y="${f1(shelfY + t * 0.18)}" width="${f1(shelfW)}" height="${f1(t * 0.08)}" fill="#8C5D2E"/>`,
  );
  const js = t * 0.62;
  out.push(
    jar(t * 1.1, shelfY - js * 1.38, js, '#E8432E', '#F3D9A0'),
    jar(t * 1.1 + js * 1.5, shelfY - js * 1.38, js, '#FFC928', '#6CC24A'),
    jar(t * 1.1 + js * 3, shelfY - js * 1.38, js, '#FF5A1F', '#E09A47'),
  );
  const railY = Math.round(t * 0.7);
  const railX0 = w - Math.min(w * 0.36, t * 7.5);
  out.push(
    `<rect x="${f1(railX0)}" y="${railY}" width="${f1(w - railX0 - t * 0.6)}" height="${f1(t * 0.12)}" rx="2" fill="#6E747E"/>`,
  );
  // Pan.
  const px = railX0 + t * 1.6;
  out.push(
    `<rect x="${f1(px - t * 0.06)}" y="${railY}" width="${f1(t * 0.12)}" height="${f1(t * 0.5)}" fill="#6E747E"/>`,
    `<rect x="${f1(px - t * 0.12)}" y="${f1(railY + t * 0.45)}" width="${f1(t * 0.24)}" height="${f1(t * 1.1)}" rx="${f1(t * 0.1)}" fill="#2B2C30"/>`,
    `<circle cx="${f1(px)}" cy="${f1(railY + t * 2.2)}" r="${f1(t * 0.85)}" fill="#2B2C30"/>`,
    `<circle cx="${f1(px)}" cy="${f1(railY + t * 2.2)}" r="${f1(t * 0.66)}" fill="#3A3D45"/>`,
  );
  // Ladle.
  const lx = railX0 + t * 3.6;
  out.push(
    `<rect x="${f1(lx - t * 0.05)}" y="${railY}" width="${f1(t * 0.1)}" height="${f1(t * 1.8)}" rx="${f1(t * 0.05)}" fill="#A8ABB2"/>`,
    `<path d="M${f1(lx - t * 0.5)} ${f1(railY + t * 1.8)} a${f1(t * 0.5)} ${f1(t * 0.45)} 0 0 0 ${f1(t)} 0 Z" fill="#A8ABB2"/>`,
  );
  // Whisk.
  const wx = railX0 + t * 5.2;
  if (wx < w - t) {
    out.push(
      `<rect x="${f1(wx - t * 0.05)}" y="${railY}" width="${f1(t * 0.1)}" height="${f1(t * 0.8)}" fill="#E8432E"/>`,
      `<path d="M${f1(wx)} ${f1(railY + t * 0.8)} q${f1(-t * 0.45)} ${f1(t * 0.7)} 0 ${f1(t * 1.1)} q${f1(t * 0.45)} ${f1(-t * 0.4)} 0 ${f1(-t * 1.1)} M${f1(wx)} ${f1(railY + t * 0.8)} v${f1(t * 1.1)}" stroke="#DADCE0" stroke-width="2" fill="none"/>`,
    );
  }

  // Steel counter edge along the bottom with a few ingredients.
  const cy = h - t * 0.9;
  out.push(
    `<rect y="${f1(cy)}" width="${w}" height="${f1(h - cy)}" fill="#3A3C42"/>`,
    `<rect y="${f1(cy)}" width="${w}" height="${f1(t * 0.16)}" fill="#6E747E"/>`,
    `<rect y="${f1(cy + t * 0.16)}" width="${w}" height="${f1(t * 0.06)}" fill="#1E1F23"/>`,
  );
  const s = t * 1.05;
  out.push(
    icon('tomat', t * 0.4, cy - s * 0.7, s),
    icon('selada', t * 0.4 + s * 0.85, cy - s * 0.75, s),
    icon('roti', w - t * 0.4 - s * 1.9, cy - s * 0.66, s),
    icon('telur', w - t * 0.4 - s * 0.95, cy - s * 0.62, s * 0.9),
  );
  return out.join('');
}

export const dapurTheme: ControllerTheme = {
  chrome: '#1A1B1F',
  scene: dapurScene,
  stripEdge: {
    w: 32,
    h: 8,
    body: '<rect width="32" height="8" fill="#1A1B1F"/><rect width="16" height="6" fill="#FFC928"/><rect x="16" width="16" height="6" fill="#2B2C30"/><rect y="6" width="32" height="2" fill="#0B0C0E" opacity="0.6"/>',
  },
};
