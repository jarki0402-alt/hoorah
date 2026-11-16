/**
 * DOM HUD over the WebGL canvas (stage px): the pre-race menus (mode, circuit, garage), the race
 * overlays per viewport (place and lap, arena life lamps, Lawan Waktu best and last lap, item slot,
 * minimap, call-outs), the start lights, results and the after-race bar. Structure changes go
 * through signals a few times per second; per-frame values (minimap dots, name tags, timers) are
 * written straight to the DOM from `HudStore.frame()` so nothing re-renders at 60 fps.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { Avatar } from '../../shared/ui';
import { type Arena, getArena } from './arena';
import type { ItemKind, Mode, Phase, Race } from './logic';
import { MODES } from './logic';
import { CIRCUITS, type CircuitId } from './maps/types';
import type { RaceView } from './raceview';
import type { ViewKind } from './scene';
import type { ShowroomTag } from './showroom';
import { formatClock, formatTime, STR } from './strings';
import type { Track } from './track';
import { getTrack } from './tracks';
import { MAP_COLORS, MODE_COLORS } from './views';

export interface KartCard {
  idx: number;
  name: string;
  fruit: Fruit;
  color: string;
  human: boolean;
}

export interface VpInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ViewKind;
  kart: number;
  /** HUD scale for this viewport. */
  u: number;
}

export interface VpModel {
  kart: number;
  place: number;
  total: number;
  lap: number;
  laps: number;
  item: ItemKind | null;
  rolling: boolean;
  finishPlace: number | null;
  finishTime: number | null;
  wrongWay: boolean;
  offline: boolean;
  lives: number;
  out: boolean;
  best: number | null;
  last: number | null;
}

export interface Callout {
  key: number;
  text: string;
  sub?: string;
  tone: 'good' | 'bad' | 'info' | 'final';
}

export interface ResultLine {
  place: number;
  card: KartCard;
  time: string | null;
  best: string | null;
  lives: number;
  out: boolean;
  hits: number;
}

export interface StandingLine {
  idx: number;
  place: number;
  lap: number;
  finished: boolean;
  lives: number;
  out: boolean;
  best: number | null;
}

export interface MenuPlayer {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  ready: boolean;
  host: boolean;
}

export interface MenuModel {
  step: 'mode' | 'map' | 'kart' | 'race' | 'post';
  mode: Mode;
  circuit: CircuitId;
  laps: number;
  hostName: string;
  players: MenuPlayer[];
  cpus: number;
  autoS: number | null;
  postS: number | null;
}

export class HudStore {
  readonly layout = signal<VpInfo[]>([]);
  readonly cards = signal<KartCard[]>([]);
  readonly vps = signal<VpModel[]>([]);
  readonly callouts = signal<(Callout | null)[]>([]);
  readonly phase = signal<Phase>('intro');
  readonly mode = signal<Mode>('gp');
  /** 3, 2, 1, 0 = "GAS!", -1 = hidden. */
  readonly count = signal(-1);
  readonly intro = signal<{ title: string; sub: string; hint: string } | null>(null);
  readonly grace = signal<number | null>(null);
  readonly arenaClock = signal<number | null>(null);
  readonly alive = signal<number | null>(null);
  readonly results = signal<ResultLine[] | null>(null);
  readonly standings = signal<StandingLine[]>([]);
  readonly paused = signal(false);
  readonly broadcast = signal(false);
  readonly menu = signal<MenuModel | null>(null);
  race: Race | null = null;
  raceView: RaceView | null = null;
  /** Garage name plates (stage px), while the showroom is on screen. */
  tagSource: (() => ShowroomTag[]) | null = null;
  private readonly fns = new Set<(race: Race | null) => void>();

  onFrame(fn: (race: Race | null) => void): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }

  frame(): void {
    for (const fn of this.fns) fn(this.race);
  }
}

/* ------------------------------------------------------------------ item art */

