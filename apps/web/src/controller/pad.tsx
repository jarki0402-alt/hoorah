/**
 * `pad` view: directional controls for arena and runner games (see PAD_* in @hoorah/protocol).
 *
 * - steer: two halves held to turn (a thumb may slide across them) plus a held action button.
 * - dpad:  four big arrows; one press = one frame with the arrow's bit (`tapWith`).
 * - swipe: a large zone; a swipe fires as soon as the finger has travelled far enough (no waiting
 *          for the lift), a short tap fires the action. Small arrows below as a fallback.
 * Feedback is local and instant; the main screen is authoritative.
 */
import {
  PAD_ACTION,
  PAD_DOWN,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_UP,
  type PadButton,
  type PadButtonIcon,
} from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, type IconName } from '../shared/ui';
import { Me, type V } from './common';
import './pad.css';
import { action, haptic, setHeld, setStick, tapWith } from './store';
import { STR } from './strings';

/** Swipe distance (CSS px) that counts as a swipe, and the most a tap may move. */
const SWIPE_PX = 34;
const TAP_PX = 12;
const TAP_MS = 260;

type Dir = typeof PAD_UP | typeof PAD_DOWN | typeof PAD_LEFT | typeof PAD_RIGHT;

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
      class={`ctrl pad-view is-${v.mode} ${locked ? 'is-locked' : ''} ${v.alert ? `has-alert alert-${v.alert.tone}` : ''}`}
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
        {v.mode === 'dpad' && <Arrows locked={locked} />}
        {v.mode === 'swipe' && <Swipe v={v} locked={locked} />}
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

function Arrows({ locked }: { locked: boolean }) {
  const [flash, show] = useFlash();
  const press = (bit: Dir) => {
    if (locked) return;
    tapWith(bit);
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
  // Per finger: where the stroke is measured from, when the touch began, and the last direction
  // it sent. A stroke sends each direction once: a long swipe left is ONE lane, while "up, then
  // left" in one stroke still sends both.
  const strokes = useRef(new Map<number, { x: number; y: number; t: number; last: number }>());

  const send = (bit: number) => {
    tapWith(bit);
    haptic(bit === PAD_ACTION ? 8 : 14);
    show(bit);
  };

  const dirOf = (dx: number, dy: number): Dir =>
    Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? PAD_RIGHT : PAD_LEFT) : dy > 0 ? PAD_DOWN : PAD_UP;

  const end = (e: PointerEvent) => {
    const s = strokes.current.get(e.pointerId);
    if (!s) return;
    strokes.current.delete(e.pointerId);
    if (locked || s.last || !v.actionLabel) return;
    const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    if (moved <= TAP_PX && performance.now() - s.t <= TAP_MS) send(PAD_ACTION);
  };

  return (
    <div class="pad-swipe">
      <div
        class={`pad-swipe-zone ${flash ? 'is-flash' : ''}`}
        role="application"
        aria-label={STR.swipeLabel}
        onPointerDown={(e) => {
          if (locked) return;
          capture(e);
          strokes.current.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
            t: performance.now(),
            last: 0,
          });
        }}
        onPointerMove={(e) => {
          const s = strokes.current.get(e.pointerId);
          if (!s || locked) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.hypot(dx, dy) < SWIPE_PX) return;
          const dir = dirOf(dx, dy);
          // The same direction again in this stroke: follow the finger, send nothing.
          if (dir !== s.last) send(dir);
          strokes.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: s.t, last: dir });
        }}
        onPointerUp={end}
        onPointerCancel={(e) => strokes.current.delete(e.pointerId)}
      >
        <div class="pad-swipe-cross" aria-hidden="true">
          {ARROWS.map((a) => (
            <span key={a.bit} class={`pad-swipe-arrow ${a.cls} ${flash === a.bit ? 'on' : ''}`}>
              <Icon name={a.icon} size={40} stroke={3.4} />
            </span>
          ))}
          <span class={`pad-swipe-dot ${flash === PAD_ACTION ? 'on' : ''}`} />
        </div>
        <div class="pad-swipe-hint">
          {v.actionLabel ? `${STR.swipeHint} · ${v.actionLabel}` : STR.swipeHint}
        </div>
      </div>
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
    </div>
  );
}

/* ------------------------------------------------------------------ stick */

/**
 * Floating analog stick (owner feedback 2026-11-16: the old fixed ring was too big to steer
 * comfortably). The stick appears where the thumb lands anywhere in the left zone, full speed is
 * reached after only STICK_RADIUS px of thumb travel, and the centre follows the thumb when it
 * goes further, so reversing direction answers at once instead of travelling back across a ring.
 */
const STICK_RADIUS = 52;
/** Part of the radius that still counts as centred; the output is rescaled past it. */
const STICK_DEAD = 0.14;
/** Visual sizes (CSS px): the base ring and the knob. */
const STICK_BASE = 140;

interface StickUi {
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  on: boolean;
}

