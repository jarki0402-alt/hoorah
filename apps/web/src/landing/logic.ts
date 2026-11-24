/**
 * Pure helpers of the landing page: room code typing, the game showcase filter and drift, scroll
 * progress, count-up easing and the remote-control (arrow key) navigation geometry. No DOM here,
 * so every rule is unit tested.
 */
import { isFruit, type NearbyRoom, normalizeRoomCode, ROOM_CODE_LENGTH } from '@hoorah/protocol';
import { CATALOG, GAMES, type GameId, type GameMood } from '../shared/games';

/* ------------------------------------------------------------------ room code */

/** The code as typed so far, shown in two groups like the main screen shows it ("482 917"). */
export function formatCodeInput(raw: string): string {
  const d = normalizeRoomCode(raw);
  return d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
}

/** The six digits of a complete code, or null while it is incomplete. */
export function completeCode(raw: string): string | null {
  const d = normalizeRoomCode(raw);
  return d.length === ROOM_CODE_LENGTH ? d : null;
}

/** The invite link a phone opens to join (`/R/482917`, the same link the main screen's QR holds). */
export function joinPath(raw: string): string | null {
  const code = completeCode(raw);
  return code ? `/R/${code}` : null;
}

/** Keeps the well-formed rooms of a `/api/nearby` answer (players with unknown fruits dropped). */
export function parseNearby(v: unknown, max = 3): NearbyRoom[] {
  if (!Array.isArray(v)) return [];
  const out: NearbyRoom[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.code !== 'string' || completeCode(r.code) !== r.code || !Array.isArray(r.players)) continue;
    const players: NearbyRoom['players'] = [];
    for (const p of r.players as unknown[]) {
      if (typeof p !== 'object' || p === null) continue;
      const q = p as Record<string, unknown>;
      if (typeof q.name === 'string' && isFruit(q.fruit) && typeof q.color === 'string') {
        players.push({ name: q.name, fruit: q.fruit, color: q.color });
      }
    }
    const seatsLeft = typeof r.seatsLeft === 'number' ? r.seatsLeft : 0;
    out.push({ code: r.code, players, seatsLeft });
    if (out.length === max) break;
  }
  return out;
}

/* ------------------------------------------------------------------ games */

export type MoodFilter = 'all' | GameMood;

/** Filter chips in the order the page shows them. */
export const MOOD_FILTERS: readonly MoodFilter[] = ['all', 'heboh', 'otak', 'ramai', 'santai'];

/** Playable games in catalog order. */
export function playableCatalog(): GameId[] {
  return CATALOG.filter((id) => GAMES[id].available);
}

/** The games a mood chip shows, catalog order kept. */
export function filterGames(ids: readonly GameId[], mood: MoodFilter): GameId[] {
  return ids.filter((id) => mood === 'all' || GAMES[id].mood === mood);
}

/** Deals the games into two rows, alternating, so both rows mix the catalog. */
export function splitRows<T>(items: readonly T[]): [T[], T[]] {
  const a: T[] = [];
  const b: T[] = [];
  items.forEach((item, i) => {
    (i % 2 === 0 ? a : b).push(item);
  });
  return [a, b];
}

/** Games the hero's screen cycles through: the featured ones first, then a few newer ones. */
export const HERO_GAMES: readonly GameId[] = [
  'bajaj',
  'tarik',
  'masak',
  'kuis',
  'obby',
  'ludo',
  'lari',
  'warna',
];

/** Games Mode Pesta may pick: playable and not long (a party stays near half an hour). */
export function partyPool(): GameId[] {
  return playableCatalog().filter((id) => !GAMES[id].long);
}

/** `n` different games from `pool` in random order (a partial Fisher-Yates shuffle). */
export function pickGames(pool: readonly GameId[], n: number, random: () => number): GameId[] {
  const a = [...pool];
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(random() * (a.length - i));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a.slice(0, k);
}

/** The next index of a cycle of `n` items. */
export function nextIndex(i: number, n: number): number {
  return n > 0 ? (i + 1) % n : 0;
}

