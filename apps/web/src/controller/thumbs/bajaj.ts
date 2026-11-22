/**
 * Bajaj Rush option pictures: race modes and circuits, in the game's sticker style (flat colours,
 * thick ink outline). Keys: `mode-<Mode>`, `map-<CircuitId>`.
 */
import { thumbSvg } from './frame';

const K = '#111214';

/** A side-view bajaj standing on the ground at (x, y). */
function bajaj(x: number, y: number, color: string, flip = false, s = 1): string {
  const t = `translate(${x} ${y}) scale(${flip ? -s : s} ${s})`;
  return (
    `<g transform="${t}" stroke="${K}" stroke-width="3" stroke-linejoin="round">` +
    `<path d="M-26 -4h46a7 7 0 0 0 7-7v-9q0-15-15-19h-21q-17 0-17 17Z" fill="${color}"/>` +
    `<path d="M-13 -33h13q8 2 10 13h-23Z" fill="#BFE6FF" stroke-width="2.5"/>` +
    `<path d="M-30 -10h6" stroke-linecap="round"/>` +
    `<circle cx="-15" cy="-2" r="6.5" fill="${K}"/><circle cx="16" cy="-2" r="6.5" fill="${K}"/>` +
    `<circle cx="-15" cy="-2" r="2.2" fill="#C9CED5" stroke="none"/><circle cx="16" cy="-2" r="2.2" fill="#C9CED5" stroke="none"/>` +
    '</g>'
  );
}

function checker(x: number, y: number, cols: number, rows: number, size: number): string {
  let d = '';
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if ((r + c) % 2 === 0) d += `M${x + c * size} ${y + r * size}h${size}v${size}h-${size}Z`;
  return (
    `<rect x="${x}" y="${y}" width="${cols * size}" height="${rows * size}" fill="#FFF7F0" stroke="${K}" stroke-width="2.5"/>` +
    `<path d="${d}" fill="${K}"/>`
  );
}

function road(y: number, h: number, color = '#43464E'): string {
  return (
    `<rect x="0" y="${y}" width="160" height="${h}" fill="${color}"/>` +
    `<path d="M6 ${y + h / 2}h18M40 ${y + h / 2}h18M74 ${y + h / 2}h18M108 ${y + h / 2}h18M142 ${y + h / 2}h18" stroke="#F2E6B8" stroke-width="3"/>`
  );
}

