/**
 * Controller views for continuous input: the kart wheel and pedals (`drive`) and cooking gestures
 * (`gesture`). Everything goes out as binary frames: held buttons in `buttons`, discrete
 * events through the loss-proof `taps` counter. Feedback is local and instant.
 */
import {
  DRIVE_BRAKE,
  DRIVE_GAS,
  DRIVE_LEFT,
  DRIVE_RIGHT,
  type DriveItemIcon,
  GESTURE_HOLD,
} from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, type IconName } from '../shared/ui';
import { Me, Timer, usePress, type V } from './common';
import { haptic, setHeld, tap } from './store';

const ITEM_ICON: Record<DriveItemIcon, IconName> = {
  boost: 'zap',
  oil: 'oil',
  horn: 'horn',
  shield: 'shield',
  durian: 'durian',
  firecracker: 'firecracker',
  box: 'box',
};

/** Release everything the view holds when it goes away. */
function useReleaseOnUnmount(): void {
  useEffect(() => () => setHeld(0), []);
}

/* ------------------------------------------------------------------ drive */

/**
 * Keep receiving a finger's events after it slides off the control. Capture throws if the pointer
 * is already gone (lifted before the event was handled), which must not break the control.
 */
function capture(e: PointerEvent): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    // Pointer already released; nothing to capture.
  }
}

/** Which pointers hold which bit, so two thumbs or a thumb sliding across halves resolve right. */
type Holds = Map<number, number>;

function bitsOf(holds: Holds): number {
  let m = 0;
  for (const bit of holds.values()) m |= bit;
  return m;
}

export function DriveView({ v }: { v: V<'drive'> }) {
  useReleaseOnUnmount();
  const steerPad = useRef<HTMLDivElement>(null);
  const brakeEl = useRef<HTMLDivElement>(null);
  const steer = useRef<Holds>(new Map());
  const pedal = useRef<Holds>(new Map());
  // What the thumbs touch (for the visuals); what is sent is resolved in push().
  const [touch, setTouch] = useState(0);
  const [itemPressed, fireItem] = usePress();
  const locked = Boolean(v.locked);

  const push = () => {
    let s = bitsOf(steer.current);
    if (s === (DRIVE_LEFT | DRIVE_RIGHT)) s = 0; // both sides at once cancel out
    let p = bitsOf(pedal.current);
    if (p & DRIVE_BRAKE) p = DRIVE_BRAKE; // the brake wins over the gas
    const shown = bitsOf(steer.current) | bitsOf(pedal.current);
    setTouch((prev) => {
      const steerNow = shown & (DRIVE_LEFT | DRIVE_RIGHT);
      if (steerNow && steerNow !== (prev & (DRIVE_LEFT | DRIVE_RIGHT))) haptic(6);
      return shown;
    });
    setHeld(s | p);
  };

  const sideOf = (e: PointerEvent): number => {
    const r = steerPad.current?.getBoundingClientRect();
    if (!r) return DRIVE_LEFT;
    return e.clientX < r.left + r.width / 2 ? DRIVE_LEFT : DRIVE_RIGHT;
  };

  // A thumb counts as braking only while it is on REM; anywhere else on the pad is gas.
  const pedalOf = (e: PointerEvent): number => {
    const r = brakeEl.current?.getBoundingClientRect();
    if (!r) return DRIVE_GAS;
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    return inside ? DRIVE_BRAKE : DRIVE_GAS;
  };

  const handlers = (holds: { current: Holds }, which: (e: PointerEvent) => number) => {
    const up = (e: PointerEvent) => {
      if (holds.current.delete(e.pointerId)) push();
    };
    return {
      onPointerDown: (e: PointerEvent) => {
        if (locked) return;
        capture(e);
        holds.current.set(e.pointerId, which(e));
        if (holds === pedal && which(e) === DRIVE_GAS) haptic(10);
        push();
      },
      onPointerMove: (e: PointerEvent) => {
        if (!holds.current.has(e.pointerId)) return;
        const bit = which(e);
        if (holds.current.get(e.pointerId) === bit) return;
        holds.current.set(e.pointerId, bit);
        push();
      },
      onPointerUp: up,
      onPointerCancel: up,
      onLostPointerCapture: up,
    };
  };

  useEffect(() => {
    if (!locked) return;
    steer.current.clear();
    pedal.current.clear();
    setTouch(0);
    setHeld(0);
  }, [locked]);

  const item = v.item ?? null;

  return (
    <div class={`ctrl drive ${locked ? 'is-locked' : ''}`} style={{ '--kart': v.color }}>
      <div class="drive-status">
        <Me size={34} />
        <div class="drive-place">{v.place}</div>
        <div class="drive-lap">{v.lap}</div>
      </div>

      <div
        ref={steerPad}
        class="steer-pad"
        role="application"
        aria-label="Setir"
        {...handlers(steer, sideOf)}
      >
        <SteeringWheel touch={touch} />
        <div class={`steer-half ${touch & DRIVE_LEFT ? 'on' : ''}`}>
          <Icon name="left" size={64} stroke={3.2} />
        </div>
        <div class={`steer-half ${touch & DRIVE_RIGHT ? 'on' : ''}`}>
          <Icon name="right" size={64} stroke={3.2} />
        </div>
      </div>

      <button
        type="button"
        class={`drive-item ${item ? 'has-item' : ''} ${itemPressed ? 'pressed' : ''}`}
        disabled={locked || !item}
        aria-label={item ? `Pakai ${item.name}` : 'Belum ada item'}
        onPointerDown={() => {
          if (locked || !item) return;
          fireItem();
          haptic(35);
          tap(); // the frame carries the held REM bit: games throw backwards while braking
        }}
      >
        <Icon name={item ? ITEM_ICON[item.icon] : 'box'} size={34} stroke={2.4} />
        <span>{item ? item.name : 'Ambil kardus'}</span>
      </button>

      <div class="pedal-pad" role="application" aria-label="Pedal gas dan rem" {...handlers(pedal, pedalOf)}>
        <div ref={brakeEl} class={`pedal is-brake ${touch & DRIVE_BRAKE ? 'on' : ''}`}>
          <span class="pedal-label">REM</span>
        </div>
        <div class={`pedal is-gas ${touch & DRIVE_GAS ? 'on' : ''}`}>
          <span class="pedal-label">GAS</span>
        </div>
      </div>

      <div class="drive-hint">{v.hint ?? 'Tahan GAS untuk jalan · kiri/kanan untuk belok'}</div>
    </div>
  );
}

