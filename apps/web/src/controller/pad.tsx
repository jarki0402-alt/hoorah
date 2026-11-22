/**
 * `pad` view: directional controls for arena and runner games (see PAD_* in @hoorah/protocol).
 *
 * - steer: two halves held to turn (a thumb may slide across them) plus a held action button.
 * - dpad:  four big arrows; one press = one frame with the arrow's bit (`tapWith`).
 * - swipe: a large zone; a swipe fires as soon as the finger has travelled far enough (no waiting
 *          for the lift), a short tap fires the action (or PAD_UP with `tapAction: 'up'`). Small
 *          arrows below as a fallback, unless `keys: false` (then the zone takes the whole pad).
 * - stick: Roblox-style floating joystick on the left half plus round buttons bottom right.
 * Feedback is local and instant; the main screen is authoritative.
 */
import {
  encodeArrowPress,
  PAD_ACTION,
  PAD_ARROW_ACTION,
  PAD_DOWN,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_UP,
  type PadButton,
  type PadButtonIcon,
} from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  CONTROL_TUNING,
  FingerSpeed,
  isSwipe,
  type SwipeDir,
  stickOutput,
  dirOf as swipeDirOf,
  trackStick,
} from '../shared/controls';
import { Icon, type IconName } from '../shared/ui';
import { Me, type V } from './common';
import './pad.css';
import { HeartMeter, RadarMap } from './radar';
import { action, haptic, setHeld, setStick, tapWith } from './store';
import { STR } from './strings';

type Dir = typeof PAD_UP | typeof PAD_DOWN | typeof PAD_LEFT | typeof PAD_RIGHT;

const DIR_BIT: Record<SwipeDir, Dir> = { up: PAD_UP, down: PAD_DOWN, left: PAD_LEFT, right: PAD_RIGHT };

const ARROWS: { bit: Dir; icon: IconName; label: string; cls: string }[] = [
  { bit: PAD_UP, icon: 'up', label: STR.up, cls: 'is-up' },
  { bit: PAD_LEFT, icon: 'left', label: STR.left, cls: 'is-left' },
  { bit: PAD_RIGHT, icon: 'right', label: STR.right, cls: 'is-right' },
  { bit: PAD_DOWN, icon: 'down', label: STR.down, cls: 'is-down' },
];

function capture(e: PointerEvent): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    // Pointer already released; nothing to capture.
  }
}

/** Brief local highlight of the last arrow sent (dpad and swipe). */
function useFlash(): [number, (bit: number) => void] {
  const [bit, setBit] = useState(0);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    bit,
    (b: number) => {
      setBit(b);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBit(0), 180);
    },
  ];
}

