/**
 * DOM/Preact HUD over the Phaser world: round clock, live leaderboard, event feed, capture
 * pop-ups and the countdown / time-up overlays. Slow state goes through signals (~10 Hz);
 * pop-ups are written straight to pooled elements so Preact never re-renders at 60 fps.
 * Everything is laid out in world coordinates (1280x720) inside a root shifted by `origin`.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { Avatar, Icon } from '../../shared/ui';
import { FIELD_H, FIELD_W, FIELD_X, FIELD_Y } from './layout';
import { STR } from './strings';

export interface BoardRow {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  /** Formatted share, e.g. "18,4". */
  pct: string;
  /** Bar length relative to the leader, 0..1. */
  share: number;
  rank: number;
  /** Sole leader with some land: highlighted. */
  lead: boolean;
  /** Position in the sorted list (0 = top). */
  order: number;
  alive: boolean;
  /** Seconds until back, while knocked out. */
  respawn: number | null;
  /** A dropped phone (the computer covers it). */
  away: boolean;
}

export interface Winner {
  id: number;
  fruit: Fruit;
  color: string;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'count'; value: number }
  | { kind: 'go' }
  | { kind: 'warning' }
  | { kind: 'timeUp'; title: string; sub: string; winners: Winner[] };

export interface HudState {
  live: boolean;
  timer: string;
  urgent: boolean;
  rows: BoardRow[];
  overlay: Overlay;
  hint: boolean;
}

export interface FeedLine {
  key: number;
  text: string;
  color: string;
}

export const INITIAL_HUD: HudState = {
  live: false,
  timer: '0:00',
  urgent: false,
  rows: [],
  overlay: { kind: 'none' },
  hint: false,
};

const FLOAT_POOL = 18;
const FEED_MAX = 3;
const FEED_MS = 5200;
/** Leaderboard row pitch (px). */
export const ROW_H = 54;
const BOARD_X = FIELD_X + FIELD_W + 20;
const BOARD_W = 1280 - BOARD_X - 24;

export class Hud {
  readonly state = signal<HudState>(INITIAL_HUD);
  readonly feed = signal<FeedLine[]>([]);
  private root: HTMLDivElement | null = null;
  private readonly floats: HTMLDivElement[] = [];
  private floatIdx = 0;
  private feedKey = 0;
  /** Stage px of world (0, 0). */
  readonly origin = { x: 0, y: 0 };

  readonly refs = {
    root: (el: HTMLDivElement | null) => {
      this.root = el;
      this.place();
    },
    float: (el: HTMLDivElement | null) => {
      if (el && !this.floats.includes(el)) this.floats.push(el);
    },
  };

  constructor(host: HTMLElement) {
    render(<HudView hud={this} />, host);
  }

  setState(s: HudState): void {
    this.state.value = s;
  }

  setOrigin(x: number, y: number): void {
    this.origin.x = x;
    this.origin.y = y;
    this.place();
  }

  private place(): void {
    if (!this.root) return;
    this.root.style.transform = `translate(${Math.round(this.origin.x)}px, ${Math.round(this.origin.y)}px)`;
  }

  setPaused(paused: boolean): void {
    this.root?.classList.toggle('wl-paused', paused);
  }

  pushFeed(text: string, color: string): void {
    const key = ++this.feedKey;
    this.feed.value = [...this.feed.value, { key, text, color }].slice(-FEED_MAX);
    window.setTimeout(() => {
      this.feed.value = this.feed.value.filter((l) => l.key !== key);
    }, FEED_MS);
  }

