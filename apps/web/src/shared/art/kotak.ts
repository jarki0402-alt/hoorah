/**
 * Flat-art helpers for the box-world games' posters (Obby, Lantai Runtuh and the ones that follow):
 * a blocky fruit figure like the 3D avatar, and a box seen from above at three-quarter angle.
 */
import type { Fruit } from '@hoorah/protocol';
import { FRUIT_ART } from './fruits';
import { f1 } from './svg';

export const INK = '#111214';

/** Lighten (k > 1) or darken (k < 1) a #RRGGBB colour. */
export function tone(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const c = k >= 1 ? v + (255 - v) * (k - 1) : v * k;
    return Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** A box with its front face at (x, y, w, h) and a top face of depth d (drawn up and right). */
export function box(
  x: number,
  y: number,
  w: number,
  h: number,
  d: number,
  color: string,
  stroke = true,
): string {
  const s = stroke ? ` stroke="${INK}" stroke-width="2" stroke-linejoin="round"` : '';
  const dx = d * 0.55;
  const dy = d * 0.45;
  return [
    `<path d="M${f1(x)} ${f1(y)}l${f1(dx)} ${f1(-dy)}h${f1(w)}l${f1(-dx)} ${f1(dy)}Z" fill="${tone(color, 1.18)}"${s}/>`,
    `<path d="M${f1(x + w)} ${f1(y)}l${f1(dx)} ${f1(-dy)}v${f1(h)}l${f1(-dx)} ${f1(dy)}Z" fill="${tone(color, 0.72)}"${s}/>`,
    `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${color}"${s}/>`,
  ].join('');
}

export type FigurePose = 'stand' | 'run' | 'jump' | 'push' | 'fall' | 'cheer';

/**
 * A blocky fruit figure with its feet at (0, 0), about 100 units tall at scale 1: cube head in the
 * fruit's colour with a face, shirt in the player's colour, dark legs.
 */
export function figure(fruit: Fruit, shirt: string, pose: FigurePose): string {
  const skin = FRUIT_ART[fruit].body[1];
  const leaf = FRUIT_ART[fruit].leaf?.[1] ?? FRUIT_ART[fruit].back?.[1] ?? '#2E9E4F';
  const legs = '#2B2F38';
  const limb = (x: number, y: number, w: number, h: number, rot: number, fill: string) =>
    `<rect x="${f1(-w / 2)}" y="0" width="${f1(w)}" height="${f1(h)}" rx="2" fill="${fill}" stroke="${INK}" stroke-width="2" transform="translate(${f1(x)} ${f1(y)}) rotate(${rot})"/>`;
  const legRot: Record<FigurePose, [number, number]> = {
    stand: [0, 0],
    run: [28, -32],
    jump: [-30, 20],
    push: [24, -18],
    fall: [40, -50],
    cheer: [8, -8],
  };
  const armRot: Record<FigurePose, [number, number]> = {
    stand: [6, -6],
    run: [-36, 40],
    jump: [160, -160],
    push: [-95, -80],
    fall: [140, -120],
    cheer: [165, -165],
  };
  const [l1, l2] = legRot[pose];
  const [a1, a2] = armRot[pose];
  const out: string[] = [];
  out.push(limb(-7, -32, 11, 32, l1, legs), limb(7, -32, 11, 32, l2, legs));
  out.push(limb(-21, -64, 10, 28, a1, tone(shirt, 0.82)));
  out.push(
    `<rect x="-17" y="-66" width="34" height="36" rx="4" fill="${shirt}" stroke="${INK}" stroke-width="2.5"/>`,
  );
  out.push('<rect x="-9" y="-56" width="18" height="12" rx="2" fill="#FFF7F0"/>');
  out.push(limb(21, -64, 10, 28, a2, tone(shirt, 0.82)));
  // Cube head with a face.
  const hy = -106;
  out.push(
    `<rect x="-21" y="${hy}" width="42" height="42" rx="6" fill="${skin}" stroke="${INK}" stroke-width="2.5"/>`,
  );
  out.push(
    `<rect x="-4" y="${hy - 9}" width="8" height="10" rx="2" fill="${leaf}" stroke="${INK}" stroke-width="2"/>`,
  );
  const wow = pose === 'fall' || pose === 'jump';
  out.push(
    `<circle cx="-8" cy="${hy + 18}" r="3.6" fill="${INK}"/><circle cx="8" cy="${hy + 18}" r="3.6" fill="${INK}"/>`,
    `<circle cx="-7" cy="${hy + 16.6}" r="1.2" fill="#fff"/><circle cx="9" cy="${hy + 16.6}" r="1.2" fill="#fff"/>`,
    `<circle cx="-13" cy="${hy + 26}" r="3.4" fill="#FF7A8A" fill-opacity="0.6"/><circle cx="13" cy="${hy + 26}" r="3.4" fill="#FF7A8A" fill-opacity="0.6"/>`,
    wow
      ? `<ellipse cx="0" cy="${hy + 29}" rx="4" ry="5" fill="${INK}"/>`
      : `<path d="M-6 ${hy + 26} Q0 ${hy + 33} 6 ${hy + 26}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  );
  return out.join('');
}

/** Place a figure at (x, y) with scale s (and an optional tilt in degrees). */
export function placed(markup: string, x: number, y: number, s: number, tilt = 0): string {
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${tilt}) scale(${s})">${markup}</g>`;
}
