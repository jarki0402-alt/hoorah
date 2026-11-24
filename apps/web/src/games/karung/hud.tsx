/**
 * DOM/Preact HUD over the Phaser world. Slow state goes through signals (~10 Hz); per-frame
 * things (ring sync, floaters) are written straight to elements through stable refs so Preact
 * never re-renders at 60 fps.
 */
import type { Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { memo } from 'preact/compat';
import { Avatar, Icon } from '../../shared/ui';
import type { TickerLine } from './commentary';
import { STR } from './strings';

export interface Plate {
  id: number;
  name: string;
  look: Look;
  color: string;
  connected: boolean;
  /** Live place, 0 = none yet. */
  place: number;
  streak: number;
  finished: boolean;
  stumble: boolean;
  /** Lane centre in stage px and the plate height. */
  x: number;
  y: number;
  h: number;
}

export interface BoardRow {
  id: number;
  name: string;
  look: Look;
  color: string;
  rank: number;
  racePlace: number | null;
  plus: number;
  total: number;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'waiting'; players: { id: number; look: Look; color: string }[] }
  | { kind: 'count'; value: number; label: string }
  | { kind: 'go' }
  | { kind: 'raceEnd'; title: string; sub: string; look: Look | null; color: string; photo: boolean }
  | { kind: 'standings'; eyebrow: string; rows: BoardRow[]; next: string }
  | { kind: 'matchEnd'; title: string; sub: string; winners: { id: number; look: Look; color: string }[] };

export interface HudState {
  /** Race HUD (top panel, ticker, plates) visible. */
  live: boolean;
  raceLabel: string;
  timer: string;
  /** Countdown pill after the first finisher, e.g. "8". */
  grace: string | null;
  prompt: boolean;
  hint: boolean;
  plates: Plate[];
  overlay: Overlay;
}

export interface FloatStyle {
  kind: 'plain' | 'super' | 'stumble' | 'chip';
  size?: number;
  color?: string;
  rotate?: number;
  rise?: number;
  duration?: number;
}

export const INITIAL_HUD: HudState = {
  live: false,
  raceLabel: '',
  timer: '0:00',
  grace: null,
  prompt: false,
  hint: false,
  plates: [],
  overlay: { kind: 'none' },
};

const FLOAT_POOL = 20;

export class Hud {
  readonly state = signal<HudState>(INITIAL_HUD);
  readonly ticker = signal<TickerLine | null>(null);
  private root: HTMLDivElement | null = null;
  private ring: HTMLDivElement | null = null;
  private guide: HTMLDivElement | null = null;
  private readonly floats: HTMLDivElement[] = [];
  private floatIdx = 0;
  /** Stage px of world (0, 0): non-zero when the stage is wider or taller than 1280x720. */
  readonly origin = { x: 0, y: 0 };

  /** Stable callback refs (never recreated, so Preact does not re-invoke them every render). */
  readonly refs = {
    root: (el: HTMLDivElement | null) => {
      this.root = el;
    },
    ring: (el: HTMLDivElement | null) => {
      this.ring = el;
    },
    guide: (el: HTMLDivElement | null) => {
      this.guide = el;
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

  setTicker(line: TickerLine | null): void {
    this.ticker.value = line;
  }

  /**
   * Align the CSS ring with the server-time beat: the yellow ring meets the white guide at 85 % of
   * its animation, which must be exactly on a beat.
   */
  syncRing(anchor: number, period: number, server: number): void {
    const elapsed = (((server - anchor + 0.15 * period) % period) + period) % period;
    for (const el of [this.ring, this.guide]) {
      if (!el) continue;
      el.style.animationName = 'none';
      void el.offsetWidth;
      el.style.animationName = '';
      el.style.animationDuration = `${period}ms`;
      el.style.animationDelay = `${-Math.round(elapsed)}ms`;
    }
  }

  flashRing(color: string): void {
    this.guide?.animate(
      [
        { borderColor: color, boxShadow: `0 0 0 0 ${color}` },
        { borderColor: '#FFFFFF', boxShadow: '0 0 0 22px rgba(255,255,255,0)' },
      ],
      { duration: 420, easing: 'ease-out' },
    );
  }

  setPaused(paused: boolean): void {
    this.root?.classList.toggle('kr-paused', paused);
  }

  /** Floating 'SUPER!' / 'GUBRAK!' / '#1' at world coordinates (shifted by `origin`). */
  float(text: string, x: number, y: number, style: FloatStyle): void {
    const el = this.floats[this.floatIdx++ % FLOAT_POOL];
    if (!el) return;
    for (const a of el.getAnimations?.() ?? []) a.cancel();
    el.className = style.kind === 'chip' ? 'kr-float kr-chip' : 'kr-float display outline-text';
    el.textContent = text;
    el.style.fontSize = style.kind === 'chip' ? '' : `${style.size ?? 30}px`;
    el.style.color = style.kind === 'chip' ? '' : (style.color ?? '#FFFFFF');
    el.style.setProperty('--stroke', style.kind === 'super' ? '7px' : '6px');
    el.style.left = `${Math.round(x + this.origin.x)}px`;
    el.style.top = `${Math.round(y + this.origin.y)}px`;
    const r = style.rotate ?? 0;
    const rise = style.rise ?? 50;
    const at = (dy: number, s: number) =>
      `translate(-50%, -50%) translateY(${dy}px) rotate(${r}deg) scale(${s})`;
    el.animate(
      [
        { opacity: 0, transform: at(10, 0.6) },
        { opacity: 1, transform: at(0, 1.12), offset: 0.18 },
        { opacity: 1, transform: at(-rise * 0.6, 1), offset: 0.72 },
        { opacity: 0, transform: at(-rise, 0.96) },
      ],
      { duration: style.duration ?? 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
  }
}

/* ------------------------------------------------------------------ components */

function HudView({ hud }: { hud: Hud }) {
  return (
    <div class="kr-hud" ref={hud.refs.root}>
      <Plates hud={hud} />
      <TopBar hud={hud} />
      <Prompt hud={hud} />
      <Ticker hud={hud} />
      <Floats hud={hud} />
      <OverlayView hud={hud} />
    </div>
  );
}

function TopBar({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  return (
    <div class={`kr-top${s.live ? '' : ' kr-off'}`}>
      <div class="kr-panel kr-clock">
        <div class="kr-race">{s.raceLabel}</div>
        <div class="kr-timer">{s.timer}</div>
      </div>
      {s.grace !== null && (
        <div class="kr-grace" key="grace">
          <Icon name="clock" size={16} color="#111214" stroke={2.4} />
          {s.grace}
        </div>
      )}
    </div>
  );
}

function Prompt({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  return (
    <div class={`kr-prompt${s.prompt ? '' : ' kr-gone'}`} aria-hidden={!s.prompt}>
      <div class="kr-ringbox">
        <div class="kr-guide" ref={hud.refs.guide} />
        <div class="kr-ring" ref={hud.refs.ring} />
        <div class="kr-dot" />
      </div>
      <div class="kr-prompt-col">
        <div class="display outline-text kr-prompt-label">{STR.promptLabel}</div>
        <div class="kr-hint" style={{ opacity: s.hint ? 1 : 0 }}>
          {STR.promptHint}
        </div>
      </div>
    </div>
  );
}

function Ticker({ hud }: { hud: Hud }) {
  const line = hud.ticker.value;
  const live = hud.state.value.live;
  if (!line || !live) return null;
  return (
    <div class="kr-ticker" key={line.key} aria-live="polite">
      <Icon name="mic" size={20} color="#FFC928" stroke={2} />
      <div class="kr-ticker-text">
        {line.bold && <b>{line.bold}</b>}
        {line.text}
      </div>
    </div>
  );
}

function Plates({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  if (s.plates.length === 0) return null;
  return (
    <div
      class={`kr-plates${s.overlay.kind === 'standings' || s.overlay.kind === 'matchEnd' ? ' kr-off' : ''}`}
    >
      {s.plates.map((p) => {
        const small = p.h < 52;
        return (
          <div
            key={p.id}
            class={`kr-plate${small ? ' small' : ''}${p.connected ? '' : ' dim'}`}
            style={{ left: p.x, top: p.y, height: p.h, '--c': p.color }}
          >
            <div class={`kr-place${p.place === 1 ? ' first' : ''}`}>{p.place > 0 ? p.place : '-'}</div>
            <Avatar look={p.look} ring={p.color} size={small ? Math.max(26, p.h - 10) : 40} />
            <div class="kr-plate-name">{p.connected ? p.name : STR.disconnected}</div>
            {p.stumble ? (
              <div class="kr-tag bad">!</div>
            ) : p.streak >= 2 ? (
              <div class="kr-tag">
                <Icon name="fire" size={12} color="#111214" />
                {p.streak}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Rendered once; the pool is driven imperatively by Hud.float. */
const Floats = memo(function Floats({ hud }: { hud: Hud }) {
  const items = [];
  for (let i = 0; i < FLOAT_POOL; i++)
    items.push(<div key={i} class="kr-float" ref={hud.refs.float} aria-hidden="true" />);
  return <div>{items}</div>;
});

function OverlayView({ hud }: { hud: Hud }) {
  const o = hud.state.value.overlay;
  switch (o.kind) {
    case 'none':
      return null;
    case 'waiting':
      return (
        <div class="kr-overlay kr-dim">
          <div class="kr-card" style={{ maxWidth: 640 }}>
            <div class="kr-eyebrow">{STR.gameTitle}</div>
            {o.players.length > 0 && (
              <div class="kr-avatars">
                {o.players.map((p) => (
                  <Avatar key={p.id} look={p.look} ring={p.color} size={64} />
                ))}
              </div>
            )}
            <div class="display kr-wait-title">{STR.waitingTitle}</div>
            <div class="kr-sub" style={{ textAlign: 'center' }}>
              {STR.waitingSubtitle}
            </div>
          </div>
        </div>
      );
    case 'count':
      return (
        <div class="kr-overlay kr-mid">
          <div class="kr-pill">{o.label}</div>
          <div class="display outline-text kr-count-num" key={o.value}>
            {o.value}
          </div>
          <div class="kr-pill" style={{ animationDelay: '0.1s' }}>
            {STR.ready}
          </div>
        </div>
      );
    case 'go':
      return (
        <div class="kr-overlay kr-mid">
          <div class="display outline-text kr-go">{STR.go}</div>
        </div>
      );
    case 'raceEnd':
      return (
        <div class="kr-overlay kr-high">
          {o.photo && <div class="kr-photo">{STR.photoFinish}</div>}
          <div class="kr-banner-row">
            {o.look && <Avatar look={o.look} ring={o.color} size={92} class="kr-pop" />}
            <div class="display outline-text kr-banner">{o.title}</div>
          </div>
          <div class="kr-pill">{o.sub}</div>
        </div>
      );
    case 'standings':
      return (
        <div class="kr-overlay kr-dim">
          <div class="kr-card kr-board">
            <div class="kr-eyebrow">{o.eyebrow}</div>
            <div class={`kr-rows${o.rows.length > 6 ? ' tight' : ''}`}>
              {o.rows.map((r, i) => (
                <div key={r.id} class="kr-row" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div class={`kr-rank${r.rank === 1 ? ' first' : ''}`}>{r.rank}</div>
                  <Avatar look={r.look} ring={r.color} size={o.rows.length > 6 ? 36 : 44} />
                  <div class="kr-row-name">{r.name}</div>
                  <div class="kr-row-race">
                    {r.racePlace !== null ? STR.boardPlace(r.racePlace) : ''}
                    {r.plus > 0 && <span class="kr-plus">{STR.boardPlus(r.plus)}</span>}
                  </div>
                  <div class="kr-row-total">{STR.boardPoints(r.total)}</div>
                </div>
              ))}
            </div>
            <div class="kr-sub">{o.next}</div>
            <div class="kr-progress">
              <i />
            </div>
          </div>
        </div>
      );
    case 'matchEnd':
      return (
        <div class="kr-overlay kr-champ kr-dim">
          <div class="kr-eyebrow">{STR.gameTitle}</div>
          <div class="display outline-text kr-champion">{o.title}</div>
          <div class="kr-pill">{o.sub}</div>
          <div class="kr-avatars" style={{ marginTop: 6 }}>
            {o.winners.map((w) => (
              <Avatar key={w.id} look={w.look} ring={w.color} size={96} />
            ))}
          </div>
        </div>
      );
  }
}
