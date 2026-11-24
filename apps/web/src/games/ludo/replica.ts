/**
 * Long-distance play, far-away main screen: fills the same store the Host's driver fills, from
 * the published display state. No rules, brains, phones or sounds run here. A new move number
 * replays the hop (and the capture flight) with the same store animation the Host uses.
 */
import type { HoorahGame } from '@hoorah/sdk';
import { geometryFor } from './geometry';
import { boardFor, HOP_MS } from './logic';
import { applyMirror, type LudoShown } from './mirror';
import type { LudoStore } from './store';

const FALLBACK_TICK_MS = 250;
/** A move that arrives later than its walk plus this is drawn in place, not replayed. */
const LATE_MS = 1500;

export class LudoReplica {
  private shown: LudoShown | null = null;
  private moveN = -1;
  private raf = 0;
  private interval = 0;

  constructor(
    private readonly game: HoorahGame,
    private readonly store: LudoStore,
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
    const first = this.shown === null;
    const wasFrozen = this.shown?.frozen !== null && this.shown?.frozen !== undefined;
    this.shown = s;
    const now = this.now();
    const store = this.store;
    const before = store.pawns.value;
    store.model.value = s.model;
    store.pawns.value = s.pawns;
    store.toast.value = s.toast && s.toast.until > now ? s.toast : null;
    store.bursts.value = s.bursts.filter((b) => b.until > now);
    const m = s.move;
    if (m && m.n !== this.moveN) {
      this.moveN = m.n;
      const fresh = now - m.at < m.path.length * HOP_MS + LATE_MS;
      if (!first && fresh) {
        store.playMove(geometryFor(boardFor(s.model.sides)), before, s.pawns, s.model.pawnsPer, m);
      }
    }
    const frozen = s.frozen !== null;
    store.paused.value = frozen;
    if (frozen !== wasFrozen) {
      for (const anim of document.getAnimations()) {
        if (frozen) anim.pause();
        else anim.play();
      }
    }
  }

  private frame(): void {
    const s = this.shown;
    if (!s) return;
    const now = this.now();
    const ring = s.ring;
    if (ring) {
      const left = Math.max(0, ring.deadline - now);
      this.store.frame(now, Math.min(1, left / ring.total), Math.ceil(left / 1000), true);
    } else {
      this.store.frame(now, 1, 0, false);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
  }
}
