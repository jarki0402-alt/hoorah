/**
 * The kampung behind the main screen, in a flat woodcut look: layered hills, stilt houses with
 * carved gable ends, banana trees and a bamboo fence. Night is deep blue under a big moon with
 * lamp-lit windows; day is warm gold under a low sun. Drawn once per mode on a 1600x960 canvas
 * (anchored to the bottom, so 16:9 to 4:3 stages all show the houses).
 */
import { f1, seeded, svgDoc } from '../../shared/art/svg';

export type Mode = 'night' | 'day';

export const KAMPUNG_W = 1600;
export const KAMPUNG_H = 960;

interface Palette {
  sky: [string, string, string];
  orb: string;
  orbGlow: string;
  far: string;
  mid: string;
  house: string;
  window: string;
  ground: string;
  trim: string;
}

const PALETTES: Record<Mode, Palette> = {
  night: {
    sky: ['#0B1530', '#0F1C3B', '#142547'],
    orb: '#FFE7A3',
    orbGlow: '#FFE7A3',
    far: '#0F1E3A',
    mid: '#0A1630',
    house: '#050C1C',
    window: '#FF8A1F',
    ground: '#040912',
    trim: '#16264A',
  },
  day: {
    sky: ['#FFC774', '#FFB45E', '#FF9F4F'],
    orb: '#FFF3D1',
    orbGlow: '#FFE2A6',
    far: '#E58A45',
    mid: '#C86A31',
    house: '#5A2E17',
    window: '#FFD27A',
    ground: '#3F1F0F',
    trim: '#7A4122',
  },
};

/** A stilt house (rumah panggung) with a carved gable, at ground level `gy`. */
function house(x: number, gy: number, s: number, p: Palette, lit: boolean[]): string {
  const w = 150 * s;
  const body = 74 * s;
  const stilt = 30 * s;
  const roof = 58 * s;
  const top = gy - stilt - body;
  const gable = `M${f1(x - 14 * s)} ${f1(top)}L${f1(x + w / 2)} ${f1(top - roof)}L${f1(x + w + 14 * s)} ${f1(top)}Z`;
  const horns = `M${f1(x + w / 2 - 22 * s)} ${f1(top - roof + 8 * s)}l${f1(-14 * s)} ${f1(-20 * s)}l${f1(20 * s)} ${f1(14 * s)}ZM${f1(x + w / 2 + 22 * s)} ${f1(top - roof + 8 * s)}l${f1(14 * s)} ${f1(-20 * s)}l${f1(-20 * s)} ${f1(14 * s)}Z`;
  const stilts = [0.08, 0.36, 0.64, 0.9]
    .map((t) => `M${f1(x + w * t)} ${f1(gy - stilt)}h${f1(7 * s)}V${f1(gy)}h${f1(-7 * s)}Z`)
    .join('');
  const wins = lit
    .map((on, i) => {
      const wx = x + 22 * s + i * 42 * s;
      return `<rect x="${f1(wx)}" y="${f1(top + 18 * s)}" width="${f1(24 * s)}" height="${f1(26 * s)}" fill="${on ? p.window : p.trim}"/>`;
    })
    .join('');
  // Carved diamond in the gable (the "ukiran").
  const cx = x + w / 2;
  const cy = top - roof * 0.42;
  const carve = `<path d="M${f1(cx)} ${f1(cy - 12 * s)}l${f1(12 * s)} ${f1(12 * s)}l${f1(-12 * s)} ${f1(12 * s)}l${f1(-12 * s)} ${f1(-12 * s)}Z" fill="${p.trim}"/>`;
  const ladder = `<path d="M${f1(x + w * 0.46)} ${f1(gy - stilt)}l${f1(-18 * s)} ${f1(stilt)}h${f1(5 * s)}l${f1(18 * s)} ${f1(-stilt)}Z" fill="${p.house}"/>`;
  return (
    `<path d="${gable}${horns}" fill="${p.house}"/>` +
    carve +
    `<rect x="${f1(x)}" y="${f1(top)}" width="${f1(w)}" height="${f1(body)}" fill="${p.house}"/>` +
    `<path d="${stilts}" fill="${p.house}"/>` +
    ladder +
    wins
  );
}

/** A banana tree: a trunk and drooping leaves. */
function banana(x: number, gy: number, s: number, fill: string): string {
  const top = gy - 150 * s;
  const leaves = [-1, 1, -0.6, 0.6]
    .map((d, i) => {
      const lx = x + d * 70 * s;
      const ly = top + (i < 2 ? 10 : -14) * s;
      return `<path d="M${f1(x)} ${f1(top)}Q${f1((x + lx) / 2)} ${f1(ly - 40 * s)} ${f1(lx)} ${f1(ly + 30 * s)}Q${f1((x + lx) / 2)} ${f1(ly - 10 * s)} ${f1(x)} ${f1(top + 8 * s)}Z" fill="${fill}"/>`;
    })
    .join('');
  return `<path d="M${f1(x - 6 * s)} ${f1(gy)}L${f1(x - 3 * s)} ${f1(top)}h${f1(6 * s)}L${f1(x + 6 * s)} ${f1(gy)}Z" fill="${fill}"/>${leaves}`;
}

function fence(gy: number, p: Palette): string {
  let posts = '';
  for (let x = 0; x < KAMPUNG_W; x += 26) posts += `M${x} ${gy - 34}h8v34h-8Z`;
  return `<path d="${posts}M0 ${gy - 26}h${KAMPUNG_W}v5H0ZM0 ${gy - 12}h${KAMPUNG_W}v5H0Z" fill="${p.house}"/>`;
}

