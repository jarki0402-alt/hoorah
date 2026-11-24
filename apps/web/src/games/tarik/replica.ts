/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD the Host's
 * director drives, from the published display state. No rules, brains, phones or sounds run here
 * (the shell forwards the Host's sounds). Moving values are interpolated a little in the past;
 * phase changes snap and replay the same stage flourishes the Host plays.
 */
import type { HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { hudFrom, strongerOf } from './board';
import { StageEffects } from './effects';
import type { Hud } from './hud';
import { type Phase, TEAMS } from './logic';
import {
  applyMirror,
  MirrorTimeline,
  mirrorFacts,
  mirrorRoster,
  newSupers,
  TapPacer,
  type TarikMirror,
} from './mirror';
import type { TarikScene } from './scene';

const HUD_MS = 100;
const RING_SYNC_MS = 5000;

const ENDED: readonly Phase[] = ['matchEnd', 'done'];
const isEnded = (ph: Phase | null): boolean => ph !== null && ENDED.includes(ph);
const isRoundOver = (ph: Phase | null): boolean => ph === 'roundEnd' || isEnded(ph);

export class TarikReplica {
  private readonly timeline = new MirrorTimeline();
  private readonly pacer = new TapPacer();
  private readonly fx: StageEffects;
  /** Highest super sequence already shown, null before the first packet. */
  private superSeen: number | null = null;
  private tickerKey = -1;
  private ringStart = Number.NaN;
  private lastRingSync = Number.NEGATIVE_INFINITY;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private hostHeld = false;
  private frozen = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: TarikScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {
    this.fx = new StageEffects(scene, hud);
  }

  start(): void {
    this.game.on('mirror', (state) => this.apply(state));
    this.game.on('pause', (paused) => {
      this.localPaused = paused;
      this.syncPause();
    });
    this.localPaused = this.game.paused;
    this.syncPause();
    this.scene.onFrame = () => this.frame();
  }

  private apply(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    const now = this.game.now();
    const prev = this.timeline.latest;
    const snap = this.timeline.push(s, now);
    this.scene.setRoster(mirrorRoster(s, 'red'), mirrorRoster(s, 'blue'));
    if (snap) this.onStretch(prev?.ph ?? null, s, now);
    this.pacer.feed(s.tp);
    this.playSupers(s);
    const tk = s.tk;
    const key = tk ? tk[0] : -1;
    if (key !== this.tickerKey) {
      this.tickerKey = key;
      this.hud.setTicker(tk ? { key: tk[0], bold: tk[1], text: tk[2] } : null);
    }
    if (s.ph === 'pull' && s.ring[0] !== this.ringStart) this.syncRing(s, now);
    this.hostHeld = s.hold;
    this.syncPause();
    // A new phase shows at once, even while this screen is paused and no frames run.
    if (snap) this.renderHud(s, now);
  }

  /** A new phase, round or pause state: replay the flourish the Host played on entering it. */
  private onStretch(before: Phase | null, s: TarikMirror, now: number): void {
    const ph = s.ph;
    if (ph === before) return;
    if (ph === 'countdown') {
      this.scene.resetRound();
      this.pacer.clear();
    } else if (ph === 'pull') {
      this.fx.resetFloats(now);
    }
    // Joining between rounds still shows the losers in the mud.
    const over = isRoundOver(ph) || (before === null && ph === 'scoreboard');
    if (over && !isRoundOver(before)) {
      this.pacer.clear();
      this.scene.roundEnd(s.lw);
    }
    if (isEnded(ph) && !isEnded(before)) {
      const winner = s.mw ?? s.lw;
      if (winner) this.scene.celebrate(winner);
      // Confetti only for a match this screen saw end, not one it joined afterwards.
      if (before !== null) celebrate();
    }
  }

  private playSupers(s: TarikMirror): void {
    const top = s.su.reduce((m, row) => Math.max(m, row[0]), 0);
    // First packet, or the Host's game restarted: everything listed has already happened.
    if (this.superSeen === null || top < this.superSeen) {
      this.superSeen = top;
      return;
    }
    for (const mark of newSupers(s, this.superSeen)) {
      if (s.ph === 'pull') this.fx.superPull(mark.team, mark.combo);
      this.superSeen = mark.n;
    }
  }

  private syncRing(s: TarikMirror, now: number): void {
    this.ringStart = s.ring[0];
    this.lastRingSync = now;
    // The ring follows server time, like on the Host, so super timing is right for players here too.
    this.hud.syncRing(s.ring[0], s.ring[1], now);
  }

  private syncPause(): void {
    const frozen = this.localPaused || this.hostHeld;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    this.hud.setPaused(frozen);
    if (frozen) {
      this.phaser.pause();
      return;
    }
    this.phaser.resume();
    const s = this.timeline.latest;
    if (s?.ph === 'pull') this.syncRing(s, this.game.now());
  }

  private renderHud(s: TarikMirror, now: number): void {
    this.lastHud = now;
    this.hud.setState(hudFrom(mirrorFacts(s, this.timeline.sample(now))));
  }

  private frame(): void {
    const s = this.timeline.latest;
    if (!s) return;
    const now = this.game.now();
    const live = this.timeline.sample(now);
    const view = this.scene.view;
    view.p = live.p;
    view.force.red = live.force.red;
    view.force.blue = live.force.blue;
    view.pulling = s.ph === 'pull';
    this.hud.setRope(live.p);
    if (view.pulling) {
      for (const team of TEAMS) this.fx.taps(team, this.pacer.take(team, now));
      this.fx.floats(now, strongerOf(live.force));
      if (now - this.lastRingSync >= RING_SYNC_MS) this.syncRing(s, now);
    }
    if (now - this.lastHud >= HUD_MS) this.renderHud(s, now);
  }
}
