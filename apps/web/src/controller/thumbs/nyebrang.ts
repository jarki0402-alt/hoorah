/**
 * Nyebrang option pictures in the game's pixel 2.5D look: lanes seen from above at 3/4, each
 * strip with a darker front face, crisp edges, the map palettes from `games/nyebrang/textures.ts`.
 * Keys: `mode-<Mode>`, `map-<MapPick>`.
 */
import { thumbSvg } from './frame';

interface Pal {
  grass: string;
  grassB: string;
  face: string;
  road: string;
  line: string;
  water: string;
  waterHi: string;
  gravel: string;
  sleeper: string;
  rail: string;
}

const PAL: Record<'kota' | 'sungai' | 'rel' | 'malam', Pal> = {
  kota: {
    grass: '#7CC45E',
    grassB: '#6DB552',
    face: '#4E8F3A',
    road: '#43464E',
    line: '#F2E6B8',
    water: '#2E9EC8',
    waterHi: '#8FD8F0',
    gravel: '#8C8577',
    sleeper: '#6B4A2E',
    rail: '#D8D8DC',
  },
  sungai: {
    grass: '#8CCB5A',
    grassB: '#7DBC4F',
    face: '#5E9A3A',
    road: '#4A4A50',
    line: '#F2E6B8',
    water: '#2A8FC0',
    waterHi: '#9BDDF2',
    gravel: '#8C8577',
    sleeper: '#6B4A2E',
    rail: '#D8D8DC',
  },
  rel: {
    grass: '#A6B865',
    grassB: '#98AA58',
    face: '#7E8F45',
    road: '#45474D',
    line: '#F2E6B8',
    water: '#2E8FB5',
    waterHi: '#8FD0E6',
    gravel: '#9A9081',
    sleeper: '#5E3E24',
    rail: '#E2E2E6',
  },
  malam: {
    grass: '#3F7A52',
    grassB: '#376E49',
    face: '#2C5A3B',
    road: '#2B2D38',
    line: '#E8D98A',
    water: '#1F5C86',
    waterHi: '#5FA6CF',
    gravel: '#6C6878',
    sleeper: '#4A3424',
    rail: '#B8BAC8',
  },
};

const R = (x: number, y: number, w: number, h: number, fill: string): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/** A grass strip with checker tufts and its front face. */
function grass(p: Pal, y: number, h: number): string {
  let tufts = '';
  for (let x = (y / 4) % 16; x < 160; x += 16) tufts += R(x, y + 4, 8, 4, p.grassB);
  return R(0, y, 160, h, p.grass) + tufts + R(0, y + h - 4, 160, 4, p.face);
}

function road(p: Pal, y: number, h: number): string {
  let dashes = '';
  for (let x = 4; x < 160; x += 24) dashes += R(x, y + h / 2 - 1, 12, 3, p.line);
  return R(0, y, 160, h, p.road) + dashes;
}

function water(p: Pal, y: number, h: number): string {
  return R(0, y, 160, h, p.water) + R(10, y + 6, 14, 3, p.waterHi) + R(96, y + h - 8, 18, 3, p.waterHi);
}

function rails(p: Pal, y: number, h: number): string {
  let sleepers = '';
  for (let x = 2; x < 160; x += 12) sleepers += R(x, y + 3, 6, h - 6, p.sleeper);
  return R(0, y, 160, h, p.gravel) + sleepers + R(0, y + 6, 160, 3, p.rail) + R(0, y + h - 9, 160, 3, p.rail);
}

/** A boxy car: light top face, darker front, two wheels. */
function car(x: number, y: number, w: number, top: string, front: string): string {
  return (
    R(x, y, w, 9, top) +
    R(x, y + 9, w, 7, front) +
    R(x + 4, y + 2, w * 0.35, 5, '#BFE6FF') +
    R(x + 3, y + 15, 6, 3, '#111214') +
    R(x + w - 9, y + 15, 6, 3, '#111214')
  );
}

/** The player: a round fruit hopping, with a soft shadow. */
function hopper(x: number, y: number, color = '#FF8A1F'): string {
  return (
    R(x - 6, y + 14, 12, 3, 'rgba(0,0,0,0.25)') +
    R(x - 7, y - 4, 14, 12, color) +
    R(x - 5, y - 6, 10, 2, color) +
    R(x - 5, y + 8, 10, 2, color) +
    R(x - 1, y - 10, 3, 4, '#3E9B3A') +
    R(x - 4, y - 1, 2, 3, '#111214') +
    R(x + 2, y - 1, 2, 3, '#111214')
  );
}

