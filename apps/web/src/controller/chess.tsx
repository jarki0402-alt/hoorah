/**
 * Phone chessboard (`chess` view). Tap a piece: its legal targets light up in the same frame.
 * Tap a target: the move goes to the game as `action('move', uci)`. Only moves the game listed
 * in `moves` can be sent, so an illegal move never leaves the phone. A pawn reaching the last
 * rank opens a small picker for the promotion piece.
 *
 * Duel: the move shows on the board at once (optimistic) until the game's next view confirms it.
 * Team vote: the choice is drawn as an orange arrow and can be changed until the vote closes.
 */
import type { ChessClock, ChessSide } from '@hoorah/protocol';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BOARD, pieceSymbols } from '../games/catur/pieces';
import './chess.css';
import { PlayerAvatar, Timer, type V } from './common';
import { action, haptic, serverNow } from './store';

const T = {
  board: 'Papan catur',
  promoTitle: 'Promosi jadi',
  cancel: 'Batal',
  confirm: 'Yakin? Ketuk lagi',
  piece: { q: 'Menteri', r: 'Benteng', b: 'Gajah', n: 'Kuda' } as Record<string, string>,
} as const;

const FILES = 'abcdefgh';
const SYM = 'cp-';
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** "e2" -> 0..63 (a8 = 0). */
const idx = (name: string) => (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
const nameOf = (i: number) => FILES[i % 8]! + String(8 - Math.floor(i / 8));

/** The board after `move`, for the optimistic duel move (castling and en passant included). */
function applyLocal(board: string, move: string): string {
  const b = board.split('');
  const from = idx(move.slice(0, 2));
  const to = idx(move.slice(2, 4));
  const p = b[from]!;
  const white = p === p.toUpperCase();
  const kind = p.toLowerCase();
  if (kind === 'p' && from % 8 !== to % 8 && b[to] === '.') b[to + (white ? 8 : -8)] = '.';
  if (kind === 'k' && Math.abs(to - from) === 2) {
    const rookFrom = to > from ? to + 1 : to - 2;
    const rookTo = to > from ? to - 1 : to + 1;
    b[rookTo] = b[rookFrom]!;
    b[rookFrom] = '.';
  }
  b[from] = '.';
  b[to] = move[4] ? (white ? move[4].toUpperCase() : move[4]) : p;
  return b.join('');
}

function material(board: string): number {
  let s = 0;
  for (const p of board) {
    if (p === '.') continue;
    const v = VALUE[p.toLowerCase()] ?? 0;
    s += p === p.toUpperCase() ? v : -v;
  }
  return s;
}

function formatClock(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10_000) return (Math.floor(t / 100) / 10).toFixed(1).replace('.', ',');
  const s = Math.ceil(t / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useClockTick(clock?: ChessClock): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!clock?.run) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 100);
    return () => window.clearInterval(t);
  }, [clock?.run, clock?.at]);
  return clock ? serverNow() : 0;
}

function clockLeft(clock: ChessClock | undefined, c: 'w' | 'b', now: number): number | null {
  if (!clock) return null;
  return clock.run === c ? clock[c] - (now - clock.at) : clock[c];
}

function Bar({
  info,
  color,
  left,
  running,
  plus,
  you,
}: {
  info: ChessSide;
  color: 'w' | 'b';
  left: number | null;
  running: boolean;
  plus: number;
  you: boolean;
}) {
  const low = running && left !== null && left < 10_000;
  return (
    <div class={`chess-bar ${you ? 'is-me' : 'is-opp'} ${running ? 'is-run' : ''}`}>
      <svg class="chess-king" viewBox="0 0 100 100" aria-hidden="true">
        <use href={`#${SYM}${color === 'w' ? 'K' : 'k'}`} />
      </svg>
      <div class="chess-faces">
        {info.ids.slice(0, 4).map((id) => (
          <PlayerAvatar key={id} id={id} size={26} />
        ))}
      </div>
      <span class="chess-name">{info.label}</span>
      {plus > 0 && <span class="chess-plus">+{plus}</span>}
      {left !== null && (
        <span class={`chess-clock ${running ? 'is-run' : ''} ${low ? 'is-low' : ''}`}>
          {formatClock(left)}
        </span>
      )}
    </div>
  );
}

/** Arrow from square to square in board units (100 per square), already in view orientation. */
function arrowPoints(x1: number, y1: number, x2: number, y2: number, w: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const nx = -uy;
  const ny = ux;
  const head = 34;
  const hw = w + 14;
  const sx = x1 + ux * 16;
  const sy = y1 + uy * 16;
  const ex = x2 - ux * 8;
  const ey = y2 - uy * 8;
  const bx = ex - ux * head;
  const by = ey - uy * head;
  return [
    [sx + nx * w, sy + ny * w],
    [bx + nx * w, by + ny * w],
    [bx + nx * hw, by + ny * hw],
    [ex, ey],
    [bx - nx * hw, by - ny * hw],
    [bx - nx * w, by - ny * w],
    [sx - nx * w, sy - ny * w],
  ]
    .map(([x, y]) => `${Math.round(x!)},${Math.round(y!)}`)
    .join(' ');
}

