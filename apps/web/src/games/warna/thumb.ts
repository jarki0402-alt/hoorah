/**
 * A stage as a small picture (SVG body for a 160×120 thumbnail): the cave map at 5 px per tile with its pools,
 * gates, doors, lifts, boxes, gems and exits in the four colours. Used by the phone's stage
 * picker (controller/thumbs/warna.ts) and the main screen's picker.
 */
import { Cell, COLS, type Level, ROWS, type Slot } from './levels';
import { PALETTE } from './palette';

export const THUMB_W = 160;
export const THUMB_H = 120;
const T = 5;
const OY = (THUMB_H - ROWS * T) / 2;

export const SLOT_FILL: Record<Slot, string> = { 0: '#F2453D', 1: '#2F7DF6', 2: '#22B35E', 3: '#FFC928' };

const r = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}Z`;

/** Inner SVG markup of a stage thumbnail (no <svg> wrapper). */
export function levelThumbBody(lv: Level): string {
  let rock = '';
  let lip = '';
  const pools: Record<number, string> = { 0: '', 1: '', 2: '', 3: '' };
  const gates: Record<number, string> = { 0: '', 1: '', 2: '', 3: '' };
  let doors = '';
  let planks = '';
  let caps = '';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const c = lv.cells[i];
      const px = x * T;
      const py = OY + y * T;
      if (c === Cell.Rock) {
        rock += r(px, py, T, T);
        const above = y > 0 ? lv.cells[i - COLS] : Cell.Rock;
        if (above !== Cell.Rock && above !== Cell.Pool) lip += r(px, py, T, 1.4);
      } else if (c === Cell.Pool) {
        pools[lv.meta[i]!] += r(px, py + 1.5, T, T - 1.5);
      } else if (c === Cell.Gate) gates[lv.meta[i]!] += r(px + 1.5, py, 2, T);
      else if (c === Cell.Door) doors += r(px + 0.8, py, T - 1.6, T);
      else if (c === Cell.Plank) planks += r(px, py, T, 1.6);
      else if (c === Cell.Bounce) caps += `M${px} ${py + T}a${T / 2} ${T / 2} 0 0 1 ${T} 0Z`;
    }
  }
  const pal = PALETTE[lv.biome];
  const out: string[] = [
    `<rect width="${THUMB_W}" height="${THUMB_H}" fill="${pal.sky[2]}"/>`,
    `<rect y="${OY}" width="${THUMB_W}" height="${ROWS * T}" fill="${pal.sky[1]}"/>`,
    `<path d="${rock}" fill="${pal.rock}"/>`,
    `<path d="${lip}" fill="${pal.lip}"/>`,
  ];
  if (planks) out.push(`<path d="${planks}" fill="#C48A52"/>`);
  if (caps) out.push(`<path d="${caps}" fill="#F2453D" stroke="#FFFFFF" stroke-width="0.6"/>`);
  for (const s of [0, 1, 2, 3] as const) {
    if (pools[s]) out.push(`<path d="${pools[s]}" fill="${SLOT_FILL[s]}"/>`);
    if (gates[s]) out.push(`<path d="${gates[s]}" fill="${SLOT_FILL[s]}" opacity="0.75"/>`);
  }
  if (doors) out.push(`<path d="${doors}" fill="#C9B98F"/>`);
  for (const l of lv.lifts) {
    out.push(
      `<path d="M${l.x * T + 1} ${OY + l.yUp * T}V${OY + l.yDown * T}M${(l.x + l.w) * T - 1} ${OY + l.yUp * T}V${OY + l.yDown * T}" stroke="#5D7C86" stroke-width="0.8"/>`,
      `<rect x="${l.x * T}" y="${OY + l.yDown * T - 1}" width="${l.w * T}" height="2" fill="#FFE27A"/>`,
    );
  }
  for (const b of lv.boxes) {
    const s = b.heavy ? 2 * T : T;
    out.push(
      `<rect x="${b.x * T + 0.4}" y="${OY + b.y * T + 0.4}" width="${s - 0.8}" height="${s - 0.8}" fill="${b.heavy ? '#8E877A' : '#A9774A'}"/>`,
    );
  }
  for (const p of lv.plates)
    out.push(`<rect x="${p.x * T + 0.5}" y="${OY + p.y * T + 3.6}" width="4" height="1.4" fill="#FFE27A"/>`);
  for (const l of lv.levers)
    out.push(
      `<path d="M${l.x * T + 2.5} ${OY + l.y * T + 5}l1.6 -3.6" stroke="#FFE27A" stroke-width="1.2"/>`,
    );
  for (const e of lv.exits)
    out.push(
      `<rect x="${e.x * T + 0.3}" y="${OY + (e.y - 1) * T + 0.5}" width="${T - 0.6}" height="${2 * T - 0.5}" rx="1.6" fill="${SLOT_FILL[e.slot]}"/>`,
      `<rect x="${e.x * T + 1.3}" y="${OY + (e.y - 1) * T + 2}" width="${T - 2.6}" height="${2 * T - 2}" rx="1" fill="#0B1F26"/>`,
    );
  for (const g of lv.gems)
    out.push(
      `<path d="M${g.x * T + 2.5} ${OY + g.y * T + 0.6}l1.9 1.9l-1.9 1.9l-1.9 -1.9Z" fill="${SLOT_FILL[g.slot]}" stroke="#FFFFFF" stroke-width="0.5"/>`,
    );
  const sp = lv.spawns[0];
  if (sp) out.push(`<circle cx="${sp.x * T + 2.5}" cy="${OY + sp.y * T + 2.5}" r="2.2" fill="#FFFFFF"/>`);
  return out.join('');
}
