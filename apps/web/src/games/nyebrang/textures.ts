/**
 * Pixel art for Nyebrang, painted at load time on small canvases (no image files): 16 art pixels
 * per cell, shown with nearest-neighbour scaling so every pixel stays crisp. The look is a warm
 * 3/4 view: lanes sit at different heights (grass above road above water) and show a front face
 * where they drop; vehicles, logs and props have a lit top and a darker front side, plus a soft
 * drop shadow. Player avatars are the shared SVG characters rasterized to 20 px, so they turn
 * into chunky pixel people that match the world.
 */
import type { Look } from '@hoorah/protocol';
import type * as Phaser from 'phaser';
import type { Face } from '../../shared/art/fruits';
import { avatarMarkup } from '../../shared/art/people';
import { svgDoc, svgUrl } from '../../shared/art/svg';
import { loadImage } from '../common/stage';
import type { ItemKind, MapId, PropKind } from './lanes';

/** Art pixels per cell. */
export const CELL = 16;
export const FRUIT_PX = 20;
export const FACES: readonly Face[] = ['happy', 'wow', 'effort', 'sad'];

type Paint = (g: CanvasRenderingContext2D) => void;

interface Palette {
  grassA: string;
  grassB: string;
  grassDot: string;
  face: string;
  faceLip: string;
  side: string;
  sideSeam: string;
  road: string;
  roadLine: string;
  water: string;
  waterHi: string;
  gravel: string;
  sleeper: string;
  rail: string;
}

export const PALETTES: Record<MapId, Palette> = {
  kota: {
    grassA: '#7CC45E',
    grassB: '#6DB552',
    grassDot: '#5A9E43',
    face: '#7A5230',
    faceLip: '#4E8F3A',
    side: '#CFC6B4',
    sideSeam: '#AFA591',
    road: '#43464E',
    roadLine: '#F2E6B8',
    water: '#2E9EC8',
    waterHi: '#8FD8F0',
    gravel: '#8C8577',
    sleeper: '#6B4A2E',
    rail: '#D8D8DC',
  },
  sungai: {
    grassA: '#8CCB5A',
    grassB: '#7DBC4F',
    grassDot: '#5E9A3A',
    face: '#8A5A2B',
    faceLip: '#5E9A3A',
    side: '#D9C79A',
    sideSeam: '#B9A473',
    road: '#4A4A50',
    roadLine: '#F2E6B8',
    water: '#2A8FC0',
    waterHi: '#9BDDF2',
    gravel: '#8C8577',
    sleeper: '#6B4A2E',
    rail: '#D8D8DC',
  },
  rel: {
    grassA: '#A6B865',
    grassB: '#98AA58',
    grassDot: '#7E8F45',
    face: '#6E4E30',
    faceLip: '#7E8F45',
    side: '#B8AE9C',
    sideSeam: '#978C78',
    road: '#45474D',
    roadLine: '#F2E6B8',
    water: '#2E8FB5',
    waterHi: '#8FD0E6',
    gravel: '#9A9081',
    sleeper: '#5E3E24',
    rail: '#E2E2E6',
  },
  malam: {
    grassA: '#3F7A52',
    grassB: '#376E49',
    grassDot: '#2C5A3B',
    face: '#4A3424',
    faceLip: '#2C5A3B',
    side: '#5E5A6E',
    sideSeam: '#4A4658',
    road: '#2B2D38',
    roadLine: '#E8D98A',
    water: '#1F5C86',
    waterHi: '#5FA6CF',
    gravel: '#6C6878',
    sleeper: '#4A3424',
    rail: '#B8BAC8',
  },
};

const VEHICLE_TINTS = ['#2F8CFF', '#22B35E', '#FF8A1F', '#FFC928'] as const;

function canvas(w: number, h: number, paint: Paint): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = false;
    paint(g);
  }
  return c;
}

