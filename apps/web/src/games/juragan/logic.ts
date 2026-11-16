/**
 * Juragan Nusantara rules as a pure, deterministic state machine. Time comes in from the caller
 * (game clock, frozen while paused) and dice and cards come from a seeded generator, so tests can
 * replay any game. Money is in thousands of rupiah.
 *
 * Final rules (condensed property trading, 1–6 players):
 * - Board: a ring of 24 tiles (board.ts). 14 cities in 6 island groups, 2 transport tiles
 *   (Pelabuhan, Bandara), 2 "Kabar" event tiles, 2 tax tiles and 4 corners: Gajian (start),
 *   Pos Tilang, Ngopi Dulu (rest) and Razia (go to Pos Tilang).
 * - Everyone starts with Rp 1,5 jt. Passing or landing on Gajian pays Rp 200 rb; landing on it
 *   exactly pays a Rp 100 rb bonus on top.
 * - Turn: roll two dice and walk. Doubles roll again after the landing is settled; the third
 *   doubles in a row goes straight to Pos Tilang and ends the turn.
 * - Unowned city or transport: buy it at the list price or skip (no auctions). A bought city gets
 *   a Rumah (level 1) in the owner's colour straight away.
 * - Own city: landing on it offers one upgrade, Rumah > Toko > Gedung > Hotel, for 50% / 75% /
 *   100% of the city price. Hotel is the top level.
 * - Someone else's city or transport: pay rent. City rent per level is about 1 / 3 / 7 / 15 times
 *   the Rumah rent (14% of the price), doubled at every level while the owner holds the whole
 *   island. Transport: Rp 40 rb, Rp 100 rb if the owner holds both.
 * - Rebut (takeover): after paying rent on a rival's city that is not a Hotel, the visitor may buy
 *   it for twice its value (price + upgrades paid), paid to the owner, who cannot refuse. The
 *   building moves over with it. Only offered when the visitor's cash covers it; Hotels and
 *   transport tiles can't be taken. A city can be taken back later the same way.
 * - Kabar: draw one of 15 event cards (cards.ts): money from or to the bank or the other players,
 *   a trip to another tile, or a free one-level upgrade of a city below Hotel. Three cards upgrade:
 *   Investor Datang (the city where it adds the most rent), Bantuan UMKM (the cheapest city) and
 *   Renovasi Gotong Royong (the drawer picks the city on the phone; on timeout the one where it
 *   adds the most rent; with a single candidate it is lifted straight away). Without a city below
 *   Hotel each pays Rp 100 rb instead. Pajak Usaha: Rp 100 rb. Pajak Kekayaan: 10% of the cash in
 *   hand (rounded up to Rp 10 rb, at least Rp 50 rb).
 * - Pos Tilang: a player sent there (Razia corner, Kena Razia card, third doubles) starts the next
 *   turn by either paying a Rp 50 rb fine and rolling, or waiting out that turn for free.
 * - No trading and no mortgages. Short of cash, the bank automatically buys back upgrades (the
 *   cheapest first, half their cost) and then properties with their Rumah (loose ones before
 *   whole islands, cheapest first, half the price). Still short: the player hands over what is
 *   left and is bankrupt; their cities return to the bank and they are out.
 * - The game lasts `rounds` putaran (`settings.rounds`, 4..40): one putaran is one turn for every
 *   player still in (doubles roll again within the same turn). The last putaran is announced.
 *   After it the richest player by net worth (cash + property prices + upgrades paid) wins. It
 *   ends earlier when only one player is left, or when every human is bankrupt.
 * - Every decision has a deadline. Roll: rolls by itself. Buy: buys if Rp 150 rb would still be
 *   left, else skips. Upgrade and Rebut: no. Tilang: pays if Rp 150 rb would still be left, else
 *   waits.
 */
import {
  advance,
  type CityTile,
  GROUP_TILES,
  type GroupId,
  isOwnable,
  MAX_LEVEL,
  PAYDAY_BONUS,
  SALARY,
  START_CASH,
  START_TILE,
  stepsTo,
  TAX_KEKAYAAN_MIN,
  TAX_USAHA,
  TILANG_FINE,
  TILANG_TILE,
  TILE_COUNT,
  TILES,
  TRANSPORT_RENT,
  TRANSPORT_TILES,
} from './board';
import { CARD_IDS, CARDS, type CardId } from './cards';

export const INTRO_MS = 3600;
export const ROLL_MS = 15_000;
export const BUY_MS = 15_000;
export const UPGRADE_MS = 15_000;
export const TAKEOVER_MS = 15_000;
/** Picking the city for a free Renovasi Gotong Royong upgrade. */
export const RENOVATE_MS = 15_000;
export const JAIL_MS = 12_000;
/**
 * Decision deadline for a seat with nobody connected. The main screen's computer brain plays such
 * a seat after a short pause; this is only the fallback if it doesn't.
 */
export const AWAY_MS = 3400;
/** The dice tumble before the result is final. */
export const DICE_MS = 1150;
export const HOP_MS = 250;
/** Pause after the last hop before the landing is resolved. */
export const STEP_SETTLE_MS = 260;
/** A pawn sent straight to Pos Tilang flies there. */
export const JUMP_MS = 1000;
export const LAND_MS = 700;
export const PAY_MS = 1300;
/** Extra pause per automatic sale and for a bankruptcy, so the main screen can show them. */
export const SELL_MS = 450;
export const BANKRUPT_MS = 2400;
export const CARD_MS = 3000;
/** The new building springs up. */
export const UPGRADE_STEP_MS = 900;
/** The city changes hands: coins to the old owner, then the building flips to the new colour. */
export const TAKEOVER_STEP_MS = 1600;
export const FINALE_MS = 5600;
/** Cash an automatic choice keeps in hand. */
export const AUTO_RESERVE = 150;
/** Game length in putaran: the default and the accepted range. */
export const DEFAULT_ROUNDS = 12;
export const MIN_ROUNDS = 4;
export const MAX_ROUNDS = 40;

