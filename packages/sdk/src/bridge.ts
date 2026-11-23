import type { ControllerToGame, ControllerView, PlayerInfo, RelayedInput } from '@hoorah/protocol';

/** Message tag so we never confuse our postMessage traffic with anything else on the page. */
export const BRIDGE_TAG = 'hoorah/1';

export type GameIcon = 'zap' | 'fire' | 'heart' | 'star' | 'crown' | 'target' | 'brain' | 'build';

/**
 * How busy the adaptive music is: 0 = base layer only (calm), 3 = every layer (climax).
 * Song channels with `tier: n` sound while n <= intensity; channels without a tier always sound.
 */
export type MusicIntensity = 0 | 1 | 2 | 3;

/**
 * Sound effects the shell synthesizes (Web Audio, no files). Unknown names play nothing.
 * Announcement sounds (`weker`, `gong`, `rooster`, `bell`, `flute`, Kampung Siluman's night set, `round`, `stinger-win`,
 * `stinger-fall`) briefly duck the music so they read clearly from the sofa.
 */
export type SfxName =
  // Interface and shared
  | 'tick'
  | 'tock'
  | 'select'
  | 'back'
  | 'join'
  | 'leave'
  | 'correct'
  | 'wrong'
  | 'count'
  | 'go'
  | 'drop'
  | 'perfect'
  | 'collapse'
  | 'pull'
  | 'super'
  | 'cheer'
  | 'clap'
  | 'boo'
  | 'win'
  | 'whistle'
  | 'tension'
  | 'reveal'
  | 'ready'
  // Announcements and stingers
  | 'weker'
  | 'gong'
  | 'rooster'
  | 'growl'
  | 'bell'
  | 'flute'
  | 'night'
  | 'genta'
  | 'kentongan'
  | 'heart'
  | 'birds'
  | 'win-village'
  | 'win-siluman'
  | 'round'
  | 'stinger-win'
  | 'stinger-fall'
  // Racing and action
  | 'engine'
  | 'boost'
  | 'item'
  | 'hit'
  | 'horn'
  | 'lap'
  | 'skid'
  | 'throw'
  | 'explode'
  | 'jump'
  | 'brake'
  | 'reverse'
  // Kitchen
  | 'chop'
  | 'sizzle'
  | 'stir'
  | 'flip'
  | 'ding'
  | 'pour'
  | 'splash';

const SFX_NAMES: ReadonlySet<string> = new Set<SfxName>([
  'tick',
  'tock',
  'select',
  'back',
  'join',
  'leave',
  'correct',
  'wrong',
  'count',
  'go',
  'drop',
  'perfect',
  'collapse',
  'pull',
  'super',
  'cheer',
  'clap',
  'boo',
  'win',
  'whistle',
  'tension',
  'reveal',
  'ready',
  'weker',
  'gong',
  'rooster',
  'growl',
  'bell',
  'flute',
  'night',
  'genta',
  'kentongan',
  'heart',
  'birds',
  'win-village',
  'win-siluman',
  'round',
  'stinger-win',
  'stinger-fall',
  'engine',
  'boost',
  'item',
  'hit',
  'horn',
  'lap',
  'skid',
  'throw',
  'explode',
  'jump',
  'brake',
  'reverse',
  'chop',
  'sizzle',
  'stir',
  'flip',
  'ding',
  'pour',
  'splash',
]);

export function isSfxName(name: unknown): name is SfxName {
  return typeof name === 'string' && SFX_NAMES.has(name);
}

export function isMusicIntensity(level: unknown): level is MusicIntensity {
  return level === 0 || level === 1 || level === 2 || level === 3;
}

export interface GameAward {
  playerId: number;
  title: string;
  desc: string;
  icon: GameIcon;
}

export interface GameResult {
  /** Headline, e.g. "Tim Merah juara!" */
  title: string;
  subtitle?: string;
  /** Best first. Ties share a rank. */
  ranking: { playerId: number; score: number; rank: number; label?: string }[];
  awards?: GameAward[];
  /**
   * Computer opponents (negative ids) that appear in `ranking`/`awards`, so the results screen can
   * show their name and fruit like any player.
   */
  cpuPlayers?: PlayerInfo[];
}

export interface GameInit {
  gameId: string;
  players: PlayerInfo[];
  /** Local clock + offset = server clock. */
  clockOffset: number;
  settings: Record<string, string | number | boolean>;
  muted: boolean;
}

export type ShellToGame =
  | { tag: typeof BRIDGE_TAG; type: 'init'; init: GameInit }
  | { tag: typeof BRIDGE_TAG; type: 'players'; players: PlayerInfo[] }
  | { tag: typeof BRIDGE_TAG; type: 'clock'; clockOffset: number }
  | { tag: typeof BRIDGE_TAG; type: 'action'; from: number; action: ControllerToGame }
  | { tag: typeof BRIDGE_TAG; type: 'input'; input: RelayedInput }
  | { tag: typeof BRIDGE_TAG; type: 'pause'; paused: boolean }
  | { tag: typeof BRIDGE_TAG; type: 'mute'; muted: boolean };

export type GameToShell =
  | { tag: typeof BRIDGE_TAG; type: 'hello' }
  | { tag: typeof BRIDGE_TAG; type: 'ready' }
  | { tag: typeof BRIDGE_TAG; type: 'view'; to: number | 'all'; view: ControllerView }
  | { tag: typeof BRIDGE_TAG; type: 'vibrate'; to: number | 'all'; pattern: number | number[] }
  | { tag: typeof BRIDGE_TAG; type: 'end'; result: GameResult }
  | { tag: typeof BRIDGE_TAG; type: 'sfx'; name: string }
  | { tag: typeof BRIDGE_TAG; type: 'music'; track: string | null }
  | { tag: typeof BRIDGE_TAG; type: 'musicIntensity'; level: MusicIntensity }
  | { tag: typeof BRIDGE_TAG; type: 'musicHurry'; on: boolean }
  | { tag: typeof BRIDGE_TAG; type: 'quit' };

export function isBridgeMessage<T extends { tag: string }>(data: unknown): data is T {
  return typeof data === 'object' && data !== null && (data as { tag?: unknown }).tag === BRIDGE_TAG;
}