/**
 * The wheel drawn behind the two steering halves. Purely visual: it turns with the thumbs in
 * the same render that lights the halves, and its grips sit where the halves' arrows are.
 */
function SteeringWheel({ touch }: { touch: number }) {
  const s = touch & (DRIVE_LEFT | DRIVE_RIGHT);
  const turn = s === DRIVE_LEFT ? -16 : s === DRIVE_RIGHT ? 16 : 0;
  return (
    <svg class="steer-wheel" viewBox="0 0 100 100" aria-hidden="true">
      <g transform={`rotate(${turn} 50 50)`}>
        <circle cx="50" cy="50" r="43" fill="none" stroke="#17181b" stroke-width="9" />
        <circle cx="50" cy="50" r="43" fill="none" stroke="#2f3237" stroke-width="2" />
        <path d="M8 50 H92 M50 50 V93" stroke="#17181b" stroke-width="8" />
        <path
          class={`grip ${touch & DRIVE_LEFT ? 'on' : ''}`}
          d="M12.8 71.5 A43 43 0 0 1 12.8 28.5"
          fill="none"
          stroke-width="11"
          stroke-linecap="round"
        />
        <path
          class={`grip ${touch & DRIVE_RIGHT ? 'on' : ''}`}
          d="M87.2 28.5 A43 43 0 0 1 87.2 71.5"
          fill="none"
          stroke-width="11"
          stroke-linecap="round"
        />
        <circle cx="50" cy="50" r="13" fill="#17181b" stroke="#3a3d44" stroke-width="2" />
        <circle cx="50" cy="50" r="5.5" fill="currentColor" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ gesture */

export function GestureView({ v }: { v: V<'gesture'> }) {
  useReleaseOnUnmount();
  return (
    <div
      class={`ctrl gesture mode-${v.mode} icon-${v.icon ?? 'none'} ${v.locked ? 'is-locked' : ''}`}
      style={{ '--g': v.color }}
    >
      <div class="panes">
        <div class="pane">
          <div class="row">
            <Me size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div class="gesture-eyebrow">{v.eyebrow}</div>
              <div class="gesture-title">{v.title}</div>
            </div>
            <Timer deadline={v.deadline} />
          </div>
          {v.progress !== undefined && (
            <div class="gesture-progress" aria-hidden="true">
              <div style={{ width: `${Math.round(Math.max(0, Math.min(1, v.progress)) * 100)}%` }} />
            </div>
          )}
          <div class="gesture-hint">{v.hint}</div>
        </div>
        <div class="pane zone gesture-stage">
          {v.mode === 'tap' && <TapPad v={v} />}
          {v.mode === 'stir' && <StirRing v={v} />}
          {v.mode === 'swipe' && <SwipeZone v={v} />}
          {v.mode === 'hold' && <HoldButton v={v} />}
        </div>
      </div>
    </div>
  );
}

function TapPad({ v }: { v: V<'gesture'> }) {
  const [hits, setHits] = useState<{ id: number; x: number; y: number }[]>([]);
  const [pressed, fire] = usePress();
  const id = useRef(0);
  return (
    <button
      type="button"
      class={`gesture-pad ${pressed ? 'pressed' : ''}`}
      disabled={v.locked}
      onPointerDown={(e) => {
        if (v.locked) return;
        tap();
        fire();
        haptic(10);
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const n = ++id.current;
        setHits((h) => [...h.slice(-5), { id: n, x: e.clientX - r.left, y: e.clientY - r.top }]);
        window.setTimeout(() => setHits((h) => h.filter((q) => q.id !== n)), 450);
      }}
    >
      <Icon name={v.icon ?? 'knife'} size={72} stroke={2.4} />
      {hits.map((h) => (
        <span key={h.id} class="gesture-hit" style={{ left: h.x, top: h.y }} />
      ))}
    </button>
  );
}

function StirRing({ v }: { v: V<'gesture'> }) {
  const ring = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const acc = useRef(0);
  const [angle, setAngle] = useState(-Math.PI / 2);
  const [active, setActive] = useState(false);

  const angleOf = (e: PointerEvent) => {
    const r = ring.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  const end = () => {
    last.current = null;
    setActive(false);
    setHeld(0);
  };

  return (
    <div
      ref={ring}
      class={`stir-ring ${active ? 'on' : ''}`}
      role="application"
      aria-label="Aduk memutar"
      onPointerDown={(e) => {
        if (v.locked) return;
        capture(e);
        last.current = angleOf(e);
        setAngle(last.current);
        setActive(true);
        setHeld(GESTURE_HOLD);
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const a = angleOf(e);
        let d = a - last.current;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        last.current = a;
        setAngle(a);
        acc.current += d;
        // A quarter turn either way counts once.
        while (Math.abs(acc.current) >= Math.PI / 2) {
          acc.current -= Math.sign(acc.current) * (Math.PI / 2);
          tap();
          haptic(8);
        }
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div class="stir-center">
        <Icon name={v.icon ?? 'spoon'} size={56} stroke={2.4} />
      </div>
      <div
        class="stir-dot"
        style={{ transform: `rotate(${angle}rad) translateX(var(--stir-r)) rotate(${-angle}rad)` }}
      />
    </div>
  );
}

const ARROW: Record<NonNullable<V<'gesture'>['dir']>, IconName> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
};

function SwipeZone({ v }: { v: V<'gesture'> }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [flash, setFlash] = useState<'ok' | 'miss' | null>(null);
  const timer = useRef(0);
  const dir = v.dir ?? 'up';

  const show = (f: 'ok' | 'miss') => {
    setFlash(f);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 260);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const finish = (e: PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 50) return;
    const got = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (got === dir) {
      tap();
      haptic(25);
      show('ok');
    } else {
      haptic([10, 40, 10]);
      show('miss');
    }
  };

  return (
    <div
      class={`swipe-zone dir-${dir} ${flash ? `is-${flash}` : ''}`}
      role="application"
      aria-label="Usap"
      onPointerDown={(e) => {
        if (v.locked) return;
        capture(e);
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <div class="swipe-arrow">
        <Icon name={ARROW[dir]} size={70} stroke={3.2} />
      </div>
      <div class="swipe-arrow ghost">
        <Icon name={ARROW[dir]} size={70} stroke={3.2} />
      </div>
      <Icon name={v.icon ?? 'hand'} size={40} stroke={2.2} />
    </div>
  );
}

function HoldButton({ v }: { v: V<'gesture'> }) {
  const [down, setDown] = useState(false);
  const release = () => {
    if (!down) return;
    setDown(false);
    setHeld(0);
    haptic(20);
  };
  return (
    <button
      type="button"
      class={`hold-btn ${down ? 'pressed' : ''}`}
      disabled={v.locked}
      onPointerDown={(e) => {
        if (v.locked) return;
        capture(e);
        setDown(true);
        setHeld(GESTURE_HOLD);
        haptic(30);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <Icon name={v.icon ?? 'fire'} size={56} stroke={2.4} />
      {down ? 'LEPAS SAAT PAS' : 'TAHAN'}
    </button>
  );
}
