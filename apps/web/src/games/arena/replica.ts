/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD the Host's driver
 * drives, from the published display state. No rules, brains, phones or sounds run here (the shell
 * forwards the Host's sounds and music) and the game is never ended from here. Snakes glide between
 * packets a little in the past; seed changes and effects (bites, knock-outs, spawns, feed lines)
 * play when the playback point reaches the packet that brought them, so they line up with the
 * snakes. Intro, countdown, GO, the last seconds and the round clock run on server time, like on
 * the Host.
 */
import type { HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { FEED_MS, koFlourish, leadFlourish, warningFlourish } from './effects';
import type { Hud } from './hud';
import { panelRect } from './layout';
import type { Phase } from './logic';
import {
  applyMirror,
  type MirrorEvent,
  type MirrorState,
  MirrorTimeline,
  mirrorClocks,
  mirrorHud,
  newEvents,
} from './mirror';
import { RemoteStage } from './remote';
import { type ArenaScene, HEAD_SCALE } from './scene';
import { STR } from './strings';

const HUD_MS = 100;
/** Packets waiting for the playback point; beyond this the oldest is applied at once. */
const QUEUE_MAX = 24;
/** Name tags the HUD has. */
const TAGS = 16;

export class ArenaReplica {
  private readonly timeline = new MirrorTimeline();
  private readonly stage = new RemoteStage();
  /** Packets whose seeds and effects wait for the playback point. */
  private readonly queue: MirrorState[] = [];
  /** Highest effect event already played, null before the first packet of a match. */
  private eventSeen: number | null = null;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private hostHeld = false;
  private frozen = false;
  private stageW = 1280;
  private stageH = 720;
  private readonly pt = { x: 0, y: 0 };

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: ArenaScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {}

  start(): void {
    void this.scene.attach(this.stage);
    this.game.on('mirror', (state) => this.receive(state));
    this.game.on('pause', (paused) => {
      this.localPaused = paused;
      this.syncPause();
    });
    this.localPaused = this.game.paused;
    this.syncPause();
    this.scene.onFrame = () => this.frame();
  }

  setStage(w: number, h: number): void {
    this.stageW = w;
    this.stageH = h;
    this.lastHud = Number.NEGATIVE_INFINITY;
  }

  private receive(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    const now = this.game.now();
    if (this.stage.receive(s)) {
      // A new match from the Host: nothing queued from the old one may play.
      this.queue.length = 0;
      this.eventSeen = null;
    }
    const before = this.timeline.latest?.phase ?? null;
    const snap = this.timeline.push(s, now);
    this.queue.push(s);
    // While this screen is paused no frames drain the queue: keep it short anyway.
    while (this.queue.length > QUEUE_MAX) this.process(this.queue.shift()!);
    this.hostHeld = s.hold;
    if (snap) {
      // A new phase, match or pause state shows at once, even while no frames run.
      this.drain(now, true);
      this.onStretch(before, s);
      this.lastHud = Number.NEGATIVE_INFINITY;
      this.show(now);
    }
    this.syncPause();
  }

  /** Replay what the Host did on entering a phase it saw happen live. */
  private onStretch(before: Phase | null, s: MirrorState): void {
    if (s.phase === 'podium' && before === 'over') celebrate();
  }

  /** Apply queued packets the playback point has reached (all of them when `all`). */
  private drain(now: number, all: boolean): void {
    const at = this.timeline.playhead(now);
    this.stage.now = at;
    while (this.queue.length > 0) {
      const s = this.queue[0]!;
      if (!all && s.t > at) break;
      this.queue.shift();
      this.process(s);
    }
  }

  private process(s: MirrorState): void {
    const eaten = this.stage.apply(s);
    for (const e of eaten) this.scene.onEat(e.id, e.x, e.y, e.value, e.color);
    // First packet of a match: everything listed has already happened.
    if (this.eventSeen === null || s.eventTop < this.eventSeen) {
      this.eventSeen = s.eventTop;
      return;
    }
    for (const e of newEvents(s, this.eventSeen)) this.playEvent(e, s);
    this.eventSeen = s.eventTop;
  }

  private playEvent(e: MirrorEvent, s: MirrorState): void {
    const stage = this.stage;
    const now = this.game.now();
    switch (e.type) {
      case 'spawn': {
        this.scene.onSpawn(e.id, e.x, e.y);
        const r = stage.snake(e.id) ?? s.snakes.find((x) => x.id === e.id);
        if (s.phase === 'play' && e.first && r) this.hud.pushFeed(STR.feedJoin(r.name), r.color, now);
        return;
      }
      case 'ko':
        koFlourish(
          this.scene,
          this.hud,
          e,
          stage.snake(e.id),
          e.by === null ? undefined : stage.snake(e.by),
          now,
        );
        return;
      case 'removed':
        this.scene.onRemoved(e.id);
        return;
      case 'lead': {
        const r = stage.snake(e.id);
        if (r) leadFlourish(this.scene, this.hud, r, now);
        return;
      }
      case 'warning':
        warningFlourish(this.scene);
        return;
    }
  }

  private syncPause(): void {
    const frozen = this.localPaused || this.hostHeld;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    this.hud.setPaused(frozen);
    if (frozen) this.phaser.pause();
    else this.phaser.resume();
  }

  /** Snakes, tags and HUD at the playback point. */
  private show(now: number): void {
    const span = this.timeline.sample(now);
    if (!span) return;
    this.stage.now = this.timeline.playhead(now);
    for (const id of this.stage.place(span)) this.scene.onBoost(id);
    this.placeTags(span.a);
    if (now - this.lastHud < HUD_MS) return;
    this.lastHud = now;
    // The stage plays a little in the past; the clocks run on server time from the newest packet.
    const latest = this.timeline.latest;
    const a = span.a;
    const clockSrc = latest && latest.epoch === a.epoch && latest.phase === a.phase ? latest : a;
    const clocks = mirrorClocks(clockSrc, now);
    this.scene.urgent = clocks.urgent;
    const v = this.scene.view;
    this.hud.setState(
      mirrorHud(a, clocks, panelRect(this.stageW, this.stageH), { x: v.x, y: v.y, w: v.w, h: v.h }),
    );
    this.hud.pruneFeed(now, FEED_MS);
  }

  private placeTags(a: MirrorState): void {
    const all = this.stage.all;
    const s = this.scene.view.s;
    const { leader, phase } = a;
    const showNames = phase === 'intro' || phase === 'countdown' || phase === 'play';
    for (let i = 0; i < TAGS; i++) {
      const sn = all[i];
      if (!sn || !showNames || !sn.alive || sn.gone || !sn.inMatch) {
        this.hud.tag(i, false, 0, 0, '', '', false);
        continue;
      }
      const p = this.scene.toStage(sn.x, sn.y, this.pt);
      const lift = sn.radius * HEAD_SCALE * s + 6;
      this.hud.tag(i, true, p.x, p.y - lift, sn.name, sn.color, leader === sn.id);
    }
  }

  private frame(): void {
    const now = this.game.now();
    this.drain(now, false);
    this.show(now);
  }
}
