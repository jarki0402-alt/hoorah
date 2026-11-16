/**
 * The static picture behind the snakes, in stage px: night garden, the hedge with its fairy
 * lights, and the striped lawn exactly where the arena is. Rasterized once per layout.
 */
import { ARENA, bulb, frangipani, leafClump } from '../../shared/art/arena';
import { f1, seeded, svgDoc } from '../../shared/art/svg';
import { type ArenaView, BORDER, panelRect } from './layout';

/** Points every `gap` px around a rounded rectangle (clockwise from the top-left corner's end). */
export function roundedRectPoints(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  gap: number,
): [number, number][] {
  const out: [number, number][] = [];
  const straightW = Math.max(0, w - 2 * r);
  const straightH = Math.max(0, h - 2 * r);
  const arc = (Math.PI / 2) * r;
  const total = 2 * (straightW + straightH) + 4 * arc;
  const n = Math.max(4, Math.round(total / gap));
  const step = total / n;
  for (let i = 0; i < n; i++) {
    let d = i * step;
    const seg = (len: number) => {
      if (d <= len) return true;
      d -= len;
      return false;
    };
    if (seg(straightW)) {
      out.push([x + r + d, y]);
      continue;
    }
    if (seg(arc)) {
      const a = -Math.PI / 2 + d / r;
      out.push([x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r]);
      continue;
    }
    if (seg(straightH)) {
      out.push([x + w, y + r + d]);
      continue;
    }
    if (seg(arc)) {
      const a = d / r;
      out.push([x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r]);
      continue;
    }
    if (seg(straightW)) {
      out.push([x + w - r - d, y + h]);
      continue;
    }
    if (seg(arc)) {
      const a = Math.PI / 2 + d / r;
      out.push([x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r]);
      continue;
    }
    if (seg(straightH)) {
      out.push([x, y + h - r - d]);
      continue;
    }
    const a = Math.PI + d / r;
    out.push([x + r + Math.cos(a) * r, y + r + Math.sin(a) * r]);
  }
  return out;
}

const rr = (x: number, y: number, w: number, h: number, r: number, fill: string, extra = '') =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(r)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;

/** Garden foliage around the stage edges and behind the leaderboard. */
function garden(stageW: number, stageH: number): string {
  const rnd = seeded(91);
  const out: string[] = [];
  const panel = panelRect(stageW, stageH);
  // Clumps along the left, top and bottom edges, growing inward.
  for (let y = 40; y < stageH; y += 120 + rnd() * 60)
    out.push(leafClump(-6, y, 48 + rnd() * 18, -40, 40, 3, Math.floor(rnd() * 1000)));
  for (let x = 60; x < panel.x; x += 130 + rnd() * 70) {
    out.push(leafClump(x, -6, 44 + rnd() * 16, 50, 130, 3, Math.floor(rnd() * 1000)));
    out.push(leafClump(x + 50, stageH + 6, 44 + rnd() * 16, -130, -50, 3, Math.floor(rnd() * 1000)));
  }
  // Lush column behind the panel: big clumps from the right edge.
  for (let y = 0; y < stageH + 80; y += 110) {
    out.push(leafClump(stageW + 10, y, 120 + rnd() * 40, 150, 230, 5, Math.floor(rnd() * 1000)));
  }
  // Corner flowers.
  out.push(frangipani(26, 30, 14, 10), frangipani(50, 16, 10, -25), frangipani(18, stageH - 26, 13, 40));
  out.push(frangipani(panel.x - 30, stageH - 18, 12, -10), frangipani(panel.x - 6, 20, 11, 25));
  return out.join('');
}

/** Diagonal mown stripes and a sprinkle of grass ticks, clipped to the lawn. */
function lawn(v: ArenaView, corner: number): string {
  const rnd = seeded(13);
  const band = Math.max(30, Math.round(Math.min(v.w, v.h) / 12));
  let stripes = '';
  for (let x = v.x - v.h; x < v.x + v.w + v.h; x += band * 2) {
    stripes += `M${f1(x)} ${f1(v.y)} l${band} 0 l${f1(-v.h * 0.45)} ${f1(v.h)} l${-band} 0Z `;
  }
  let ticks = '';
  const n = Math.round((v.w * v.h) / 2600);
  for (let i = 0; i < n; i++) {
    const x = v.x + rnd() * v.w;
    const y = v.y + rnd() * v.h;
    ticks += `M${f1(x)} ${f1(y)} l1.6 -5 l1.6 5Z `;
  }
  return [
    `<clipPath id="lawn-clip">${rr(v.x, v.y, v.w, v.h, corner, '#000')}</clipPath>`,
    rr(v.x, v.y, v.w, v.h, corner, ARENA.lawn),
    `<g clip-path="url(#lawn-clip)">`,
    `<path d="${stripes}" fill="${ARENA.lawnStripe}"/>`,
    `<path d="${ticks}" fill="#245A3F" opacity="0.55"/>`,
    // Inner shade along the hedge gives the lawn a little depth.
    rr(v.x, v.y, v.w, v.h, corner, 'none', `stroke="${ARENA.night}" stroke-width="14" opacity="0.32"`),
    '</g>',
  ].join('');
}

/** Hedge ring with a bumpy outer edge, a wire and warm bulbs around the lawn. */
function hedge(v: ArenaView, corner: number): string {
  const rnd = seeded(5);
  const b = BORDER;
  const outer = rr(v.x - b, v.y - b, v.w + 2 * b, v.h + 2 * b, corner + b, ARENA.hedge);
  let bumps = '';
  let tips = '';
  for (const [x, y] of roundedRectPoints(
    v.x - b + 3,
    v.y - b + 3,
    v.w + 2 * b - 6,
    v.h + 2 * b - 6,
    corner + b - 3,
    13,
  )) {
    bumps += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(7 + rnd() * 4)}"/>`;
    if (rnd() < 0.5)
      tips += `<circle cx="${f1(x + (rnd() - 0.5) * 6)}" cy="${f1(y + (rnd() - 0.5) * 6)}" r="${f1(2.5 + rnd() * 2)}"/>`;
  }
  const wireInset = b * 0.48;
  const wire = rr(
    v.x - wireInset,
    v.y - wireInset,
    v.w + 2 * wireInset,
    v.h + 2 * wireInset,
    corner + wireInset,
    'none',
    `stroke="${ARENA.wire}" stroke-width="1.5"`,
  );
  let lights = '';
  for (const [x, y] of roundedRectPoints(
    v.x - wireInset,
    v.y - wireInset,
    v.w + 2 * wireInset,
    v.h + 2 * wireInset,
    corner + wireInset,
    34,
  )) {
    lights += bulb(x, y, 2.8);
  }
  return [
    `<g fill="${ARENA.hedge}">${bumps}</g>`,
    outer,
    `<g fill="${ARENA.hedgeLight}" opacity="0.7">${tips}</g>`,
    wire,
    lights,
  ].join('');
}

export function backdropSvg(
  stageW: number,
  stageH: number,
  v: ArenaView,
  cornerWorld: number,
  scale: number,
): string {
  const corner = cornerWorld * v.s;
  const body = [
    `<rect width="${stageW}" height="${stageH}" fill="${ARENA.night}"/>`,
    garden(stageW, stageH),
    hedge(v, corner),
    lawn(v, corner),
  ].join('');
  return svgDoc(Math.round(stageW * scale), Math.round(stageH * scale), body, `0 0 ${stageW} ${stageH}`);
}
