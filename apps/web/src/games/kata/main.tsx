/** Sambung Kata bootstrap: connect to the shell, mount the stage, start the rules and the screen. */
import { connect, type HoorahGame } from '@hoorah/sdk';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { fontsReady, mountStage } from '../common/stage';
import { KataDriver } from './driver';
import { KataScreen, type StageSize } from './screen';
import { STR } from './strings';
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
  const driver = new KataDriver(game);
  render(<KataScreen model={driver} size={size} />, stage);
  driver.start();
  game.ready();
  game.music('kata');
}

void boot();