export function ChessView({ v }: { v: V<'chess'> }) {
  const flip = v.side === 'b';
  const team = v.deadline !== undefined;
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [localVote, setLocalVote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const boardRef = useRef<SVGSVGElement>(null);
  const symbols = useMemo(() => pieceSymbols(SYM), []);

  // A new position: drop the selection. Any new view ends an optimistic move (a rejected move
  // comes back as a fresh copy of the old position).
  useEffect(() => {
    setSel(null);
    setPromo(null);
  }, [v.board, v.turn]);
  useEffect(() => {
    setPending(null);
    setLocalVote(null);
  }, [v]);
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirming]);

  const moves = v.moves ?? [];
  const canMove = moves.length > 0 && !v.locked && pending === null;
  const byFrom = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const mv of moves) {
      const f = idx(mv.slice(0, 2));
      const list = m.get(f);
      if (list) list.push(mv);
      else m.set(f, [mv]);
    }
    return m;
  }, [moves.join(',')]);

  const board = pending ? applyLocal(v.board, pending) : v.board;
  const targets = sel !== null ? (byFrom.get(sel) ?? []) : [];
  const targetSet = new Set(targets.map((m) => idx(m.slice(2, 4))));
  const vote = localVote ?? v.myVote ?? null;
  const now = useClockTick(v.clock);

  // View position of a board index (0..63), in board units.
  const pos = (i: number) => {
    const r = Math.floor(i / 8);
    const f = i % 8;
    return flip ? { x: (7 - f) * 100, y: (7 - r) * 100 } : { x: f * 100, y: r * 100 };
  };
  const center = (name: string) => {
    const p = pos(idx(name));
    return { x: p.x + 50, y: p.y + 50 };
  };

  const send = (mv: string) => {
    haptic(18);
    action('move', mv);
    setSel(null);
    setPromo(null);
    if (team) setLocalVote(mv);
    else setPending(mv);
  };

  const onDown = (e: PointerEvent) => {
    if (!canMove || promo) return;
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let f = Math.floor(((e.clientX - r.left) / r.width) * 8);
    let row = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (f < 0 || f > 7 || row < 0 || row > 7) return;
    if (flip) {
      f = 7 - f;
      row = 7 - row;
    }
    const i = row * 8 + f;
    if (sel !== null && targetSet.has(i)) {
      const options = targets.filter((m) => idx(m.slice(2, 4)) === i);
      if (options.length > 1) {
        haptic(10);
        setPromo({ from: sel, to: i });
      } else if (options[0]) {
        send(options[0]);
      }
      return;
    }
    if (byFrom.has(i) && sel !== i) {
      haptic(8);
      setSel(i);
    } else {
      setSel(null);
    }
  };

  const last = v.last;
  const check = v.check;
  const lightCoord = BOARD.dark;
  const darkCoord = BOARD.light;
  const opp = v.side === 'w' ? 'b' : 'w';
  const mat = material(board);
  const running = (c: 'w' | 'b') => v.clock?.run === c;
  const moverPiece = (t: string) => (v.turn === 'w' ? t.toUpperCase() : t);

  return (
    <div
      class={`ctrl chess-view ${canMove ? 'is-turn' : ''} ${v.locked ? 'is-locked' : ''} ${team ? 'is-team' : ''}`}
    >
      <div class="panes">
        <div class="pane chess-info">
          <div class="chess-top">
            <span class="chess-eyebrow">{v.eyebrow}</span>
            {team && v.deadline !== undefined && canMove && <Timer deadline={v.deadline} />}
            {v.actions && v.actions.length > 0 && !v.locked && (
              <div class="chess-actions">
                {v.actions.map((a) => {
                  const asks = a.id.startsWith('resign');
                  const armed = confirming === a.id;
                  return (
                    <button
                      type="button"
                      key={a.id}
                      class={`chess-act ${armed ? 'is-armed' : ''}`}
                      onPointerDown={() => {
                        if (asks && !armed) {
                          haptic(10);
                          setConfirming(a.id);
                          return;
                        }
                        haptic(30);
                        setConfirming(null);
                        action(a.id);
                      }}
                    >
                      {armed ? T.confirm : a.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Bar
            info={v.players[opp]}
            color={opp}
            left={clockLeft(v.clock, opp, now)}
            running={running(opp)}
            plus={opp === 'w' ? mat : -mat}
            you={false}
          />
          <Bar
            info={v.players[v.side]}
            color={v.side}
            left={clockLeft(v.clock, v.side, now)}
            running={running(v.side)}
            plus={v.side === 'w' ? mat : -mat}
            you={true}
          />
          {v.hint && <div class="chess-hint">{v.hint}</div>}
        </div>
        <div class="pane zone chess-zone">
          <div class="chess-board-box">
            <svg
              ref={boardRef}
              class="chess-board"
              viewBox="0 0 800 800"
              role="img"
              aria-label={T.board}
              onPointerDown={onDown}
            >
              <defs dangerouslySetInnerHTML={{ __html: symbols }} />
              <rect width="800" height="800" fill={BOARD.light} />
              <path
                fill={BOARD.dark}
                d={Array.from({ length: 64 }, (_, i) =>
                  (Math.floor(i / 8) + (i % 8)) % 2
                    ? `M${(i % 8) * 100} ${Math.floor(i / 8) * 100}h100v100h-100Z`
                    : '',
                ).join('')}
              />
              {last &&
                [last.slice(0, 2), last.slice(2, 4)].map((s) => {
                  const p = pos(idx(s));
                  return <rect key={`l${s}`} x={p.x} y={p.y} width="100" height="100" fill={BOARD.last} />;
                })}
              {check &&
                (() => {
                  const p = pos(idx(check));
                  return <rect x={p.x} y={p.y} width="100" height="100" fill={BOARD.check} />;
                })()}
              {sel !== null &&
                (() => {
                  const p = pos(sel);
                  return (
                    <rect
                      x={p.x + 4}
                      y={p.y + 4}
                      width="92"
                      height="92"
                      fill="rgba(255, 90, 31, 0.28)"
                      stroke={BOARD.select}
                      stroke-width="8"
                    />
                  );
                })()}
              {/* Coordinates: files on the bottom row, ranks on the left column. */}
              {Array.from({ length: 8 }, (_, k) => {
                const file = flip ? 7 - k : k;
                const rank = flip ? k + 1 : 8 - k;
                const bottomDark = (7 + k) % 2 === 1;
                const leftDark = k % 2 === 1;
                return (
                  <g key={`c${k}`} class="chess-coord">
                    <text
                      x={k * 100 + 92}
                      y={792}
                      text-anchor="end"
                      fill={bottomDark ? darkCoord : lightCoord}
                    >
                      {FILES[file]}
                    </text>
                    <text x={6} y={k * 100 + 22} fill={leftDark ? darkCoord : lightCoord}>
                      {rank}
                    </text>
                  </g>
                );
              })}
              {Array.from(board).map((p, i) => {
                if (p === '.') return null;
                const q = pos(i);
                return (
                  <use key={`p${i}`} href={`#${SYM}${p}`} x={q.x + 3} y={q.y + 3} width="94" height="94" />
                );
              })}
              {targets.map((m) => {
                const i = idx(m.slice(2, 4));
                const q = pos(i);
                const capture =
                  board[i] !== '.' || (board[sel!]?.toLowerCase() === 'p' && i % 8 !== sel! % 8);
                return capture ? (
                  <circle
                    key={`t${m}`}
                    cx={q.x + 50}
                    cy={q.y + 50}
                    r="44"
                    fill="none"
                    stroke="rgba(17, 18, 20, 0.35)"
                    stroke-width="9"
                  />
                ) : (
                  <circle key={`t${m}`} cx={q.x + 50} cy={q.y + 50} r="16" fill={BOARD.dot} />
                );
              })}
              {team &&
                (v.votes ?? [])
                  .filter((t) => t.move !== vote)
                  .slice(0, 5)
                  .map((t) => {
                    const a = center(t.move.slice(0, 2));
                    const b = center(t.move.slice(2, 4));
                    return (
                      <polygon
                        key={`v${t.move}`}
                        points={arrowPoints(a.x, a.y, b.x, b.y, 7 + Math.min(4, t.count) * 2)}
                        fill="rgba(17, 18, 20, 0.45)"
                      />
                    );
                  })}
              {team &&
                vote &&
                (() => {
                  const a = center(vote.slice(0, 2));
                  const b = center(vote.slice(2, 4));
                  return (
                    <polygon
                      points={arrowPoints(a.x, a.y, b.x, b.y, 10)}
                      fill="rgba(255, 90, 31, 0.9)"
                      stroke="#111214"
                      stroke-width="3"
                    />
                  );
                })()}
            </svg>
            {promo && (
              <div class="chess-promo" onPointerDown={(e) => e.target === e.currentTarget && setPromo(null)}>
                <div class="chess-promo-card">
                  <div class="chess-promo-title">{T.promoTitle}</div>
                  <div class="chess-promo-row">
                    {['q', 'r', 'b', 'n'].map((t) => (
                      <button
                        type="button"
                        key={t}
                        class="chess-promo-btn"
                        aria-label={T.piece[t]}
                        onPointerDown={() => send(`${nameOf(promo.from)}${nameOf(promo.to)}${t}`)}
                      >
                        <svg viewBox="0 0 100 100" aria-hidden="true">
                          <use href={`#${SYM}${moverPiece(t)}`} />
                        </svg>
                        <span>{T.piece[t]}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" class="chess-promo-cancel" onPointerDown={() => setPromo(null)}>
                    {T.cancel}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
