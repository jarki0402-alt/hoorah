/** Ludo bootstrap: connect to the shell, mount the stage, start the rules and the DOM view. */
import { connect, type HoorahGame } from '@hoorah/sdk';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { fontsReady, mountStage } from '../common/stage';
import { tableUrl } from './backdrop';
import { LudoDriver } from './driver';
import { LudoScreen, type StageSize } from './screen';
import { LudoStore } from './store';
import { STR } from './strings';
import './ludo.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    const { stage } = mountStage(root);
    render(<div class="ld-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage, width, height, onResize } = mountStage(root);
  stage.classList.add('ld-stage');
  stage.style.backgroundImage = `url("${tableUrl()}")`;
  const size = signal<StageSize>({ w: width(), h: height() });
  onResize((h, w) => {
    size.value = { w, h };
  });
  await fontsReady();
  const store = new LudoStore();
  const driver = new LudoDriver(game, store);
  driver.start();
  render(<LudoScreen store={store} size={size} />, stage);
  game.ready();
  game.music('ludo');
}

void boot();
