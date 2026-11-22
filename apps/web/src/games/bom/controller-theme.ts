/**
 * Phone theme for Bom Oper: a comic page. Pale yellow paper with halftone dots behind the header,
 * a row of comic "BUM" bursts under the Host strip, and a picket fence with a fused bomb along the
 * bottom edge, so the joystick sits on open paper.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';

const INK = '#111214';

function bomScene(w: number, h: number): string {
  const land = w > h;
  const out: string[] = [];
  out.push(`<rect width="${w}" height="${h}" fill="#FFE98A"/>`);
  // Halftone dots fading towards the middle.
  let dots = '';
  const step = 22;
  for (let y = 10; y < h * 0.45; y += step)
    for (let x = (y / step) % 2 ? 10 : 21; x < w; x += step) {
      const r = 3.2 * (1 - y / (h * 0.45));
      if (r > 0.6)
        dots += `M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0Z`;
    }
  out.push(`<path d="${dots}" fill="#FFC928"/>`);
  const base = h - Math.max(30, h * (land ? 0.12 : 0.08));
  out.push(
    `<rect y="${f1(base)}" width="${w}" height="${f1(h - base)}" fill="#7CC86A" stroke="${INK}" stroke-width="3"/>`,
  );
  let fence = '';
  for (let x = 6; x < w; x += 26)
    fence += `<path d="M${x} ${f1(base)}v-26l7-7 7 7v26Z" fill="#FFF7F0" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  out.push(
    fence,
    `<rect y="${f1(base - 18)}" width="${w}" height="6" fill="#FFF7F0" stroke="${INK}" stroke-width="2.5"/>`,
  );
  // The bomb sitting by the fence, fuse lit.
  const bx = w - 44;
  const by = base - 14;
  out.push(
    `<circle cx="${f1(bx)}" cy="${f1(by)}" r="17" fill="#22242A" stroke="${INK}" stroke-width="3"/>`,
    `<circle cx="${f1(bx - 6)}" cy="${f1(by - 6)}" r="4" fill="#FFFFFF"/>`,
    `<path d="M${f1(bx + 4)} ${f1(by - 17)}q6 -10 14 -8" fill="none" stroke="#E9D2A6" stroke-width="3"/>`,
    `<path d="M${f1(bx + 18)} ${f1(by - 34)}l3 7 7-3-4 7 7 4-8 1 1 8-6-5-5 5 1-8-8-1 7-4-4-7 7 3Z" fill="#FF8A3D" stroke="${INK}" stroke-width="1.5"/>`,
  );
  return out.join('');
}

export const bomTheme: ControllerTheme = {
  chrome: '#FFC928',
  scene: bomScene,
  // Comic bursts under the Host strip.
  stripEdge: {
    w: 36,
    h: 12,
    body: `<path d="M18 0l3 4 5-2-1 5 5 2-5 2 1 5-5-2-3 4-3-4-5 2 1-5-5-2 5-2-1-5 5 2Z" fill="#F2453D" stroke="${INK}" stroke-width="1"/>`,
  },
};
