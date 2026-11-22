/**
 * Extras of the `pad` view for hidden-role games (Hantu Tak Terlihat):
 *  - RadarMap: the secret map ("peta rahasia"), a dark red floor plan with everyone's dot, the
 *    objectives and the phone's own position. Display only (touches go to the joystick under it).
 *    Dots glide between updates (CSS transitions), so 4 updates a second still look smooth.
 *  - HeartMeter: a heart and pulse line beating faster as the level rises; strong beats flash
 *    the screen edges red (visible on every phone, including iPhones without vibration) and buzz.
 * Both sanitize their input with the protocol helpers first.
 */
import { padHeart, padRadar } from '@hoorah/protocol';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import './radar.css';
import { haptic } from './store';
import { STR } from './strings';

const WALL: Record<string, string> = {
  '#': '#FF4D3D',
  T: '#A8261F',
};

export function RadarMap({ raw }: { raw: unknown }) {
  const r = padRadar(raw);
  const gridKey = r ? r.grid.join('|') : '';
  // The floor plan only changes when a door slams or the exit opens: redraw it only then.
  const plan = useMemo(() => {
    if (!r) return null;
    let walls = '';
    let trees = '';
    let props = '';
    let doors = '';
    let open = '';
    r.grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        const cell = `M${x} ${y}h1v1h-1Z`;
        if (c === '#') walls += cell;
        else if (c === 'T') trees += `M${x + 0.5} ${y + 0.12}a0.38 0.38 0 1 0 0.01 0Z`;
        else if (c === 'o' || c === 'F') props += `M${x + 0.15} ${y + 0.15}h0.7v0.7h-0.7Z`;
        else if (c === 'D' || c === 'X') doors += cell;
        else if (c === 'd' || c === 'x') open += `M${x + 0.3} ${y + 0.3}h0.4v0.4h-0.4Z`;
      }
    });
    return { walls, trees, props, doors, open };
  }, [gridKey]);
  if (!r || !plan) return null;
  const cols = Math.max(...r.grid.map((g) => g.length));
  const rows = r.grid.length;
  return (
    <div
      class={`radar ${r.lit ? 'is-lit' : ''}`}
      style={{ aspectRatio: `${cols} / ${rows}` }}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect width={cols} height={rows} fill="#2A0A0C" />
        <path d={plan.walls} fill={WALL['#']} opacity="0.85" />
        <path d={plan.trees} fill={WALL.T} />
        <path d={plan.props} fill="#5A1A18" />
        <path d={plan.doors} fill="#FFB04A" />
        <path d={plan.open} fill="#FFB04A" opacity="0.45" />
        {r.marks.map((m, i) => (
          <g
            key={`m${i}`}
            class={`radar-mark k-${m.k} ${m.on ? 'on' : ''}`}
            transform={`translate(${m.x} ${m.y})`}
          >
            {m.k === 'key' && (
              <path d="M-0.42 0a0.22 0.22 0 1 0 0.01 0ZM-0.2 -0.06h0.62v0.12h-0.1v0.16h-0.12v-0.16h-0.4Z" />
            )}
            {m.k === 'fuse' && (
              <>
                <circle r="0.55" class="radar-ring" />
                <circle
                  r="0.55"
                  class="radar-fill"
                  pathLength="100"
                  style={{ strokeDasharray: `${Math.round((m.p ?? 0) * 100)} 100` }}
                />
                <path d="M0.06 -0.36L-0.2 0.04h0.18l-0.06 0.32l0.28 -0.42h-0.18Z" />
              </>
            )}
            {m.k === 'exit' && <rect x="-0.5" y="-0.5" width="1" height="1" rx="0.15" />}
          </g>
        ))}
        {r.people.map((p, i) => (
          <circle
            key={`p${i}`}
            class={`radar-dot ${p.f ? 'is-fly' : ''}`}
            r={p.f ? 0.22 : 0.38}
            fill={p.c}
            style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
          />
        ))}
        <g class="radar-me" style={{ transform: `translate(${r.me.x}px, ${r.me.y}px)` }}>
          <circle r="1.1" class="radar-me-pulse" />
          <path d="M-0.42 0.45V-0.05a0.42 0.42 0 0 1 0.84 0V0.45l-0.21 -0.14l-0.21 0.14l-0.21 -0.14Z" />
          <circle cx="-0.15" cy="-0.05" r="0.08" fill="#2A0A0C" />
          <circle cx="0.15" cy="-0.05" r="0.08" fill="#2A0A0C" />
        </g>
      </svg>
      <span class="radar-you">{STR.radarYou}</span>
    </div>
  );
}

/** Beats per minute for a heart level 0..1. */
export function heartBpm(level: number): number {
  return 58 + padHeart(level) * 112;
}

export function HeartMeter({ raw }: { raw: unknown }) {
  const level = padHeart(raw);
  const [beat, setBeat] = useState(0);
  const levelRef = useRef(level);
  levelRef.current = level;
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const lv = levelRef.current;
      setBeat((b) => b + 1);
      // Strong beats buzz: once when near, a double thump when the ghost is right there.
      if (lv >= 0.8) haptic([22, 70, 22]);
      else if (lv >= 0.55) haptic(16);
      timer = window.setTimeout(tick, 60_000 / heartBpm(lv));
    };
    timer = window.setTimeout(tick, 60_000 / heartBpm(levelRef.current));
    return () => window.clearTimeout(timer);
  }, []);
  const strong = level >= 0.5;
  return (
    <>
      <div
        class={`heart-meter ${strong ? 'is-near' : ''}`}
        style={{ '--heart': level.toFixed(2) }}
        aria-hidden="true"
      >
        <svg key={beat} class="heart-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s-7.5-4.6-9.6-9.4C1 8.3 3 5 6.4 5c2 0 3.5 1.2 4.4 2.6h2.4C14.1 6.2 15.6 5 17.6 5 21 5 23 8.3 21.6 11.6 19.5 16.4 12 21 12 21Z" />
        </svg>
        <svg class="heart-line" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
          <path class="heart-trace" key={`l${beat}`} d="M0 15h40l6 -10l8 20l6 -14l4 4h56" />
        </svg>
        <div class="heart-scale">
          <span>{STR.heartFar}</span>
          <span class="heart-bar">
            <span style={{ width: `${Math.round(level * 100)}%` }} />
          </span>
          <span>{STR.heartNear}</span>
        </div>
      </div>
      {strong && <div key={`e${beat}`} class="heart-edge" style={{ '--heart': level.toFixed(2) }} />}
    </>
  );
}
