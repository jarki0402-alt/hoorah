/** "Cara main" for Seluncur Es (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  circle,
  fruit,
  hop,
  label,
  mark,
  pulse,
  scene,
  shake,
  slide,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#0B2C3D';
const ICE = '#EEF8FC';
const RIM = '#8ECFE3';
const DEEP = '#3F8FAB';
const RED = '#F2453D';
const CX = 320;
const CY = 210;

/** The ice floe seen at a slant: a dark side, a light rim and the white top. */
function floe(rx = 230, ry = 104): string {
  return `<ellipse cx="${CX}" cy="${CY + 16}" rx="${rx}" ry="${ry}" fill="${DEEP}"/><ellipse cx="${CX}" cy="${CY + 8}" rx="${rx}" ry="${ry}" fill="${RIM}"/><ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}" fill="${ICE}"/>`;
}

/** A dotted slingshot band from (x1, y1) to (x2, y2). */
function band(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${DEEP}" stroke-width="5" stroke-linecap="round" stroke-dasharray="4 10"/>`;
}

function splash(x: number, y: number): string {
  return `<ellipse cx="${x}" cy="${y}" rx="40" ry="12" fill="none" stroke="#BFE6F2" stroke-width="5"/><ellipse cx="${x}" cy="${y}" rx="22" ry="6" fill="#BFE6F2"/>`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari adu dorong ala sumo dan curling. Bedanya: semua membidik diam-diam di HP, lalu meluncur bersamaan.',
  steps: [
    {
      text: 'Tarik ke belakang dari buahmu di HP: arah dan kekuatan luncur.',
      scene: () =>
        scene(
          BG,
          `${floe()}${band(250, 214, 170, 250)}${circle(170, 250, 12, '#FFC928', 'stroke="#FFFFFF" stroke-width="3"')}${arrow(290, 200, 450, 160, { width: 7 })}${fruit('semangka', 250, 200, 64)}${label('Tarik', 150, 300, { size: 24 })}${label('Meluncur', 470, 130, { size: 24, color: '#FFC928' })}`,
        ),
      phone: { kind: 'swipe', dir: 'left' },
    },
    {
      text: 'Lepas untuk mengunci. Masih boleh bidik ulang sebelum waktu habis.',
      scene: () =>
        scene(
          BG,
          `${floe()}${arrow(230, 200, 330, 170, { color: RED })}${arrow(430, 240, 360, 200, { color: '#2F8CFF' })}${fruit('semangka', 200, 210, 60)}${fruit('jeruk', 460, 250, 60)}${appear(`${mark(true, 200, 160, 18)}${label('Terkunci', 200, 132, { size: 20, color: '#111214' })}`, 0.4, 3)}${pulse(label('3', 560, 80, { size: 54, color: '#FFC928' }), 560, 64, 1)}`,
        ),
      phone: { kind: 'look', text: 'Bidik dan lepas!' },
    },
    {
      text: 'Waktu habis, semua meluncur bersamaan. Tabrak lawan sampai tercebur!',
      scene: () =>
        scene(
          BG,
          `${floe()}${appear(splash(560, 320), 1.4, 2.6)}${slide(fruit('nanas', 440, 210, 60, 'wow'), 120, 90, 2.6, 0.6)}${slide(fruit('semangka', 220, 210, 60, 'effort'), 160, 0, 2.6)}${appear(label('DUK!', 410, 150, { size: 40, color: '#FFC928' }), 0.6, 2.6)}`,
        ),
      phone: { kind: 'look', text: 'Lihat layar!' },
    },
    {
      text: 'Tepi es retak dan patah. Terakhir di atas es dapat poin terbanyak.',
      scene: () =>
        scene(
          BG,
          `${floe(170, 80)}${shake(`<path d="M440 170 L470 196 L452 222 L482 252" fill="none" stroke="${RED}" stroke-width="5" stroke-dasharray="10 8"/>`, 460, 210)}${label('ES RETAK!', 520, 120, { size: 26, color: RED })}${hop(fruit('semangka', 300, 196, 70), 34, 1)}${label('Terakhir di atas es!', 300, 86, { size: 28, color: '#FFC928' })}`,
        ),
      phone: { kind: 'look', text: 'Kamu terakhir di atas es!' },
    },
  ],
};
