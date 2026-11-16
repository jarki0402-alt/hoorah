/**
 * DOM/Preact HUD over the Phaser world, styled after design/Tarik-TV.dc.html. Slow state goes
 * through signals (~10 Hz); per-frame things (rope bar, ring sync, floaters) are written
 * straight to elements through stable refs so Preact never re-renders at 60 fps.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { memo } from 'preact/compat';
import { Avatar, Icon } from '../../shared/ui';
import type { TickerLine } from './commentary';
import type { Team } from './logic';
import { STR } from './strings';
import { TEAM_COLOR } from './views';

export interface HudMember {
  id: number;
  name: string;
  fruit: Fruit;
  connected: boolean;
}

export interface TeamHud {
  team: Team;
  members: HudMember[];
  wins: number;
  rate: string;
  /** Filled meter segments, 0..10. */
  segments: number;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'waiting'; players: HudMember[] }
  | { kind: 'count'; value: number; round: string }
  | { kind: 'go' }
  | { kind: 'roundEnd'; winner: Team | null; reason: string }
  | { kind: 'scoreboard'; round: number; history: (Team | null)[]; next: string }
  | { kind: 'matchEnd'; winner: Team; score: string };

export interface HudState {
  /** Broadcast HUD (top bar, ticker, rope bar) visible. */
  live: boolean;
  roundLabel: string;
  suddenDeath: boolean;
  timer: string;
  urgent: boolean;
  winsNeeded: number;
  red: TeamHud;
  blue: TeamHud;
  prompt: boolean;
  hint: boolean;
  lead: string;
  overlay: Overlay;
}

export interface FloatStyle {
  kind: 'plus' | 'super' | 'combo';
  size?: number;
  color?: string;
  rotate?: number;
  rise?: number;
  duration?: number;
}

const emptyTeam = (team: Team): TeamHud => ({ team, members: [], wins: 0, rate: '0,0', segments: 0 });

export const INITIAL_HUD: HudState = {
  live: false,
  roundLabel: '',
  suddenDeath: false,
  timer: '0:45',
  urgent: false,
  winsNeeded: 2,
  red: emptyTeam('red'),
  blue: emptyTeam('blue'),
  prompt: false,
  hint: false,
  lead: STR.even,
  overlay: { kind: 'none' },
};

const FLOAT_POOL = 18;
const ACCENT: Record<Team, string> = { red: '#FF8A84', blue: '#8CC4FF' };
const STAR = 'M12 2 L14.9 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2 9.3 L9.1 8.6 Z';

export class Hud {
  readonly state = signal<HudState>(INITIAL_HUD);
  readonly ticker = signal<TickerLine | null>(null);
  private root: HTMLDivElement | null = null;
  private fill: HTMLDivElement | null = null;
  private marker: HTMLDivElement | null = null;
  private ring: HTMLDivElement | null = null;
  private guide: HTMLDivElement | null = null;
  private readonly floats: HTMLDivElement[] = [];
  private floatIdx = 0;
  private ropePct = Number.NaN;
  /** Stage px of world (0, 0): non-zero when the stage is wider or taller than 1280x720. */
  readonly origin = { x: 0, y: 0 };

  /** Stable callback refs (never recreated, so Preact does not re-invoke them every render). */
  readonly refs = {
    root: (el: HTMLDivElement | null) => {
      this.root = el;
    },
    fill: (el: HTMLDivElement | null) => {
      this.fill = el;
    },
    marker: (el: HTMLDivElement | null) => {
      this.marker = el;
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

  /** Rope bar in design semantics: red fills from the left as Merah gains ground. */
  setRope(p: number): void {
    const pct = Math.round((50 - p * 50) * 5) / 5;
    if (pct === this.ropePct || !this.fill || !this.marker) return;
    this.ropePct = pct;
    this.fill.style.width = `${pct}%`;
    this.marker.style.left = `${pct}%`;
  }

  /**
   * Align the CSS ring with the server-time ring: the yellow ring meets the white guide at 85 % of
   * its animation, which must be exactly the end of a ring cycle.
   */
  syncRing(ringStart: number, period: number, server: number): void {
    const elapsed = (((server - ringStart + 0.15 * period) % period) + period) % period;
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
        { borderColor: '#FFFFFF', boxShadow: '0 0 0 26px rgba(255,255,255,0)' },
      ],
      { duration: 480, easing: 'ease-out' },
    );
  }

