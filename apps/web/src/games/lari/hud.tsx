/**
 * DOM HUD over the WebGL canvas (stage px): the intro card, countdown, timer, speed, the live
 * standings, a name tag over every runner, call-outs and the finish banner. Structure changes go
 * through signals a few times per second; the name tags move every frame through direct style
 * writes (`HudStore.placeTag`), so nothing re-renders at 60 fps.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { Avatar, Icon, type IconName } from '../../shared/ui';
import type { Mode } from './logic';
import { STR } from './strings';

export type HudPhase = 'intro' | 'count' | 'run' | 'finish';

export interface RunnerCard {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
}

export interface BoardRow {
  id: number;
  rank: number;
  value: string;
  coins: number;
  out: boolean;
  offline: boolean;
  hurt: boolean;
}

export interface Callout {
  key: number;
  text: string;
  tone: 'go' | 'info' | 'warn';
}

export interface Toast {
  key: number;
  text: string;
}

export interface FinishInfo {
  title: string;
  rows: { id: number; rank: number; value: string }[];
}

/** One person on the `?diag=1` panel: phone lag in ms (smoothed and last), null before input. */
export interface NetRow {
  id: number;
  name: string;
  avgMs: number | null;
  lastMs: number | null;
}

/** The `?diag=1` panel: lag per person, and how many phones are on a direct link. */
export interface NetDiag {
  rows: NetRow[];
  direct: number | null;
}

export class HudStore {
  readonly phase = signal<HudPhase>('intro');
  readonly mode = signal<Mode>('survive');
  readonly cards = signal<RunnerCard[]>([]);
  readonly count = signal(-1);
  readonly clockLabel = signal('');
  readonly clock = signal('');
  readonly urgent = signal(false);
  readonly alive = signal<string | null>(null);
  readonly speed = signal(0);
  readonly speedK = signal(0);
  readonly board = signal<BoardRow[]>([]);
  readonly callout = signal<Callout | null>(null);
  readonly toasts = signal<Toast[]>([]);
  readonly finish = signal<FinishInfo | null>(null);
  readonly help = signal(false);
  readonly paused = signal(false);
  /** Only with `?diag=1`. */
  readonly net = signal<NetDiag | null>(null);
  private readonly tags = new Map<number, HTMLElement>();
  private readonly tagState = new Map<number, string>();
  private key = 1;

  card(id: number): RunnerCard | undefined {
    return this.cards.value.find((c) => c.id === id);
  }

  registerTag(id: number, el: HTMLElement | null): void {
    if (el) this.tags.set(id, el);
    else this.tags.delete(id);
  }

  /** Move a name tag (stage px). `state`: '' | 'hurt' | 'out'. */
  placeTag(id: number, x: number, y: number, on: boolean, state: string): void {
    const el = this.tags.get(id);
    if (!el) return;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    el.style.opacity = on ? '1' : '0';
    if (this.tagState.get(id) !== state) {
      this.tagState.set(id, state);
      el.dataset.state = state;
    }
  }

  say(text: string, tone: Callout['tone'] = 'info'): void {
    this.callout.value = { key: this.key++, text, tone };
  }

  toast(text: string): void {
    const t = { key: this.key++, text };
    this.toasts.value = [...this.toasts.value.slice(-2), t];
    window.setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((x) => x.key !== t.key);
    }, 2600);
  }
}

const HOW: { icons: IconName[]; title: string; sub: string }[] = [
  { icons: ['left', 'right'], title: STR.howLane, sub: STR.howLaneSub },
  { icons: ['up'], title: STR.howJump, sub: STR.howJumpSub },
  { icons: ['down'], title: STR.howSlide, sub: STR.howSlideSub },
];

