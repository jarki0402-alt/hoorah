/**
 * Long-distance play, far-away main screen: drives the same Phaser kitchen and HUD the Host's
 * director drives, from the published display state. No rules, brains, phones or sounds run here
 * (the shell forwards the Host's sounds and music). Cooks, throws and progress rings glide between
 * packets a little in the past; pops, floats, flashes and confetti play when the playback point
 * reaches the packet that brought them, so they line up with the cooks. The countdown and the
 * round clock run on server time, like on the Host.
 */
import type { Look } from '@hoorah/protocol';
import type { HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import type { Hud } from './hud';
import type { Difficulty, KitchenId } from './kitchens';
import {
  applyMirror,
  type MirrorEvent,
  type MirrorGuide,
  MirrorStage,
  type MirrorState,
  MirrorTimeline,
  mirrorClocks,
  mirrorHud,
  newEvents,
} from './mirror';
import type { DapurScene } from './scene';
import { loadBackdrop } from './textures';

const HUD_MS = 100;
/** Packets waiting for the playback point; beyond this the oldest is applied at once. */
const QUEUE_MAX = 24;

/** The kitchen a round packet needs on this screen. */
const stageKey = (s: MirrorState): string | null =>
  s.round ? `${s.epoch}|${s.round.kitchen}|${s.round.difficulty}` : null;

export class DapurReplica {
  private readonly timeline = new MirrorTimeline();
  /** Packets whose effects wait for the playback point. */
  private readonly queue: MirrorState[] = [];
  private stage: MirrorStage | null = null;
  private stageFor: string | null = null;
  /** The kitchen being rasterized, if any. */
  private loading: string | null = null;
  /** Highest effect event already played, and the match it belongs to. */
  private eventSeen: number | null = null;
  private eventEpoch = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private hostHeld = false;
  private frozen = false;
  private readonly at = { x: 0, y: 0 };
  private readonly arrowAt = { x: 0, y: 0, up: false };

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: DapurScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {}

  start(): void {
    this.game.on('mirror', (state) => this.receive(state));
    this.game.on('pause', (paused) => {
      this.localPaused = paused;
      this.syncPause();
    });
    this.localPaused = this.game.paused;
    this.syncPause();
    this.scene.onFrame = () => this.frame();
  }

  private receive(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    const now = this.game.now();
    const snap = this.timeline.push(s, now);
    this.queue.push(s);
    // While this screen is paused no frames drain the queue: keep it short anyway.
    while (this.queue.length > QUEUE_MAX) this.process(this.queue.shift()!);
    this.hostHeld = s.hold;
    this.prepare(s);
    if (snap) {
      // A new phase, round or pause state shows at once, even while no frames run.
      this.drain(now, true);
      this.lastHud = Number.NEGATIVE_INFINITY;
      this.show(now);
    }
    this.syncPause();
  }

  /** Loads the kitchen (backdrop and heads) a round packet needs, once per round. */
  private prepare(s: MirrorState): void {
    const key = stageKey(s);
    const r = s.round;
    if (!key || !r || key === this.stageFor || key === this.loading) return;
    this.loading = key;
    void this.load(
      key,
      r.kitchen,
      r.difficulty,
      r.chefs.map((c) => c.look),
    );
  }

  private async load(
    key: string,
    kitchen: KitchenId,
    difficulty: Difficulty,
    looks: readonly Look[],
  ): Promise<void> {
    try {
      this.scene.addCanvases(await loadBackdrop(kitchen));
    } catch {
      // The kitchen still shows on the plain stage colour.
    }
    try {
      await this.scene.preloadHeads(looks);
    } catch {
      // Heads that failed show up blank.
    }
    // A newer round asked for another kitchen meanwhile.
    if (this.loading !== key) return;
    this.loading = null;
    const stage = new MirrorStage(kitchen, difficulty);
    this.stage = stage;
    this.stageFor = key;
    this.scene.setup(stage);
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.show(this.game.now());
  }

  /** Apply queued packets the playback point has reached (all of them when `all`). */
  private drain(now: number, all: boolean): void {
    const at = this.timeline.playhead(now);
    while (this.queue.length > 0) {
      const s = this.queue[0]!;
      if (!all && s.t > at) break;
      this.queue.shift();
      this.process(s);
    }
  }

  private process(s: MirrorState): void {
    // First packet of a match: everything listed has already happened.
    if (this.eventSeen === null || s.epoch !== this.eventEpoch || s.eventTop < this.eventSeen) {
      this.eventSeen = s.eventTop;
      this.eventEpoch = s.epoch;
      return;
    }
    const t = this.timeline.playhead(this.game.now());
    for (const e of newEvents(s, this.eventSeen)) this.playEvent(e, t);
    this.eventSeen = s.eventTop;
  }

  private playEvent(e: MirrorEvent, t: number): void {
    switch (e.type) {
      case 'celebrate':
        celebrate();
        return;
      case 'flash':
        this.scene.flash();
        return;
      default:
        break;
    }
    // The rest needs this screen's kitchen.
    if (!this.ready()) return;
    switch (e.type) {
      case 'float': {
        const sub = e.sub === '' ? undefined : e.sub;
        if (e.world) {
          this.hud.float(e.text, e.x, e.y, e.color, e.size, sub);
          return;
        }
        this.scene.toWorld(e.x, e.y, this.at);
        this.hud.float(e.text, this.at.x, this.at.y - 40, e.color, e.size, sub);
        return;
      }
      case 'pop':
        this.scene.mark({ kind: 'pop', x: e.x, y: e.y, color: e.color }, t);
        return;
      case 'throw':
        this.scene.mark({ kind: 'throw', id: e.id }, t);
        return;
      case 'moveWarn':
        this.scene.mark({ kind: 'moveWarn' }, t);
        return;
    }
  }

  /** The kitchen of the newest round is on the stage. */
  private ready(): boolean {
    const latest = this.timeline.latest;
    return this.stage !== null && latest !== null && stageKey(latest) === this.stageFor;
  }

  private syncPause(): void {
    const frozen = this.localPaused || this.hostHeld;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    this.hud.setPaused(frozen);
    if (frozen) this.phaser.pause();
    else this.phaser.resume();
  }

  private arrow(target: MirrorGuide['target']): { x: number; y: number; up: boolean } | null {
    if (!target) return null;
    const out = this.arrowAt;
    return this.scene.anchorOf(target, out) ? { x: out.x, y: out.y, up: out.up } : null;
  }

  /** Kitchen and HUD at the playback point. */
  private show(now: number): void {
    const span = this.timeline.sample(now);
    if (!span) return;
    const a = span.a;
    const at = this.timeline.playhead(now);
    const stage = this.stage;
    const onStage = a.round !== null && stage !== null && stageKey(a) === this.stageFor;
    // A round whose kitchen is still loading: keep the last picture.
    if (a.round && !onStage) return;
    if (onStage && stage) stage.apply(span);
    this.scene.frameT = at;
    this.scene.alpha = 1;
    if (now - this.lastHud < HUD_MS) return;
    this.lastHud = now;
    // The stage plays a little in the past; the countdown and clock run on server time.
    const latest = this.timeline.latest;
    const clockSrc =
      latest && latest.epoch === a.epoch && latest.round?.phase === a.round?.phase ? latest : a;
    this.hud.set(mirrorHud(a, at, mirrorClocks(clockSrc, now), (target) => this.arrow(target)));
  }

  private frame(): void {
    const now = this.game.now();
    this.drain(now, false);
    this.show(now);
  }
}
