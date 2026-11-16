/**
 * Main-screen view for Congklak: Preact + SVG, no canvas. The wooden board is one static SVG;
 * seed piles are `<use>` elements that only re-render when their count changes, and the hand
 * that carries seeds is a DOM node moved with CSS transitions, so a weak Smart TV only paints a
 * few small things per step.
 */
import type { Fruit } from '@hoorah/protocol';
import { type Signal, signal } from '@preact/signals';
import { memo } from 'preact/compat';
import {
  BOARD_H,
  BOARD_W,
  boardMarkup,
  isStorePos,
  matTile,
  pitXY,
  rowRect,
  seedDefs,
  seedSlots,
} from '../../shared/art/congklak';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import type { Side } from './logic';
import { STR } from './strings';

export const SIDE_COLOR: [string, string] = ['#E8352E', '#2F8CFF'];

export interface PlayerCard {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  connected: boolean;
}

export interface Bubble {
  id: number;
  text: string;
  who: string;
  tone: 'cheer' | 'boo' | 'rematch';
  until: number;
}

export interface PanelModel {
  side: Side;
  label: string;
  members: PlayerCard[];
  /** Player picking right now (highlighted), if on this side. */
  mover: number | null;
  store: number;
  total: number | null;
  status: string;
  active: boolean;
  lead: boolean;
}

export type Banner =
  | { kind: 'intro'; key: number; title: string; sub: string; hint: string; side: Side }
  | {
      kind: 'round' | 'final';
      key: number;
      title: string;
      sub: string;
      next: string | null;
      winner: Side | null;
      stores: [number, number];
      labels: [string, string];
    };

export interface HudModel {
  chip: string;
  panels: [PanelModel, PanelModel];
  banner: Banner | null;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'extra' | 'capture' | 'info';
  x: number;
  y: number;
  until: number;
}

export interface BoardModel {
  counts: number[];
  /** Seeds in the hand and where it hovers; `ms` = how long the move there takes. */
  hand: { pos: number; n: number; ms: number } | null;
  /** Side whose row is highlighted (turn). */
  activeSide: Side | null;
  /** Holes ringed in yellow (capture, picked hole, store on an extra turn). */
  flash: number[];
  flashKey: number;
}

export class TvStore {
  readonly hud = signal<HudModel | null>(null);
  readonly board = signal<BoardModel>({
    counts: new Array<number>(16).fill(0),
    hand: null,
    activeSide: null,
    flash: [],
    flashKey: 0,
  });
  readonly toasts = signal<Toast[]>([]);
  readonly bubbles: [Signal<Bubble[]>, Signal<Bubble[]>] = [signal([]), signal([])];
  readonly paused = signal(false);
  /** Turn timer bars (one per panel) written directly each frame. */
  readonly timerEls: [HTMLElement | null, HTMLElement | null] = [null, null];
  readonly secsEls: [HTMLElement | null, HTMLElement | null] = [null, null];

  setTimer(side: Side | null, frac: number, secs: number): void {
    for (const s of [0, 1] as const) {
      const bar = this.timerEls[s];
      const num = this.secsEls[s];
      const on = s === side;
      if (bar) {
        bar.style.transform = `scaleX(${on ? Math.max(0, Math.min(1, frac)) : 0})`;
        bar.classList.toggle('is-low', on && secs <= 3);
      }
      if (num) {
        const text = on ? String(secs) : '';
        if (num.textContent !== text) num.textContent = text;
      }
    }
  }
}

/* ------------------------------------------------------------------ board */

const SEED_DEFS = seedDefs();
const BOARD_SVG = boardMarkup();

const Pile = memo(function Pile({ pos, n }: { pos: number; n: number }) {
  const { x, y } = pitXY(pos);
  const slots = seedSlots(isStorePos(pos));
  const shown = Math.min(n, slots.length);
  const out = [];
  for (let k = 0; k < shown; k++) {
    const s = slots[k]!;
    out.push(
      <use key={k} href={`#ck-s${s.v}`} transform={`translate(${x + s.x} ${y + s.y}) rotate(${s.rot})`} />,
    );
  }
  return <g>{out}</g>;
});

