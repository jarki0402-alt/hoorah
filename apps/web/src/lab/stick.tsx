/**
 * Joystick tab: the controller's Roblox-style layout (left half takes the thumb, the stick appears
 * under it; round buttons bottom right) with the same math from controls.ts moves a fruit around
 * an arena right on the phone, so the feel can be judged without any network lag. Stick and
 * buttons are separate pointers, so moving while pressing can be tried too.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  CONTROL_RANGES,
  type ControlTuning,
  type StickOutput,
  stickOutput,
  trackStick,
} from '../shared/controls';
import { Avatar } from '../shared/ui';
import { STR } from './strings';
import { capture, noMenu, Segmented, Slider } from './ui';

/** Fruit speed at full stick, in arena widths per second (a brisk "Roblox" walk). */
const SPEED_W = 0.7;
const FRUIT = 44;
/** The main button makes the fruit hop for this long (ms). */
const HOP_MS = 420;

type DemoButton = 'main' | 'second' | 'third';
const DEMO_BUTTONS: readonly DemoButton[] = ['main', 'second', 'third'];

interface StickUi {
  cx: number;
  cy: number;
  kx: number;
  ky: number;
}

export function StickTab({
  tuning,
  update,
}: {
  tuning: ControlTuning;
  update: (fn: (t: ControlTuning) => void) => void;
}) {
  const arena = useRef<HTMLDivElement>(null);
  const fruit = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const finger = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });
  const out = useRef<StickOutput>({ x: 0, y: 0, travel: 0 });
  const tuneRef = useRef(tuning);
  tuneRef.current = tuning;
  const [ui, setUi] = useState<StickUi | null>(null);
  const [reading, setReading] = useState<StickOutput | null>(null);
  const [down, setDown] = useState<DemoButton | null>(null);
  const hopAt = useRef(-1e9);

  // Move the fruit every frame from the latest stick output (no re-render per frame).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const pos = { x: 0.5, y: 0.5 };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const a = arena.current;
      const f = fruit.current;
      if (!a || !f) return;
      const w = a.clientWidth;
      const h = a.clientHeight;
      if (w === 0 || h === 0) return;
      const speed = SPEED_W * w;
      pos.x = Math.min(1, Math.max(0, pos.x + (out.current.x * speed * dt) / Math.max(1, w - FRUIT)));
      pos.y = Math.min(1, Math.max(0, pos.y + (out.current.y * speed * dt) / Math.max(1, h - FRUIT)));
      const hop = Math.max(0, Math.sin((Math.PI * (now - hopAt.current)) / HOP_MS));
      const lift = now - hopAt.current < HOP_MS ? hop * 18 : 0;
      f.style.transform = `translate3d(${(pos.x * (w - FRUIT)).toFixed(1)}px, ${(pos.y * (h - FRUIT) - lift).toFixed(1)}px, 0)`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const release = () => {
    finger.current = null;
    out.current = { x: 0, y: 0, travel: 0 };
    setUi(null);
    setReading(null);
  };

  const move = (e: PointerEvent) => {
    const r = zone.current?.getBoundingClientRect();
    if (!r) return;
    const tune = tuneRef.current.stick;
    const t = trackStick(center.current.x, center.current.y, e.clientX - r.left, e.clientY - r.top, tune);
    center.current = { x: t.cx, y: t.cy };
    out.current = stickOutput(t.dx, t.dy, tune);
    setUi({ cx: t.cx, cy: t.cy, kx: t.kx, ky: t.ky });
    setReading(out.current);
  };

  const press = (b: DemoButton, on: boolean) => {
    setDown((d) => (on ? b : d === b ? null : d));
    if (on && b === 'main') hopAt.current = performance.now();
  };

  const s = tuning.stick;
  const R = CONTROL_RANGES.stick;
  const ring = Math.round(s.radius * 2 + 32);
  return (
    <section class="lab-tab">
      <p class="lab-help">{STR.stickHelp}</p>
      <div ref={arena} class="lab-arena" role="img" aria-label={STR.stickArena}>
        <div ref={fruit} class="lab-arena-fruit">
          <Avatar fruit="jeruk" ring="var(--orange)" size={FRUIT} face="effort" />
        </div>
      </div>
      <div class="lab-readout" aria-live="off">
        {reading
          ? STR.stickOut(reading.x, reading.y, Math.round(Math.hypot(reading.x, reading.y) * 100))
          : STR.stickIdle}
        {down && ` · ${STR.demoPressed(STR.demoButtons[down])}`}
      </div>
      <div class="lab-zone lab-pad" style={{ '--ring': `${ring}px` }}>
        <div
          ref={zone}
          class="lab-stick-zone"
          role="application"
          aria-label={STR.stickZone}
          onContextMenu={noMenu}
          onPointerDown={(e) => {
            if (finger.current !== null) return;
            capture(e);
            finger.current = e.pointerId;
            const r = zone.current?.getBoundingClientRect();
            if (!r) return;
            // The base appears exactly under the thumb, as on the controller.
            center.current = { x: e.clientX - r.left, y: e.clientY - r.top };
            move(e);
          }}
          onPointerMove={(e) => {
            if (finger.current === e.pointerId) move(e);
          }}
          onPointerUp={(e) => {
            if (finger.current === e.pointerId) release();
          }}
          onPointerCancel={(e) => {
            if (finger.current === e.pointerId) release();
          }}
          onLostPointerCapture={(e) => {
            if (finger.current === e.pointerId) release();
          }}
        >
          <div
            class={`lab-stick ${ui ? 'on' : 'is-rest'}`}
            aria-hidden="true"
            style={ui ? { left: `${ui.cx}px`, top: `${ui.cy}px` } : undefined}
          >
            <span class="lab-stick-ring" />
            <span
              class="lab-stick-reach"
              style={{ width: `${s.radius * 2}px`, height: `${s.radius * 2}px` }}
            />
            <span
              class="lab-stick-dead"
              style={{ width: `${s.radius * 2 * s.dead}px`, height: `${s.radius * 2 * s.dead}px` }}
            />
            <span
              class="lab-stick-knob"
              style={{
                transform: `translate(calc(-50% + ${(ui?.kx ?? 0).toFixed(1)}px), calc(-50% + ${(ui?.ky ?? 0).toFixed(1)}px))`,
              }}
            />
          </div>
          {!ui && <span class="lab-stick-help">{STR.stickRestHelp}</span>}
        </div>
        <div class="lab-pad-buttons">
          {DEMO_BUTTONS.map((b, i) => (
            <button
              type="button"
              key={b}
              class={`lab-pad-btn slot-${i} ${down === b ? 'on' : ''}`}
              onContextMenu={noMenu}
              onPointerDown={(e) => {
                capture(e);
                press(b, true);
              }}
              onPointerUp={() => press(b, false)}
              onPointerCancel={() => press(b, false)}
              onLostPointerCapture={() => press(b, false)}
            >
              {STR.demoButtons[b]}
            </button>
          ))}
        </div>
      </div>
      <div class="lab-sliders">
        <Segmented
          label={STR.stickBase}
          value={s.follow ? 'follow' : 'fixed'}
          options={[
            { id: 'fixed', text: STR.stickBaseFixed },
            { id: 'follow', text: STR.stickBaseFollow },
          ]}
          onChange={(v) =>
            update((t) => {
              t.stick.follow = v === 'follow';
            })
          }
        />
        <p class="lab-note">{STR.stickBaseHint}</p>
        <Slider
          label={STR.stickRadius}
          value={s.radius}
          range={R.radius}
          unit={STR.units.px}
          onChange={(v) =>
            update((t) => {
              t.stick.radius = v;
            })
          }
        />
        <Slider
          label={STR.stickDead}
          value={s.dead}
          range={R.dead}
          unit={STR.units.pct}
          scale={100}
          onChange={(v) =>
            update((t) => {
              t.stick.dead = v;
            })
          }
        />
        <Slider
          label={STR.stickCurve}
          hint={STR.stickCurveHint}
          value={s.curve}
          range={R.curve}
          unit={STR.units.x}
          onChange={(v) =>
            update((t) => {
              t.stick.curve = v;
            })
          }
        />
      </div>
    </section>
  );
}
