/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD the Host's
 * driver drives, from the published state. No rules, phones or sounds run here (the shell
 * forwards the Host's sounds and music) and the game is never ended from here.
 *
 * The scene clock is this screen's server-synced `game.now()`, and every swing comes anchored in
 * server time, so each kerupuk is drawn every frame exactly where the Host judges a press stamped
 * at that moment, however late the packets arrive. While the Host is paused the clock stands at
 * the instant its game time stopped. Bites and chokes are replayed when their packet arrives.
 */
import type { HoorahGame } from '@hoorah/sdk';
import { celebrate } from '../../shared/confetti';
import type { Hud } from './hud';
import { PopStack } from './layout';
import type { Phase } from './logic';
import {
  applyMirror,
  type KerupukMirror,
  MarkReader,
  mirrorHud,
  mirrorLanes,
  mirrorNow,
  type StageMark,
} from './mirror';
import type { LaneModel, SceneDriver } from './scene';
import { STR } from './strings';

/** HUD refresh (timer, countdown, GIGIT flash, choke plates). */
const TICK_MS = 100;

export class KerupukReplica implements SceneDriver {
  /** This screen's own pause (shell menu): the stage stops drawing. */
  onPause: (paused: boolean) => void = () => {};
  effects: {
    bite: (id: number, perfect: boolean, finished: boolean) => void;
    choke: (id: number) => void;
  } = { bite: () => {}, choke: () => {} };

  private state: KerupukMirror | null = null;
  private models: LaneModel[] = [];
  private readonly marks = new MarkReader();
  private readonly pops = new PopStack();
  private readonly origin = { x: 0, y: 0 };
  private lineKey = -1;
  private localPaused = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly hud: Hud,
  ) {}

  /* ---------------------------------------------------------------- SceneDriver */

  now(): number {
    const server = this.game.now();
    return this.state ? mirrorNow(this.state, server) : server;
  }

  lanes(): readonly LaneModel[] {
    return this.models;
  }

  /* ---------------------------------------------------------------- lifecycle */

  start(): void {
    this.game.on('mirror', (raw) => this.apply(raw));
    this.game.on('pause', (paused) => this.setLocalPause(paused));
    this.setLocalPause(this.game.paused);
    window.setInterval(() => this.refreshHud(), TICK_MS);
  }

  /** Stage px of world (0, 0), from the scene. */
  setOrigin(x: number, y: number): void {
    this.origin.x = x;
    this.origin.y = y;
    this.refreshHud();
  }

  private setLocalPause(paused: boolean): void {
    if (paused === this.localPaused) return;
    this.localPaused = paused;
    this.onPause(paused);
    this.refreshHud();
  }

  private apply(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    const before: Phase | null = this.state?.ph ?? null;
    this.state = s;
    this.models = mirrorLanes(s);
    for (const mark of this.marks.read(s)) this.play(mark, s);
    const tk = s.tk;
    const key = tk ? tk[0] : -1;
    if (key !== this.lineKey) {
      this.lineKey = key;
      this.hud.line.value = tk ? { key: tk[0], bold: tk[1], text: tk[2] } : null;
    }
    // Confetti only for a finale this screen saw begin, not one it joined afterwards.
    if (s.ph === 'finale' && before !== null && before !== 'finale' && before !== 'ended') celebrate();
    this.refreshHud();
  }

  /** The same crumbs, cough and floating word the Host showed for this bite or choke. */
  private play(mark: StageMark, s: KerupukMirror): void {
    const index = s.ln.findIndex((r) => r[0] === mark.id);
    if (index < 0) return;
    const at = this.pops.place(mark.id, index, s.ln.length, this.now(), this.origin);
    if (mark.type === 'choke') {
      this.effects.choke(mark.id);
      this.hud.pop(at.x, at.y, STR.popChoke, 'choke');
      return;
    }
    this.effects.bite(mark.id, mark.perfect, mark.finished);
    if (mark.finished) this.hud.pop(at.x, at.y, STR.popFinish, 'finish');
    else if (mark.perfect) this.hud.pop(at.x, at.y, STR.popPerfect, 'perfect');
    else this.hud.pop(at.x, at.y, STR.popBite, 'bite');
  }

  private refreshHud(): void {
    const s = this.state;
    this.hud.paused.value = this.localPaused || (s !== null && s.hd !== null);
    if (!s) return;
    this.hud.model.value = mirrorHud(s, this.now(), this.origin);
  }
}
