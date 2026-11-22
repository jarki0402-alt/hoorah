/**
 * Swipe tab: the controller's swipe rules (controls.ts) drive a small Lari Terus preview that runs
 * the real game rules (games/lari/logic.ts) on the phone, so swipe thresholds, lane time and jump
 * can be tuned without the network in the way.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { type Action, jumpShape, LariRun, type Runner, TUNING } from '../games/lari/logic';
import {
  CONTROL_RANGES,
  type ControlTuning,
  FingerSpeed,
  isSwipe,
  type SwipeDir,
  dirOf as swipeDirOf,
} from '../shared/controls';
import { STR } from './strings';
import { capture, noMenu, Slider } from './ui';

const ME = 1;
const STEP = 1 / 60;
/** Metres shown behind and ahead of the runner. */
const VIEW_BEHIND = 3;
const VIEW_AHEAD = 13;
const ACTION: Record<SwipeDir, Action> = { up: 'jump', down: 'slide', left: 'left', right: 'right' };

interface Stroke {
  x: number;
  y: number;
  t0: number;
  last: SwipeDir | null;
  speed: FingerSpeed;
}

type Last =
  | { kind: 'swipe'; dir: SwipeDir; px: number; speed: number; ms: number }
  | { kind: 'tap'; ms: number };

function newRun(t: ControlTuning): LariRun {
  const { laneTime, jumpV, gravity, fallMul, hang, lagCatch } = t.runner;
  const run = new LariRun({
    mode: 'sprint',
    runners: [{ id: ME, cpu: false }],
    seed: (Math.random() * 0xffffffff) >>> 0,
    tuning: { laneTime, jumpV, gravity, fallMul, hang, lagCatch, sprintSeconds: 3600 },
  });
  run.start();
  return run;
}

