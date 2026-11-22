/**
 * `sling` view: a slingshot on a portrait phone. Put a finger anywhere on the pad and pull back:
 * the launch goes the opposite way, the pull length sets the power (meter on the side). While the
 * finger is down the launch vector streams as STICK_OP frames so the main screen draws the aim
 * live; lifting it locks the aim with `action('aim')`. Pulling again re-aims until the deadline.
 * A radar of the arena (edge, cracked rim, the others) sits behind the pad, centred on the player,
 * so the aim line shows where the pull would slide them. A new `shot` remounts the view (viewKey).
 */
import { encodeAim, SLING_MIN_POWER, type SlingAim, type SlingMap } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../shared/ui';
import { Me, Timer, type V } from './common';
import './sling.css';
import { action, haptic, players, setStick } from './store';
import { STR } from './strings';

/** Pad geometry in viewBox units (the SVG is -100..100 on both axes). */
const PULL_MAX = 72;
const RADAR_R = 92;
const POWER_STEPS = 4;

interface Drag {
  pointer: number;
  x0: number;
  y0: number;
  /** Pull in viewBox units (finger minus start). */
  px: number;
  py: number;
}

/** The launch for a pull: opposite direction, length = power 0..1. */
function launchOf(px: number, py: number): SlingAim {
  const len = Math.hypot(px, py);
  if (len < 1e-6) return { x: 0, y: 0 };
  const power = Math.min(1, len / PULL_MAX);
  return { x: (-px / len) * power, y: (-py / len) * power };
}

const powerOf = (a: SlingAim) => Math.min(1, Math.hypot(a.x, a.y));

/** Compass-free angle for the readout: 0° = right, 90° = up (away from the player). */
function degreesOf(a: SlingAim): number {
  const d = Math.round((Math.atan2(-a.y, a.x) * 180) / Math.PI);
  return (d + 360) % 360;
}

function nameOf(id: number, guests: V<'sling'>['guests']): string | null {
  return players.value.find((p) => p.id === id)?.name ?? guests?.find((g) => g.id === id)?.name ?? null;
}

function colorOf(id: number, guests: V<'sling'>['guests']): string {
  return (
    players.value.find((p) => p.id === id)?.color ?? guests?.find((g) => g.id === id)?.color ?? '#C4C7CC'
  );
}

/** The contestant the aim points at (within 22°, inside 1.4× the slide), or null. */
function targetOf(map: SlingMap, aim: SlingAim): number | null {
  const power = powerOf(aim);
  if (power < SLING_MIN_POWER) return null;
  const dir = Math.atan2(aim.y, aim.x);
  const slide = power * power * map.reach;
  let best: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const o of map.others) {
    const dx = o.x - map.me.x;
    const dy = o.y - map.me.y;
    const dist = Math.hypot(dx, dy);
    if (dist > slide * 1.4 + 1) continue;
    let diff = Math.abs(Math.atan2(dy, dx) - dir);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff <= (22 * Math.PI) / 180 && dist < bestDist) {
      best = o.id;
      bestDist = dist;
    }
  }
  return best;
}

function Radar({ v, aim }: { v: V<'sling'>; aim: SlingAim | null }) {
  const map = v.map;
  if (!map || map.reach <= 0) return null;
  const s = RADAR_R / map.reach;
  const cx = -map.me.x * s;
  const cy = -map.me.y * s;
  const dot = Math.max(5, 0.55 * s);
  return (
    <g class="sling-radar">
      <circle class="sling-ice" cx={cx} cy={cy} r={map.edge * s} />
      {map.next !== undefined && map.next < map.edge && (
        <circle class="sling-crack" cx={cx} cy={cy} r={map.next * s} />
      )}
      {map.others.map((o) => (
        <circle
          key={o.id}
          class="sling-other"
          cx={(o.x - map.me.x) * s}
          cy={(o.y - map.me.y) * s}
          r={dot}
          style={{ fill: colorOf(o.id, v.guests) }}
        />
      ))}
      {aim && powerOf(aim) >= SLING_MIN_POWER && (
        <AimLine aim={aim} length={powerOf(aim) * powerOf(aim) * map.reach * s} />
      )}
    </g>
  );
}

function AimLine({ aim, length }: { aim: SlingAim; length: number }) {
  const p = powerOf(aim);
  const ux = aim.x / p;
  const uy = aim.y / p;
  const ex = ux * length;
  const ey = uy * length;
  return (
    <g class="sling-aim">
      <line x1={ux * 14} y1={uy * 14} x2={ex} y2={ey} />
      <circle cx={ex} cy={ey} r={6} />
    </g>
  );
}

