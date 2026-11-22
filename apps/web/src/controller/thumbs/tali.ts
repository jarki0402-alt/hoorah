/**
 * Satu Tali route pictures (160×120): two blocky climbers tied by a yellow rope on each route's
 * world. Tebing Senja: dusk cliffs; Hutan Bambu: bamboo over a river; Puncak Salju: snow steps and
 * a lift under a cold sky.
 */
import { f1 } from '../../shared/art/svg';
import { thumbSvg } from './frame';

const INK = '#111214';

/** A box with a lighter top face, front at (x, y, w, h). */
function block(x: number, y: number, w: number, h: number, color: string, top: string): string {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${color}" stroke="${INK}" stroke-width="1.5"/><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="5" fill="${top}" stroke="${INK}" stroke-width="1.5"/>`;
}

/** A tiny climber with feet at (x, y). */
function climber(x: number, y: number, head: string, shirt: string): string {
  return `<g transform="translate(${f1(x)} ${f1(y)})"><rect x="-4" y="-9" width="3" height="9" fill="#2B2F38"/><rect x="1" y="-9" width="3" height="9" fill="#2B2F38"/><rect x="-5" y="-19" width="10" height="11" rx="2" fill="${shirt}" stroke="${INK}" stroke-width="1.3"/><rect x="-6" y="-31" width="12" height="12" rx="2.5" fill="${head}" stroke="${INK}" stroke-width="1.3"/><circle cx="-2.2" cy="-25.5" r="1.1" fill="${INK}"/><circle cx="2.2" cy="-25.5" r="1.1" fill="${INK}"/></g>`;
}

/** The rope between two waists, sagging by `sag`. */
function rope(x1: number, y1: number, x2: number, y2: number, sag: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + sag;
  return `<path d="M${f1(x1)} ${f1(y1)}Q${f1(mx)} ${f1(my)} ${f1(x2)} ${f1(y2)}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M${f1(x1)} ${f1(y1)}Q${f1(mx)} ${f1(my)} ${f1(x2)} ${f1(y2)}" fill="none" stroke="#FFC928" stroke-width="2.4" stroke-linecap="round"/>`;
}

function flag(x: number, y: number, color: string): string {
  return `<rect x="${f1(x)}" y="${f1(y - 22)}" width="2" height="22" fill="#FFF7F0" stroke="${INK}" stroke-width="1"/><path d="M${f1(x + 2)} ${f1(y - 22)}h12l-3 4 3 4h-12Z" fill="${color}" stroke="${INK}" stroke-width="1"/>`;
}

function senja(): string {
  return thumbSvg(
    '#FFB98A',
    [
      '<circle cx="124" cy="34" r="14" fill="#FFE2A8"/>',
      '<rect x="0" y="70" width="40" height="50" fill="#D98A5B"/><rect x="120" y="58" width="40" height="62" fill="#C46F45"/>',
      '<rect y="104" width="160" height="16" fill="#7A3F27"/>',
      block(6, 84, 48, 36, '#C9794B', '#E39A6B'),
      block(70, 66, 40, 54, '#B4663E', '#D58A5E'),
      block(122, 46, 38, 74, '#C9794B', '#E39A6B'),
      flag(146, 46, '#FF5A1F'),
      climber(36, 84, '#FF8A3D', '#2F8CFF'),
      climber(88, 66, '#22B35E', '#F2453D'),
      rope(36, 72, 88, 54, 10),
    ].join(''),
  );
}

function bambu(): string {
  let stalks = '';
  for (const [x, h] of [
    [10, 90],
    [26, 110],
    [128, 100],
    [146, 84],
  ] as const)
    stalks += `<rect x="${x}" y="${120 - h}" width="7" height="${h}" fill="#6DBA62" stroke="#4E9149" stroke-width="1"/><path d="M${x} ${120 - h * 0.6}h7M${x} ${120 - h * 0.3}h7" stroke="#4E9149" stroke-width="1.5"/>`;
  return thumbSvg(
    '#BFE7CB',
    [
      stalks,
      '<rect y="100" width="160" height="20" fill="#3FA7C9"/><path d="M12 108h12M60 112h14M110 107h12" stroke="#BFE8F5" stroke-width="2" stroke-linecap="round"/>',
      block(0, 78, 40, 42, '#5FA65A', '#86C27C'),
      '<rect x="40" y="80" width="78" height="6" fill="#D8C36A" stroke="#111214" stroke-width="1.3"/><path d="M52 80v6M66 80v6M80 80v6M94 80v6M108 80v6" stroke="#A8913E" stroke-width="1.2"/>',
      block(118, 78, 42, 42, '#4D9249', '#78B56C'),
      flag(146, 78, '#F2453D'),
      climber(60, 80, '#FFC928', '#FF5C9A'),
      climber(98, 80, '#F2453D', '#22B35E'),
      rope(60, 68, 98, 68, 9),
    ].join(''),
  );
}

function salju(): string {
  return thumbSvg(
    '#CFE6FF',
    [
      '<path d="M0 90L30 40 52 70 80 26 112 76 134 50 160 84V120H0Z" fill="#B9CDE2"/>',
      '<path d="M30 40l-8 13h16ZM80 26l-10 16h20ZM134 50l-7 11h14Z" fill="#FFFFFF"/>',
      '<rect y="106" width="160" height="14" fill="#FFFFFF"/>',
      block(4, 86, 44, 34, '#E9F1F9', '#FFFFFF'),
      '<rect x="58" y="70" width="34" height="7" fill="#5A5D66" stroke="#111214" stroke-width="1.3"/><rect x="58" y="70" width="34" height="2" fill="#FFC928"/>',
      '<path d="M75 77v29" stroke="#5A5D66" stroke-width="2" stroke-dasharray="3 3"/>',
      block(102, 56, 58, 64, '#D5E3F1', '#FFFFFF'),
      flag(146, 56, '#2F8CFF'),
      climber(30, 86, '#FF8A3D', '#14B8A6'),
      climber(75, 70, '#FFC928', '#2F8CFF'),
      rope(30, 74, 75, 58, 8),
    ].join(''),
  );
}

export const THUMBS: Record<string, () => string> = { senja, bambu, salju };
