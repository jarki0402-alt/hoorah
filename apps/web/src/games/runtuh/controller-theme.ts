/**
 * Phone theme for Lantai Runtuh: the quiz stage at night. A dark backdrop with soft spotlight
 * beams, chasing marquee bulbs under the Host strip, and a row of coloured stage tiles (one of
 * them crumbling) along the bottom edge, so the joystick sits in the calm dark.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';

const TILE_COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928'];

function runtuhScene(w: number, h: number): string {
  const land = w > h;
  const out: string[] = [];
  out.push(`<rect width="${f1(w)}" height="${f1(h)}" fill="#12141B"/>`);
  // Spotlight beams from the top.
  for (const [x, spread] of [
    [0.18, 0.16],
    [0.5, 0.2],
    [0.82, 0.16],
  ] as const) {
    const cx = w * x;
    out.push(
      `<path d="M${f1(cx - 8)} 0 L${f1(cx + 8)} 0 L${f1(cx + w * spread)} ${f1(h)} L${f1(cx - w * spread)} ${f1(h)}Z" fill="#FFE9B8" fill-opacity="0.05"/>`,
    );
  }
  // Stage tiles along the bottom edge.
  const size = Math.max(22, Math.min(46, (land ? h : w) * 0.07));
  const y = h - size * 0.9;
  let i = 0;
  for (let x = -size * 0.3; x < w; x += size + 4) {
    const crumbling = i === 3;
    const c = TILE_COLORS[i % TILE_COLORS.length]!;
    const dy = crumbling ? size * 0.35 : 0;
    const rot = crumbling ? ` transform="rotate(12 ${f1(x + size / 2)} ${f1(y + dy + size / 2)})"` : '';
    out.push(
      `<rect x="${f1(x)}" y="${f1(y + dy)}" width="${f1(size)}" height="${f1(size)}" rx="4" fill="${c}"${rot}/>`,
      `<rect x="${f1(x)}" y="${f1(y + dy)}" width="${f1(size)}" height="${f1(size * 0.18)}" rx="3" fill="#FFFFFF" fill-opacity="0.25"${rot}/>`,
    );
    i++;
  }
  return out.join('');
}

export const runtuhTheme: ControllerTheme = {
  chrome: '#12141B',
  scene: runtuhScene,
  // Chasing marquee bulbs under the Host strip.
  stripEdge: {
    w: 36,
    h: 10,
    body:
      '<rect width="36" height="4" fill="#23252C"/>' +
      '<circle cx="9" cy="5" r="3.2" fill="#FFC928"/><circle cx="27" cy="5" r="3.2" fill="#FF8A3D"/>',
  },
};
