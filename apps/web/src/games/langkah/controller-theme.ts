/**
 * Phone theme for Langkah Maut: the edge of a dark abyss. Near-black backdrop with a faint beam of
 * light, the lit rims of stone steps fading into the dark at the bottom, and a hazard-stripe trim
 * under the Host strip, so the diamond arrows glow on calm black.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';

function langkahScene(w: number, h: number): string {
  const out: string[] = [];
  out.push(`<rect width="${f1(w)}" height="${f1(h)}" fill="#0E0F13"/>`);
  out.push(
    `<path d="M${f1(w * 0.42)} 0 L${f1(w * 0.58)} 0 L${f1(w * 0.85)} ${f1(h)} L${f1(w * 0.15)} ${f1(h)}Z" fill="#FFE2B8" fill-opacity="0.035"/>`,
  );
  // Step rims receding down into the dark along the bottom edge.
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const k = i / rows;
    const y = h - 8 - i * Math.max(10, h * 0.022);
    const half = w * (0.5 - k * 0.08);
    out.push(
      `<rect x="${f1(w / 2 - half)}" y="${f1(y)}" width="${f1(half * 2)}" height="3" fill="#FFC928" fill-opacity="${f1(0.55 - k * 0.12)}"/>`,
    );
  }
  return out.join('');
}

export const langkahTheme: ControllerTheme = {
  chrome: '#0E0F13',
  scene: langkahScene,
  // Hazard stripes under the Host strip.
  stripEdge: {
    w: 24,
    h: 8,
    body: '<rect width="24" height="8" fill="#111214"/><path d="M0 8 L8 0 L14 0 L6 8Z M12 8 L20 0 L26 0 L18 8Z" fill="#FFC928"/>',
  },
};