const px = (g: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

/** Darken (amt < 0) or lighten a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ------------------------------------------------------------------ lanes (32x16, two cells) */

function paintGrass(p: Palette, dark: boolean): Paint {
  return (g) => {
    px(g, dark ? p.grassB : p.grassA, 0, 0, 16, 16);
    px(g, dark ? p.grassA : p.grassB, 16, 0, 16, 16);
    for (const [x, y] of [
      [3, 4],
      [9, 11],
      [13, 6],
      [20, 3],
      [26, 12],
      [29, 7],
    ] as const) {
      px(g, p.grassDot, x, y, 1, 2);
      px(g, p.grassDot, x + 1, y + 1, 1, 1);
    }
  };
}

function paintSide(p: Palette): Paint {
  return (g) => {
    px(g, p.side, 0, 0, 32, 16);
    for (let x = 0; x < 32; x += 8) px(g, p.sideSeam, x, 0, 1, 16);
    px(g, p.sideSeam, 0, 8, 32, 1);
    px(g, shade(p.side, 0.15), 0, 0, 32, 1);
  };
}

function paintRoad(p: Palette, divider: boolean): Paint {
  return (g) => {
    px(g, p.road, 0, 0, 32, 16);
    for (const [x, y] of [
      [5, 5],
      [19, 10],
      [27, 3],
      [11, 13],
    ] as const)
      px(g, shade(p.road, 0.08), x, y, 1, 1);
    if (divider) {
      px(g, p.roadLine, 2, 0, 8, 1);
      px(g, p.roadLine, 18, 0, 8, 1);
    }
  };
}

function paintWater(p: Palette): Paint {
  return (g) => {
    px(g, p.water, 0, 0, 32, 16);
    px(g, p.waterHi, 3, 4, 5, 1);
    px(g, p.waterHi, 18, 9, 6, 1);
    px(g, p.waterHi, 10, 13, 4, 1);
    px(g, shade(p.water, -0.12), 25, 2, 4, 1);
    px(g, shade(p.water, -0.12), 6, 10, 3, 1);
  };
}

function paintRail(p: Palette): Paint {
  return (g) => {
    px(g, p.gravel, 0, 0, 32, 16);
    for (let x = 1; x < 32; x += 4) px(g, p.sleeper, x, 3, 2, 11);
    px(g, p.rail, 0, 5, 32, 1);
    px(g, p.rail, 0, 11, 32, 1);
    px(g, shade(p.rail, -0.3), 0, 6, 32, 1);
    px(g, shade(p.rail, -0.3), 0, 12, 32, 1);
    for (const [x, y] of [
      [3, 1],
      [14, 14],
      [23, 1],
    ] as const)
      px(g, shade(p.gravel, -0.15), x, y, 1, 1);
  };
}

const paintStart: Paint = (g) => {
  px(g, '#D9CDB4', 0, 0, 32, 16);
  for (let x = 0; x < 32; x += 8) px(g, '#C2B597', x, 0, 1, 16);
  px(g, '#C2B597', 0, 8, 32, 1);
};

const paintFinish: Paint = (g) => {
  for (let y = 0; y < 16; y += 4)
    for (let x = 0; x < 32; x += 4) px(g, (x + y) % 8 === 0 ? '#F7F2E8' : '#1A1816', x, y, 4, 4);
};

/** Front face of a raised lane, drawn over the top of the lane below it (32x5). */
function paintFace(p: Palette, kind: 'land' | 'road'): Paint {
  return (g) => {
    if (kind === 'land') {
      px(g, p.faceLip, 0, 0, 32, 1);
      px(g, p.face, 0, 1, 32, 3);
      for (let x = 2; x < 32; x += 6) px(g, shade(p.face, -0.2), x, 2, 2, 1);
      px(g, 'rgba(0,0,0,0.25)', 0, 4, 32, 1);
    } else {
      px(g, shade(p.road, 0.25), 0, 0, 32, 1);
      px(g, shade(p.road, -0.25), 0, 1, 32, 2);
      px(g, 'rgba(0,0,0,0.2)', 0, 3, 32, 1);
    }
  };
}

/* ------------------------------------------------------------------ vehicles and platforms */

/** A boxy 3/4 vehicle facing right: lit roof, coloured side with windows, wheels. */
function paintCar(len: number, h: number, body: string, kind: 'angkot' | 'bus' | 'truk'): Paint {
  const w = len * CELL;
  return (g) => {
    const roofH = Math.round(h * 0.35);
    const side = shade(body, -0.18);
    // Roof.
    px(g, shade(body, 0.25), 2, 0, w - 4, roofH);
    px(g, shade(body, 0.4), 3, 1, w - 6, 1);
    // Side.
    px(g, side, 0, roofH, w, h - roofH - 2);
    // Windows.
    const winY = roofH + 1;
    if (kind === 'truk') {
      px(g, '#9CC9E0', w - 10, winY, 7, 4);
      px(g, shade(body, -0.35), 1, winY, w - 14, h - roofH - 5);
      px(g, '#E7E2D6', 2, 1, w - 16, roofH - 1);
    } else {
      for (let x = 3; x < w - 8; x += 7) px(g, '#9CC9E0', x, winY, 5, 4);
      px(g, '#9CC9E0', w - 7, winY, 5, 4);
      if (kind === 'angkot') px(g, '#F7F2E8', 2, winY + 5, w - 4, 1);
      if (kind === 'bus') px(g, '#F7F2E8', 0, winY + 6, w, 1);
    }
    // Headlight and tail light.
    px(g, '#FFF2A8', w - 1, h - 5, 1, 2);
    px(g, '#E23B2E', 0, h - 5, 1, 2);
    // Wheels.
    for (const x of len === 1 ? [2, 10] : [3, w - 8]) {
      px(g, '#1A1816', x, h - 3, 5, 3);
      px(g, '#5B5E66', x + 2, h - 2, 1, 1);
    }
    if (len >= 3) {
      px(g, '#1A1816', Math.round(w / 2) - 2, h - 3, 5, 3);
    }
  };
}

const paintMotor =
  (tint: string): Paint =>
  (g) => {
    // Rider (helmet + body) on a small bike, facing right.
    px(g, '#1A1816', 1, 10, 4, 4);
    px(g, '#1A1816', 11, 10, 4, 4);
    px(g, '#5B5E66', 2, 11, 2, 2);
    px(g, '#5B5E66', 12, 11, 2, 2);
    px(g, shade(tint, -0.2), 3, 8, 10, 3);
    px(g, tint, 4, 7, 8, 1);
    px(g, '#3D4047', 6, 3, 4, 5);
    px(g, tint, 6, 0, 5, 4);
    px(g, '#9CC9E0', 10, 1, 1, 2);
    px(g, '#FFF2A8', 14, 8, 1, 1);
  };

const paintBajaj =
  (tint: string): Paint =>
  (g) => {
    px(g, shade(tint, 0.25), 2, 0, 11, 4);
    px(g, shade(tint, -0.15), 1, 4, 13, 8);
    px(g, '#9CC9E0', 9, 5, 4, 4);
    px(g, '#3D4047', 3, 5, 5, 5);
    px(g, '#1A1816', 1, 12, 4, 3);
    px(g, '#1A1816', 11, 12, 4, 3);
    px(g, '#FFF2A8', 14, 9, 1, 1);
  };

function paintLog(len: number): Paint {
  const w = len * CELL;
  return (g) => {
    px(g, '#A9774A', 1, 0, w - 2, 4);
    px(g, '#C98A4E', 2, 1, w - 4, 1);
    px(g, '#7C4A28', 0, 4, w, 6);
    for (let x = 6; x < w - 4; x += 9) px(g, '#5E3820', x, 6, 3, 1);
    // Cut rings at both ends.
    px(g, '#E8B985', w - 3, 3, 3, 6);
    px(g, '#A9774A', w - 2, 5, 1, 2);
    px(g, 'rgba(0,0,0,0.25)', 0, 10, w, 2);
  };
}

const paintPad =
  (flower: boolean): Paint =>
  (g) => {
    px(g, '#2E7A5A', 2, 2, 12, 7);
    px(g, '#3E9A6E', 1, 3, 14, 5);
    px(g, '#5BBE82', 3, 3, 9, 3);
    px(g, '#2E7A5A', 7, 2, 2, 3);
    px(g, 'rgba(0,0,0,0.2)', 2, 9, 12, 1);
    if (flower) {
      px(g, '#FF6FA8', 10, 1, 3, 3);
      px(g, '#FFD86B', 11, 2, 1, 1);
    }
  };

const paintLoco: Paint = (g) => {
  px(g, '#F7F2E8', 0, 0, 32, 7);
  px(g, '#E23B2E', 0, 7, 32, 9);
  px(g, '#9CC9E0', 22, 8, 7, 5);
  px(g, '#F7F2E8', 0, 13, 32, 2);
  px(g, '#FFF2A8', 31, 14, 1, 2);
  px(g, '#1A1816', 0, 18, 32, 4);
  for (const x of [3, 12, 20, 27]) px(g, '#5B5E66', x, 19, 2, 2);
  px(g, '#B8BAC8', 0, 16, 32, 2);
};

const paintCarriage: Paint = (g) => {
  px(g, '#E2DCD2', 0, 0, 32, 7);
  px(g, '#2F7DF6', 0, 7, 31, 9);
  for (let x = 3; x < 29; x += 7) px(g, '#9CC9E0', x, 8, 5, 4);
  px(g, '#FFC928', 0, 13, 31, 1);
  px(g, '#1A1816', 31, 4, 1, 14);
  px(g, '#1A1816', 0, 18, 32, 4);
  for (const x of [4, 24]) px(g, '#5B5E66', x, 19, 2, 2);
  px(g, '#B8BAC8', 0, 16, 32, 2);
};

/* ------------------------------------------------------------------ props */

const PROPS: Record<PropKind, { w: number; h: number; paint: (p: Palette) => Paint }> = {
  pohon: {
    w: 16,
    h: 26,
    paint: () => (g) => {
      px(g, '#6B4A2E', 6, 16, 4, 9);
      px(g, '#2E7A3A', 2, 4, 12, 12);
      px(g, '#2E7A3A', 4, 1, 8, 16);
      px(g, '#3FA04C', 4, 3, 7, 7);
      px(g, '#5BBE5E', 5, 4, 3, 2);
      px(g, '#235E2D', 3, 13, 10, 3);
    },
  },
  pot: {
    w: 12,
    h: 16,
    paint: () => (g) => {
      px(g, '#3FA04C', 2, 0, 8, 7);
      px(g, '#5BBE5E', 3, 1, 3, 2);
      px(g, '#C2602E', 1, 7, 10, 2);
      px(g, '#A9481E', 2, 9, 8, 7);
    },
  },
  batu: {
    w: 14,
    h: 10,
    paint: () => (g) => {
      px(g, '#9A9AA2', 1, 2, 12, 8);
      px(g, '#B8B8C0', 2, 1, 8, 4);
      px(g, '#6E6E78', 1, 8, 12, 2);
    },
  },
  semak: {
    w: 16,
    h: 12,
    paint: () => (g) => {
      px(g, '#2E7A3A', 1, 3, 14, 9);
      px(g, '#3FA04C', 2, 1, 12, 7);
      px(g, '#5BBE5E', 4, 2, 4, 2);
      px(g, '#FF6FA8', 10, 3, 2, 2);
    },
  },
  lampu: {
    w: 10,
    h: 30,
    paint: () => (g) => {
      px(g, '#3D4047', 4, 6, 2, 24);
      px(g, '#3D4047', 2, 28, 6, 2);
      px(g, '#5B5E66', 1, 2, 8, 4);
      px(g, '#FFF2A8', 2, 6, 6, 2);
    },
  },
  peti: {
    w: 14,
    h: 14,
    paint: () => (g) => {
      px(g, '#C98A4E', 1, 0, 12, 4);
      px(g, '#A9774A', 1, 4, 12, 10);
      px(g, '#7C4A28', 1, 8, 12, 1);
      px(g, '#7C4A28', 6, 4, 1, 10);
    },
  },
  tiang: {
    w: 8,
    h: 24,
    paint: () => (g) => {
      px(g, '#F7F2E8', 3, 4, 2, 20);
      px(g, '#E23B2E', 3, 8, 2, 3);
      px(g, '#E23B2E', 3, 15, 2, 3);
      px(g, '#1A1816', 1, 0, 6, 4);
    },
  },
};

function paintSignal(on: 0 | 1 | 2): Paint {
  return (g) => {
    px(g, '#3D4047', 3, 6, 2, 12);
    px(g, '#1A1816', 0, 0, 8, 6);
    px(g, on === 1 ? '#FF3B2E' : '#5B2420', 1, 1, 3, 3);
    px(g, on === 2 ? '#FF3B2E' : '#5B2420', 4, 1, 3, 3);
  };
}

const paintShadow: Paint = (g) => {
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(8, 3, 7, 2.5, 0, 0, Math.PI * 2);
  g.fill();
};

const paintRing: Paint = (g) => {
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.ellipse(9, 4, 8, 3.5, 0, 0, Math.PI * 2);
  g.fill();
};

const paintDot: Paint = (g) => px(g, '#FFFFFF', 0, 0, 2, 2);

function paintLight(size: number, soft: boolean): Paint {
  return (g) => {
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(soft ? 0.35 : 0.6, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  };
}

/* ------------------------------------------------------------------ keys + loading */

export const laneKey = (map: MapId, name: string) => `ny-${map}-${name}`;
export const itemKey = (kind: ItemKind, tint: number, len: number) => `ny-${kind}-${tint}-${len}`;
export const propKey = (kind: PropKind) => `ny-prop-${kind}`;
/** Stable text id of a look, for texture keys. */
const lookId = (look: Look): string => [look.c, look.s, look.h, look.hc, look.oc].join('.');
export const avatarKey = (look: Look, face: Face) => `ny-avatar-${lookId(look)}-${face}`;
/** Transparent built-in texture shown until an avatar has been rasterized. */
export const BLANK_KEY = '__DEFAULT';

/** Shrinks a rasterized avatar to a tiny bitmap with hard alpha edges (a pixel person). */
const pixelAvatar =
  (img: HTMLImageElement): Paint =>
  (g) => {
    g.imageSmoothingEnabled = true;
    g.drawImage(img, 0, 0, FRUIT_PX, FRUIT_PX);
    // Snap alpha so edges stay crisp pixels instead of a soft halo.
    const data = g.getImageData(0, 0, FRUIT_PX, FRUIT_PX);
    for (let i = 3; i < data.data.length; i += 4) data.data[i] = data.data[i]! > 110 ? 255 : 0;
    g.putImageData(data, 0, 0);
  };

/** Pixel avatars as Phaser textures, rasterized the first time a look shows up. */
export class AvatarBank {
  private readonly textures: Phaser.Textures.TextureManager;
  private readonly onReady: (look: Look) => void;
  private readonly pending = new Set<string>();

  constructor(textures: Phaser.Textures.TextureManager, onReady: (look: Look) => void) {
    this.textures = textures;
    this.onReady = onReady;
  }

  /** Texture key of an avatar face, or BLANK_KEY while it is still rasterizing (onReady follows). */
  key(look: Look, face: Face): string {
    const key = avatarKey(look, face);
    if (this.textures.exists(key)) return key;
    this.request(look);
    return BLANK_KEY;
  }

  private request(look: Look): void {
    const id = lookId(look);
    if (this.pending.has(id)) return;
    this.pending.add(id);
    const jobs = FACES.map((face) =>
      loadImage(
        svgUrl(`ny-avatar-${id}-${face}`, () => svgDoc(64, 64, avatarMarkup(look, face), '0 0 64 64')),
        64,
        64,
      ),
    );
    Promise.all(jobs).then(
      (images) => {
        FACES.forEach((face, i) => {
          const key = avatarKey(look, face);
          if (!this.textures.exists(key)) {
            this.textures.addCanvas(key, canvas(FRUIT_PX, FRUIT_PX, pixelAvatar(images[i]!)));
          }
        });
        this.pending.delete(id);
        this.onReady(look);
      },
      // A failed avatar stays pending so it is not retried every frame; the blank stand-in remains.
      () => undefined,
    );
  }
}

/** Register every texture with Phaser. Called once from the scene's create(). */
export function buildTextures(textures: Phaser.Textures.TextureManager): void {
  const add = (key: string, w: number, h: number, paint: Paint) => {
    if (!textures.exists(key)) textures.addCanvas(key, canvas(w, h, paint));
  };
  for (const map of ['kota', 'sungai', 'rel', 'malam'] as const) {
    const p = PALETTES[map];
    add(laneKey(map, 'grassA'), 32, 16, paintGrass(p, false));
    add(laneKey(map, 'grassB'), 32, 16, paintGrass(p, true));
    add(laneKey(map, 'side'), 32, 16, paintSide(p));
    add(laneKey(map, 'road'), 32, 16, paintRoad(p, false));
    add(laneKey(map, 'roadLine'), 32, 16, paintRoad(p, true));
    add(laneKey(map, 'water'), 32, 16, paintWater(p));
    add(laneKey(map, 'rail'), 32, 16, paintRail(p));
    add(laneKey(map, 'faceLand'), 32, 5, paintFace(p, 'land'));
    add(laneKey(map, 'faceRoad'), 32, 4, paintFace(p, 'road'));
  }
  add('ny-start', 32, 16, paintStart);
  add('ny-finish', 32, 16, paintFinish);
  VEHICLE_TINTS.forEach((tint, i) => {
    add(itemKey('angkot', i, 2), 32, 18, paintCar(2, 18, tint, 'angkot'));
    add(
      itemKey('bus', i, 3),
      48,
      22,
      paintCar(3, 22, ['#FF5A1F', '#2F7DF6', '#22B35E', '#FFC928'][i]!, 'bus'),
    );
    add(
      itemKey('truk', i, 3),
      48,
      22,
      paintCar(3, 22, ['#C98A4E', '#5B5E66', '#2E7A5A', '#A9481E'][i]!, 'truk'),
    );
    add(itemKey('motor', i, 1), 16, 14, paintMotor(tint));
    add(itemKey('bajaj', i, 1), 16, 15, paintBajaj(i % 2 ? '#2F7DF6' : '#FF5A1F'));
  });
  for (const len of [2, 3, 4]) add(itemKey('log', 0, len), len * CELL, 12, paintLog(len));
  add(itemKey('pad', 0, 1), 16, 10, paintPad(false));
  add(itemKey('pad', 1, 1), 16, 10, paintPad(true));
  add(itemKey('pad', 2, 1), 16, 10, paintPad(false));
  add('ny-loco', 32, 22, paintLoco);
  add('ny-carriage', 32, 22, paintCarriage);
  for (const [k, def] of Object.entries(PROPS) as [PropKind, (typeof PROPS)[PropKind]][]) {
    add(propKey(k), def.w, def.h, def.paint(PALETTES.kota));
  }
  add('ny-signal-0', 8, 18, paintSignal(0));
  add('ny-signal-1', 8, 18, paintSignal(1));
  add('ny-signal-2', 8, 18, paintSignal(2));
  add('ny-shadow', 16, 6, paintShadow);
  add('ny-ring', 18, 8, paintRing);
  add('ny-dot', 2, 2, paintDot);
  add('ny-light', 96, 96, paintLight(96, true));
  add('ny-beam', 64, 64, paintLight(64, false));
}

/** Texture of an item at its length (logs come in 2–4). */
export function textureFor(kind: ItemKind, tint: number, len: number): string {
  if (kind === 'log') return itemKey('log', 0, Math.max(2, Math.min(4, len)));
  if (kind === 'pad') return itemKey('pad', Math.abs(tint) % 3, 1);
  const t = Math.abs(tint) % 4;
  return itemKey(kind, t, kind === 'angkot' ? 2 : kind === 'bus' || kind === 'truk' ? 3 : 1);
}

export const PROP_SIZE: Record<PropKind, { w: number; h: number }> = Object.fromEntries(
  Object.entries(PROPS).map(([k, v]) => [k, { w: v.w, h: v.h }]),
) as Record<PropKind, { w: number; h: number }>;
