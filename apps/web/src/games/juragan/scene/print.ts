/**
 * The printed face of the board, drawn once into a canvas at high resolution: cream paper tiles
 * with island colour bands, names and prices, illustrated corners and special tiles, and the sea
 * in the middle with a map of the islands in their group colours. Everything reads upright from
 * the main screen camera. One texture covers the whole base (ring, rim and centre); the raised
 * tile meshes sample their own patch of it.
 */
import { GROUP_COLOR, type GroupId, isCorner, TILES } from '../board';
import {
  CITY_NAME,
  CORNER_NAME,
  CORNER_NOTE,
  KABAR_NAME,
  KABAR_NOTE,
  rp,
  STR,
  TAX_NAME,
  TAX_NOTE,
  TRANSPORT_NAME,
} from '../strings';
import { CITY_LONLAT, ISLANDS, type LonLat, MAP_BOUNDS } from './islands';
import { BAND, BANK_SPOT, BASE_HALF, DECK_SPOT, DICE_SPOT, GAP, HALF, tileRect } from './layout';

export const INK = '#1E1F24';
const PAPER = '#F8EEDA';
const PAPER_LOW = '#F1E3C8';
const TEXT_2 = '#5C4F3B';
const SEA = '#0F5664';
const SEA_DEEP = '#0A3B47';
const RIM = '#0B2E37';
const GOLD = '#E9B43C';
const DISPLAY = '"Baloo 2", ui-rounded, system-ui, sans-serif';
const UI = '"Plus Jakarta Sans", system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D;