export type Phase =
  | 'intro'
  | 'jail'
  | 'roll'
  | 'rolling'
  | 'moving'
  | 'buy'
  | 'card'
  | 'settle'
  | 'upgrade'
  | 'takeover'
  | 'renovate'
  | 'finale'
  | 'ended';

export interface RosterEntry {
  id: number;
  connected: boolean;
  /** Computer opponent (solo play). */
  cpu?: boolean;
}

export interface PlayerStats {
  rentCollected: number;
  rentPaid: number;
  bought: number;
  /** Upgrades, free ones included. */
  built: number;
  /** Cities taken over from someone else. */
  takeovers: number;
  /** Own cities someone else took over. */
  lost: number;
  salaries: number;
  cards: number;
}

export interface PlayerState {
  id: number;
  seat: number;
  cpu: boolean;
  cash: number;
  pos: number;
  /** At Pos Tilang: the next turn starts with "pay the fine or wait". */
  jailed: boolean;
  bankrupt: boolean;
  /** 1 for the first player to go bankrupt, 2 for the next...; 0 while playing. */
  bankruptOrder: number;
  stats: PlayerStats;
}

export interface TileState {
  /** Player id, or null for the bank. */
  owner: number | null;
  /** Owned city: 1 Rumah, 2 Toko, 3 Gedung, 4 Hotel. 0 for the bank's cities and transport. */
  level: number;
}

export type PayReason =
  | 'rent'
  | 'tax'
  | 'card'
  | 'fine'
  | 'buy'
  | 'upgrade'
  | 'takeover'
  | 'salary'
  | 'payday';
export type EndReason = 'rounds' | 'last';
export type JailReason = 'razia' | 'triple' | 'card';
export type MoveKind = 'walk' | 'back' | 'jump';

export type JuraganEvent =
  | { type: 'intro' }
  /** A putaran starts; `last` on the final one. */
  | { type: 'round'; round: number; last: boolean }
  | { type: 'turn'; player: number; bonus: boolean }
  | { type: 'jail'; player: number }
  | { type: 'jailPay'; player: number; auto: boolean }
  | { type: 'jailWait'; player: number; auto: boolean }
  | { type: 'roll'; player: number; dice: [number, number]; doubles: boolean; auto: boolean }
  | { type: 'triple'; player: number }
  | { type: 'move'; player: number; path: number[]; kind: MoveKind }
  | { type: 'land'; player: number; tile: number }
  | { type: 'offer'; player: number; tile: number }
  | { type: 'cantAfford'; player: number; tile: number }
  | { type: 'buy'; player: number; tile: number; price: number; auto: boolean }
  | { type: 'skip'; player: number; tile: number; auto: boolean }
  | {
      type: 'pay';
      /** Player ids; null is the bank. */
      from: number | null;
      to: number | null;
      amount: number;
      reason: PayReason;
      tile: number | null;
      /** Salary while walking: index in the move's path where it was collected. */
      step?: number;
    }
  | {
      type: 'sell';
      player: number;
      tile: number;
      what: 'building' | 'property';
      level: number;
      amount: number;
    }
  | { type: 'bankrupt'; player: number; to: number | null }
  | { type: 'card'; player: number; card: CardId }
  /** Landed on an own city that can go one level up: `level` is the level after the upgrade. */
  | { type: 'upgradeOffer'; player: number; tile: number; level: number; cost: number }
  /** Landed on an own city that can't go up: already a Hotel, or the cash doesn't cover it. */
  | { type: 'noUpgrade'; player: number; tile: number; reason: 'max' | 'cash' }
  | { type: 'upgrade'; player: number; tile: number; level: number; cost: number; free: boolean }
  /** Renovasi Gotong Royong: the drawer picks one of `options` (own cities below Hotel). */
  | { type: 'renovateOffer'; player: number; options: number[]; best: number }
  | { type: 'takeoverOffer'; player: number; owner: number; tile: number; price: number }
  | { type: 'takeover'; player: number; from: number; tile: number; price: number; level: number }
  /** An upgrade or takeover offer turned down (or timed out). */
  | { type: 'decline'; player: number; tile: number; what: 'upgrade' | 'takeover'; auto: boolean }
  | { type: 'jailed'; player: number; reason: JailReason }
  | { type: 'finish'; winner: number | null; reason: EndReason }
  | { type: 'end' };

export interface JuraganOptions {
  roster: RosterEntry[];
  /** Game length in putaran (`settings.rounds`). */
  rounds: number;
  now: number;
  seed?: number;
  /** Override the dice (tests). Each value must be 1..6. */
  dice?: () => [number, number];
  /** Fixed card order (tests); cycles when used up. */
  deck?: CardId[];
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Putaran from `settings.rounds`: 4..40, the default when missing or nonsense. */
export function clampRounds(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ROUNDS;
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, n));
}

/* ------------------------------------------------------------------ pure board helpers */

export function emptyTiles(): TileState[] {
  return TILES.map(() => ({ owner: null, level: 0 }));
}

export function ownsGroup(tiles: readonly TileState[], id: number, group: GroupId): boolean {
  return GROUP_TILES[group].every((i) => tiles[i]!.owner === id);
}

/** A city's rent at `level` (1 Rumah .. 4 Hotel), before the whole-island doubling. */
export function cityRent(t: CityTile, level: number): number {
  return t.rent[Math.max(1, Math.min(MAX_LEVEL, level)) - 1]!;
}

