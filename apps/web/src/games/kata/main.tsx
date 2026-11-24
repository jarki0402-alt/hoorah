/** Sambung Kata bootstrap: connect to the shell, mount the stage, start the rules and the screen. */
import { connect, type HoorahGame } from '@hoorah/sdk';
import { effect, type ReadonlySignal, signal } from '@preact/signals';
import { render } from 'preact';
import { celebrate } from '../../shared/confetti';
import { fontsReady, mountStage } from '../common/stage';
import { paperUrl } from './backdrop';
import { KataDriver } from './driver';
import { applyMirror, type KataMirror, MirrorScene, toMirror } from './mirror';
import {
  type Banner,
  burstOver,
  FrameBus,
  KataScreen,
  type LogEntry,
  type ScreenModel,
  type SeatInfo,
  type StageSize,
} from './screen';
import { STR } from './strings';

/** The far screen keeps drawing even if rAF is throttled. */
const FALLBACK_TICK_MS = 250;

import './kata.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    const { stage } = mountStage(root);
    render(<div class="sk-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage, width, height, onResize } = mountStage(root);
  const size = signal<StageSize>({ w: width(), h: height() });
  onResize((h, w) => {
    size.value = { w, h };
  });
  await fontsReady();
  if (game.isMirror) {
    bootMirror(game, stage, size);
    return;
  }
  const driver = new KataDriver(game);
  render(<KataScreen model={driver} size={size} />, stage);
  driver.start();
  game.ready();
  game.music('kata');
  publishMirror(game, driver);
}

/** Host's screen: send the display state to far-away screens on every page change. */
function publishMirror(game: HoorahGame, driver: KataDriver): void {
  const send = () => {
    if (!game.mirrored) return;
    game.publish(
      toMirror({
        scene: driver.match,
        now: driver.clock.now(),
        toServer: (t) => driver.clock.toServer(t),
        held: driver.clock.held,
        log: driver.log(),
        banner: driver.banner(),
        info: driver.info,
        waiting: driver.waiting.peek(),
      }),
    );
  };
  effect(() => {
    void driver.version.value;
    void driver.waiting.value;
    send();
  });
  game.on('mirrors', (on) => {
    if (on) send();
  });
}

/** Far-away screen: the page model fed by the Host's published states (no rules, no phones). */
class MirrorModel implements ScreenModel {
  readonly version = signal(0);
  readonly waiting = signal(false);
  readonly frame = new FrameBus();

  constructor(readonly match: MirrorScene) {
    this.waiting.value = match.mirror.wait;
  }

  log = (): readonly LogEntry[] => this.match.log();
  banner = (): Banner | null => this.match.banner();
  info = (id: number): SeatInfo | undefined => this.match.info(id);

  apply(next: KataMirror, now: number): void {
    const prev = this.match.mirror;
    this.match.set(next, now);
    this.waiting.value = next.wait;
    this.version.value++;
    // The Host's driver celebrates on the final card; so does this screen.
    if (next.ph === 'final' && prev.ph !== 'final') {
      window.setTimeout(celebrate, 250);
      const id = next.win;
      if (id !== null) window.setTimeout(() => burstOver(id), 700);
    }
  }
}

function bootMirror(game: HoorahGame, stage: HTMLElement, size: ReadonlySignal<StageSize>): void {
  let model: MirrorModel | null = null;
  let frozen = false;
  /** CSS animations stop with the clock, as on the Host's screen. */
  const syncFrozen = (scene: MirrorScene) => {
    if (scene.frozen === frozen) return;
    frozen = scene.frozen;
    for (const anim of document.getAnimations()) {
      if (frozen) anim.pause();
      else anim.play();
    }
  };
  game.on('mirror', (raw) => {
    const state = applyMirror(raw);
    if (!state) return;
    const now = game.now();
    if (model) {
      model.apply(state, now);
      syncFrozen(model.match);
      return;
    }
    const scene = new MirrorScene(state, now);
    if (game.paused) scene.setLocalPause(true, now);
    const created = new MirrorModel(scene);
    model = created;
    game.on('pause', (paused) => {
      scene.setLocalPause(paused, game.now());
      syncFrozen(scene);
    });
    render(<KataScreen model={created} size={size} />, stage);
    syncFrozen(scene);
    const tick = () => created.frame.emit(scene.time(game.now()));
    const loop = () => {
      tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.setInterval(tick, FALLBACK_TICK_MS);
  });
  // Blank notebook page until the Host's first state arrives.
  const { w, h } = size.value;
  render(
    <div class="sk-root">
      <img class="sk-bg" src={paperUrl(w, h)} alt="" width={w} height={h} draggable={false} />
    </div>,
    stage,
  );
  game.ready();
}

void boot();
