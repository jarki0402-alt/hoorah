/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD the Host's
 * driver drives, from the published display state. No rules, physics, phones or sounds run here
 * (the shell forwards the Host's sounds and music). A local World of the same level stands in for
 * the Host's: it is never stepped, only posed at the playback point a little in the past, so the
 * scene draws it exactly as it draws the Host's. Effects play when the playback point reaches the
 * packet that brought them; the stage clock and the next-level wait run on server time.
 */
import { lookOfFruit } from '@hoorah/protocol';
import type { HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { showEffect } from './effects';
import type { Hud } from './hud';
import { hudOf } from './hudstate';
import type { Phase } from './logic';
import {
  applyMirror,
  castLook,
  hintAt,
  type MirrorEvent,
  type MirrorStage,
  type MirrorState,
  MirrorTimeline,
  mirrorClocks,
  newEvents,
  poseWorld,
  type Span,
} from './mirror';
import type { CharLook, WarnaScene } from './scene';
import { World } from './world';

const HUD_MS = 100;
/** Packets waiting for the playback point; beyond this the oldest is applied at once. */
const QUEUE_MAX = 24;
/** The opening that shows the exits lasts into play this long (s), as on the Host. */
const GOAL_PLAY_S = 2;
const FALLBACK: CharLook = { name: '', look: lookOfFruit('jeruk'), idle: false };

/** Which local World a packet's stage needs (a new one for every Host stage or restart). */
const worldKeyOf = (epoch: number, st: MirrorStage): string =>
  `${epoch}|${st.serial}|${st.level.index}|${st.chars.length}`;

export class WarnaReplica {
  private readonly timeline = new MirrorTimeline();
  /** Packets whose stage switches and effects wait for the playback point. */
  private readonly queue: MirrorState[] = [];
  private world: World | null = null;
  /** The stage the local World was built for, and the packet stage last posed. */
  private worldKey = '';
  private stage: MirrorStage | null = null;
  /** Highest effect event already played, null before the first packet of a Host session. */
  private eventSeen: number | null = null;
  private epoch = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private hostHeld = false;
  private frozen = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: WarnaScene,
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
    const before = this.timeline.latest;
    const snap = this.timeline.push(s, now);
    this.queue.push(s);
    // While this screen is paused no frames drain the queue: keep it short anyway.
    while (this.queue.length > QUEUE_MAX) this.process(this.queue.shift()!);
    this.hostHeld = s.hold;
    if (snap) {
      // A new stage, phase or pause state shows at once, even while no frames run.
      this.drain(now, true);
      this.onStretch(before, s);
      this.lastHud = Number.NEGATIVE_INFINITY;
      this.show(now);
    }
    this.syncPause();
  }

  /** Replay what the Host did on entering a phase it saw happen live. */
  private onStretch(before: MirrorState | null, s: MirrorState): void {
    const was: Phase | null = before && before.epoch === s.epoch ? before.phase : null;
    if (s.phase === 'clear' && was === 'play' && !s.score?.skipped) celebrate();
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
    if (s.epoch !== this.epoch) {
      this.epoch = s.epoch;
      this.eventSeen = null;
    }
    const st = s.stage;
    if (st) {
      const key = worldKeyOf(s.epoch, st);
      if (key !== this.worldKey || !this.world) {
        this.worldKey = key;
        this.stage = st;
        const world = new World(
          st.level,
          st.chars.map((c) => ({ owner: c.owner, sub: c.sub })),
          { solo: st.solo },
        );
        this.world = world;
        poseWorld(world, st, null, 0);
        this.scene.attach(world, (k) => this.look(k));
      }
    }
    this.playEvents(s);
  }

  private look(key: number): CharLook {
    return (this.stage && castLook(this.stage, key)) ?? FALLBACK;
  }

  private playEvents(s: MirrorState): void {
    // First packet of a Host session: everything listed has already happened.
    if (this.eventSeen === null || s.eventTop < this.eventSeen) {
      this.eventSeen = s.eventTop;
      return;
    }
    for (const e of newEvents(s, this.eventSeen)) this.playEvent(e);
    this.eventSeen = s.eventTop;
  }

  private playEvent(ev: MirrorEvent): void {
    const w = this.world;
    const e = ev.e;
    if (!w) return;
    // Effects of characters this stage does not have belong to an older one.
    if ('key' in e && !w.chars[e.key]) return;
    if (e.type === 'gem' && !w.gems[e.gem]) return;
    if (e.type === 'ping') w.chars[e.key]!.pingAt = w.t;
    if (e.type === 'respawn') this.poseNow();
    showEffect(this.scene, this.hud, w, e);
  }

  /** Poses the World at the playback point right away (a respawn ring belongs where it lands). */
  private poseNow(): void {
    const span = this.timeline.sample(this.game.now());
    if (span) this.pose(span);
  }

  private pose(span: Span): void {
    const w = this.world;
    const a = span.a.stage;
    if (!w || !a || worldKeyOf(span.a.epoch, a) !== this.worldKey) return;
    this.stage = a;
    poseWorld(w, a, span.b.stage, span.k);
  }

  private syncPause(): void {
    const frozen = this.localPaused || this.hostHeld;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    this.hud.setPaused(frozen);
    if (frozen) this.phaser.pause();
    else this.phaser.resume();
  }

  /** The stage and HUD at the playback point. */
  private show(now: number): void {
    const span = this.timeline.sample(now);
    if (!span) return;
    const w = this.world;
    if (w) w.t = now / 1000;
    this.pose(span);
    const a = span.a;
    // The stage plays a little in the past; the clock and the next-level wait run on server time.
    const latest = this.timeline.latest;
    const clockSrc = latest && latest.epoch === a.epoch && latest.phase === a.phase ? latest : a;
    const clocks = mirrorClocks(clockSrc, now);
    const playing = a.phase === 'play' && w !== null;
    this.scene.setGoal(a.phase === 'intro' || (a.phase === 'play' && clocks.playT < GOAL_PLAY_S));
    this.scene.setHint(playing && a.hint && w ? hintAt(a.hint, w) : null);
    if (now - this.lastHud < HUD_MS) return;
    this.lastHud = now;
    this.hud.setState(
      hudOf({
        phase: a.phase,
        pickStep: a.pickStep,
        world: a.world,
        pick: a.pick,
        level: a.level,
        progress: a.progress,
        limited: a.limited,
        host: a.host,
        playT: clocks.playT,
        nextLeft: clocks.nextLeft,
        tip: a.tip,
        hint: playing && a.hint && w ? hintAt(a.hint, w) : null,
        vote: a.vote,
        score: a.score,
        solo: a.stage?.solo ?? false,
        sim: w,
        look: (k) => this.look(k),
        color: (owner) => this.stage?.chars.find((c) => c.owner === owner)?.color ?? '#FFFFFF',
      }),
    );
  }

  private frame(): void {
    const now = this.game.now();
    this.drain(now, false);
    this.show(now);
  }
}
