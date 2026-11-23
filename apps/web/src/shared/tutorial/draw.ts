/**
 * Building blocks for tutorial scenes: a 640x360 SVG stage and small animated pieces. Animations
 * are CSS classes (`tu-*`, screen/tutorial/tutorial.css) on SVG groups, driven by custom properties,
 * so they stay light on Smart TVs: transforms and opacity only, no filters.
 */
import type { Fruit } from '@hoorah/protocol';
import { type Face, fruitMarkup } from '../art/fruits';

export const W = 640;
export const H = 360;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v: number) => Math.round(v * 10) / 10;

/** The stage: a background colour (or gradient-free fill) and the scene body. */
export function scene(bg: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`;
}

/** A fruit avatar centred at (x, y), `size` px tall. */
export function fruit(f: Fruit, x: number, y: number, size = 64, face: Face = 'happy'): string {
  const s = size / 64;
  return `<g transform="translate(${n(x - size / 2)} ${n(y - size / 2)}) scale(${n(s * 100) / 100})">${fruitMarkup(f, face)}</g>`;
}

export function box(x: number, y: number, w: number, h: number, fill: string, rx = 8, extra = ''): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

export function circle(cx: number, cy: number, r: number, fill: string, extra = ''): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

/** Text; `anchor` start | middle | end. */
export function label(
  text: string,
  x: number,
  y: number,
  o: { size?: number; color?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number } = {},
): string {
  return `<text x="${n(x)}" y="${n(y)}" font-family="'Baloo 2', 'Plus Jakarta Sans', sans-serif" font-size="${o.size ?? 22}" font-weight="${o.weight ?? 800}" fill="${o.color ?? '#FFFFFF'}" text-anchor="${o.anchor ?? 'middle'}">${esc(text)}</text>`;
}

/**
 * An arrow from (x1, y1) to (x2, y2) whose dashes flow toward the head. `bend` curves it
 * (positive bends to the left of the direction of travel).
 */
export function arrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: { color?: string; bend?: number; width?: number } = {},
): string {
  const color = o.color ?? '#FFC928';
  const w = o.width ?? 6;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bend = o.bend ?? 0;
  const cx = mx - (dy / len) * bend;
  const cy = my + (dx / len) * bend;
  // Head direction: from the control point to the tip.
  const hx = x2 - cx;
  const hy = y2 - cy;
  const hl = Math.hypot(hx, hy) || 1;
  const ux = hx / hl;
  const uy = hy / hl;
  const s = w * 2.6;
  const p1 = `${n(x2 - ux * s - uy * s * 0.7)},${n(y2 - uy * s + ux * s * 0.7)}`;
  const p2 = `${n(x2 - ux * s + uy * s * 0.7)},${n(y2 - uy * s - ux * s * 0.7)}`;
  return `<g class="tu-arrow"><path d="M${n(x1)} ${n(y1)} Q${n(cx)} ${n(cy)} ${n(x2 - ux * s * 0.6)} ${n(y2 - uy * s * 0.6)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${w * 2} ${w * 1.6}"/><polygon points="${n(x2)},${n(y2)} ${p1} ${p2}" fill="${color}"/></g>`;
}

/** Moves `body` by (dx, dy) and back, forever. `dur` s, `delay` s. */
export function move(body: string, dx: number, dy: number, dur = 2.4, delay = 0): string {
  return `<g class="tu-move" style="--dx:${n(dx)}px;--dy:${n(dy)}px;--dur:${dur}s;--delay:${delay}s">${body}</g>`;
}

/** Moves `body` by (dx, dy) once per loop, then jumps back (a one-way trip that repeats). */
export function slide(body: string, dx: number, dy: number, dur = 2.4, delay = 0): string {
  return `<g class="tu-slide" style="--dx:${n(dx)}px;--dy:${n(dy)}px;--dur:${dur}s;--delay:${delay}s">${body}</g>`;
}

/** A hop: up by `height` and down, forever. */
export function hop(body: string, height = 40, dur = 1.2, delay = 0): string {
  return `<g class="tu-hop" style="--dy:${n(-height)}px;--dur:${dur}s;--delay:${delay}s">${body}</g>`;
}

/** Gentle up-down float. */
export function bob(body: string, dur = 2, delay = 0): string {
  return `<g class="tu-bob" style="--dur:${dur}s;--delay:${delay}s">${body}</g>`;
}

/** Grows and shrinks around (cx, cy). */
export function pulse(body: string, cx: number, cy: number, dur = 1.2, delay = 0): string {
  return `<g class="tu-pulse" style="transform-origin:${n(cx)}px ${n(cy)}px;--dur:${dur}s;--delay:${delay}s">${body}</g>`;
}

/** Spins around (cx, cy). */
export function spin(body: string, cx: number, cy: number, dur = 3): string {
  return `<g class="tu-spin" style="transform-origin:${n(cx)}px ${n(cy)}px;--dur:${dur}s">${body}</g>`;
}

/** Appears after `delay` s within each `dur` s loop, then fades (for "then this happens"). */
export function appear(body: string, delay: number, dur = 3): string {
  return `<g class="tu-appear" style="--dur:${dur}s;--delay:${delay}s">${body}</g>`;
}

/** Wiggles left-right (shaking, trembling). */
export function shake(body: string, cx: number, cy: number, dur = 0.5): string {
  return `<g class="tu-shake" style="transform-origin:${n(cx)}px ${n(cy)}px;--dur:${dur}s">${body}</g>`;
}

/** A tap marker: a ring that pops at (x, y). */
export function tap(x: number, y: number, color = '#FFFFFF', delay = 0): string {
  return `<g class="tu-tap" style="transform-origin:${n(x)}px ${n(y)}px;--delay:${delay}s"><circle cx="${n(x)}" cy="${n(y)}" r="18" fill="none" stroke="${color}" stroke-width="5"/></g>`;
}

/** A tick (green) or cross (red) badge, for "do this" / "not this". */
export function mark(ok: boolean, x: number, y: number, r = 20): string {
  const bg = ok ? '#22B35E' : '#F2453D';
  const icon = ok
    ? `<path d="M${n(x - r * 0.45)} ${n(y)} L${n(x - r * 0.1)} ${n(y + r * 0.38)} L${n(x + r * 0.5)} ${n(y - r * 0.4)}" fill="none" stroke="#fff" stroke-width="${n(r * 0.24)}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${n(x - r * 0.38)} ${n(y - r * 0.38)} L${n(x + r * 0.38)} ${n(y + r * 0.38)} M${n(x + r * 0.38)} ${n(y - r * 0.38)} L${n(x - r * 0.38)} ${n(y + r * 0.38)}" fill="none" stroke="#fff" stroke-width="${n(r * 0.24)}" stroke-linecap="round"/>`;
  return `${circle(x, y, r, bg)}${icon}`;
}

/** A speech bubble with text above (x, y). */
export function bubble(
  text: string,
  x: number,
  y: number,
  o: { w?: number; fill?: string; color?: string } = {},
): string {
  const w = o.w ?? Math.max(80, text.length * 12 + 28);
  const h = 44;
  const fill = o.fill ?? '#FFFFFF';
  return `<g>${box(x - w / 2, y - h - 14, w, h, fill, 14)}<polygon points="${n(x - 10)},${n(y - 15)} ${n(x + 10)},${n(y - 15)} ${n(x)},${n(y)}" fill="${fill}"/>${label(text, x, y - 28, { size: 20, color: o.color ?? '#111214' })}</g>`;
}
