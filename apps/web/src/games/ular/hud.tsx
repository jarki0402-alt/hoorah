/**
 * Main-screen DOM for Ular Tangga: the board (inline SVG), tokens, the turn panel with the dice,
 * the player list and the overlays (event card, duel, banners). Structure changes go through
 * signals; per-frame values (token positions, dice face, timers) are written straight to the DOM
 * by the driver, so nothing re-renders at 60 fps.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import { Avatar } from '../../shared/ui';
import { boardMarkup, diePips, FRAME, tokenMarkup } from './art';
import type { Board } from './board';
import { computeLayout, type Layout } from './layout';
import { type CardId, DUEL_BACK } from './logic';
import { CARD_TEXT, STR } from './strings';

export interface PlayerCard {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
}

export interface HudPlayer extends PlayerCard {
  pos: number;
  rank: number;
  active: boolean;
  offline: boolean;
  shield: boolean;
  skip: boolean;
}

export interface HudModel {
  size: number;
  round: number;
  maxRounds: number;
  lastRound: boolean;
  players: HudPlayer[];
  who: PlayerCard | null;
  extra: boolean;
  /** Label above the name (GILIRAN, JUARA...). */
  eyebrow: string;
  /** Shown instead of a name when nobody is up (waiting, a tie at the end). */
  empty: string;
  hint: string;
  /** Show the auto-roll timer ring. */
  timer: boolean;
}

export type Banner =
  | { kind: 'intro'; key: number; title: string; sub: string; first: string | null; rules: string }
  | { kind: 'last'; key: number; title: string; sub: string }
  | { kind: 'finale'; key: number; title: string; sub: string; winner: PlayerCard | null };

export interface CardModel {
  key: number;
  who: PlayerCard;
  id: CardId;
}

export interface DuelModel {
  key: number;
  a: PlayerCard;
  b: PlayerCard;
  tapsA: number;
  tapsB: number;
  stage: 'intro' | 'live' | 'result';
  winner: number | null;
}

export interface Shout {
  id: number;
  /** Board px. */
  x: number;
  y: number;
  text: string;
  sub: string;
  tone: 'good' | 'bad' | 'info';
  until: number;
}

export interface Bubble {
  id: number;
  who: PlayerCard;
  text: string;
  tone: 'cheer' | 'boo' | 'rematch';
  until: number;
}

const RING_R = 20;
const RING_LEN = 2 * Math.PI * RING_R;

export class HudStore {
  readonly layout = signal<Layout>(computeLayout(50, 1280, 720));
  readonly model = signal<HudModel>({
    size: 50,
    round: 0,
    maxRounds: 0,
    lastRound: false,
    players: [],
    who: null,
    extra: false,
    eyebrow: '',
    empty: '',
    hint: '',
    timer: false,
  });
  readonly banner = signal<Banner | null>(null);
  readonly card = signal<CardModel | null>(null);
  readonly duel = signal<DuelModel | null>(null);
  readonly shouts = signal<Shout[]>([]);
  readonly bubbles = signal<Bubble[]>([]);
  readonly paused = signal(false);

  readonly tokens = new Map<number, HTMLDivElement>();
  die: HTMLDivElement | null = null;
  pips: SVGGElement | null = null;
  ring: SVGCircleElement | null = null;
  ringText: HTMLSpanElement | null = null;
  duelBar: HTMLDivElement | null = null;
  duelCount: HTMLDivElement | null = null;

  private face = -1;
  private rolling: boolean | null = null;
  private ringFrac = -1;
  private ringSecs = -1;
  private duelFrac = -1;
  private duelText = '';

  constructor(readonly board: Board) {}

  /** face 0 = blank die ("?"). */
  setDie(face: number, rolling: boolean): void {
    if (this.pips && face !== this.face) {
      this.face = face;
      this.pips.innerHTML = face > 0 ? diePips(face) : '';
      this.die?.classList.toggle('is-blank', face === 0);
    }
    if (this.die && rolling !== this.rolling) {
      this.rolling = rolling;
      this.die.classList.toggle('is-rolling', rolling);
    }
  }

