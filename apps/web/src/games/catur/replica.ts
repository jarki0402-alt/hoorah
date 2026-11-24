/**
 * Long-distance play, far-away main screen: draws the Host's match from its published display
 * state with the same view as the Host. No rules, engine, phones or sounds run here; pieces slide
 * because each new board is reconciled with the last one, exactly like on the Host's screen.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { HoorahGame } from '@hoorah/sdk';
import { signal } from '@preact/signals';
import { applyMirror } from './mirror';
import { reconcile, type Sprite, spritesFrom } from './sprites';
import { FrameBus, type MatchView, type TvModel } from './tv';

const FALLBACK_TICK_MS = 250;

export class CaturReplica implements TvModel {
  readonly version = signal(0);
  readonly frame = new FrameBus();
  sprites: Sprite[] = [];
  notice: string | null = null;
  /** Set by the first valid state; the view mounts only after that. */
  match!: MatchView;
  readonly shown = signal(false);
  private people = new Map<number, PlayerInfo>();
  private board = '';
  private plies = -1;
  private raf = 0;
  private interval = 0;

  constructor(private readonly game: HoorahGame) {}

  info = (id: number): PlayerInfo | undefined => this.people.get(id);

  start(): void {
    this.game.on('mirror', (state) => this.apply(state));
    const loop = () => {
      this.frame.emit(this.game.now());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.frame.emit(this.game.now()), FALLBACK_TICK_MS);
  }

  apply(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    const plies = s.match.history.length;
    if (this.plies < 0 || plies < this.plies) {
      this.sprites = spritesFrom(s.board);
    } else if (s.board !== this.board) {
      // One new move slides its piece; anything else (a jump after a lost connection) snaps.
      const move = plies === this.plies + 1 ? s.match.lastMove()?.uci : undefined;
      this.sprites = reconcile(this.sprites, s.board, move || undefined);
    }
    this.board = s.board;
    this.plies = plies;
    this.match = s.match;
    this.notice = s.notice;
    this.people = new Map(s.people.map((p) => [p.id, p]));
    this.shown.value = true;
    this.version.value++;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
  }
}
