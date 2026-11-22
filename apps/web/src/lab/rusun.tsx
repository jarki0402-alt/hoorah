/**
 * Rusun tab: the crane's swing timing (period of the first floor, speed-up per floor, fastest
 * period) with a small live pendulum using the game's own math (games/rusun/logic.ts). Rusun runs
 * on the main screen, so these values count on the device that shows the main screen.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { SWING_AMPLITUDE, swingPeriod, swingPosition } from '../games/rusun/logic';
import { CONTROL_RANGES, type ControlTuning, type RusunTuning } from '../shared/controls';
import { STR } from './strings';
import { Slider } from './ui';

/** Preview geometry (SVG units): pivot at the top, the floor hangs ROPE below it. */
const VIEW_W = 320;
const VIEW_H = 190;
const PIVOT_X = VIEW_W / 2;
const PIVOT_Y = 14;
const ROPE = 132;
/** The game's swing (±200 px on a 1280 px stage) scaled into the preview. */
const REACH = (SWING_AMPLITUDE / 1280) * VIEW_W * 2.2;
const FLOOR_W = 64;
const FLOOR_H = 26;
const PREVIEW_FLOORS = { min: 1, max: 40, step: 1 };

/** First floor index that swings at the fastest period. */
function fastestFrom(t: RusunTuning): number {
  for (let i = 1; i <= 400; i++) if (swingPeriod(i, t) <= t.minPeriodMs) return i;
  return 0;
}

export function RusunTab({
  tuning,
  update,
}: {
  tuning: ControlTuning;
  update: (fn: (t: ControlTuning) => void) => void;
}) {
  const [floor, setFloor] = useState(1);
  const cable = useRef<SVGLineElement>(null);
  const load = useRef<SVGGElement>(null);
  const period = swingPeriod(floor, tuning.rusun);
  const periodRef = useRef(period);
  periodRef.current = period;

  // Swing the preview every frame (phase kept across period changes so it never jumps).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let phase = 0.25;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      phase = (phase + (now - last) / periodRef.current) % 1;
      last = now;
      const x = PIVOT_X + REACH * swingPosition(phase);
      const angle = Math.asin(Math.max(-1, Math.min(1, (x - PIVOT_X) / ROPE)));
      const y = PIVOT_Y + ROPE * Math.cos(angle);
      cable.current?.setAttribute('x2', x.toFixed(1));
      cable.current?.setAttribute('y2', y.toFixed(1));
      load.current?.setAttribute(
        'transform',
        `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((-angle * 0.3 * 180) / Math.PI).toFixed(2)})`,
      );
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const r = tuning.rusun;
  const R = CONTROL_RANGES.rusun;
  const from = fastestFrom(r);
  return (
    <section class="lab-tab">
      <p class="lab-help">{STR.rusunHelp}</p>
      <svg class="lab-rusun" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={STR.rusunPreview}>
        <rect class="lab-rusun-jib" x={PIVOT_X - 90} y={4} width={180} height={8} rx={3} />
        <rect
          class="lab-rusun-tower"
          x={PIVOT_X - FLOOR_W / 2}
          y={VIEW_H - 18}
          width={FLOOR_W}
          height={18}
          rx={3}
        />
        <line
          ref={cable}
          class="lab-rusun-cable"
          x1={PIVOT_X}
          y1={PIVOT_Y}
          x2={PIVOT_X}
          y2={PIVOT_Y + ROPE}
        />
        <g ref={load}>
          <rect class="lab-rusun-floor" x={-FLOOR_W / 2} y={0} width={FLOOR_W} height={FLOOR_H} rx={4} />
        </g>
      </svg>
      <p class="lab-readout">{STR.rusunNow(floor, period / 1000)}</p>
      <div class="lab-sliders">
        <Slider
          label={STR.rusunFloor}
          value={floor}
          range={PREVIEW_FLOORS}
          unit=""
          onChange={(v) => setFloor(Math.round(v))}
        />
        <h3 class="lab-sub">{STR.rusunHeading}</h3>
        <Slider
          label={STR.rusunPeriod}
          hint={STR.rusunPeriodHint(r.periodMs / 2000)}
          value={r.periodMs}
          range={R.periodMs}
          unit={STR.units.ms}
          onChange={(v) =>
            update((t) => {
              t.rusun.periodMs = v;
            })
          }
        />
        <Slider
          label={STR.rusunSpeedup}
          value={r.speedup}
          range={R.speedup}
          unit={STR.units.pct}
          scale={100}
          onChange={(v) =>
            update((t) => {
              t.rusun.speedup = v;
            })
          }
        />
        <Slider
          label={STR.rusunMin}
          value={r.minPeriodMs}
          range={R.minPeriodMs}
          unit={STR.units.ms}
          onChange={(v) =>
            update((t) => {
              t.rusun.minPeriodMs = v;
            })
          }
        />
        <p class="lab-note">
          {STR.rusunSummary(
            swingPeriod(1, r) / 1000,
            swingPeriod(10, r) / 1000,
            swingPeriod(20, r) / 1000,
            from,
          )}
        </p>
      </div>
    </section>
  );
}