export function SlingView({ v }: { v: V<'sling'> }) {
  const pad = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** The aim this phone locked in this shot (null = none yet, the game's echo is used). */
  const [mine, setMine] = useState<SlingAim | null>(null);
  const step = useRef(0);
  const locked = Boolean(v.locked);

  // Never leave a live aim streaming: not when input turns off, not when the view goes away.
  useEffect(() => {
    if (locked) {
      setDrag(null);
      setStick(0, 0);
    }
  }, [locked]);
  useEffect(() => () => setStick(0, 0), []);

  const toBox = (e: PointerEvent): { x: number; y: number } | null => {
    const el = pad.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const k = 200 / Math.min(r.width, r.height);
    return { x: (e.clientX - (r.left + r.width / 2)) * k, y: (e.clientY - (r.top + r.height / 2)) * k };
  };

  const down = (e: PointerEvent) => {
    if (locked || drag) return;
    const p = toBox(e);
    if (!p) return;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // Without capture a finger leaving the pad simply ends the pull.
    }
    step.current = 0;
    haptic(8);
    setDrag({ pointer: e.pointerId, x0: p.x, y0: p.y, px: 0, py: 0 });
  };

  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer || locked) return;
    const p = toBox(e);
    if (!p) return;
    let px = p.x - drag.x0;
    let py = p.y - drag.y0;
    const len = Math.hypot(px, py);
    if (len > PULL_MAX) {
      px = (px / len) * PULL_MAX;
      py = (py / len) * PULL_MAX;
    }
    const launch = launchOf(px, py);
    const band = Math.floor(powerOf(launch) * POWER_STEPS);
    if (band !== step.current) {
      step.current = band;
      haptic(band >= POWER_STEPS ? 14 : 6);
    }
    setStick(launch.x, launch.y);
    setDrag({ ...drag, px, py });
  };

  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const launch = launchOf(drag.px, drag.py);
    setDrag(null);
    setStick(0, 0);
    if (locked || powerOf(launch) < SLING_MIN_POWER) return;
    setMine(launch);
    haptic([18, 30, 18]);
    action('aim', encodeAim(launch));
  };

  const cancel = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    setDrag(null);
    setStick(0, 0);
  };

  const live = drag ? launchOf(drag.px, drag.py) : null;
  const held = mine ?? v.aim ?? null;
  const shown = live ?? held;
  const power = shown ? powerOf(shown) : 0;
  const isLocked = !live && held !== null && powerOf(held) >= SLING_MIN_POWER;
  const target = v.map && shown ? targetOf(v.map, shown) : null;
  const targetName = target !== null ? nameOf(target, v.guests) : null;

  let line1: string = STR.slingPull;
  let line2: string = STR.slingOpposite;
  if (locked) {
    line1 = v.status ?? STR.slingWait;
    line2 = '';
  } else if (live) {
    line1 = powerOf(live) >= SLING_MIN_POWER ? STR.slingRelease : STR.slingPull;
    line2 = targetName ? STR.slingAt(targetName) : STR.slingOpposite;
  } else if (isLocked) {
    line1 = STR.slingLocked;
    line2 = STR.slingReaim;
  }

  return (
    <div
      class={`ctrl sling-view ${locked ? 'is-off' : ''} ${isLocked ? 'is-locked' : ''}`}
      style={{ '--sling-color': v.color }}
    >
      <div class="panes">
        <div class="pane">
          <div class="sling-top">
            <Me size={40} />
            <div class="sling-head">
              <div class="sling-eyebrow">{v.eyebrow}</div>
              <div class="sling-title">{v.title}</div>
            </div>
            {!locked && <Timer deadline={v.deadline} />}
          </div>
        </div>
        <div class="pane zone sling-zone fit-box">
          <div class="sling-pad-wrap">
            <svg
              ref={pad}
              class="sling-pad"
              viewBox="-100 -100 200 200"
              role="img"
              aria-label={STR.slingLabel}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
              onLostPointerCapture={cancel}
              onContextMenu={(e) => e.preventDefault()}
            >
              <circle class="sling-bg" r={98} />
              <Radar v={v} aim={shown} />
              {!v.map && shown && power >= SLING_MIN_POWER && (
                <AimLine aim={shown} length={20 + power * power * 70} />
              )}
              {drag && (
                <g class="sling-band">
                  <line x1={-9} y1={0} x2={drag.px} y2={drag.py} />
                  <line x1={9} y1={0} x2={drag.px} y2={drag.py} />
                  <circle cx={drag.px} cy={drag.py} r={7} />
                </g>
              )}
            </svg>
            <div class="sling-me" aria-hidden="true">
              <Me size={44} />
              {isLocked && (
                <span class="sling-lock">
                  <Icon name="lock" size={14} stroke={3} />
                </span>
              )}
            </div>
            <div class="sling-meter" aria-hidden="true">
              <span class="sling-meter-label">{STR.slingStrong}</span>
              <span class="sling-meter-track">
                <span class="sling-meter-fill" style={{ height: `${Math.round(power * 100)}%` }} />
              </span>
              <span class="sling-meter-label">{STR.slingWeak}</span>
            </div>
          </div>
        </div>
        <div class="pane">
          <div class="sling-read">
            <span class="sling-stat">
              <span class="sling-stat-label">{STR.slingAngle}</span>
              <span class="sling-stat-value">
                {shown && power >= SLING_MIN_POWER ? `${degreesOf(shown)}°` : '–'}
              </span>
            </span>
            <span class="sling-stat">
              <span class="sling-stat-label">{STR.slingPower}</span>
              <span class="sling-stat-value">{shown ? `${Math.round(power * 100)}%` : '–'}</span>
            </span>
          </div>
          <div class="sling-line1">{line1}</div>
          {line2 && <div class="sling-line2 muted">{line2}</div>}
          {!locked && v.status && <div class="sling-status">{v.status}</div>}
          {v.hint && <div class="sling-hint muted">{v.hint}</div>}
        </div>
      </div>
    </div>
  );
}
