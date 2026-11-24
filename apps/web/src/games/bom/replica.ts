/**
 * Long-distance play, far-away main screen: poses a local `BomMatch` from the Host's published
 * states and draws it with the same `BomScene` and HUD the Host uses. The match here never ticks,
 * so no rules, computer runners, phones or sounds run: every frame the runners, bombs, phase and
 * sim time are written from the interpolated states, and the HUD signals are copied from them.
 * Flourishes (OPER call-outs, the BUM burst, toasts) replay from the Host's numbered event log
 * when the drawn sim time reaches them, so they line up with the runners on screen.
 */
import { ARENAS } from './arena';
import type { CardRow, HudStore, RunnerChip, ScoreCard } from './hud';
import { type Bomb, BomMatch, type RunnerInfo } from './logic';
import {
  applyMirror,
  type BomMirror,
  type EventEntry,
  FLAG,
  MirrorTimeline,
  type PlayerRow,
  type Posed,
} from './mirror';
import type { BomScene } from './scene';
import { type ShowTarget, showEvent } from './show';
import { STR } from './strings';

/** Above this the runner is in the air (m). */
const AIR_Y = 0.3;
/** A flourish drawn this late (sim s) is skipped rather than shown out of place. */
const STALE_S = 2.5;

const info = (p: PlayerRow): RunnerInfo => ({ id: p.id, name: p.n, fruit: p.f, look: p.l, color: p.c });

export class BomReplica {
  private readonly timeline = new MirrorTimeline();
  private match: BomMatch | null = null;
  private queue: EventEntry[] = [];
  private seq: number | null = null;
  private shown: BomMirror | null = null;
  private readonly keys = new Map<string, string>();
  private rosterKey = '';
  private cheerKey = '';
  private tags: boolean | null = null;
  private chips = new Map<number, RunnerChip>();
  private localPaused = false;
  private readonly target: ShowTarget;

  constructor(
    private readonly scene: BomScene,
    private readonly hud: HudStore,
  ) {
    this.target = { hud, scene, chip: (id) => this.chips.get(id) ?? null };
  }

  /** True while the drawn yard is in the chase (graphics ladder). */
  get running(): boolean {
    const s = this.shown;
    return !!s && !s.pz && s.sg === 'play' && s.ph === 'play';
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
    if (s !== this.shown) {
      this.shown = s;
      this.syncChips(s);
      this.syncHud(s);
    }
    if (s.pl.length === 0) return;
    const m = this.ensureMatch(s);
    this.syncRoster(m, s);
    this.applyPose(m, p);
    this.fire(p.simT);
    this.scene.frame(m, s.pz ? 0 : dt);
    this.syncMarks(m, s);
  }

  /* ------------------------------------------------------------------ match */

  private ensureMatch(s: BomMirror): BomMatch {
    if (this.match) return this.match;
    const m = new BomMatch({
      runners: s.pl.map(info),
      arena: s.ar,
      rounds: s.rn,
      seed: 1,
      aspect: this.scene.stage.aspect,
    });
    m.drainEvents();
    this.match = m;
    this.rosterKey = '';
    return m;
  }

  private syncRoster(m: BomMatch, s: BomMirror): void {
    const key = JSON.stringify(s.pl);
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    const ids = new Set(s.pl.map((p) => p.id));
    for (const r of [...m.runners]) if (!ids.has(r.id)) m.removeRunner(r.id);
    for (const p of s.pl) {
      if (m.runner(p.id)) m.restyle(p.id, { name: p.n, fruit: p.f, look: p.l, color: p.c });
      else m.addRunner(info(p));
    }
    m.drainEvents();
    this.scene.setPlayers(
      m.runners.map((r) => ({ id: r.id, name: r.name, fruit: r.fruit, look: r.look, color: r.color })),
    );
  }

