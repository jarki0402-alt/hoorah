/**
 * Long-distance play (owner 2026-11-24), pure part: what the Host's main screen sends a far-away
 * main screen so it draws the same pages itself (no video). One packet carries the shell's display
 * state (`s`, the whole of it, only when it changed), the running game's published state (`g`) and
 * the sounds played since the last packet (`fx`). The far-away screen checks every packet here
 * before it touches its signals.
 */
import type { GameResult, MusicIntensity } from '@hoorah/sdk';
import { GAMES, type GameId } from '../shared/games';
import { type HomeSection, isHomeSection } from '../shared/homeRows';
import type { Party } from './party';
import type { ActiveGame, OfferReason, Page, TutorialRun } from './store';

/** Slices of the Acak wheel and where it lands; `spin` counts the spins so each one plays once. */
export interface WheelSnap {
  slices: GameId[];
  pick: number;
  spin: number;
  /** Where in the picked slice the pointer stops (-0.5 to 0.5). */
  jitter: number;
}

/** What the home page shows beyond the focus: the shelf, the card row on top, the hero, the art. */
export interface HomeSnap {
  shelf: HomeSection;
  top: number;
  pinned: GameId | 'party' | 'random';
  art: { party: GameId[]; wheel: GameId[] };
}

export interface MusicSnap {
  track: string | null;
  intensity: MusicIntensity;
  hurry: boolean;
}

export interface ShellSnap {
  page: Page;
  focus: string;
  selected: GameId;
  tab: HomeSection;
  home: HomeSnap | null;
  wheel: WheelSnap | null;
  inviting: boolean;
  game: ActiveGame | null;
  result: { gameId: GameId; result: GameResult } | null;
  party: Party | null;
  partyRun: number;
  tutorial: TutorialRun | null;
  offer: OfferReason | null;
  adBreak: { next: GameId } | null;
  recent: GameId[];
  music: MusicSnap;
  /**
   * The running game's init settings on the Host's screen (rounds, limited, ...). The far-away copy
   * starts with exactly these: its own player count may differ (Ular Tangga sizes its board by them).
   */
  settings: RunSettings | null;
}

export type GameSettings = Record<string, string | number | boolean>;

export interface RunSettings {
  run: number;
  values: GameSettings;
}

/** The running game's display state, tied to its run so a late packet never feeds the next game. */
export interface GameSnap {
  run: number;
  state: unknown;
}

export interface MirrorPacket {
  s?: ShellSnap;
  g?: GameSnap;
  fx?: string[];
}

/** Sounds one packet may carry (more in 50 ms is noise anyway). */
export const MAX_FX = 16;

/** The path of a far-away main screen link, in capitals like the QR invite (compact QR mode). */
export function mirrorPath(code: string, key: string): string {
  return `/J/${code}-${key}`.toUpperCase();
}

/** Fields of the shell state that differ between two snapshots (all of them without a previous one). */
export function changedKeys(prev: ShellSnap | null, next: ShellSnap): (keyof ShellSnap)[] {
  const keys = Object.keys(next) as (keyof ShellSnap)[];
  if (!prev) return keys;
  return keys.filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
}

/* ------------------------------------------------------------------ checks */

type Obj = Record<string, unknown>;

const PAGES: readonly Page[] = ['join', 'home', 'detail', 'game', 'results', 'party'];
const OFFER_KINDS: readonly OfferReason['kind'][] = ['game', 'party', 'full', 'ended', 'passEnded'];

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isGameId = (v: unknown): v is GameId => typeof v === 'string' && Object.hasOwn(GAMES, v);

function gameList(v: unknown, max: number): GameId[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  return v.every(isGameId) ? (v as GameId[]) : null;
}

function intRecord(v: unknown): Record<number, number> | null {
  if (!isObj(v)) return null;
  const out: Record<number, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (!/^-?\d{1,4}$/.test(k) || typeof n !== 'number' || !Number.isFinite(n)) return null;
    out[Number(k)] = n;
  }
  return out;
}

function parseHome(v: unknown): HomeSnap | null {
  if (!isObj(v) || !isHomeSection(v.shelf) || !isInt(v.top, 0, 100) || !isObj(v.art)) return null;
  const pinned = v.pinned === 'party' || v.pinned === 'random' || isGameId(v.pinned) ? v.pinned : null;
  const party = gameList(v.art.party, 8);
  const wheel = gameList(v.art.wheel, 16);
  if (!pinned || !party || !wheel) return null;
  return { shelf: v.shelf, top: v.top, pinned, art: { party, wheel } };
}

