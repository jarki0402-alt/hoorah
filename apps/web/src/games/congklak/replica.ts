/**
 * Long-distance play, far-away main screen: fills the same store the Host's driver fills, from
 * the published display state. No rules, brains, phones or sounds run here. Each new move is
 * sown seed by seed with the same replay the Host uses, timed from the Host's start so both
 * boards land seeds together.
 */
import type { HoorahGame } from '@hoorah/sdk';
import { TURN_MS } from './logic';
import { applyMirror, type CongklakShown, hudFor } from './mirror';
import { SowReplay } from './replay';
import type { TvStore } from './tv';

const FALLBACK_TICK_MS = 250;

export class CongklakReplica {
  private shown: CongklakShown | null = null;
  private replay: SowReplay | null = null;
  private moveN = -1;
  private raf = 0;
  private interval = 0;

  constructor(
    private readonly game: HoorahGame,
    private readonly tv: TvStore,
  ) {}

  start(): void {
    this.game.on('mirror', (state) => this.apply(state));
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.frame(), FALLBACK_TICK_MS);
  }

  /** The time the Host's screen shows: frozen while it is paused. */
  private now(): number {
    return this.shown?.frozen ?? this.game.now();
  }

  apply(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    this.shown = s;
    const m = s.move;
    if (!m) {
      this.replay = null;
      this.moveN = -1;
    } else if (m.n !== this.moveN || !this.replay) {
      this.moveN = m.n;
      this.replay = new SowReplay(m.before, m.steps, m.side, m.startAt);
    } else if (this.replay.startAt !== m.startAt) {
      // The Host paused mid-move: its start shifted in server time, keep the seeds already sown.
      const r = new SowReplay(m.before, m.steps, m.side, m.startAt);
      r.advance(m.startAt + (this.replay.applied > 0 ? r.at[this.replay.applied - 1]! : -1));
      this.replay = r;
    }
    const now = this.now();
    this.replay?.advance(now);
    this.tv.paused.value = s.frozen !== null;
    this.tv.toasts.value = s.toasts.filter((t) => t.until > now);
    this.tv.bubbles[0].value = s.bubbles[0].filter((b) => b.until > now);
    this.tv.bubbles[1].value = s.bubbles[1].filter((b) => b.until > now);
    this.push(s);
  }

  /** Board and HUD for what the replay shows now. */
  private push(s: CongklakShown): void {
    const r = this.replay;
    const counts = r ? r.board.slice() : s.board.slice();
    const sowing = r !== null && !r.done;
    this.tv.board.value = {
      counts,
      hand: r ? r.handAt() : null,
      activeSide: s.turn ?? (sowing ? r.side : null),
      flash: s.flash,
      flashKey: s.flashKey,
    };
    this.tv.hud.value = hudFor(s, counts);
  }

  private frame(): void {
    const s = this.shown;
    if (!s) return;
    const now = this.now();
    if (this.replay?.advance(now).length) this.push(s);
    const t = s.timer;
    if (t) {
      const rem = Math.max(0, t.deadline - now);
      this.tv.setTimer(t.side, rem / TURN_MS, Math.ceil(rem / 1000));
    } else {
      this.tv.setTimer(null, 0, 0);
    }
    const toasts = this.tv.toasts.value;
    if (toasts.some((x) => x.until <= now)) this.tv.toasts.value = toasts.filter((x) => x.until > now);
    for (const b of this.tv.bubbles) {
      if (b.value.some((x) => x.until <= now)) b.value = b.value.filter((x) => x.until > now);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
  }
}
