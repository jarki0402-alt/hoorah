/** Ular Tangga bootstrap: connect to the shell, mount the stage, the DOM board and the HUD. */
import { connect, type HoorahGame } from '@hoorah/sdk';
import { render } from 'preact';
import { svgUrl } from '../../shared/art/svg';
import { matTile } from '../../shared/art/ular';
import { fontsReady, mountStage } from '../common/stage';
import { makeBoard, parseSize } from './board';
import { UlarDriver } from './driver';
import { Hud, HudStore } from './hud';
import { computeLayout } from './layout';
import { UlarReplica } from './replica';
import { STR } from './strings';
import './ular.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    root.textContent = STR.noShell;
    return;
  }

  const { stage, width, height, onResize } = mountStage(root);
  stage.classList.add('ul-stage');
  stage.style.setProperty('--ul-mat', `url("${svgUrl('ular:mat', () => matTile(48))}")`);
  await fontsReady();

  const size = parseSize(game.settings.rounds);
  const hud = new HudStore(makeBoard(size));
  if (game.isMirror) {
    // Long-distance play: draw the Host's game from its published state, run nothing of our own.
    const replica = new UlarReplica(game, hud);
    replica.setLayout(computeLayout(size, width(), height()));
    render(<Hud store={hud} />, stage);
    onResize((h, w) => replica.setLayout(computeLayout(size, w, h)));
    replica.start();
    game.ready();
    return;
  }
  const driver = new UlarDriver(game, hud);
  driver.setLayout(computeLayout(size, width(), height()));
  render(<Hud store={hud} />, stage);
  onResize((h, w) => driver.setLayout(computeLayout(size, w, h)));
  driver.start();

  game.ready();
  game.music('ular');
}

void boot();