function parseWheel(v: unknown): WheelSnap | null {
  if (!isObj(v)) return null;
  const slices = gameList(v.slices, 16);
  if (!slices || slices.length === 0 || !isInt(v.pick, 0, slices.length - 1)) return null;
  if (!isInt(v.spin, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (typeof v.jitter !== 'number' || !(Math.abs(v.jitter) <= 0.5)) return null;
  return { slices, pick: v.pick, spin: v.spin, jitter: v.jitter };
}

function parseGame(v: unknown): ActiveGame | null {
  if (!isObj(v) || !isGameId(v.id) || !isInt(v.run, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (typeof v.ready !== 'boolean' || typeof v.paused !== 'boolean') return null;
  return { id: v.id, run: v.run, ready: v.ready, paused: v.paused };
}

function parseResult(v: unknown): ShellSnap['result'] {
  if (!isObj(v) || !isGameId(v.gameId) || !isObj(v.result)) return null;
  const r = v.result;
  if (typeof r.title !== 'string' || !Array.isArray(r.ranking)) return null;
  const rankingOk = r.ranking.every(
    (x) =>
      isObj(x) &&
      isInt(x.playerId, -255, 255) &&
      typeof x.score === 'number' &&
      isInt(x.rank, 0, 1000) &&
      (x.label === undefined || typeof x.label === 'string'),
  );
  if (!rankingOk) return null;
  if (r.subtitle !== undefined && typeof r.subtitle !== 'string') return null;
  if (r.awards !== undefined && !Array.isArray(r.awards)) return null;
  if (r.cpuPlayers !== undefined && !Array.isArray(r.cpuPlayers)) return null;
  // The rest is drawn as text by the results page; it comes from the Host's own main screen.
  return { gameId: v.gameId, result: r as unknown as GameResult };
}

function parseParty(v: unknown): Party | null {
  if (!isObj(v)) return null;
  const lineup = gameList(v.lineup, 8);
  const points = intRecord(v.points);
  const gained = intRecord(v.gained);
  if (!lineup || lineup.length === 0 || !points || !gained) return null;
  if (!isInt(v.index, 0, lineup.length - 1) || !isInt(v.scored, 0, lineup.length)) return null;
  return { lineup, index: v.index, points, gained, scored: v.scored };
}

function parseTutorial(v: unknown): TutorialRun | null {
  if (!isObj(v) || !isGameId(v.id) || (v.mode !== 'intro' && v.mode !== 'view')) return null;
  if (!Array.isArray(v.ready) || v.ready.length > 32 || !v.ready.every((x) => isInt(x, 1, 255))) return null;
  return { id: v.id, mode: v.mode, ready: v.ready as number[] };
}

function parseOffer(v: unknown): OfferReason | null {
  if (!isObj(v) || !(OFFER_KINDS as readonly unknown[]).includes(v.kind)) return null;
  if (v.kind === 'game') return isGameId(v.game) ? { kind: 'game', game: v.game } : null;
  return { kind: v.kind as Exclude<OfferReason['kind'], 'game'> };
}

function parseMusic(v: unknown): MusicSnap | null {
  if (!isObj(v) || typeof v.hurry !== 'boolean' || !isInt(v.intensity, 0, 3)) return null;
  if (v.track !== null && (typeof v.track !== 'string' || v.track.length > 32)) return null;
  return { track: v.track, intensity: v.intensity as MusicIntensity, hurry: v.hurry };
}

/** `null` stays null; anything else must pass `parse`. Undefined when it does not. */
function nullable<T>(v: unknown, parse: (x: unknown) => T | null): T | null | undefined {
  if (v === null) return null;
  const out = parse(v);
  return out === null ? undefined : out;
}

/** The shell state from a packet, or null when anything is off. */
export function parseShellSnap(v: unknown): ShellSnap | null {
  if (!isObj(v)) return null;
  if (!(PAGES as readonly unknown[]).includes(v.page)) return null;
  if (typeof v.focus !== 'string' || v.focus.length > 80) return null;
  if (!isGameId(v.selected) || !isHomeSection(v.tab) || typeof v.inviting !== 'boolean') return null;
  if (!isInt(v.partyRun, 0, Number.MAX_SAFE_INTEGER)) return null;
  const home = nullable(v.home, parseHome);
  const wheel = nullable(v.wheel, parseWheel);
  const game = nullable(v.game, parseGame);
  const result = nullable(v.result, parseResult);
  const party = nullable(v.party, parseParty);
  const tutorial = nullable(v.tutorial, parseTutorial);
  const offer = nullable(v.offer, parseOffer);
  const adBreak = nullable(v.adBreak, (x) => (isObj(x) && isGameId(x.next) ? { next: x.next } : null));
  const recent = gameList(v.recent, 8);
  const music = parseMusic(v.music);
  const settings = nullable(v.settings, parseRunSettings);
  if (
    home === undefined ||
    wheel === undefined ||
    game === undefined ||
    result === undefined ||
    party === undefined ||
    tutorial === undefined ||
    offer === undefined ||
    adBreak === undefined ||
    settings === undefined ||
    !recent ||
    !music
  ) {
    return null;
  }
  return {
    page: v.page as Page,
    focus: v.focus,
    selected: v.selected,
    tab: v.tab,
    home,
    wheel,
    inviting: v.inviting,
    game,
    result,
    party,
    partyRun: v.partyRun,
    tutorial,
    offer,
    adBreak,
    recent,
    music,
    settings,
  };
}

function parseRunSettings(v: unknown): RunSettings | null {
  if (!isObj(v) || !isInt(v.run, 0, Number.MAX_SAFE_INTEGER) || !isObj(v.values)) return null;
  const entries = Object.entries(v.values);
  if (entries.length > 16) return null;
  const values: GameSettings = {};
  for (const [k, x] of entries) {
    if (k.length > 32) return null;
    if (typeof x === 'boolean' || (typeof x === 'string' && x.length <= 64)) values[k] = x;
    else if (typeof x === 'number' && Number.isFinite(x)) values[k] = x;
    else return null;
  }
  return { run: v.run, values };
}

/** A packet from the Host's main screen; parts that fail their check are dropped one by one. */
export function parseMirrorPacket(v: unknown): MirrorPacket | null {
  if (!isObj(v)) return null;
  const out: MirrorPacket = {};
  if (v.s !== undefined) {
    const s = parseShellSnap(v.s);
    if (s) out.s = s;
  }
  if (isObj(v.g) && isInt(v.g.run, 0, Number.MAX_SAFE_INTEGER) && 'state' in v.g) {
    out.g = { run: v.g.run, state: v.g.state };
  }
  if (Array.isArray(v.fx)) {
    const fx = v.fx
      .filter((n): n is string => typeof n === 'string' && /^[a-z][a-z-]{0,23}$/.test(n))
      .slice(0, MAX_FX);
    if (fx.length > 0) out.fx = fx;
  }
  return out.s || out.g || out.fx ? out : null;
}