  private applyPose(m: BomMatch, p: Posed): void {
    const s = p.s;
    m.sim.t = p.simT;
    m.alpha = 1;
    m.phase = s.ph;
    m.phaseT = p.phaseT;
    m.roundNo = s.no;
    for (const pr of p.runners) {
      const r = m.runner(pr.id);
      const b = m.sim.body(pr.id);
      if (!r || !b) continue;
      const out = (pr.flags & FLAG.out) !== 0;
      r.lives = pr.lives;
      r.out = out;
      r.immuneUntil = pr.flags & FLAG.immune ? p.simT + 1 : 0;
      b.pos.x = b.prev.x = pr.x;
      b.pos.y = b.prev.y = pr.y;
      b.pos.z = b.prev.z = pr.z;
      b.yaw = b.prevYaw = pr.yaw;
      b.vel.x = pr.vx;
      b.vel.y = pr.vy;
      b.vel.z = pr.vz;
      b.ground = pr.y > AIR_Y ? -1 : 0;
      b.frozenLeft = pr.flags & FLAG.frozen ? 1 : 0;
      b.stunLeft = pr.flags & FLAG.stunned ? 1 : 0;
      b.active = !out;
    }
    m.bombs = s.bo.map(
      ([holder, , exploded, flight], index): Bomb => ({
        index,
        holder,
        // Only the burnt share crosses the network: a unit fuse lit that long ago burns the same.
        fuse: 1,
        litAt: p.simT - (p.burnt[index] ?? 0),
        heldSince: 0,
        flight: flight ? { from: flight[0], to: holder, at: flight[1] } : null,
        exploded: exploded === 1,
      }),
    );
  }

  private fire(simT: number): void {
    while (this.queue.length > 0 && this.queue[0]!.t <= simT) {
      const e = this.queue.shift()!;
      if (simT - e.t <= STALE_S) showEvent(e.e, this.target);
    }
  }

  /** Name tags off on the round card, cheering on the scoreboard (as the Host's director does). */
  private syncMarks(m: BomMatch, s: BomMirror): void {
    const players = this.scene.players;
    if (!players) return;
    const tags = s.ph !== 'intro';
    if (tags !== this.tags) {
      this.tags = tags;
      players.setTags(tags);
    }
    const cheer =
      (s.ph === 'score' || s.ph === 'done') && s.sc
        ? new Set(s.sc.r.filter(([, , lost, out]) => lost === 0 && out === 0).map(([id]) => id))
        : new Set<number>();
    const key = [...cheer].join(',');
    if (key === this.cheerKey) return;
    this.cheerKey = key;
    for (const r of m.runners) players.setCheer(r.id, cheer.has(r.id));
  }

  /* ------------------------------------------------------------------ HUD */

  private syncChips(s: BomMirror): void {
    this.chips = new Map(s.pl.map((p) => [p.id, { id: p.id, name: p.n, fruit: p.f, look: p.l, color: p.c }]));
  }

  /** Sets a HUD signal only when its content changed (no re-render for an equal copy). */
  private put<T>(name: string, sig: { value: T }, value: T): void {
    const key = JSON.stringify(value);
    if (this.keys.get(name) === key) return;
    this.keys.set(name, key);
    sig.value = value;
  }

  private syncHud(s: BomMirror): void {
    const h = this.hud;
    h.paused.value = s.pz || this.localPaused;
    this.put(
      'pick',
      h.pick,
      s.pk
        ? {
            selected: s.ar,
            options: ARENAS.map((id) => ({ id, name: STR.arenas[id].name, sub: STR.arenas[id].sub })),
            sub: s.pk.sub,
            note: s.pk.note,
          }
        : null,
    );
    this.put('brand', h.brand, s.br);
    this.put('banner', h.banner, s.bn);
    this.put('intro', h.intro, s.ic);
    this.put('score', h.score, this.scoreCard(s));
    this.put('cards', h.cards, this.cards(s));
  }

  private scoreCard(s: BomMirror): ScoreCard | null {
    const sc = s.sc;
    if (!sc) return null;
    const rows: ScoreCard['rows'] = [];
    for (const [id, lives, lost, out] of sc.r) {
      const chip = this.chips.get(id);
      if (chip) rows.push({ ...chip, lives, lost: lost === 1, out: out === 1 });
    }
    return { title: sc.t, line: sc.l, sub: sc.s, rows };
  }

  private cards(s: BomMirror): CardRow[] {
    const live = s.ph === 'play' || s.ph === 'drop';
    const holders = new Set(s.bo.filter((b) => b[2] === 0).map((b) => b[0]));
    const rows: CardRow[] = [];
    for (const [id, , , , , lives, flags] of s.ru) {
      const chip = this.chips.get(id);
      if (!chip) continue;
      rows.push({
        ...chip,
        lives,
        bomb: live && holders.has(id),
        out: (flags & FLAG.out) !== 0,
        immune: (flags & FLAG.immune) !== 0,
        offline: (flags & FLAG.offline) !== 0,
      });
    }
    return rows;
  }
}