/** Rent a visitor pays on tile `i` (0 when nobody owns it or it can't be owned). */
export function rentAt(tiles: readonly TileState[], i: number): number {
  const t = TILES[i]!;
  const s = tiles[i]!;
  if (s.owner === null) return 0;
  if (t.kind === 'transport') {
    const n = TRANSPORT_TILES.filter((k) => tiles[k]!.owner === s.owner).length;
    return TRANSPORT_RENT[Math.max(0, Math.min(1, n - 1))]!;
  }
  if (t.kind !== 'city') return 0;
  return cityRent(t, s.level) * (ownsGroup(tiles, s.owner, t.group) ? 2 : 1);
}

/** Cost to take a city from `level` one level up, or null at the top (or for non-cities). */
export function upgradeCost(i: number, level: number): number | null {
  const t = TILES[i]!;
  if (t.kind !== 'city' || level < 1 || level >= MAX_LEVEL) return null;
  return t.upgrade[level - 1]!;
}

/** What the upgrades of a city at `level` cost in total. */
export function upgradesPaid(t: CityTile, level: number): number {
  let v = 0;
  for (let k = 1; k < Math.min(MAX_LEVEL, level); k++) v += t.upgrade[k - 1]!;
  return v;
}

/** An owned property's value: price, plus the upgrades paid on a city. 0 for the bank's tiles. */
export function valueAt(tiles: readonly TileState[], i: number): number {
  const t = TILES[i]!;
  const s = tiles[i]!;
  if (s.owner === null || !isOwnable(t)) return 0;
  return t.kind === 'city' ? t.price + upgradesPaid(t, s.level) : t.price;
}

/** Twice the value of an owned city below Hotel; null when it can't be taken over. */
export function takeoverPrice(tiles: readonly TileState[], i: number): number | null {
  const t = TILES[i]!;
  const s = tiles[i]!;
  if (t.kind !== 'city' || s.owner === null || s.level >= MAX_LEVEL) return null;
  return 2 * valueAt(tiles, i);
}

/** The tax due on tile `i` for a player holding `cash`. */
export function taxAt(i: number, cash: number): number {
  const t = TILES[i]!;
  if (t.kind !== 'tax') return 0;
  if (t.key === 'usaha') return TAX_USAHA;
  return Math.max(TAX_KEKAYAAN_MIN, Math.ceil(cash / 100) * 10);
}

/** Build levels a player owns in total. */
export function levelsOf(tiles: readonly TileState[], id: number): number {
  return tiles.reduce((s, t) => s + (t.owner === id ? t.level : 0), 0);
}

/** Cities and transport tiles owned. */
export function propertiesOf(tiles: readonly TileState[], id: number): number[] {
  const out: number[] = [];
  tiles.forEach((t, i) => {
    if (t.owner === id) out.push(i);
  });
  return out;
}

/** Cash + the value of every property (prices and upgrades paid). */
export function netWorth(p: Pick<PlayerState, 'id' | 'cash'>, tiles: readonly TileState[]): number {
  let v = p.cash;
  tiles.forEach((s, i) => {
    if (s.owner === p.id) v += valueAt(tiles, i);
  });
  return v;
}

/** A player's cities below Hotel, in board order. */
export function upgradableCities(tiles: readonly TileState[], id: number): number[] {
  const out: number[] = [];
  tiles.forEach((s, i) => {
    if (s.owner === id && upgradeCost(i, s.level) !== null) out.push(i);
  });
  return out;
}

/** Among `options`, the city where one more level adds the most rent (the dearer upgrade on a tie). */
export function bestFreeUpgrade(tiles: readonly TileState[], options: readonly number[]): number | null {
  let best: number | null = null;
  let bestGain = 0;
  let bestCost = 0;
  for (const i of options) {
    const cost = upgradeCost(i, tiles[i]?.level ?? 0);
    if (cost === null) continue;
    const gain = upgradeGain(tiles, i);
    if (best === null || gain > bestGain || (gain === bestGain && cost > bestCost)) {
      best = i;
      bestGain = gain;
      bestCost = cost;
    }
  }
  return best;
}

/** Among `options`, the cheapest city (the first in board order on a tie). */
export function cheapestUpgradable(tiles: readonly TileState[], options: readonly number[]): number | null {
  let best: number | null = null;
  for (const i of options) {
    if (upgradeCost(i, tiles[i]?.level ?? 0) === null) continue;
    if (best === null || priceOf(i) < priceOf(best)) best = i;
  }
  return best;
}

/** Extra rent one more level would bring on an owned city (island doubling included). */
export function upgradeGain(tiles: readonly TileState[], i: number): number {
  const t = TILES[i]!;
  const s = tiles[i]!;
  if (t.kind !== 'city' || s.owner === null || s.level >= MAX_LEVEL) return 0;
  const mult = ownsGroup(tiles, s.owner, t.group) ? 2 : 1;
  return (cityRent(t, s.level + 1) - cityRent(t, s.level)) * mult;
}

export function priceOf(i: number): number {
  const t = TILES[i]!;
  return isOwnable(t) ? t.price : 0;
}

/* ------------------------------------------------------------------ the game */