/** Top-down sketch of the roof: lanes, gaps, obstacles, coins and the runner. */
function draw(ctx: CanvasRenderingContext2D, run: LariRun, r: Runner, w: number, h: number): void {
  const T = run.tuning;
  const mPerPx = (VIEW_BEHIND + VIEW_AHEAD) / h;
  const sy = (d: number) => h - (d - (r.d - VIEW_BEHIND)) / mPerPx;
  const laneSpan = T.laneW * 3;
  // Sideways scale fills the width (a sketch: along the run it is squeezed to show more ahead).
  const pxPerM = Math.min(w / (laneSpan + 1), h / 5);
  const sx = (x: number) => w / 2 + x * pxPerM;
  ctx.fillStyle = '#2a2b30';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3c3e44';
  ctx.fillRect(sx(-laneSpan / 2), 0, laneSpan * pxPerM, h);
  // Lane lines scroll with the run.
  ctx.strokeStyle = 'rgba(255,247,240,0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 14]);
  ctx.lineDashOffset = -((r.d / mPerPx) % 24);
  for (const lx of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(sx(lx * T.laneW), 0);
    ctx.lineTo(sx(lx * T.laneW), h);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const lo = r.d - VIEW_BEHIND - 2;
  const hi = r.d + VIEW_AHEAD + 2;
  for (const o of run.track.obstacles) {
    if (o.d + o.len / 2 < lo || o.d - o.len / 2 > hi) continue;
    const halfW = o.span === 3 ? laneSpan / 2 : T.laneW * 0.42;
    const cx = o.span === 3 ? 0 : o.lane * T.laneW;
    const top = sy(o.d + o.len / 2);
    const bh = Math.max(4, sy(o.d - o.len / 2) - top);
    ctx.fillStyle =
      o.kind === 'gap' ? '#111214' : o.kind === 'low' ? '#ff5a1f' : o.kind === 'high' ? '#2f8cff' : '#18191c';
    ctx.fillRect(sx(cx - halfW), top, halfW * 2 * pxPerM, bh);
    if (o.kind === 'block') {
      ctx.strokeStyle = '#a8abb2';
      ctx.strokeRect(sx(cx - halfW), top, halfW * 2 * pxPerM, bh);
    }
  }
  ctx.fillStyle = '#ffc928';
  for (const c of run.track.coins) {
    if (c.taken || c.d < lo || c.d > hi) continue;
    ctx.beginPath();
    ctx.arc(sx(c.lane * T.laneW), sy(c.d), 4 + c.y * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Runner: shadow on the roof, body lifted by the jump and squashed by a slide.
  const x = sx(r.x);
  const y = sy(r.d);
  const lift = Math.max(0, r.y);
  const size = 13 * (1 + lift * 0.22);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y, 12 / (1 + lift * 0.4), 6 / (1 + lift * 0.4), 0, 0, Math.PI * 2);
  ctx.fill();
  const hurt = r.stumbleT > 0 && Math.floor(run.t * 12) % 2 === 0;
  ctx.fillStyle = hurt ? '#f2453d' : '#ff8a3d';
  ctx.strokeStyle = '#fff7f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (r.slideT > 0 && !r.air) ctx.ellipse(x, y - 4, size * 1.2, size * 0.55, 0, 0, Math.PI * 2);
  else ctx.arc(x, y - 6 - lift * 26, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export function SwipeTab({
  tuning,
  update,
}: {
  tuning: ControlTuning;
  update: (fn: (t: ControlTuning) => void) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<LariRun | null>(null);
  const strokes = useRef(new Map<number, Stroke>());
  const tuneRef = useRef(tuning);
  tuneRef.current = tuning;
  const [last, setLast] = useState<Last | null>(null);
  const [stats, setStats] = useState({ m: 0, trips: 0 });
  const [flash, setFlash] = useState<SwipeDir | 'tap' | null>(null);
  const flashTimer = useRef(0);
  const { laneTime, jumpV, gravity, fallMul, hang, lagCatch } = tuning.runner;

  // A new run whenever the moves change (the track is shaped by the jump).
  useEffect(() => {
    runRef.current = newRun(tuneRef.current);
  }, [laneTime, jumpV, gravity, fallMul, hang, lagCatch]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let statT = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const run = runRef.current;
      const c = canvas.current;
      if (!run || !c) return;
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= STEP) {
        acc -= STEP;
        run.step(STEP);
        run.events.length = 0;
      }
      const r = run.runner(ME);
      if (!r) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w === 0 || h === 0) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, run, r, w, h);
      if (now - statT > 250) {
        statT = now;
        setStats({ m: Math.max(0, Math.round(run.distOf(r))), trips: r.stumbles });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(flashTimer.current);
    };
  }, []);

  const act = (a: Action) => {
    const run = runRef.current;
    const r = run?.runner(ME);
    if (run && r) run.act(r, a, 0);
  };

  const show = (what: SwipeDir | 'tap') => {
    setFlash(what);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 180);
  };

  const end = (e: PointerEvent) => {
    const s = strokes.current.get(e.pointerId);
    if (!s) return;
    strokes.current.delete(e.pointerId);
    if (s.last) return;
    const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    const ms = Math.round(e.timeStamp - s.t0);
    const { tapPx, tapMs } = tuneRef.current.swipe;
    if (moved <= tapPx && ms <= tapMs) {
      act('jump');
      show('tap');
      setLast({ kind: 'tap', ms });
    }
  };

  const sw = tuning.swipe;
  const R = CONTROL_RANGES;
  const shape = jumpShape({ ...TUNING, jumpV, gravity, fallMul, hang });
  return (
    <section class="lab-tab">
      <p class="lab-help">{STR.swipeHelp}</p>
      <div class="lab-runner">
        <canvas ref={canvas} class="lab-runner-canvas" role="img" aria-label={STR.swipePreview} />
        <div class="lab-runner-stats">{STR.runStats(stats.m, stats.trips)}</div>
        <button
          type="button"
          class="lab-chip"
          onClick={() => {
            runRef.current = newRun(tuneRef.current);
          }}
        >
          {STR.restart}
        </button>
      </div>
      <div class="lab-readout" aria-live="off">
        {last === null
          ? STR.noSwipe
          : last.kind === 'tap'
            ? STR.lastTap(last.ms)
            : STR.lastSwipe(STR.dirName[last.dir], last.px, last.speed, last.ms)}
      </div>
      <div
        class={`lab-zone lab-swipe-zone ${flash ? `is-${flash}` : ''}`}
        role="application"
        aria-label={STR.swipeZone}
        onContextMenu={noMenu}
        onPointerDown={(e) => {
          capture(e);
          const speed = new FingerSpeed();
          speed.reset(e.clientX, e.clientY, e.timeStamp);
          strokes.current.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
            t0: e.timeStamp,
            last: null,
            speed,
          });
        }}
        onPointerMove={(e) => {
          const s = strokes.current.get(e.pointerId);
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          const travel = Math.hypot(dx, dy);
          const v = s.speed.push(e.clientX, e.clientY, e.timeStamp);
          if (!isSwipe(travel, v, tuneRef.current.swipe)) return;
          const dir = swipeDirOf(dx, dy);
          if (dir !== s.last) {
            act(ACTION[dir]);
            show(dir);
            setLast({
              kind: 'swipe',
              dir,
              px: Math.round(travel),
              speed: v,
              ms: Math.round(e.timeStamp - s.t0),
            });
          }
          s.x = e.clientX;
          s.y = e.clientY;
          s.last = dir;
        }}
        onPointerUp={end}
        onPointerCancel={(e) => strokes.current.delete(e.pointerId)}
      >
        <span class="lab-swipe-cross" aria-hidden="true">
          <i class="u" />
          <i class="d" />
          <i class="l" />
          <i class="r" />
        </span>
      </div>
      <div class="lab-sliders">
        <Slider
          label={STR.swipeDistance}
          value={sw.distance}
          range={R.swipe.distance}
          unit={STR.units.px}
          onChange={(v) =>
            update((t) => {
              t.swipe.distance = v;
            })
          }
        />
        <Slider
          label={STR.swipeFlickDistance}
          value={sw.flickDistance}
          range={R.swipe.flickDistance}
          unit={STR.units.px}
          onChange={(v) =>
            update((t) => {
              t.swipe.flickDistance = v;
            })
          }
        />
        <Slider
          label={STR.swipeFlickSpeed}
          value={sw.flickSpeed}
          range={R.swipe.flickSpeed}
          unit={STR.units.speed}
          onChange={(v) =>
            update((t) => {
              t.swipe.flickSpeed = v;
            })
          }
        />
        <Slider
          label={STR.swipeTapPx}
          value={sw.tapPx}
          range={R.swipe.tapPx}
          unit={STR.units.px}
          onChange={(v) =>
            update((t) => {
              t.swipe.tapPx = v;
            })
          }
        />
        <h3 class="lab-sub">{STR.runnerHeading}</h3>
        <Slider
          label={STR.laneTime}
          value={laneTime}
          range={R.runner.laneTime}
          unit={STR.units.s}
          onChange={(v) =>
            update((t) => {
              t.runner.laneTime = v;
            })
          }
        />
        <Slider
          label={STR.jumpV}
          value={jumpV}
          range={R.runner.jumpV}
          unit={STR.units.mps}
          onChange={(v) =>
            update((t) => {
              t.runner.jumpV = v;
            })
          }
        />
        <Slider
          label={STR.gravity}
          value={gravity}
          range={R.runner.gravity}
          unit={STR.units.mps2}
          onChange={(v) =>
            update((t) => {
              t.runner.gravity = v;
            })
          }
        />
        <Slider
          label={STR.fallMul}
          hint={STR.fallMulHint}
          value={fallMul}
          range={R.runner.fallMul}
          unit={STR.units.x}
          onChange={(v) =>
            update((t) => {
              t.runner.fallMul = v;
            })
          }
        />
        <Slider
          label={STR.hang}
          value={hang}
          range={R.runner.hang}
          unit={STR.units.s}
          onChange={(v) =>
            update((t) => {
              t.runner.hang = v;
            })
          }
        />
        <p class="lab-note">{STR.jumpShape(shape.airTime, shape.peak)}</p>
        <Slider
          label={STR.lagCatch}
          value={lagCatch}
          range={R.runner.lagCatch}
          unit={STR.units.x}
          onChange={(v) =>
            update((t) => {
              t.runner.lagCatch = v;
            })
          }
        />
      </div>
    </section>
  );
}
