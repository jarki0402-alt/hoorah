/** "Cara main" for Balap Karung (shared/tutorial). Imports only shared art helpers. */
import type { Face } from '../../shared/art/fruits';
import { KARUNG, sackRacer } from '../../shared/art/karung';
import {
  appear,
  arrow,
  box,
  circle,
  hop,
  label,
  mark,
  pulse,
  scene,
  shake,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

type Fruit = Parameters<typeof sackRacer>[0];

const GROUND = 290;
const FINISH = 560;

/** Grass field with two chalk lane lines. */
function field(): string {
  return `${box(0, GROUND - 6, 640, 82, KARUNG.grass, 0)}${box(0, GROUND - 6, 640, 4, KARUNG.chalk, 0)}${box(0, 352, 640, 4, KARUNG.chalk, 0)}${box(0, GROUND + 6, 640, 8, KARUNG.grassDark, 0)}`;
}

/** Finish line: two bamboo poles, a red banner and a chalk stripe on the grass. */
function finish(): string {
  return `${box(FINISH - 4, GROUND - 6, 10, 72, KARUNG.chalk, 0)}${box(FINISH - 30, 120, 8, GROUND - 120, KARUNG.bambooDark, 3)}${box(FINISH + 30, 120, 8, GROUND - 120, KARUNG.bambooDark, 3)}${box(FINISH - 40, 112, 88, 34, KARUNG.red, 6)}${label('FINIS', FINISH + 4, 136, { size: 20 })}`;
}

/** A sack racer with its feet at (x, y). */
function racer(f: Fruit, x: number, y: number, color: string, scale = 0.62, face: Face = 'effort'): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})">${sackRacer(f, color, face)}</g>`;
}

/** The rhythm target: the white line ring and the yellow ring closing in on it. */
function beat(x: number, y: number): string {
  return `${circle(x, y, 64, '#00000022')}${circle(x, y, 48, 'none', `stroke="${KARUNG.chalk}" stroke-width="8"`)}${pulse(circle(x, y, 48, 'none', 'stroke="#FFC928" stroke-width="8"'), x, y, 1)}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari lomba balap karung tujuhbelasan. Bedanya: lompatan jauh hanya kalau ketukanmu pas dengan irama.',
  steps: [
    {
      text: 'Masuk karung, lompat terus, dan lewati garis finis paling dulu.',
      scene: () =>
        scene(
          KARUNG.sky,
          `${field()}${finish()}${arrow(150, 150, 480, 150, { bend: 30 })}${slide(hop(racer('semangka', 110, GROUND + 30, '#2F8CFF'), 40, 0.8), 360, 0, 3.2)}${slide(hop(racer('nanas', 70, GROUND + 56, '#22B35E', 0.55), 30, 0.9, 0.3), 280, 0, 3.2)}`,
        ),
      phone: { kind: 'tap', label: 'LOMPAT!' },
    },
    {
      text: 'Ketuk LOMPAT! tepat saat cincin kuning pas di garis putih.',
      scene: () =>
        scene(
          KARUNG.sky,
          `${field()}${hop(racer('semangka', 170, GROUND + 40, '#2F8CFF', 0.7), 50, 1)}${beat(430, 160)}${tap(430, 160, '#FFFFFF', 0.5)}${appear(label('PAS!', 430, 260, { size: 36, color: KARUNG.red }), 0.5, 2)}`,
        ),
      phone: { kind: 'tap', label: 'LOMPAT!' },
    },
    {
      text: 'Ketuk asal cepat malah bikin karungmu tersandung.',
      scene: () =>
        scene(
          KARUNG.sky,
          `${field()}${shake(racer('semangka', 260, GROUND + 40, '#2F8CFF', 0.7, 'sad'), 260, GROUND, 0.4)}${tap(430, 130, '#FFFFFF', 0)}${tap(470, 170, '#FFFFFF', 0.2)}${tap(420, 200, '#FFFFFF', 0.4)}${tap(480, 110, '#FFFFFF', 0.6)}${mark(false, 450, 260, 28)}`,
        ),
      phone: { kind: 'tap', label: 'LOMPAT!' },
    },
    {
      text: 'Tiga ketukan pas berturut-turut memberi lompatan super!',
      scene: () =>
        scene(
          KARUNG.sky,
          `${field()}${finish()}${appear(label('x3', 150, 90, { size: 40, color: KARUNG.red }), 0.1, 2.8)}${arrow(170, 200, 470, 200, { bend: 90, width: 7 })}${slide(hop(racer('semangka', 150, GROUND + 40, '#2F8CFF', 0.62, 'wow'), 110, 1.4), 330, 0, 2.8)}${mark(true, 600, 90, 24)}`,
        ),
      phone: { kind: 'tap', label: 'LOMPAT!' },
    },
  ],
};