/* ------------------------------------------------------------------ scroll and motion */

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * How far a section has travelled through the viewport: 0 when its top meets the bottom of the
 * screen, 1 when its bottom leaves at the top.
 */
export function sectionProgress(top: number, height: number, viewport: number): number {
  const total = height + viewport;
  if (total <= 0) return 0;
  return clamp((viewport - top) / total, 0, 1);
}

/**
 * Horizontal offset of a showcase row. A row wider than the screen drifts across its whole
 * overflow as the section scrolls by (the second row the other way), so every card passes by;
 * a row that fits is centered and stays still.
 */
export function driftOffset(
  progress: number,
  trackWidth: number,
  viewWidth: number,
  reverse: boolean,
): number {
  const overflow = trackWidth - viewWidth;
  if (overflow <= 0) return -overflow / 2;
  const p = clamp(progress, 0, 1);
  return -overflow * (reverse ? 1 - p : p);
}

/** Row offset that brings a focused card to the middle of the screen, kept inside the row. */
export function pinOffset(
  cardLeft: number,
  cardWidth: number,
  trackWidth: number,
  viewWidth: number,
): number {
  const overflow = trackWidth - viewWidth;
  if (overflow <= 0) return -overflow / 2;
  return clamp(viewWidth / 2 - (cardLeft + cardWidth / 2), -overflow, 0);
}

/** Which of `n` steps a progress of 0..1 shows. */
export function stepAt(progress: number, n: number): number {
  if (n <= 0) return 0;
  return clamp(Math.floor(clamp(progress, 0, 1) * n), 0, n - 1);
}

export function easeOutCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) ** 3;
}

/** The number a count-up shows `elapsed` ms into a run of `duration` ms. */
export function countUp(elapsed: number, duration: number, target: number): number {
  if (duration <= 0) return target;
  return Math.round(target * easeOutCubic(elapsed / duration));
}

/* ------------------------------------------------------------------ remote-control navigation */

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const ARROWS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
};

/** The direction of an arrow key (old Smart TV browsers send `Up`, `Down` and so on). */
export function arrowDir(key: string): Dir | null {
  return ARROWS[key] ?? null;
}

/** Gap between two intervals, 0 when they overlap. */
function gap(a0: number, a1: number, b0: number, b1: number): number {
  if (b1 < a0) return a0 - b1;
  if (b0 > a1) return b0 - a1;
  return 0;
}

/**
 * The box a remote's arrow moves to from `from`: the nearest one lying in that direction, preferring
 * boxes in line with the current one. Returns the index in `boxes`, or -1 when nothing is there.
 */
export function pickNeighbor(from: Box, boxes: readonly Box[], dir: Dir): number {
  const fcx = (from.left + from.right) / 2;
  const fcy = (from.top + from.bottom) / 2;
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  boxes.forEach((b, i) => {
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    let ahead: boolean;
    let along: number;
    let across: number;
    switch (dir) {
      case 'down':
        ahead = b.top >= fcy && cy > fcy + 1;
        along = Math.max(0, b.top - from.bottom);
        across = gap(from.left, from.right, b.left, b.right) + Math.abs(cx - fcx) * 0.1;
        break;
      case 'up':
        ahead = b.bottom <= fcy && cy < fcy - 1;
        along = Math.max(0, from.top - b.bottom);
        across = gap(from.left, from.right, b.left, b.right) + Math.abs(cx - fcx) * 0.1;
        break;
      case 'right':
        ahead = b.left >= fcx && cx > fcx + 1;
        along = Math.max(0, b.left - from.right);
        across = gap(from.top, from.bottom, b.top, b.bottom) + Math.abs(cy - fcy) * 0.1;
        break;
      case 'left':
        ahead = b.right <= fcx && cx < fcx - 1;
        along = Math.max(0, from.left - b.right);
        across = gap(from.top, from.bottom, b.top, b.bottom) + Math.abs(cy - fcy) * 0.1;
        break;
    }
    if (!ahead) return;
    const score = along + across * 4;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