function CountBadge({ pos, n, active }: { pos: number; n: number; active: boolean }) {
  const { x, y } = pitXY(pos);
  if (isStorePos(pos)) {
    const side = pos === 7 ? 0 : 1;
    return (
      <div class="ck-store-badge" style={{ left: x, top: y - 104, background: SIDE_COLOR[side] }}>
        {n}
      </div>
    );
  }
  const top = pos < 7;
  return (
    <div
      class={`ck-count ${n === 0 ? 'is-empty' : ''} ${active ? 'is-active' : ''}`}
      style={{ left: x, top: top ? y - 73 : y + 73 }}
    >
      {n}
    </div>
  );
}

function Hand({ hand }: { hand: BoardModel['hand'] }) {
  if (!hand) return null;
  const { x, y } = pitXY(hand.pos);
  // Hover towards the middle of the board so the count badges on the rim stay readable.
  const dy = isStorePos(hand.pos) ? 0 : hand.pos < 7 ? 38 : -38;
  const shown = Math.min(hand.n, 5);
  const seeds = [];
  for (let k = 0; k < shown; k++) {
    const a = k * 2.4;
    const r = k === 0 ? 0 : 12;
    seeds.push(
      <use
        key={k}
        href={`#ck-s${k % 3}`}
        transform={`translate(${42 + Math.cos(a) * r} ${36 + Math.sin(a) * r}) rotate(${k * 47})`}
      />,
    );
  }
  return (
    <div
      class="ck-hand"
      style={{
        transform: `translate(${x - 42}px, ${y + dy - 36}px)`,
        transitionDuration: `${Math.max(30, Math.round(hand.ms * 0.85))}ms`,
      }}
    >
      <svg width="84" height="72" viewBox="0 0 84 72" aria-hidden="true">
        <ellipse cx="42" cy="36" rx="38" ry="28" fill="#FFF4DF" stroke="#7A4521" stroke-width="4" />
        {seeds}
      </svg>
      {hand.n > 0 && <span class="ck-hand-n">{hand.n}</span>}
    </div>
  );
}

