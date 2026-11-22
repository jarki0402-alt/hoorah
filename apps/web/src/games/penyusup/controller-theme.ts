/**
 * Phone theme for Penyusup: the same black stage as the main screen. A yellow spotlight cone
 * falls from a lamp at the top onto a small round stage at the bottom, with a few big faint
 * question marks in the dark like a theatre poster. Flat shapes, drawn once per viewport shape.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

function penyusupScene(w: number, h: number): string {
  const rnd = seeded(30);
  const cx = w / 2;
  const top = 0;
  const floorY = h - Math.max(36, Math.min(70, h * 0.07));
  const cone = `M${f1(cx - 26)} ${top} L${f1(cx + 26)} ${top} L${f1(cx + w * 0.55)} ${f1(floorY)} L${f1(cx - w * 0.55)} ${f1(floorY)}Z`;
  const inner = `M${f1(cx - 14)} ${top} L${f1(cx + 14)} ${top} L${f1(cx + w * 0.32)} ${f1(floorY)} L${f1(cx - w * 0.32)} ${f1(floorY)}Z`;

  let marks = '';
  const count = Math.max(4, Math.round((w * h) / 70_000));
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = 60 + rnd() * (floorY - 140);
    const s = 40 + rnd() * 70;
    const rot = -20 + rnd() * 40;
    marks += `<text x="${f1(x)}" y="${f1(y)}" font-size="${f1(s)}" transform="rotate(${f1(rot)} ${f1(x)} ${f1(y)})">?</text>`;
  }

  return [
    `<rect width="${w}" height="${h}" fill="#0A0A0B"/>`,
    `<g fill="#18181A" font-family="Baloo 2, sans-serif" font-weight="800">${marks}</g>`,
    `<path d="${cone}" fill="#FFC928" opacity="0.06"/>`,
    `<path d="${inner}" fill="#FFC928" opacity="0.07"/>`,
    `<rect x="${f1(cx - 30)}" y="0" width="60" height="10" rx="3" fill="#2E2E30"/>`,
    `<ellipse cx="${f1(cx)}" cy="${f1(floorY)}" rx="${f1(w * 0.5)}" ry="${f1(Math.max(10, h * 0.018))}" fill="#FFC928" opacity="0.12"/>`,
    `<rect x="0" y="${f1(floorY)}" width="${w}" height="${f1(h - floorY)}" fill="#141416"/>`,
    `<rect x="0" y="${f1(floorY)}" width="${w}" height="3" fill="#FFC928" opacity="0.5"/>`,
  ].join('');
}

/** Phone theme for Penyusup. */
export const penyusupTheme: ControllerTheme = {
  chrome: '#0A0A0B',
  scene: penyusupScene,
};