export function kampungSvg(mode: Mode): string {
  const p = PALETTES[mode];
  const W = KAMPUNG_W;
  const H = KAMPUNG_H;
  const gy = H - 70;
  const rnd = seeded(mode === 'night' ? 29 : 31);

  let stars = '';
  if (mode === 'night') {
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W;
      const y = rnd() * (H * 0.5);
      const r = 0.8 + rnd() * 1.8;
      stars += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#FFF6DA" opacity="${f1(0.35 + rnd() * 0.5)}"/>`;
    }
  }
  const orbX = mode === 'night' ? W * 0.74 : W * 0.24;
  const orbY = mode === 'night' ? H * 0.22 : H * 0.42;
  const orbR = mode === 'night' ? 92 : 110;
  const orb =
    `<circle cx="${f1(orbX)}" cy="${f1(orbY)}" r="${orbR * 1.9}" fill="${p.orbGlow}" opacity="0.08"/>` +
    `<circle cx="${f1(orbX)}" cy="${f1(orbY)}" r="${orbR * 1.4}" fill="${p.orbGlow}" opacity="0.1"/>` +
    `<circle cx="${f1(orbX)}" cy="${f1(orbY)}" r="${orbR}" fill="${p.orb}"/>` +
    (mode === 'night'
      ? `<circle cx="${f1(orbX - 28)}" cy="${f1(orbY - 18)}" r="16" fill="#E9CF86" opacity="0.6"/><circle cx="${f1(orbX + 30)}" cy="${f1(orbY + 24)}" r="11" fill="#E9CF86" opacity="0.5"/>`
      : '');

  const far = `<path d="M0 ${gy - 260}Q220 ${gy - 360} 460 ${gy - 280}T940 ${gy - 300}T1600 ${gy - 250}V${H}H0Z" fill="${p.far}"/>`;
  const mid = `<path d="M0 ${gy - 150}Q300 ${gy - 230} 620 ${gy - 160}T1240 ${gy - 170}T1600 ${gy - 140}V${H}H0Z" fill="${p.mid}"/>`;

  const lit = (n: number, seed: number) =>
    Array.from({ length: n }, (_, i) => mode === 'day' || (seed + i) % 3 !== 1);
  const houses =
    house(90, gy, 1.05, p, lit(3, 0)) +
    house(420, gy, 0.86, p, lit(3, 1)) +
    house(980, gy, 0.92, p, lit(3, 2)) +
    house(1300, gy, 1.12, p, lit(3, 0));
  const trees =
    banana(330, gy, 1.1, p.house) +
    banana(760, gy, 1.25, p.house) +
    banana(870, gy, 0.9, p.house) +
    banana(1560, gy, 1.05, p.house);

  const body = [
    `<rect width="${W}" height="${H}" fill="${p.sky[0]}"/>`,
    `<rect y="${f1(H * 0.34)}" width="${W}" height="${f1(H * 0.33)}" fill="${p.sky[1]}"/>`,
    `<rect y="${f1(H * 0.62)}" width="${W}" height="${f1(H * 0.38)}" fill="${p.sky[2]}"/>`,
    stars,
    orb,
    far,
    mid,
    fence(gy + 6, p),
    trees,
    houses,
    `<rect y="${gy}" width="${W}" height="${H - gy}" fill="${p.ground}"/>`,
  ].join('');
  return svgDoc(W, H, body);
}

/** Weker (alarm clock) for the sound introduction, on a 160x120 canvas like the role pictures. */
export function wekerSvg(): string {
  return svgDoc(
    160,
    120,
    '<rect width="160" height="120" fill="#13203A"/>' +
      '<circle cx="54" cy="26" r="13" fill="#FF8A1F"/><circle cx="106" cy="26" r="13" fill="#FF8A1F"/>' +
      '<circle cx="80" cy="64" r="40" fill="#FBF1DC"/><circle cx="80" cy="64" r="33" fill="#13203A"/>' +
      '<path d="M80 64V40M80 64l16 10" stroke="#FFE7A3" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M54 102l-8 12M106 102l8 12" stroke="#FBF1DC" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M22 50q-8 14 0 28M138 50q8 14 0 28" fill="none" stroke="#FFE7A3" stroke-width="4" stroke-linecap="round"/>',
  );
}

/** Rooster at sunrise for the sound introduction. */
export function roosterSvg(): string {
  return svgDoc(
    160,
    120,
    '<rect width="160" height="120" fill="#FFB45E"/><circle cx="118" cy="92" r="34" fill="#FFF3D1"/>' +
      '<path d="M0 100h160v20H0Z" fill="#5A2E17"/>' +
      '<path d="M50 96q-14-30 8-50q6-18 22-16q10 2 8 14l14 6l-14 4q8 22-6 36Z" fill="#5A2E17"/>' +
      '<path d="M74 26q2-12 10-10q-2 6 4 6q-2 8-8 8Z" fill="#E8483A"/><path d="M96 40l12 4l-12 4Z" fill="#FFC928"/>' +
      '<path d="M50 70q-26-16-32 6q14-6 32 4Z" fill="#7A4122"/><path d="M60 96v8M72 96v8" stroke="#5A2E17" stroke-width="4"/>' +
      '<circle cx="86" cy="36" r="3" fill="#FFF3D1"/>',
  );
}
