/** "Kabar" event cards: what each one does. Texts live in strings.ts (CARD_TEXT). */
import { DENPASAR_TILE, START_TILE } from './board';

export type CardId =
  | 'panen'
  | 'banjir'
  | 'festival'
  | 'promo'
  | 'arisan'
  | 'razia'
  | 'mudik'
  | 'ban'
  | 'traktir'
  | 'investor'
  | 'liburan'
  | 'salah'
  | 'lomba'
  | 'umkm'
  | 'renovasi';

/** Which city a free-upgrade card lifts: most rent gained, the cheapest, or the drawer's pick. */
export type UpgradePick = 'best' | 'cheapest' | 'choose';

export type CardEffect =
  /** The bank pays the drawer. */
  | { kind: 'gain'; amount: number }
  /** The drawer pays the bank. */
  | { kind: 'lose'; amount: number }
  /** The drawer pays the bank per building level owned (Rumah 1 .. Hotel 4), at least `min`. */
  | { kind: 'repair'; perLevel: number; min: number }
  /** Every other player in the game pays the drawer. */
  | { kind: 'collect'; amount: number }
  /** The drawer pays every other player in the game. */
  | { kind: 'treat'; amount: number }
  /** Walk forward to a tile (salary when passing Gajian). */
  | { kind: 'goto'; tile: number }
  /** Walk forward to the nearest transport tile. */
  | { kind: 'transport' }
  /** Walk backwards, no salary. */
  | { kind: 'back'; steps: number }
  /** Straight to the Tilang post. */
  | { kind: 'jail' }
  /** One free upgrade on a city of the drawer's below Hotel (see `pick`), otherwise `fallback` cash. */
  | { kind: 'upgrade'; pick: UpgradePick; fallback: number };

export const CARDS: Record<CardId, CardEffect> = {
  panen: { kind: 'gain', amount: 150 },
  banjir: { kind: 'repair', perLevel: 20, min: 50 },
  festival: { kind: 'collect', amount: 30 },
  promo: { kind: 'transport' },
  arisan: { kind: 'gain', amount: 100 },
  razia: { kind: 'jail' },
  mudik: { kind: 'goto', tile: START_TILE },
  ban: { kind: 'lose', amount: 50 },
  traktir: { kind: 'treat', amount: 20 },
  investor: { kind: 'upgrade', pick: 'best', fallback: 100 },
  liburan: { kind: 'goto', tile: DENPASAR_TILE },
  salah: { kind: 'back', steps: 3 },
  lomba: { kind: 'gain', amount: 50 },
  umkm: { kind: 'upgrade', pick: 'cheapest', fallback: 100 },
  renovasi: { kind: 'upgrade', pick: 'choose', fallback: 100 },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

/** Good news (green card) or bad news (red card), for the reveal on the main screen. */
export function cardTone(id: CardId): 'good' | 'bad' | 'move' {
  const e = CARDS[id];
  switch (e.kind) {
    case 'gain':
    case 'collect':
    case 'upgrade':
      return 'good';
    case 'lose':
    case 'repair':
    case 'treat':
    case 'jail':
      return 'bad';
    default:
      return 'move';
  }
}
