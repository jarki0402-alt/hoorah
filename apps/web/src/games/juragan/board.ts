/**
 * Juragan Nusantara board: a ring of 24 tiles taking a loop around the archipelago, from Sumatra in
 * the west, up through Kalimantan and Sulawesi to Maluku and Papua in the east, then back along the
 * south through Bali and Nusa Tenggara to Jawa. Pure data; names live in strings.ts.
 *
 * Money is in thousands of rupiah ("rb") and always a multiple of 10.
 */

export const TILE_COUNT = 24;
/** Tiles per side, counting the corner that starts it. */
export const SIDE = 6;

export type GroupId = 'sumatra' | 'kalimantan' | 'sulawesi' | 'timur' | 'bali' | 'jawa';

export const GROUPS: readonly GroupId[] = ['sumatra', 'kalimantan', 'sulawesi', 'timur', 'bali', 'jawa'];

/** Colour band of each island group (printed on the board, the HUD card and the phone). */
export const GROUP_COLOR: Record<GroupId, string> = {
  sumatra: '#2E8B57',
  kalimantan: '#A0642D',
  sulawesi: '#E97A2C',
  timur: '#D63A4A',
  bali: '#1AA3B8',
  jawa: '#2456A6',
};

export type CornerKind = 'start' | 'tilang' | 'rehat' | 'razia';
export type TaxKind = 'usaha' | 'kekayaan';
export type TransportKind = 'pelabuhan' | 'bandara';

export type CityKey =
  | 'medan'
  | 'palembang'
  | 'pontianak'
  | 'balikpapan'
  | 'makassar'
  | 'palu'
  | 'manado'
  | 'ambon'
  | 'jayapura'
  | 'labuanbajo'
  | 'denpasar'
  | 'bandung'
  | 'surabaya'
  | 'jakarta';

export interface CityTile {
  kind: 'city';
  key: CityKey;
  group: GroupId;
  price: number;
  /** Rent with a Rumah, Toko, Gedung, Hotel. Owning the whole island doubles it at every level. */
  rent: readonly [number, number, number, number];
  /** Upgrade cost from Rumah to Toko, Toko to Gedung, Gedung to Hotel. */
  upgrade: readonly [number, number, number];
}

export interface TransportTile {
  kind: 'transport';
  key: TransportKind;
  price: number;
}

export interface CornerTile {
  kind: 'corner';
  key: CornerKind;
}

export interface KabarTile {
  kind: 'kabar';
}

export interface TaxTile {
  kind: 'tax';
  key: TaxKind;
}

export type Tile = CityTile | TransportTile | CornerTile | KabarTile | TaxTile;
export type OwnableTile = CityTile | TransportTile;

/** Building levels on an owned city: 1 Rumah (comes with the purchase), 2 Toko, 3 Gedung, 4 Hotel. */
export const MAX_LEVEL = 4;
/** Rumah rent as a share of the city price. */
export const RENT_SHARE = 0.2;
/** Rent at each level as a multiple of the Rumah rent (before rounding). */
export const RENT_MULT: readonly [number, number, number, number] = [1, 3, 7, 15];
/** Upgrade costs as a share of the city price: to Toko, to Gedung, to Hotel. */
export const UPGRADE_SHARE: readonly [number, number, number] = [0.5, 0.75, 1];

const round10 = (v: number): number => Math.round(v / 10) * 10;

/** A city: rents and upgrade costs follow from the price, rounded to Rp 10 rb. */
const city = (key: CityKey, group: GroupId, price: number): CityTile => ({
  kind: 'city',
  key,
  group,
  price,
  rent: [
    Math.max(10, round10(price * RENT_SHARE * RENT_MULT[0])),
    round10(price * RENT_SHARE * RENT_MULT[1]),
    round10(price * RENT_SHARE * RENT_MULT[2]),
    round10(price * RENT_SHARE * RENT_MULT[3]),
  ],
  upgrade: [
    round10(price * UPGRADE_SHARE[0]),
    round10(price * UPGRADE_SHARE[1]),
    round10(price * UPGRADE_SHARE[2]),
  ],
});

export const TILES: readonly Tile[] = [
  { kind: 'corner', key: 'start' },
  city('medan', 'sumatra', 100),
  { kind: 'kabar' },
  city('palembang', 'sumatra', 120),
  city('pontianak', 'kalimantan', 140),
  city('balikpapan', 'kalimantan', 160),
  { kind: 'corner', key: 'tilang' },
  city('makassar', 'sulawesi', 180),
  { kind: 'transport', key: 'pelabuhan', price: 200 },
  city('palu', 'sulawesi', 180),
  { kind: 'tax', key: 'usaha' },
  city('manado', 'sulawesi', 200),
  { kind: 'corner', key: 'rehat' },
  city('ambon', 'timur', 220),
  city('jayapura', 'timur', 240),
  { kind: 'kabar' },
  city('labuanbajo', 'bali', 260),
  city('denpasar', 'bali', 280),
  { kind: 'corner', key: 'razia' },
  city('bandung', 'jawa', 300),
  { kind: 'transport', key: 'bandara', price: 200 },
  city('surabaya', 'jawa', 320),
  { kind: 'tax', key: 'kekayaan' },
  city('jakarta', 'jawa', 360),
];

export const START_TILE = 0;
export const TILANG_TILE = 6;
export const REHAT_TILE = 12;
export const RAZIA_TILE = 18;
export const DENPASAR_TILE = 17;
export const TRANSPORT_TILES: readonly number[] = [8, 20];

/** Cash every player starts with. */
export const START_CASH = 1500;
/** Paid by the bank every time a pawn passes or lands on Gajian. */
export const SALARY = 200;
/** Extra for landing exactly on Gajian. */
export const PAYDAY_BONUS = 100;
/** Fine to leave the Tilang post without waiting a turn. */
export const TILANG_FINE = 50;
/** Flat tax of "Pajak Usaha". */
export const TAX_USAHA = 100;
/** "Pajak Kekayaan": a tenth of the cash in hand, rounded up to 10, at least this much. */
export const TAX_KEKAYAAN_MIN = 50;
/** Transport rent with one or both transport tiles owned. */
export const TRANSPORT_RENT: readonly [number, number] = [40, 100];

export function isOwnable(t: Tile): t is OwnableTile {
  return t.kind === 'city' || t.kind === 'transport';
}

export function tileAt(i: number): Tile {
  return TILES[((i % TILE_COUNT) + TILE_COUNT) % TILE_COUNT]!;
}

/** Tile indices of each island group, in board order. */
export const GROUP_TILES: Record<GroupId, readonly number[]> = (() => {
  const out = {} as Record<GroupId, number[]>;
  for (const g of GROUPS) out[g] = [];
  TILES.forEach((t, i) => {
    if (t.kind === 'city') out[t.group].push(i);
  });
  return out;
})();

export const CITY_TILES: readonly number[] = TILES.flatMap((t, i) => (t.kind === 'city' ? [i] : []));

/** The pawn's tile after `steps` (negative = backwards). */
export function advance(from: number, steps: number): number {
  return (((from + steps) % TILE_COUNT) + TILE_COUNT) % TILE_COUNT;
}

/** Steps forward from `from` to `to` (0..23). */
export function stepsTo(from: number, to: number): number {
  return (((to - from) % TILE_COUNT) + TILE_COUNT) % TILE_COUNT;
}

/** Board side of a tile (0 near, 1 right, 2 far, 3 left as seen from the main screen camera). */
export function sideOf(i: number): number {
  return Math.floor(i / SIDE) % 4;
}

export function isCorner(i: number): boolean {
  return i % SIDE === 0;
}