  /** A pop-up at world coordinates: '+6%' in the capturer's colour, 'Tumbang!' in red. */
  float(text: string, x: number, y: number, color: string, size = 30, rise = 46): void {
    const el = this.floats[this.floatIdx++ % FLOAT_POOL];
    if (!el) return;
    for (const a of el.getAnimations?.() ?? []) a.cancel();
    el.textContent = text;
    el.style.fontSize = `${size}px`;
    el.style.color = color;
    // Keep pop-ups inside the floor (the element is centred on its point).
    const half = el.offsetWidth / 2 + 8;
    const cx = Math.min(FIELD_X + FIELD_W - half, Math.max(FIELD_X + half, x));
    const cy = Math.min(FIELD_Y + FIELD_H - 20, Math.max(FIELD_Y + 30, y));
    el.style.left = `${Math.round(cx)}px`;
    el.style.top = `${Math.round(cy)}px`;
    const at = (dy: number, s: number) => `translate(-50%, -50%) translateY(${dy}px) scale(${s})`;
    el.animate(
      [
        { opacity: 0, transform: at(8, 0.5) },
        { opacity: 1, transform: at(0, 1.14), offset: 0.16 },
        { opacity: 1, transform: at(-rise * 0.6, 1), offset: 0.7 },
        { opacity: 0, transform: at(-rise, 0.96) },
      ],
      { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
  }
}

/* ------------------------------------------------------------------ components */

function HudView({ hud }: { hud: Hud }) {
  return (
    <div class="wl-hud" ref={hud.refs.root}>
      <Clock hud={hud} />
      <Board hud={hud} />
      <Feed hud={hud} />
      <Hint hud={hud} />
      <div class="wl-floats" aria-hidden="true">
        {Array.from({ length: FLOAT_POOL }, (_, i) => (
          <div key={i} class="wl-float display outline-text" ref={hud.refs.float} />
        ))}
      </div>
      <OverlayView hud={hud} />
    </div>
  );
}

function Clock({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  return (
    <div
      class={`wl-clock${s.live ? '' : ' wl-off'}${s.urgent ? ' urgent' : ''}`}
      style={{ left: FIELD_X + FIELD_W / 2 }}
      role="timer"
      aria-label={STR.clockLabel}
    >
      <Icon name="clock" size={24} stroke={2.6} />
      <span class="display">{s.timer}</span>
    </div>
  );
}

function Board({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  const rows = s.rows;
  // Stable DOM order (by id) so rows glide to their new place instead of re-mounting.
  const stable = [...rows].sort((a, b) => a.id - b.id);
  return (
    <div class={`wl-board${s.live ? '' : ' wl-off'}`} style={{ left: BOARD_X, top: FIELD_Y, width: BOARD_W }}>
      <div class="wl-board-head">
        <span>{STR.boardTitle}</span>
      </div>
      <div class="wl-rows" style={{ height: rows.length * ROW_H }}>
        {stable.map((r) => (
          <div
            key={r.id}
            class={`wl-row${r.alive ? '' : ' out'}${r.lead ? ' lead' : ''}`}
            style={{ transform: `translateY(${r.order * ROW_H}px)`, '--c': r.color }}
          >
            <div class="wl-rank display">{r.rank}</div>
            <Avatar fruit={r.fruit} ring={r.color} size={38} face={r.alive ? 'happy' : 'sad'} dim={r.away} />
            <div class="wl-row-main">
              <div class="wl-row-name">{r.name}</div>
              <div class="wl-row-sub">
                <div class="wl-bar">
                  <i style={{ width: `${Math.round(Math.max(0.03, r.share) * 100)}%` }} />
                </div>
                {r.alive || r.respawn === null ? (
                  <div class="wl-pct display">
                    {r.pct}
                    <small>%</small>
                  </div>
                ) : (
                  <div class="wl-respawn">{STR.respawnShort(r.respawn)}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Feed({ hud }: { hud: Hud }) {
  const lines = hud.feed.value;
  const live = hud.state.value.live;
  return (
    <div
      class={`wl-feed${live ? '' : ' wl-off'}`}
      style={{ left: BOARD_X, width: BOARD_W, top: FIELD_Y + FIELD_H }}
      aria-live="polite"
    >
      {lines.map((l) => (
        <div key={l.key} class="wl-feed-line" style={{ '--c': l.color }}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

function Hint({ hud }: { hud: Hud }) {
  const on = hud.state.value.hint;
  return (
    <div
      class={`wl-hint${on ? '' : ' wl-off'}`}
      style={{ left: FIELD_X + FIELD_W / 2, top: FIELD_Y + FIELD_H - 22 }}
      aria-hidden={!on}
    >
      {STR.hintStart}
    </div>
  );
}

function OverlayView({ hud }: { hud: Hud }) {
  const o = hud.state.value.overlay;
  const center = { left: FIELD_X + FIELD_W / 2, top: FIELD_Y + FIELD_H / 2 };
  switch (o.kind) {
    case 'none':
      return null;
    case 'count':
      return (
        <div class="wl-center" style={center} key={`c${o.value}`}>
          <div class="wl-count display outline-text">{o.value}</div>
          <div class="wl-count-label">{STR.countdownLabel}</div>
        </div>
      );
    case 'go':
      return (
        <div class="wl-center" style={center} key="go">
          <div class="wl-go display outline-text">{STR.go}</div>
        </div>
      );
    case 'warning':
      return (
        <div class="wl-center" style={center} key="warn">
          <div class="wl-warn display outline-text">{STR.warning}</div>
        </div>
      );
    case 'timeUp':
      return (
        <div class="wl-timeup" style={{ left: FIELD_X, top: FIELD_Y, width: FIELD_W, height: FIELD_H }}>
          <div class="wl-timeup-card">
            <div class="wl-timeup-eyebrow">{STR.timeUp}</div>
            {o.winners.length > 0 && (
              <div class="wl-winners">
                {o.winners.map((w) => (
                  <Avatar key={w.id} fruit={w.fruit} ring={w.color} size={104} />
                ))}
              </div>
            )}
            <div class="wl-timeup-title display">{o.title}</div>
            <div class="wl-timeup-sub">{o.sub}</div>
          </div>
        </div>
      );
  }
}
