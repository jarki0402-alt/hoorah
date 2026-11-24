/**
 * Phone theme for Rebut Wilayah: the same dark tegel courtyard as the main screen, with smooth
 * painted territories creeping in from the edges and one dashed trail curving out of a land, its
 * runner still out on the floor. The middle of the phone stays calm so the joystick and the
 * numbers read.
 */
import type { ControllerTheme } from '../../controller/themes';
import { castHead } from '../../shared/art/people';
import { f1 } from '../../shared/art/svg';

const FLOOR = '#1A1B1F';
const TILE_A = '#1F2025';
const TILE_B = '#1C1D21';
const GROUT = '#151619';

type Pt = readonly [number, number];

interface Paint {
  face: string;
  lip: string;
  light: string;
}

const ORANGE: Paint = { face: '#FF8A3D', lip: '#9A4A1C', light: '#FFC59C' };
const TEAL: Paint = { face: '#14B8A6', lip: '#0B6A60', light: '#8CE3D9' };

/** A smooth curve through `pts` (Catmull-Rom as cubic Beziers), closed or open. */
function curve(pts: readonly Pt[], closed: boolean): string {
  const n = pts.length;
  const at = (i: number): Pt => (closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  let d = `M${f1(pts[0]![0])} ${f1(pts[0]![1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f1(c1x)} ${f1(c1y)} ${f1(c2x)} ${f1(c2y)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** One painted territory as a raised slab: lip below, a light rim peeking above, the face, brush strokes. */
function land(pts: readonly Pt[], paint: Paint, t: number): string {
  const d = curve(pts, true);
  const lip = Math.max(4, t * 0.14);
  return [
    `<path d="${d}" transform="translate(0 ${f1(lip)})" fill="${paint.lip}"/>`,
    `<path d="${d}" transform="translate(-1.5 -2.5)" fill="${paint.light}"/>`,
    `<path d="${d}" fill="${paint.face}"/>`,
    `<path d="${d}" fill="url(#wl-brush)"/>`,
  ].join('');
}

/** A trail ribbon along a smooth curve: dark outline, colour, dashed light centre. */
function trail(pts: readonly Pt[], color: string): string {
  const d = curve(pts, false);
  return [
    `<path d="${d}" fill="none" stroke="#0B0C0E" stroke-opacity="0.6" stroke-width="15" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<path d="${d}" fill="none" stroke="#FFF4EA" stroke-opacity="0.95" stroke-width="3.6" stroke-dasharray="9 9"/>`,
  ].join('');
}

/** A player marker with its heading pointer at `angle` (radians, 0 = right). */
function marker(x: number, y: number, ring: string, angle: number): string {
  const r = 17;
  const deg = f1((angle * 180) / Math.PI);
  return [
    `<ellipse cx="${f1(x)}" cy="${f1(y + r * 0.75)}" rx="${r}" ry="${f1(r * 0.4)}" fill="#000" opacity="0.35"/>`,
    `<path transform="translate(${f1(x)} ${f1(y)}) rotate(${deg})" d="M${r + 2} -7 L${r + 12} 0 L${r + 2} 7Z" fill="${ring}" stroke="#111214" stroke-width="1.5"/>`,
    `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r + 1.5}" fill="#111214"/>`,
    `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${ring}"/>`,
    `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r - 3.2}" fill="#FFFAF0"/>`,
    `<g transform="translate(${f1(x - r + 3)} ${f1(y - r + 3)}) scale(${f1(((r - 3) * 2) / 64)})">${castHead('jeruk', 'effort')}</g>`,
  ].join('');
}

