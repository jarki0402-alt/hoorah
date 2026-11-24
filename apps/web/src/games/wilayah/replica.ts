/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD the Host's
 * director drives, from the published display state. No rules, brains, phones or sounds run here
 * (the shell forwards the Host's sounds and music). Heads glide between packets a little in the
 * past; land changes and effects (capture rings, knock-outs, respawns, feed lines) play when the
 * playback point reaches the packet that brought them, so they line up with the heads. The
 * countdown and the round clock run on server time, like on the Host.
 */
import type { HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { FEED_BIG_PCT, gainFloatSize, OUT_RED, outFeedLine } from './director';
import type { Hud } from './hud';
import type { Phase } from './logic';
import {
  applyMirror,
  type MirrorEvent,
  MirrorGrid,
  type MirrorRunner,
  type MirrorState,
  MirrorTimeline,
  mirrorClocks,
  mirrorHud,
  newEvents,
  type Pose,
  poseAt,
  type Span,
} from './mirror';
import type { StageModel, StageRunner, WilayahScene } from './scene';
import { formatPct, STR } from './strings';

const HUD_MS = 100;
/** Packets waiting for the playback point; beyond this the oldest is applied at once. */
const QUEUE_MAX = 24;

/** A runner as this screen draws it. */
interface RunnerView extends StageRunner {
  shield: boolean;
  home: boolean;
  trail: MirrorRunner['trail'];
}

/** The scene's model on a far-away screen: the rebuilt floor and the runners at the playback point. */
class MirrorStage implements StageModel {
  phase: Phase = 'countdown';
  readonly field: StageModel['field'];
  readonly geo: StageModel['geo'];
  readonly list: RunnerView[] = [];
  readonly byId = new Map<number, RunnerView>();

  constructor(grid: MirrorGrid, unit: number) {
    this.field = { cols: grid.cols, rows: grid.rows, size: grid.cols * grid.rows, owner: grid.owner };
    this.geo = { unit };
  }

  all(): readonly StageRunner[] {
    return this.list;
  }

  runner(id: number): RunnerView | undefined {
    return this.byId.get(id);
  }

  isProtected(r: StageRunner): boolean {
    return r.alive && (this.byId.get(r.id)?.shield ?? false);
  }

  isHome(r: StageRunner): boolean {
    return this.byId.get(r.id)?.home ?? true;
  }
}

export class WilayahReplica {
  private readonly timeline = new MirrorTimeline();
  private readonly grid = new MirrorGrid();
  private stage: MirrorStage | null = null;
  /** Packets whose land and effects wait for the playback point. */
  private readonly queue: MirrorState[] = [];
  /** Highest effect event already played, null before the first packet of a match. */
  private eventSeen: number | null = null;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private hostHeld = false;
  private frozen = false;
  private readonly pose: Pose = { x: 0, y: 0, angle: 0 };
  private readonly at = { x: 0, y: 0 };

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: WilayahScene,
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
    const before = this.timeline.latest?.phase ?? null;
    const snap = this.timeline.push(s, now);
    this.queue.push(s);
    // While this screen is paused no frames drain the queue: keep it short anyway.
    while (this.queue.length > QUEUE_MAX) this.process(this.queue.shift()!, now);
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
    if (s.phase === 'over' && before === 'play') {
      this.scene.flash();
      celebrate();
    }
  }

  /** Apply queued packets the playback point has reached (all of them when `all`). */
  private drain(now: number, all: boolean): void {
    const at = this.timeline.playhead(now);
    while (this.queue.length > 0) {
      const s = this.queue[0]!;
      if (!all && s.t > at) break;
      this.queue.shift();
      this.process(s, now);
    }
  }

  private process(s: MirrorState, now: number): void {
    const changes = this.grid.apply(s);
    if (changes.reset || !this.stage) {
      const stage = new MirrorStage(this.grid, s.unit);
      this.stage = stage;
      this.eventSeen = null;
      this.syncRunners(stage, { a: s, b: s, k: 0 });
      this.scene.setup(stage);
      this.scene.paint([...changes.fresh, ...changes.cleared, ...changes.fixed], now, 'instant');
    } else {
      this.scene.paint(changes.fresh, now, 'fresh');
      this.scene.paint(changes.cleared, now, 'plain');
      this.scene.paint(changes.fixed, now, 'instant');
    }
    this.playEvents(s, now);
  }

  private playEvents(s: MirrorState, now: number): void {
    // First packet of a match: everything listed has already happened.
    if (this.eventSeen === null || s.eventTop < this.eventSeen) {
      this.eventSeen = s.eventTop;
      return;
    }
    for (const e of newEvents(s, this.eventSeen)) this.playEvent(e, now);
    this.eventSeen = s.eventTop;
  }

  private playEvent(e: MirrorEvent, now: number): void {
    const stage = this.stage;
    if (!stage) return;
    const r = stage.runner(e.id);
    switch (e.type) {
      case 'capture': {
        if (!r) return;
        this.scene.onEvent(
          {
            type: 'capture',
            id: e.id,
            cells: [],
            dist: [],
            gained: e.gained,
            x: e.x,
            y: e.y,
            victims: [],
            loop: 0,
          },
          now,
        );
        const pct = e.gained * 100;
        this.scene.toWorld(e.x, e.y, this.at);
        this.hud.float(STR.gainFloat(formatPct(pct)), this.at.x, this.at.y, r.color, gainFloatSize(pct));
        if (pct >= FEED_BIG_PCT) this.hud.pushFeed(STR.feedBig(r.name, formatPct(pct, 0)), r.color);
        return;
      }
      case 'out': {
        const trail: number[] = [];
        if (r) for (let k = 0; k < r.trail.len; k++) trail.push(r.trail.xs[k]!, r.trail.ys[k]!);
        this.scene.onEvent(
          { type: 'out', id: e.id, by: e.by, cause: e.cause, x: e.x, y: e.y, cleared: [], trail },
          now,
        );
        this.scene.toWorld(e.x, e.y, this.at);
        this.hud.float(STR.outFloat, this.at.x, this.at.y - 18, OUT_RED, 34, 40);
        const by = e.by === null ? undefined : stage.runner(e.by);
        const line = r ? outFeedLine(e.cause, r, by) : null;
        if (line) this.hud.pushFeed(line.text, line.color);
        return;
      }
      case 'spawn':
        if (r) this.scene.onEvent({ type: 'spawn', id: e.id, cells: [], x: e.x, y: e.y, first: false }, now);
        return;
    }
  }

  /** Runners as the Host showed them at the playback point. */
  private syncRunners(stage: MirrorStage, span: Span): void {
    const { a, b, k } = span;
    stage.phase = a.phase;
    const seen = new Set<number>();
    for (const src of a.runners) {
      seen.add(src.id);
      const p = poseAt(
        src,
        b.runners.find((r) => r.id === src.id),
        k,
        this.pose,
      );
      let view = stage.byId.get(src.id);
      if (!view) {
        view = {
          id: src.id,
          v: src.v,
          name: src.name,
          look: src.look,
          color: src.color,
          alive: src.alive,
          x: p.x,
          y: p.y,
          px: p.x,
          py: p.y,
          angle: p.angle,
          pangle: p.angle,
          shield: src.shield,
          home: src.home,
          trail: src.trail,
        };
        stage.byId.set(src.id, view);
        stage.list.push(view);
      }
      view.v = src.v;
      view.name = src.name;
      view.look = src.look;
      view.color = src.color;
      view.alive = src.alive;
      view.shield = src.shield;
      view.home = src.home;
      view.trail = src.trail;
      // The scene draws between logic steps; here every frame is already in between.
      view.x = p.x;
      view.y = p.y;
      view.px = p.x;
      view.py = p.y;
      view.angle = p.angle;
      view.pangle = p.angle;
    }
    for (let i = stage.list.length - 1; i >= 0; i--) {
      const view = stage.list[i]!;
      if (seen.has(view.id)) continue;
      stage.list.splice(i, 1);
      stage.byId.delete(view.id);
      this.scene.onEvent({ type: 'leave', id: view.id, cleared: [] }, 0);
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

  /** Runners and HUD at the playback point. */
  private show(now: number): void {
    const stage = this.stage;
    const span = this.timeline.sample(now);
    if (!stage || !span) return;
    this.syncRunners(stage, span);
    this.scene.frameT = now;
    this.scene.alpha = 1;
    if (now - this.lastHud >= HUD_MS) {
      this.lastHud = now;
      // The stage plays a little in the past; the countdown and clock run on server time.
      const latest = this.timeline.latest;
      const a = span.a;
      const clockSrc = latest && latest.epoch === a.epoch && latest.phase === a.phase ? latest : a;
      this.hud.setState(mirrorHud(a, mirrorClocks(clockSrc, now)));
    }
  }

  private frame(): void {
    const now = this.game.now();
    this.drain(now, false);
    this.show(now);
  }
}
