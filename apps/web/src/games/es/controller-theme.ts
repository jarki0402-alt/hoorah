/**
 * Phone theme for Seluncur Es: a cold sea at dusk. Deep blue water with soft wave lines, a few
 * ice floes drifting along the bottom edge and a frosty icicle trim under the Host strip, so the
 * slingshot pad sits on calm dark water.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';

function esScene(w: number, h: number): string {
  const land = w > h;
  const out: string[] = [];
  out.push(`<rect width="${f1(w)}" height="${f1(h)}" fill="#0B2C3D"/>`);
  // Wave lines.
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    const y = (h * (r + 0.6)) / rows;
    for (let x = (r % 2) * 40 - 20; x < w; x += 80) {
      out.push(
        `<path d="M${f1(x)} ${f1(y)} q14 -5 28 0" stroke="#1C5468" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      );
    }
  }
  // Floes along the bottom edge.
  const size = Math.max(26, Math.min(56, (land ? h : w) * 0.09));
  const y = h - size * 0.55;
  let i = 0;
  for (let x = size * 0.4; x < w; x += size * 2.3) {
    const k = i % 2 ? 0.8 : 1.1;
    out.push(
      `<ellipse cx="${f1(x)}" cy="${f1(y + 5)}" rx="${f1(size * k)}" ry="${f1(size * 0.32 * k)}" fill="#3F8FAB"/>`,
      `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(size * k)}" ry="${f1(size * 0.32 * k)}" fill="#E1F2F8"/>`,
    );
    i++;
  }
  return out.join('');
}

export const esTheme: ControllerTheme = {
  chrome: '#0B2C3D',
  scene: esScene,
  // Icicles under the Host strip.
  stripEdge: {
    w: 30,
    h: 10,
    body:
      '<rect width="30" height="3" fill="#BFE6F2"/>' +
      '<path d="M3 3 L7 10 L11 3Z M15 3 L18 8 L21 3Z M23 3 L26 9 L29 3Z" fill="#E1F2F8"/>',
  },
};