function scene(map: keyof typeof PAL): string {
  const p = PAL[map];
  switch (map) {
    case 'kota':
      return (
        grass(p, 0, 26) +
        road(p, 26, 30) +
        car(18, 31, 34, '#22B3A0', '#178A7B') +
        car(104, 31, 26, '#FFC928', '#D9A514') +
        grass(p, 56, 18) +
        road(p, 74, 28) +
        car(60, 78, 30, '#F2453D', '#C02E28') +
        grass(p, 102, 18) +
        hopper(80, 104)
      );
    case 'sungai': {
      const log = (x: number, y: number, w: number) =>
        R(x, y, w, 10, '#A8743E') + R(x, y + 10, w, 4, '#7A5230');
      const pad = (x: number, y: number) => R(x, y, 14, 9, '#3E9B3A') + R(x + 9, y + 2, 4, 3, '#FF6FA8');
      return (
        grass(p, 0, 22) +
        water(p, 22, 34) +
        log(8, 28, 46) +
        log(98, 36, 40) +
        water(p, 56, 28) +
        pad(36, 64) +
        pad(70, 70) +
        pad(122, 62) +
        grass(p, 84, 36) +
        hopper(78, 98)
      );
    }
    case 'rel':
      return (
        grass(p, 0, 22) +
        rails(p, 22, 30) +
        R(70, 24, 90, 22, '#FF5A1F') +
        R(70, 46, 90, 6, '#B8410F') +
        R(78, 28, 12, 8, '#BFE6FF') +
        R(98, 28, 12, 8, '#BFE6FF') +
        R(118, 28, 12, 8, '#BFE6FF') +
        R(138, 28, 12, 8, '#BFE6FF') +
        grass(p, 52, 22) +
        R(22, 30, 4, 24, '#43464E') +
        R(18, 22, 12, 10, '#111214') +
        R(21, 25, 6, 4, '#F2453D') +
        rails(p, 74, 26) +
        grass(p, 100, 20) +
        hopper(40, 104)
      );
    case 'malam': {
      const glow = '<circle cx="118" cy="60" r="34" fill="#FFE9A0" opacity="0.28"/>';
      return (
        R(0, 0, 160, 120, '#14161F') +
        grass(p, 0, 26) +
        road(p, 26, 30) +
        car(26, 31, 34, '#5E5A6E', '#4A4658') +
        R(58, 36, 4, 4, '#FFE9A0') +
        grass(p, 56, 18) +
        road(p, 74, 28) +
        grass(p, 102, 18) +
        R(116, 30, 4, 46, '#B8BAC8') +
        R(110, 26, 16, 6, '#B8BAC8') +
        R(112, 32, 12, 4, '#FFE9A0') +
        glow +
        hopper(70, 104, '#FFC928')
      );
    }
  }
}

/** Acak: a slice of each map's lanes side by side behind a big die. */
function acak(): string {
  const cols = (['kota', 'sungai', 'rel', 'malam'] as const)
    .map((m, i) => {
      const p = PAL[m];
      const x = i * 40;
      const mid = m === 'sungai' ? p.water : m === 'rel' ? p.gravel : p.road;
      return (
        R(x, 0, 40, 120, p.grass) +
        R(x, 24, 40, 4, p.face) +
        R(x, 28, 40, 30, mid) +
        (m === 'rel' ? R(x, 34, 40, 3, p.rail) + R(x, 49, 40, 3, p.rail) : R(x + 8, 42, 14, 3, p.line)) +
        R(x, 84, 40, 4, p.face)
      );
    })
    .join('');
  const pip = (x: number, y: number) => R(x, y, 8, 8, '#111214');
  return (
    cols +
    R(52, 30, 56, 60, '#111214') +
    R(55, 33, 50, 46, '#FFFFFF') +
    R(55, 79, 50, 8, '#D8D8DC') +
    pip(61, 38) +
    pip(91, 38) +
    pip(76, 52) +
    pip(61, 66) +
    pip(91, 66)
  );
}

function mode(kind: 'balapan' | 'bertahan'): string {
  const p = PAL.kota;
  if (kind === 'balapan') {
    let flag = '';
    for (let x = 0; x < 160; x += 10) flag += R(x, (x / 10) % 2 ? 6 : 0, 10, 6, '#111214');
    return (
      R(0, 0, 160, 12, '#FFFFFF') +
      flag +
      grass(p, 12, 24) +
      road(p, 36, 28) +
      grass(p, 64, 56) +
      hopper(46, 92, '#FF8A1F') +
      hopper(82, 76, '#2F8CFF') +
      hopper(116, 98, '#22B35E') +
      R(78, 40, 6, 16, '#FFFFFF') +
      R(74, 44, 14, 4, '#FFFFFF') +
      R(76, 40, 10, 4, '#FFFFFF') +
      R(79, 36, 4, 4, '#FFFFFF')
    );
  }
  const heart =
    R(62, 22, 14, 8, '#F2453D') +
    R(84, 22, 14, 8, '#F2453D') +
    R(56, 30, 48, 14, '#F2453D') +
    R(62, 44, 36, 8, '#F2453D') +
    R(70, 52, 20, 6, '#F2453D') +
    R(76, 58, 8, 4, '#F2453D') +
    R(64, 28, 6, 6, '#FF9A94');
  return R(0, 0, 160, 120, '#14161F') + grass(p, 72, 48) + heart + hopper(80, 92, '#FFC928');
}

/** Pixel art stays sharp at any size. */
const pixel = (bg: string, body: string): string =>
  thumbSvg(bg, body).replace('<svg ', '<svg shape-rendering="crispEdges" ');

export const THUMBS: Record<string, () => string> = {
  'mode-balapan': () => pixel(PAL.kota.grass, mode('balapan')),
  'mode-bertahan': () => pixel('#14161F', mode('bertahan')),
  'map-kota': () => pixel(PAL.kota.grass, scene('kota')),
  'map-sungai': () => pixel(PAL.sungai.grass, scene('sungai')),
  'map-rel': () => pixel(PAL.rel.grass, scene('rel')),
  'map-malam': () => pixel('#14161F', scene('malam')),
  'map-acak': () => pixel('#111214', acak()),
};
