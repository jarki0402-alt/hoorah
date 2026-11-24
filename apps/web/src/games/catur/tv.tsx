/**
 * Main-screen renderer for Catur. Re-renders on every `version` bump (moves, votes, roster);
 * clocks and the vote timer write to the DOM from the frame bus, so nothing re-renders per
 * frame. Pieces are <img> sprites with stable keys that slide with a CSS transform (cheap on a
 * weak Smart TV); the board squares are one static background image.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { ReadonlySignal } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Avatar } from '../../shared/ui';
import { type Color, opposite } from './chess';
import { LOW_TIME_S, type Mode, type Outcome, type Phase, VOTE_MS } from './logic';
import { BOARD, pieceUrl } from './pieces';
import { index64, type Sprite } from './sprites';
import { formatClock, STR } from './strings';

/* ------------------------------------------------------------------ plumbing */

/** Per-frame callbacks with the current server time, driven by the main loop. */
export class FrameBus {
  private readonly subs = new Set<(now: number) => void>();
  now = 0;

  subscribe(fn: (now: number) => void): () => void {
    this.subs.add(fn);
    fn(this.now);
    return () => this.subs.delete(fn);
  }

  emit(now: number): void {
    this.now = now;
    for (const fn of this.subs) fn(now);
  }
}

/** A move as the move list draws it (`uci` is only needed for the last one). */
export interface ShownMove {
  uci: string;
  san: string;
  color: Color;
}

export interface ShownVote {
  move: string;
  count: number;
  voters: number[];
}

/**
 * What the view reads from the match: `CaturMatch` itself on the Host's main screen, a replica
 * built from the published display state on a far-away one (long-distance play).
 */
export interface MatchView {
  readonly mode: Mode;
  readonly minutes: number;
  /** Ms added per move. */
  readonly increment: number;
  readonly phase: Phase;
  readonly sides: { readonly w: number[]; readonly b: number[] };
  readonly outcome: Outcome | null;
  readonly turn: Color;
  readonly running: boolean;
  readonly held: boolean;
  /** Server ms. */
  readonly phaseUntil: number;
  readonly voteUntil: number;
  readonly history: readonly ShownMove[];
  lastMove(): ShownMove | undefined;
  checkSquare(): string | undefined;
  /** Team mode: current proposals, most votes first. */
  tally(): readonly ShownVote[];
  captures(): { w: string[]; b: string[] };
  material(): number;
  timeLeft(c: Color, now: number): number;
  isConnected(id: number): boolean;
  sanOf(move: string): string;
}

export interface TvModel {
  match: MatchView;
  version: ReadonlySignal<number>;
  frame: FrameBus;
  sprites: Sprite[];
  /** Short message over the vote panel (e.g. a random move), or null. */
  notice: string | null;
  info(id: number): PlayerInfo | undefined;
}

export interface StageSize {
  w: number;
  h: number;
}

const px = (n: number) => `${Math.round(n * 10) / 10}px`;
type Vars = Record<`--${string}`, string>;
const vars = (v: Vars): JSX.CSSProperties => v as unknown as JSX.CSSProperties;

/** Frame-driven text: runs `fn` every frame and writes only when the text changes. */
function useLiveText(frame: FrameBus, fn: (now: number) => { text: string; cls?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let lastText = '';
    let lastCls = '\u0000';
    return frame.subscribe((now) => {
      const el = ref.current;
      if (!el) return;
      const { text, cls = '' } = fnRef.current(now);
      if (text !== lastText) el.textContent = lastText = text;
      if (cls !== lastCls) {
        el.dataset.state = cls;
        lastCls = cls;
      }
    });
  }, [frame]);
  return ref;
}

/* ------------------------------------------------------------------ layout */

interface Layout {
  board: number;
  col: number;
  left: number;
  top: number;
  gap: number;
}

/** Board on the left, info column on the right, both centred on the stage. */
export function layoutFor({ w, h }: StageSize): Layout {
  const m = 34;
  const gap = 36;
  const col = 440;
  const board = Math.floor(Math.min(h - 2 * m, w - col - gap - 2 * m, 900));
  const total = board + gap + col;
  return { board, col, gap, left: Math.round((w - total) / 2), top: Math.round((h - board) / 2) };
}

/* ------------------------------------------------------------------ root */

export function CaturTv({ model, size }: { model: TvModel; size: ReadonlySignal<StageSize> }) {
  void model.version.value;
  const L = layoutFor(size.value);
  const { match } = model;
  return (
    <div class="ct-root">
      <div
        class="ct-board-wrap"
        style={{ left: px(L.left), top: px(L.top), width: px(L.board), height: px(L.board) }}
      >
        <Board model={model} size={L.board} />
      </div>
      <div
        class="ct-col"
        style={{ left: px(L.left + L.board + L.gap), top: px(L.top), width: px(L.col), height: px(L.board) }}
      >
        <Header match={match} />
        <SideCard model={model} color="b" />
        <Middle model={model} />
        <SideCard model={model} color="w" />
      </div>
    </div>
  );
}

