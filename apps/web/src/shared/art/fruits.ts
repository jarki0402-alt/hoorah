import type { Fruit } from '@hoorah/protocol';

/** Fruit heads on a 64x64 grid. Layers are drawn back to front; `face` is where the face is centered. */
interface FruitArt {
  back?: [string, string];
  body: [string, string];
  detail?: [string, string];
  leaf?: [string, string];
  face: [number, number];
}

const SPIKES =
  'M32 8 L36 14 L43 10 L44 18 L52 17 L49 24 L56 28 L50 33 L56 39 L49 42 L52 50 L44 49 L43 57 L36 53 L32 60 L28 53 L21 57 L20 49 L12 50 L15 42 L8 39 L14 33 L8 28 L15 24 L12 17 L20 18 L21 10 L28 14 Z';
const BALL = 'M13 34a19 19 0 1 0 38 0a19 19 0 1 0 -38 0Z';

export const FRUIT_ART: Record<Fruit, FruitArt> = {
  jeruk: {
    body: ['M10 36a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z', '#FF9A1F'],
    detail: [
      'M31 15 h2 v-6 h-2Z M18 28a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0Z M44 46a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0Z',
      '#7A4A1E',
    ],
    leaf: ['M33 13 C35 5 43 4 47 7 C43 12 38 14 33 13Z', '#2E9E4F'],
    face: [32, 38],
  },
  semangka: {
    back: ['M4 22 H60 A28 28 0 0 1 4 22Z', '#1E9E50'],
    body: ['M9 22 H55 A23 23 0 0 1 9 22Z', '#F2453D'],
    detail: [
      'M16 27a1.4 2.2 0 1 0 2.8 0a1.4 2.2 0 1 0 -2.8 0Z M45 27a1.4 2.2 0 1 0 2.8 0a1.4 2.2 0 1 0 -2.8 0Z M30.6 40a1.4 2.2 0 1 0 2.8 0a1.4 2.2 0 1 0 -2.8 0Z',
      '#111214',
    ],
    face: [32, 30],
  },
  alpukat: {
    back: ['M32 6 C44 6 52 24 52 38 C52 52 43 60 32 60 C21 60 12 52 12 38 C12 24 20 6 32 6Z', '#3E7D27'],
    body: ['M32 11 C42 11 47 26 47 38 C47 50 40 55 32 55 C24 55 17 50 17 38 C17 26 22 11 32 11Z', '#D4E88A'],
    detail: ['M25 44a7 7 0 1 0 14 0a7 7 0 1 0 -14 0Z', '#9A6232'],
    face: [32, 28],
  },
  mangga: {
    body: ['M12 34 C12 18 27 10 40 12 C53 14 57 28 53 40 C49 54 34 60 24 55 C16 51 12 43 12 34Z', '#FFB21E'],
    detail: ['M45 18 C51 22 53 30 51 37 C49 30 47 24 45 18Z', '#FF7A1A'],
    leaf: ['M38 12 C40 4 50 2 54 6 C50 11 44 13 38 12Z', '#2E9E4F'],
    face: [32, 36],
  },
  nanas: {
    leaf: ['M32 23 L22 6 L29 12 L32 2 L35 12 L42 6 Z', '#2E9E4F'],
    body: ['M14 41a18 19 0 1 0 36 0a18 19 0 1 0 -36 0Z', '#F5B700'],
    detail: [
      'M21 29 l3 3 l-3 3 l-3 -3Z M43 29 l3 3 l-3 3 l-3 -3Z M32 52 l3 3 l-3 3 l-3 -3Z M21 49 l3 3 l-3 3 l-3 -3Z M43 49 l3 3 l-3 3 l-3 -3Z',
      '#B97F00',
    ],
    face: [32, 41],
  },
  durian: {
    back: [SPIKES, '#7FA82E'],
    body: [BALL, '#B5D152'],
    detail: ['M31 9 V3 h2 V9Z', '#6B4423'],
    face: [32, 36],
  },
  stroberi: {
    body: ['M32 58 C18 50 10 38 12 26 C14 18 22 16 32 18 C42 16 50 18 52 26 C54 38 46 50 32 58Z', '#F2453D'],
    detail: [
      'M19 31a1 1.6 0 1 0 2 0a1 1.6 0 1 0 -2 0Z M43 31a1 1.6 0 1 0 2 0a1 1.6 0 1 0 -2 0Z M25 46a1 1.6 0 1 0 2 0a1 1.6 0 1 0 -2 0Z M37 46a1 1.6 0 1 0 2 0a1 1.6 0 1 0 -2 0Z M31 52a1 1.6 0 1 0 2 0a1 1.6 0 1 0 -2 0Z',
      '#FFD43B',
    ],
    leaf: ['M20 20 L26 12 L30 17 L32 10 L34 17 L38 12 L44 20 L36 21 L32 24 L28 21 Z', '#2E9E4F'],
    face: [32, 35],
  },
  rambutan: {
    back: [SPIKES, '#FF6B4A'],
    body: [BALL, '#D7263D'],
    detail: ['M32 8 l1.5 3 h-3Z M56 28 l-3 1.5 v-3Z M8 39 l3 -1.5 v3Z M52 50 l-3 -1 l1.5 -2.5Z', '#2E9E4F'],
    face: [32, 35],
  },
};

export type Face = 'happy' | 'effort' | 'wow' | 'sad';

const FACES: Record<Face, string> = {
  happy:
    '<circle cx="-7" cy="0" r="2.6" fill="#111214"/><circle cx="7" cy="0" r="2.6" fill="#111214"/><circle cx="-6.2" cy="-0.9" r="0.9" fill="#fff"/><circle cx="7.8" cy="-0.9" r="0.9" fill="#fff"/><path d="M-4 4.5 Q0 8.5 4 4.5" fill="none" stroke="#111214" stroke-width="2" stroke-linecap="round"/><circle cx="-11.5" cy="4.5" r="2.4" fill="#FF7A8A" fill-opacity="0.7"/><circle cx="11.5" cy="4.5" r="2.4" fill="#FF7A8A" fill-opacity="0.7"/>',
  effort:
    '<path d="M-11 -4 L-5 -1 L-11 2 M11 -4 L5 -1 L11 2" fill="none" stroke="#111214" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="-5" y="3" width="10" height="6" rx="2" fill="#111214"/><rect x="-4" y="4" width="8" height="2" fill="#fff"/>',
  wow: '<circle cx="-7" cy="0" r="2.8" fill="#111214"/><circle cx="7" cy="0" r="2.8" fill="#111214"/><ellipse cx="0" cy="6" rx="3" ry="3.6" fill="#111214"/>',
  sad: '<circle cx="-7" cy="0" r="2.4" fill="#111214"/><circle cx="7" cy="0" r="2.4" fill="#111214"/><path d="M-4 7 Q0 3.5 4 7" fill="none" stroke="#111214" stroke-width="2" stroke-linecap="round"/>',
};

/** Inner markup for one fruit head on a 64x64 grid. */
export function fruitMarkup(fruit: Fruit, face: Face = 'happy'): string {
  const a = FRUIT_ART[fruit];
  const layer = (l?: [string, string]) => (l ? `<path d="${l[0]}" fill="${l[1]}"/>` : '');
  return `${layer(a.back)}${layer(a.body)}${layer(a.detail)}${layer(a.leaf)}<g transform="translate(${a.face[0]} ${a.face[1]})">${FACES[face]}</g>`;
}
