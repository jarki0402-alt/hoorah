/**
 * Phone theme for Ular Arena: a corner of the night garden. The hedge with its warm fairy lights
 * runs along the very top, leaves frame the corners, a few glowing seeds sit in the
 * mown lawn at the edges; the middle stays calm so the joystick reads clearly.
 */
import type { ControllerTheme } from '../../controller/themes';
import { ARENA, bulb, frangipani, leafClump, SEED_HEX, seedMarkup } from '../../shared/art/arena';
import { f1, seeded } from '../../shared/art/svg';

function arenaScene(w: number, h: number): string {
  const land = w > h;
  const rnd = seeded(41);
  // The hedge runs along the very top (behind the pause pill), clear of the status row.
  const hedgeY = Math.max(24, Math.round(h * (land ? 0.065 : 0.045)));
  const out: string[] = [];
  out.push(`<rect width="${w}" height="${h}" fill="${ARENA.lawn}"/>`);
  // Mown stripes across the lawn.
  const band = Math.max(36, Math.round(Math.min(w, h) / 8));
  let stripes = '';
  for (let x = -h; x < w + h; x += band * 2)
    stripes += `M${x} ${hedgeY} l${band} 0 l${f1(-h * 0.45)} ${h} l${-band} 0Z `;
  out.push(`<path d="${stripes}" fill="${ARENA.lawnStripe}"/>`);
  // Night garden above the hedge.
  out.push(`<rect width="${w}" height="${hedgeY}" fill="${ARENA.night}"/>`);
  for (let x = 20; x < w; x += 90 + rnd() * 50) {
    out.push(leafClump(x, -6, hedgeY * 0.7 + rnd() * 8, 60, 120, 3, Math.floor(rnd() * 1000)));
  }
  // Hedge with a bumpy top edge, then the wire and its bulbs.
  let bumps = '';
  for (let x = -6; x < w + 12; x += 13)
    bumps += `<circle cx="${f1(x)}" cy="${f1(hedgeY - 4 + rnd() * 3)}" r="${f1(8 + rnd() * 3)}"/>`;
  out.push(`<g fill="${ARENA.hedge}">${bumps}</g>`);
  out.push(`<rect x="0" y="${hedgeY - 4}" width="${w}" height="16" fill="${ARENA.hedge}"/>`);
  out.push(`<path d="M0 ${hedgeY + 4} H${w}" stroke="${ARENA.wire}" stroke-width="1.5"/>`);
  for (let x = 14; x < w; x += 30) out.push(bulb(x, hedgeY + 4, 2.6));
  out.push(`<rect x="0" y="${hedgeY + 12}" width="${w}" height="10" fill="${ARENA.night}" opacity="0.3"/>`);
  // Glowing seeds near the edges, away from the controls in the middle.
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0;
    const x = side ? 8 + rnd() * w * 0.08 : w - 8 - rnd() * w * 0.08;
    const y = hedgeY + 40 + rnd() * (h - hedgeY - 60);
    out.push(seedMarkup(x, y, 2.4 + rnd() * 1.4, SEED_HEX[i % SEED_HEX.length]!));
  }
  // Leaves and flowers in the bottom corners.
  out.push(leafClump(-4, h + 4, 70, -80, -15, 4, 8), leafClump(w + 4, h + 4, 70, -165, -100, 4, 9));
  out.push(frangipani(22, h - 26, 12, 20), frangipani(w - 24, h - 30, 11, -15));
  return out.join('');
}

export const arenaTheme: ControllerTheme = {
  chrome: ARENA.night,
  scene: arenaScene,
  stripEdge: {
    w: 30,
    h: 12,
    body: `<rect width="30" height="7" fill="${ARENA.hedge}"/><path d="M0 6 H30" stroke="${ARENA.wire}" stroke-width="1.5"/><circle cx="15" cy="7" r="5" fill="${ARENA.bulbGlow}" opacity="0.35"/><circle cx="15" cy="7" r="2.6" fill="${ARENA.bulb}"/>`,
  },
};
