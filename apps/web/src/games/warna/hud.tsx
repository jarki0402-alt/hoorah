/**
 * DOM HUD over the cave: stage name and clock on top, one chip per colour (symbol + how many of
 * that colour stand at their door), the stage tip at the bottom, and the centre cards (stage
 * picker mirrored from the Host's phone, stage intro with the colour legend, stage clear with
 * stars). State arrives through a signal at ~10 Hz; floating texts are short-lived elements.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { THUMBS } from '../../controller/thumbs/warna';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import { LEVELS, type Slot } from './levels';
import { levelName, SLOT_NAME, SLOT_SYMBOL, STR } from './strings';
import { SLOT_CSS } from './textures';

export interface ColorChip {
  slot: Slot;
  in: number;
  total: number;
}

export interface LegendRow {
  slot: Slot;
  people: { name: string; fruit: Fruit; color: string }[];
}

export interface StarLine {
  label: string;
  on: boolean;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'pick'; selected: string; best: Record<string, number>; host: string; stages: number }
  | { kind: 'intro'; eyebrow: string; name: string; tip: string; legend: LegendRow[]; solo: boolean }
  | { kind: 'clear'; eyebrow: string; stars: StarLine[]; time: string; gems: string; next: string };

export interface HudState {
  show: boolean;
  stage: string;
  name: string;
  timer: string;
  gems: string;
  chips: ColorChip[];
  tip: string;
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
  vote: '',
  overlay: { kind: 'none' },
};

/** The same picture the phones show on the option (controller/thumbs/warna.ts). */
function Thumb({ id }: { id: string }) {
  const build = THUMBS[`lvl-${id}`];
  if (!build) return null;
  return <img class="wa-card-img" src={svgUrl(`wa-thumb:${id}`, build)} alt="" draggable={false} />;
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

function Stars({ n }: { n: number }) {
  return (
    <span class="wa-stars">
      {[0, 1, 2].map((i) => (
        <span key={i} class={i < n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

function OverlayView({ o }: { o: Overlay }) {
  if (o.kind === 'pick') {
    return (
      <div class="wa-overlay wa-pick">
        <div class="wa-pick-head">
          <div class="wa-eyebrow">{STR.pickEyebrow}</div>
          <h1 class="wa-pick-title">{STR.screenPickTitle}</h1>
          <div class="wa-pick-sub">{STR.pickHint(o.stages)}</div>
        </div>
        <div class="wa-grid">
          {LEVELS.map((lv, i) => (
            <div key={lv.id} class={`wa-card ${o.selected === lv.id ? 'on' : ''}`}>
              <Thumb id={lv.id} />
              <div class="wa-card-text">
                <span class="wa-card-num">{i + 1}</span>
                <span class="wa-card-name">{levelName(lv.id)}</span>
                <Stars n={o.best[lv.id] ?? 0} />
              </div>
            </div>
          ))}
        </div>
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
          <p class="wa-tip">{o.tip}</p>
          <div class="wa-legend">
            {o.legend.map((row) => (
              <div key={row.slot} class="wa-legend-row" style={{ '--c': SLOT_CSS[row.slot] }}>
                <SlotMark slot={row.slot} size={30} />
                <span class="wa-legend-name">{SLOT_NAME[row.slot]}</span>
                <span class="wa-legend-people">
                  {row.people.map((p) => (
                    <span key={p.name} class="wa-legend-person">
                      <Avatar fruit={p.fruit} ring={p.color} size={28} />
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
          <h1 class="wa-big-title">{STR.clearTitle}</h1>
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
            <span>{o.gems}</span>
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
      {s.show && s.tip && <div class="wa-tipbar">{s.tip}</div>}
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