export function ItemArt({ kind, size }: { kind: ItemKind | 'box'; size: number }) {
  const s = { width: size, height: size };
  switch (kind) {
    case 'boost':
      return (
        <svg viewBox="0 0 64 64" style={s} aria-hidden="true">
          <path
            d="M24 15c-3-4 3-6 0-10M32 15c-3-4 3-6 0-10M40 15c-3-4 3-6 0-10"
            stroke="#A8ABB2"
            stroke-width="2.6"
            fill="none"
            stroke-linecap="round"
          />
          <path d="M45 27h4a7 7 0 0 1 0 14h-6" fill="none" stroke="#111214" stroke-width="3.2" />
          <path
            d="M14 19h32l-3.5 36a4 4 0 0 1-4 3.5H21.5a4 4 0 0 1-4-3.5Z"
            fill="#FFF7F0"
            stroke="#111214"
            stroke-width="3.2"
            stroke-linejoin="round"
          />
          <path
            d="M17.4 28h25.2l-2.4 25.6a2.6 2.6 0 0 1-2.6 2.4H22.4a2.6 2.6 0 0 1-2.6-2.4Z"
            fill="#6B3A1E"
          />
          <path d="M17.4 28h25.2l-0.5 5.2H17.9Z" fill="#C98F55" />
          <path
            d="M53 2l-9 15h6l-3 11 12-17h-6.5Z"
            fill="#FFC928"
            stroke="#111214"
            stroke-width="2.4"
            stroke-linejoin="round"
          />
        </svg>
      );
    case 'oil':
      return (
        <svg viewBox="0 0 64 64" style={s} aria-hidden="true">
          <ellipse cx="32" cy="53" rx="25" ry="7.5" fill="#15171B" />
          <ellipse cx="24" cy="51.5" rx="7" ry="2" fill="#3D4650" />
          <path
            d="M32 5C26 17 17 26 17 37a15 15 0 0 0 30 0C47 26 38 17 32 5Z"
            fill="#2A2B30"
            stroke="#111214"
            stroke-width="3.2"
            stroke-linejoin="round"
          />
          <path
            d="M24.5 35a8 8 0 0 0 5.5 9"
            stroke="#9AA7B3"
            stroke-width="3.4"
            fill="none"
            stroke-linecap="round"
          />
        </svg>
      );
    case 'horn':
      return (
        <svg viewBox="0 0 64 64" style={s} aria-hidden="true">
          <path
            d="M44 22a12 12 0 0 1 0 20M50.5 15.5a21 21 0 0 1 0 33M57 9a30 30 0 0 1 0 46"
            stroke="#FF5A1F"
            stroke-width="3.6"
            fill="none"
            stroke-linecap="round"
          />
          <path
            d="M10 25h8l20-12v38L18 39h-8Z"
            fill="#FFC928"
            stroke="#111214"
            stroke-width="3.2"
            stroke-linejoin="round"
          />
          <rect
            x="4"
            y="26.5"
            width="7"
            height="11"
            rx="2"
            fill="#FF5A1F"
            stroke="#111214"
            stroke-width="2.6"
          />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 64 64" style={s} aria-hidden="true">
          <path d="M31 6l2-5 2 5Z" fill="#FFC928" stroke="#111214" stroke-width="2" />
          <path
            d="M9 42a23 23 0 0 1 46 0Z"
            fill="#B7BEC6"
            stroke="#111214"
            stroke-width="3.2"
            stroke-linejoin="round"
          />
          <path d="M32 19v23" stroke="#8D949C" stroke-width="3" />
          <path
            d="M17 33a16 16 0 0 1 10-11"
            stroke="#FFFFFF"
            stroke-width="3.2"
            fill="none"
            stroke-linecap="round"
          />
          <rect x="5" y="41" width="54" height="8" rx="2" fill="#6B7178" stroke="#111214" stroke-width="3" />
          {[12, 22, 32, 42, 52].map((x) => (
            <circle key={x} cx={x} cy="45" r="1.8" fill="#E8ECEF" />
          ))}
        </svg>
      );
    case 'durian':
      return (
        <svg viewBox="0 0 64 64" style={s} aria-hidden="true">
          <path
            d="M32 7l4 6 6-3 1 7 7-1-2 7 6 4-5 5 5 5-6 3 2 7-7-1-1 7-6-3-4 6-4-6-6 3-1-7-7 1 2-7-6-3 5-5-5-5 6-4-2-7 7 1 1-7 6 3Z"
            fill="#7FA82E"
            stroke="#111214"
            stroke-width="2.6"
            stroke-linejoin="round"
          />
          <circle cx="32" cy="34" r="15" fill="#B5D152" stroke="#111214" stroke-width="2.6" />
          <path d="M31 8V2h3v6" fill="#6B4423" stroke="#111214" stroke-width="2" />
          <path
            d="M24 30a8 8 0 0 1 6-5"
            stroke="#E8F2B8"
            stroke-width="3"
            fill="none"
            stroke-linecap="round"
          />
        </svg>
      );
    case 'firecracker':
      return (
        <svg viewBox="0 0 64 64" style={s} aria-hidden="true">
          <path
            d="M44 14c3-4 8-4 10-9"
            stroke="#2A2B30"
            stroke-width="2.6"
            fill="none"
            stroke-linecap="round"
          />
          <path
            d="M53 2l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1Z"
            fill="#FFC928"
            stroke="#111214"
            stroke-width="1.6"
          />
          <rect
            x="14"
            y="16"
            width="30"
            height="40"
            rx="5"
            transform="rotate(20 29 36)"
            fill="#F2453D"
            stroke="#111214"
            stroke-width="3"
          />
          <path d="M18 26l27 10M15 36l27 10" transform="rotate(0)" stroke="#FFC928" stroke-width="4" />
          <path d="M22 22l6 2" stroke="#FF8A80" stroke-width="3" stroke-linecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 64" style={s} aria-hidden="true">
          <path
            d="M8 22l24-10 24 10v26L32 58 8 48Z"
            fill="#C98F55"
            stroke="#111214"
            stroke-width="3.2"
            stroke-linejoin="round"
          />
          <path
            d="M8 22l24 10 24-10M32 32v26"
            fill="none"
            stroke="#111214"
            stroke-width="3"
            stroke-linejoin="round"
          />
          <path d="M20 17l24 10v8" fill="none" stroke="#E8C487" stroke-width="5" />
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ mode art */

function BajajShape({ x, y, flip, color }: { x: number; y: number; flip?: boolean; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path
        d="M-26 10V-6q2-9 12-9h22q13 2 16 15v10Z"
        fill={color}
        stroke="#111214"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path d="M-20-3v-7h10v7ZM-6-3v-7h11q6 1 7 7Z" fill="#BFE4F0" stroke="#111214" stroke-width="2" />
      <circle cx="-16" cy="11" r="6" fill="#2A2B30" stroke="#111214" stroke-width="2" />
      <circle cx="18" cy="11" r="6" fill="#2A2B30" stroke="#111214" stroke-width="2" />
    </g>
  );
}

function ModeArt({ mode }: { mode: Mode }) {
  switch (mode) {
    case 'gp':
      return (
        <svg viewBox="0 0 160 100" class="bj-mode-art" aria-hidden="true">
          <path d="M22 88V14" stroke="#111214" stroke-width="4" stroke-linecap="round" />
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3, 4].map((c) => (
              <rect
                key={`${r}${c}`}
                x={24 + c * 9}
                y={16 + r * 8 + Math.sin(c) * 2}
                width="9"
                height="8"
                fill={(r + c) % 2 ? '#111214' : '#FFF7F0'}
              />
            )),
          )}
          <path
            d="M92 18h46v12a23 23 0 0 1-46 0Z"
            fill="#FFC928"
            stroke="#111214"
            stroke-width="3.2"
            stroke-linejoin="round"
          />
          <path
            d="M92 24h-8a10 10 0 0 0 10 14M138 24h8a10 10 0 0 1-10 14"
            fill="none"
            stroke="#111214"
            stroke-width="3"
          />
          <path d="M110 52h10v14h-10Z" fill="#FF8A3D" stroke="#111214" stroke-width="3" />
          <rect
            x="98"
            y="66"
            width="34"
            height="10"
            rx="2"
            fill="#FF5A1F"
            stroke="#111214"
            stroke-width="3"
          />
          <path
            d="M104 26a10 10 0 0 0 6 14"
            stroke="#FFF2B8"
            stroke-width="3"
            fill="none"
            stroke-linecap="round"
          />
        </svg>
      );
    case 'duel':
      return (
        <svg viewBox="0 0 160 100" class="bj-mode-art" aria-hidden="true">
          <BajajShape x={42} y={58} color="#2F8CFF" />
          <BajajShape x={118} y={58} flip color="#F2453D" />
          <path
            d="M80 22l7 12 12 2-9 8 3 13-13-7-13 7 3-13-9-8 12-2Z"
            fill="#FFC928"
            stroke="#111214"
            stroke-width="2.6"
            stroke-linejoin="round"
          />
          <text x="80" y="47" text-anchor="middle" font-size="13" font-weight="800" fill="#111214">
            VS
          </text>
        </svg>
      );
    case 'arena':
      return (
        <svg viewBox="0 0 160 100" class="bj-mode-art" aria-hidden="true">
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <circle
                cx={50 + k * 30}
                cy={28}
                r="11"
                fill={k < 2 ? '#FFC928' : '#3A3B40'}
                stroke="#111214"
                stroke-width="3"
              />
              <rect x={45 + k * 30} y={38} width="10" height="6" fill="#2A2B30" />
            </g>
          ))}
          <path
            d="M80 52l3 5 5-2 1 6 6 0-2 6 5 3-4 4 4 4-5 3 2 6-6 0-1 6-5-2-3 5-3-5-5 2-1-6-6 0 2-6-5-3 4-4-4-4 5-3-2-6 6 0 1-6 5 2Z"
            fill="#7FA82E"
            stroke="#111214"
            stroke-width="2.4"
            stroke-linejoin="round"
          />
          <circle cx="80" cy="73" r="11" fill="#B5D152" stroke="#111214" stroke-width="2.4" />
        </svg>
      );
    case 'time':
      return (
        <svg viewBox="0 0 160 100" class="bj-mode-art" aria-hidden="true">
          <path
            d="M18 40h26M12 52h30M20 64h22"
            stroke="#FFF7F0"
            stroke-width="4"
            stroke-linecap="round"
            opacity="0.7"
          />
          <circle cx="92" cy="54" r="32" fill="#FFF7F0" stroke="#111214" stroke-width="4" />
          <rect
            x="85"
            y="12"
            width="14"
            height="10"
            rx="2"
            fill="#22B35E"
            stroke="#111214"
            stroke-width="3"
          />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <path
                key={i}
                d={`M${92 + Math.sin(a) * 26} ${54 - Math.cos(a) * 26}L${92 + Math.sin(a) * 22} ${54 - Math.cos(a) * 22}`}
                stroke="#111214"
                stroke-width="2.4"
              />
            );
          })}
          <path d="M92 54L92 32M92 54l14 8" stroke="#22B35E" stroke-width="4" stroke-linecap="round" />
          <circle cx="92" cy="54" r="4" fill="#111214" />
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ minimap */