export class JuraganLogic {
  readonly players: PlayerState[];
  readonly tiles: TileState[] = emptyTiles();
  /** Putaran in the game. */
  readonly rounds: number;
  /** The running putaran, from 1 (0 during the intro). */
  round = 0;
  phase: Phase = 'intro';
  /** Seat whose turn it is. */
  current = 0;
  dice: [number, number] | null = null;
  /** Doubles in a row this turn. */
  doublesRun = 0;
  /** Game time when the current phase times out. */
  deadline = 0;
  /** Game time the current phase started. */
  since = 0;
  /** The card being revealed. */
  card: CardId | null = null;
  /** The tile on offer while buying, upgrading or taking over. */
  offerTile: number | null = null;
  /** Cities the current player may pick from for Renovasi Gotong Royong. */
  renovateOptions: number[] = [];
  /** The tile the current player landed on last. */
  focusTile: number | null = null;
  winner: number | null = null;
  endReason: EndReason | null = null;

  private readonly byId = new Map<number, PlayerState>();
  private readonly connected = new Map<number, boolean>();
  private readonly roll2: () => [number, number];
  private readonly rnd: () => number;
  private readonly fixedDeck: CardId[] | null;
  private deck: CardId[] = [];
  private deckPos = 0;
  private events: JuraganEvent[] = [];
  private rolledDoubles = false;
  /** What a finished move leads to. */
  private moveThen: 'land' | 'settle' = 'land';
  /** Extra settle time from sales and bankruptcies during the current action. */
  private extraMs = 0;
  private bankrupts = 0;

  constructor(opts: JuraganOptions) {
    this.rounds = clampRounds(opts.rounds);
    for (const r of opts.roster) this.connected.set(r.id, r.connected);
    const live = opts.roster.filter((r) => r.connected);
    const seats = live.length ? live : opts.roster;
    this.players = seats.map((r, seat) => ({
      id: r.id,
      seat,
      cpu: !!r.cpu,
      cash: START_CASH,
      pos: START_TILE,
      jailed: false,
      bankrupt: false,
      bankruptOrder: 0,
      stats: {
        rentCollected: 0,
        rentPaid: 0,
        bought: 0,
        built: 0,
        takeovers: 0,
        lost: 0,
        salaries: 0,
        cards: 0,
      },
    }));
    for (const p of this.players) this.byId.set(p.id, p);
    this.rnd = rng(opts.seed ?? 1);
    if (opts.dice) this.roll2 = opts.dice;
    else this.roll2 = () => [1 + Math.floor(this.rnd() * 6), 1 + Math.floor(this.rnd() * 6)];
    this.fixedDeck = opts.deck?.length ? [...opts.deck] : null;
    this.reshuffle();
    this.since = opts.now;
    this.deadline = opts.now + INTRO_MS;
    this.emit({ type: 'intro' });
  }

  /* ---------------------------------------------------------------- queries */

  get player(): PlayerState {
    return this.players[this.current]!;
  }

  get alive(): PlayerState[] {
    return this.players.filter((p) => !p.bankrupt);
  }

  playerById(id: number): PlayerState | undefined {
    return this.byId.get(id);
  }

  isConnected(id: number): boolean {
    return this.connected.get(id) ?? false;
  }

  worth(p: PlayerState): number {
    return netWorth(p, this.tiles);
  }

  drain(): JuraganEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** True while the current player has a decision to make (phones show buttons). */
  get deciding(): boolean {
    return (
      this.phase === 'roll' ||
      this.phase === 'buy' ||
      this.phase === 'upgrade' ||
      this.phase === 'takeover' ||
      this.phase === 'renovate' ||
      this.phase === 'jail'
    );
  }

  /** The final putaran is running. */
  get lastRound(): boolean {
    return this.round >= this.rounds;
  }

  /** Putaran still to play, counting the rest of the running one as a fraction. */
  get roundsLeft(): number {
    const alive = this.alive;
    const after = alive.filter((p) => p.seat > this.current).length;
    return Math.max(0, this.rounds - this.round) + after / Math.max(1, alive.length);
  }

  /** What the current offer costs: the price, the upgrade or the takeover. 0 without an offer. */
  get offerCost(): number {
    const i = this.offerTile;
    if (i === null) return 0;
    if (this.phase === 'buy') return priceOf(i);
    if (this.phase === 'upgrade') return upgradeCost(i, this.tiles[i]!.level) ?? 0;
    if (this.phase === 'takeover') return takeoverPrice(this.tiles, i) ?? 0;
    return 0;
  }

  /* ---------------------------------------------------------------- input */

  setRoster(roster: readonly RosterEntry[], now: number): void {
    for (const r of roster) this.connected.set(r.id, r.connected);
    if (!this.deciding) return;
    const id = this.player.id;
    if (!this.isConnected(id)) this.deadline = Math.min(this.deadline, now + AWAY_MS);
    else if (this.deadline - now < 5000) this.deadline = now + 5000;
  }

  /** The current player throws the dice. */
  roll(from: number, now: number): boolean {
    if (this.phase !== 'roll' || from !== this.player.id) return false;
    this.doRoll(now, false);
    return true;
  }

