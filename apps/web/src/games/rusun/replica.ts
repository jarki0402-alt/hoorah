/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD the Host's driver
 * drives, from the published display state. No rules, phones or sounds run here (the shell
 * forwards the Host's sounds). The hanging floor follows the Host's game clock exactly; drops are
 * replayed here when they arrive, and the HUD and call-outs wait until the replayed floor lands.
 */
import type { HoorahGame } from '@hoorah/sdk';
import { floorWidth } from '../../shared/art/rusun';
import { celebrate } from '../../shared/confetti';
import type { HudStore } from './hud';
import { type RusunEvent, TURN_MS } from './logic';
import { applyMirror, bubbleCard, type FxRow, MirrorTower, mirrorHud, type RusunMirror } from './mirror';
import type { SceneDriver } from './scene';

const TICK_MS = 200;
/** HUD card edges (stage px) the hanging floor can slide behind (same as the Host's driver). */
const TURN_CARD_RIGHT = 92 + 300;
const SIDE_PANEL_INSET = 24 + 210;

export class RusunReplica implements SceneDriver {
  readonly logic = new MirrorTower();
  /** Scene hook: pause/resume rendering and tweens. */
  onPause: (paused: boolean) => void = () => {};
  /** Scene hook: redraw the standing tower without animation. */
  onResync: () => void = () => {};

  private stageW = 1280;
  private padX = 0;
  private record = 0;
  /** Highest call-out number already handled (null before the first packet). */
  private fxSeen: number | null = null;
  /** Call-outs waiting for the drop they follow to land here. */
  private fxQueue: FxRow[] = [];
  private hudState: RusunMirror | null = null;
  private hudShown = false;
  private finaleShown = false;
  private hostPaused = false;
  private localPaused = false;
  private frozen = false;
  private ringFrac = 1;
  private ringSecs = TURN_MS / 1000;

  constructor(
    private readonly game: HoorahGame,
    private readonly hud: HudStore,
  ) {}

  get recordFloors(): number {
    return this.record;
  }

  now(): number {
    return this.logic.gameNow(this.game.now());
  }

  onEvent(fn: (e: RusunEvent) => void): () => void {
    return this.logic.onEvent(fn);
  }

  /** The Host's sounds arrive through the shell; nothing to play here. */
  impact(): void {}

  start(): void {
    this.logic.onEvent((e) => this.onReplayed(e));
    this.game.on('mirror', (raw) => this.apply(raw));
    this.game.on('pause', (paused) => {
      this.localPaused = paused;
      this.syncPause();
    });
    this.localPaused = this.game.paused;
    this.syncPause();
    // Frames stop while the scene is paused or the tab is hidden; replays still land on time.
    window.setInterval(() => this.step(), TICK_MS);
  }

  /** The stage grew or shrank: HUD cards sit at the stage edges, the world frame stays centred. */
  setStage(w: number): void {
    this.stageW = w;
    this.padX = Math.max(0, (w - 1280) / 2);
  }

  step(): void {
    this.logic.tick(this.game.now());
    this.settle();
  }

  frame(camY: number, now: number, _dtMs: number): void {
    const L = this.logic;
    if (L.phase === 'aim') {
      const rem = Math.max(0, L.deadline - now);
      this.ringFrac = rem / TURN_MS;
      this.ringSecs = Math.ceil(rem / 1000);
    } else if (L.phase !== 'falling') {
      this.ringFrac = 1;
      this.ringSecs = TURN_MS / 1000;
    }
    let fadeLeft = false;
    let fadeRight = false;
    if (L.phase === 'aim' || L.phase === 'waiting') {
      const x = L.swingX(now);
      const half = floorWidth(L.floorIndex) / 2 + 6;
      fadeLeft = this.padX + x - half < TURN_CARD_RIGHT;
      fadeRight = this.padX + x + half > this.stageW - SIDE_PANEL_INSET;
    }
    this.hud.frame({ camY, ring: this.ringFrac, secs: this.ringSecs, time: now, fadeLeft, fadeRight });
  }

  private apply(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    const first = this.fxSeen === null;
    this.logic.push(s, this.game.now());
    this.queueFx(s, first);
    this.hostPaused = s.pz !== null;
    this.syncPause();
    this.settle();
  }

  /** After any change: redraw the tower if needed, then show the HUD and call-outs that are due. */
  private settle(): void {
    const L = this.logic;
    if (L.resync) {
      L.resync = false;
      this.onResync();
    }
    const s = L.state;
    if (!s) return;
    if (!L.replaying || !this.hudShown) this.showHud(s);
    if (!this.fxQueue.length) return;
    // Call-outs from the drop being replayed (or later) wait for it to land here.
    const wait = L.pendingDrop;
    const due = this.fxQueue.filter((fx) => wait === null || fx.g < wait);
    if (!due.length) return;
    this.fxQueue = this.fxQueue.filter((fx) => !due.includes(fx));
    for (const fx of due) this.showFx(fx);
  }

  private queueFx(s: RusunMirror, first: boolean): void {
    const seen = this.fxSeen ?? Number.NEGATIVE_INFINITY;
    let top = seen;
    for (const fx of s.fx) {
      if (fx.n <= seen) continue;
      top = Math.max(top, fx.n);
      // Call-outs from before this screen joined have already played out.
      if (!first) this.fxQueue.push(fx);
    }
    this.fxSeen = Number.isFinite(top) ? top : 0;
  }

  private showFx(fx: FxRow): void {
    const until = this.now() + fx.ms;
    switch (fx.k) {
      case 'p':
        this.hud.addPopup({
          id: fx.n,
          x: fx.x,
          y: fx.y,
          kind: fx.pk,
          text: fx.tx,
          sub: fx.sb,
          tilt: fx.tl,
          until,
        });
        return;
      case 's':
        this.hud.shout.value = { id: fx.n, text: fx.tx, sub: fx.sb, until };
        return;
      case 'b':
        this.hud.addBubble({ id: fx.n, who: bubbleCard(fx), text: fx.tx, tone: fx.tn, x: fx.x, until });
        return;
    }
  }

  private showHud(s: RusunMirror): void {
    if (s === this.hudState) return;
    const firstHud = !this.hudShown;
    this.hudState = s;
    this.hudShown = true;
    const model = mirrorHud(s);
    this.record = model.record;
    this.hud.model.value = model;
    const finale = model.banner?.kind === 'finale';
    // Confetti only for a game this screen saw end, not one it joined afterwards.
    if (finale && !this.finaleShown && !firstHud) celebrate();
    this.finaleShown = finale;
  }

  /** Stage flourishes the Host's driver adds around the same events. */
  private onReplayed(e: RusunEvent): void {
    if (e.type === 'collapse') this.hud.shout.value = null;
    else if (e.type === 'topped') celebrate();
  }

  private syncPause(): void {
    const frozen = this.localPaused || this.hostPaused;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    this.hud.paused.value = frozen;
    this.onPause(frozen);
  }
}
