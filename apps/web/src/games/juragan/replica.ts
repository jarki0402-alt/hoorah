/**
 * Long-distance play, far-away main screen: drives the same tabletop and HUD the Host's driver
 * drives, from the published display state. No rules, brains, phones or sounds run here. A newly
 * numbered effect (dice, a walk, coins, a Kabar card) plays once with the Host's own view call;
 * one that arrives too late is skipped and the board is simply drawn where it stands.
 */
import type { HoorahGame } from '@hoorah/sdk';
import { celebrate, confetti } from '../../shared/confetti';
import type { HudStore } from './hud';
import { DICE_MS, HOP_MS, INTRO_MS, JUMP_MS } from './logic';
import { applyMirror, type JuraganShown, type MirrorFx } from './mirror';
import type { Anchor, JuraganView } from './scene/view';

const FALLBACK_TICK_MS = 250;
/** An effect that arrives later than its own length plus this is not replayed. */
const LATE_MS = 1200;
const COINS_MS = 1000;
const CARD_FLIP_MS = 600;

/** How long an effect plays on the Host's board (ms). */
function fxLength(f: MirrorFx): number {
  switch (f.k) {
    case 'd':
      return DICE_MS;
    case 'w':
      return f.path.length * (f.m === 'jump' ? JUMP_MS : HOP_MS);
    case 'c':
      return COINS_MS;
    case 'k':
      return CARD_FLIP_MS;
  }
}

const anchor = (id: number | null): Anchor => (id === null ? 'bank' : { pawn: id });

export class JuraganReplica {
  private shown: JuraganShown | null = null;
  private pawnsKey = '';
  private fxN = -1;
  private active: number | null = null;
  private glowKey = '';
  private bannerKey = -1;
  private lastGame: number | null = null;
  private raf = 0;
  private interval = 0;

  constructor(
    private readonly game: HoorahGame,
    private readonly view: JuraganView,
    private readonly hud: HudStore,
  ) {}

  start(): void {
    this.game.on('mirror', (state) => this.apply(state));
    this.view.holdGovernor(INTRO_MS + 500);
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.ring(), FALLBACK_TICK_MS);
  }

  /** The time the Host's screen shows: frozen while it is paused. */
  private now(): number {
    return this.shown?.frozen ?? this.game.now();
  }

  apply(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    const first = this.shown === null;
    const wasFrozen = this.shown !== null && this.shown.frozen !== null;
    this.shown = s;
    const view = this.view;
    const colorOf = (id: number) => s.pawns.find((p) => p.id === id)?.color ?? '#C4C7CC';

    const pawnsKey = JSON.stringify(s.pawns);
    const newPawns = pawnsKey !== this.pawnsKey;
    if (newPawns) {
      this.pawnsKey = pawnsKey;
      view.setPawns(s.pawns);
      this.active = null;
    }
    view.place(s.places, first || newPawns);
    view.showTiles(s.tiles, colorOf, !first);
    if (newPawns || s.active !== this.active) {
      this.active = s.active;
      view.setActive(s.active);
    }
    view.focusPawn(s.focus);
    const glowKey = s.highlight ? `${s.highlight.tile}|${s.highlight.color}` : '';
    if (glowKey !== this.glowKey) {
      this.glowKey = glowKey;
      view.highlight(s.highlight?.tile ?? null, s.highlight?.color);
    }
    this.replay(s.fx, first);

    this.hud.model.value = s.model;
    this.hud.paused.value = s.frozen !== null;
    if (wasFrozen && s.frozen === null) view.holdGovernor(1000);

    const b = s.model.banner;
    if (b?.kind === 'finale' && b.key !== this.bannerKey && !first) {
      celebrate();
      window.setTimeout(() => confetti({ y: 0.4, count: 90, power: 0.8 }), 600);
    }
    this.bannerKey = b?.key ?? -1;
    this.ring();
  }

  /** Play the effects not seen yet, oldest first; on the first state only remember where we are. */
  private replay(list: readonly MirrorFx[], first: boolean): void {
    const now = this.now();
    for (const f of [...list].sort((a, b) => a.n - b.n)) {
      if (f.n <= this.fxN) continue;
      this.fxN = f.n;
      if (first || now - f.at > fxLength(f) + LATE_MS) continue;
      const view = this.view;
      switch (f.k) {
        case 'd':
          view.rollDice(f.v, view.pawnPoint(f.p), (DICE_MS / 1000) * 0.88);
          break;
        case 'w':
          view.walk(f.p, f.path, f.m, HOP_MS / 1000, JUMP_MS / 1000);
          break;
        case 'c':
          view.coins(anchor(f.f), anchor(f.t), f.a);
          break;
        case 'k':
          view.drawCard();
          break;
      }
    }
  }

  /** The decision countdown ring, counted locally from the Host's deadline. */
  private ring(): void {
    const s = this.shown;
    if (!s) return;
    const r = s.ring;
    if (!r) {
      this.hud.frame({ decision: null });
      return;
    }
    const left = Math.max(0, r.deadline - this.now());
    this.hud.frame({ decision: { frac: Math.min(1, left / r.total), secs: Math.ceil(left / 1000) } });
  }

  private frame(): void {
    const now = performance.now();
    this.ring();
    if (!this.view.due(now)) return;
    // Board time runs with the Host's: it stops while the Host is paused.
    const g = this.now();
    const dt = this.lastGame === null ? 0 : Math.min(1, Math.max(0, (g - this.lastGame) / 1000));
    this.lastGame = g;
    this.view.frame(dt, now);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
  }
}