  setRing(frac: number, secs: number): void {
    const f = Math.round(frac * 200) / 200;
    if (this.ring && f !== this.ringFrac) {
      this.ringFrac = f;
      this.ring.style.strokeDashoffset = String(RING_LEN * (1 - f));
    }
    if (this.ringText && secs !== this.ringSecs) {
      this.ringSecs = secs;
      this.ringText.textContent = String(secs);
      this.ringText.parentElement?.classList.toggle('is-urgent', secs <= 3);
    }
  }

  setDuelClock(frac: number, text: string): void {
    const f = Math.round(frac * 400) / 400;
    if (this.duelBar && f !== this.duelFrac) {
      this.duelFrac = f;
      this.duelBar.style.transform = `scaleX(${f})`;
    }
    if (this.duelCount && text !== this.duelText) {
      this.duelText = text;
      this.duelCount.textContent = text;
    }
  }

  /** Forget cached DOM values after a remount. */
  resetFrame(): void {
    this.face = -1;
    this.rolling = null;
    this.ringFrac = -1;
    this.ringSecs = -1;
    this.duelFrac = -1;
    this.duelText = '';
  }

  addShout(s: Shout): void {
    this.shouts.value = [...this.shouts.value.slice(-3), s];
  }

  addBubble(b: Bubble): void {
    this.bubbles.value = [...this.bubbles.value.slice(-5), b];
  }

  expire(now: number): void {
    if (this.shouts.value.some((s) => s.until <= now))
      this.shouts.value = this.shouts.value.filter((s) => s.until > now);
    if (this.bubbles.value.some((b) => b.until <= now))
      this.bubbles.value = this.bubbles.value.filter((b) => b.until > now);
  }
}

/* ------------------------------------------------------------------ pieces */

function BoardArt({ board, cell }: { board: Board; cell: number }) {
  const markup = useMemo(() => boardMarkup(board, cell), [board, cell]);
  const w = cell * board.cols + 2 * FRAME;
  const h = cell * board.rows + 2 * FRAME;
  return (
    <svg
      class="ul-board-art"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function Tokens({ store, cell }: { store: HudStore; cell: number }) {
  const players = store.model.value.players;
  const size = Math.round(cell * 0.66);
  return (
    <div class="ul-tokens">
      {players.map((p) => (
        <div
          key={p.id}
          class="ul-token"
          style={{ width: size, height: size }}
          ref={(el) => {
            if (el) store.tokens.set(p.id, el);
            else store.tokens.delete(p.id);
          }}
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: tokenMarkup(p.fruit, p.color) }}
          />
        </div>
      ))}
    </div>
  );
}

