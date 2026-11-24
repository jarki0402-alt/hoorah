/**
 * Mode Pesta: five games in a row with one party table across them (pure logic). The lineup is
 * drawn fresh on every start and stays hidden: each game is revealed on the main screen just
 * before it is played. Every game's ranking turns into party points; the last game (Grand Final)
 * counts double, so the table stays open until the end. Long games (catalog `long`) never join a
 * party, so one stays near half an hour. Computer opponents (negative ids) play along but never
 * enter the table.
 */
import { CATALOG, GAMES, type GameId, type GameMood, playsRemote } from '../shared/games';

/** Games in one party. */
export const PARTY_GAMES = 5;

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
  /** Points each player got from the last scored game (the table shows them as "+3"). */
  gained: Record<number, number>;
  /** Games of the lineup already scored (a replay never scores twice). */
  scored: number;
}

/**
 * Games a party can draw from for this many players: playable, fitting and not long. `remoteOnly`:
 * a far-away main screen watches, so only games it can show.
 */
export function partyPool(players: number, remoteOnly = false): GameId[] {
  const n = Math.max(1, players);
  return CATALOG.filter((id) => {
    const g = GAMES[id];
    return (
      g.available && !g.long && n >= g.minPlayers && n <= g.maxPlayers && (!remoteOnly || playsRemote(id))
    );
  });
}

/**
 * A lineup for this many players: games from the party pool, each mood once before any repeats
 * (a party feels varied), skipping the games just played where enough others are left, in a
 * random order. A pool smaller than `PARTY_GAMES` gives a shorter party; none gives an empty one.
 */
export function pickLineup(
  players: number,
  recent: readonly string[],
  rand: () => number = Math.random,
  remoteOnly = false,
): GameId[] {
  const ok = partyPool(players, remoteOnly);
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
  // The mood pass put one of each first; shuffle again so the order does not follow the moods.
  return shuffle(out, rand);
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
  return { lineup: [...lineup], index: 0, points: {}, gained: {}, scored: 0 };
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
  const gained: Record<number, number> = {};
  for (const r of ranking) {
    if (r.playerId <= 0) continue;
    const add = placePoints(r.rank, final);
    gained[r.playerId] = add;
    points[r.playerId] = (points[r.playerId] ?? 0) + add;
  }
  return { ...p, points, gained, scored: p.index + 1 };
}

/** Moves on to the next game; null once the lineup is done. */
export function advance(p: Party): Party | null {
  return p.index + 1 < p.lineup.length ? { ...p, index: p.index + 1 } : null;
}

/**
 * Where the party stands between games. `reveal` is the lineup slot to show next (and play), or
 * null once every game is scored and only the champion is left to announce. `played` counts the
 * games already scored.
 */
export interface PartyStep {
  reveal: number | null;
  played: number;
}

export function partyStep(p: Party): PartyStep {
  const played = Math.min(p.scored, p.lineup.length);
  if (played >= p.lineup.length) return { reveal: null, played };
  // A scored current game means the next slot; otherwise the current one is still to play.
  return { reveal: p.scored > p.index ? p.index + 1 : p.index, played };
}

/** Points-free move to the slot `partyStep` revealed, ready to start that game. */
export function moveTo(p: Party, slot: number): Party {
  return slot === p.index ? p : { ...p, index: Math.max(0, Math.min(slot, p.lineup.length - 1)) };
}

export interface Standing {
  playerId: number;
  points: number;
  rank: number;
}

/** The party table, best first; equal points share a rank. Players without points are listed too. */
export function standings(p: Party, playerIds: readonly number[]): Standing[] {
  return rankRows(p.points, playerIds);
}

function rankRows(points: Record<number, number>, playerIds: readonly number[]): Standing[] {
  const ids = [...new Set([...playerIds.filter((id) => id > 0), ...Object.keys(points).map(Number)])];
  const rows = ids.map((playerId) => ({ playerId, points: points[playerId] ?? 0 }));
  rows.sort((a, b) => b.points - a.points || a.playerId - b.playerId);
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => o.points > r.points).length }));
}

/**
 * The most notable overtake of the last scored game: the player who climbed past someone that
 * was strictly ahead of them before it and is now strictly behind. The climber who rose the most
 * places wins; null when nobody passed anybody.
 */
export function lastOvertake(p: Party, playerIds: readonly number[]): { by: number; passed: number } | null {
  const before: Record<number, number> = {};
  for (const [id, pts] of Object.entries(p.points)) before[Number(id)] = pts - (p.gained[Number(id)] ?? 0);
  const was = new Map(rankRows(before, playerIds).map((r) => [r.playerId, r]));
  const now = rankRows(p.points, playerIds);
  let best: { by: number; passed: number; rise: number } | null = null;
  for (const r of now) {
    const old = was.get(r.playerId);
    if (!old || !(p.gained[r.playerId] ?? 0)) continue;
    const rise = old.rank - r.rank;
    if (rise <= 0) continue;
    // Someone who was ahead before and is now behind: the first such one under the climber.
    const passed = now.find(
      (o) =>
        o.playerId !== r.playerId &&
        o.points < r.points &&
        (was.get(o.playerId)?.points ?? 0) > (old.points ?? 0),
    );
    if (passed && (!best || rise > best.rise)) best = { by: r.playerId, passed: passed.playerId, rise };
  }
  return best ? { by: best.by, passed: best.passed } : null;
}
