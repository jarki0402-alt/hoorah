/**
 * Main-screen state for the board and HUD. Structure changes go through signals; per-frame values
 * (the turn timer ring) and pawn animations are written straight to the DOM, so nothing
 * re-renders at 60 fps.
 */
import type { Fruit, Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { type BoardGeom, layoutPawns, type PawnRef, type PlacedPawn, pawnPoint } from './geometry';
import { type ColorId, HOP_MS } from './logic';

export interface PlayerCard {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
  connected: boolean;
}

export interface SeatCard {
  index: number;
  color: ColorId;
  player: PlayerCard;
  /** Progress of each pawn. */
  pawns: number[];
  home: number;
  active: boolean;
  winner: boolean;
}

export interface TurnInfo {
  seat: number;
  color: ColorId;
  player: PlayerCard;
  bonus: boolean;
  /** Nobody of this colour is connected: the turn plays itself. */
  auto: boolean;
}

export type Banner =
  | { kind: 'intro'; key: number; first: string | null; note: string | null }
  | { kind: 'finale'; key: number; title: string; sub: string; winners: PlayerCard[]; color: ColorId };

export interface HudModel {
  pawnsPer: number;
  /** Board shape: 4 = classic, 5..8 = polygon. */
  sides: number;
  colors: ColorId[];
  seats: SeatCard[];
  turn: TurnInfo | null;
  dice: number | null;
  rolling: boolean;
  /** Bumps on every roll so the dice tumble restarts. */
  rollId: number;
  hint: string;
  /** A 6 was just rolled and will give another roll. */
  six: boolean;
  /** The game is over (finale on screen). */
  over: boolean;
  /** `seat-pawn` keys of pawns the roller can pick right now. */
  legal: string[];
  banner: Banner | null;
}

/** One move as the board animates it (the Host's logic or a far-away screen's mirror state). */
export interface ShownMove {
  seat: number;
  pawn: number;
  color: ColorId;
  /** Progress after each hop. */
  path: number[];
  captures: { seat: number; pawn: number }[];
}

export interface Toast {
  id: number;
  text: string;
  sub: string | null;
  tone: 'six' | 'capture' | 'home' | 'bad' | 'exit';
  until: number;
}

export interface Burst {
  id: number;
  x: number;
  y: number;
  color: string;
  until: number;
}

const EMPTY: HudModel = {
  pawnsPer: 2,
  sides: 4,
  colors: [],
  seats: [],
  turn: null,
  dice: null,
  rolling: false,
  rollId: 0,
  hint: '',
  six: false,
  over: false,
  legal: [],
  banner: null,
};

const RING_R = 19;
export const RING_LEN = 2 * Math.PI * RING_R;
export { RING_R };

/** Keyframe easing for the way up and the way down of a hop. */
const UP = 'cubic-bezier(0.2, 0.6, 0.4, 1)';
const DOWN = 'cubic-bezier(0.6, 0, 0.8, 0.4)';

export class LudoStore {
  readonly model = signal<HudModel>(EMPTY);
  readonly pawns = signal<PawnRef[]>([]);
  readonly toast = signal<Toast | null>(null);
  readonly bursts = signal<Burst[]>([]);
  readonly paused = signal(false);

  /** Pawn elements by `seat-pawn`, registered by the board. */
  readonly pawnEls = new Map<string, HTMLDivElement>();
  /** Stage px per board unit and the grid origin inside the board element. */
  unit = 40;
  origin = 20;
  /** Size of one loop square in stage px (pawns are sized from it). */
  cell = 40;
  ringArc: SVGCircleElement | null = null;
  ringText: HTMLDivElement | null = null;
  ringBox: HTMLDivElement | null = null;
  private lastRing = Number.NaN;
  private lastSecs = -1;
  private lastUrgent: boolean | null = null;
  private lastShow: boolean | null = null;

  /** Stage px (inside the board element) of a point in board units. */
  px(x: number): number {
    return this.origin + x * this.unit;
  }

  /** CSS transform of a pawn whose foot stands on (x, y). */
  pawnTransform(x: number, y: number, scale: number, lift = 0): string {
    const w = this.cell * 0.84;
    const h = w * 1.2;
    const left = this.px(x) - w / 2;
    const top = this.px(y) + this.cell * 0.36 - h - lift;
    return `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${scale})`;
  }

  /** Hop a pawn along its path: one arc per square, landing on its final (fanned) spot. */
  animateMove(
    key: string,
    from: PlacedPawn,
    points: { x: number; y: number }[],
    to: PlacedPawn,
    hopMs: number,
  ) {
    const el = this.pawnEls.get(key);
    if (!el || points.length === 0) return;
    const pts = [{ x: from.x, y: from.y, s: from.scale }];
    points.forEach((p, i) => {
      const last = i === points.length - 1;
      pts.push(last ? { x: to.x, y: to.y, s: to.scale } : { x: p.x, y: p.y, s: 1 });
    });
    const n = pts.length - 1;
    const lift = this.cell * (n === 1 && points.length === 1 ? 0.9 : 0.55);
    const frames: Keyframe[] = [];
    for (let i = 0; i <= n; i++) {
      const p = pts[i]!;
      frames.push({ offset: i / n, transform: this.pawnTransform(p.x, p.y, p.s), easing: UP });
      if (i < n) {
        const q = pts[i + 1]!;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        frames.push({
          offset: (i + 0.5) / n,
          transform: this.pawnTransform(mx, my, 1.08, lift),
          easing: DOWN,
        });
      }
    }
    el.classList.add('is-moving');
    const anim = el.animate(frames, { duration: n * hopMs, fill: 'backwards' });
    anim.onfinish = () => el.classList.remove('is-moving');
    anim.oncancel = () => el.classList.remove('is-moving');
  }

  /** A captured pawn flies back to its base after the attacker lands. */
  animateHomeward(key: string, from: PlacedPawn, to: PlacedPawn, delayMs: number) {
    const el = this.pawnEls.get(key);
    if (!el) return;
    const a = this.pawnTransform(from.x, from.y, from.scale);
    const b = this.pawnTransform(to.x, to.y, to.scale);
    const mx = (from.x + to.x) / 2;
    const my = Math.min(from.y, to.y) - (2.2 * this.cell) / this.unit;
    const mid = this.pawnTransform(mx, my, 1.25);
    el.classList.add('is-moving');
    const anim = el.animate(
      [
        { offset: 0, transform: `${a} rotate(0deg)`, easing: UP },
        {
          offset: 0.12,
          transform: `${this.pawnTransform(from.x, from.y, from.scale * 1.15, -this.cell * 0.05)} rotate(0deg)`,
          easing: UP,
        },
        { offset: 0.5, transform: `${mid} rotate(200deg)`, easing: DOWN },
        { offset: 1, transform: `${b} rotate(360deg)` },
      ],
      { duration: 700, delay: delayMs, fill: 'backwards' },
    );
    anim.onfinish = () => el.classList.remove('is-moving');
    anim.oncancel = () => el.classList.remove('is-moving');
  }

  /**
   * Animates a move between two pawn lists: the mover hops its path, captured pawns fly home once
   * it lands. Returns where the mover ends up (for the capture burst).
   */
  playMove(
    g: BoardGeom,
    before: readonly PawnRef[],
    after: readonly PawnRef[],
    perColor: number,
    m: ShownMove,
  ): PlacedPawn | undefined {
    const from0 = layoutPawns(g, before, perColor);
    const to0 = layoutPawns(g, after, perColor);
    const find = (list: PlacedPawn[], seat: number, pawn: number) =>
      list.find((p) => p.seat === seat && p.pawn === pawn);
    const key = `${m.seat}-${m.pawn}`;
    const from = find(from0, m.seat, m.pawn);
    const to = find(to0, m.seat, m.pawn);
    if (from && to) {
      const pts = m.path.map((p) => pawnPoint(g, m.color, p, m.pawn, perColor));
      this.animateMove(key, from, pts, to, HOP_MS);
    }
    const walk = m.path.length * HOP_MS;
    for (const c of m.captures) {
      const a = find(from0, c.seat, c.pawn);
      const b = find(to0, c.seat, c.pawn);
      if (a && b) this.animateHomeward(`${c.seat}-${c.pawn}`, a, b, walk);
    }
    return to ?? from;
  }

  addBurst(b: Burst): void {
    this.bursts.value = [...this.bursts.value.slice(-5), b];
  }

  /** Per rendered frame: timer ring + expiring toasts/bursts. */
  frame(now: number, ring: number, secs: number, show: boolean): void {
    if (this.ringArc && !(Math.abs(ring - this.lastRing) <= 0.002)) {
      this.lastRing = ring;
      this.ringArc.setAttribute('stroke-dashoffset', (RING_LEN * (1 - ring)).toFixed(2));
    }
    if (this.ringText && secs !== this.lastSecs) {
      this.lastSecs = secs;
      this.ringText.textContent = show ? String(secs) : '';
    }
    const urgent = show && secs <= 3;
    if (this.ringBox && urgent !== this.lastUrgent) {
      this.lastUrgent = urgent;
      this.ringBox.classList.toggle('is-urgent', urgent);
    }
    if (this.ringBox && show !== this.lastShow) {
      this.lastShow = show;
      this.ringBox.classList.toggle('is-off', !show);
    }
    const t = this.toast.value;
    if (t && t.until <= now) this.toast.value = null;
    const b = this.bursts.value;
    if (b.length && b[0]!.until <= now) this.bursts.value = b.filter((x) => x.until > now);
  }

  invalidate(): void {
    this.lastRing = Number.NaN;
    this.lastSecs = -1;
    this.lastUrgent = null;
    this.lastShow = null;
  }
}
