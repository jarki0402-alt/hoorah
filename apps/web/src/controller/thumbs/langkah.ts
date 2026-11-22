/**
 * Langkah Maut option pictures in the game's dark cinematic look: a deep abyss, one hazard per
 * babak lit by a warm or red accent, and a tiny figure for scale. Keys: `acak` and the babak ids
 * (`eskalator`, `titian`, `tangga`, `laser`, `batu`, `gua`, `ingat`, `lift`).
 */
import { thumbSvg } from './frame';

const BG = '#111214';
const ABYSS = '#1B1D22';
const STONE = '#3A3D46';
const LIT = '#FFC928';
const RED = '#F2453D';
const CREAM = '#FFF7F0';

/** A tiny blocky walker with its feet at (x, y). */
function walker(x: number, y: number, s = 1, shirt = '#FF7A1F'): string {
  return (
    `<g transform="translate(${x} ${y}) scale(${s})">` +
    `<rect x="-5" y="-30" width="10" height="10" rx="1.5" fill="${LIT}"/>` +
    `<rect x="-5" y="-20" width="10" height="11" fill="${shirt}"/>` +
    '<rect x="-5" y="-9" width="4" height="9" fill="#2A2B30"/><rect x="1" y="-9" width="4" height="9" fill="#2A2B30"/>' +
    '</g>'
  );
}

function arrow(x: number, y: number, rot: number, color = LIT, s = 1): string {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 -12 L11 2 L4 2 L4 12 L-4 12 L-4 2 L-11 2 Z" fill="${color}"/></g>`;
}

function abyss(): string {
  return `<rect y="78" width="160" height="42" fill="${ABYSS}"/><path d="M0 78 h160" stroke="#2A2B30" stroke-width="2"/>`;
}

