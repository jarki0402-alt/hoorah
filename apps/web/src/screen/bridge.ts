import type { ControllerToGame, ControllerView, PlayerInfo, RelayedInput } from '@hoorah/protocol';
import {
  BRIDGE_TAG,
  type GameResult,
  type GameToShell,
  isBridgeMessage,
  isMusicIntensity,
  type MusicIntensity,
  type ShellToGame,
} from '@hoorah/sdk/bridge';

export interface BridgeInit {
  players: PlayerInfo[];
  clockOffset: number;
  settings: Record<string, string | number | boolean>;
  muted: boolean;
  /** A far-away main screen's copy of the game (long-distance play): it only draws. */
  mirror?: boolean;
}

export interface BridgeHandlers {
  init: () => BridgeInit;
  /** Right after the game got its init (the game now listens for `mirror`/`mirrors`). */
  inited?: () => void;
  ready: () => void;
  /** Host's game: its display state for the far-away main screens. */
  publish?: (state: unknown) => void;
  view: (to: number | 'all', view: ControllerView) => void;
  vibrate: (to: number | 'all', pattern: number | number[]) => void;
  end: (result: GameResult) => void;
  sfx: (name: string) => void;
  music: (track: string | null) => void;
  musicIntensity: (level: MusicIntensity) => void;
  musicHurry: (on: boolean) => void;
  quit: () => void;
}

/**
 * Talks to the game iframe over postMessage. One game at a time; everything is origin- and
 * source-checked so other frames can never inject controller views.
 */
export class GameBridge {
  private frame: HTMLIFrameElement | null = null;
  private gameId = '';
  private handlers: BridgeHandlers | null = null;

  constructor() {
    window.addEventListener('message', this.onMessage);
  }

  attach(frame: HTMLIFrameElement, gameId: string, handlers: BridgeHandlers): void {
    this.frame = frame;
    this.gameId = gameId;
    this.handlers = handlers;
  }

  detach(frame?: HTMLIFrameElement): void {
    if (frame && frame !== this.frame) return;
    this.frame = null;
    this.handlers = null;
  }

  get active(): boolean {
    return this.frame !== null;
  }

  private post(msg: ShellToGame): void {
    this.frame?.contentWindow?.postMessage(msg, window.location.origin);
  }

  players(players: PlayerInfo[]): void {
    this.post({ tag: BRIDGE_TAG, type: 'players', players });
  }

  clock(clockOffset: number): void {
    this.post({ tag: BRIDGE_TAG, type: 'clock', clockOffset });
  }

  action(from: number, action: ControllerToGame): void {
    this.post({ tag: BRIDGE_TAG, type: 'action', from, action });
  }

  input(input: RelayedInput): void {
    this.post({ tag: BRIDGE_TAG, type: 'input', input });
  }

  pause(paused: boolean): void {
    this.post({ tag: BRIDGE_TAG, type: 'pause', paused });
  }

  mute(muted: boolean): void {
    this.post({ tag: BRIDGE_TAG, type: 'mute', muted });
  }

  /** Far-away main screen: the latest state the Host's game published. */
  mirror(state: unknown): void {
    this.post({ tag: BRIDGE_TAG, type: 'mirror', state });
  }

  /** Host's main screen: whether any far-away main screen watches (the game publishes only then). */
  mirrors(on: boolean): void {
    this.post({ tag: BRIDGE_TAG, type: 'mirrors', on });
  }

  private readonly onMessage = (e: MessageEvent): void => {
    if (!this.frame || e.source !== this.frame.contentWindow || e.origin !== window.location.origin) return;
    if (!isBridgeMessage<GameToShell>(e.data) || !this.handlers) return;
    const h = this.handlers;
    const m = e.data;
    switch (m.type) {
      case 'hello': {
        const init = h.init();
        this.post({ tag: BRIDGE_TAG, type: 'init', init: { gameId: this.gameId, ...init } });
        h.inited?.();
        return;
      }
      case 'ready':
        h.ready();
        return;
      case 'view':
        h.view(m.to, m.view);
        return;
      case 'vibrate':
        h.vibrate(m.to, m.pattern);
        return;
      case 'end':
        h.end(m.result);
        return;
      case 'sfx':
        h.sfx(m.name);
        return;
      case 'music':
        h.music(m.track);
        return;
      case 'musicIntensity':
        if (isMusicIntensity(m.level)) h.musicIntensity(m.level);
        return;
      case 'musicHurry':
        h.musicHurry(m.on === true);
        return;
      case 'quit':
        h.quit();
        return;
      case 'publish':
        h.publish?.(m.state);
        return;
    }
  };
}
