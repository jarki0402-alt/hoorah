/**
 * Getar tab: one button per way of asking for a haptic, each with a letter, so the owner can
 * report exactly which ones the phone actually felt (iPhone switch ticks depend on the gesture).
 */
import { useRef, useState } from 'preact/hooks';
import { CONTROL_RANGES, type ControlTuning, type FlashMode } from '../shared/controls';
import { hapticMethod, play, ticks } from '../shared/haptics';
import { IosDiag } from './ios-diag';
import { STR } from './strings';
import { capture, noMenu, Segmented, Slider } from './ui';

type TestId = keyof typeof STR.tests;

/** Travel (CSS px) between two ticks while sliding a finger. */
const MOVE_STEP_PX = 22;

interface TestProps {
  id: TestId;
  letter: string;
  lit: boolean;
  count: number;
  onClick?: () => void;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerUp?: () => void;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
}

/** A test button: its letter, label and how often it was used. */
function Test({ id, letter, lit, count, ...handlers }: TestProps) {
  return (
    <button type="button" class={`lab-test ${lit ? 'lit' : ''}`} onContextMenu={noMenu} {...handlers}>
      <span class="lab-test-letter" aria-hidden="true">
        {letter}
      </span>
      <span class="lab-test-label">{STR.tests[id]}</span>
      <span class="lab-test-count">{count ? STR.pressed(count) : ''}</span>
    </button>
  );
}

const FLASH_OPTIONS: readonly { id: FlashMode; text: string }[] = [
  { id: 'auto', text: STR.flash.auto },
  { id: 'always', text: STR.flash.always },
  { id: 'off', text: STR.flash.off },
];

export function HapticTab({
  tuning,
  update,
}: {
  tuning: ControlTuning;
  update: (fn: (t: ControlTuning) => void) => void;
}) {
  const [count, setCount] = useState<Partial<Record<TestId, number>>>({});
  const [lit, setLit] = useState<TestId | null>(null);
  const litTimer = useRef(0);
  const moveFrom = useRef<{ x: number; y: number } | null>(null);

  const hit = (id: TestId, fire: () => void) => {
    fire();
    setCount((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
    setLit(id);
    window.clearTimeout(litTimer.current);
    litTimer.current = window.setTimeout(() => setLit(null), 160);
  };

  return (
    <section class="lab-tab">
      <p class="lab-help">{STR.hapticHelp}</p>
      <p class="lab-method">{STR.method[hapticMethod()]}</p>
      <div class="lab-tests">
        <Test
          id="single"
          lit={lit === 'single'}
          count={count.single ?? 0}
          letter="A"
          onClick={() => hit('single', () => play(12))}
        />
        <Test
          id="burst3"
          lit={lit === 'burst3'}
          count={count.burst3 ?? 0}
          letter="B"
          onClick={() => hit('burst3', () => ticks(3))}
        />
        <Test
          id="burst6"
          lit={lit === 'burst6'}
          count={count.burst6 ?? 0}
          letter="C"
          onClick={() => hit('burst6', () => ticks(6))}
        />
        <Test
          id="burst10"
          lit={lit === 'burst10'}
          count={count.burst10 ?? 0}
          letter="D"
          onClick={() => hit('burst10', () => ticks(10))}
        />
        <Test
          id="pointerDown"
          lit={lit === 'pointerDown'}
          count={count.pointerDown ?? 0}
          letter="E"
          onPointerDown={(e: PointerEvent) => {
            capture(e);
            hit('pointerDown', () => play(10));
          }}
        />
        <Test
          id="touchStart"
          lit={lit === 'touchStart'}
          count={count.touchStart ?? 0}
          letter="F"
          onTouchStart={() => hit('touchStart', () => play(10))}
        />
        <Test
          id="pointerUp"
          lit={lit === 'pointerUp'}
          count={count.pointerUp ?? 0}
          letter="G"
          onPointerUp={() => hit('pointerUp', () => play(10))}
        />
        <Test
          id="touchEnd"
          lit={lit === 'touchEnd'}
          count={count.touchEnd ?? 0}
          letter="H"
          onTouchEnd={() => hit('touchEnd', () => play(10))}
        />
        <Test
          id="pattern"
          lit={lit === 'pattern'}
          count={count.pattern ?? 0}
          letter="I"
          onClick={() => hit('pattern', () => play([50, 30, 50]))}
        />
      </div>
      <div
        class={`lab-zone lab-move-zone ${lit === 'move' ? 'lit' : ''}`}
        role="application"
        aria-label={STR.tests.move}
        onContextMenu={noMenu}
        onPointerDown={(e) => {
          capture(e);
          moveFrom.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const from = moveFrom.current;
          if (!from) return;
          if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < MOVE_STEP_PX) return;
          moveFrom.current = { x: e.clientX, y: e.clientY };
          hit('move', () => play(6));
        }}
        onPointerUp={() => {
          moveFrom.current = null;
        }}
        onPointerCancel={() => {
          moveFrom.current = null;
        }}
      >
        <span class="lab-test-letter" aria-hidden="true">
          J
        </span>
        <span>
          {STR.tests.move}
          <br />
          <small>
            {STR.moveZone}
            {count.move ? ` · ${STR.pressed(count.move)}` : ''}
          </small>
        </span>
      </div>
      <div class="lab-sliders">
        <Slider
          label={STR.tickGap}
          value={tuning.haptic.tickGap}
          range={CONTROL_RANGES.haptic.tickGap}
          unit={STR.units.ms}
          onChange={(v) =>
            update((t) => {
              t.haptic.tickGap = v;
            })
          }
        />
        <Segmented
          label={STR.flashLabel}
          value={tuning.haptic.flash}
          options={FLASH_OPTIONS}
          onChange={(v) =>
            update((t) => {
              t.haptic.flash = v;
            })
          }
        />
        <Segmented
          label={STR.releaseFallback}
          value={tuning.haptic.releaseFallback ? 'on' : 'off'}
          options={[
            { id: 'on', text: STR.on },
            { id: 'off', text: STR.off },
          ]}
          onChange={(v) =>
            update((t) => {
              t.haptic.releaseFallback = v === 'on';
            })
          }
        />
      </div>
      <IosDiag />
    </section>
  );
}
