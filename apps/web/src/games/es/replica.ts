/**
 * Long-distance play, far-away main screen: poses a local `EsMatch` from the Host's published
 * states and draws it with the same `EsScene` and HUD the Host uses. The match here never ticks,
 * so no rules, computer skaters, phones or sounds run: every frame the skaters, phase, shot and
 * floe size are written from the interpolated states, and the HUD is built from them. The rim
 * breaks when the drawn floe gets smaller; flourishes (MELUNCUR!, DUK!, BYUR!, toasts) replay
 * from the Host's numbered event log when the drawn game time reaches them.
 */
import { type Board, boardOf, type Chip, type EndRow, type FinalRow, type HudStore } from './hud';
import type { EsMatch, PlayerInfo, Skater } from './logic';
import {
  applyMirror,
  type EsMirror,
  type EventEntry,
  FLAG,
  MirrorTimeline,
  type PlayerRow,
  type Posed,
} from './mirror';
import type { EsScene } from './scene';
import { type ShowTarget, showCrack, showEvent } from './show';

/** A flourish drawn this late (game s) is skipped rather than shown out of place. */
const STALE_S = 2.5;
/** HUD scoreboard refresh, as on the Host (ms). */
const BOARD_MS = 100;
/** Floe sizes closer than this are the same (m). */
const EDGE_EPS = 1e-3;

const seat = (p: PlayerRow): PlayerInfo => ({
  id: p.id,
  name: p.n,
  fruit: p.f,
  look: p.l,
  color: p.c,
  cpu: false,
});

export class EsReplica {
  private readonly timeline = new MirrorTimeline();
  private queue: EventEntry[] = [];
  private seq: number | null = null;
  private shown: EsMirror | null = null;
  private posed: Posed | null = null;
  private readonly keys = new Map<string, string>();
  private rosterKey = '';
  private chips = new Map<number, Chip>();
  /** Round and floe size the scene shows (null before the first frame). */
  private floe: { round: number; edge: number } | null = null;
  private lastBoard = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private readonly target: ShowTarget;

  constructor(
    private readonly scene: EsScene,
    private readonly m: EsMatch,
    private readonly hud: HudStore,
  ) {
    this.target = {
      hud,
      scene,
      chip: (id) => this.chips.get(id) ?? null,
      posOf: (id) => {
        const p = this.m.player(id);
        return p ? { x: p.pos.x, y: p.pos.y } : null;
      },
    };
  }

  /** True while the drawn floe is in a shot (graphics ladder). */
  get running(): boolean {
    const s = this.shown;
    return !!s && !s.pz && (s.ph === 'aim' || s.ph === 'slide');
  }

  /** This screen's own pause menu: the Host's game goes on, the overlay shows. */
  setLocalPause(on: boolean): void {
    this.localPaused = on;
    this.hud.paused.value = on || (this.shown?.pz ?? false);
  }

  /** A state from the Host arrived at local server time `now`. */
  push(raw: unknown, now: number): void {
    const s = applyMirror(raw);
    if (!s || !this.timeline.push(s, now)) return;
    if (this.seq === null) {
      // Joined mid-game: what already happened is not replayed.
      this.seq = s.ev.reduce((n, e) => Math.max(n, e.n), 0);
      return;
    }
    for (const e of s.ev) {
      if (e.n <= this.seq) continue;
      this.queue.push(e);
      this.seq = e.n;
    }
  }

  /** Draws one frame at local server time `now`; `dt` is the local frame time (s). */
  frame(now: number, dt: number): void {
    const p = this.timeline.sample(now);
    if (!p) return;
    const s = p.s;
    this.posed = p;
    if (s !== this.shown) {
      this.shown = s;
      this.syncChips(s);
      this.syncCards(s);
    }
    this.syncRoster(s);
    this.applyPose(p);
    this.syncFloe(s);
    this.fire(p.simT);
    this.scene.frame(s.pz ? 0 : dt);
    if (now - this.lastBoard >= BOARD_MS || now < this.lastBoard) {
      this.lastBoard = now;
      this.hud.setBoard(this.board(s));
    }
  }

  /* ------------------------------------------------------------------ match */

