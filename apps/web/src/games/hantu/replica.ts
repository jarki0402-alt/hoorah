/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD the Host's driver
 * drives, from the published display state. No rules, ghost brain, phones or sounds run here (the
 * shell forwards the Host's sounds and music), and the game never ends from here. Residents glide
 * between packets a little in the past; flashes play when the playback point reaches the packet
 * that brought them. The round clock runs on server time, like on the Host.
 */
import { lookOfFruit } from '@hoorah/protocol';
import type { HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import type { Hud } from './hud';
import type { Phase } from './logic';
import {
  applyMirror,
  type MirrorState,
  MirrorTimeline,
  MirrorWorld,
  mirrorHud,
  mirrorLeft,
  newFx,
} from './mirror';
import type { HantuScene, ResidentLook } from './scene';

const HUD_MS = 100;
/** Packets waiting for the playback point; beyond this the oldest is applied at once. */
const QUEUE_MAX = 24;

const colorNumber = (hex: string): number => Number.parseInt(hex.slice(1), 16);

export class HantuReplica {
  private readonly timeline = new MirrorTimeline();
  private world: MirrorWorld | null = null;
  /** Which Host round the scene shows ('' none). */
  private worldKey = '';
  /** Packets whose flashes wait for the playback point. */
  private readonly queue: MirrorState[] = [];
  /** Highest flash already played, null before the first packet of a session. */
  private fxSeen: number | null = null;
  private fxEpoch = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private hostHeld = false;
  private frozen = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: HantuScene,
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
    while (this.queue.length > QUEUE_MAX) this.playFx(this.queue.shift()!);
    this.hostHeld = s.hold;
    if (snap) {
      // A new phase, round or pause state shows at once, even while no frames run.
      this.drain(now, true);
      this.onStretch(before, s);
      this.lastHud = Number.NEGATIVE_INFINITY;
      this.show(now);
    }
    this.syncPause();
  }

  /** Replay what the Host did on entering a phase it saw happen live. */
  private onStretch(before: Phase | null, s: MirrorState): void {
    if (before === 'hunt' && s.phase === 'end' && s.overlay.kind === 'end' && s.overlay.good) celebrate();
  }

  /** Play the flashes of queued packets the playback point has reached (all of them when `all`). */
  private drain(now: number, all: boolean): void {
    const at = this.timeline.playhead(now);
    while (this.queue.length > 0) {
      const s = this.queue[0]!;
      if (!all && s.t > at) break;
      this.queue.shift();
      this.playFx(s);
    }
  }

  private playFx(s: MirrorState): void {
    // First packet of a session: everything listed has already happened.
    if (this.fxSeen === null || s.epoch !== this.fxEpoch || s.fxTop < this.fxSeen) {
      this.fxSeen = s.fxTop;
      this.fxEpoch = s.epoch;
      return;
    }
    for (const f of newFx(s, this.fxSeen)) this.scene.flash(f.strength);
    this.fxSeen = s.fxTop;
  }

  private look(id: number): ResidentLook {
    const r = this.world?.resident(id);
    return r
      ? { name: r.name, look: r.look, color: colorNumber(r.color) }
      : { name: '', look: lookOfFruit('jeruk'), color: 0xffffff };
  }

  private syncPause(): void {
    const frozen = this.localPaused || this.hostHeld;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    this.hud.setPaused(frozen);
    if (frozen) this.phaser.pause();
    else this.phaser.resume();
  }

  /** The house and HUD at the playback point. */
  private show(now: number): void {
    const span = this.timeline.sample(now);
    if (!span) return;
    const a = span.a;
    const stage = a.stage;
    const key = stage ? `${a.epoch}|${stage.round}|${a.map}` : '';
    if (key !== this.worldKey) {
      this.worldKey = key;
      if (stage) {
        this.world = new MirrorWorld({ ...a, stage });
        this.scene.attach(this.world, (id) => this.look(id));
      } else {
        this.world = null;
        this.scene.detach();
      }
    }
    this.world?.update(span);
    if (now - this.lastHud >= HUD_MS) {
      this.lastHud = now;
      // The stage plays a little in the past; the round clock runs on server time.
      const latest = this.timeline.latest;
      const clockSrc =
        latest && latest.epoch === a.epoch && latest.phase === a.phase && latest.stage?.round === stage?.round
          ? latest
          : a;
      this.hud.setState(mirrorHud(a, mirrorLeft(clockSrc, now)));
      this.hud.setFeed(a.feed);
    }
  }

  private frame(): void {
    const now = this.game.now();
    this.drain(now, false);
    this.show(now);
  }
}
