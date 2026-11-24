/**
 * Long-distance play, far-away main screen: poses a local `TaliMatch` from the Host's published
 * states and draws it with the same `TaliScene` and HUD the Host uses. The match here never ticks,
 * so no rules, rope physics, phones or sounds run: the course is rebuilt from the Host's route,
 * seed and section, and every frame the bodies, rope lengths, phase and sim time are written from
 * the interpolated states (moving blocks follow the sim time). The rope bends over ledges and the
 * camera frames the team here, from the drawn positions. Flourishes (call-outs, toasts, dust, the
 * fall streak, confetti) replay from the Host's numbered event log when the drawn game time
 * reaches them, so they line up with the climbers on screen. The team clock reads the Host's clock
 * at server time.
 */
import { edgeBetween } from '../../shared/kotak/rope';
import { ROUTES } from './course';
import type { ClimberChip, HudStore, RosterRow } from './hud';
import { type ClimberInfo, SACK_ID, TaliMatch } from './logic';
import {
  applyMirror,
  clockAt,
  type EventEntry,
  FLAG,
  MirrorTimeline,
  type PlayerRow,
  type Posed,
  type TaliMirror,
} from './mirror';
import type { TaliScene } from './scene';
import { type ShowTarget, showEvent } from './show';
import { formatClock, STR } from './strings';

/** A flourish drawn this late (game s) is skipped rather than shown out of place. */
const STALE_S = 2.5;
/** HUD clock, progress and rope meter refresh (ms of local time). */
const HUD_MS = 100;

const info = (p: PlayerRow): ClimberInfo => ({ id: p.id, name: p.n, fruit: p.f, look: p.l, color: p.c });