interface MapShape {
  d: string;
  w: number;
  h: number;
  ox: number;
  oz: number;
  start: { x: number; z: number } | null;
  obstacles: { x: number; z: number; r: number }[];
}

function trackShape(track: Track): MapShape {
  const B = track.bounds;
  const pad = 16;
  let d = '';
  for (let i = 0; i <= track.n; i += 3) {
    const k = i % track.n;
    d += `${i === 0 ? 'M' : 'L'}${(track.x[k]! - B.minX + pad).toFixed(1)} ${(track.z[k]! - B.minZ + pad).toFixed(1)}`;
  }
  d += 'Z';
  const st = track.frame(0);
  return {
    d,
    w: B.maxX - B.minX + pad * 2,
    h: B.maxZ - B.minZ + pad * 2,
    ox: B.minX - pad,
    oz: B.minZ - pad,
    start: { x: st.x - B.minX + pad, z: st.z - B.minZ + pad },
    obstacles: [],
  };
}

function arenaShape(A: Arena): MapShape {
  const pad = 4;
  const w = A.halfW * 2 + pad * 2;
  const h = A.halfD * 2 + pad * 2;
  const r = A.corner;
  const x0 = pad;
  const z0 = pad;
  const x1 = w - pad;
  const z1 = h - pad;
  const d = `M${x0 + r} ${z0}H${x1 - r}Q${x1} ${z0} ${x1} ${z0 + r}V${z1 - r}Q${x1} ${z1} ${x1 - r} ${z1}H${x0 + r}Q${x0} ${z1} ${x0} ${z1 - r}V${z0 + r}Q${x0} ${z0} ${x0 + r} ${z0}Z`;
  const obstacles = A.obstacles.map((o) => ({
    x: o.x + A.halfW + pad,
    z: o.z + A.halfD + pad,
    r: o.kind === 'circle' ? o.r : Math.max(o.hw, o.hd),
  }));
  return { d, w, h, ox: -A.halfW - pad, oz: -A.halfD - pad, start: null, obstacles };
}