export const THUMBS: Record<string, () => string> = {
  acak: () =>
    thumbSvg(
      BG,
      `${abyss()}<rect x="54" y="26" width="52" height="52" rx="10" fill="#FF5A1F" transform="rotate(-10 80 52)"/>` +
        `<text x="80" y="66" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="40" fill="${CREAM}" transform="rotate(-10 80 52)">?</text>` +
        arrow(26, 40, -90, LIT, 0.9) +
        arrow(134, 40, 90, LIT, 0.9) +
        arrow(30, 96, 180, '#8E929C', 0.8) +
        arrow(130, 96, 0, '#8E929C', 0.8),
    ),
  eskalator: () => {
    let steps = '';
    for (let i = 0; i < 7; i++)
      steps += `<rect x="${20 + i * 17}" y="${28 + i * 10}" width="19" height="${92 - i * 10}" fill="${i % 2 ? STONE : '#454955'}"/>`;
    return thumbSvg(
      BG,
      `${steps}<path d="M18 26 L140 96" stroke="${LIT}" stroke-width="3" stroke-dasharray="6 5"/>` +
        walker(64, 56, 1) +
        arrow(126, 38, 0, LIT, 0.9),
    );
  },
  titian: () =>
    thumbSvg(
      BG,
      `${abyss()}<rect y="96" width="160" height="24" fill="#0B0C0E"/>` +
        '<path d="M0 54 Q80 70 160 54" stroke="#C9A36A" stroke-width="3.5" fill="none"/>' +
        '<path d="M0 46 Q80 60 160 46" stroke="#8C6A4A" stroke-width="2" fill="none"/>' +
        `<g transform="rotate(-12 80 62)">${walker(80, 62, 1.1)}</g>` +
        arrow(36, 30, -90, LIT, 0.85) +
        arrow(124, 30, 90, '#8E929C', 0.85),
    ),
  tangga: () => {
    let s = '';
    for (let i = 0; i < 5; i++)
      s += `<rect x="${30 + i * 14}" y="${96 - i * 12}" width="16" height="${12 + i * 12}" fill="${STONE}"/>`;
    for (let i = 0; i < 4; i++)
      s += `<rect x="${100 - i * 14}" y="${40 - i * 8}" width="16" height="8" fill="#454955"/>`;
    return thumbSvg(
      BG,
      `<rect x="20" y="10" width="120" height="110" fill="#17181C"/>${s}` +
        `<rect x="96" y="44" width="40" height="6" fill="${LIT}"/>` +
        walker(68, 60, 1) +
        arrow(122, 26, -90, LIT, 0.8),
    );
  },
  laser: () =>
    thumbSvg(
      BG,
      '<path d="M0 0 L50 30 L110 30 L160 0 Z M0 120 L50 90 L110 90 L160 120 Z" fill="#1E2026"/>' +
        '<rect x="50" y="30" width="60" height="60" fill="#15161A"/>' +
        `<rect x="10" y="84" width="140" height="4" fill="${RED}"/><rect x="10" y="83" width="140" height="6" fill="${RED}" opacity="0.3"/>` +
        `<rect x="40" y="44" width="80" height="3" fill="${RED}"/><rect x="40" y="43" width="80" height="5" fill="${RED}" opacity="0.3"/>` +
        walker(80, 78, 1.2) +
        arrow(138, 40, 0, LIT, 0.75) +
        arrow(138, 102, 180, LIT, 0.75),
    ),
  batu: () =>
    thumbSvg(
      '#0B2C3D',
      '<path d="M0 40 q20 -6 40 0 t40 0 t40 0 t40 0 M0 70 q20 -6 40 0 t40 0 t40 0 t40 0" stroke="#1C5468" stroke-width="3" fill="none"/>' +
        `<ellipse cx="40" cy="58" rx="20" ry="8" fill="${STONE}"/>` +
        `<ellipse cx="80" cy="42" rx="18" ry="7" fill="#5A5E6A"/><ellipse cx="80" cy="40" rx="18" ry="7" fill="${LIT}" opacity="0.35"/>` +
        '<ellipse cx="120" cy="60" rx="18" ry="7" fill="#2A2D36"/><path d="M106 62 q14 6 28 0" stroke="#1C5468" stroke-width="3" fill="none"/>' +
        `<ellipse cx="80" cy="96" rx="22" ry="9" fill="${STONE}"/>` +
        walker(80, 96, 1) +
        arrow(80, 20, 0, LIT, 0.7),
    ),
  gua: () =>
    thumbSvg(
      '#0B0C0E',
      '<path d="M0 120 L0 40 Q80 -20 160 40 L160 120 Z" fill="#1E1A17"/>' +
        '<path d="M22 120 L22 52 Q80 4 138 52 L138 120 Z" fill="#0B0C0E"/>' +
        '<circle cx="80" cy="76" r="34" fill="#FFB25A" opacity="0.12"/>' +
        '<path d="M60 22 l8 4 l-3 8 l-8 -3Z M98 30 l9 2 l-2 9 l-9 -2Z M80 12 l6 3 l-2 6 l-6 -2Z" fill="#6B5A4A"/>' +
        walker(80, 104, 1.1) +
        arrow(80, 60, 90, LIT, 0.9),
    ),
  ingat: () => {
    let tiles = '';
    const path = new Set(['0,2', '1,2', '1,1', '2,1', '3,1', '3,2', '4,2']);
    for (let c = 0; c < 5; c++)
      for (let r = 0; r < 4; r++) {
        const lit = path.has(`${c},${r}`);
        tiles += `<rect x="${12 + c * 28}" y="${10 + r * 26}" width="24" height="22" rx="3" fill="${lit ? LIT : '#24262C'}" opacity="${lit ? 0.9 : 1}"/>`;
      }
    return thumbSvg(BG, `${tiles}${walker(24, 76, 0.9)}`);
  },
  lift: () =>
    thumbSvg(
      BG,
      '<rect x="44" y="0" width="3" height="34" fill="#8E929C"/><rect x="113" y="0" width="3" height="16" fill="#8E929C"/>' +
        `<path d="M113 16 l6 6 l-4 4" stroke="${RED}" stroke-width="3" fill="none"/>` +
        '<g transform="rotate(-6 80 72)">' +
        `<rect x="36" y="34" width="88" height="76" rx="4" fill="#2A2D36" stroke="#5A5E6A" stroke-width="3"/>` +
        '<rect x="44" y="42" width="72" height="60" fill="#17181C"/>' +
        `${walker(80, 100, 1.2)}</g>` +
        arrow(140, 70, 90, LIT, 0.8),
    ),
};