export const THUMBS: Record<string, () => string> = {
  'mode-gp': () =>
    thumbSvg(
      '#FFE3D3',
      road(92, 28) +
        `<path d="M30 92V22" stroke="${K}" stroke-width="4" stroke-linecap="round"/>${checker(32, 24, 5, 3, 8)}` +
        `<path d="M96 30h40v10a20 20 0 0 1-40 0Z" fill="#FFC928" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>` +
        `<path d="M96 34h-7a9 9 0 0 0 9 12M136 34h7a9 9 0 0 1-9 12" fill="none" stroke="${K}" stroke-width="3"/>` +
        `<path d="M111 60h10v12h-10Z" fill="#FF8A3D" stroke="${K}" stroke-width="3"/>` +
        `<rect x="101" y="72" width="30" height="9" rx="2" fill="#FF5A1F" stroke="${K}" stroke-width="3"/>` +
        bajaj(70, 112, '#FF5A1F', false, 0.8),
    ),
  'mode-duel': () =>
    thumbSvg(
      '#DCEBFF',
      road(92, 28) +
        bajaj(44, 104, '#2F8CFF') +
        bajaj(118, 104, '#F2453D', true) +
        `<path d="M80 18l7 12 13 2-9 9 2 13-13-6-13 6 2-13-9-9 13-2Z" fill="#FFC928" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>`,
    ),
  'mode-arena': () =>
    thumbSvg(
      '#FFE0DE',
      `<ellipse cx="80" cy="96" rx="74" ry="22" fill="#C9CED5" stroke="${K}" stroke-width="3"/>` +
        `<ellipse cx="80" cy="96" rx="56" ry="14" fill="#E3E6EA"/>` +
        bajaj(56, 100, '#F2453D', false, 0.85) +
        `<circle cx="112" cy="58" r="14" fill="${K}"/><path d="M118 46q6-10 14-6" fill="none" stroke="${K}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M134 34l4-8M140 42l8-2M130 30l-2-8" stroke="#FF8A1F" stroke-width="3.5" stroke-linecap="round"/>` +
        `<circle cx="107" cy="53" r="3.5" fill="#FFF7F0"/>` +
        `<path d="M22 30l6 6M30 22l2 8M18 42l8-2" stroke="#F2453D" stroke-width="3.5" stroke-linecap="round"/>`,
    ),
  'mode-time': () =>
    thumbSvg(
      '#DDF4E5',
      road(96, 24) +
        `<rect x="72" y="12" width="16" height="10" rx="3" fill="#FFC928" stroke="${K}" stroke-width="3"/>` +
        `<circle cx="80" cy="56" r="32" fill="#FFF7F0" stroke="${K}" stroke-width="4"/>` +
        `<path d="M80 56V36M80 56l14 8" stroke="${K}" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M80 56V24a32 32 0 0 1 28 16Z" fill="#22B35E" opacity="0.35"/>` +
        `<circle cx="80" cy="56" r="4" fill="${K}"/>` +
        `<path d="M24 66h18M18 78h22M28 54h12" stroke="#22B35E" stroke-width="4" stroke-linecap="round"/>`,
    ),
  'map-kota': () =>
    thumbSvg(
      '#BFE6FF',
      `<circle cx="132" cy="22" r="10" fill="#FFC928"/>` +
        `<rect x="6" y="40" width="30" height="50" fill="#FF8A3D" stroke="${K}" stroke-width="2.5"/>` +
        `<rect x="36" y="52" width="26" height="38" fill="#FFF2B8" stroke="${K}" stroke-width="2.5"/>` +
        `<rect x="104" y="46" width="28" height="44" fill="#2F8CFF" stroke="${K}" stroke-width="2.5"/>` +
        `<rect x="132" y="56" width="26" height="34" fill="#22B35E" stroke="${K}" stroke-width="2.5"/>` +
        `<path d="M12 50h6M24 50h6M12 62h6M24 62h6M110 56h6M120 56h6M110 68h6M120 68h6M42 62h14M138 66h14" stroke="${K}" stroke-width="3"/>` +
        `<path d="M76 90V36l4-14 4 14v54Z" fill="#E3E6EA" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<path d="M74 90h12l4 4H70Z" fill="#C9CED5" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<path d="M80 14l2 6h-4Z" fill="#FFC928" stroke="${K}" stroke-width="2"/>` +
        road(92, 28) +
        bajaj(118, 116, '#FFC928', true, 0.6),
    ),
  'map-pantai': () =>
    thumbSvg(
      '#FFD08A',
      `<circle cx="44" cy="58" r="18" fill="#FF8A3D"/>` +
        `<rect x="0" y="58" width="160" height="62" fill="#2F8CFF"/>` +
        `<path d="M10 70h22M48 78h18M20 90h16" stroke="#9BDDF2" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M118 70l4-46h12l4 46Z" fill="#FFF7F0" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<path d="M120 54h16l-1 10h-14ZM122 34h12l-1 8h-10Z" fill="#F2453D"/>` +
        `<path d="M118 24h20l-10-10Z" fill="#F2453D" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<path d="M138 30l18-6M138 34l18 4" stroke="#FFF2B8" stroke-width="3" stroke-linecap="round"/>` +
        `<rect x="0" y="96" width="160" height="10" fill="#B07A45" stroke="${K}" stroke-width="2.5"/>` +
        `<path d="M20 106v14M60 106v14M100 106v14M140 106v14" stroke="${K}" stroke-width="4"/>` +
        bajaj(70, 96, '#2F8CFF', false, 0.6),
    ),
  'map-puncak': () =>
    thumbSvg(
      '#E3F1E6',
      `<path d="M0 60l40-34 34 26 30-30 56 40v58H0Z" fill="#A6C9B0"/>` +
        `<path d="M0 80q40-26 80-8t80-6v54H0Z" fill="#5FAE5A" stroke="${K}" stroke-width="2.5"/>` +
        `<path d="M8 88q34-14 66-2M8 98q40-14 76 0M90 82q30-10 64-8M96 94q30-8 60-4" fill="none" stroke="#3E8A3A" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M112 120v-22a16 16 0 0 1 32 0v22Z" fill="#8C8577" stroke="${K}" stroke-width="2.5"/>` +
        `<path d="M118 120v-20a10 10 0 0 1 20 0v20Z" fill="${K}"/>` +
        `<path d="M0 110q50-8 120 6v4H0Z" fill="#43464E"/>` +
        `<path d="M14 26h40M30 18h34M100 40h40" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.8"/>` +
        bajaj(56, 116, '#22B35E', false, 0.6),
    ),
};