export class TaliReplica {
  private readonly timeline = new MirrorTimeline();
  private match: TaliMatch | null = null;
  private matchKey = '';
  private queue: EventEntry[] = [];
  private seq: number | null = null;
  private shown: TaliMirror | null = null;
  private readonly keys = new Map<string, string>();
  private rosterKey = '';
  private marksFor: unknown = null;
  private tags: boolean | null = null;
  private cheerKey = '';
  private chips = new Map<number, ClimberChip>();
  private localPaused = false;
  private lastHud = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly scene: TaliScene,
    private readonly hud: HudStore,
  ) {}

  /** True while the drawn team climbs (graphics ladder). */
  get running(): boolean {
    const s = this.shown;
    return !!s && !s.pz && s.sg === 'play' && s.ph === 'climb';
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
      this.chips = new Map(
        s.pl.map((r) => [r.id, { id: r.id, name: r.n, fruit: r.f, look: r.l, color: r.c }]),
      );
      this.syncHud(s);
    }
    if (s.sg === 'pick' || s.pl.length === 0) return;
    const m = this.ensureMatch(s);
    this.syncRoster(m, s);
    this.applyPose(m, p);
    const step = s.pz ? 0 : dt;
    m.camera.update(m.framePoints(), step);
    this.fire(m, p.gameT);
    this.scene.frame(m, step);
    this.syncMarks(m, s);
    if (now - this.lastHud >= HUD_MS || now < this.lastHud) {
      this.lastHud = now;
      this.syncMeters(m, now);
    }
  }

  /* ------------------------------------------------------------------ match */

  /** The local match for the Host's course, on the Host's section. */
  private ensureMatch(s: TaliMirror): TaliMatch {
    const key = `${s.ro}:${s.sd}:${s.sn}`;
    let m = this.match;
    if (!m || key !== this.matchKey) {
      m = new TaliMatch({
        climbers: s.pl.map(info),
        route: s.ro,
        sections: s.sn,
        seed: s.sd,
        aspect: this.scene.stage.aspect,
      });
      this.match = m;
      this.matchKey = key;
      this.rosterKey = '';
    }
    if (m.sectionNo !== s.no) {
      m.load(s.no);
      this.rosterKey = '';
      this.scene.rope.reset();
    }
    m.drainEvents();
    return m;
  }

  /** Same climbers in the same tie order as the Host, with or without the sandbag. */
  private syncRoster(m: TaliMatch, s: TaliMirror): void {
    const key = `${JSON.stringify(s.pl)}|${s.sk}`;
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    const order = new Map(s.pl.map((p, i) => [p.id, i]));
    for (const c of [...m.climbers]) if (!order.has(c.id)) m.removeClimber(c.id);
    for (const p of s.pl) {
      if (m.climber(p.id)) m.restyle(p.id, { name: p.n, fruit: p.f, look: p.l, color: p.c });
      else m.addClimber(info(p));
    }
    m.climbers.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    m.sack = s.sk;
    const bag = m.sim.body(SACK_ID);
    if (s.sk && !bag) {
      const pos = m.trail.point(0).pos;
      m.sim.addBody({ id: SACK_ID, pos: { ...pos }, yaw: Math.PI / 2 });
    } else if (!s.sk && bag) m.sim.removeBody(SACK_ID);
    m.rope.chain(m.chainIds());
    m.drainEvents();
    this.scene.setPlayers(
      m.climbers.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color })),
    );
  }

  private applyPose(m: TaliMatch, p: Posed): void {
    const s = p.s;
    m.sim.t = p.simT;
    m.alpha = 1;
    m.phase = s.ph;
    m.phaseT = p.phaseT;
    m.sectionT = p.sectionT;
    m.teamTime = s.tt;
    m.catches = s.ca;
    for (const pb of p.bodies) {
      const b = m.sim.body(pb.id);
      if (!b) continue;
      b.pos.x = b.prev.x = pb.x;
      b.pos.y = b.prev.y = pb.y;
      b.pos.z = b.prev.z = pb.z;
      b.yaw = b.prevYaw = pb.yaw;
      b.vel.x = pb.vx;
      b.vel.y = pb.vy;
      b.vel.z = pb.vz;
      b.ground = pb.flags & FLAG.ground ? 0 : -1;
      b.frozenLeft = pb.flags & FLAG.frozen ? 1 : 0;
      b.stunLeft = pb.flags & FLAG.stunned ? 1 : 0;
      b.active = true;
      b.fallen = false;
      const c = m.climber(pb.id);
      if (c) {
        c.grip = (pb.flags & FLAG.grip) !== 0;
        c.hanging = (pb.flags & FLAG.hang) !== 0;
        c.offline = (pb.flags & FLAG.offline) !== 0;
      }
    }
    const rope = m.rope;
    for (let i = 0; i < rope.links.length; i++) {
      const link = rope.links[i]!;
      const row = p.rope[i];
      if (row && row[0] < rope.tuning.rest - 1e-3) link.rest = row[0];
      else delete link.rest;
      rope.length[i] = row?.[1] ?? 0;
      const A = m.sim.body(link.a);
      const B = m.sim.body(link.b);
      rope.bend[i] = A && B ? edgeBetween(m.sim, A, B) : null;
    }
    if (p.snap) this.scene.rope.reset();
  }

  private fire(m: TaliMatch, gameT: number): void {
    const target: ShowTarget = { hud: this.hud, scene: this.scene, match: m };
    while (this.queue.length > 0 && this.queue[0]!.t <= gameT) {
      const e = this.queue.shift()!;
      if (gameT - e.t <= STALE_S) showEvent(e.e, target);
    }
  }

  /** Name tags off on the intro card, cheering under a raised flag (as the Host's director does). */
  private syncMarks(m: TaliMatch, s: TaliMirror): void {
    const players = this.scene.players;
    if (!players) return;
    if (players !== this.marksFor) {
      // A new section built fresh avatars.
      this.marksFor = players;
      this.tags = null;
      this.cheerKey = '';
    }
    const tags = s.ph !== 'intro';
    if (tags !== this.tags) {
      this.tags = tags;
      players.setTags(tags);
    }
    const cheer = (s.ph === 'flag' || s.ph === 'done') && s.fd[s.no] === 1;
    const key = `${cheer}:${m.climbers.map((c) => c.id).join(',')}`;
    if (key === this.cheerKey) return;
    this.cheerKey = key;
    for (const c of m.climbers) players.setCheer(c.id, cheer);
  }

  /* ------------------------------------------------------------------ HUD */

  /** Sets a HUD signal only when its content changed (no re-render for an equal copy). */
  private put<T>(name: string, sig: { value: T }, value: T): void {
    const key = JSON.stringify(value);
    if (this.keys.get(name) === key) return;
    this.keys.set(name, key);
    sig.value = value;
  }

  private syncHud(s: TaliMirror): void {
    const h = this.hud;
    h.paused.value = s.pz || this.localPaused;
    this.put(
      'pick',
      h.pick,
      s.pk
        ? {
            selected: s.ro,
            options: ROUTES.map((id, i) => ({ id, name: STR.routes[id].name, sub: s.pk?.os[i] ?? '' })),
            sub: s.pk.sub,
            note: s.pk.note,
          }
        : null,
    );
    this.put('brand', h.brand, s.br);
    this.put('intro', h.intro, s.ic);
    this.put('flagCard', h.flagCard, s.fc);
    if (s.pl.length === 0) return;
    this.put('playing', h.playing, s.ph === 'climb');
    this.put('catches', h.catches, s.ca);
    this.put('flags', h.flags, {
      total: s.sn,
      done: Array.from({ length: s.sn }, (_, i) => s.fd[i] === 1),
      current: s.no,
    });
    this.put('roster', h.roster, this.roster(s));
  }

  private roster(s: TaliMirror): RosterRow[] {
    const rows: RosterRow[] = [];
    for (const [id, , , , , flags] of s.bo) {
      const chip = this.chips.get(id);
      if (!chip) continue;
      const state: RosterRow['state'] =
        flags & FLAG.offline ? 'off' : flags & FLAG.hang ? 'hang' : flags & FLAG.grip ? 'grip' : 'ok';
      rows.push({ ...chip, state });
    }
    return rows;
  }

  /** Team clock at server time; progress and rope strain from the drawn climb. */
  private syncMeters(m: TaliMatch, now: number): void {
    const h = this.hud;
    const latest = this.timeline.latest;
    if (latest) {
      const c = clockAt(latest, now);
      this.put('clock', h.clock, formatClock(c.total));
      this.put('left', h.left, c.left !== null && c.left <= 20 ? STR.leftLabel(Math.ceil(c.left)) : null);
    }
    this.put('progress', h.progress, Math.round(m.progress() * 1000) / 1000);
    this.put('tension', h.tension, Math.round(m.rope.maxStrain() * 100) / 100);
  }
}