function Shouts({ store }: { store: HudStore }) {
  return (
    <div class="ul-shouts">
      {store.shouts.value.map((s) => (
        <div key={s.id} class={`ul-shout is-${s.tone}`} style={{ left: s.x, top: s.y }}>
          <div class="display outline-text ul-shout-text">{s.text}</div>
          {s.sub && <div class="ul-shout-sub">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function CardOverlay({ store }: { store: HudStore }) {
  const c = store.card.value;
  if (!c) return null;
  const t = CARD_TEXT[c.id];
  return (
    <div class="ul-overlay">
      <div key={c.key} class={`ul-card ${t.good ? 'is-good' : 'is-bad'}`}>
        <div class="ul-card-eyebrow">{STR.cardEyebrow}</div>
        <div class="ul-card-who">
          <Avatar fruit={c.who.fruit} ring={c.who.color} size={40} />
          <span>{c.who.name}</span>
        </div>
        <div class="display ul-card-title">{t.title}</div>
        <div class="ul-card-text">{t.text}</div>
        <div class="display ul-card-effect">{t.effect}</div>
      </div>
    </div>
  );
}

function DuelSide({ p, taps, state }: { p: PlayerCard; taps: number; state: 'win' | 'lose' | '' }) {
  return (
    <div class={`ul-duel-side ${state ? `is-${state}` : ''}`}>
      <Avatar
        fruit={p.fruit}
        ring={p.color}
        size={104}
        face={state === 'win' ? 'wow' : state === 'lose' ? 'sad' : 'effort'}
      />
      <div class="ul-duel-name">{p.name}</div>
      <div class="display ul-duel-taps">{taps}</div>
    </div>
  );
}

function DuelOverlay({ store }: { store: HudStore }) {
  const d = store.duel.value;
  if (!d) return null;
  const done = d.stage === 'result';
  const sa = done && d.winner !== null ? (d.winner === d.a.id ? 'win' : 'lose') : '';
  const sb = done && d.winner !== null ? (d.winner === d.b.id ? 'win' : 'lose') : '';
  const total = Math.max(1, d.tapsA + d.tapsB);
  const winner = d.winner === d.a.id ? d.a : d.winner === d.b.id ? d.b : null;
  return (
    <div class="ul-overlay">
      <div key={d.key} class={`ul-duel is-${d.stage}`}>
        <div class="display outline-text ul-duel-title">{STR.duelTitle}</div>
        <div class="ul-duel-row">
          <DuelSide p={d.a} taps={d.tapsA} state={sa} />
          <div
            class="display ul-duel-mid"
            ref={(el) => {
              store.duelCount = el;
              store.resetFrame();
            }}
          >
            VS
          </div>
          <DuelSide p={d.b} taps={d.tapsB} state={sb} />
        </div>
        <div class="ul-duel-tug">
          <i style={{ width: `${(d.tapsA / total) * 100}%`, background: d.a.color }} />
          <i style={{ width: `${(d.tapsB / total) * 100}%`, background: d.b.color }} />
        </div>
        <div class="ul-duel-clock">
          <div
            class="ul-duel-clock-fill"
            ref={(el) => {
              store.duelBar = el;
              store.resetFrame();
            }}
          />
        </div>
        <div class="ul-duel-sub">
          {done
            ? winner
              ? STR.duelWin(winner.name)
              : STR.duelTie
            : `${STR.duelSub} ${STR.duelLoserBack(DUEL_BACK)}.`}
        </div>
      </div>
    </div>
  );
}

function TurnPanel({ store }: { store: HudStore }) {
  const m = store.model.value;
  const L = store.layout.value;
  const r = L.turn;
  const who = m.who;
  return (
    <div class={`ul-turn is-${L.mode}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
      <div class="ul-brand">
        <div class="display outline-text ul-logo">{STR.logo}</div>
        <div class="ul-chips">
          <span>{STR.boardLabel(m.size)}</span>
          {m.round > 0 && (
            <span class={m.lastRound ? 'is-last' : ''}>
              {m.lastRound ? STR.lastRound : STR.round(m.round, m.maxRounds)}
            </span>
          )}
        </div>
      </div>
      <div class="ul-who">
        <div class="ul-eyebrow">{m.eyebrow}</div>
        {who ? (
          <div class="ul-who-row" key={who.id}>
            <Avatar fruit={who.fruit} ring={who.color} size={L.mode === 'side' ? 72 : 64} face="effort" />
            <div class="display ul-who-name">{who.name}</div>
          </div>
        ) : (
          <div class="ul-who-row">
            <div class="display ul-who-name">{m.empty}</div>
          </div>
        )}
        <div class="ul-hint">{m.hint}</div>
      </div>
      <div class="ul-dice-box">
        <div
          class="ul-die is-blank"
          ref={(el) => {
            store.die = el;
            store.resetFrame();
          }}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <rect
              x="4"
              y="4"
              width="92"
              height="92"
              rx="20"
              fill="#FFFFFF"
              stroke="#111214"
              stroke-width="5"
            />
            <text x="50" y="68" text-anchor="middle" class="ul-die-q">
              ?
            </text>
            <g
              fill="#E2543A"
              ref={(el) => {
                store.pips = el;
                store.resetFrame();
              }}
            />
          </svg>
        </div>
        <div class={`ul-timer ${m.timer ? '' : 'is-hidden'}`}>
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r={RING_R} class="ul-timer-track" />
            <circle
              cx="24"
              cy="24"
              r={RING_R}
              class="ul-timer-arc"
              style={{ strokeDasharray: RING_LEN }}
              ref={(el) => {
                store.ring = el;
                store.resetFrame();
              }}
            />
          </svg>
          <span
            ref={(el) => {
              store.ringText = el;
              store.resetFrame();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PlayersPanel({ store }: { store: HudStore }) {
  const m = store.model.value;
  const r = store.layout.value.players;
  const n = Math.max(4, m.players.length);
  const rowH = Math.min(104, Math.floor((r.h - (n - 1) * 10) / n));
  const compact = rowH < 84;
  return (
    <div
      class={`ul-players ${compact ? 'is-compact' : ''}`}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
    >
      {m.players.map((p) => (
        <div
          key={p.id}
          class={`ul-prow ${p.active ? 'is-active' : ''} ${p.offline ? 'is-offline' : ''}`}
          style={{ height: rowH, ['--pc' as string]: p.color }}
        >
          <span class={`ul-rank r${p.rank}`}>{p.rank}</span>
          <Avatar
            fruit={p.fruit}
            ring={p.color}
            size={compact ? 42 : 50}
            face={p.active ? 'effort' : 'happy'}
          />
          <div class="ul-pinfo">
            <div class="ul-pname">{p.name}</div>
            <div class="ul-psub">
              <span>{p.offline ? STR.offline : p.pos === m.size ? STR.finishSquare : STR.square(p.pos)}</span>
              {p.shield && <span class="ul-badge is-shield">{STR.badgeShield}</span>}
              {p.skip && <span class="ul-badge is-skip">{STR.badgeSkip}</span>}
            </div>
            <div class="ul-pbar">
              <i style={{ width: `${Math.round((p.pos / m.size) * 100)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Bubbles({ store }: { store: HudStore }) {
  const L = store.layout.value;
  const m = store.model.value;
  const n = Math.max(4, m.players.length);
  const rowH = Math.min(104, Math.floor((L.players.h - (n - 1) * 10) / n));
  return (
    <>
      {store.bubbles.value.map((b) => {
        const i = Math.max(
          0,
          m.players.findIndex((p) => p.id === b.who.id),
        );
        return (
          <div
            key={b.id}
            class={`ul-bubble is-${b.tone}`}
            style={{ left: L.players.x - 14, top: L.players.y + i * (rowH + 10) + rowH / 2 }}
          >
            {b.text}
          </div>
        );
      })}
    </>
  );
}

function BannerView({ store }: { store: HudStore }) {
  const b = store.banner.value;
  if (!b) return null;
  if (b.kind === 'last') {
    return (
      <div class="ul-banner is-last" key={b.key}>
        <div class="display outline-text ul-banner-title">{b.title}</div>
        <div class="ul-banner-sub">{b.sub}</div>
      </div>
    );
  }
  return (
    <div class="ul-banner-wrap">
      <div class={`ul-banner is-${b.kind}`} key={b.key}>
        {b.kind === 'finale' && b.winner && (
          <Avatar
            fruit={b.winner.fruit}
            ring={b.winner.color}
            size={140}
            face="wow"
            class="ul-banner-avatar"
          />
        )}
        <div class="display outline-text ul-banner-title">{b.title}</div>
        <div class="ul-banner-sub">{b.sub}</div>
        {b.kind === 'intro' && b.first && <div class="ul-banner-first">{b.first}</div>}
        {b.kind === 'intro' && <div class="ul-banner-rules">{b.rules}</div>}
      </div>
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const L = store.layout.value;
  const b = L.board;
  return (
    <div class={`ul-hud ${store.paused.value ? 'is-paused' : ''}`}>
      <div class="ul-board" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
        <BoardArt board={store.board} cell={L.cell} />
        <Tokens store={store} cell={L.cell} />
        <Shouts store={store} />
        <CardOverlay store={store} />
        <DuelOverlay store={store} />
      </div>
      <TurnPanel store={store} />
      <PlayersPanel store={store} />
      <Bubbles store={store} />
      <BannerView store={store} />
    </div>
  );
}
