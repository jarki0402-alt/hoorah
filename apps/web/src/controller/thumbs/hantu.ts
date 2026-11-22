/**
 * Hantu Tak Terlihat option pictures. Maps: the floor plan drawn from the map data at 5 px per
 * tile with a flashlight beam and a pale ghost. Fright levels: the same dark room, softly lit with
 * a smiling ghost (Seram Ringan) or pitch black with a glowing stare (Seram Beneran).
 * Keys: `map-<MapId>`, `seram-<Fright>`.
 */
import { COLS, MAPS, type MapId, ROWS, Tile, tileAt } from '../../games/hantu/maps';
import { thumbSvg } from './frame';

const T = 5;
const OY = (120 - ROWS * T) / 2;

const FLOOR: Record<MapId, [string, string]> = {
  rumah: ['#3A2416', '#1C1D21'],
  kampung: ['#0F2F2C', '#3A2416'],
};

const ghost = (x: number, y: number, s: number, fill: string) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M-10 12V-2a10 10 0 0 1 20 0V12l-3.4 -3l-3.3 3l-3.3 -3l-3.3 3l-3.4 -3Z" fill="${fill}"/>` +
  `<circle cx="${x - 3.6 * s}" cy="${y - 1 * s}" r="${1.8 * s}" fill="#101214"/><circle cx="${x + 3.6 * s}" cy="${y - 1 * s}" r="${1.8 * s}" fill="#101214"/>`;

function mapThumb(id: MapId): string {
  const m = MAPS[id];
  const [floor, wall] = FLOOR[id];
  let walls = '';
  let props = '';
  let trees = '';
  let doors = '';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = tileAt(m, x, y);
      const px = x * T;
      const py = OY + y * T;
      if (t === Tile.Wall) walls += `M${px} ${py}h${T}v${T}h-${T}Z`;
      else if (t === Tile.Prop || t === Tile.Fuse) props += `M${px + 1} ${py + 1}h3v3h-3Z`;
      else if (t === Tile.Tree) trees += `M${px + 2.5} ${py}a2.6 2.6 0 1 0 0.01 0Z`;
      else if (t === Tile.Door || t === Tile.Exit) doors += `M${px} ${py + 1.5}h${T}v2h-${T}Z`;
    }
  }
  const s = m.spawns[0] ?? { x: 10, y: 10 };
  const sx = s.x * T + 2.5;
  const sy = OY + s.y * T + 2.5;
  return thumbSvg(
    '#050608',
    [
      `<rect y="${OY}" width="160" height="${ROWS * T}" fill="${floor}"/>`,
      `<path d="${walls}" fill="${wall}"/>`,
      id === 'kampung' ? `<path d="${walls}" fill="#C08D3E" opacity="0.35"/>` : '',
      `<path d="${props}" fill="#8A5A33"/>`,
      `<path d="${trees}" fill="#1E4A40"/>`,
      `<path d="${doors}" fill="#FFB04A"/>`,
      `<rect y="${OY}" width="160" height="${ROWS * T}" fill="#050608" opacity="0.55"/>`,
      `<path d="M${sx} ${sy} L${sx + 34} ${sy - 30} L${sx + 46} ${sy - 12}Z" fill="#FFE7A8" opacity="0.55"/>`,
      `<circle cx="${sx}" cy="${sy}" r="3.2" fill="#FFD27A"/>`,
      ghost(sx + 40, sy - 24, 0.9, '#A6F4E6'),
    ].join(''),
  );
}

function frightThumb(beneran: boolean): string {
  if (!beneran)
    return thumbSvg(
      '#2C1B0F',
      [
        '<rect width="160" height="120" fill="#3A2416"/>',
        '<circle cx="40" cy="30" r="44" fill="#FFE7A8" opacity="0.25"/>',
        '<circle cx="40" cy="30" r="6" fill="#FFE7A8"/>',
        ghost(96, 64, 2.6, '#DFFFF9'),
        '<path d="M88 72 Q96 80 104 72" stroke="#101214" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
        '<circle cx="80" cy="70" r="3" fill="#FF9A8E" opacity="0.7"/><circle cx="112" cy="70" r="3" fill="#FF9A8E" opacity="0.7"/>',
      ].join(''),
    );
  return thumbSvg(
    '#050608',
    [
      '<path d="M0 120 L70 50 L96 70 Z" fill="#FFE7A8" opacity="0.18"/>',
      '<ellipse cx="104" cy="52" rx="7" ry="8" fill="#A6F4E6"/><ellipse cx="128" cy="52" rx="7" ry="8" fill="#A6F4E6"/>',
      '<circle cx="106" cy="54" r="3" fill="#050608"/><circle cx="130" cy="54" r="3" fill="#050608"/>',
      '<path d="M0 0H160V14H0Z" fill="#101214"/>',
      '<path d="M8 104h40" stroke="#FF4D3D" stroke-width="3" stroke-linecap="round" opacity="0.8"/>',
    ].join(''),
  );
}

export const THUMBS: Record<string, () => string> = {
  'map-rumah': () => mapThumb('rumah'),
  'map-kampung': () => mapThumb('kampung'),
  'seram-ringan': () => frightThumb(false),
  'seram-beneran': () => frightThumb(true),
};
