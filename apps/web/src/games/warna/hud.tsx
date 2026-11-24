/**
 * DOM HUD over the stage: world, level and clock on top, one chip per colour (symbol + how many
 * of that colour stand at their door), the tip or hint at the bottom, and the centre cards
 * (world cards and the journey map of 30 stages mirrored from the Host's phone, stage intro with
 * the goal and the colour legend, stage clear with stars). State arrives through a signal at
 * ~10 Hz; floating texts are short-lived elements.
 */
import type { Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { THUMBS } from '../../controller/thumbs/warna';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import type { BiomeId, Slot } from './levels';
import { SLOT_NAME, SLOT_SYMBOL, STR } from './strings';
import { SLOT_CSS } from './textures';

export interface ColorChip {
  slot: Slot;
  in: number;
  total: number;
}

export interface LegendRow {
  slot: Slot;
  people: { name: string; look: Look; color: string }[];
}

export interface StarLine {
  label: string;
  on: boolean;
}

export interface WorldCard {
  id: BiomeId;
  name: string;
  sub: string;
  ready: boolean;
  /** Behind Hoorah Pass on a free main screen. */
  pass: boolean;
  got: number;
  of: number;
}

export interface JourneyNode {
  id: string;
  number: number;
  name: string;
  stars: number;
  done: boolean;
  open: boolean;
  /** Behind Hoorah Pass on a free main screen. */
  pass: boolean;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'worlds'; selected: BiomeId; worlds: WorldCard[]; host: string }
  | { kind: 'journey'; world: BiomeId; title: string; selected: string; nodes: JourneyNode[]; host: string }
  | {
      kind: 'intro';
      eyebrow: string;
      name: string;
      tip: string;
      goal: string;
      legend: LegendRow[];
      solo: boolean;
    }
  | {
      kind: 'clear';
      eyebrow: string;
      title: string;
      stars: StarLine[];
      time: string;
      gems: string;
      next: string;
    };

export interface HudState {
  show: boolean;
  stage: string;
  name: string;
  timer: string;
  gems: string;
  chips: ColorChip[];
  tip: string;
  /** The tip line is a hint (drawn brighter). */
  hint: boolean;
  vote: string;
  overlay: Overlay;
}

const INITIAL: HudState = {
  show: false,
  stage: '',
  name: '',
  timer: '00:00',
  gems: '',
  chips: [],
  tip: '',
  hint: false,
  vote: '',
  overlay: { kind: 'none' },
};

/** The same picture the phones show on the option (controller/thumbs/warna.ts). */
function Thumb({ thumb }: { thumb: string }) {
  const build = THUMBS[thumb];
  if (!build) return null;
  return <img class="wa-card-img" src={svgUrl(`wa-thumb:${thumb}`, build)} alt="" draggable={false} />;
}

/**
 * The 30 stages of a world as a winding path (three rows of ten, snaking), finished stages with
 * their stars, the picked one ringed, locked ones dimmed.
 */
function Journey({ o }: { o: Extract<Overlay, { kind: 'journey' }> }) {
  const W = 1000;
  const H = 360;
  const pos = (i: number) => {
    const row = Math.floor(i / 10);
    const col = row % 2 === 0 ? i % 10 : 9 - (i % 10);
    return { x: 60 + col * 97, y: 60 + row * 120 };
  };
  const path = o.nodes.map((_, i) => pos(i));
  let d = '';
  path.forEach((p, i) => {
    if (i === 0) d = `M${p.x} ${p.y}`;
    else {
      const a = path[i - 1]!;
      d +=
        a.y === p.y
          ? ` L${p.x} ${p.y}`
          : ` C${a.x + (a.x > W / 2 ? 70 : -70)} ${a.y} ${p.x + (p.x > W / 2 ? 70 : -70)} ${p.y} ${p.x} ${p.y}`;
    }
  });
  return (
    <svg class="wa-journey" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={o.title}>
      <path d={d} class="wa-journey-road" />
      <path d={d} class="wa-journey-dash" />
      {o.nodes.map((n, i) => {
        const p = path[i]!;
        const on = n.id === o.selected;
        return (
          <g
            key={n.id}
            class={`wa-node ${n.done ? 'done' : ''} ${n.open ? 'open' : 'locked'} ${n.pass ? 'pass' : ''} ${on ? 'on' : ''}`}
          >
            {on && <circle cx={p.x} cy={p.y} r={34} class="wa-node-ring" />}
            <circle cx={p.x} cy={p.y} r={24} class="wa-node-disc" />
            {n.open ? (
              <text x={p.x} y={p.y + 8} class="wa-node-num">
                {n.number}
              </text>
            ) : (
              <path
                class="wa-node-lock"
                d={`M${p.x - 8} ${p.y - 1}h16v12h-16Z M${p.x - 5} ${p.y - 1}v-4a5 5 0 0 1 10 0v4`}
              />
            )}
            {n.pass && (
              <g class="wa-node-pass">
                <rect x={p.x - 26} y={p.y - 50} width={52} height={20} rx={6} />
                <text x={p.x} y={p.y - 35}>
                  {STR.passBadge}
                </text>
              </g>
            )}
            {n.done && (
              <text x={p.x} y={p.y + 46} class="wa-node-stars">
                {'★'.repeat(n.stars)}
                <tspan class="off">{'★'.repeat(3 - n.stars)}</tspan>
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SlotMark({ slot, size = 22 }: { slot: Slot; size?: number }) {
  return (
    <span
      class="wa-sym"
      style={{
        background: SLOT_CSS[slot],
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${size * 0.55}px`,
      }}
    >
      {SLOT_SYMBOL[slot]}
    </span>
  );
}

function OverlayView({ o }: { o: Overlay }) {
  if (o.kind === 'worlds') {
    return (
      <div class="wa-overlay wa-pick">
        <div class="wa-pick-head">
          <div class="wa-eyebrow">{STR.pickEyebrow}</div>
          <h1 class="wa-pick-title">{STR.screenPickTitle}</h1>
          <div class="wa-pick-sub">{STR.pickHint}</div>
        </div>
        <div class="wa-worlds">
          {o.worlds.map((w) => (
            <div
              key={w.id}
              class={`wa-wcard ${o.selected === w.id ? 'on' : ''} ${w.ready && !w.pass ? '' : 'soon'}`}
            >
              <Thumb thumb={`biome-${w.id}`} />
              {w.pass && <span class="wa-wcard-pass">{STR.passBadge}</span>}
              <div class="wa-wcard-text">
                <span class="wa-wcard-name">{w.name}</span>
                <span class="wa-wcard-sub">{w.sub}</span>
                {w.ready && !w.pass && (
                  <span class="wa-wcard-stars">
                    ★ {w.got}/{w.of}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div class="wa-pick-foot">{STR.pickHostPicks(o.host)}</div>
      </div>
    );
  }
  if (o.kind === 'journey') {
    const sel = o.nodes.find((n) => n.id === o.selected);
    return (
      <div class={`wa-overlay wa-pick wa-journey-wrap world-${o.world}`}>
        <div class="wa-pick-head">
          <div class="wa-eyebrow">{STR.levelTitle.toUpperCase()}</div>
          <h1 class="wa-pick-title">{o.title}</h1>
          {sel && (
            <div class="wa-pick-sub">
              {STR.levelLabel(sel.number)} · {sel.name}
            </div>
          )}
        </div>
        <Journey o={o} />
        <div class="wa-pick-foot">{STR.pickHostPicks(o.host)}</div>
      </div>
    );
  }
  if (o.kind === 'intro') {
    return (
      <div class="wa-overlay wa-center">
        <div class="wa-card-big">
          <div class="wa-eyebrow">{o.eyebrow}</div>
          <h1 class="wa-big-title">{o.name}</h1>
          <p class="wa-goal">{o.goal}</p>
          <p class="wa-tip">{o.tip}</p>
          <div class="wa-legend">
            {o.legend.map((row) => (
              <div key={row.slot} class="wa-legend-row" style={{ '--c': SLOT_CSS[row.slot] }}>
                <SlotMark slot={row.slot} size={30} />
                <span class="wa-legend-name">{SLOT_NAME[row.slot]}</span>
                <span class="wa-legend-people">
                  {row.people.map((p) => (
                    <span key={p.name} class="wa-legend-person">
                      <Avatar look={p.look} ring={p.color} size={28} />
                      {p.name}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          {o.solo && <p class="wa-solo">{STR.introSolo}</p>}
        </div>
      </div>
    );
  }
  if (o.kind === 'clear') {
    return (
      <div class="wa-overlay wa-center">
        <div class="wa-card-big wa-clear">
          <div class="wa-eyebrow">{o.eyebrow}</div>
          <h1 class="wa-big-title">{o.title}</h1>
          <div class="wa-clear-stars">
            {o.stars.map((s, i) => (
              <div
                key={s.label}
                class={`wa-clear-star ${s.on ? 'on' : ''}`}
                style={{ animationDelay: `${0.25 + i * 0.35}s` }}
              >
                <span class="wa-clear-glyph">★</span>
                <span class="wa-clear-label">{s.label}</span>
              </div>
            ))}
          </div>
          <div class="wa-clear-facts">
            <span>{o.time}</span>
            {o.gems && <span>{o.gems}</span>}
          </div>
          <div class="wa-next">{o.next}</div>
        </div>
      </div>
    );
  }
  return null;
}

function HudView({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  return (
    <div class="wa-hud" ref={hud.refs.root}>
      {s.show && (
        <div class="wa-top">
          <div class="wa-pill wa-stage">
            <span class="wa-stage-num">{s.stage}</span>
            <span class="wa-stage-name">{s.name}</span>
          </div>
          <div class="wa-chips">
            {s.chips.map((c) => (
              <div
                key={c.slot}
                class={`wa-chip ${c.in >= c.total && c.total > 0 ? 'done' : ''}`}
                style={{ '--c': SLOT_CSS[c.slot] }}
              >
                <SlotMark slot={c.slot} />
                <span>
                  {c.in}/{c.total}
                </span>
              </div>
            ))}
          </div>
          <div class="wa-pill wa-clock">
            <span class="wa-gems">{s.gems}</span>
            <span class="wa-time">{s.timer}</span>
          </div>
        </div>
      )}
      {s.show && s.vote && <div class="wa-vote">{s.vote}</div>}
      {s.show && s.tip && <div class={`wa-tipbar ${s.hint ? 'is-hint' : ''}`}>{s.tip}</div>}
      <OverlayView o={s.overlay} />
      <div class="wa-floats" ref={hud.refs.floats} />
      <div class="wa-paused-veil" />
    </div>
  );
}

export class Hud {
  readonly state = signal<HudState>(INITIAL);
  private root: HTMLDivElement | null = null;
  private floats: HTMLDivElement | null = null;
  readonly refs = {
    root: (el: HTMLDivElement | null) => {
      this.root = el;
    },
    floats: (el: HTMLDivElement | null) => {
      this.floats = el;
    },
  };

  constructor(host: HTMLElement) {
    render(<HudView hud={this} />, host);
  }

  setState(s: HudState): void {
    this.state.value = s;
  }

  setPaused(paused: boolean): void {
    this.root?.classList.toggle('wa-paused', paused);
  }

  /** A short rising text at stage px (x, y). */
  float(text: string, x: number, y: number, color: string): void {
    const host = this.floats;
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'wa-float';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    host.appendChild(el);
    window.setTimeout(() => el.remove(), 1200);
  }
}
