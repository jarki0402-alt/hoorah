/**
 * Automatic game length. Nobody picks a mode or a duration: the main screen passes
 * `settings.rounds` from here when a game starts. Every game reads `rounds` with its own meaning
 * (noted per entry); the values keep sessions short and always lead to a clear ending.
 */
import type { GameId } from './games';

type Rule = (humans: number) => number;

const RULES: Record<GameId, Rule> = {
  // Rounds, best of N (45 s each). Best of 3 leaves room for a comeback, about 3 minutes.
  tarik: () => 3,
  // Questions (15 s each plus reveal). With more phones it is rarer that everyone locks in early,
  // so each question runs closer to its full time and a crowd gets fewer questions. Solo always
  // gets 10, which keeps its personal records comparable.
  kuis: (n) => (n <= 3 ? 10 : n <= 7 ? 8 : 6),
  // Towers. One tower: whoever topples it loses. A bigger group already means more turns.
  rusun: () => 1,
  // Laps of the race (the in-game menu still picks the race type). 3 is what the tracks are tuned
  // for: enough room to overtake, short enough to stay snappy.
  bajaj: () => 3,
  // Dishes (1–3). Everyone cooks at once, so player count does not change the length; three dishes
  // plus the final showcase.
  masak: () => 3,
  // Board size (50 or 100 squares). 50 keeps the race to the top short even with 6 players.
  ular: () => 50,
  // Babak. One babak: the fullest store wins.
  congklak: () => 1,
  // Rounds (45 s each). Three, so a bad first round can still be won back.
  kerupuk: () => 3,
  // Races (up to 60 s each) with points per place. Three races, the points decide.
  karung: () => 3,
  // Questions (15 s each plus reveal), same pacing as Kuis: a pair or trio gets 10 to test how in
  // sync they are, a crowd gets fewer because waiting for every phone takes longer.
  kompak: (n) => (n <= 3 ? 10 : n <= 7 ? 8 : 6),
  // Pawns per player (2 or 4). Two keeps a game of Ludo short; four runs long.
  ludo: () => 2,
  // Minutes per side (blitz with increment). Solo or a duel: 3. Three or more humans play Catur
  // Rame, where every move waits for a team vote that runs on the clock, so 5.
  catur: (n) => (n <= 2 ? 3 : 5),
  // Round length in minutes. Three: enough to grow long, the longest snake at the bell wins.
  arena: () => 3,
  // Round length in minutes. Three: the field already grows with the number of players.
  wilayah: () => 3,
  // 1 = Sprint (90 s, distance and coins), 2 = Bertahan (last runner standing). Solo plays Sprint:
  // Bertahan ends the moment the only human trips, which can be after a few seconds. With two or
  // more humans Bertahan gives the dramatic last-one-standing finish, and the rising speed always
  // ends it.
  lari: (n) => (n <= 1 ? 1 : 2),
  // Lives per player (1–5). Turns go one player at a time, so a big group with 3 lives each drags;
  // from 4 humans everyone gets 2.
  kata: (n) => (n <= 3 ? 3 : 2),
  // Putaran (laps of the board), then the richest wins. Fewer per player as the group grows, so
  // every game takes about as long.
  juragan: (n) => (n <= 2 ? 14 : n <= 4 ? 12 : 10),
  // Not read: the Host picks the kitchen and difficulty inside the game; one round is about three
  // minutes whatever the head count (more cooks get more orders instead).
  dapur: () => 1,
  // Not playable yet (segera hadir); no game reads these.
  gambar: () => 1,
  panjat: () => 1,
};

/** `settings.rounds` for a game with this many human players (bad counts are treated as 1). */
export function autoRounds(gameId: GameId, humanPlayers: number): number {
  const humans = Number.isFinite(humanPlayers) ? Math.max(1, Math.floor(humanPlayers)) : 1;
  return RULES[gameId](humans);
}
