/**
 * The computer players' head for Juragan Nusantara (PRD 6.4). They play a solo human's opponents
 * and take over a seat whose phone dropped mid-game. Pure: the board comes in, a decision comes
 * out. Sharper players keep cash for the rents waiting ahead, complete islands, push cities towards
 * a Hotel (safe from takeovers) and only take a rival's city when the rent it brings, the island it
 * completes or the island it breaks is worth the double price. Gentler ones buy, upgrade and take
 * over on impulse. Every choice goes through `pickWithSlips` so the computer sometimes slips like a
 * person, but never into a choice that leaves it unable to pay the rent waiting ahead.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import { bySkill, pickWithSlips, soloOpponents, thinkMs } from '../common/cpu';
import { GROUP_TILES, isOwnable, MAX_LEVEL, TILANG_FINE, TILES } from './board';
import {
  ownsGroup,
  type PlayerState,
  rentAt,
  type TileState,
  takeoverPrice,
  upgradeCost,
  upgradeGain,
} from './logic';

/** Solo play: two opponents (a lively board, short waits); two or more humans: none. */
export function juraganOpponents(
  humans: readonly PlayerInfo[],
  rnd: () => number = Math.random,
): PlayerInfo[] {
  return soloOpponents(humans, 2, rnd);
}

export interface BoardView {
  players: readonly PlayerState[];
  tiles: readonly TileState[];
  /** Putaran still to play (fractions allowed). Unknown: plans for a mid-game board. */
  roundsLeft?: number;
}

/** Rolls per turn on average (doubles roll again). */
const ROLLS_PER_TURN = 1.17;
/** Putaran assumed left when the view doesn't say. */
const ROUNDS_GUESS = 8;

/** Rival landings expected on any one tile for the rest of the game. */
export function visitsAhead(view: BoardView, me: PlayerState): number {
  const rivals = view.players.filter((p) => !p.bankrupt && p.id !== me.id).length;
  const rounds = Math.max(0, view.roundsLeft ?? ROUNDS_GUESS);
  return (rivals * rounds * ROLLS_PER_TURN) / TILES.length;
}

/** The steepest rent owned by someone else within reach of the next roll (2..12 steps ahead). */
export function dangerAhead(view: BoardView, me: PlayerState): number {
  let worst = 0;
  for (let d = 2; d <= 12; d++) {
    const i = (me.pos + d) % TILES.length;
    const s = view.tiles[i]!;
    if (s.owner === null || s.owner === me.id) continue;
    worst = Math.max(worst, rentAt(view.tiles, i));
  }
  return worst;
}

/** Cash the computer wants to keep in hand after spending. */
export function reserveFor(view: BoardView, me: PlayerState, skill: number): number {
  const danger = dangerAhead(view, me);
  return Math.round(bySkill(skill, 60, 100 + danger * 0.9));
}

/** How the purchase changes the island: completes it for me, or blocks someone who holds the rest. */
export function groupEffect(view: BoardView, me: PlayerState, tile: number): 'complete' | 'block' | 'none' {
  const t = TILES[tile]!;
  if (t.kind !== 'city') return 'none';
  const others = GROUP_TILES[t.group].filter((i) => i !== tile).map((i) => view.tiles[i]!.owner);
  if (others.every((o) => o === me.id)) return 'complete';
  const rival = others[0];
  if (rival !== null && rival !== undefined && rival !== me.id && others.every((o) => o === rival))
    return 'block';
  return 'none';
}

export function shouldBuy(
  view: BoardView,
  me: PlayerState,
  tile: number,
  skill: number,
  rnd: () => number = Math.random,
): boolean {
  const t = TILES[tile]!;
  if (!isOwnable(t) || me.cash < t.price) return false;
  const left = me.cash - t.price;
  const effect = groupEffect(view, me, tile);
  const reserve = reserveFor(view, me, skill);
  // Completing an island is worth dipping into the reserve; blocking a rival nearly so.
  const need = effect === 'complete' ? reserve * 0.35 : effect === 'block' ? reserve * 0.6 : reserve;
  const good = left >= need;
  return pickWithSlips(good ? ['buy', 'skip'] : ['skip', 'buy'], skill, rnd) === 'buy';
}

/** Cash below which no choice (not even a slip) may go: half the steepest rent within one roll. */
function floorFor(view: BoardView, me: PlayerState): number {
  return dangerAhead(view, me) * 0.5;
}

/** Landed on an own city: go one level up? */
export function shouldUpgrade(
  view: BoardView,
  me: PlayerState,
  tile: number,
  skill: number,
  rnd: () => number = Math.random,
): boolean {
  const s = view.tiles[tile];
  if (!s || s.owner !== me.id) return false;
  const cost = upgradeCost(tile, s.level);
  if (cost === null || me.cash < cost) return false;
  const left = me.cash - cost;
  if (left < floorFor(view, me)) return false;
  // A Hotel can't be taken over any more: worth dipping into the reserve for.
  const reserve = reserveFor(view, me, skill) * (s.level + 1 >= MAX_LEVEL ? 0.7 : 1);
  const good = left >= reserve;
  return pickWithSlips(good ? ['upgrade', 'skip'] : ['skip', 'upgrade'], skill, rnd) === 'upgrade';
}