  private syncRoster(s: EsMirror): void {
    const key = JSON.stringify(s.pl);
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    const m = this.m;
    // Lineup changes in the intro phase never end a round or need a shot here.
    m.phase = 'intro';
    const ids = new Set(s.pl.map((p) => p.id));
    for (const p of [...m.players]) if (!ids.has(p.id)) m.removePlayer(p.id);
    for (const p of s.pl) {
      if (m.player(p.id)) m.restyle(p.id, { name: p.n, fruit: p.f, look: p.l, color: p.c });
      else m.addPlayer(seat(p));
    }
    m.drainEvents();
    this.scene.setPlayers(
      m.players.map((p) => ({ id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color })),
    );
  }

  private applyPose(p: Posed): void {
    const m = this.m;
    const s = p.s;
    m.phase = s.ph;
    m.phaseT = p.phaseT;
    m.round = s.rd;
    m.shot = s.sh;
    m.edge = s.ed;
    m.nextEdge = s.ne;
    const posed = new Map(p.skaters.map((k) => [k.id, k]));
    for (const sk of m.players) {
      const k = posed.get(sk.id);
      if (!k) {
        sk.inRound = false;
        sk.out = true;
        sk.falling = null;
        continue;
      }
      sk.inRound = (k.flags & FLAG.inRound) !== 0;
      sk.out = (k.flags & FLAG.out) !== 0;
      sk.falling = k.falling;
      sk.pos = { x: k.x, y: k.y };
      sk.vel = { x: k.vx, y: k.vy };
      const aim = (k.flags & (FLAG.locked | FLAG.live)) !== 0 ? { x: k.ax, y: k.ay } : null;
      sk.aim = k.flags & FLAG.locked ? aim : null;
      sk.live = k.flags & FLAG.live ? aim : null;
      sk.bumped = k.flags & FLAG.stunned ? 0 : 99;
    }
  }

  /** New round: the full floe; a smaller floe in the same round: the rim breaks off. */
  private syncFloe(s: EsMirror): void {
    const was = this.floe;
    this.floe = { round: s.rd, edge: s.ed };
    if (!was || was.round !== s.rd || s.ed > was.edge + EDGE_EPS) {
      this.scene.resetRound();
      return;
    }
    if (s.ed < was.edge - EDGE_EPS) {
      this.scene.crack(was.edge, s.ed);
      showCrack(this.target);
    }
  }

  private fire(simT: number): void {
    while (this.queue.length > 0 && this.queue[0]!.t <= simT) {
      const e = this.queue.shift()!;
      if (simT - e.t <= STALE_S) showEvent(e.e, this.target);
    }
  }

  /* ------------------------------------------------------------------ HUD */

  private board(s: EsMirror): Board {
    const rows = new Map((this.posed?.skaters ?? []).map((k) => [k.id, k]));
    return boardOf(
      this.m,
      s.rn,
      (p: Skater) => rows.get(p.id)?.score ?? p.total,
      (id) => ((rows.get(id)?.flags ?? 0) & FLAG.offline) !== 0,
    );
  }

  private syncChips(s: EsMirror): void {
    this.chips = new Map(s.pl.map((p) => [p.id, { id: p.id, name: p.n, fruit: p.f, look: p.l, color: p.c }]));
  }

  /** Sets a HUD signal only when its content changed (no re-render for an equal copy). */
  private put<T>(name: string, sig: { value: T }, value: T): void {
    const key = JSON.stringify(value);
    if (this.keys.get(name) === key) return;
    this.keys.set(name, key);
    sig.value = value;
  }

  private syncCards(s: EsMirror): void {
    const h = this.hud;
    h.paused.value = s.pz || this.localPaused;
    this.put('intro', h.intro, s.ic);
    this.put('help', h.help, s.hp);
    this.put('end', h.end, this.endCard(s));
    this.put('final', h.final, this.finalCard(s));
  }

  private endCard(s: EsMirror): { title: string; rows: EndRow[] } | null {
    if (!s.en) return null;
    const rows: EndRow[] = [];
    for (const [id, points, winner] of s.en.r) {
      const chip = this.chips.get(id);
      if (chip) rows.push({ ...chip, points, winner: winner === 1 });
    }
    return { title: s.en.t, rows };
  }

  private finalCard(s: EsMirror): { rows: FinalRow[]; cols: number } | null {
    if (!s.fi) return null;
    const rows: FinalRow[] = [];
    for (const [id, rounds, total, rank] of s.fi.r) {
      const chip = this.chips.get(id);
      if (chip) rows.push({ ...chip, rounds, total, rank });
    }
    return { rows, cols: s.fi.c };
  }
}
