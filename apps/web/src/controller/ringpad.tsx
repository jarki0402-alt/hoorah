/**
 * The Host remote's d-pad as one round pad (owner 2026-11-23): the ring is cut into four curved
 * keys (up, right, down, left) by a thin X, with OK as the orange disc in the middle. Nothing is
 * left empty: a touch anywhere in a quarter of the ring is that direction, so the pad works
 * without looking. Each key has the same 3D ledge as the other buttons and sinks while held.
 */
import type { NavKey } from '@hoorah/protocol';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { nav } from './store';

type Dir = Exclude<NavKey, 'back' | 'home' | 'menu' | 'ok'>;
type Key = Dir | 'ok';

/** Outer and inner radius of the ring, OK disc radius (viewBox units, centre at 0,0). */
const R = 96;
const RI = 44;
const OK_R = 38;
/** Depth of the 3D ledge under every key. */
const LEDGE = 5;

const DIRS: { k: Dir; label: string; from: number }[] = [
  { k: 'up', label: 'Atas', from: -45 },
  { k: 'right', label: 'Kanan', from: 45 },
  { k: 'down', label: 'Bawah', from: 135 },
  { k: 'left', label: 'Kiri', from: 225 },
];

/** Point at `deg` (0 = 12 o'clock, clockwise) and radius `r`. */
function at(deg: number, r: number): string {
  const a = (deg * Math.PI) / 180;
  return `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
}

/** A quarter of the ring from `from` to `from + 90` degrees. */
function sector(from: number): string {
  const to = from + 90;
  return `M ${at(from, RI)} L ${at(from, R)} A ${R} ${R} 0 0 1 ${at(to, R)} L ${at(to, RI)} A ${RI} ${RI} 0 0 0 ${at(from, RI)} Z`;
}

/** The chevron of a direction, drawn at the middle of its key. */
function chevron(k: Dir): string {
  const m = (R + RI) / 2;
  const s = 9;
  switch (k) {
    case 'up':
      return `M ${-s} ${-m + s / 2} L 0 ${-m - s / 2} L ${s} ${-m + s / 2}`;
    case 'down':
      return `M ${-s} ${m - s / 2} L 0 ${m + s / 2} L ${s} ${m - s / 2}`;
    case 'left':
      return `M ${-m + s / 2} ${-s} L ${-m - s / 2} 0 L ${-m + s / 2} ${s}`;
    case 'right':
      return `M ${m - s / 2} ${-s} L ${m + s / 2} 0 L ${m - s / 2} ${s}`;
  }
}

/** Which key a touch at (dx, dy) from the centre means, in viewBox units; null outside the pad. */
export function keyAt(dx: number, dy: number): Key | null {
  const d = Math.hypot(dx, dy);
  if (d > R + LEDGE + 4) return null;
  // OK takes the whole hole of the ring, a little more generous than the disc itself.
  if (d <= RI) return 'ok';
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function RingPad() {
  const [down, setDown] = useState<Key | null>(null);

  const press = (e: JSX.TargetedPointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    // viewBox is 2·(R + LEDGE + 4) wide around the centre.
    const unit = box.width / (2 * (R + LEDGE + 4));
    const key = keyAt(
      (e.clientX - (box.left + box.width / 2)) / unit,
      (e.clientY - (box.top + box.height / 2)) / unit,
    );
    if (!key) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDown(key);
    nav(key);
  };
  const release = () => setDown(null);
  const v = R + LEDGE + 4;

  return (
    <svg
      class="ring-pad"
      viewBox={`${-v} ${-v} ${2 * v} ${2 * v}`}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <title>Tombol arah</title>
      <circle r={R + LEDGE + 3} class="ring-base" />
      {DIRS.map(({ k, label, from }) => {
        const on = down === k;
        return (
          // biome-ignore lint/a11y/useSemanticElements: an SVG key of the round pad cannot be a <button>; the role and label keep it reachable for screen readers and tests.
          <g key={k} role="button" aria-label={label} class={`ring-key ${on ? 'pressed' : ''}`}>
            <path d={sector(from)} class="ring-ledge" transform={`translate(0 ${LEDGE})`} />
            <g class="ring-face" transform={on ? `translate(0 ${LEDGE - 1})` : undefined}>
              <path d={sector(from)} class="ring-fill" />
              <path d={chevron(k)} class="ring-arrow" />
            </g>
          </g>
        );
      })}
      {/* biome-ignore lint/a11y/useSemanticElements: see above, the OK disc of the same SVG pad. */}
      <g role="button" aria-label="OK" class={`ring-ok ${down === 'ok' ? 'pressed' : ''}`}>
        <circle r={OK_R} cy={LEDGE} class="ring-ok-ledge" />
        <g transform={down === 'ok' ? `translate(0 ${LEDGE - 1})` : undefined}>
          <circle r={OK_R} class="ring-ok-fill" />
          <text y="1" text-anchor="middle" dominant-baseline="central" class="ring-ok-text">
            OK
          </text>
        </g>
      </g>
    </svg>
  );
}