  /**
   * A decision from the current player's phone: `buy` / `skip`, `upgrade` / `skip`,
   * `takeover` / `skip`, `pay` / `wait`. Returns false when it doesn't apply right now.
   */
  decide(from: number, choice: string, now: number): boolean {
    if (from !== this.player.id) return false;
    switch (this.phase) {
      case 'buy':
        if (choice === 'buy') return this.buy(now, false);
        if (choice === 'skip') {
          this.skip(now, false);
          return true;
        }
        return false;
      case 'upgrade':
        if (choice === 'upgrade') return this.upgrade(now);
        if (choice === 'skip') {
          this.decline(now, 'upgrade', false);
          return true;
        }
        return false;
      case 'takeover':
        if (choice === 'takeover') return this.takeover(now);
        if (choice === 'skip') {
          this.decline(now, 'takeover', false);
          return true;
        }
        return false;
      case 'renovate': {
        const m = /^renovate-(\d{1,2})$/.exec(choice);
        const tile = m ? Number(m[1]) : -1;
        if (!this.renovateOptions.includes(tile)) return false;
        this.renovate(tile, now);
        return true;
      }
      case 'jail':
        if (choice === 'pay') {
          this.payFine(now, false);
          return true;
        }
        if (choice === 'wait') {
          this.waitOut(now, false);
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  /* ---------------------------------------------------------------- clock */

  tick(now: number): void {
    // A phase can end inside one tick; keep going until it waits for the future.
    for (let guard = 0; guard < 24; guard++) {
      if (!this.step(now)) return;
    }
  }

  private step(now: number): boolean {
    if (now < this.deadline) return false;
    const at = this.deadline;
    switch (this.phase) {
      case 'intro':
        this.startRound(1);
        this.startTurn(0, false, at);
        return true;
      case 'jail':
        if (this.player.cash >= TILANG_FINE + AUTO_RESERVE) this.payFine(at, true);
        else this.waitOut(at, true);
        return true;
      case 'roll':
        this.doRoll(at, true);
        return true;
      case 'rolling':
        this.resolveRoll(at);
        return true;
      case 'moving':
        if (this.moveThen === 'land') this.land(at);
        else this.settle(at, LAND_MS);
        return true;
      case 'buy': {
        const tile = this.offerTile;
        const price = tile === null ? 0 : priceOf(tile);
        if (tile !== null && this.player.cash - price >= AUTO_RESERVE) this.buy(at, true);
        else this.skip(at, true);
        return true;
      }
      case 'card':
        this.applyCard(at);
        return true;
      case 'settle':
        this.continueTurn(at);
        return true;
      case 'upgrade':
        this.decline(at, 'upgrade', true);
        return true;
      case 'takeover':
        this.decline(at, 'takeover', true);
        return true;
      case 'renovate':
        this.renovate(bestFreeUpgrade(this.tiles, this.renovateOptions) ?? this.renovateOptions[0] ?? -1, at);
        return true;
      case 'finale':
        this.phase = 'ended';
        this.deadline = Number.POSITIVE_INFINITY;
        this.emit({ type: 'end' });
        return false;
      case 'ended':
        return false;
    }
  }

  /* ---------------------------------------------------------------- turn flow */

  private emit(e: JuraganEvent): void {
    this.events.push(e);
  }

  private set(phase: Phase, at: number, ms: number): void {
    this.phase = phase;
    this.since = at;
    this.deadline = at + ms;
  }

  /** Decision time: the full deadline for a connected phone, short for an empty seat. */
  private timed(ms: number): number {
    return this.isConnected(this.player.id) ? ms : AWAY_MS;
  }

  private startTurn(seat: number, bonus: boolean, at: number): void {
    this.current = seat;
    const p = this.player;
    if (!bonus) this.doublesRun = 0;
    this.rolledDoubles = false;
    this.offerTile = null;
    this.card = null;
    this.renovateOptions = [];
    if (!bonus && p.jailed) {
      this.set('jail', at, this.timed(JAIL_MS));
      this.emit({ type: 'jail', player: p.id });
      return;
    }
    this.set('roll', at, this.timed(ROLL_MS));
    this.emit({ type: 'turn', player: p.id, bonus });
  }

  /** True when the game can't go on: one player left, or only computer players left. */
  private over(): boolean {
    const alive = this.alive;
    if (this.players.length > 1 && alive.length <= 1) return true;
    const humans = this.players.some((p) => !p.cpu);
    return humans && !alive.some((p) => !p.cpu);
  }

  private startRound(round: number): void {
    this.round = round;
    this.emit({ type: 'round', round, last: round >= this.rounds });
  }

  /** The next player still in; going round past the last seat starts a new putaran (or ends). */
  private nextTurn(at: number): void {
    if (this.over()) {
      this.finish(at, 'last');
      return;
    }
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const seat = (this.current + k) % n;
      if (this.players[seat]!.bankrupt) continue;
      if (seat <= this.current) {
        if (this.round >= this.rounds) {
          this.finish(at, 'rounds');
          return;
        }
        this.startRound(this.round + 1);
      }
      this.startTurn(seat, false, at);
      return;
    }
    this.finish(at, 'last');
  }

  /** After a landing (or a jail decision) is settled: roll again or pass the turn. */
  private continueTurn(at: number): void {
    const p = this.player;
    if (this.over()) {
      this.finish(at, 'last');
      return;
    }
    if (p.bankrupt || p.jailed) {
      this.nextTurn(at);
      return;
    }
    if (this.rolledDoubles) {
      this.startTurn(this.current, true, at);
      return;
    }
    this.nextTurn(at);
  }

  private doRoll(at: number, auto: boolean): void {
    const raw = this.roll2();
    const d: [number, number] = [clampDie(raw[0]), clampDie(raw[1])];
    this.dice = d;
    const doubles = d[0] === d[1];
    this.rolledDoubles = doubles;
    if (doubles) this.doublesRun++;
    this.set('rolling', at, DICE_MS);
    this.emit({ type: 'roll', player: this.player.id, dice: d, doubles, auto });
  }

  private resolveRoll(at: number): void {
    const d = this.dice ?? [1, 2];
    if (this.rolledDoubles && this.doublesRun >= 3) {
      this.emit({ type: 'triple', player: this.player.id });
      this.sendToJail(at, 'triple');
      return;
    }
    this.walk(d[0] + d[1], at);
  }

  /** Walk forward (positive) or back (negative) and land at the end. Passing Gajian pays salary. */
  private walk(steps: number, at: number): void {
    const p = this.player;
    if (steps === 0) {
      this.land(at);
      return;
    }
    const dir = steps > 0 ? 1 : -1;
    const path: number[] = [];
    let pos = p.pos;
    for (let k = 0; k < Math.abs(steps); k++) {
      pos = advance(pos, dir);
      path.push(pos);
      if (dir > 0 && pos === START_TILE) {
        p.stats.salaries++;
        this.gain(p, SALARY, 'salary', START_TILE, k);
      }
    }
    p.pos = pos;
    this.moveThen = 'land';
    this.emit({ type: 'move', player: p.id, path, kind: dir > 0 ? 'walk' : 'back' });
    this.set('moving', at, path.length * HOP_MS + STEP_SETTLE_MS);
  }

  private sendToJail(at: number, reason: JailReason): void {
    const p = this.player;
    p.pos = TILANG_TILE;
    p.jailed = true;
    this.focusTile = TILANG_TILE;
    this.emit({ type: 'jailed', player: p.id, reason });
    this.emit({ type: 'move', player: p.id, path: [TILANG_TILE], kind: 'jump' });
    this.moveThen = 'settle';
    this.set('moving', at, JUMP_MS);
  }

  private settle(at: number, ms: number): void {
    this.set('settle', at, ms + this.extraMs);
    this.extraMs = 0;
  }

  private land(at: number): void {
    const p = this.player;
    const i = p.pos;
    const t = TILES[i]!;
    this.focusTile = i;
    this.emit({ type: 'land', player: p.id, tile: i });
    switch (t.kind) {
      case 'city':
      case 'transport': {
        const s = this.tiles[i]!;
        if (s.owner === null) {
          if (p.cash >= t.price) {
            this.offerTile = i;
            this.set('buy', at, this.timed(BUY_MS));
            this.emit({ type: 'offer', player: p.id, tile: i });
          } else {
            this.emit({ type: 'cantAfford', player: p.id, tile: i });
            this.settle(at, LAND_MS);
          }
          return;
        }
        if (s.owner === p.id) {
          this.offerUpgrade(i, at);
          return;
        }
        const owner = this.byId.get(s.owner);
        if (owner && !owner.bankrupt) this.charge(p, rentAt(this.tiles, i), owner, 'rent', i);
        if (!this.offerTakeover(i, at)) this.settle(at, PAY_MS);
        return;
      }
      case 'kabar': {
        const card = this.drawCard();
        this.card = card;
        p.stats.cards++;
        this.emit({ type: 'card', player: p.id, card });
        this.set('card', at, CARD_MS);
        return;
      }
      case 'tax':
        this.charge(p, taxAt(i, p.cash), null, 'tax', i);
        this.settle(at, PAY_MS);
        return;
      case 'corner':
        if (t.key === 'start') {
          this.gain(p, PAYDAY_BONUS, 'payday', i);
          this.settle(at, PAY_MS);
        } else if (t.key === 'razia') {
          this.sendToJail(at, 'razia');
        } else {
          this.settle(at, LAND_MS);
        }
        return;
    }
  }

  /* ---------------------------------------------------------------- decisions */

  private buy(at: number, auto: boolean): boolean {
    const i = this.offerTile;
    if (i === null) return false;
    const p = this.player;
    const price = priceOf(i);
    if (p.cash < price) return false;
    p.cash -= price;
    const s = this.tiles[i]!;
    s.owner = p.id;
    // A city comes with its Rumah.
    s.level = TILES[i]!.kind === 'city' ? 1 : 0;
    p.stats.bought++;
    this.offerTile = null;
    this.emit({ type: 'buy', player: p.id, tile: i, price, auto });
    this.emit({ type: 'pay', from: p.id, to: null, amount: price, reason: 'buy', tile: i });
    this.settle(at, LAND_MS + 300);
    return true;
  }

  private skip(at: number, auto: boolean): void {
    const i = this.offerTile;
    this.offerTile = null;
    if (i !== null) this.emit({ type: 'skip', player: this.player.id, tile: i, auto });
    this.settle(at, 350);
  }

  /** Landed on an own city: offer one level up when there is one and the cash covers it. */
  private offerUpgrade(i: number, at: number): void {
    const p = this.player;
    const level = this.tiles[i]!.level;
    const cost = upgradeCost(i, level);
    if (cost === null || p.cash < cost) {
      if (TILES[i]!.kind === 'city')
        this.emit({ type: 'noUpgrade', player: p.id, tile: i, reason: cost === null ? 'max' : 'cash' });
      this.settle(at, LAND_MS);
      return;
    }
    this.offerTile = i;
    this.extraMs = 0;
    this.set('upgrade', at, this.timed(UPGRADE_MS));
    this.emit({ type: 'upgradeOffer', player: p.id, tile: i, level: level + 1, cost });
  }

  private upgrade(at: number): boolean {
    const i = this.offerTile;
    if (i === null) return false;
    const p = this.player;
    const s = this.tiles[i]!;
    const cost = upgradeCost(i, s.level);
    if (cost === null || p.cash < cost) return false;
    p.cash -= cost;
    s.level++;
    p.stats.built++;
    this.offerTile = null;
    this.emit({ type: 'upgrade', player: p.id, tile: i, level: s.level, cost, free: false });
    this.emit({ type: 'pay', from: p.id, to: null, amount: cost, reason: 'upgrade', tile: i });
    this.settle(at, UPGRADE_STEP_MS);
    return true;
  }

  /**
   * After the rent on a rival's city is paid: offer to take it over when it isn't a Hotel and the
   * visitor's cash covers twice its value. Returns false when there is nothing to offer.
   */
  private offerTakeover(i: number, at: number): boolean {
    const p = this.player;
    const s = this.tiles[i]!;
    if (p.bankrupt || s.owner === null || s.owner === p.id) return false;
    const owner = this.byId.get(s.owner);
    const price = takeoverPrice(this.tiles, i);
    if (!owner || owner.bankrupt || price === null || p.cash < price) return false;
    this.offerTile = i;
    // The rent coins are still flying: the decision starts now, the settle pause is not needed.
    this.extraMs = 0;
    this.set('takeover', at, this.timed(TAKEOVER_MS));
    this.emit({ type: 'takeoverOffer', player: p.id, owner: owner.id, tile: i, price });
    return true;
  }

  private takeover(at: number): boolean {
    const i = this.offerTile;
    if (i === null) return false;
    const p = this.player;
    const s = this.tiles[i]!;
    const owner = s.owner === null ? undefined : this.byId.get(s.owner);
    const price = takeoverPrice(this.tiles, i);
    if (!owner || owner === p || owner.bankrupt || price === null || p.cash < price) return false;
    p.cash -= price;
    owner.cash += price;
    s.owner = p.id;
    p.stats.takeovers++;
    owner.stats.lost++;
    this.offerTile = null;
    this.emit({ type: 'takeover', player: p.id, from: owner.id, tile: i, price, level: s.level });
    this.emit({ type: 'pay', from: p.id, to: owner.id, amount: price, reason: 'takeover', tile: i });
    this.settle(at, TAKEOVER_STEP_MS);
    return true;
  }

  private decline(at: number, what: 'upgrade' | 'takeover', auto: boolean): void {
    const i = this.offerTile;
    this.offerTile = null;
    if (i !== null) this.emit({ type: 'decline', player: this.player.id, tile: i, what, auto });
    this.settle(at, 350);
  }

  private payFine(at: number, auto: boolean): void {
    const p = this.player;
    p.jailed = false;
    this.emit({ type: 'jailPay', player: p.id, auto });
    this.charge(p, TILANG_FINE, null, 'fine', TILANG_TILE);
    if (p.bankrupt) {
      this.settle(at, PAY_MS);
      return;
    }
    this.extraMs = 0;
    this.set('roll', at, this.timed(ROLL_MS));
    this.emit({ type: 'turn', player: p.id, bonus: false });
  }

  private waitOut(at: number, auto: boolean): void {
    const p = this.player;
    p.jailed = false;
    this.emit({ type: 'jailWait', player: p.id, auto });
    this.settle(at, LAND_MS);
  }

  /* ---------------------------------------------------------------- cards */

  private reshuffle(): void {
    this.deckPos = 0;
    if (this.fixedDeck) {
      this.deck = [...this.fixedDeck];
      return;
    }
    const a = [...CARD_IDS];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    this.deck = a;
  }

  private drawCard(): CardId {
    if (this.deckPos >= this.deck.length) this.reshuffle();
    return this.deck[this.deckPos++]!;
  }

  private applyCard(at: number): void {
    const p = this.player;
    const id = this.card ?? 'lomba';
    const e = CARDS[id];
    switch (e.kind) {
      case 'gain':
        this.gain(p, e.amount, 'card', null);
        this.settle(at, PAY_MS);
        return;
      case 'lose':
        this.charge(p, e.amount, null, 'card', null);
        this.settle(at, PAY_MS);
        return;
      case 'repair':
        this.charge(p, Math.max(e.min, e.perLevel * levelsOf(this.tiles, p.id)), null, 'card', null);
        this.settle(at, PAY_MS);
        return;
      case 'collect':
        for (const q of this.players) {
          if (q === p || q.bankrupt) continue;
          this.charge(q, e.amount, p, 'card', null);
        }
        this.settle(at, PAY_MS);
        return;
      case 'treat':
        for (const q of this.players) {
          if (q === p || q.bankrupt || p.bankrupt) continue;
          this.charge(p, e.amount, q, 'card', null);
        }
        this.settle(at, PAY_MS);
        return;
      case 'goto':
        this.walk(stepsTo(p.pos, e.tile) || TILE_COUNT, at);
        return;
      case 'transport': {
        const steps = Math.min(...TRANSPORT_TILES.map((t) => stepsTo(p.pos, t) || TILE_COUNT));
        this.walk(steps, at);
        return;
      }
      case 'back':
        this.walk(-e.steps, at);
        return;
      case 'jail':
        this.sendToJail(at, 'card');
        return;
      case 'upgrade': {
        const options = upgradableCities(this.tiles, p.id);
        if (!options.length) {
          this.gain(p, e.fallback, 'card', null);
          this.settle(at, PAY_MS);
          return;
        }
        if (e.pick === 'choose' && options.length > 1) {
          this.renovateOptions = options;
          this.set('renovate', at, this.timed(RENOVATE_MS));
          const best = bestFreeUpgrade(this.tiles, options) ?? options[0]!;
          this.emit({ type: 'renovateOffer', player: p.id, options, best });
          return;
        }
        const tile =
          e.pick === 'cheapest'
            ? cheapestUpgradable(this.tiles, options)
            : bestFreeUpgrade(this.tiles, options);
        this.freeUpgrade(p, tile ?? options[0]!);
        this.settle(at, PAY_MS);
        return;
      }
    }
  }

  /* ---------------------------------------------------------------- money */

  private gain(p: PlayerState, amount: number, reason: PayReason, tile: number | null, step?: number): void {
    if (amount <= 0) return;
    p.cash += amount;
    this.emit(
      step === undefined
        ? { type: 'pay', from: null, to: p.id, amount, reason, tile }
        : { type: 'pay', from: null, to: p.id, amount, reason, tile, step },
    );
  }

  /**
   * `payer` owes `amount` to `creditor` (null = bank). Short of cash, the bank buys back buildings
   * and properties at half price first; still short, the payer hands over what is left and is
   * bankrupt. Returns what was actually paid.
   */
  charge(
    payer: PlayerState,
    amount: number,
    creditor: PlayerState | null,
    reason: PayReason,
    tile: number | null,
  ): number {
    if (amount <= 0 || payer.bankrupt) return 0;
    if (payer.cash < amount) this.raise(payer, amount);
    const paid = Math.min(payer.cash, amount);
    payer.cash -= paid;
    if (creditor) creditor.cash += paid;
    if (reason === 'rent') {
      payer.stats.rentPaid += paid;
      if (creditor) creditor.stats.rentCollected += paid;
    }
    if (paid > 0)
      this.emit({ type: 'pay', from: payer.id, to: creditor?.id ?? null, amount: paid, reason, tile });
    if (paid < amount) this.goBankrupt(payer, creditor);
    return paid;
  }

  /** One level up for free (cards). */
  private freeUpgrade(p: PlayerState, tile: number): void {
    const s = this.tiles[tile];
    if (!s || s.owner !== p.id || upgradeCost(tile, s.level) === null) return;
    s.level++;
    p.stats.built++;
    this.emit({ type: 'upgrade', player: p.id, tile, level: s.level, cost: 0, free: true });
  }

  /** Renovasi Gotong Royong lands on the picked city. */
  private renovate(tile: number, at: number): void {
    this.freeUpgrade(this.player, tile);
    this.renovateOptions = [];
    this.settle(at, PAY_MS);
  }

  /** Sell to the bank at half price until `need` is in hand or nothing is left. */
  private raise(p: PlayerState, need: number): void {
    for (let guard = 0; guard < 64 && p.cash < need; guard++) {
      const b = this.upgradeToSell(p.id);
      if (b !== null) {
        const s = this.tiles[b]!;
        const amount = (upgradeCost(b, s.level - 1) ?? 0) / 2;
        s.level--;
        p.cash += amount;
        this.extraMs += SELL_MS;
        this.emit({ type: 'sell', player: p.id, tile: b, what: 'building', level: s.level, amount });
        continue;
      }
      const prop = this.propertyToSell(p.id);
      if (prop === null) break;
      const amount = priceOf(prop) / 2;
      this.tiles[prop]!.owner = null;
      this.tiles[prop]!.level = 0;
      p.cash += amount;
      this.extraMs += SELL_MS;
      this.emit({ type: 'sell', player: p.id, tile: prop, what: 'property', level: 0, amount });
    }
  }

  /** The city whose top upgrade is the cheapest (a Rumah is never sold apart from its city). */
  upgradeToSell(id: number): number | null {
    let best: number | null = null;
    let bestKey = Number.POSITIVE_INFINITY;
    this.tiles.forEach((s, i) => {
      if (s.owner !== id || s.level <= 1) return;
      const t = TILES[i]!;
      if (t.kind !== 'city') return;
      // Cheapest top upgrade first, then the cheapest city.
      const key = (upgradeCost(i, s.level - 1) ?? 0) * 1e4 + t.price;
      if (key < bestKey) {
        bestKey = key;
        best = i;
      }
    });
    return best;
  }

  /** Loose properties before whole islands, cheapest first. */
  propertyToSell(id: number): number | null {
    let best: number | null = null;
    let bestKey = Number.POSITIVE_INFINITY;
    this.tiles.forEach((s, i) => {
      if (s.owner !== id) return;
      const t = TILES[i]!;
      if (!isOwnable(t)) return;
      const whole = t.kind === 'city' && ownsGroup(this.tiles, id, t.group);
      const key = (whole ? 1e6 : 0) + t.price;
      if (key < bestKey) {
        bestKey = key;
        best = i;
      }
    });
    return best;
  }

  private goBankrupt(p: PlayerState, creditor: PlayerState | null): void {
    p.bankrupt = true;
    p.jailed = false;
    p.cash = 0;
    p.bankruptOrder = ++this.bankrupts;
    for (const s of this.tiles) {
      if (s.owner === p.id) {
        s.owner = null;
        s.level = 0;
      }
    }
    this.extraMs += BANKRUPT_MS;
    this.emit({ type: 'bankrupt', player: p.id, to: creditor?.id ?? null });
  }

  /* ---------------------------------------------------------------- end */

  private finish(at: number, reason: EndReason): void {
    const top = standings(this)[0];
    this.winner = top && !top.bankrupt ? top.id : null;
    this.endReason = reason;
    this.set('finale', at, FINALE_MS);
    this.emit({ type: 'finish', winner: this.winner, reason });
  }
}

function clampDie(v: number): number {
  return Math.max(1, Math.min(6, Math.floor(Number.isFinite(v) ? v : 1)));
}

export interface Standing {
  id: number;
  rank: number;
  worth: number;
  bankrupt: boolean;
}

/** Players still in by net worth, then bankrupt players, the last to fall first. Ties share a rank. */
export function standings(L: Pick<JuraganLogic, 'players' | 'tiles'>): Standing[] {
  const rows = L.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    worth: p.bankrupt ? 0 : netWorth(p, L.tiles),
    bankrupt: p.bankrupt,
    order: p.bankruptOrder,
  }));
  rows.sort((a, b) => {
    if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
    if (a.bankrupt) return b.order - a.order;
    return b.worth - a.worth || a.seat - b.seat;
  });
  const out: Standing[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const same = prev && !prev.bankrupt && !r.bankrupt && prev.worth === r.worth;
    out.push({ id: r.id, rank: same ? out[i - 1]!.rank : i + 1, worth: r.worth, bankrupt: r.bankrupt });
  });
  return out;
}