function Board({ store }: { store: TvStore }) {
  const b = store.board.value;
  const band = b.activeSide !== null ? rowRect(b.activeSide) : null;
  return (
    <div class="ck-board">
      <svg
        class="ck-board-art"
        width={BOARD_W}
        height={BOARD_H}
        viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        aria-hidden="true"
        // Static: drawn once.
        dangerouslySetInnerHTML={{ __html: `<defs>${SEED_DEFS}</defs>${BOARD_SVG}` }}
      />
      <svg
        class="ck-board-seeds"
        width={BOARD_W}
        height={BOARD_H}
        viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        aria-hidden="true"
      >
        {band && (
          <rect
            class="ck-band"
            x={band.x}
            y={band.y}
            width={band.w}
            height={band.h}
            rx={band.h / 2}
            stroke={SIDE_COLOR[b.activeSide!]}
          />
        )}
        {b.counts.map((n, pos) => (
          <Pile key={pos} pos={pos} n={n} />
        ))}
        {b.flash.map((pos) => {
          const { x, y } = pitXY(pos);
          return isStorePos(pos) ? (
            <ellipse key={`${b.flashKey}-${pos}`} class="ck-flash" cx={x} cy={y} rx={70} ry={140} />
          ) : (
            <circle key={`${b.flashKey}-${pos}`} class="ck-flash" cx={x} cy={y} r={58} />
          );
        })}
      </svg>
      {b.counts.map((n, pos) => (
        <CountBadge
          key={pos}
          pos={pos}
          n={n}
          active={b.activeSide !== null && !isStorePos(pos) && (pos < 7 ? 0 : 1) === b.activeSide && n > 0}
        />
      ))}
      <Hand hand={b.hand} />
      {store.toasts.value.map((t) => (
        <div key={t.id} class={`ck-toast is-${t.kind}`} style={{ left: t.x, top: t.y }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

function Panel({ p, store }: { p: PanelModel; store: TvStore }) {
  const many = p.members.length > 1;
  return (
    <div
      class={`ck-panel side-${p.side} ${p.active ? 'is-active' : ''}`}
      style={{ '--side': SIDE_COLOR[p.side] } as Record<string, string>}
    >
      <div class="ck-who">
        <div class={`ck-avatars ${many ? 'is-team' : ''}`}>
          {p.members.slice(0, 5).map((m) => (
            <div key={m.id} class={`ck-av ${m.id === p.mover ? 'is-mover' : ''}`}>
              <Avatar
                fruit={m.fruit}
                ring={m.color}
                size={many ? (m.id === p.mover ? 66 : 50) : 66}
                face={m.id === p.mover ? 'effort' : 'happy'}
                dim={!m.connected}
              />
            </div>
          ))}
        </div>
        <div class="ck-names">
          <div class="ck-label">
            {p.label}
            {p.active && <span class="ck-tag">{STR.turnTag}</span>}
          </div>
          <div class="ck-status">{p.status}</div>
        </div>
        <span
          class="ck-secs"
          ref={(el) => {
            store.secsEls[p.side] = el;
          }}
        />
      </div>
      <div class={`ck-score ${p.lead ? 'is-lead' : ''}`}>
        <span class="ck-score-label">{STR.store}</span>
        <b>{p.store}</b>
        {p.total !== null && <small>{STR.total(p.total)}</small>}
      </div>
      <i
        class="ck-timer"
        ref={(el) => {
          store.timerEls[p.side] = el;
        }}
      />
      <div class="ck-bubbles">
        {store.bubbles[p.side].value.map((b) => (
          <div key={b.id} class={`ck-bubble is-${b.tone}`}>
            <b>{b.who}</b> {b.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function BannerView({ b }: { b: Banner }) {
  if (b.kind === 'intro') {
    return (
      <div class="ck-banner-wrap" key={b.key}>
        <div class="ck-banner">
          <div class="ck-banner-title">{b.title}</div>
          <div class="ck-banner-sub" style={{ color: SIDE_COLOR[b.side] }}>
            {b.sub}
          </div>
          <div class="ck-banner-hint">{b.hint}</div>
        </div>
      </div>
    );
  }
  return (
    <div class="ck-banner-wrap" key={b.key}>
      <div class={`ck-banner is-${b.kind}`}>
        <div class="ck-banner-title" style={b.winner !== null ? { color: SIDE_COLOR[b.winner] } : undefined}>
          {b.title}
        </div>
        <div class="ck-banner-score">
          {([0, 1] as const).map((s) => (
            <div key={s} class={`ck-banner-side ${b.winner === s ? 'is-win' : ''}`}>
              <span class="ck-dot" style={{ background: SIDE_COLOR[s] }} />
              <span class="ck-banner-name">{b.labels[s]}</span>
              <b class="ck-banner-n">{b.stores[s]}</b>
            </div>
          ))}
        </div>
        {b.sub && <div class="ck-banner-hint">{b.sub}</div>}
        {b.next && <div class="ck-banner-hint">{b.next}</div>}
      </div>
    </div>
  );
}

export function CongklakTv({ store }: { store: TvStore }) {
  const hud = store.hud.value;
  const mat = svgUrl('ck-mat', matTile);
  return (
    <div
      class={`ck-root ${store.paused.value ? 'is-paused' : ''}`}
      style={{ backgroundImage: `url("${mat}")` }}
    >
      <div class="ck-column">
        {hud && <div class="ck-chip">{hud.chip}</div>}
        {hud && <Panel p={hud.panels[0]} store={store} />}
        <div class="ck-board-wrap">
          <Board store={store} />
          {hud?.banner && <BannerView b={hud.banner} />}
        </div>
        {hud && <Panel p={hud.panels[1]} store={store} />}
      </div>
    </div>
  );
}
