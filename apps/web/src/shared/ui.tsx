import type { Fruit } from '@hoorah/protocol';
import type { JSX } from 'preact';
import { type Face, fruitMarkup } from './art/fruits';

/* ------------------------------------------------------------------ Logo */

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Hoorah">
      <rect width="120" height="120" rx="30" fill="#FF5A1F" />
      <rect x="28" y="24" width="18" height="72" rx="9" fill="#FFF7F0" />
      <rect x="74" y="24" width="18" height="72" rx="9" fill="#FFF7F0" />
      <path d="M37 56 Q60 80 83 56" fill="none" stroke="#FFF7F0" stroke-width="14" stroke-linecap="round" />
      <circle cx="100" cy="20" r="7" fill="#FFC928" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28 }}>
      <LogoMark size={size} />
      <span class="display" style={{ fontSize: size * 0.88, letterSpacing: '-0.03em' }}>
        hoorah
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ Avatar */

interface AvatarProps {
  fruit: Fruit;
  ring: string;
  size: number;
  face?: Face;
  dim?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}

export function Avatar({ fruit, ring, size, face = 'happy', dim, class: cls, style }: AvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Avatar ${fruit}`}
      class={cls}
      style={{ flex: 'none', opacity: dim ? 0.45 : 1, ...style }}
    >
      <circle cx="32" cy="32" r="30" fill="#2A2B30" stroke={ring} stroke-width="3.5" />
      <g
        transform="translate(6.4 6.4) scale(0.8)"
        dangerouslySetInnerHTML={{ __html: fruitMarkup(fruit, face) }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ Icons */

const ICONS = {
  play: 'M7 4 L20 12 L7 20 Z',
  back: 'M15 5 L8 12 L15 19',
  users:
    'M9 11 a3.5 3.5 0 1 0 0 -7 a3.5 3.5 0 1 0 0 7 M2.5 20 c0 -3.6 2.9 -6 6.5 -6 s6.5 2.4 6.5 6 M16 4.3 a3.5 3.5 0 0 1 0 6.4 M18 14.3 c2 0.7 3.5 2.6 3.5 5.7',
  clock: 'M12 21 a9 9 0 1 0 0 -18 a9 9 0 1 0 0 18 M12 7 V12 L15 14',
  tap: 'M9 11 V5.5 a1.5 1.5 0 0 1 3 0 V11 M12 10 a1.5 1.5 0 0 1 3 0 V12 M15 11 a1.5 1.5 0 0 1 3 0 V15 c0 3.3 -2.7 6 -6 6 h-1 c-2 0 -3.6 -1 -4.6 -2.7 L4 15 a1.5 1.5 0 0 1 2.5 -1.6 L9 16',
  check: 'M4 12 L10 18 L20 6',
  lock: 'M5 11 h14 v10 h-14Z M8 11 V7 a4 4 0 0 1 8 0 V11',
  crown: 'M3 18 L5 7 L10 12 L12 5 L14 12 L19 7 L21 18 Z',
  mic: 'M9 3 h6 v11 a3 3 0 0 1 -6 0Z M5 11 a7 7 0 0 0 14 0 M12 18 V21',
  sliders: 'M4 7 H14 M18 7 H20 M4 17 H8 M12 17 H20 M16 5 v4 M10 15 v4',
  volume: 'M4 9 H8 L13 5 V19 L8 15 H4 Z M17 9 a4 4 0 0 1 0 6',
  mute: 'M4 9 H8 L13 5 V19 L8 15 H4 Z M17 9 L22 14 M22 9 L17 14',
  star: 'M12 2 L14.9 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2 9.3 L9.1 8.6 Z',
  zap: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z',
  fire: 'M12 22 c4 0 7 -3 7 -7 c0 -4 -3 -6 -4 -10 c-2 2 -3 4 -3 6 c-1 -1 -2 -2 -2 -4 c-3 2 -5 5 -5 8 c0 4 3 7 7 7Z',
  heart:
    'M12 21 C5 15.5 2 12 2 8.2 C2 5.3 4.3 3 7.1 3 C9 3 10.9 4.1 12 5.8 C13.1 4.1 15 3 16.9 3 C19.7 3 22 5.3 22 8.2 C22 12 19 15.5 12 21 Z',
  target: 'M12 21 a9 9 0 1 0 0 -18 a9 9 0 1 0 0 18 M12 16 a4 4 0 1 0 0 -8 a4 4 0 1 0 0 8 M12 12 h0.01',
  brain:
    'M9 4 a3 3 0 0 0 -3 3 a3 3 0 0 0 -2 5 a3 3 0 0 0 2 5 a3 3 0 0 0 3 3 V4 M15 4 a3 3 0 0 1 3 3 a3 3 0 0 1 2 5 a3 3 0 0 1 -2 5 a3 3 0 0 1 -3 3 V4',
  build: 'M4 21 V9 L12 3 L20 9 V21 Z M9 21 V14 H15 V21',
  plus: 'M12 5 V19 M5 12 H19',
  wifi: 'M2 8 a15 15 0 0 1 20 0 M5 12 a10 10 0 0 1 14 0 M8.5 15.5 a5 5 0 0 1 7 0 M12 19 h0.01',
  scan: 'M4 8 V5 a1 1 0 0 1 1 -1 H8 M16 4 H19 a1 1 0 0 1 1 1 V8 M20 16 V19 a1 1 0 0 1 -1 1 H16 M8 20 H5 a1 1 0 0 1 -1 -1 V16 M8 12 H16',
  smile: 'M12 20 a8 8 0 1 0 0 -16 a8 8 0 1 0 0 16 M9 10 V10.5 M15 10 V10.5 M9 14.5 Q12 17 15 14.5',
  tv: 'M3 5 H21 V16 H3Z M8 20 H16 M12 16 V20',
  down: 'M12 4 V18 M6 12 L12 18 L18 12',
  wind: 'M3 8 H15 a3 3 0 1 0 -3 -3 M3 12 H19 a3 3 0 1 1 -3 3 M3 16 H10',
  expand: 'M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15',
  compress: 'M9 4 V9 H4 M20 9 H15 V4 M15 20 V15 H20 M4 15 H9 V20',
  left: 'M15 4 L7 12 L15 20',
  right: 'M9 4 L17 12 L9 20',
  up: 'M12 20 V6 M6 12 L12 6 L18 12',
  drift: 'M4 17 C8 17 9 7 14 7 H20 M16 3 L20 7 L16 11 M4 21 H9',
  knife: 'M3 21 L13.5 10.5 L16.5 13.5 Q11 19.5 3 21 Z M15 12 L20.3 6.7 a1.5 1.5 0 0 0 -2.1 -2.1 L13 9.8',
  spoon: 'M14.5 9.5 a4 5 -45 1 0 -1 -1 M13.5 10.5 L4 20',
  pan: 'M3 11 H17 a0 0 0 0 1 0 0 a7 6 0 0 1 -14 0 Z M17 11 H22 M7 7 c0 -1.5 1 -1.5 1 -3 M11 7 c0 -1.5 1 -1.5 1 -3',
  throw: 'M4 19 Q10 4 19 11 M19 11 L14.5 10.6 M19 11 L19.8 6.5',
  hand: 'M8 13 V6 a1.5 1.5 0 0 1 3 0 V11 M11 5 a1.5 1.5 0 0 1 3 0 V11 M14 6 a1.5 1.5 0 0 1 3 0 V13 c0 4.5 -2.5 8 -6.5 8 c-3 0 -4.5 -2 -6 -4.5 L3 13.5 a1.6 1.6 0 0 1 2.7 -1.6 L8 15',
  shaker: 'M8 9 H16 L15 21 H9 Z M9 9 a3 3 0 0 1 6 0 M11 5.5 h0.01 M13 5.5 h0.01 M12 3.5 h0.01',
  pestle: 'M3 12 H21 a9 8 0 0 1 -18 0 Z M14 12 L19 3',
  roll: 'M5 9 H19 V15 H5 Z M5 12 H2 M19 12 H22',
  oil: 'M12 3 C9 8 6 11 6 14.5 a6 6 0 0 0 12 0 C18 11 15 8 12 3 Z',
  horn: 'M3 10 V14 H6 L13 19 V5 L6 10 Z M16 8 L19 6 M16 12 H20 M16 16 L19 18',
  shield: 'M12 3 L20 6 V12 c0 4.5 -3.5 8 -8 9 c-4.5 -1 -8 -4.5 -8 -9 V6 Z',
  box: 'M3 7.5 L12 3 L21 7.5 V16.5 L12 21 L3 16.5 Z M3 7.5 L12 12 L21 7.5 M12 12 V21',
  pause: 'M6.5 4 H10.5 V20 H6.5 Z M13.5 4 H17.5 V20 H13.5 Z',
  vibrate: 'M8.5 4 H15.5 V20 H8.5 Z M5 8.5 V15.5 M19 8.5 V15.5 M2 10.5 V13.5 M22 10.5 V13.5',
  menu: 'M4 7 H20 M4 12 H20 M4 17 H20',
  home: 'M4 11 L12 4 L20 11 M6 9.5 V20 H18 V9.5',
  grid: 'M5 4 H10 a1 1 0 0 1 1 1 V10 a1 1 0 0 1 -1 1 H5 a1 1 0 0 1 -1 -1 V5 a1 1 0 0 1 1 -1 Z M14 4 H19 a1 1 0 0 1 1 1 V10 a1 1 0 0 1 -1 1 H14 a1 1 0 0 1 -1 -1 V5 a1 1 0 0 1 1 -1 Z M5 13 H10 a1 1 0 0 1 1 1 V19 a1 1 0 0 1 -1 1 H5 a1 1 0 0 1 -1 -1 V14 a1 1 0 0 1 1 -1 Z M14 13 H19 a1 1 0 0 1 1 1 V19 a1 1 0 0 1 -1 1 H14 a1 1 0 0 1 -1 -1 V14 a1 1 0 0 1 1 -1 Z',
  close: 'M6 6 L18 18 M18 6 L6 18',
  undo: 'M9 14 L4 9 L9 4 M4 9 H15 a5 5 0 0 1 0 10 H11',
  dpad: 'M9 3 H15 V9 H21 V15 H15 V21 H9 V15 H3 V9 H9 Z',
  rotate:
    'M7 3 H13 a2 2 0 0 1 2 2 V19 a2 2 0 0 1 -2 2 H7 a2 2 0 0 1 -2 -2 V5 a2 2 0 0 1 2 -2 Z M18 6 a6 6 0 0 1 2.5 6 M20.5 12 L22 9.8 M20.5 12 L18.3 11',
  restart: 'M4.5 12 a7.5 7.5 0 1 0 2.2 -5.3 M4 4 V9 H9',
  exit: 'M10 4 H5 V20 H10 M14 8 L18 12 L14 16 M18 12 H9',
  durian:
    'M12 19.5 a6.5 6.5 0 1 0 0 -13 a6.5 6.5 0 1 0 0 13 M12 6.5 V3.5 M16.6 8.4 L18.7 6.3 M7.4 8.4 L5.3 6.3 M18.5 13 H21 M5.5 13 H3 M16.6 17.6 L18.7 19.7 M7.4 17.6 L5.3 19.7 M12 19.5 V22 M10 11 L11 12 M14 11 L13 12',
  firecracker:
    'M7 10 H13 V21 H7 Z M7 14 H13 M10 10 C10 7 12 5.5 15 5 M17 2.5 V4 M19.5 5 H18 M18.8 2.9 L17.8 3.9',
} as const;

export type IconName = keyof typeof ICONS;
const FILLED = new Set<IconName>(['play', 'pause', 'crown', 'star', 'zap', 'fire', 'heart']);

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  stroke = 2.2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  const filled = FILLED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? color : 'none'}
      stroke={filled ? 'none' : color}
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{ flex: 'none' }}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