function StickPad({ v, locked }: { v: V<'pad'>; locked: boolean }) {
  const zone = useRef<HTMLDivElement>(null);
  const finger = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });
  const [ui, setUi] = useState<StickUi | null>(null);
  const [boost, setBoost] = useState(false);
  const boostRef = useRef(false);
  const lastSector = useRef(-1);

  const release = () => {
    finger.current = null;
    lastSector.current = -1;
    setUi(null);
    setStick(0, 0);
  };
  useEffect(() => {
    if (!locked) return;
    release();
    boostRef.current = false;
    setBoost(false);
    setHeld(0);
  }, [locked]);
  useEffect(() => () => setStick(0, 0), []);

  const move = (e: PointerEvent) => {
    const r = zone.current?.getBoundingClientRect();
    if (!r) return;
    const half = STICK_BASE / 2;
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let dx = px - center.current.x;
    let dy = py - center.current.y;
    let len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      // Drag the centre along behind the thumb (kept inside the zone).
      const k = (len - STICK_RADIUS) / len;
      center.current = {
        x: Math.min(Math.max(center.current.x + dx * k, half), Math.max(half, r.width - half)),
        y: Math.min(Math.max(center.current.y + dy * k, half), Math.max(half, r.height - half)),
      };
      dx = px - center.current.x;
      dy = py - center.current.y;
      len = Math.hypot(dx, dy);
    }
    const shown = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    setUi({ cx: center.current.x, cy: center.current.y, dx: dx * shown, dy: dy * shown, on: true });
    const n = Math.min(1, len / STICK_RADIUS);
    if (n < STICK_DEAD || len === 0) {
      setStick(0, 0);
      lastSector.current = -1;
      return;
    }
    const mag = (n - STICK_DEAD) / (1 - STICK_DEAD);
    setStick((dx / len) * mag, (dy / len) * mag);
    // A light tick when the stick crosses into another eighth of the circle.
    const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8;
    if (sector !== lastSector.current) {
      if (lastSector.current !== -1) haptic(4);
      lastSector.current = sector;
    }
  };

  const setBoosting = (on: boolean) => {
    if (boostRef.current === on) return;
    boostRef.current = on;
    setBoost(on);
    if (on) haptic(12);
    setHeld(on ? PAD_ACTION : 0);
  };

  const buttons = v.buttons?.slice(0, 3) ?? [];
  const resting = ui === null;

  return (
    <div class={`pad-stick-wrap ${v.actionLabel || buttons.length ? 'has-action' : ''}`}>
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
          const half = STICK_BASE / 2;
          center.current = {
            x: Math.min(Math.max(e.clientX - r.left, half), Math.max(half, r.width - half)),
            y: Math.min(Math.max(e.clientY - r.top, half), Math.max(half, r.height - half)),
          };
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
          class={`pad-stick ${ui?.on ? 'on' : ''}`}
          aria-hidden="true"
          style={ui ? { left: `${ui.cx}px`, top: `${ui.cy}px` } : { left: '50%', top: '50%' }}
        >
          {ARROWS.map((a) => (
            <span key={a.bit} class={`pad-stick-tick ${a.cls}`}>
              <Icon name={a.icon} size={18} stroke={3} />
            </span>
          ))}
          <span
            class="pad-stick-knob"
            style={{
              transform: `translate(calc(-50% + ${(ui?.dx ?? 0).toFixed(1)}px), calc(-50% + ${(ui?.dy ?? 0).toFixed(1)}px))`,
            }}
          />
        </div>
        {resting && <div class="pad-stick-help">{STR.stickAnywhere}</div>}
      </div>
      {buttons.length > 0 ? (
        <PadButtons buttons={buttons} locked={locked} />
      ) : (
        v.actionLabel && (
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
        )
      )}
    </div>
  );
}

const BUTTON_ICON: Record<PadButtonIcon, IconName> = {
  hand: 'hand',
  knife: 'knife',
  throw: 'throw',
  zap: 'zap',
};

/**
 * Up to three right-thumb buttons: the `big` one nearest the thumb, the others above and beside
 * it. A `tap` button sends a reliable game action on touch; a `hold` button holds PAD_ACTION.
 */
function PadButtons({ buttons, locked }: { buttons: PadButton[]; locked: boolean }) {
  const [down, setDown] = useState<Record<string, boolean>>({});
  const holding = useRef<string | null>(null);
  const timers = useRef(new Map<string, number>());
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
          class={`pad-btn tone-${b.tone} slot-${i} ${i === 0 ? 'is-big' : ''} ${down[b.id] ? 'pressed' : ''}`}
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
          <Icon name={BUTTON_ICON[b.icon]} size={i === 0 ? 34 : 28} stroke={2.4} />
          <span class="pad-btn-label">{b.label}</span>
          {b.sub && <span class="pad-btn-sub">{b.sub}</span>}
        </button>
      ))}
    </div>
  );
}