interface Px {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Set a font no larger than `size` px that fits `text` into `maxW`. Returns the size used. */
function fit(ctx: Ctx, text: string, maxW: number, size: number, weight: number, family: string): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    s = Math.floor((s * maxW) / w);
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function centered(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  weight = 800,
  family = DISPLAY,
): number {
  const s = fit(ctx, text, maxW, size, weight, family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  return s;
}

/** A tile name on one or two lines (two-word names split when that reads bigger). */
function nameBlock(ctx: Ctx, name: string, cx: number, cy: number, maxW: number, size: number): void {
  const upper = name.toUpperCase();
  ctx.fillStyle = INK;
  const words = upper.split(' ');
  ctx.font = `800 ${size}px ${DISPLAY}`;
  if (words.length > 1 && ctx.measureText(upper).width > maxW) {
    const s = Math.min(
      fit(ctx, words[0]!, maxW, size * 0.92, 800, DISPLAY),
      fit(ctx, words.slice(1).join(' '), maxW, size * 0.92, 800, DISPLAY),
    );
    ctx.font = `800 ${s}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(words[0]!, cx, cy - s * 0.48);
    ctx.fillText(words.slice(1).join(' '), cx, cy + s * 0.5);
    return;
  }
  centered(ctx, upper, cx, cy, maxW, size);
}

/* ------------------------------------------------------------------ icons */

function banknote(ctx: Ctx, cx: number, cy: number, s: number, rot: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const w = s * 1.5;
  const h = s * 0.78;
  ctx.fillStyle = 'rgba(30,31,36,0.22)';
  rr(ctx, -w / 2 + s * 0.05, -h / 2 + s * 0.07, w, h, s * 0.08);
  ctx.fill();
  ctx.fillStyle = '#2FA36B';
  rr(ctx, -w / 2, -h / 2, w, h, s * 0.08);
  ctx.fill();
  ctx.strokeStyle = '#D8F3E2';
  ctx.lineWidth = s * 0.05;
  rr(ctx, -w / 2 + s * 0.1, -h / 2 + s * 0.1, w - s * 0.2, h - s * 0.2, s * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#D8F3E2';
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2FA36B';
  ctx.font = `800 ${h * 0.34}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Rp', 0, h * 0.03);
  ctx.restore();
}

function arrow(ctx: Ctx, x0: number, y: number, x1: number, s: number, color: string): void {
  ctx.fillStyle = color;
  const t = s * 0.22;
  ctx.beginPath();
  ctx.moveTo(x0, y - t / 2);
  ctx.lineTo(x1 - s * 0.45, y - t / 2);
  ctx.lineTo(x1 - s * 0.45, y - s * 0.38);
  ctx.lineTo(x1, y);
  ctx.lineTo(x1 - s * 0.45, y + s * 0.38);
  ctx.lineTo(x1 - s * 0.45, y + t / 2);
  ctx.lineTo(x0, y + t / 2);
  ctx.closePath();
  ctx.fill();
}

function cone(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.fillStyle = INK;
  rr(ctx, cx - s * 0.5, cy + s * 0.42, s, s * 0.14, s * 0.04);
  ctx.fill();
  ctx.fillStyle = '#FF7A1A';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.36, cy + s * 0.44);
  ctx.lineTo(cx - s * 0.08, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.08, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.36, cy + s * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(cx - s, cy - s * 0.16, s * 2, s * 0.16);
  ctx.fillRect(cx - s, cy + s * 0.14, s * 2, s * 0.14);
  ctx.restore();
}

function cup(ctx: Ctx, cx: number, cy: number, s: number): void {
  // Saucer
  ctx.fillStyle = 'rgba(30,31,36,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.04, cy + s * 0.5, s * 0.62, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.44, s * 0.6, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Handle
  ctx.beginPath();
  ctx.arc(cx + s * 0.38, cy + s * 0.05, s * 0.16, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  // Cup body
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.22);
  ctx.lineTo(cx + s * 0.42, cy - s * 0.22);
  ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.36, cx, cy + s * 0.38);
  ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.36, cx - s * 0.42, cy - s * 0.22);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.stroke();
  // Stripe and coffee
  ctx.fillStyle = '#E97A2C';
  ctx.fillRect(cx - s * 0.37, cy - s * 0.02, s * 0.74, s * 0.09);
  ctx.fillStyle = '#6B3E1F';
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.22, s * 0.4, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // Steam
  ctx.strokeStyle = 'rgba(92,79,59,0.7)';
  ctx.lineWidth = s * 0.05;
  ctx.lineCap = 'round';
  for (const dx of [-0.16, 0.05, 0.25]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * s, cy - s * 0.36);
    ctx.bezierCurveTo(
      cx + (dx - 0.1) * s,
      cy - s * 0.5,
      cx + (dx + 0.1) * s,
      cy - s * 0.62,
      cx + dx * s,
      cy - s * 0.78,
    );
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function siren(ctx: Ctx, cx: number, cy: number, s: number): void {
  // Light rays
  ctx.strokeStyle = '#F2453D';
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  for (const a of [-2.5, -1.9, -1.25, -0.64]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * s * 0.55, cy - s * 0.05 + Math.sin(a) * s * 0.55);
    ctx.lineTo(cx + Math.cos(a) * s * 0.78, cy - s * 0.05 + Math.sin(a) * s * 0.78);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // Base
  ctx.fillStyle = INK;
  rr(ctx, cx - s * 0.5, cy + s * 0.26, s, s * 0.18, s * 0.05);
  ctx.fill();
  // Dome
  const g = ctx.createLinearGradient(cx - s * 0.4, 0, cx + s * 0.4, 0);
  g.addColorStop(0, '#F2453D');
  g.addColorStop(0.5, '#FF7A6E');
  g.addColorStop(1, '#C92D25');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.38, cy + s * 0.27);
  ctx.lineTo(cx - s * 0.38, cy);
  ctx.arc(cx, cy, s * 0.38, Math.PI, 0);
  ctx.lineTo(cx + s * 0.38, cy + s * 0.27);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.14, cy - s * 0.12, s * 0.07, s * 0.15, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function newspaper(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.08);
  ctx.fillStyle = 'rgba(30,31,36,0.2)';
  rr(ctx, -s * 0.46, -s * 0.52, s * 0.98, s * 1.1, s * 0.06);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.05;
  rr(ctx, -s * 0.5, -s * 0.56, s, s * 1.08, s * 0.06);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(-s * 0.38, -s * 0.44, s * 0.76, s * 0.14);
  ctx.fillStyle = '#F2453D';
  ctx.fillRect(-s * 0.38, -s * 0.22, s * 0.34, s * 0.3);
  ctx.fillStyle = '#9A8F7D';
  for (let k = 0; k < 4; k++) ctx.fillRect(s * 0.02, -s * 0.22 + k * s * 0.08, s * 0.36, s * 0.035);
  for (let k = 0; k < 4; k++) ctx.fillRect(-s * 0.38, s * 0.16 + k * s * 0.08, s * 0.76, s * 0.035);
  ctx.restore();
}

function receipt(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.06);
  const w = s * 0.74;
  const h = s * 1.0;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  const teeth = 6;
  for (let k = 0; k < teeth; k++) {
    const x1 = w / 2 - ((k + 0.5) * w) / teeth;
    const x2 = w / 2 - ((k + 1) * w) / teeth;
    ctx.lineTo(x1, h / 2 - s * 0.07);
    ctx.lineTo(x2, h / 2);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.05;
  ctx.stroke();
  ctx.fillStyle = '#9A8F7D';
  for (let k = 0; k < 3; k++) ctx.fillRect(-w * 0.34, -h * 0.32 + k * s * 0.13, w * 0.68, s * 0.045);
  ctx.fillStyle = '#E9B43C';
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(0, h * 0.2, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `800 ${s * 0.2}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('%', 0, h * 0.21);
  ctx.restore();
}

function ship(ctx: Ctx, cx: number, cy: number, s: number): void {
  // Waves
  ctx.strokeStyle = '#1AA3B8';
  ctx.lineWidth = s * 0.06;
  ctx.lineCap = 'round';
  for (const [dy, off] of [
    [0.42, 0],
    [0.56, 0.18],
  ] as const) {
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const x = cx - s * 0.6 + off * s + k * s * 0.26;
      const y = cy + dy * s;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.quadraticCurveTo(x - s * 0.13, y - s * 0.1, x, y);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // Hull
  ctx.fillStyle = '#21344F';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.62, cy + s * 0.02);
  ctx.lineTo(cx + s * 0.66, cy + s * 0.02);
  ctx.lineTo(cx + s * 0.48, cy + s * 0.34);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#F2453D';
  ctx.fillRect(cx - s * 0.53, cy + s * 0.24, s * 1.03, s * 0.06);
  // Decks
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.035;
  rr(ctx, cx - s * 0.42, cy - s * 0.2, s * 0.84, s * 0.22, s * 0.03);
  ctx.fill();
  ctx.stroke();
  rr(ctx, cx - s * 0.26, cy - s * 0.38, s * 0.5, s * 0.18, s * 0.03);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#21344F';
  for (let k = 0; k < 6; k++) ctx.fillRect(cx - s * 0.36 + k * s * 0.13, cy - s * 0.13, s * 0.07, s * 0.07);
  // Funnel
  ctx.fillStyle = '#FFC928';
  ctx.fillRect(cx + s * 0.04, cy - s * 0.56, s * 0.14, s * 0.18);
  ctx.fillStyle = INK;
  ctx.fillRect(cx + s * 0.04, cy - s * 0.6, s * 0.14, s * 0.05);
}

function plane(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.55);
  ctx.fillStyle = '#21344F';
  // Fuselage
  rr(ctx, -s * 0.09, -s * 0.66, s * 0.18, s * 1.26, s * 0.09);
  ctx.fill();
  // Wings
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, -s * 0.16);
  ctx.lineTo(-s * 0.66, s * 0.12);
  ctx.lineTo(-s * 0.66, s * 0.22);
  ctx.lineTo(-s * 0.06, s * 0.08);
  ctx.lineTo(s * 0.06, s * 0.08);
  ctx.lineTo(s * 0.66, s * 0.22);
  ctx.lineTo(s * 0.66, s * 0.12);
  ctx.lineTo(s * 0.06, -s * 0.16);
  ctx.closePath();
  ctx.fill();
  // Tail
  ctx.beginPath();
  ctx.moveTo(-s * 0.05, s * 0.44);
  ctx.lineTo(-s * 0.28, s * 0.6);
  ctx.lineTo(-s * 0.28, s * 0.66);
  ctx.lineTo(s * 0.28, s * 0.66);
  ctx.lineTo(s * 0.28, s * 0.6);
  ctx.lineTo(s * 0.05, s * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFC928';
  rr(ctx, -s * 0.05, -s * 0.6, s * 0.1, s * 0.16, s * 0.05);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ tiles */

type BandSide = 'top' | 'bottom' | 'left' | 'right';

const BAND_SIDE: readonly BandSide[] = ['top', 'left', 'bottom', 'right'];

function paper(ctx: Ctx, r: Px, ppu: number, top = PAPER, bottom = PAPER_LOW): void {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  rr(ctx, r.x, r.y, r.w, r.h, ppu * 0.035);
  ctx.fill();
}

/** Split a tile into the colour band and the print area. */
function splitBand(r: Px, side: BandSide, band: number): { band: Px; area: Px } {
  switch (side) {
    case 'top':
      return { band: { ...r, h: band }, area: { x: r.x, y: r.y + band, w: r.w, h: r.h - band } };
    case 'bottom':
      return {
        band: { ...r, y: r.y + r.h - band, h: band },
        area: { x: r.x, y: r.y, w: r.w, h: r.h - band },
      };
    case 'left':
      return { band: { ...r, w: band }, area: { x: r.x + band, y: r.y, w: r.w - band, h: r.h } };
    default:
      return {
        band: { ...r, x: r.x + r.w - band, w: band },
        area: { x: r.x, y: r.y, w: r.w - band, h: r.h },
      };
  }
}

function drawCity(
  ctx: Ctx,
  r: Px,
  side: BandSide,
  ppu: number,
  name: string,
  price: number,
  group: GroupId,
): void {
  paper(ctx, r, ppu);
  const { band, area } = splitBand(r, side, BAND * ppu);
  const color = GROUP_COLOR[group];
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, ppu * 0.035);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(band.x, band.y, band.w, band.h);
  // A soft highlight and a crisp ink line where the band meets the paper.
  const hl = ctx.createLinearGradient(band.x, band.y, band.x, band.y + band.h);
  hl.addColorStop(0, 'rgba(255,255,255,0.22)');
  hl.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = hl;
  ctx.fillRect(band.x, band.y, band.w, band.h);
  ctx.fillStyle = 'rgba(30,31,36,0.85)';
  const line = ppu * 0.018;
  if (side === 'top') ctx.fillRect(band.x, band.y + band.h - line / 2, band.w, line);
  if (side === 'bottom') ctx.fillRect(band.x, band.y - line / 2, band.w, line);
  if (side === 'left') ctx.fillRect(band.x + band.w - line / 2, band.y, line, band.h);
  if (side === 'right') ctx.fillRect(band.x - line / 2, band.y, line, band.h);
  ctx.restore();
  const pad = ppu * 0.06;
  const maxW = area.w - pad * 2;
  const cx = area.x + area.w / 2;
  const vertical = side === 'top' || side === 'bottom';
  const nameY = area.y + area.h * (vertical ? 0.4 : 0.4);
  const priceY = area.y + area.h * (vertical ? 0.8 : 0.76);
  nameBlock(ctx, name, cx, nameY, maxW, ppu * 0.235);
  ctx.fillStyle = TEXT_2;
  centered(ctx, rp(price), cx, priceY, maxW, ppu * 0.15, 800, UI);
}

/** Horizontal special tile: icon on the outer end, words towards the centre. */
function drawSpecial(
  ctx: Ctx,
  r: Px,
  side: BandSide,
  ppu: number,
  name: string,
  note: string,
  icon: (cx: number, cy: number, s: number) => void,
  bg: [string, string],
): void {
  paper(ctx, r, ppu, bg[0], bg[1]);
  const vertical = side === 'top' || side === 'bottom';
  if (vertical) {
    const cx = r.x + r.w / 2;
    const top = side === 'top';
    // The name sits next to the board centre, the note at the outer end.
    const nameY = r.y + r.h * (top ? 0.2 : 0.8);
    const iconY = r.y + r.h * 0.5;
    const noteY = r.y + r.h * (top ? 0.84 : 0.16);
    ctx.fillStyle = INK;
    centered(ctx, name.toUpperCase(), cx, nameY, r.w - ppu * 0.12, ppu * 0.22);
    icon(cx, iconY, ppu * 0.46);
    ctx.fillStyle = TEXT_2;
    centered(ctx, note, cx, noteY, r.w - ppu * 0.12, ppu * 0.12, 700, UI);
    return;
  }
  const outerLeft = side === 'left';
  const iconX = outerLeft ? r.x + r.w - ppu * 0.33 : r.x + ppu * 0.33;
  const textW = r.w - ppu * 0.7;
  const textX = outerLeft ? r.x + ppu * 0.05 + textW / 2 : r.x + ppu * 0.65 + textW / 2;
  icon(iconX, r.y + r.h * 0.5, ppu * 0.4);
  nameBlock(ctx, name, textX, r.y + r.h * 0.38, textW, ppu * 0.2);
  ctx.fillStyle = TEXT_2;
  centered(ctx, note, textX, r.y + r.h * 0.76, textW, ppu * 0.13, 800, UI);
}

function stripes(ctx: Ctx, r: Px, w: number, a: string, b: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = b;
  for (let k = -r.h; k < r.w + r.h; k += w * 2) {
    ctx.beginPath();
    ctx.moveTo(r.x + k, r.y);
    ctx.lineTo(r.x + k + w, r.y);
    ctx.lineTo(r.x + k + w - r.h, r.y + r.h);
    ctx.lineTo(r.x + k - r.h, r.y + r.h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawCorner(ctx: Ctx, i: number, r: Px, ppu: number): void {
  const t = TILES[i]!;
  if (t.kind !== 'corner') return;
  const u = ppu;
  const cx = r.x + r.w / 2;
  switch (t.key) {
    case 'start': {
      paper(ctx, r, u, '#FFD54A', '#FFC21A');
      ctx.save();
      rr(ctx, r.x, r.y, r.w, r.h, u * 0.035);
      ctx.clip();
      // Sun rays from the corner.
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let k = 0; k < 9; k++) {
        const a0 = -Math.PI / 2 + (k * Math.PI) / 9;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y + r.h);
        ctx.lineTo(r.x + Math.cos(a0) * r.w * 2, r.y + r.h + Math.sin(a0) * r.h * 2);
        ctx.lineTo(r.x + Math.cos(a0 + 0.17) * r.w * 2, r.y + r.h + Math.sin(a0 + 0.17) * r.h * 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = INK;
      centered(ctx, CORNER_NAME.start.toUpperCase(), cx, r.y + u * 0.3, r.w - u * 0.2, u * 0.34);
      banknote(ctx, cx - u * 0.14, r.y + u * 0.72, u * 0.4, -0.18);
      banknote(ctx, cx + u * 0.16, r.y + u * 0.66, u * 0.4, 0.12);
      ctx.fillStyle = TEXT_2;
      centered(ctx, CORNER_NOTE.start, cx, r.y + u * 1.06, r.w - u * 0.16, u * 0.13, 800, UI);
      arrow(ctx, r.x + u * 0.22, r.y + u * 1.3, r.x + r.w - u * 0.12, u * 0.36, '#C2410C');
      return;
    }
    case 'tilang': {
      paper(ctx, r, u);
      // The ticket box in the inner quadrant (towards the board centre: left and up here).
      const box: Px = { x: r.x + u * 0.07, y: r.y + u * 0.07, w: u * 0.7, h: u * 0.7 };
      stripes(ctx, box, u * 0.07, '#FFFFFF', '#FF7A1A');
      ctx.fillStyle = '#FFF4E4';
      rr(ctx, box.x + u * 0.07, box.y + u * 0.07, box.w - u * 0.14, box.h - u * 0.14, u * 0.03);
      ctx.fill();
      ctx.fillStyle = '#C2410C';
      centered(
        ctx,
        STR.jailedBadge,
        box.x + box.w / 2,
        box.y + box.h / 2,
        box.w - u * 0.2,
        u * 0.12,
        800,
        UI,
      );
      cone(ctx, r.x + u * 1.12, r.y + u * 0.44, u * 0.46);
      ctx.fillStyle = INK;
      centered(ctx, CORNER_NAME.tilang.toUpperCase(), cx, r.y + u * 1.02, r.w - u * 0.16, u * 0.25);
      ctx.fillStyle = TEXT_2;
      centered(ctx, CORNER_NOTE.tilang, cx, r.y + u * 1.3, r.w - u * 0.2, u * 0.13, 800, UI);
      return;
    }
    case 'rehat': {
      paper(ctx, r, u, '#F6E6CC', '#EBD3AE');
      ctx.fillStyle = INK;
      centered(ctx, CORNER_NAME.rehat.toUpperCase(), cx, r.y + u * 0.26, r.w - u * 0.2, u * 0.27);
      cup(ctx, cx, r.y + u * 0.8, u * 0.52);
      ctx.fillStyle = TEXT_2;
      centered(ctx, CORNER_NOTE.rehat, cx, r.y + u * 1.3, r.w - u * 0.2, u * 0.13, 800, UI);
      return;
    }
    case 'razia': {
      paper(ctx, r, u, '#FBE3DA', '#F4CDBF');
      stripes(
        ctx,
        { x: r.x + u * 0.06, y: r.y + u * 1.35, w: r.w - u * 0.12, h: u * 0.08 },
        u * 0.08,
        '#FFFFFF',
        '#2456A6',
      );
      ctx.fillStyle = '#C92D25';
      centered(ctx, CORNER_NAME.razia.toUpperCase(), cx, r.y + u * 0.27, r.w - u * 0.2, u * 0.34);
      siren(ctx, cx, r.y + u * 0.78, u * 0.5);
      ctx.fillStyle = TEXT_2;
      centered(ctx, CORNER_NOTE.razia, cx, r.y + u * 1.18, r.w - u * 0.2, u * 0.13, 800, UI);
      return;
    }
  }
}

/* ------------------------------------------------------------------ centre */

function mapProject(ll: LonLat, box: Px): [number, number] {
  const b = MAP_BOUNDS;
  return [
    box.x + ((ll[0] - b.west) / (b.east - b.west)) * box.w,
    box.y + ((b.north - ll[1]) / (b.north - b.south)) * box.h,
  ];
}

/** A closed outline through the points with softened corners. */
function smoothShape(ctx: Ctx, pts: [number, number][]): void {
  const n = pts.length;
  ctx.beginPath();
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const start = mid(pts[n - 1]!, pts[0]!);
  ctx.moveTo(start[0], start[1]);
  for (let k = 0; k < n; k++) {
    const p = pts[k]!;
    const m = mid(p, pts[(k + 1) % n]!);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

function compass(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(248,238,218,0.45)';
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = k % 2 ? 'rgba(248,238,218,0.55)' : 'rgba(233,180,60,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.8);
    ctx.lineTo(s * 0.13, 0);
    ctx.lineTo(-s * 0.13, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(248,238,218,0.85)';
  ctx.font = `800 ${s * 0.3}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('U', cx, cy - s * 1.0);
}

function drawCentre(ctx: Ctx, X: (x: number) => number, Y: (z: number) => number, ppu: number): void {
  const inner = HALF - 1.5 - GAP / 2;
  const x0 = X(-inner);
  const y0 = Y(-inner);
  const w = X(inner) - x0;
  // The sea.
  const g = ctx.createRadialGradient(X(0), Y(0.2), w * 0.1, X(0), Y(0), w * 0.75);
  g.addColorStop(0, SEA);
  g.addColorStop(1, SEA_DEEP);
  ctx.fillStyle = g;
  rr(ctx, x0, y0, w, w, ppu * 0.05);
  ctx.fill();
  // Gentle wave marks.
  ctx.save();
  rr(ctx, x0, y0, w, w, ppu * 0.05);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = ppu * 0.018;
  ctx.lineCap = 'round';
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < 70; k++) {
    const wx = x0 + rnd() * w;
    const wy = y0 + rnd() * w;
    const s = ppu * (0.08 + rnd() * 0.06);
    ctx.beginPath();
    ctx.moveTo(wx - s, wy);
    ctx.quadraticCurveTo(wx - s / 2, wy - s * 0.5, wx, wy);
    ctx.quadraticCurveTo(wx + s / 2, wy - s * 0.5, wx + s, wy);
    ctx.stroke();
  }
  ctx.restore();
  // Title and tagline.
  ctx.save();
  ctx.lineJoin = 'round';
  const titleY = Y(-1.98);
  ctx.font = `800 ${ppu * 0.44}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const title = STR.title;
  const tw = ctx.measureText(title).width;
  const scale = Math.min(1, (w * 0.9) / tw);
  ctx.font = `800 ${ppu * 0.44 * scale}px ${DISPLAY}`;
  ctx.lineWidth = ppu * 0.09;
  ctx.strokeStyle = '#08262E';
  ctx.strokeText(title, X(0), titleY + ppu * 0.03);
  ctx.fillStyle = '#08262E';
  ctx.fillText(title, X(0), titleY + ppu * 0.05);
  ctx.fillStyle = '#FFC928';
  ctx.fillText(title, X(0), titleY);
  ctx.restore();
  ctx.fillStyle = 'rgba(248,238,218,0.9)';
  centered(ctx, STR.boardTag, X(0), Y(-1.56), w * 0.8, ppu * 0.15, 700, UI);
  // The map.
  const box: Px = { x: X(-2.32), y: Y(-1.28), w: X(2.32) - X(-2.32), h: 0 };
  const b = MAP_BOUNDS;
  box.h = (box.w * (b.north - b.south)) / (b.east - b.west);
  for (const isl of ISLANDS) {
    const pts = isl.points.map((p) => mapProject(p, box));
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = ppu * 0.05;
    ctx.shadowOffsetY = ppu * 0.025;
    smoothShape(ctx, pts);
    ctx.fillStyle = GROUP_COLOR[isl.group];
    ctx.fill();
    ctx.restore();
    smoothShape(ctx, pts);
    ctx.strokeStyle = 'rgba(248,238,218,0.85)';
    ctx.lineWidth = ppu * 0.016;
    ctx.stroke();
  }
  // City dots.
  for (const ll of Object.values(CITY_LONLAT)) {
    const [px, py] = mapProject(ll, box);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = ppu * 0.014;
    ctx.beginPath();
    ctx.arc(px, py, ppu * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  compass(ctx, X(-2.0), Y(0.55), ppu * 0.2);
  // Spots for the bank's coins, the Kabar deck and the dice.
  const label = (text: string, x: number, z: number) => {
    ctx.fillStyle = 'rgba(248,238,218,0.85)';
    centered(ctx, text, X(x), Y(z), ppu * 1.2, ppu * 0.15, 800, UI);
  };
  ctx.setLineDash([ppu * 0.05, ppu * 0.04]);
  ctx.strokeStyle = 'rgba(248,238,218,0.55)';
  ctx.lineWidth = ppu * 0.02;
  ctx.beginPath();
  ctx.arc(X(BANK_SPOT[0]), Y(BANK_SPOT[1]), ppu * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  rr(ctx, X(DECK_SPOT[0] - 0.55), Y(DECK_SPOT[1] - 0.7), ppu * 1.1, ppu * 1.4, ppu * 0.08);
  ctx.stroke();
  ctx.setLineDash([]);
  label(STR.boardBank, BANK_SPOT[0], BANK_SPOT[1] + 0.68);
  label(STR.boardKabar, DECK_SPOT[0], DECK_SPOT[1] + 0.86);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(X(DICE_SPOT[0]), Y(DICE_SPOT[1]), ppu * 0.78, ppu * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------------ board */

/** The whole print, `size` px square, covering the base from -BASE_HALF to BASE_HALF. */
export function drawBoardPrint(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const ppu = size / (BASE_HALF * 2);
  const X = (x: number) => (x + BASE_HALF) * ppu;
  const Y = (z: number) => (z + BASE_HALF) * ppu;
  // Rim and grooves.
  ctx.fillStyle = RIM;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#123E49';
  ctx.fillRect(X(-HALF), Y(-HALF), X(HALF) - X(-HALF), Y(HALF) - Y(-HALF));
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = ppu * 0.025;
  rr(ctx, X(-HALF - 0.1), Y(-HALF - 0.1), ppu * (HALF * 2 + 0.2), ppu * (HALF * 2 + 0.2), ppu * 0.06);
  ctx.stroke();
  drawCentre(ctx, X, Y, ppu);
  for (let i = 0; i < TILES.length; i++) {
    const r = tileRect(i);
    const px: Px = {
      x: X(r.cx - r.w / 2 + GAP / 2),
      y: Y(r.cz - r.d / 2 + GAP / 2),
      w: (r.w - GAP) * ppu,
      h: (r.d - GAP) * ppu,
    };
    const side = BAND_SIDE[r.side]!;
    const t = TILES[i]!;
    if (isCorner(i)) {
      drawCorner(ctx, i, px, ppu);
      continue;
    }
    switch (t.kind) {
      case 'city':
        drawCity(ctx, px, side, ppu, CITY_NAME[t.key], t.price, t.group);
        break;
      case 'transport':
        drawSpecial(
          ctx,
          px,
          side,
          ppu,
          TRANSPORT_NAME[t.key],
          rp(t.price),
          (x, y, s) => (t.key === 'pelabuhan' ? ship(ctx, x, y, s) : plane(ctx, x, y, s)),
          ['#F4F7F8', '#E1EAEE'],
        );
        break;
      case 'kabar':
        drawSpecial(ctx, px, side, ppu, KABAR_NAME, KABAR_NOTE, (x, y, s) => newspaper(ctx, x, y, s), [
          '#FFE9A8',
          '#FFD970',
        ]);
        break;
      case 'tax':
        drawSpecial(
          ctx,
          px,
          side,
          ppu,
          TAX_NAME[t.key],
          TAX_NOTE[t.key],
          (x, y, s) => receipt(ctx, x, y, s),
          ['#F7E4DA', '#EFD2C3'],
        );
        break;
      case 'corner':
        break;
    }
  }
  // Fine paper grain over everything.
  const grain = document.createElement('canvas');
  grain.width = 128;
  grain.height = 128;
  const gctx = grain.getContext('2d');
  if (gctx) {
    const img = gctx.createImageData(128, 128);
    let s = 7;
    for (let k = 0; k < img.data.length; k += 4) {
      s = (s * 16807) % 2147483647;
      const v = s % 255;
      img.data[k] = v;
      img.data[k + 1] = v;
      img.data[k + 2] = v;
      img.data[k + 3] = 10;
    }
    gctx.putImageData(img, 0, 0);
    const pattern = ctx.createPattern(grain, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, size, size);
    }
  }
  return canvas;
}