export function PadView({ v }: { v: V<'pad'> }) {
  const locked = Boolean(v.locked);
  // Never leave anything held behind: not when locked, not when the view goes away.
  useEffect(() => {
    if (locked) setHeld(0);
  }, [locked]);
  useEffect(() => () => setHeld(0), []);

  return (
    <div
      class={`ctrl pad-view is-${v.mode} ${v.mode === 'swipe' && v.keys === false ? 'no-keys' : ''} ${locked ? 'is-locked' : ''} ${v.alert ? `has-alert alert-${v.alert.tone}` : ''}`}
      style={{ '--pad-color': v.color }}
    >
      <div class="pad-status">
        <Me size={38} />
        <div class="pad-heading">
          {v.eyebrow && <div class="pad-eyebrow">{v.eyebrow}</div>}
          <div class="pad-title">{v.title}</div>
        </div>
        {v.carry && (
          <div class="pad-carry" style={{ '--carry': v.carry.color }}>
            <span class="pad-carry-dot" aria-hidden="true" />
            <span class="pad-carry-text">
              <span class="pad-carry-label">{STR.carrying}</span>
              <span class="pad-carry-name">{v.carry.label}</span>
            </span>
          </div>
        )}
        {v.stats && v.stats.length > 0 && (
          <div class="pad-stats">
            {v.stats.slice(0, 3).map((s) => (
              <div class="pad-stat" key={s.label}>
                <span class="pad-stat-value">{s.value}</span>
                <span class="pad-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {v.alert && (
          <div class={`pad-alert tone-${v.alert.tone}`} role="status">
            <span class="pad-alert-title">{v.alert.title}</span>
            {v.alert.body && <span class="pad-alert-body">{v.alert.body}</span>}
          </div>
        )}
      </div>

      <div class="pad-controls">
        {v.mode === 'steer' && <Steer v={v} locked={locked} />}
        {v.mode === 'dpad' && <Arrows locked={locked} reliable={Boolean(v.reliable)} />}
        {v.mode === 'swipe' && <Swipe v={v} locked={locked} />}
        {v.radar && <RadarMap raw={v.radar} />}
        {v.heart !== undefined && <HeartMeter raw={v.heart} />}
        {v.mode === 'stick' && <StickPad v={v} locked={locked} />}
        {v.banner && (
          <div class="pad-banner" role="status">
            {v.banner}
          </div>
        )}
      </div>

      {v.hint && <div class="pad-hint">{v.hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ steer */

function Steer({ v, locked }: { v: V<'pad'>; locked: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  const turns = useRef(new Map<number, number>());
  const [turn, setTurn] = useState(0);
  const [boost, setBoost] = useState(false);
  const boostRef = useRef(false);

  const push = () => {
    let t = 0;
    for (const b of turns.current.values()) t |= b;
    if (t === (PAD_LEFT | PAD_RIGHT)) t = 0; // both halves at once cancel out
    setTurn((prev) => {
      if (t && t !== prev) haptic(6);
      return t;
    });
    setHeld(t | (boostRef.current ? PAD_ACTION : 0));
  };

  useEffect(() => {
    if (!locked) return;
    turns.current.clear();
    boostRef.current = false;
    setTurn(0);
    setBoost(false);
  }, [locked]);

  const sideOf = (e: PointerEvent): number => {
    const r = area.current?.getBoundingClientRect();
    if (!r) return PAD_LEFT;
    return e.clientX < r.left + r.width / 2 ? PAD_LEFT : PAD_RIGHT;
  };
  const release = (e: PointerEvent) => {
    if (turns.current.delete(e.pointerId)) push();
  };
  const setBoosting = (on: boolean) => {
    if (boostRef.current === on) return;
    boostRef.current = on;
    setBoost(on);
    if (on) haptic(12);
    push();
  };

  return (
    <div class="pad-steer">
      <div
        ref={area}
        class="pad-steer-area"
        role="application"
        aria-label={STR.steerHint}
        onPointerDown={(e) => {
          if (locked) return;
          capture(e);
          turns.current.set(e.pointerId, sideOf(e));
          push();
        }}
        onPointerMove={(e) => {
          const was = turns.current.get(e.pointerId);
          if (was === undefined) return;
          const now = sideOf(e);
          if (now === was) return;
          turns.current.set(e.pointerId, now);
          push();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <button
          type="button"
          tabIndex={-1}
          class={`pad-half ${turn & PAD_LEFT ? 'on' : ''}`}
          aria-label={STR.steerLeft}
          disabled={locked}
        >
          <Icon name="left" size={64} stroke={3.2} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          class={`pad-half ${turn & PAD_RIGHT ? 'on' : ''}`}
          aria-label={STR.steerRight}
          disabled={locked}
        >
          <Icon name="right" size={64} stroke={3.2} />
        </button>
      </div>
      {v.actionLabel && (
        <button
          type="button"
          class={`pad-action ${boost ? 'pressed' : ''}`}
          aria-label={v.actionLabel}
          disabled={locked}
          onPointerDown={(e) => {
            if (locked) return;
            capture(e);
            setBoosting(true);
          }}
          onPointerUp={() => setBoosting(false)}
          onPointerCancel={() => setBoosting(false)}
          onLostPointerCapture={() => setBoosting(false)}
        >
          <Icon name="zap" size={34} />
          <span>{v.actionLabel}</span>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ dpad */

function Arrows({ locked, reliable }: { locked: boolean; reliable: boolean }) {
  const [flash, show] = useFlash();
  const press = (bit: Dir) => {
    if (locked) return;
    const counter = tapWith(bit);
    // The same press over the reliable channel (same counter, phone time): the game keeps the first.
    if (reliable) action(PAD_ARROW_ACTION, encodeArrowPress(bit, counter));
    haptic(10);
    show(bit);
  };
  return (
    <div class="pad-dpad-ring">
      <div class="pad-dpad">
        {ARROWS.map((a) => (
          <button
            type="button"
            key={a.bit}
            class={`pad-arrow ${a.cls} ${flash === a.bit ? 'pressed' : ''}`}
            aria-label={a.label}
            disabled={locked}
            onPointerDown={() => press(a.bit)}
          >
            <Icon name={a.icon} size={46} stroke={3.4} />
          </button>
        ))}
        <span class="pad-dpad-hub" aria-hidden="true" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ swipe */

function Swipe({ v, locked }: { v: V<'pad'>; locked: boolean }) {
  const [flash, show] = useFlash();
  const keys = v.keys !== false;
  // What a tap sends: PAD_UP (Lari Terus: tap anywhere = jump) or the action, if the game has one.
  const tapBit = v.tapAction === 'up' ? PAD_UP : v.actionLabel ? PAD_ACTION : 0;
  // Per finger: where the stroke is measured from, when the touch began, and the last direction
  // it sent. A stroke sends each direction once: a long swipe left is ONE lane, while "up, then
  // left" in one stroke still sends both. Thresholds come from CONTROL_TUNING.swipe (Lab).
  const strokes = useRef(
    new Map<number, { x: number; y: number; t: number; last: number; speed: FingerSpeed }>(),
  );

  const send = (bit: number) => {
    tapWith(bit);
    haptic(bit === PAD_ACTION ? 8 : 14);
    show(bit);
  };

  const end = (e: PointerEvent) => {
    const s = strokes.current.get(e.pointerId);
    if (!s) return;
    strokes.current.delete(e.pointerId);
    if (locked || s.last || !tapBit) return;
    const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    const { tapPx, tapMs } = CONTROL_TUNING.swipe;
    if (moved <= tapPx && performance.now() - s.t <= tapMs) send(tapBit);
  };

  const stroke = {
    onPointerDown: (e: PointerEvent) => {
      if (locked) return;
      capture(e);
      const speed = new FingerSpeed();
      speed.reset(e.clientX, e.clientY, e.timeStamp);
      strokes.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), last: 0, speed });
    },
    onPointerMove: (e: PointerEvent) => {
      const s = strokes.current.get(e.pointerId);
      if (!s || locked) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const v = s.speed.push(e.clientX, e.clientY, e.timeStamp);
      if (!isSwipe(Math.hypot(dx, dy), v, CONTROL_TUNING.swipe)) return;
      const dir = DIR_BIT[swipeDirOf(dx, dy)];
      // The same direction again in this stroke: follow the finger, send nothing.
      if (dir !== s.last) send(dir);
      s.x = e.clientX;
      s.y = e.clientY;
      s.last = dir;
    },
    onPointerUp: end,
    onPointerCancel: (e: PointerEvent) => {
      strokes.current.delete(e.pointerId);
    },
  };

  // Without arrow keys the whole pad view (status row and hint included) takes the strokes; the
  // menu pill lives outside it and stays tappable. Native listeners always call the latest handlers.
  const root = useRef<HTMLDivElement>(null);
  const strokeRef = useRef(stroke);
  strokeRef.current = stroke;
  useEffect(() => {
    if (keys) return;
    const view = root.current?.closest<HTMLElement>('.pad-view');
    if (!view) return;
    const down = (e: PointerEvent) => strokeRef.current.onPointerDown(e);
    const moved = (e: PointerEvent) => strokeRef.current.onPointerMove(e);
    const up = (e: PointerEvent) => strokeRef.current.onPointerUp(e);
    const cancel = (e: PointerEvent) => strokeRef.current.onPointerCancel(e);
    view.addEventListener('pointerdown', down);
    view.addEventListener('pointermove', moved);
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', cancel);
    return () => {
      view.removeEventListener('pointerdown', down);
      view.removeEventListener('pointermove', moved);
      view.removeEventListener('pointerup', up);
      view.removeEventListener('pointercancel', cancel);
    };
  }, [keys]);

  return (
    <div ref={root} class={`pad-swipe ${keys ? '' : 'no-keys'}`}>
      <div
        class={`pad-swipe-zone ${flash ? 'is-flash' : ''}`}
        role="application"
        aria-label={STR.swipeLabel}
        {...(keys ? stroke : {})}
      >
        <div class="pad-swipe-cross" aria-hidden="true">
          {ARROWS.map((a) => (
            <span key={a.bit} class={`pad-swipe-arrow ${a.cls} ${flash === a.bit ? 'on' : ''}`}>
              <Icon name={a.icon} size={40} stroke={3.4} />
            </span>
          ))}
          <span
            class={`pad-swipe-dot ${flash === PAD_ACTION || (flash === tapBit && tapBit !== 0) ? 'on' : ''}`}
          />
        </div>
        <div class="pad-swipe-hint">
          {keys
            ? v.actionLabel
              ? `${STR.swipeHint} · ${v.actionLabel}`
              : STR.swipeHint
            : v.actionLabel
              ? `${STR.swipeAnywhere} · ${STR.tapTo(v.actionLabel)}`
              : STR.swipeAnywhere}
        </div>
      </div>
      {keys && (
        <div class="pad-swipe-keys">
          {[ARROWS[1]!, ARROWS[0]!, ARROWS[3]!, ARROWS[2]!].map((a) => (
            <button
              type="button"
              key={a.bit}
              class={`pad-key ${flash === a.bit ? 'pressed' : ''}`}
              aria-label={a.label}
              disabled={locked}
              onPointerDown={() => {
                if (!locked) send(a.bit);
              }}
            >
              <Icon name={a.icon} size={26} stroke={3.2} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ stick */

/**
 * Roblox-style touch layout (owner feedback 2026-11-22: the stick box and the centred buttons felt
 * awkward). There is no panel: the left half of the screen under the status row takes the thumb,
 * a faint ring rests bottom left as a hint, and the stick appears right under the thumb wherever
 * it lands. The base stays put and the knob stops at `radius` (or, with `follow` on in Lab
 * Kontrol, the base is dragged behind the thumb). The right thumb gets one big round main button
 * in the bottom right corner and the others in an arc above and left of it. The stick and the
 * buttons are separate pointers, so moving and pressing work at the same time.
 * Radius, dead zone, response curve and base mode come from CONTROL_TUNING.stick (Lab Kontrol).
 */
/** Ring drawn around the stick: the knob's full travel plus a rim (CSS px). */
const ringSize = (radius: number) => Math.round(radius * 2 + 32);

interface StickUi {
  cx: number;
  cy: number;
  kx: number;
  ky: number;
}

function StickPad({ v, locked }: { v: V<'pad'>; locked: boolean }) {
  const zone = useRef<HTMLDivElement>(null);
  const finger = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });
  const [ui, setUi] = useState<StickUi | null>(null);
  const lastSector = useRef(-1);

  const release = () => {
    finger.current = null;
    lastSector.current = -1;
    setUi(null);
    setStick(0, 0);
  };
  useEffect(() => {
    if (locked) release();
  }, [locked]);
  useEffect(() => () => setStick(0, 0), []);

  const move = (e: PointerEvent) => {
    const r = zone.current?.getBoundingClientRect();
    if (!r) return;
    const tune = CONTROL_TUNING.stick;
    const t = trackStick(center.current.x, center.current.y, e.clientX - r.left, e.clientY - r.top, tune);
    center.current = { x: t.cx, y: t.cy };
    setUi({ cx: t.cx, cy: t.cy, kx: t.kx, ky: t.ky });
    const out = stickOutput(t.dx, t.dy, tune);
    if (out.x === 0 && out.y === 0) {
      setStick(0, 0);
      lastSector.current = -1;
      return;
    }
    setStick(out.x, out.y);
    // A light tick when the stick crosses into another eighth of the circle.
    const sector = Math.round(Math.atan2(t.dy, t.dx) / (Math.PI / 4) + 8) % 8;
    if (sector !== lastSector.current) {
      if (lastSector.current !== -1) haptic(4);
      lastSector.current = sector;
    }
  };

  // Up to three buttons; a game with only `actionLabel` gets it as the main (held) button.
  const buttons: PadButton[] =
    v.buttons && v.buttons.length > 0
      ? v.buttons.slice(0, 3)
      : v.actionLabel
        ? [{ id: 'action', label: v.actionLabel, icon: 'zap', tone: 'yellow', press: 'hold', big: true }]
        : [];
  const resting = ui === null;
  const ring = ringSize(CONTROL_TUNING.stick.radius);

  return (
    <div
      class={`pad-stick-wrap ${buttons.length ? 'has-buttons' : 'no-buttons'}`}
      style={{ '--ring': `${ring}px` }}
    >
      <div
        ref={zone}
        class={`pad-stick-zone ${resting ? 'is-resting' : 'is-active'}`}
        role="application"
        aria-label={STR.stickLabel}
        onPointerDown={(e) => {
          if (locked || finger.current !== null) return;
          capture(e);
          finger.current = e.pointerId;
          const r = zone.current?.getBoundingClientRect();
          if (!r) return;
          // The base appears exactly under the thumb (never shifted, or the first touch would
          // already read as a push).
          center.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          haptic(8);
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
          class={`pad-stick ${ui ? 'on' : 'is-rest'}`}
          aria-hidden="true"
          style={ui ? { left: `${ui.cx}px`, top: `${ui.cy}px` } : undefined}
        >
          {ARROWS.map((a) => (
            <span key={a.bit} class={`pad-stick-tick ${a.cls}`}>
              <Icon name={a.icon} size={16} stroke={3} />
            </span>
          ))}
          <span
            class="pad-stick-knob"
            style={{
              transform: `translate(calc(-50% + ${(ui?.kx ?? 0).toFixed(1)}px), calc(-50% + ${(ui?.ky ?? 0).toFixed(1)}px))`,
            }}
          />
        </div>
        {resting && <div class="pad-stick-help">{STR.stickAnywhere}</div>}
      </div>
      {buttons.length > 0 && <PadButtons buttons={buttons} locked={locked} />}
    </div>
  );
}

const BUTTON_ICON: Record<PadButtonIcon, IconName> = {
  hand: 'hand',
  knife: 'knife',
  throw: 'throw',
  zap: 'zap',
  jump: 'up',
  push: 'hand',
  swap: 'rotate',
  restart: 'restart',
  run: 'wind',
  light: 'target',
  dark: 'close',
  door: 'exit',
};

/** Longest rest a game may ask for on a tap button (ms). */
const MAX_COOLDOWN_MS = 10_000;

/**
 * Up to three right-thumb buttons: the main one (`big`, else the first) round and large in the
 * bottom right corner, the others smaller in an arc above and left of it. A `tap` button sends a
 * reliable game action on touch; a `hold` button holds PAD_ACTION.
 */
function PadButtons({ buttons, locked }: { buttons: PadButton[]; locked: boolean }) {
  const [down, setDown] = useState<Record<string, boolean>>({});
  const holding = useRef<string | null>(null);
  const timers = useRef(new Map<string, number>());
  /** Tap buttons resting after a press (`cooldownMs`): id -> start time of the rest. */
  const [rest, setRest] = useState<Record<string, number>>({});
  const restEnd = useRef(new Map<string, number>());
  useEffect(() => {
    if (!locked) return;
    holding.current = null;
    setHeld(0);
    setDown({});
  }, [locked]);
  useEffect(
    () => () => {
      for (const t of timers.current.values()) window.clearTimeout(t);
      setHeld(0);
    },
    [],
  );
  const press = (b: PadButton, on: boolean) => {
    setDown((d) => (d[b.id] === on ? d : { ...d, [b.id]: on }));
    if (b.press === 'hold') {
      if (on) {
        holding.current = b.id;
        haptic(12);
        setHeld(PAD_ACTION);
      } else if (holding.current === b.id) {
        holding.current = null;
        setHeld(0);
      }
      return;
    }
    if (!on) return;
    const cool = Math.min(MAX_COOLDOWN_MS, Math.max(0, b.cooldownMs ?? 0));
    if (cool > 0) {
      const now = performance.now();
      if (now < (restEnd.current.get(b.id) ?? 0)) {
        haptic(4);
        return;
      }
      restEnd.current.set(b.id, now + cool);
      setRest((r) => ({ ...r, [b.id]: now }));
      window.clearTimeout(timers.current.get(`rest:${b.id}`));
      timers.current.set(
        `rest:${b.id}`,
        window.setTimeout(() => {
          setRest(({ [b.id]: _done, ...left }) => left);
          haptic(6);
        }, cool),
      );
    }
    haptic(10);
    action(b.id);
    // Tap buttons stay lit a moment so a quick tap is still seen.
    window.clearTimeout(timers.current.get(b.id));
    timers.current.set(
      b.id,
      window.setTimeout(() => setDown((d) => ({ ...d, [b.id]: false })), 140),
    );
  };
  const big = buttons.find((b) => b.big) ?? buttons[0];
  const others = buttons.filter((b) => b !== big);
  const ordered = big ? [big, ...others] : others;
  return (
    <div class={`pad-buttons n-${ordered.length}`}>
      {ordered.map((b, i) => (
        <button
          key={b.id}
          type="button"
          class={`pad-btn tone-${b.tone} slot-${i} ${i === 0 ? 'is-big' : ''} ${down[b.id] ? 'pressed' : ''} ${rest[b.id] !== undefined ? 'is-resting' : ''}`}
          aria-label={b.sub ? `${b.label}, ${b.sub}` : b.label}
          disabled={locked}
          onPointerDown={(e) => {
            if (locked) return;
            if (b.press === 'hold') capture(e);
            press(b, true);
          }}
          onPointerUp={() => {
            if (b.press === 'hold') press(b, false);
          }}
          onPointerCancel={() => {
            if (b.press === 'hold') press(b, false);
          }}
          onLostPointerCapture={() => {
            if (b.press === 'hold') press(b, false);
          }}
        >
          <Icon name={BUTTON_ICON[b.icon]} size={i === 0 ? 30 : 20} stroke={2.4} />
          <span class="pad-btn-label">{b.label}</span>
          {b.sub && <span class="pad-btn-sub">{b.sub}</span>}
          {rest[b.id] !== undefined && (
            <svg key={rest[b.id]} class="pad-btn-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="47"
                pathLength="100"
                style={{ animationDuration: `${Math.min(MAX_COOLDOWN_MS, b.cooldownMs ?? 0)}ms` }}
              />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