function Intro({ mode }: { mode: Mode }) {
  return (
    <div class="lr-intro">
      <div class="lr-intro-head">
        <div class="lr-intro-eyebrow">{STR.introEyebrow(mode)}</div>
        <div class="lr-intro-title display outline-text">{STR.gameTitle}</div>
        <div class="lr-intro-goal">{STR.introGoal(mode)}</div>
      </div>
      <div class="lr-how">
        {HOW.map((h) => (
          <div class="lr-how-item" key={h.title}>
            <div class="lr-how-icons">
              {h.icons.map((i) => (
                <span class="lr-how-key" key={i}>
                  <Icon name={i} size={26} stroke={3} />
                </span>
              ))}
            </div>
            <div class="lr-how-text">
              <b>{h.title}</b>
              <span>{h.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Board({ store }: { store: HudStore }) {
  const rows = store.board.value;
  const compact = rows.length > 6;
  const step = compact ? 38 : 46;
  return (
    <div class={`lr-board ${compact ? 'is-compact' : ''}`}>
      {rows.map((r) => {
        const c = store.card(r.id);
        if (!c) return null;
        return (
          <div
            class={`lr-row ${r.out ? 'is-out' : ''} ${r.hurt ? 'is-hurt' : ''} ${r.offline ? 'is-offline' : ''}`}
            key={r.id}
            style={{ '--c': c.color, transform: `translateY(${(r.rank - 1) * step}px)` }}
          >
            <span class="lr-row-rank">{r.rank}</span>
            <Avatar
              fruit={c.fruit}
              ring={c.color}
              size={compact ? 28 : 34}
              dim={r.out}
              face={r.hurt ? 'wow' : 'happy'}
            />
            <span class="lr-row-name" title={r.offline ? STR.offline : undefined}>
              {c.name}
            </span>
            <span class="lr-row-value">{r.out ? STR.outTag : r.value}</span>
            <span class="lr-row-coins">
              <i class="lr-coin" />
              {r.coins}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** `?diag=1` only: phone lag per person and the link type, to tell network lag from control feel. */
function NetPanel({ net }: { net: NetDiag }) {
  const people = net.rows.length;
  const link =
    net.direct === null
      ? STR.netLinkUnknown
      : net.direct <= 0
        ? STR.netLinkRelay
        : net.direct >= people
          ? STR.netLinkDirect
          : STR.netLinkMixed(net.direct, people);
  return (
    <div class="lr-net" aria-hidden="true">
      <div class="lr-net-title">{STR.netTitle}</div>
      <div class="lr-net-link">{link}</div>
      {net.rows.map((r) => (
        <div class="lr-net-row" key={r.id}>
          <span class="lr-net-name">{r.name}</span>
          <span class="lr-net-ms">
            {r.avgMs === null ? STR.netNoInput : STR.netMs(r.avgMs, r.lastMs ?? r.avgMs)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const phase = store.phase.value;
  const count = store.count.value;
  const callout = store.callout.value;
  const finish = store.finish.value;
  const cards = store.cards.value;
  const mode = store.mode.value;
  return (
    <div class={`lr-hud ${store.paused.value ? 'is-paused' : ''}`}>
      <div class="lr-tags">
        {cards.map((c) => (
          <div
            class="lr-tag"
            key={c.id}
            ref={(el) => store.registerTag(c.id, el)}
            style={{ '--c': c.color, opacity: 0 }}
          >
            <div class="lr-tag-pill">{c.name}</div>
            <div class="lr-tag-tip" />
          </div>
        ))}
      </div>

      {phase !== 'intro' && phase !== 'finish' && (
        <>
          <div class="lr-brand">
            <span class="lr-brand-name display">{STR.gameTitle}</span>
            <span class="lr-brand-mode">{STR.modes[mode].name}</span>
          </div>
          <div class={`lr-clock ${store.urgent.value ? 'is-urgent' : ''}`}>
            <span class="lr-clock-label">{store.clockLabel.value}</span>
            <span class="lr-clock-value display">{store.clock.value}</span>
            {store.alive.value && (
              <span class="lr-clock-alive">
                {STR.aliveLabel} <b>{store.alive.value}</b>
              </span>
            )}
          </div>
          <div class="lr-speed">
            <span class="lr-speed-label">{STR.speedLabel}</span>
            <span class="lr-speed-value display">
              {store.speed.value}
              <small>{STR.speedUnit}</small>
            </span>
            <span class="lr-speed-bar">
              <i style={{ width: `${Math.round(store.speedK.value * 100)}%` }} />
            </span>
          </div>
          <Board store={store} />
        </>
      )}

      {phase === 'intro' && <Intro mode={mode} />}

      {count >= 0 && (
        <div class="lr-count display outline-text" key={count}>
          {count === 0 ? STR.go : count}
        </div>
      )}

      {callout && count < 0 && (
        <div class={`lr-callout tone-${callout.tone} display outline-text`} key={callout.key}>
          {callout.text}
        </div>
      )}

      <div class="lr-toasts">
        {store.toasts.value.map((t) => (
          <div class="lr-toast" key={t.key}>
            {t.text}
          </div>
        ))}
      </div>

      {store.help.value && phase === 'run' && <div class="lr-help">{STR.swipeHelp}</div>}

      {store.net.value && <NetPanel net={store.net.value} />}

      {finish && (
        <div class="lr-finish">
          <div class="lr-finish-eyebrow display outline-text">{STR.finishTitle}</div>
          <div class="lr-finish-title display">{finish.title}</div>
          <div class="lr-finish-rows">
            {finish.rows.slice(0, 3).map((r) => {
              const c = store.card(r.id);
              if (!c) return null;
              return (
                <div class={`lr-finish-row rank-${r.rank}`} key={r.id} style={{ '--c': c.color }}>
                  <span class="lr-finish-rank display">{r.rank}</span>
                  <Avatar fruit={c.fruit} ring={c.color} size={44} face={r.rank === 1 ? 'happy' : 'effort'} />
                  <span class="lr-finish-name">{c.name}</span>
                  <span class="lr-finish-value">{r.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
