/**
 * Phone theme for Lari Terus: the rooftops at golden hour. A warm sky with the low sun sits behind
 * the Host strip and the header, festoon lights hang under the strip, and the city skyline with a
 * water tank and an antenna lines the bottom edge, so the swipe pad sits on calm sky.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1, seeded } from '../../shared/art/svg';

const r = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"/>`;

/** A row of flat-topped blocks with a few spires, filling from `base` up to about `tall`. */
function skyline(
  w: number,
  base: number,
  tall: number,
  fill: string,
  seed: number,
  windows?: string,
): string {
  const rnd = seeded(seed);
  let d = '';
  let win = '';
  let x = -6;
  while (x < w + 6) {
    const bw = 16 + rnd() * 34;
    const bh = tall * (0.45 + rnd() * 0.55);
    d += `M${f1(x)} ${f1(base)}V${f1(base - bh)}H${f1(x + bw)}V${f1(base)}Z`;
    const top = rnd();
    if (top > 0.82) d += `M${f1(x + bw / 2 - 1.5)} ${f1(base - bh)}v-14h3v14Z`;
    else if (top > 0.64) d += `M${f1(x + bw * 0.25)} ${f1(base - bh)}v-5h${f1(bw * 0.3)}v5Z`;
    if (windows) {
      for (let yy = base - bh + 6; yy < base - 6; yy += 9)
        for (let xx = x + 4; xx < x + bw - 6; xx += 8)
          if (rnd() > 0.55) win += `M${f1(xx)} ${f1(yy)}h3v4h-3Z`;
    }
    x += bw + rnd() * 6;
  }
  return `<path d="${d}" fill="${fill}"/>${windows && win ? `<path d="${win}" fill="${windows}"/>` : ''}`;
}

/** Orange plastic water tank on a stand, feet at (x, y). */
function toren(x: number, y: number, s: number): string {
  const legs = `M${f1(x - 11 * s)} ${f1(y)}l${f1(2 * s)} ${f1(-18 * s)}h${f1(2.5 * s)}l${f1(-2 * s)} ${f1(18 * s)}Z M${f1(x + 11 * s)} ${f1(y)}l${f1(-2 * s)} ${f1(-18 * s)}h${f1(-2.5 * s)}l${f1(2 * s)} ${f1(18 * s)}Z`;
  const body = `<rect x="${f1(x - 13 * s)}" y="${f1(y - 46 * s)}" width="${f1(26 * s)}" height="${f1(28 * s)}" rx="${f1(4 * s)}" fill="#FF8A2E"/>`;
  let rings = '';
  for (let i = 1; i < 4; i++) rings += `M${f1(x - 13 * s)} ${f1(y - 46 * s + i * 7 * s)}h${f1(26 * s)}`;
  return [
    `<path d="${legs}" fill="#5A3A28"/>`,
    r(x - 14 * s, y - 19 * s, 28 * s, 3 * s, '#5A3A28'),
    body,
    `<path d="${rings}" stroke="#D86A1A" stroke-width="${f1(1.6 * s)}"/>`,
    `<ellipse cx="${f1(x)}" cy="${f1(y - 46 * s)}" rx="${f1(11 * s)}" ry="${f1(4 * s)}" fill="#FFA65C"/>`,
  ].join('');
}

function antenna(x: number, y: number, s: number): string {
  let d = `M${f1(x - 1)} ${f1(y)}V${f1(y - 64 * s)}h2V${f1(y)}Z`;
  for (let i = 0; i < 4; i++) {
    const yy = y - 64 * s + i * 7 * s;
    const hw = (16 - i * 3) * s;
    d += `M${f1(x - hw)} ${f1(yy)}h${f1(hw * 2)}v1.6h${f1(-hw * 2)}Z`;
  }
  return `<path d="${d}" fill="#5A3A28"/>`;
}

function lariScene(w: number, h: number): string {
  const land = w > h;
  const out: string[] = [];
  out.push(r(0, 0, w, h, '#FFE2B8'));
  // Sky bands, warmer towards the horizon.
  out.push(r(0, h * 0.55, w, h * 0.45, '#FFD9A8'));
  out.push(r(0, h * 0.75, w, h * 0.25, '#FFCF98'));
  // Low sun at the top right, partly behind the header.
  const sr = Math.min(52, w * 0.13);
  out.push(`<circle cx="${f1(w * 0.84)}" cy="${f1(h * (land ? 0.2 : 0.12))}" r="${f1(sr)}" fill="#FFC56E"/>`);
  out.push(
    `<circle cx="${f1(w * 0.84)}" cy="${f1(h * (land ? 0.2 : 0.12))}" r="${f1(sr * 0.74)}" fill="#FFD98F"/>`,
  );
  // A few flat clouds.
  const cloud = (cx: number, cy: number, s: number) =>
    `<path d="M${f1(cx - 30 * s)} ${f1(cy)}h${f1(60 * s)}a${f1(10 * s)} ${f1(10 * s)} 0 0 0 -12 -10a${f1(14 * s)} ${f1(14 * s)} 0 0 0 -24 -4a${f1(10 * s)} ${f1(10 * s)} 0 0 0 -24 14Z" fill="#FFF3DD"/>`;
  out.push(cloud(w * 0.2, h * (land ? 0.3 : 0.2), 1.1), cloud(w * 0.62, h * (land ? 0.42 : 0.33), 0.8));
  // City along the bottom edge: far blocks, near blocks with lit windows, then our roof.
  const roof = h - Math.max(10, h * 0.025);
  out.push(skyline(w, roof - h * 0.03, h * (land ? 0.2 : 0.11), '#F0B07E', 7));
  out.push(skyline(w, roof, h * (land ? 0.13 : 0.07), '#C97F55', 13, '#FFE2A8'));
  out.push(r(0, roof, w, h - roof, '#8A5236'));
  out.push(r(0, roof, w, 3, '#A86A48'));
  out.push(toren(Math.max(26, w * 0.08), roof, land ? 0.9 : 1));
  out.push(antenna(w - Math.max(24, w * 0.07), roof, land ? 0.8 : 1));
  return out.join('');
}

export const lariTheme: ControllerTheme = {
  chrome: '#8A5236',
  scene: lariScene,
  // Festoon lights hanging under the Host strip.
  stripEdge: {
    w: 48,
    h: 12,
    body:
      '<path d="M0 1 Q24 9 48 1" fill="none" stroke="#3A2418" stroke-width="1.4"/>' +
      '<circle cx="12" cy="6.2" r="3" fill="#FFD27A"/><circle cx="36" cy="6.2" r="3" fill="#FFD27A"/>' +
      '<circle cx="12" cy="6.2" r="1.4" fill="#FFF3D0"/><circle cx="36" cy="6.2" r="1.4" fill="#FFF3D0"/>',
  },
};