export function Minimap({ store, focus, width }: { store: HudStore; focus: number; width: number }) {
  const race = store.race;
  const P = useMemo(() => (race?.track ? trackShape(race.track) : arenaShape(getArena())), [race]);
  const g = useRef<SVGGElement>(null);
  const cards = store.cards.value;
  useEffect(
    () =>
      store.onFrame((r) => {
        const el = g.current;
        if (!el || !r) return;
        for (const c of Array.from(el.children)) {
          const k = r.karts[Number(c.getAttribute('data-k'))];
          if (!k) continue;
          c.setAttribute('transform', `translate(${(k.x - P.ox).toFixed(1)} ${(k.z - P.oz).toFixed(1)})`);
          (c as SVGGElement).style.opacity = k.out ? '0' : '1';
        }
      }),
    [store, P],
  );
  const arena = !race?.track;
  const order = cards.map((c) => c.idx).sort((a, b) => (a === focus ? 1 : b === focus ? -1 : 0));
  return (
    <svg
      class="bj-map"
      viewBox={`0 0 ${P.w} ${P.h}`}
      width={width}
      height={(width * P.h) / P.w}
      aria-hidden="true"
    >
      {arena ? (
        <>
          <path d={P.d} fill="rgba(17,18,20,0.55)" stroke="#111214" stroke-width="4" />
          <path d={P.d} fill="none" stroke="#FFC928" stroke-width="1.6" />
          {P.obstacles.map((o, i) => (
            <circle key={i} cx={o.x} cy={o.z} r={o.r} fill="#8f939c" />
          ))}
        </>
      ) : (
        <>
          <path d={P.d} fill="none" stroke="#111214" stroke-width="15" stroke-linejoin="round" />
          <path d={P.d} fill="none" stroke="#5a5d66" stroke-width="10" stroke-linejoin="round" />
          <path d={P.d} fill="none" stroke="#f2f2ee" stroke-width="1.6" stroke-dasharray="4 6" />
          {P.start && <rect x={P.start.x - 2} y={P.start.z - 8} width="4" height="16" fill="#fff" />}
        </>
      )}
      <g ref={g}>
        {order.map((idx) => {
          const c = cards[idx]!;
          const me = idx === focus;
          const r = (me ? 9 : c.human ? 7 : 5.5) * (arena ? 0.4 : 1);
          return (
            <g key={idx} data-k={idx}>
              <circle r={r + 2.5 * (arena ? 0.4 : 1)} fill="#111214" />
              <circle r={r} fill={c.color} />
              {me && (
                <circle
                  r={r + 6 * (arena ? 0.4 : 1)}
                  fill="none"
                  stroke="#FFF7F0"
                  stroke-width={arena ? 1 : 2.5}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ per-viewport HUD */

function placeColor(p: number): string {
  return p === 1 ? '#FFC928' : p === 2 ? '#E8ECEF' : p === 3 ? '#FF8A3D' : '#FFFFFF';
}

function Lamps({ lives }: { lives: number }) {
  return (
    <div class="bj-lives" role="img" aria-label={STR.livesShort(lives)}>
      {[0, 1, 2].map((k) => (
        <div key={k} class={`bj-life ${k < lives ? 'on' : ''}`} />
      ))}
    </div>
  );
}

function ViewportHud({ store, vi, info }: { store: HudStore; vi: number; info: VpInfo }) {
  const m = store.vps.value[vi];
  const card = store.cards.value[info.kart];
  const callout = store.callouts.value[vi] ?? null;
  const mode = store.mode.value;
  const timer = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      store.onFrame((race) => {
        const el = timer.current;
        const k = race?.karts[info.kart];
        if (!el || !k || !race) return;
        // After the race a kart that did not finish keeps its last lap clock instead of 0:00.00.
        if ((race.phase === 'results' || race.phase === 'done') && k.finishT === null && k.lap >= 1) return;
        const t =
          race.phase === 'race' && k.lap >= 1 && k.finishT === null
            ? race.t - k.lapStartT
            : k.finishT !== null
              ? k.finishT
              : 0;
        el.textContent = formatTime(t);
      }),
    [store, info.kart],
  );
  if (!m || !card) return null;
  const style: JSX.CSSProperties = {
    left: info.x,
    top: info.y,
    width: info.w,
    height: info.h,
    ['--u' as string]: String(info.u),
  };
  const mapW = Math.round(
    Math.min(info.w * 0.24, 250) * (info.h < 300 ? 0.85 : 1) * (mode === 'arena' ? 0.75 : 1),
  );
  const phase = store.phase.value;
  const racing = phase === 'race' || phase === 'results';
  const finished = m.finishPlace !== null;
  return (
    <div class={`bj-vp mode-${mode}`} style={style}>
      <Countdown store={store} inset />
      {mode === 'arena' ? (
        <div class="bj-place">
          <div class="bj-label">{STR.lives}</div>
          <Lamps lives={m.out ? 0 : m.lives} />
        </div>
      ) : mode === 'time' ? (
        <div class="bj-place bj-tt">
          <div class="bj-label">{STR.bestLabel}</div>
          <div class={`bj-tt-best display outline-text ${m.best === null ? 'is-empty' : ''}`}>
            {m.best !== null ? formatTime(m.best) : STR.noLapYet}
          </div>
          <div class="bj-tt-last">
            {STR.lastLabel} {m.last !== null ? formatTime(m.last) : STR.noTime}
          </div>
        </div>
      ) : (
        <div class="bj-place">
          <div class="bj-label">{STR.place}</div>
          <div class="bj-place-row">
            <span class="bj-place-n display outline-text" style={{ color: placeColor(m.place) }}>
              {m.place}
            </span>
            <span class="bj-place-of display outline-text">/{m.total}</span>
          </div>
        </div>
      )}
      {mode !== 'arena' && (
        <div class="bj-lap">
          <div class="bj-label">{STR.lap}</div>
          <div class="bj-lap-n display outline-text">{STR.lapValue(m.lap, m.laps)}</div>
          <div class="bj-timer" ref={timer}>
            0:00.00
          </div>
        </div>
      )}
      {!finished && !m.out && racing && mode !== 'time' && (
        <div class={`bj-item ${m.rolling ? 'is-rolling' : ''} ${m.item ? 'has-item' : ''}`}>
          <div class="bj-item-box">
            {m.rolling ? (
              <div class="bj-roll">
                {(['durian', 'firecracker', 'boost', 'shield'] as const).map((k, i) => (
                  <div key={k} class="bj-roll-i" style={{ animationDelay: `${i * 0.09}s` }}>
                    <ItemArt kind={k} size={58} />
                  </div>
                ))}
              </div>
            ) : m.item ? (
              <ItemArt kind={m.item} size={62} />
            ) : (
              <div class="bj-item-empty" />
            )}
          </div>
          {m.item && !m.rolling && <div class="bj-item-name">{STR.items[m.item]}</div>}
        </div>
      )}
      <div class="bj-map-wrap">
        <Minimap store={store} focus={info.kart} width={mapW} />
      </div>
      <div class="bj-who">
        <Avatar fruit={card.fruit} ring={card.color} size={34} />
        <div>
          <div class="bj-who-name">{card.name}</div>
          {m.offline && <div class="bj-who-sub">{STR.offline}</div>}
        </div>
      </div>
      {racing && m.wrongWay && !finished && (
        <div class="bj-wrong">
          <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true">
            <path
              d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"
              fill="none"
              stroke="#fff"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <div>
            <div class="bj-wrong-t display">{STR.wrongWay}</div>
            <div class="bj-wrong-s">{STR.wrongWaySub}</div>
          </div>
        </div>
      )}
      {m.out && phase !== 'results' && (
        <div class="bj-finish">
          <div class="bj-finish-t display outline-text is-out">{STR.out}</div>
          <div class="bj-finish-s display outline-text">{STR.outSub}</div>
        </div>
      )}
      {finished && phase !== 'results' && (
        <div class="bj-finish">
          <div class="bj-finish-t display outline-text">{STR.finished}</div>
          <div class="bj-finish-s display outline-text">
            {mode === 'time'
              ? `${STR.bestLabel} ${m.best !== null ? formatTime(m.best) : '-'}`
              : `${STR.finishedPlace(m.finishPlace!)} · ${formatTime(m.finishTime ?? 0)}`}
          </div>
        </div>
      )}
      {callout && !finished && (
        <div key={callout.key} class={`bj-callout tone-${callout.tone}`}>
          <div class="display outline-text">{callout.text}</div>
          {callout.sub && <div class="bj-callout-sub">{callout.sub}</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ name tags */

function Tags({ store }: { store: HudStore }) {
  const host = useRef<HTMLDivElement>(null);
  const layout = store.layout.value;
  const cards = store.cards.value;
  const ghost = store.mode.value === 'time';
  useEffect(() => {
    const nodes = new Map<string, HTMLElement>();
    return store.onFrame(() => {
      const el = host.current;
      const r = store.raceView;
      if (!el || !r) return;
      if (nodes.size !== el.children.length) {
        nodes.clear();
        for (const n of Array.from(el.children) as HTMLElement[]) nodes.set(n.dataset.t ?? '', n);
      }
      const seen = new Set<string>();
      layout.forEach((vp, vi) => {
        if (vp.kind === 'free') return;
        const max = vp.kind === 'chase' ? 60 : 160;
        for (const t of r.tags(vi, max)) {
          const id = `${vi}-${t.kart}`;
          const node = nodes.get(id);
          if (!node) continue;
          seen.add(id);
          node.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) translate(-50%, -100%) scale(${(vp.u * t.scale).toFixed(3)})`;
          node.style.opacity = '1';
        }
      });
      for (const [id, n] of nodes) if (!seen.has(id)) n.style.opacity = '0';
    });
  }, [store, layout]);
  if (store.phase.value === 'intro' || !store.raceView) return null;
  return (
    <div class="bj-tags" ref={host}>
      {layout.flatMap((vp, vi) =>
        cards
          .filter((c) => !(vp.kind === 'chase' && c.idx === vp.kart))
          .map((c) => (
            <div
              key={`${vi}-${c.idx}`}
              data-t={`${vi}-${c.idx}`}
              class={`bj-tag ${c.human ? 'is-human' : ''}`}
              style={{ ['--c' as string]: c.color }}
            >
              {c.human && <Avatar fruit={c.fruit} ring={c.color} size={22} />}
              <span>{c.name}</span>
              {ghost && <em>{STR.ghostTag}</em>}
            </div>
          )),
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ global race overlays */

/**
 * Race-start lights. With 3-4 split views the middle of the screen is where four HUD corners
 * meet, so each view gets its own small light (`inset`) instead of one in the centre.
 */
function Countdown({ store, inset = false }: { store: HudStore; inset?: boolean }) {
  const n = store.count.value;
  if (n < 0) return null;
  const views = store.layout.value.length;
  const quad = views >= 3 && !store.broadcast.value;
  if (quad !== inset) return null;
  const lit = n === 3 || n === 2 ? 0 : n === 1 ? 1 : 2;
  const mode = inset ? 'is-inset' : store.broadcast.value || views === 1 ? 'is-full' : 'is-split2';
  return (
    <div class={`bj-count ${mode}`}>
      <div class="bj-light" role="img" aria-label={n > 0 ? String(n) : STR.go}>
        {[0, 1, 2].map((k) => (
          <div key={k} class={`bj-lamp lamp-${k} ${lit === k ? 'on' : ''}`} />
        ))}
      </div>
      <div key={n} class={`bj-count-n display outline-text ${n === 0 ? 'is-go' : ''}`}>
        {n > 0 ? n : STR.go}
      </div>
    </div>
  );
}

function IntroCard({ store }: { store: HudStore }) {
  const i = store.intro.value;
  if (!i) return null;
  return (
    <div class="bj-intro">
      <div class="bj-intro-t display outline-text">{i.title}</div>
      <div class="bj-intro-s">{i.sub}</div>
      <div class="bj-intro-h">{i.hint}</div>
    </div>
  );
}

function Grace({ store }: { store: HudStore }) {
  const g = store.grace.value;
  if (g === null) return null;
  return <div class="bj-grace">{STR.timeLeft(g)}</div>;
}

function ArenaClock({ store }: { store: HudStore }) {
  const s = store.arenaClock.value;
  const alive = store.alive.value;
  if (s === null || store.phase.value === 'intro') return null;
  return (
    <div class={`bj-clock ${s <= 15 ? 'is-low' : ''}`}>
      <div class="bj-clock-l">{STR.arenaClock}</div>
      <div class="bj-clock-t display">{formatClock(s * 1000)}</div>
      {alive !== null && <div class="bj-clock-a">{STR.arenaLeft(alive)}</div>}
    </div>
  );
}

function Standings({ store, title }: { store: HudStore; title?: string }) {
  const rows = store.standings.value;
  const cards = store.cards.value;
  const mode = store.mode.value;
  return (
    <div class="bj-stand">
      <div class="bj-stand-h">{title ?? STR.standings}</div>
      {rows.map((r) => {
        const c = cards[r.idx];
        if (!c) return null;
        const right =
          mode === 'arena'
            ? r.out
              ? STR.out
              : STR.livesShort(r.lives)
            : mode === 'time'
              ? r.best !== null
                ? formatTime(r.best)
                : '-'
              : r.finished
                ? STR.finished
                : STR.lapsShort(r.lap);
        return (
          <div key={r.idx} class={`bj-stand-row ${c.human ? 'is-human' : ''} ${r.out ? 'is-out' : ''}`}>
            <span class="bj-stand-p display">{r.place}</span>
            <Avatar fruit={c.fruit} ring={c.color} size={26} dim={r.out} />
            <span class="bj-stand-n">{c.name}</span>
            <span class="bj-stand-l">{right}</span>
          </div>
        );
      })}
    </div>
  );
}

function Results({ store }: { store: HudStore }) {
  const rows = store.results.value;
  const mode = store.mode.value;
  if (!rows) return null;
  const arena = mode === 'arena';
  const title = arena ? STR.resultsTitleArena : mode === 'time' ? STR.resultsTitleTime : STR.resultsTitle;
  const post = store.menu.value?.step === 'post';
  return (
    <div class={`bj-results ${post ? 'is-post' : ''}`}>
      <div class="bj-results-card">
        <div class="bj-results-h display outline-text">{title}</div>
        <div class="bj-results-row is-head">
          <span>{STR.resultsCols.place}</span>
          <span />
          <span>{STR.resultsCols.name}</span>
          <span>
            {arena ? STR.resultsCols.lives : mode === 'time' ? STR.resultsCols.best : STR.resultsCols.time}
          </span>
          <span>
            {arena ? STR.resultsCols.hits : mode === 'time' ? STR.resultsCols.time : STR.resultsCols.best}
          </span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.card.idx}
            class={`bj-results-row ${r.card.human ? 'is-human' : ''}`}
            style={{ animationDelay: `${0.08 * i}s` }}
          >
            <span class="display bj-results-p" style={{ color: placeColor(r.place) }}>
              {r.place}
            </span>
            <Avatar fruit={r.card.fruit} ring={r.card.color} size={34} />
            <span class="bj-results-n">
              {r.card.name}
              {!r.card.human && <em>{STR.cpuTag}</em>}
            </span>
            {arena ? (
              <>
                <span class="bj-results-t">{r.out ? STR.out : <Lamps lives={r.lives} />}</span>
                <span class="bj-results-b">{r.hits}</span>
              </>
            ) : mode === 'time' ? (
              <>
                <span class="bj-results-t">{r.best ?? STR.dnf}</span>
                <span class="bj-results-b">{r.time ?? '-'}</span>
              </>
            ) : (
              <>
                <span class="bj-results-t">{r.time ?? STR.dnf}</span>
                <span class="bj-results-b">{r.best ?? '-'}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RaceHud({ store }: { store: HudStore }) {
  const layout = store.layout.value;
  const broadcast = store.broadcast.value;
  const overview = layout.find((v) => v.kind === 'overview');
  return (
    <>
      <Tags store={store} />
      {layout.map((info, vi) =>
        info.kind === 'chase' ? <ViewportHud key={vi} store={store} vi={vi} info={info} /> : null,
      )}
      {layout.length === 2 && <div class="bj-divider is-h" style={{ top: layout[1]!.y - 3 }} />}
      {layout.length >= 3 && !broadcast && (
        <>
          <div class="bj-divider is-h" style={{ top: layout[2]!.y - 3 }} />
          <div class="bj-divider is-v" style={{ left: layout[1]!.x - 6 }} />
        </>
      )}
      {overview && (
        <div
          class="bj-vp bj-overview"
          style={{
            left: overview.x,
            top: overview.y,
            width: overview.w,
            height: overview.h,
            ['--u' as string]: String(overview.u),
          }}
        >
          <div class="bj-ov-title">{STR.overviewTitle}</div>
          <Standings store={store} />
          <div class="bj-map-wrap">
            <Minimap store={store} focus={-1} width={Math.round(overview.w * 0.42)} />
          </div>
        </div>
      )}
      {broadcast && (
        <>
          <Standings store={store} />
          <div class="bj-map-wrap is-broadcast">
            <Minimap store={store} focus={-1} width={300} />
          </div>
        </>
      )}
      <ArenaClock store={store} />
      <IntroCard store={store} />
      <Grace store={store} />
      <Countdown store={store} />
      <Results store={store} />
    </>
  );
}

/* ------------------------------------------------------------------ menus */

function MenuHead({ eyebrow, title, m }: { eyebrow: string; title: string; m: MenuModel }) {
  // Only the Host chooses the mode and the circuit; everyone picks their own colour.
  const host = m.step === 'kart' ? undefined : m.players.find((p) => p.host);
  return (
    <div class="bj-menu-head">
      <div class="bj-menu-eyebrow">{eyebrow}</div>
      <h1 class="bj-menu-title display outline-text">{title}</h1>
      {host && (
        <div class="bj-menu-host">
          <Avatar fruit={host.fruit} ring={host.color} size={28} />
          <span>{STR.menuHostPicks}</span>
        </div>
      )}
    </div>
  );
}

function ModeScreen({ m }: { m: MenuModel }) {
  const info = STR.modes[m.mode];
  return (
    <div class="bj-menu">
      <MenuHead eyebrow={STR.menuModeEyebrow(m.mode === 'arena' ? 2 : 3)} title={STR.menuModeTitle} m={m} />
      <div class="bj-mode-desc" style={{ ['--acc' as string]: MODE_COLORS[m.mode] }}>
        <div class="bj-mode-desc-tag">{info.tag}</div>
        <div class="bj-mode-desc-name display">{info.name}</div>
        <div class="bj-mode-desc-text">{info.desc}</div>
        <div class="bj-mode-desc-meta">
          {m.mode === 'arena' ? STR.maps.arena.name : STR.menuLaps(m.laps)} · {STR.menuOpponents(m.cpus)}
        </div>
      </div>
      <div class="bj-mode-cards">
        {MODES.map((id) => (
          <div
            key={id}
            class={`bj-mode-card ${id === m.mode ? 'is-on' : ''}`}
            style={{ ['--acc' as string]: MODE_COLORS[id] }}
          >
            <ModeArt mode={id} />
            <div class="bj-mode-card-name display">{STR.modes[id].name}</div>
            <div class="bj-mode-card-tag">{STR.modes[id].tag}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function trackOutline(id: CircuitId): { d: string; w: number; h: number } {
  const T = getTrack(id);
  const s = trackShape(T);
  return { d: s.d, w: s.w, h: s.h };
}

function MapScreen({ m }: { m: MenuModel }) {
  const outlines = useMemo(
    () =>
      Object.fromEntries(CIRCUITS.map((c) => [c, trackOutline(c)])) as Record<
        CircuitId,
        { d: string; w: number; h: number }
      >,
    [],
  );
  const cur = STR.maps[m.circuit];
  const len = getTrack(m.circuit).length;
  return (
    <div class="bj-menu">
      <MenuHead eyebrow={STR.menuMapEyebrow} title={STR.menuMapTitle} m={m} />
      <div class="bj-map-panel" style={{ ['--acc' as string]: MAP_COLORS[m.circuit] }}>
        <svg
          viewBox={`0 0 ${outlines[m.circuit].w} ${outlines[m.circuit].h}`}
          class="bj-map-big"
          aria-hidden="true"
        >
          <path
            d={outlines[m.circuit].d}
            fill="none"
            stroke="#111214"
            stroke-width="22"
            stroke-linejoin="round"
          />
          <path
            d={outlines[m.circuit].d}
            fill="none"
            stroke="var(--acc)"
            stroke-width="12"
            stroke-linejoin="round"
          />
        </svg>
        <div class="bj-map-panel-name display">{cur.name}</div>
        <div class="bj-map-panel-mood">{cur.mood}</div>
        <div class="bj-map-panel-desc">{cur.desc}</div>
        <div class="bj-map-panel-meta">
          {STR.menuLengthM(len)} · {STR.menuLaps(m.laps)} · {STR.modes[m.mode].name}
        </div>
      </div>
      <div class="bj-map-cards">
        {CIRCUITS.map((c) => (
          <div
            key={c}
            class={`bj-map-card ${c === m.circuit ? 'is-on' : ''}`}
            style={{ ['--acc' as string]: MAP_COLORS[c] }}
          >
            <svg viewBox={`0 0 ${outlines[c].w} ${outlines[c].h}`} class="bj-map-mini" aria-hidden="true">
              <path
                d={outlines[c].d}
                fill="none"
                stroke="var(--acc)"
                stroke-width="16"
                stroke-linejoin="round"
              />
            </svg>
            <div>
              <div class="bj-map-card-name display">{STR.maps[c].name}</div>
              <div class="bj-map-card-mood">{STR.maps[c].mood}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GarageScreen({ store, m }: { store: HudStore; m: MenuModel }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      store.onFrame(() => {
        const el = host.current;
        const src = store.tagSource;
        if (!el || !src) return;
        for (const t of src()) {
          const n = el.querySelector<HTMLElement>(`[data-p="${t.key}"]`);
          if (n)
            n.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) translate(-50%, -100%)`;
        }
      }),
    [store],
  );
  const ready = m.players.filter((p) => p.ready).length;
  const steps = m.mode === 'arena' ? 2 : 3;
  return (
    <div class="bj-menu">
      <MenuHead eyebrow={STR.menuKartEyebrow(steps, steps)} title={STR.menuKartTitle} m={m} />
      <div class="bj-plates" ref={host}>
        {m.players.map((p) => (
          <div
            key={p.id}
            data-p={p.id}
            class={`bj-plate ${p.ready ? 'is-ready' : ''}`}
            style={{ ['--c' as string]: p.color }}
          >
            <Avatar fruit={p.fruit} ring={p.color} size={36} />
            <div>
              <div class="bj-plate-name">{p.name}</div>
              <div class="bj-plate-sub">
                {p.ready ? STR.menuReadyTag : (STR.colorNames[p.color] ?? STR.menuChoosing)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div class="bj-garage-bar">
        <div class="bj-garage-chip" style={{ ['--acc' as string]: MODE_COLORS[m.mode] }}>
          {STR.modes[m.mode].name} · {m.mode === 'arena' ? STR.maps.arena.name : STR.maps[m.circuit].name}
        </div>
        <div class="bj-garage-ready display">{STR.menuReadyCount(ready, m.players.length)}</div>
        {m.autoS !== null && <div class="bj-garage-auto">{STR.menuAutoReady(m.autoS)}</div>}
      </div>
    </div>
  );
}

function PostBar({ m }: { m: MenuModel }) {
  return (
    <div class="bj-post">
      <div class="bj-post-q display">{STR.postTitle}</div>
      <div class="bj-post-opts">
        <span>{STR.postAgain}</span>
        <span>{STR.postChange}</span>
        <span>{STR.postDone}</span>
      </div>
      <div class="bj-post-who">{STR.postWaiting(m.hostName)}</div>
      {m.postS !== null && <div class="bj-post-auto">{STR.postAuto(m.postS)}</div>}
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const m = store.menu.value;
  const paused = store.paused.value;
  const step = m?.step ?? 'mode';
  return (
    <div class={`bj-hud ${paused ? 'is-paused' : ''}`}>
      {(step === 'race' || step === 'post') && <RaceHud store={store} />}
      {m && step === 'mode' && <ModeScreen m={m} />}
      {m && step === 'map' && <MapScreen m={m} />}
      {m && step === 'kart' && <GarageScreen store={store} m={m} />}
      {m && step === 'post' && <PostBar m={m} />}
    </div>
  );
}
