/**
 * "Acak!" on the home screen: a big wheel of games that fit the players here (without Hoorah Pass
 * only the ones this room can play), spun on the main screen with a tick per slice, then the pick
 * with "Main sekarang" and "Putar lagi". Every spin draws a fresh pick and a fresh set of slices
 * around it.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { GAMES, type GameId, gamesForTab, playsRemote } from '../../shared/games';
import { KeyArt } from '../../shared/keyart';
import { Icon } from '../../shared/ui';
import { FocusButton } from '../components';
import { setFocusMap } from '../nav';
import { Wheel, WheelPointer } from '../specialArt';
import { isMirror, playableNow, premium, remoteOn, sfx, startGame, wheelView } from '../store';
import { HOME } from '../strings';

/** Slices on the wheel at most: enough to look full, few enough to read the names. */
const MAX_SLICES = 10;
const SPIN_MS = 4200;
const TURNS = 5;
const WHEEL = 470;

export interface Draw {
  slices: GameId[];
  pick: number;
}

/** A spin: the pick and up to `MAX_SLICES` slices around it, shuffled. */
export function drawWheel(pool: readonly GameId[], rand: () => number = Math.random): Draw {
  const list = [...pool];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  const slices = list.slice(0, MAX_SLICES);
  return { slices, pick: Math.floor(rand() * slices.length) };
}

/** Clockwise wheel turn (degrees) that brings the middle of slice `pick` under the top pointer. */
export function landingAngle(pick: number, slices: number, from: number, jitter: number): number {
  const step = 360 / slices;
  const center = (pick + 0.5) * step + jitter * step * 0.6;
  const base = Math.ceil(from / 360) * 360 + TURNS * 360;
  return base + ((360 - center) % 360);
}

const easeOut = (t: number) => 1 - (1 - t) ** 4;

/**
 * Games on the wheel: every game that fits with premium; otherwise only the ones this room can
 * start (the free games and this week's), or all fitting ones if none of those fits.
 */
function wheelPool(players: number): GameId[] {
  // A far-away main screen watches: only games it can show.
  const fit = gamesForTab('fit', players).filter((id) => !remoteOn.value || playsRemote(id));
  if (premium.value) return fit;
  const open = playableNow(fit);
  return open.length > 0 ? open : fit;
}

/** Spins so far on this screen: each spin the far-away screens see has its own number. */
let spinSeq = 0;

export function WheelOverlay({ players, onClose }: { players: number; onClose: () => void }) {
  const pool = wheelPool(players);
  // A far-away main screen spins the Host's wheel: same slices, pick and landing spot.
  const far = isMirror ? wheelView.value : null;
  const [ownDraw, setDraw] = useState<Draw>(() => drawWheel(pool));
  const draw: Draw = far ?? ownDraw;
  const [done, setDone] = useState(false);
  const wheel = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const raf = useRef(0);

  const spin = (d: Draw, jitter: number) => {
    cancelAnimationFrame(raf.current);
    setDone(false);
    const n = d.slices.length;
    const from = angle.current;
    const to = landingAngle(d.pick, n, from, jitter);
    const start = performance.now();
    let lastSlice = Math.floor(from / (360 / n));
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / SPIN_MS);
      const a = from + (to - from) * easeOut(t);
      angle.current = a;
      if (wheel.current) wheel.current.style.transform = `rotate(${a}deg)`;
      const slice = Math.floor(a / (360 / n));
      if (slice !== lastSlice) {
        lastSlice = slice;
        sfx('tick');
      }
      if (t < 1) raf.current = requestAnimationFrame(frame);
      else {
        setDone(true);
        sfx('reveal');
      }
    };
    raf.current = requestAnimationFrame(frame);
  };

  /** Host: spins here and tells the far-away screens (the store sends `wheelView`). */
  const start = (d: Draw) => {
    const jitter = Math.random() - 0.5;
    wheelView.value = { slices: d.slices, pick: d.pick, spin: ++spinSeq, jitter };
    spin(d, jitter);
  };

  useEffect(() => {
    if (isMirror) return;
    start(ownDraw);
    return () => {
      cancelAnimationFrame(raf.current);
      wheelView.value = null;
    };
  }, []);

  const farSpin = far?.spin;
  useEffect(() => {
    if (!far) return;
    spin(far, far.jitter);
    return () => cancelAnimationFrame(raf.current);
  }, [farSpin]);

  const pick = draw.slices[draw.pick];
  const again = () => {
    const next = drawWheel(pool);
    setDraw(next);
    start(next);
  };
  const close = () => {
    sfx('back');
    onClose();
  };

  const doneRef = useRef(done);
  doneRef.current = done;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const againRef = useRef(again);
  againRef.current = again;
  useEffect(
    () =>
      setFocusMap(
        {
          rows: [done ? ['wheel-play', 'wheel-again'] : ['wheel-wait']],
          onOk: (id) => {
            if (!doneRef.current) return;
            if (id === 'wheel-again') return againRef.current();
            const g = pickRef.current;
            if (g) startGame(g);
          },
          onBack: close,
          onMove: () => sfx('tick'),
        },
        done ? 'wheel-play' : 'wheel-wait',
      ),
    [done],
  );

  return (
    <div class="overlay wheel-overlay">
      <div class="wheel-stage">
        <span class="wheel-pointer">
          <WheelPointer size={46} />
        </span>
        <div class="wheel-turn" ref={wheel} style={{ transform: `rotate(${angle.current}deg)` }}>
          <Wheel games={draw.slices} size={WHEEL} />
        </div>
      </div>

      <div class="wheel-side">
        <span class="wheel-eyebrow">{done ? HOME.wheelPicked : HOME.wheelEyebrow}</span>
        {done && pick ? (
          <>
            <div class="wheel-pick" key={`${pick}-${draw.pick}`}>
              <KeyArt id={pick} width={380} radius={16} />
            </div>
            <h1 class="display wheel-title">{GAMES[pick].title}</h1>
            <p class="wheel-line">{GAMES[pick].tagline}</p>
            <div class="wheel-buttons">
              <FocusButton id="wheel-play" class="btn primary wheel-btn">
                <Icon name="play" size={16} color="#111214" />
                {HOME.wheelPlay}
              </FocusButton>
              <FocusButton id="wheel-again" class="btn wheel-btn">
                <Icon name="restart" size={16} />
                {HOME.wheelAgain}
              </FocusButton>
            </div>
          </>
        ) : (
          <>
            <h1 class="display wheel-title">{HOME.randomTitle}</h1>
            <p class="wheel-line">{HOME.wheelSpinning}</p>
            {/* Holds the focus while spinning so a stray OK does nothing. */}
            <FocusButton id="wheel-wait" class="wheel-wait" aria-label={HOME.wheelSpinning}>
              {' '}
            </FocusButton>
          </>
        )}
        <span class="wheel-hint">{HOME.wheelHint}</span>
      </div>
    </div>
  );
}