/**
 * What taking over `tile` is worth to `me` against what it costs: the rent it brings for the rest
 * of the game (with the island doubling when it completes one), the rent the owner loses (their
 * island broken), and a bonus for completing an island, all set against the value handed over.
 */
export function takeoverScore(view: BoardView, me: PlayerState, tile: number, skill: number): number {
  const t = TILES[tile]!;
  const price = takeoverPrice(view.tiles, tile);
  if (t.kind !== 'city' || price === null) return Number.NEGATIVE_INFINITY;
  const value = price / 2;
  const visits = visitsAhead(view, me);
  const after = view.tiles.map((s, i) => (i === tile ? { owner: me.id, level: s.level } : s));
  const group = GROUP_TILES[t.group];
  const completes = ownsGroup(after, me.id, t.group);
  let gain = rentAt(after, tile) * visits;
  let denial = rentAt(view.tiles, tile) * visits;
  for (const k of group) {
    if (k === tile) continue;
    const before = rentAt(view.tiles, k);
    const now = rentAt(after, k);
    if (view.tiles[k]!.owner === me.id) gain += (now - before) * visits;
    else denial += (before - now) * visits;
  }
  // A whole island also makes every later upgrade there pay double.
  const bonus = completes ? value * bySkill(skill, 0.9, 0.6) : 0;
  // Sharper players count the value handed to the rival in full; gentler ones shrug it off.
  return gain + denial * 0.6 + bonus - value * bySkill(skill, 0.55, 1.05);
}

/** After paying rent on a rival's city: take it over for twice its value? */
export function shouldTakeover(
  view: BoardView,
  me: PlayerState,
  tile: number,
  skill: number,
  rnd: () => number = Math.random,
): boolean {
  const price = takeoverPrice(view.tiles, tile);
  const s = view.tiles[tile];
  if (price === null || !s || s.owner === null || s.owner === me.id || me.cash < price) return false;
  const left = me.cash - price;
  if (left < floorFor(view, me)) return false;
  const t = TILES[tile]!;
  const completes =
    t.kind === 'city' && GROUP_TILES[t.group].every((k) => k === tile || view.tiles[k]!.owner === me.id);
  const reserve = reserveFor(view, me, skill) * (completes ? 0.5 : 0.85);
  const good = left >= reserve && takeoverScore(view, me, tile, skill) >= 0;
  return pickWithSlips(good ? ['takeover', 'skip'] : ['skip', 'takeover'], skill, rnd) === 'takeover';
}

/** At Pos Tilang: pay to keep buying while the board is open; sit tight once it is full of rents. */
export function jailChoice(
  view: BoardView,
  me: PlayerState,
  skill: number,
  rnd: () => number = Math.random,
): 'pay' | 'wait' {
  const open = view.tiles.filter((s, i) => s.owner === null && isOwnable(TILES[i]!)).length;
  const reserve = reserveFor(view, me, skill);
  const pay = me.cash - TILANG_FINE >= reserve && open >= 3;
  return pickWithSlips(pay ? ['pay', 'wait'] : ['wait', 'pay'], skill, rnd) as 'pay' | 'wait';
}

/**
 * Renovasi Gotong Royong: which of `options` gets the free level. Ranked by the rent it adds, a
 * new Hotel counting half as much again (it can't be taken over any more); slips pick another.
 */
export function chooseRenovate(
  view: BoardView,
  options: readonly number[],
  skill: number,
  rnd: () => number = Math.random,
): number {
  const score = (i: number): number => {
    const level = view.tiles[i]?.level ?? 0;
    return upgradeGain(view.tiles, i) * (level + 1 >= MAX_LEVEL ? 1.5 : 1);
  };
  const ranked = options
    .filter((i) => upgradeCost(i, view.tiles[i]?.level ?? 0) !== null)
    .sort((a, b) => score(b) - score(a) || a - b);
  if (!ranked.length) return options[0] ?? -1;
  return pickWithSlips(ranked, skill, rnd);
}

export type BrainAct = 'roll' | 'buy' | 'upgrade' | 'takeover' | 'renovate' | 'jail';

/**
 * How long the computer waits before acting (ms). A seat whose phone dropped (`standIn`) plays at a
 * steady 1.2–2.4 s pace.
 */
export function actDelay(
  kind: BrainAct,
  skill: number,
  standIn: boolean,
  rnd: () => number = Math.random,
): number {
  if (standIn) return Math.round(1200 + rnd() * 1200);
  switch (kind) {
    case 'roll':
      return thinkMs(skill, 650, 1400, rnd);
    case 'buy':
      return thinkMs(skill, 900, 2100, rnd);
    case 'upgrade':
      return thinkMs(skill, 800, 1800, rnd);
    case 'takeover':
      // Spending double on a rival's city deserves a longer look.
      return thinkMs(skill, 1100, 2400, rnd);
    case 'renovate':
      return thinkMs(skill, 1000, 2200, rnd);
    case 'jail':
      return thinkMs(skill, 900, 1800, rnd);
  }
}
