/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD the Host's
 * director drives, from the published display state. No rules, brains, phones or sounds run here
 * (the shell forwards the Host's sounds). Packets are played back a little in the past so hops
 * keep the Host's rhythm; phase changes snap and replay the same stage flourishes the Host plays.
 */
import type { HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { StageEffects } from './effects';
import type { Hud } from './hud';
import type { Phase } from './logic';
import {
  applyMirror,
  type KarungMirror,
  MarkReader,
  type MirrorAction,
  MirrorTimeline,
  mirrorHud,
  mirrorRoster,
} from './mirror';
import type { KarungScene } from './scene';

const HUD_MS = 100;
const RING_SYNC_MS = 5000;

const OVER: readonly Phase[] = ['raceEnd', 'standings', 'matchEnd', 'done'];
const ENDED: readonly Phase[] = ['matchEnd', 'done'];
const isOver = (ph: Phase | null): boolean => ph !== null && OVER.includes(ph);
const isEnded = (ph: Phase | null): boolean => ph !== null && ENDED.includes(ph);
const isRacing = (ph: Phase): boolean => ph === 'countdown' || ph === 'race';

export class KarungReplica {
  private readonly timeline = new MirrorTimeline();
  private readonly reader = new MarkReader();
  private readonly fx: StageEffects;
  /** The packet the stage currently shows (behind the newest one by the playback delay). */
  private shown: KarungMirror | null = null;
  private tickerKey = -1;
  private ringAnchor = Number.NaN;
  private lastRingSync = Number.NEGATIVE_INFINITY;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private hostHeld = false;
  private frozen = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: KarungScene,
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
    if (this.timeline.push(s, now)) {
      // A new phase shows at once, even while this screen is paused and no frames run.
      for (const p of this.timeline.flush()) this.release(p, now);
      this.renderHud(now);
      return;
    }
    // Frames normally release packets; this keeps the queue short while no frames run.
    for (const p of this.timeline.due(now)) this.release(p, now);
  }

  /** Show one packet: roster, phase flourishes, hops and the rest, as the Host played them. */
  private release(s: KarungMirror, now: number): void {
    const before = this.shown;
    this.shown = s;
    this.scene.trackLength = s.tl;
    this.scene.hopMs = s.hm;
    this.scene.setRoster(mirrorRoster(s));
    if (!before || before.ph !== s.ph || before.r !== s.r) this.onPhase(before?.ph ?? null, s, now);
    for (const action of this.reader.read(s)) this.play(action);
    const tk = s.tk;
    const key = tk ? tk[0] : -1;
    if (key !== this.tickerKey) {
      this.tickerKey = key;
      this.hud.setTicker(tk ? { key: tk[0], bold: tk[1], text: tk[2] } : null);
    }
    if (isRacing(s.ph) && s.an !== this.ringAnchor) this.syncRing(s, now);
    this.hostHeld = s.hold;
    this.syncPause();
  }

  /** A new phase or race: replay the flourish the Host played on entering it. */
  private onPhase(before: Phase | null, s: KarungMirror, now: number): void {
    const ph = s.ph;
    if (ph === 'countdown') {
      this.scene.resetRace();
      this.syncRing(s, now);
    } else if (ph === 'race') {
      this.scene.go();
      this.syncRing(s, now);
    }
    if (isOver(ph) && !isOver(before)) {
      this.scene.raceEnd(s.lo);
      if (ph === 'raceEnd' && s.ov[0] === 'e' && s.ov[5]) this.scene.flash();
    }
    // Confetti only for a match this screen saw end, not one it joined afterwards.
    if (isEnded(ph) && !isEnded(before) && before !== null) celebrate();
  }

  private play(a: MirrorAction): void {
    switch (a.type) {
      case 'hop':
        this.scene.hop(a.id, a.kind, a.to);
        if (a.kind === 'super') this.fx.superHop(a.id, a.color);
        return;
      case 'stumble':
        this.fx.stumble(a.id, a.durMs);
        return;
      case 'finish':
        this.fx.finish(a.id, a.place, a.place === 1);
        return;
      case 'flash':
        this.scene.flash();
        return;
    }
  }

  private syncRing(s: KarungMirror, now: number): void {
    this.ringAnchor = s.an;
    this.lastRingSync = now;
    // The ring follows server time, like on the Host, so the beat is right for players here too.
    this.hud.syncRing(s.an, s.bm, now);
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
    const s = this.shown;
    if (s && isRacing(s.ph)) this.syncRing(s, this.game.now());
  }

  private renderHud(now: number): void {
    const s = this.shown;
    if (!s) return;
    this.lastHud = now;
    this.hud.setState(mirrorHud(s, this.timeline.sample(now), this.scene.lanes, this.hud.origin));
  }

  private frame(): void {
    const now = this.game.now();
    for (const p of this.timeline.due(now)) this.release(p, now);
    const s = this.shown;
    if (!s) return;
    const beat = (now - s.an) / s.bm;
    this.scene.beatPhase = beat - Math.floor(beat);
    if (s.ph === 'race' && now - this.lastRingSync >= RING_SYNC_MS) this.syncRing(s, now);
    if (now - this.lastHud >= HUD_MS) this.renderHud(now);
  }
}
