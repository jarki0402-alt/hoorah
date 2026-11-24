/**
 * Small illustrations of the landing page, drawn as flat SVG in the Hoorah palette: a decorative
 * QR, the round d-pad and the device icons. All decorative (aria-hidden).
 */
import { seeded } from '../shared/art/svg';

const INK = '#111214';

/* ------------------------------------------------------------------ QR */

/** Modules per side of the decorative QR (a 21x21 grid, drawn at 0..21). */
export const QR_SIZE = 21;

let qrCache = '';

/** A QR-looking pattern (three finder squares and random modules). Decorative, it encodes nothing. */
export function qrPath(): string {
  if (qrCache) return qrCache;
  const random = seeded(482917);
  const finder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= QR_SIZE - 8 && y < 8) || (x < 8 && y >= QR_SIZE - 8);
  let d = '';
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      if (!finder(x, y) && random() < 0.48) d += `M${x} ${y}h1v1h-1Z`;
    }
  }
  for (const [x, y] of [
    [0, 0],
    [QR_SIZE - 7, 0],
    [0, QR_SIZE - 7],
  ] as const) {
    d += `M${x} ${y}h7v7h-7Z M${x + 1} ${y + 1}v5h5v-5Z M${x + 2} ${y + 2}h3v3h-3Z`;
  }
  qrCache = d;
  return d;
}

export function FakeQr({ class: cls }: { class?: string }) {
  return (
    <svg class={cls} viewBox="-2 -2 25 25" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
      <rect x="-2" y="-2" width="25" height="25" rx="2" fill="#fff" />
      <path d={qrPath()} fill={INK} fill-rule="evenodd" />
    </svg>
  );
}

/* ------------------------------------------------------------------ d-pad */

/** The round d-pad of a phone controller; the OK button in the middle is the lit one. */
export function DPad({ label, class: cls }: { label: string; class?: string }) {
  const arrow = 'M50 13 L59 25 H41 Z';
  return (
    <svg class={cls} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="47" fill="#2A2B30" stroke={INK} stroke-width="4" />
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d={arrow} fill="#DADCE0" transform={`rotate(${a} 50 50)`} />
      ))}
      <circle class="lp-ok" cx="50" cy="50" r="19" fill="#FF5A1F" stroke={INK} stroke-width="4" />
      <text
        x="50"
        y="51"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="Baloo 2, ui-rounded, system-ui, sans-serif"
        font-weight="800"
        font-size="15"
        fill={INK}
      >
        {label}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ devices */

export type DeviceId = 'pc' | 'laptop' | 'tablet' | 'smarttv' | 'phone';

const DEVICE_PATHS: Record<DeviceId, string> = {
  pc: 'M3 4 H21 V15 H3 Z M8 20 H16 M12 15 V20',
  laptop: 'M5 5 H19 V15 H5 Z M2 18.5 H22',
  tablet:
    'M6.5 3 H17.5 a1.5 1.5 0 0 1 1.5 1.5 V19.5 a1.5 1.5 0 0 1 -1.5 1.5 H6.5 a1.5 1.5 0 0 1 -1.5 -1.5 V4.5 a1.5 1.5 0 0 1 1.5 -1.5 Z M11 18 H13',
  smarttv: 'M2 5 H22 V17 H2 Z M7 21 L9 17 M17 21 L15 17',
  phone:
    'M8.5 2 H15.5 a1.5 1.5 0 0 1 1.5 1.5 V20.5 a1.5 1.5 0 0 1 -1.5 1.5 H8.5 a1.5 1.5 0 0 1 -1.5 -1.5 V3.5 a1.5 1.5 0 0 1 1.5 -1.5 Z M11 19 H13',
};

export function DeviceIcon({ id, size }: { id: DeviceId; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={DEVICE_PATHS[id]} />
    </svg>
  );
}