/** Heading of the last stretch of a path. */
function heading(pts: readonly Pt[]): number {
  const a = pts[pts.length - 2]!;
  const b = pts[pts.length - 1]!;
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function wilayahScene(w: number, h: number): string {
  const wide = w > h;
  const t = Math.round(Math.min(52, Math.max(36, (wide ? h : w) / 9)));
  const out: string[] = [];
  out.push(
    `<defs><pattern id="wl-tegel" width="${t * 2}" height="${t * 2}" patternUnits="userSpaceOnUse">`,
    `<rect width="${t * 2}" height="${t * 2}" fill="${TILE_A}"/>`,
    `<rect x="${t}" width="${t}" height="${t}" fill="${TILE_B}"/><rect y="${t}" width="${t}" height="${t}" fill="${TILE_B}"/>`,
    `<path d="M0 ${t - 1}h${t * 2}v2H0Z M0 ${t * 2 - 1}h${t * 2}v1H0Z M${t - 1} 0v${t * 2}h2V0Z M${t * 2 - 1} 0v${t * 2}h1V0Z" fill="${GROUT}"/>`,
    `<rect x="${f1(t / 2 - 2)}" y="${f1(t / 2 - 2)}" width="4" height="4" fill="#24252A"/>`,
    `<rect x="${f1(t * 1.5 - 2)}" y="${f1(t * 1.5 - 2)}" width="4" height="4" fill="#24252A"/>`,
    `</pattern>`,
    `<pattern id="wl-brush" width="${t / 2}" height="${t / 2}" patternUnits="userSpaceOnUse">`,
    `<path d="M${t / 2} 0 L0 ${t / 2}" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="${f1(t * 0.08)}"/>`,
    `</pattern></defs>`,
  );
  out.push(`<rect width="${w}" height="${h}" fill="${FLOOR}"/>`);
  out.push(`<rect width="${w}" height="${h}" fill="url(#wl-tegel)"/>`);

  if (wide) {
    // Sideways: territories along the bottom, the trail curving out under the status line.
    const by = h - t * 2.2;
    out.push(
      land(
        [
          [-t, by - t * 0.4],
          [t * 1.3, by - t * 0.6],
          [t * 2.5, by + t * 0.3],
          [t * 3.7, by + t * 1.1],
          [t * 3.4, h + t],
          [-t, h + t],
        ],
        ORANGE,
        t,
      ),
    );
    const tx = w * 0.36;
    out.push(
      land(
        [
          [tx - t * 1.4, h + t],
          [tx - t * 1.1, h - t * 0.9],
          [tx + t * 0.2, h - t * 1.5],
          [tx + t * 1.4, h - t * 0.8],
          [tx + t * 1.6, h + t],
        ],
        TEAL,
        t,
      ),
    );
    const path: Pt[] = [
      [t * 2.3, by + t * 0.1],
      [w * 0.15, by - t * 0.1],
      [w * 0.21, h - t * 1.2],
      [w * 0.29, h - t * 0.75],
    ];
    out.push(trail(path, ORANGE.face));
    const end = path[path.length - 1]!;
    out.push(marker(end[0] + 4, end[1], ORANGE.face, heading(path)));
    return out.join('');
  }

  // Upright: painted land creeping in from both sides of the empty middle band, joined by a
  // trail that is about to close a loop.
  const top = h * 0.27;
  out.push(
    land(
      [
        [-t, top - t * 0.2],
        [t * 0.8, top],
        [t * 1.5, top + t * 0.9],
        [t * 1.3, top + t * 2.1],
        [t * 1.9, top + t * 3.0],
        [t * 1.1, top + t * 3.9],
        [-t, top + t * 4.1],
      ],
      ORANGE,
      t,
    ),
  );
  out.push(
    land(
      [
        [w + t, top + t * 0.4],
        [w - t * 0.9, top + t * 0.6],
        [w - t * 1.6, top + t * 1.5],
        [w - t * 1.0, top + t * 2.5],
        [w + t, top + t * 3.3],
      ],
      TEAL,
      t,
    ),
  );
  const path: Pt[] = [
    [t * 1.35, top + t * 1.5],
    [w * 0.4, top + t * 1.75],
    [w * 0.62, top + t * 0.9],
    [w * 0.56, top - t * 0.1],
    [w * 0.42, top - t * 0.3],
  ];
  out.push(trail(path, ORANGE.face));
  const end = path[path.length - 1]!;
  out.push(marker(end[0] - 4, end[1], ORANGE.face, heading(path)));
  return out.join('');
}

export const wilayahTheme: ControllerTheme = {
  chrome: '#1A1B1F',
  scene: wilayahScene,
  stripEdge: {
    w: 24,
    h: 8,
    body: `<rect width="24" height="8" fill="#1A1B1F"/><rect width="12" height="6" fill="#FF8A3D"/><rect x="12" width="12" height="6" fill="#14B8A6"/><rect y="6" width="24" height="2" fill="#0B0C0E" opacity="0.6"/>`,
  },
};
