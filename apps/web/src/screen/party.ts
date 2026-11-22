/**
 * Mode Pesta: a few games in a row with one party table across them (pure logic). Every game's
 * ranking turns into party points; the last game counts double, so the table stays open until
 * the end. Computer opponents (negative ids) play along but never enter the table.
 */
import { CATALOG, GAMES, type GameId, type GameMood } from '../shared/games';

/** Games in one party. */
export const PARTY_GAMES = 3;

export interface PartyRanking {
  playerId: number;
  rank: number;
}

export interface Party {
  lineup: GameId[];
  /** Index of the game being played (or just finished) in `lineup`. */
  index: number;
  /** Party points per player id, summed over finished games. */
  points: Record<number, number>;
  /** Games of the lineup already scored (a replay never scores twice). */
  scored: number;
}

const fits = (id: GameId, n: number): boolean =>
  GAMES[id].available && n >= GAMES[id].minPlayers && n <= GAMES[id].maxPlayers;

/**
 * A lineup for this many players: playable games, each from a different mood where possible (a
 * party feels varied), skipping the games just played, in a random order. Fewer playable games
 * than `PARTY_GAMES` gives a shorter party; none gives an empty lineup.
 */
export function pickLineup(
  players: number,
  recent: readonly string[],
  rand: () => number = Math.random,
): GameId[] {
  const n = Math.max(1, players);
  const ok = CATALOG.filter((id) => fits(id, n));
  const fresh = ok.filter((id) => !recent.includes(id));
  const pool = shuffle(fresh.length >= PARTY_GAMES ? fresh : ok, rand);
  const out: GameId[] = [];
  const moods = new Set<GameMood>();
  for (const id of pool) {
    if (out.length >= PARTY_GAMES) break;
    if (moods.has(GAMES[id].mood)) continue;
    out.push(id);
    moods.add(GAMES[id].mood);
  }
  for (const id of pool) {
    if (out.length >= PARTY_GAMES) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function newParty(lineup: readonly GameId[]): Party {
  return { lineup: [...lineup], index: 0, points: {}, scored: 0 };
}

export function isFinalGame(p: Party): boolean {
  return p.index >= p.lineup.length - 1;
}

/** Points for a place: 1st 3, 2nd 2, everyone else who played 1; doubled in the final game. */
export function placePoints(rank: number, final: boolean): number {
  const base = rank <= 1 ? 3 : rank === 2 ? 2 : 1;
  return final ? base * 2 : base;
}

/**
 * Adds a finished game to the table. Only the current lineup game scores, and only once, so
 * a game quit and replayed (or a stray result) cannot inflate the table.
 */
export function scoreGame(p: Party, gameId: GameId, ranking: readonly PartyRanking[]): Party {
  if (p.lineup[p.index] !== gameId || p.scored > p.index) return p;
  const final = isFinalGame(p);
  const points = { ...p.points };
  for (const r of ranking) {
    if (r.playerId <= 0) continue;
    points[r.playerId] = (points[r.playerId] ?? 0) + placePoints(r.rank, final);
  }
  return { ...p, points, scored: p.index + 1 };
}

/** Moves on to the next game; null once the lineup is done. */
export function advance(p: Party): Party | null {
  return p.index + 1 < p.lineup.length ? { ...p, index: p.index + 1 } : null;
}

export interface Standing {
  playerId: number;
  points: number;
  rank: number;
}

/** The party table, best first; equal points share a rank. Players without points are listed too. */
export function standings(p: Party, playerIds: readonly number[]): Standing[] {
  const ids = [...new Set([...playerIds.filter((id) => id > 0), ...Object.keys(p.points).map(Number)])];
  const rows = ids.map((playerId) => ({ playerId, points: p.points[playerId] ?? 0 }));
  rows.sort((a, b) => b.points - a.points || a.playerId - b.playerId);
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => o.points > r.points).length }));
}
