import { chefMarkup, iconMarkup, stationDrawing } from '../../games/dapur/art';
import { svgDoc } from './svg';

/**
 * Key art of Dapur Heboh (640x360): a split kitchen in 3/4 view. On the warm Persiapan side a
 * semangka chef flings a tomato over the hazard-striped divider; on the Masak side an alpukat
 * chef waits inside a dashed catch ring, stoves glowing behind. The top left stays plain wall
 * for the logo.
 */

const NO_LABELS = { basket: {}, trash: '', soda: '', cups: '', pass: '', passSlot: '' };

function station(
  kind: Parameters<typeof stationDrawing>[0],
  source: string | null,
  x: number,
  y: number,
  s: number,
): string {
  const d = stationDrawing(kind, source, NO_LABELS);
  return `<g transform="translate(${x} ${y - 44 * s}) scale(${s})">${d.svg}</g>`;
}

function floor(x: number, w: number, a: string, b: string): string {
  const out = [`<rect x="${x}" y="96" width="${w}" height="264" fill="${a}"/>`];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < Math.ceil(w / 48); c++)
      if ((r + c) % 2)
        out.push(`<rect x="${x + c * 48}" y="${96 + r * 46}" width="48" height="46" fill="${b}"/>`);
  return out.join('');
}

export function dapurSvg(): string {
  const parts: string[] = [];
  // Wall with tiles.
  parts.push('<rect width="640" height="110" fill="#EFE8DC"/>');
  for (let y = 22; y < 110; y += 24) parts.push(`<rect y="${y}" width="640" height="2" fill="#DCD3C3"/>`);
  for (let x = 0; x < 640; x += 48) parts.push(`<rect x="${x}" width="2" height="110" fill="#DCD3C3"/>`);
  // Floors: warm prep side, cooler cook side.
  parts.push(floor(0, 320, '#F3E3C7', '#EAD5B0'), floor(320, 320, '#ECE6DA', '#DDD5C6'));
  // Hood over the cook side.
  parts.push(
    '<path d="M392 0 H604 L630 46 H366 Z" fill="#4A4E57"/><rect x="366" y="40" width="264" height="7" rx="3" fill="#3A3D45"/>',
  );
  // Back counters: prep baskets and board on the left, stoves on the right.
  parts.push(
    station('basket', 'tomat', 150, 92, 0.85),
    station('basket', 'selada', 218, 92, 0.85),
    station('board', null, 82, 92, 0.85),
    station('stove', null, 378, 92, 0.85),
    station('wok', null, 446, 92, 0.85),
    station('soda', null, 514, 92, 0.85),
    station('counter', null, 582, 92, 0.85),
  );
  // Flames under the pans, food cooking, a puff of steam.
  parts.push(
    '<circle cx="426" cy="116" r="19" fill="none" stroke="#FF7A3D" stroke-width="5"/>',
    '<circle cx="478" cy="116" r="23" fill="none" stroke="#FF7A3D" stroke-width="5"/>',
    `<g transform="translate(413 103) scale(0.65)">${iconMarkup('dagingMatang')}</g>`,
    `<g transform="translate(462 100) scale(0.8)">${iconMarkup('nasiGoreng')}</g>`,
    '<circle cx="470" cy="74" r="9" fill="#FFFFFF" opacity="0.6"/><circle cx="482" cy="60" r="7" fill="#FFFFFF" opacity="0.45"/>',
    `<g transform="translate(108 100) scale(0.75)">${iconMarkup('tomatPotong')}</g>`,
  );
  // The divider with hazard stripes and plants.
  parts.push(
    '<defs><pattern id="dpk-haz" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#2B2C30"/><rect width="7" height="14" fill="#FFC928"/></pattern></defs>',
    '<rect x="292" y="66" width="56" height="300" rx="8" fill="#A3AAB3"/>',
    '<rect x="292" y="66" width="7" height="300" fill="url(#dpk-haz)"/><rect x="341" y="66" width="7" height="300" fill="url(#dpk-haz)"/>',
  );
  for (const py of [92, 214]) {
    parts.push(
      `<rect x="306" y="${py + 20}" width="28" height="24" rx="6" fill="#B9824C"/>`,
      `<ellipse cx="320" cy="${py + 14}" rx="18" ry="14" fill="#3E8A2D"/>`,
      `<ellipse cx="320" cy="${py + 11}" rx="16" ry="11" fill="#4FA43A"/>`,
    );
  }
  // Catch ring under the receiver, then the chefs.
  const ring: string[] = [];
  for (let i = 0; i < 14; i++) {
    const a0 = (i / 14) * Math.PI * 2;
    const a1 = a0 + Math.PI / 14;
    const p = (a: number) => `${(468 + Math.cos(a) * 64).toFixed(1)} ${(332 + Math.sin(a) * 20).toFixed(1)}`;
    ring.push(
      `<path d="M${p(a0)} L${p((a0 + a1) / 2)} L${p(a1)}" stroke="#FFC928" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    );
  }
  parts.push(ring.join(''));
  parts.push(chefMarkup('semangka', '#FF5A1F', 176, 336, 2.3, { arms: 'up', face: 'effort' }));
  parts.push(chefMarkup('alpukat', '#22B35E', 468, 336, 2.3, { arms: 'catch', face: 'wow', flip: true }));
  // The throw: a dotted arc and the tomato in flight, with speed lines.
  const arc: string[] = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const v = 1 - u;
    const x = v * v * 232 + 2 * v * u * 340 + u * u * 452;
    const y = v * v * 222 + 2 * v * u * 40 + u * u * 236;
    if (u > 0.5) arc.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="#FFFFFF"/>`);
  }
  parts.push(arc.join(''));
  parts.push(
    `<g transform="translate(318 104) rotate(-18 24 24) scale(1.25)">${iconMarkup('tomat')}</g>`,
    '<path d="M286 118 l-22 10 M290 132 l-18 8" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.85"/>',
  );
  return svgDoc(640, 360, parts.join(''));
}