  setPaused(paused: boolean): void {
    this.root?.classList.toggle('tk-paused', paused);
  }

  /** Floating '+3' / 'SUPER!' / 'KOMBO x4' at world coordinates (shifted by `origin`). */
  float(text: string, x: number, y: number, style: FloatStyle): void {
    const el = this.floats[this.floatIdx++ % FLOAT_POOL];
    if (!el) return;
    for (const a of el.getAnimations?.() ?? []) a.cancel();
    el.className = style.kind === 'combo' ? 'tk-float tk-chip' : 'tk-float display outline-text';
    el.textContent = text;
    el.style.fontSize = style.kind === 'combo' ? '' : `${style.size ?? 36}px`;
    el.style.color = style.kind === 'combo' ? '' : (style.color ?? '#FFFFFF');
    el.style.setProperty('--stroke', style.kind === 'super' ? '7px' : '6px');
    el.style.left = `${Math.round(x + this.origin.x)}px`;
    el.style.top = `${Math.round(y + this.origin.y)}px`;
    const r = style.rotate ?? 0;
    const rise = style.rise ?? 70;
    const at = (dy: number, s: number) =>
      `translate(-50%, -50%) translateY(${dy}px) rotate(${r}deg) scale(${s})`;
    el.animate(
      [
        { opacity: 0, transform: at(12, 0.6) },
        { opacity: 1, transform: at(0, 1.12), offset: 0.18 },
        { opacity: 1, transform: at(-rise * 0.6, 1), offset: 0.72 },
        { opacity: 0, transform: at(-rise, 0.96) },
      ],
      { duration: style.duration ?? 950, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
  }
}

/* ------------------------------------------------------------------ components */

function HudView({ hud }: { hud: Hud }) {
  return (
    <div class="tk-hud" ref={hud.refs.root}>
      <TopBar hud={hud} />
      <Prompt hud={hud} />
      <Ticker hud={hud} />
      <RopeBar hud={hud} />
      <Floats hud={hud} />
      <OverlayView hud={hud} />
    </div>
  );
}

function Star({ on, size = 16 }: { on: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      class={on ? 'tk-star-won' : undefined}
    >
      <path
        d={STAR}
        fill={on ? '#FFC928' : 'none'}
        stroke={on ? '#111214' : '#5B5E66'}
        stroke-width={on ? 1.2 : 2}
      />
    </svg>
  );
}

function Stars({ wins, total, size }: { wins: number; total: number; size?: number }) {
  const stars = [];
  for (let i = 0; i < total; i++) stars.push(<Star key={i} on={i < wins} size={size} />);
  return (
    <div class="tk-stars" role="img" aria-label={STR.starAria(wins)}>
      {stars}
    </div>
  );
}

function shownMembers(t: TeamHud): HudMember[] {
  const connected = t.members.filter((m) => m.connected);
  return connected.length ? connected : t.members;
}

function teamNames(t: TeamHud): string {
  const list = shownMembers(t);
  if (list.length === 0) return STR.noMembers;
  if (list.length <= 2) return list.map((m) => m.name).join(', ');
  return `${list[0]!.name}, ${list[1]!.name} ${STR.moreMembers(list.length - 2)}`;
}

function Avatars({ t }: { t: TeamHud }) {
  const list = shownMembers(t).slice(0, 3);
  const ring = TEAM_COLOR[t.team];
  const items = t.team === 'blue' ? [...list].reverse() : list;
  return (
    <div class="tk-avatars">
      {items.map((m) => (
        <Avatar key={m.id} fruit={m.fruit} ring={ring} size={m === list[0] ? 46 : 34} dim={!m.connected} />
      ))}
    </div>
  );
}

function Meter({ t }: { t: TeamHud }) {
  const color = TEAM_COLOR[t.team];
  const segs = [];
  for (let i = 0; i < 10; i++) {
    const lit = t.team === 'red' ? i < t.segments : 9 - i < t.segments;
    segs.push(<div key={i} class="tk-seg" style={lit ? { backgroundColor: color } : undefined} />);
  }
  return <div class="tk-meter">{segs}</div>;
}

function Rate({ t }: { t: TeamHud }) {
  return (
    <div class="tk-rate">
      {t.rate}
      <span>{STR.perSecond}</span>
    </div>
  );
}

function TeamPanel({ t, winsNeeded }: { t: TeamHud; winsNeeded: number }) {
  const names = teamNames(t);
  const empty = shownMembers(t).length === 0;
  if (t.team === 'red') {
    return (
      <div class="tk-panel tk-team red">
        <Avatars t={t} />
        <div class="tk-team-col">
          <div class="tk-row">
            <div class="tk-team-label">{STR.teamUpper('red')}</div>
            <div class={`tk-names${empty ? ' dim' : ''}`}>{names}</div>
            <div style={{ marginLeft: 'auto' }}>
              <Stars wins={t.wins} total={winsNeeded} />
            </div>
          </div>
          <div class="tk-row">
            <Meter t={t} />
            <Rate t={t} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="tk-panel tk-team blue">
      <div class="tk-team-col">
        <div class="tk-row">
          <Stars wins={t.wins} total={winsNeeded} />
          <div class={`tk-names${empty ? ' dim' : ''}`} style={{ marginLeft: 'auto' }}>
            {names}
          </div>
          <div class="tk-team-label">{STR.teamUpper('blue')}</div>
        </div>
        <div class="tk-row">
          <Rate t={t} />
          <Meter t={t} />
        </div>
      </div>
      <Avatars t={t} />
    </div>
  );
}

function TopBar({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  return (
    <div class={`tk-top${s.live ? '' : ' tk-off'}`}>
      <TeamPanel t={s.red} winsNeeded={s.winsNeeded} />
      <div class="tk-panel tk-center">
        <div class={`tk-round${s.suddenDeath ? ' sd' : ''}`}>
          {s.suddenDeath ? STR.suddenDeath : s.roundLabel}
        </div>
        <div class={`tk-timer${s.urgent ? ' urgent' : ''}`}>{s.timer}</div>
      </div>
      <TeamPanel t={s.blue} winsNeeded={s.winsNeeded} />
    </div>
  );
}

function Prompt({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  return (
    <div class={`tk-prompt${s.prompt ? '' : ' tk-gone'}`} aria-hidden={!s.prompt}>
      <div class="tk-ringbox">
        <div class="tk-guide" ref={hud.refs.guide} />
        <div class="tk-ring" ref={hud.refs.ring} />
        <div class="tk-dot" />
      </div>
      <div class="display outline-text tk-prompt-label">{STR.superPrompt}</div>
      <div class="tk-hint" style={{ opacity: s.hint ? 1 : 0 }}>
        {STR.superHint}
      </div>
    </div>
  );
}

function Ticker({ hud }: { hud: Hud }) {
  const line = hud.ticker.value;
  const live = hud.state.value.live;
  if (!line || !live) return null;
  return (
    <div class="tk-ticker" key={line.key} aria-live="polite">
      <Icon name="mic" size={20} color="#FFC928" stroke={2} />
      <div class="tk-ticker-text">
        {line.bold && <b>{line.bold}</b>}
        {line.text}
      </div>
    </div>
  );
}

function RopeBar({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  return (
    <div class="tk-ropebar" style={{ opacity: s.live ? 1 : 0 }}>
      <div class="tk-ropebar-labels">
        <span style={{ color: ACCENT.red }}>{STR.lineRed}</span>
        <span style={{ color: '#DADCE0' }}>{s.lead}</span>
        <span style={{ color: ACCENT.blue }}>{STR.lineBlue}</span>
      </div>
      <div class="tk-ropebar-bar" role="img" aria-label={STR.ropeAria(s.lead)}>
        <div class="tk-ropebar-fill" ref={hud.refs.fill} />
        <div class="tk-ropebar-mid" />
      </div>
      <div class="tk-ropebar-anchor">
        <div class="tk-ropebar-marker" ref={hud.refs.marker} />
      </div>
    </div>
  );
}

/** Rendered once; the pool is driven imperatively by Hud.float. */
const Floats = memo(function Floats({ hud }: { hud: Hud }) {
  const items = [];
  for (let i = 0; i < FLOAT_POOL; i++)
    items.push(<div key={i} class="tk-float" ref={hud.refs.float} aria-hidden="true" />);
  return <div>{items}</div>;
});

function BoardTeam({ t, need }: { t: TeamHud; need: number }) {
  const list = shownMembers(t).slice(0, 4);
  return (
    <div class="tk-board-team">
      <div class="tk-avatars">
        {list.map((m, i) => (
          <Avatar key={m.id} fruit={m.fruit} ring={TEAM_COLOR[t.team]} size={i === 0 ? 72 : 52} />
        ))}
      </div>
      <div class="tk-board-label" style={{ color: ACCENT[t.team] }}>
        {STR.teamUpper(t.team)}
      </div>
      <Stars wins={t.wins} total={need} size={26} />
    </div>
  );
}

function OverlayView({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  const o = s.overlay;
  switch (o.kind) {
    case 'none':
      return null;
    case 'waiting':
      return (
        <div class="tk-overlay tk-dim">
          <div class="tk-card" style={{ maxWidth: 640 }}>
            <div class="tk-eyebrow">{STR.gameTitle}</div>
            {o.players.length > 0 && (
              <div class="tk-avatars">
                {o.players.map((m, i) => (
                  <Avatar
                    key={m.id}
                    fruit={m.fruit}
                    ring={i % 2 ? TEAM_COLOR.blue : TEAM_COLOR.red}
                    size={64}
                  />
                ))}
              </div>
            )}
            <div class="display tk-wait-title">{STR.waitingTitle}</div>
            <div class="tk-sub" style={{ textAlign: 'center' }}>
              {STR.waitingSubtitle}
            </div>
          </div>
        </div>
      );
    case 'count':
      return (
        <div class="tk-overlay">
          <div class="tk-pill">{o.round}</div>
          <div class="display outline-text tk-count-num" key={o.value}>
            {o.value}
          </div>
          <div class="tk-pill" style={{ animationDelay: '0.1s' }}>
            {STR.getReady}
          </div>
        </div>
      );
    case 'go':
      return (
        <div class="tk-overlay">
          <div class="display outline-text tk-go">{STR.go}</div>
        </div>
      );
    case 'roundEnd':
      return (
        <div class="tk-overlay tk-high">
          <div
            class="display outline-text tk-banner"
            style={{ color: o.winner ? TEAM_COLOR[o.winner] : '#FFC928' }}
          >
            {o.winner ? STR.roundWin(o.winner) : STR.roundDraw}
          </div>
          <div class="tk-pill">{o.reason}</div>
        </div>
      );
    case 'scoreboard':
      return (
        <div class="tk-overlay tk-dim">
          <div class="tk-card">
            <div class="tk-eyebrow">{STR.boardEyebrow(o.round)}</div>
            <div class="tk-board">
              <BoardTeam t={s.red} need={s.winsNeeded} />
              <div class="display outline-text tk-board-score">{STR.score(s.red.wins, s.blue.wins)}</div>
              <BoardTeam t={s.blue} need={s.winsNeeded} />
            </div>
            <div class="tk-board-rounds">
              {o.history.map((w, i) => (
                <div
                  key={i}
                  class="tk-board-round"
                  style={w ? { backgroundColor: TEAM_COLOR[w], color: '#111214' } : undefined}
                >
                  {STR.boardRound(i + 1)}
                </div>
              ))}
            </div>
            <div class="tk-sub">{o.next}</div>
            <div class="tk-progress">
              <i />
            </div>
          </div>
        </div>
      );
    case 'matchEnd': {
      const team = o.winner === 'red' ? s.red : s.blue;
      return (
        <div class="tk-overlay tk-high">
          <div class="tk-eyebrow" style={{ color: '#FFF7F0' }}>
            {STR.gameTitle}
          </div>
          <div class="display outline-text tk-champion">{STR.champion(o.winner)}</div>
          <div class="tk-pill">{o.score}</div>
          <div class="tk-avatars" style={{ marginTop: 6 }}>
            {shownMembers(team)
              .slice(0, 4)
              .map((m) => (
                <Avatar key={m.id} fruit={m.fruit} ring={TEAM_COLOR[o.winner]} size={84} />
              ))}
          </div>
        </div>
      );
    }
  }
}
