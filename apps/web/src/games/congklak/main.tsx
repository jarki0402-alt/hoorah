/** Congklak bootstrap: connect to the shell, mount the stage, start the driver and the board view. */
import { connect, type HoorahGame } from '@hoorah/sdk';
import { render } from 'preact';
import { fontsReady, mountStage } from '../common/stage';
import { CongklakDriver } from './driver';
import { CongklakReplica } from './replica';
import { STR } from './strings';
import { CongklakTv, TvStore } from './tv';
import './congklak.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    const { stage } = mountStage(root);
    render(<div class="ck-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage } = mountStage(root);
  await fontsReady();
  const tv = new TvStore();
  if (game.isMirror) {
    // Long-distance play: draw the Host's game from its published state, run nothing of our own.
    const replica = new CongklakReplica(game, tv);
    render(<CongklakTv store={tv} />, stage);
    replica.start();
    game.ready();
    return;
  }
  const driver = new CongklakDriver(game, tv);
  // Dev-only hook for local harnesses (never in builds).
  if (import.meta.env.DEV) (window as unknown as { __congklak?: CongklakDriver }).__congklak = driver;
  render(<CongklakTv store={tv} />, stage);
  driver.start();
  game.ready();
  game.music('congklak');
}

void boot();
