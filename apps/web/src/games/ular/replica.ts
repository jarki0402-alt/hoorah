/**
 * Long-distance play, far-away main screen: fills the same HUD store the Host's driver fills,
 * from the published display state, and paints the board every frame with the same motion code.
 * No rules, brains, phones or sounds run here: a token hops because its plan says so, timed from
 * the Host's start times (server ms), so both screens move together.
 */
import type { HoorahGame } from '@hoorah/sdk';
import { FRAME } from './art';
import { cellCenter } from './board';
import type { HudStore, Shout, TokenFrame } from './hud';
import type { Layout } from './layout';
import { ROLL_MS } from './logic';
import { applyMirror, type UlarShown } from './mirror';
import { dieAt, duelClock, planPose } from './motion';

const FALLBACK_TICK_MS = 250;

export class UlarReplica {
  private shown: UlarShown | null = null;
  private layout: Layout | null = null;
  private raf = 0;
  private interval = 0;

  constructor(
    private readonly game: HoorahGame,
    private readonly hud: HudStore,
  ) {}

  setLayout(layout: Layout): void {
    this.layout = layout;
    this.hud.layout.value = layout;
    this.hud.resetTokens();
    if (this.shown) this.hud.shouts.value = this.shoutsPx(this.shown.shouts, this.now());
  }

  start(): void {
    this.game.on('mirror', (state) => this.apply(state));
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.hud.expire(this.now()), FALLBACK_TICK_MS);
  }

  /** The time the Host's screen shows: frozen while it is paused. */
  private now(): number {
    return this.shown?.frozen ?? this.game.now();
  }

  /** Shouts travel in board cells; this screen's squares have their own size. */
  private shoutsPx(list: readonly Shout[], now: number): Shout[] {
    const cell = this.layout?.cell ?? 0;
    return list
      .filter((s) => s.until > now)
      .map((s) => ({ ...s, x: FRAME + s.x * cell, y: FRAME + s.y * cell }));
  }

  apply(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s || s.board.size !== this.hud.board.size) return;
    this.shown = s;
    const now = this.now();
    const hud = this.hud;
    hud.model.value = s.model;
    hud.banner.value = s.banner;
    hud.card.value = s.card;
    hud.duel.value = s.duel;
    hud.shouts.value = this.shoutsPx(s.shouts, now);
    hud.bubbles.value = s.bubbles.filter((b) => b.until > now);
    hud.paused.value = s.frozen !== null;
  }

  frame(): void {
    const s = this.shown;
    const L = this.layout;
    if (!s || !L) return;
    const now = this.now();
    const plans = new Map(s.plans.map((p) => [p.playerId, p]));
    const frames: TokenFrame[] = s.rest.map(({ id, sq }) => {
      const plan = plans.get(id);
      const pose =
        plan && now < plan.end
          ? planPose(s.board, plan, now)
          : { p: cellCenter(s.board, sq), lift: 0, moving: false };
      return { id, p: pose.p, lift: pose.lift, moving: pose.moving, sq };
    });
    this.hud.paintTokens(L.cell, frames, s.roll?.active ?? null);
    const die = dieAt(s.roll !== null, s.dice, now);
    this.hud.setDie(die.face, die.rolling);
    if (s.roll) {
      const rem = Math.max(0, s.roll.deadline - now);
      this.hud.setRing(rem / ROLL_MS, Math.ceil(rem / 1000));
    }
    if (s.duel && s.duelTimes) {
      const c = duelClock(s.duel.stage, s.duelTimes.start, s.duelTimes.end, now);
      this.hud.setDuelClock(c.frac, c.text);
    }
    this.hud.expire(now);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
  }
}