function Header({ match }: { match: MatchView }) {
  const inc = Math.round(match.increment / 1000);
  return (
    <div class="ct-head">
      <div class="ct-logo">{STR.logo}</div>
      <div class="ct-chip">{match.mode === 'team' ? STR.modeTeam : STR.modeDuel}</div>
      <div class="ct-chip is-soft">{STR.timeControl(match.minutes, inc)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ board */

const squaresUrl = (() => {
  let rects = '';
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) if ((r + f) % 2) rects += `<rect x="${f}" y="${r}" width="1" height="1"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="8" height="8" fill="${BOARD.light}"/><g fill="${BOARD.dark}">${rects}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
})();

function Board({ model, size }: { model: TvModel; size: number }) {
  const { match } = model;
  const frame = Math.round(size * 0.045);
  const inner = size - 2 * frame;
  const sq = inner / 8;
  const last = match.lastMove();
  const check = match.checkSquare();
  const tally = match.mode === 'team' && match.phase === 'play' ? match.tally() : [];
  const at = (i: number) => ({ x: (i % 8) * sq, y: Math.floor(i / 8) * sq });
  const mark = (name: string, cls: string) => {
    const p = at(index64(name));
    return (
      <div
        key={`${cls}${name}`}
        class={`ct-mark ${cls}`}
        style={{ width: px(sq), height: px(sq), transform: `translate(${px(p.x)}, ${px(p.y)})` }}
      />
    );
  };
  const moverSq = last ? index64(last.uci.slice(2, 4)) : -1;
  return (
    <div class="ct-board" style={vars({ '--frame': px(frame), '--sq': px(sq) })}>
      <div class="ct-files">
        {'abcdefgh'.split('').map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
      <div class="ct-ranks">
        {'87654321'.split('').map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div class="ct-squares" style={{ backgroundImage: squaresUrl, width: px(inner), height: px(inner) }}>
        {last && mark(last.uci.slice(0, 2), 'is-last')}
        {last && mark(last.uci.slice(2, 4), 'is-last')}
        {check && mark(check, 'is-check')}
        {model.sprites.map((s) => {
          const p = at(s.sq);
          return (
            <img
              key={s.id}
              class={`ct-piece ${s.gone ? 'is-gone' : ''} ${s.sq === moverSq && !s.gone ? 'is-mover' : ''}`}
              src={pieceUrl(s.p)}
              alt=""
              draggable={false}
              style={{ width: px(sq), height: px(sq), transform: `translate(${px(p.x)}, ${px(p.y)})` }}
            />
          );
        })}
        {tally.length > 0 && <Arrows tally={tally} />}
      </div>
      {match.phase === 'intro' && <IntroCard model={model} />}
      {(match.phase === 'over' || match.phase === 'ended') && match.outcome && <OverCard model={model} />}
    </div>
  );
}

function Arrows({ tally }: { tally: readonly ShownVote[] }) {
  const total = tally.reduce((s, t) => s + t.count, 0) || 1;
  // Leader drawn last, on top.
  const list = tally.slice(0, 6).reverse();
  return (
    <svg class="ct-arrows" viewBox="0 0 8 8" aria-hidden="true">
      {list.map((t, i) => {
        const lead = i === list.length - 1;
        const a = index64(t.move.slice(0, 2));
        const b = index64(t.move.slice(2, 4));
        const x1 = (a % 8) + 0.5;
        const y1 = Math.floor(a / 8) + 0.5;
        const x2 = (b % 8) + 0.5;
        const y2 = Math.floor(b / 8) + 0.5;
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / len;
        const uy = (y2 - y1) / len;
        const nx = -uy;
        const ny = ux;
        const w = 0.07 + 0.09 * (t.count / total);
        const head = 0.34;
        const hw = w + 0.14;
        const sx = x1 + ux * 0.18;
        const sy = y1 + uy * 0.18;
        const ex = x2 - ux * 0.1;
        const ey = y2 - uy * 0.1;
        const bx = ex - ux * head;
        const by = ey - uy * head;
        const pts = [
          [sx + nx * w, sy + ny * w],
          [bx + nx * w, by + ny * w],
          [bx + nx * hw, by + ny * hw],
          [ex, ey],
          [bx - nx * hw, by - ny * hw],
          [bx - nx * w, by - ny * w],
          [sx - nx * w, sy - ny * w],
        ]
          .map(([x, y]) => `${x!.toFixed(3)},${y!.toFixed(3)}`)
          .join(' ');
        const cx = x1 + ux * Math.min(0.55, len * 0.3);
        const cy = y1 + uy * Math.min(0.55, len * 0.3);
        return (
          <g key={t.move} class={lead ? 'is-lead' : ''}>
            <polygon points={pts} class="ct-arrow" />
            <circle cx={cx} cy={cy} r="0.2" class="ct-arrow-dot" />
            <text x={cx} y={cy + 0.075} class="ct-arrow-num">
              {t.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function sideLabel(model: TvModel, c: Color): string {
  const { match } = model;
  if (match.mode === 'team') return STR.team(c);
  const id = match.sides[c][0];
  return id === undefined ? STR.waitingPlayer : (model.info(id)?.name ?? STR.unknownPlayer);
}

function Faces({
  model,
  ids,
  size,
  voted,
}: {
  model: TvModel;
  ids: number[];
  size: number;
  voted?: Set<number>;
}) {
  const shown = ids.slice(0, 5);
  return (
    <div class="ct-faces">
      {shown.map((id) => {
        const p = model.info(id);
        if (!p) return null;
        return (
          <div key={id} class={`ct-face ${voted?.has(id) ? 'is-voted' : ''}`}>
            <Avatar look={p.look} ring={p.color} size={size} dim={!p.connected} />
          </div>
        );
      })}
      {ids.length > shown.length && <div class="ct-more">+{ids.length - shown.length}</div>}
    </div>
  );
}

function IntroCard({ model }: { model: TvModel }) {
  const { match } = model;
  const count = useLiveText(model.frame, (now) => ({
    text: String(Math.max(1, Math.ceil((match.phaseUntil - now) / 1000))),
  }));
  return (
    <div class="ct-veil">
      <div class="ct-card ct-intro">
        <div class="ct-intro-title">{STR.introTitle(match.mode)}</div>
        <div class="ct-vs">
          <VsSide model={model} color="w" />
          <div class="ct-vs-mid">{STR.introVs}</div>
          <VsSide model={model} color="b" />
        </div>
        <div class="ct-intro-sub">{STR.introSub(match.mode)}</div>
        <div class="ct-count" ref={count} />
      </div>
    </div>
  );
}

function VsSide({ model, color }: { model: TvModel; color: Color }) {
  const { match } = model;
  return (
    <div class={`ct-vs-side is-${color}`}>
      <img src={pieceUrl(color === 'w' ? 'K' : 'k')} alt="" class="ct-vs-king" />
      <Faces model={model} ids={match.sides[color]} size={match.mode === 'team' ? 40 : 64} />
      <div class="ct-vs-name">{sideLabel(model, color)}</div>
      <div class="ct-vs-color">{STR.color[color]}</div>
    </div>
  );
}

function OverCard({ model }: { model: TvModel }) {
  const { match } = model;
  const out = match.outcome!;
  const loser = out.winner ? opposite(out.winner) : match.turn;
  const loserLabel = match.mode === 'team' ? STR.team(loser) : sideLabel(model, loser);
  return (
    <div class="ct-veil is-over">
      <div class="ct-card ct-over">
        <div class={`ct-over-title ${out.winner ? '' : 'is-draw'}`}>{STR.overTitle(out.reason)}</div>
        {out.winner ? (
          <div class="ct-over-winner">
            <Faces model={model} ids={match.sides[out.winner]} size={56} />
            <span>{STR.overWinner(sideLabel(model, out.winner))}</span>
          </div>
        ) : (
          <div class="ct-over-winner">
            <span>{STR.overDraw}</span>
          </div>
        )}
        <div class="ct-over-reason">{STR.reason(out.reason, loserLabel)}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ side cards */

function SideCard({ model, color }: { model: TvModel; color: Color }) {
  const { match } = model;
  const onMove = match.phase === 'play' && match.turn === color;
  const inCheck = onMove && match.checkSquare() !== undefined;
  const taken = match.captures()[color];
  const material = match.material() * (color === 'w' ? 1 : -1);
  const ids = match.sides[color];
  const team = match.mode === 'team';
  const voted = team && onMove ? new Set(match.tally().flatMap((t) => t.voters)) : undefined;
  const won = match.outcome && match.outcome.winner === color;
  const clock = useLiveText(model.frame, (now) => {
    const left = match.timeLeft(color, now);
    const running = match.running && match.turn === color;
    return { text: formatClock(left), cls: running ? (left < LOW_TIME_S * 1000 ? 'low' : 'run') : '' };
  });
  return (
    <div class={`ct-side is-${color} ${onMove ? 'is-turn' : ''} ${won ? 'is-won' : ''}`}>
      <div class="ct-side-top">
        <img class="ct-side-king" src={pieceUrl(color === 'w' ? 'K' : 'k')} alt="" />
        <div class="ct-side-who">
          <div class="ct-side-name">{sideLabel(model, color)}</div>
          <div class="ct-side-sub">
            {team ? (
              <Faces model={model} ids={ids} size={30} {...(voted ? { voted } : {})} />
            ) : (
              <span>{STR.color[color]}</span>
            )}
            {inCheck && <span class="ct-check-tag">{STR.check}</span>}
          </div>
        </div>
        {!team && ids[0] !== undefined && <Faces model={model} ids={ids} size={58} />}
        <div class="ct-clock" ref={clock} />
      </div>
      <div class="ct-taken">
        {taken.map((p, i) => (
          <img key={`${p}${i}`} src={pieceUrl(p)} alt="" />
        ))}
        {material > 0 && <span class="ct-plus">+{material}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ middle: votes and moves */

function Middle({ model }: { model: TvModel }) {
  const { match } = model;
  const voting = match.mode === 'team' && match.phase === 'play';
  return (
    <div class="ct-mid">
      {voting && <VotePanel model={model} />}
      <MoveList history={match.history} rows={voting ? 3 : 7} />
    </div>
  );
}

function VotePanel({ model }: { model: TvModel }) {
  const { match } = model;
  const tally = match.tally();
  const bar = useRef<HTMLDivElement>(null);
  const secs = useLiveText(model.frame, (now) => ({
    text: String(Math.max(0, Math.ceil((match.voteUntil - now) / 1000))),
  }));
  useEffect(
    () =>
      model.frame.subscribe((now) => {
        const el = bar.current;
        if (!el) return;
        const left = match.held ? 1 : Math.max(0, Math.min(1, (match.voteUntil - now) / VOTE_MS));
        el.style.transform = `scaleX(${left.toFixed(3)})`;
      }),
    [model.frame, match],
  );
  const team = match.sides[match.turn];
  const voters = team.filter((id) => match.isConnected(id)).length;
  const votes = tally.reduce((s, t) => s + t.count, 0);
  return (
    <div class="ct-vote">
      <div class="ct-vote-head">
        <span class="ct-vote-title">
          {STR.voteTitle} · {STR.team(match.turn)}
        </span>
        <span class="ct-vote-secs" ref={secs} />
      </div>
      <div class="ct-vote-track">
        <div class="ct-vote-bar" ref={bar} />
      </div>
      {model.notice ? (
        <div class="ct-vote-note">{model.notice}</div>
      ) : tally.length === 0 ? (
        <div class="ct-vote-note is-soft">{STR.voteHint}</div>
      ) : (
        <div class="ct-vote-list">
          {tally.slice(0, 3).map((t, i) => (
            <div key={t.move} class={`ct-vote-row ${i === 0 ? 'is-lead' : ''}`}>
              <Figurine san={match.sanOf(t.move)} color={match.turn} />
              <Faces model={model} ids={t.voters} size={26} />
              <span class="ct-vote-n">{STR.voteCount(t.count)}</span>
            </div>
          ))}
        </div>
      )}
      <div class="ct-vote-foot">{STR.voted(Math.min(votes, voters), voters)}</div>
    </div>
  );
}

/** SAN with the piece letter drawn as a little piece (light pieces on the dark move list). */
function Figurine({ san: text, color }: { san: string; color: Color }) {
  const first = text[0]!;
  if ('KQRBN'.includes(first)) {
    const p = color === 'w' ? first : first.toLowerCase();
    return (
      <span class="ct-san">
        <img src={pieceUrl(p)} alt="" />
        {text.slice(1)}
      </span>
    );
  }
  return <span class="ct-san">{text}</span>;
}

function MoveList({ history, rows }: { history: readonly ShownMove[]; rows: number }) {
  const pairs: { n: number; w?: ShownMove; b?: ShownMove }[] = [];
  for (const m of history) {
    if (m.color === 'w' || pairs.length === 0)
      pairs.push({ n: pairs.length + 1, ...(m.color === 'w' ? { w: m } : { b: m }) });
    else pairs[pairs.length - 1]!.b = m;
  }
  const shown = pairs.slice(-rows);
  const lastIdx = history.length - 1;
  return (
    <div class="ct-moves">
      <div class="ct-moves-title">{STR.moves}</div>
      {shown.length === 0 ? (
        <div class="ct-moves-empty">{STR.noMoves}</div>
      ) : (
        <div class="ct-moves-grid">
          {shown.map((p) => (
            <div key={p.n} class="ct-move-row">
              <span class="ct-move-n">{p.n}.</span>
              <span class={`ct-move ${p.w && history[lastIdx] === p.w ? 'is-last' : ''}`}>
                {p.w ? <Figurine san={p.w.san} color="w" /> : '...'}
              </span>
              <span class={`ct-move ${p.b && history[lastIdx] === p.b ? 'is-last' : ''}`}>
                {p.b && <Figurine san={p.b.san} color="w" />}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
