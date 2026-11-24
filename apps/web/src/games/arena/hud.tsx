/**
 * DOM/Preact HUD over the Phaser world: the leaderboard panel (timer, live ranking, kill feed),
 * centre overlays (intro, countdown, warnings, podium), name tags over the heads and floating
 * texts. Slow state goes through signals (~10 Hz); per-frame things (tags, floaters) are written
 * straight to pooled elements so Preact never re-renders at 60 fps.
 */
import type { Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { memo } from 'preact/compat';
import { Avatar, Icon } from '../../shared/ui';
import type { Rect } from './layout';
import { STR } from './strings';

export interface BoardRow {
  id: number;
  name: string;
  look: Look;
  color: string;
  len: number;
  kos: number;
  alive: boolean;
  /** Seconds until back on the field (knocked out), 0 otherwise. */
  back: number;
  leader: boolean;
  connected: boolean;
}

export interface PodiumPlace {
  id: number;
  name: string;
  look: Look;
  color: string;
  rank: number;
  len: number;
  kos: number;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'intro' }
  | { kind: 'count'; value: number }
  | { kind: 'go' }
  | { kind: 'warning' }
  | { kind: 'final'; value: number }
  | { kind: 'timeUp' }
  | { kind: 'podium'; title: string; sub: string; places: PodiumPlace[] };

export interface HudState {
  timer: string;
  urgent: boolean;
  rows: BoardRow[];
  overlay: Overlay;
  panel: Rect;
  arena: Rect;
}

export interface FeedLine {
  key: number;
  text: string;
  color: string;
  at: number;
}

export interface FloatStyle {
  size?: number;
  color?: string;
  rise?: number;
  duration?: number;
}

const ROW_H = 52;
const FLOAT_POOL = 24;
const TAG_POOL = 16;
const FEED_MAX = 3;

const INITIAL: HudState = {
  timer: '0:00',
  urgent: false,
  rows: [],
  overlay: { kind: 'none' },
  panel: { x: 1002, y: 22, w: 256, h: 676 },
  arena: { x: 40, y: 40, w: 940, h: 640 },
};

interface TagEl {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  crown: HTMLSpanElement;
  text: string;
  color: string;
  isLeader: boolean;
  on: boolean;
}

export class Hud {
  readonly state = signal<HudState>(INITIAL);
  readonly feed = signal<FeedLine[]>([]);
  private root: HTMLDivElement | null = null;
  private readonly floats: HTMLDivElement[] = [];
  private floatIdx = 0;
  private readonly tags: TagEl[] = [];
  private feedKey = 0;

  readonly refs = {
    root: (el: HTMLDivElement | null) => {
      this.root = el;
    },
    float: (el: HTMLDivElement | null) => {
      if (el && !this.floats.includes(el)) this.floats.push(el);
    },
    tag: (el: HTMLDivElement | null) => {
      if (!el || this.tags.some((t) => t.root === el)) return;
      const name = el.querySelector<HTMLSpanElement>('.ua-tag-name');
      const crown = el.querySelector<HTMLSpanElement>('.ua-tag-crown');
      if (!name || !crown) return;
      this.tags.push({ root: el, name, crown, text: '', color: '', isLeader: false, on: false });
    },
  };

  constructor(host: HTMLElement) {
    render(<HudView hud={this} />, host);
  }

  setState(s: HudState): void {
    this.state.value = s;
  }

  setPaused(paused: boolean): void {
    this.root?.classList.toggle('ua-paused', paused);
  }

  pushFeed(text: string, color: string, now: number): void {
    const next = [...this.feed.value, { key: this.feedKey++, text, color, at: now }];
    this.feed.value = next.slice(-FEED_MAX);
  }

  /** Drop feed lines older than `maxAge` ms. */
  pruneFeed(now: number, maxAge: number): void {
    const list = this.feed.value;
    if (list.length && now - list[0]!.at > maxAge) this.feed.value = list.filter((l) => now - l.at <= maxAge);
  }

  /** Name tag `i` over a head at stage (x, y); `on = false` hides it. */
  tag(i: number, on: boolean, x: number, y: number, name: string, color: string, leader: boolean): void {
    const t = this.tags[i];
    if (!t) return;
    if (!on) {
      if (t.on) {
        t.on = false;
        t.root.style.display = 'none';
      }
      return;
    }
    if (!t.on) {
      t.on = true;
      t.root.style.display = '';
    }
    if (t.text !== name) {
      t.text = name;
      t.name.textContent = name;
    }
    if (t.color !== color) {
      t.color = color;
      t.root.style.setProperty('--c', color);
    }
    if (t.isLeader !== leader) {
      t.isLeader = leader;
      t.crown.style.display = leader ? '' : 'none';
    }
    t.root.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  }

  /** Floating text at stage coordinates. */
  float(text: string, x: number, y: number, style: FloatStyle = {}): void {
    const el = this.floats[this.floatIdx++ % FLOAT_POOL];
    if (!el) return;
    for (const a of el.getAnimations?.() ?? []) a.cancel();
    el.textContent = text;
    el.style.fontSize = `${style.size ?? 26}px`;
    el.style.color = style.color ?? '#FFFFFF';
    // Keep the text inside the arena so a knock-out at the edge is still readable.
    const a = this.state.value.arena;
    const cx = Math.min(Math.max(x, a.x + 70), a.x + a.w - 70);
    const cy = Math.min(Math.max(y, a.y + 24), a.y + a.h - 24);
    el.style.left = `${Math.round(cx)}px`;
    el.style.top = `${Math.round(cy)}px`;
    const rise = style.rise ?? 40;
    const at = (dy: number, s: number) => `translate(-50%, -50%) translateY(${dy}px) scale(${s})`;
    el.animate(
      [
        { opacity: 0, transform: at(8, 0.6) },
        { opacity: 1, transform: at(0, 1.12), offset: 0.18 },
        { opacity: 1, transform: at(-rise * 0.6, 1), offset: 0.7 },
        { opacity: 0, transform: at(-rise, 0.95) },
      ],
      { duration: style.duration ?? 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
  }
}

/* ------------------------------------------------------------------ components */

function HudView({ hud }: { hud: Hud }) {
  return (
    <div class="ua-hud" ref={hud.refs.root}>
      <Tags hud={hud} />
      <Panel hud={hud} />
      <Floats hud={hud} />
      <OverlayView hud={hud} />
    </div>
  );
}

const Tags = memo(function Tags({ hud }: { hud: Hud }) {
  const items = [];
  for (let i = 0; i < TAG_POOL; i++)
    items.push(
      <div key={i} class="ua-tag" ref={hud.refs.tag} style={{ display: 'none' }} aria-hidden="true">
        <span class="ua-tag-crown" style={{ display: 'none' }}>
          <Icon name="crown" size={18} color="#FFC928" stroke={2.4} />
        </span>
        <span class="ua-tag-name" />
      </div>,
    );
  return <div class="ua-tags">{items}</div>;
});

const Floats = memo(function Floats({ hud }: { hud: Hud }) {
  const items = [];
  for (let i = 0; i < FLOAT_POOL; i++)
    items.push(<div key={i} class="ua-float display outline-text" ref={hud.refs.float} aria-hidden="true" />);
  return <div>{items}</div>;
});

function Panel({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  const p = s.panel;
  return (
    <div class="ua-panel" style={{ left: p.x, top: p.y, width: p.w, height: p.h }}>
      <div class="ua-brand">
        <span class="ua-brand-dot" />
        {STR.gameTitle}
      </div>
      <div class={`ua-clock${s.urgent ? ' urgent' : ''}`}>
        <div class="ua-clock-label">{STR.timeLabel}</div>
        <div class="ua-clock-time display">{s.timer}</div>
      </div>
      <div class="ua-board-title">{STR.boardTitle}</div>
      <div class="ua-rows" style={{ height: Math.max(1, s.rows.length) * ROW_H }}>
        {s.rows.map((r, i) => (
          <div
            key={r.id}
            class={`ua-row${r.alive ? '' : ' out'}${r.leader ? ' lead' : ''}`}
            style={{ transform: `translateY(${i * ROW_H}px)`, '--c': r.color }}
          >
            <div class="ua-rank">{i + 1}</div>
            <Avatar look={r.look} ring={r.color} size={36} face={r.alive ? 'happy' : 'sad'} />
            <div class="ua-row-main">
              <div class="ua-row-name">
                {r.leader && <Icon name="crown" size={14} color="#FFC928" stroke={2.6} />}
                <span>{r.name}</span>
              </div>
              <div class="ua-row-sub">
                {!r.connected
                  ? STR.disconnected
                  : r.alive
                    ? STR.koShort(r.kos)
                    : r.back > 0
                      ? STR.back(r.back)
                      : STR.out}
              </div>
            </div>
            <div class="ua-row-len display">{r.alive ? r.len : '-'}</div>
          </div>
        ))}
      </div>
      <Feed hud={hud} />
    </div>
  );
}

function Feed({ hud }: { hud: Hud }) {
  const lines = hud.feed.value;
  return (
    <div class="ua-feed" aria-live="polite">
      {lines.map((l) => (
        <div key={l.key} class="ua-feed-line" style={{ '--c': l.color }}>
          <i />
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

function OverlayView({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  const o = s.overlay;
  const a = s.arena;
  const box = { left: a.x, top: a.y, width: a.w, height: a.h };
  switch (o.kind) {
    case 'none':
      return null;
    case 'intro':
      return (
        <div class="ua-overlay ua-dim" style={box}>
          <div class="display outline-text ua-title">{STR.introTitle}</div>
          <div class="ua-tips">
            {STR.introTips.map((t, i) => (
              <div key={t} class="ua-tip" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                <Icon
                  name={i === 0 ? 'dpad' : i === 1 ? 'zap' : 'target'}
                  size={22}
                  color="#FFC928"
                  stroke={2.2}
                />
                {t}
              </div>
            ))}
          </div>
        </div>
      );
    case 'count':
      return (
        <div class="ua-overlay" style={box}>
          <div class="display outline-text ua-count" key={o.value}>
            {o.value}
          </div>
          <div class="ua-pill">{STR.ready}</div>
        </div>
      );
    case 'go':
      return (
        <div class="ua-overlay" style={box}>
          <div class="display outline-text ua-go">{STR.go}</div>
        </div>
      );
    case 'warning':
      return (
        <div class="ua-overlay ua-top" style={box}>
          <div class="display outline-text ua-warn">{STR.warning}</div>
        </div>
      );
    case 'final':
      return (
        <div class="ua-overlay" style={box}>
          <div class="display ua-final" key={o.value}>
            {o.value}
          </div>
        </div>
      );
    case 'timeUp':
      return (
        <div class="ua-overlay ua-dim" style={box}>
          <div class="display outline-text ua-timeup">{STR.timeUp}</div>
        </div>
      );
    case 'podium':
      return <Podium o={o} box={box} />;
  }
}

function Podium({
  o,
  box,
}: {
  o: Extract<Overlay, { kind: 'podium' }>;
  box: { left: number; top: number; width: number; height: number };
}) {
  // Second place on the left, the winner in the middle, third on the right.
  const order = [o.places[1], o.places[0], o.places[2]];
  const heights = [118, 160, 88];
  const sizes = [84, 104, 76];
  return (
    <div class="ua-overlay ua-dim ua-podium-wrap" style={box}>
      <div class="ua-eyebrow">{STR.podiumEyebrow}</div>
      <div class="display outline-text ua-champ">{o.title}</div>
      <div class="ua-pill">{o.sub}</div>
      <div class="ua-podium">
        {order.map((p, i) =>
          p ? (
            <div
              key={p.id}
              class="ua-step"
              style={{ '--c': p.color, animationDelay: `${0.2 + (2 - i) * 0.15}s` }}
            >
              <Avatar look={p.look} ring={p.color} size={sizes[i]!} face={p.rank === 1 ? 'happy' : 'wow'} />
              <div class="ua-step-name">{p.name}</div>
              <div class="ua-step-len">{p.len > 0 ? STR.podiumLength(p.len) : STR.podiumOut}</div>
              <div class="ua-block" style={{ height: heights[i] }}>
                <span class="display">{p.rank}</span>
              </div>
            </div>
          ) : (
            <div key={`empty-${i}`} class="ua-step ua-step-empty" />
          ),
        )}
      </div>
    </div>
  );
}
