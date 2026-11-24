import {
  type ControllerToGame,
  type ControllerView,
  expandTime,
  type PlayerInfo,
  type RelayedInput,
} from '@hoorah/protocol';
import {
  BRIDGE_TAG,
  type GameInit,
  type GameResult,
  type GameToShell,
  isBridgeMessage,
  type MusicIntensity,
  type SfxName,
  type ShellToGame,
} from './bridge';

export type { GameAward, GameIcon, GameInit, GameResult, MusicIntensity, SfxName } from './bridge';

type Handlers = {
  players: (players: PlayerInfo[]) => void;
  action: (from: number, action: ControllerToGame) => void;
  input: (input: RelayedInput & { atMs: number }) => void;
  pause: (paused: boolean) => void;
  mute: (muted: boolean) => void;
  /** Mirror game only: the Host's game published a new display state. */
  mirror: (state: unknown) => void;
  /** Host's game only: a far-away main screen started or stopped watching. */
  mirrors: (on: boolean) => void;
};

/**
 * The game-side handle. A game runs inside an iframe on the TV; everything it says to phones
 * goes through here, so games never touch the network directly.
 */
export class HoorahGame {
  private readonly handlers: { [K in keyof Handlers]: Set<Handlers[K]> } = {
    players: new Set(),
    action: new Set(),
    input: new Set(),
    pause: new Set(),
    mute: new Set(),
    mirror: new Set(),
    mirrors: new Set(),
  };
  private clockOffset: number;
  private _players: PlayerInfo[];
  private _paused = false;
  private _muted: boolean;
  private _mirrored = false;
  private _lastState: unknown = undefined;
  private _lastKey = '';
  readonly gameId: string;
  readonly settings: GameInit['settings'];
  /**
   * Long-distance play: this copy runs on a far-away main screen and only draws what the Host's
   * game publishes (`on('mirror')`). It must not run rules, end the game or talk to phones.
   */
  readonly isMirror: boolean;

  constructor(init: GameInit) {
    this.gameId = init.gameId;
    this.settings = init.settings;
    this._players = init.players;
    this.clockOffset = init.clockOffset;
    this._muted = init.muted;
    this.isMirror = init.mirror === true;
    window.addEventListener('message', this.onMessage);
  }

  /** Connected players, in join order. */
  get players(): PlayerInfo[] {
    return this._players.filter((p) => p.connected);
  }

  get allPlayers(): PlayerInfo[] {
    return this._players;
  }

  get paused(): boolean {
    return this._paused;
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Host's game: a far-away main screen is watching, so `publish` is worth calling. */
  get mirrored(): boolean {
    return this._mirrored;
  }

  /**
   * Host's game: the display state far-away main screens draw (plain JSON, as small as possible:
   * what is on screen, not the rules). Call it whenever that changes; identical states are not
   * sent twice, and nothing is sent while nobody watches or on a mirror.
   */
  publish(state: unknown): void {
    if (this.isMirror || !this._mirrored) return;
    const key = JSON.stringify(state);
    if (key === this._lastKey) return;
    this._lastKey = key;
    this._lastState = state;
    this.post({ tag: BRIDGE_TAG, type: 'publish', state });
  }

  /** The last state published (mirror games ask for nothing: the shell resends it on connect). */
  get lastPublished(): unknown {
    return this._lastState;
  }

  player(id: number): PlayerInfo | undefined {
    return this._players.find((p) => p.id === id);
  }

  /** Synced server time in ms. Use it for anything timing-sensitive across devices. */
  now(): number {
    return Date.now() + this.clockOffset;
  }

  on<K extends keyof Handlers>(event: K, fn: Handlers[K]): () => void {
    this.handlers[event].add(fn);
    return () => this.handlers[event].delete(fn);
  }

  /** Tell the shell assets are loaded; it then hides its loading screen. */
  ready(): void {
    this.post({ tag: BRIDGE_TAG, type: 'ready' });
  }

  setView(to: number | 'all', view: ControllerView): void {
    this.post({ tag: BRIDGE_TAG, type: 'view', to, view });
  }

  vibrate(to: number | 'all', pattern: number | number[]): void {
    this.post({ tag: BRIDGE_TAG, type: 'vibrate', to, pattern });
  }

  end(result: GameResult): void {
    this.post({ tag: BRIDGE_TAG, type: 'end', result });
  }

  /**
   * Sound plays in the shell: the TV page already has the user gesture browsers require,
   * the game iframe might not.
   */
  sfx(name: SfxName | (string & {})): void {
    this.post({ tag: BRIDGE_TAG, type: 'sfx', name });
  }

  /**
   * Selects the song (`null` fades out). A new song starts at intensity 0 with hurry off, so
   * call `musicIntensity`/`musicHurry` after this.
   */
  music(track: string | null): void {
    this.post({ tag: BRIDGE_TAG, type: 'music', track });
  }

  /**
   * Adaptive music layers: song channels with `tier <= level` sound. Changes fade per channel
   * (about a second) without restarting the song. Songs without tiers ignore it.
   */
  musicIntensity(level: MusicIntensity): void {
    this.post({ tag: BRIDGE_TAG, type: 'musicIntensity', level });
  }

  /** Nudges the tempo up about 8% (eased over a couple of seconds), e.g. for the last 10 seconds. */
  musicHurry(on: boolean): void {
    this.post({ tag: BRIDGE_TAG, type: 'musicHurry', on });
  }

  quit(): void {
    this.post({ tag: BRIDGE_TAG, type: 'quit' });
  }

  private post(msg: GameToShell): void {
    window.parent.postMessage(msg, window.location.origin);
  }

  private readonly onMessage = (e: MessageEvent): void => {
    if (e.origin !== window.location.origin || e.source !== window.parent) return;
    if (!isBridgeMessage<ShellToGame>(e.data)) return;
    const m = e.data;
    switch (m.type) {
      case 'players':
        this._players = m.players;
        for (const fn of this.handlers.players) fn(this.players);
        break;
      case 'clock':
        this.clockOffset = m.clockOffset;
        break;
      case 'action':
        for (const fn of this.handlers.action) fn(m.from, m.action);
        break;
      case 'input': {
        const atMs = expandTime(m.input.at, this.now());
        for (const fn of this.handlers.input) fn({ ...m.input, atMs });
        break;
      }
      case 'pause':
        this._paused = m.paused;
        for (const fn of this.handlers.pause) fn(m.paused);
        break;
      case 'mute':
        this._muted = m.muted;
        for (const fn of this.handlers.mute) fn(m.muted);
        break;
      case 'mirror':
        if (this.isMirror) for (const fn of this.handlers.mirror) fn(m.state);
        break;
      case 'mirrors':
        this._mirrored = m.on;
        // A screen that just connected needs the current state even if it did not change.
        if (m.on) this._lastKey = '';
        for (const fn of this.handlers.mirrors) fn(m.on);
        break;
      case 'init':
        break;
    }
  };
}

/** Handshake with the shell. Resolves once the shell has sent the initial state. */
export function connect(timeoutMs = 10_000): Promise<HoorahGame> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onInit);
      reject(new Error('Hoorah shell did not answer'));
    }, timeoutMs);
    function onInit(e: MessageEvent) {
      if (e.origin !== window.location.origin || !isBridgeMessage<ShellToGame>(e.data)) return;
      if (e.data.type !== 'init') return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onInit);
      resolve(new HoorahGame(e.data.init));
    }
    window.addEventListener('message', onInit);
    const hello: GameToShell = { tag: BRIDGE_TAG, type: 'hello' };
    window.parent.postMessage(hello, window.location.origin);
  });
}
