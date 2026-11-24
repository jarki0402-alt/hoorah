/**
 * Long-distance play, far-away main screen: poses a local `RuntuhMatch` from the Host's published
 * states and draws it with the same `RuntuhScene` and HUD the Host uses. The match here never
 * ticks, so no rules, computer contestants, phones or sounds run: every frame the players, tiles,
 * faces, glow, round and sim time are written from the interpolated states, and the HUD signals are
 * copied from them. Crumble debris starts when a tile drops here; the other flourishes (MULAI,
 * RUNTUH, shoves, falls, near misses) replay from the Host's numbered event log when the drawn sim
 * time reaches them, so they line up with the stage on screen. Tiles and the rule card's countdown
 * run on server time (from the newest state), so they crack, drop and count out when the Host
 * judges them, a little ahead of the players drawn in the past.
 */
import type { SolidState } from '../../shared/kotak/solids';
import { COLOR_HEX, TILES, type TileFace } from './arena';
import type { Chip, FinalRow, HudStore, ScoreRow } from './hud';
import { RuntuhMatch } from './logic';
import {
  applyMirror,
  decodeFaces,
  type EventEntry,
  FLAG,
  MirrorTimeline,
  type PlayerRow,
  type Posed,
  type RuntuhMirror,
  ruleNow,
  simNow,
  type TileNow,
  tilesNow,
} from './mirror';
import type { RuntuhScene } from './scene';
import { type ShowTarget, showEvent } from './show';

/** Standing on a tile top (y = 0) within this band counts as on the ground (m). */
const GROUND_LOW = -0.2;
const GROUND_HIGH = 0.25;
/** A flourish drawn this late (sim s) is skipped rather than shown out of place. */
const STALE_S = 2.5;
/** Debris only for a drop seen as it happens, not for one that is long over (sim s). */
const DEBRIS_S = 0.5;

const seat = (p: PlayerRow) => ({ id: p.id, name: p.n, fruit: p.f, look: p.l, color: p.c, cpu: p.id < 0 });

/** The local match the far-away screen poses (no players until the first state names them). */
export function replicaMatch(): RuntuhMatch {
  const m = new RuntuhMatch({ players: [], seed: 1 });
  m.drainEvents();
  return m;
}

export class RuntuhReplica {
  private readonly timeline = new MirrorTimeline();
  private queue: EventEntry[] = [];
  private seq: number | null = null;
  private shown: RuntuhMirror | null = null;
  private readonly keys = new Map<string, string>();
  private rosterKey = '';
  private rulesKey = '';
  private facesKey = '';
  private tags: boolean | null = null;
  private chips = new Map<number, Chip>();
  private drawn: SolidState[] | null = null;
  private localPaused = false;
  private readonly target: ShowTarget;

  constructor(
    private readonly m: RuntuhMatch,
    private readonly scene: RuntuhScene,
    private readonly hud: HudStore,
  ) {
    this.target = {
      hud,
      scene,
      chip: (id) => this.chips.get(id) ?? null,
      body: (id) => {
        const b = m.sim.body(id);
        return b ? { ...b.pos } : null;
      },
    };
  }

  /** True while the drawn stage is mid-round (graphics ladder). */
  get running(): boolean {
    const s = this.shown;
    return !!s && !s.pz && s.ph === 'play';
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
    if (!p) {
      this.scene.frame(1, dt);
      return;
    }
    const s = p.s;
    if (s !== this.shown) {
      this.shown = s;
      this.syncRoster(s);
      this.syncStage(s);
      this.syncHud(s);
    }
    this.applyPose(p, now);
    this.fire(p.simT);
    this.put('rule', this.hud.rule, ruleNow(this.timeline.latest ?? s, now));
    this.scene.frame(1, s.pz ? 0 : dt);
  }

  /* ------------------------------------------------------------------ match */

  private syncRoster(s: RuntuhMirror): void {
    const key = JSON.stringify(s.pl);
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    this.chips = new Map(s.pl.map((p) => [p.id, { id: p.id, name: p.n, fruit: p.f, look: p.l, color: p.c }]));
    const m = this.m;
    const ids = new Set(s.pl.map((p) => p.id));
    for (const c of [...m.players]) if (!ids.has(c.id)) m.removePlayer(c.id);
    for (const p of s.pl) {
      if (m.player(p.id)) m.restyle(p.id, { name: p.n, fruit: p.f, look: p.l, color: p.c });
      else m.addPlayer(seat(p));
    }
    m.drainEvents();
    this.scene.setPlayers(
      m.players.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color })),
    );
    // New avatars come with their tag shown: apply the round's tag state again.
    this.tags = null;
  }

  /** Round, rules, faces, glow and lights: the discrete facts of the drawn state. */
  private syncStage(s: RuntuhMirror): void {
    const m = this.m;
    const rules = s.rl.join(',');
    if (rules !== this.rulesKey) {
      this.rulesKey = rules;
      m.rules.splice(0, m.rules.length, ...s.rl);
    }
    m.round = s.ro;
    m.phase = s.ph;
    m.dark = s.dk;
    m.glow = new Set(s.gl);
    if (s.fc !== this.facesKey) {
      const faces = decodeFaces(s.fc);
      if (faces) {
        this.facesKey = s.fc;
        m.faces = faces;
        m.faceVersion++;
      }
    }
    const tags = s.ph !== 'intro';
    if (tags !== this.tags) {
      this.tags = tags;
      this.scene.players.setTags(tags);
    }
  }

  private applyPose(p: Posed, now: number): void {
    const m = this.m;
    // Tiles (and the sim clock the tile layer animates by) run on server time.
    const latest = this.timeline.latest ?? p.s;
    const tileT = Math.max(p.simT, simNow(latest, now));
    m.sim.t = tileT;
    m.alpha = 1;
    for (const pr of p.runners) {
      const b = m.sim.body(pr.id);
      if (!b) continue;
      b.pos.x = b.prev.x = pr.x;
      b.pos.y = b.prev.y = pr.y;
      b.pos.z = b.prev.z = pr.z;
      b.yaw = b.prevYaw = pr.yaw;
      b.vel.x = pr.vx;
      b.vel.y = pr.vy;
      b.vel.z = pr.vz;
      b.ground = pr.y > GROUND_LOW && pr.y < GROUND_HIGH ? 0 : -1;
      b.active = (pr.flags & FLAG.hidden) === 0;
      b.stunLeft = pr.flags & FLAG.stunned ? 1 : 0;
      b.frozenLeft = pr.flags & FLAG.frozen ? 1 : 0;
    }
    this.applyTiles(tilesNow(latest, tileT), tileT);
  }

  /** Tile schedules from the Host; a tile that drops here bursts into debris like on the Host. */
  private applyTiles(tiles: readonly TileNow[], simT: number): void {
    const m = this.m;
    const first = this.drawn === null;
    const drawn = this.drawn ?? [];
    for (let i = 0; i < TILES; i++) {
      const s = m.sim.solids[i];
      const t = tiles[i];
      if (!s || !t) continue;
      s.state = t.state;
      s.since = t.since;
      s.until = t.until;
      s.goneFor = t.goneFor;
      if (!first && t.state === 'gone' && drawn[i] !== 'gone' && simT - t.since < DEBRIS_S)
        this.debris(i, m.faces[i]);
      drawn[i] = t.state;
    }
    this.drawn = drawn;
  }

  private debris(tile: number, face: TileFace | undefined): void {
    const s = this.m.sim.solids[tile];
    if (!s || !face) return;
    const at = this.m.sim.pose(s.id);
    this.scene.fx.debris(
      at.x,
      at.y + s.def.half.y,
      at.z,
      s.def.half.x * 2,
      s.def.half.z * 2,
      COLOR_HEX[face.color],
    );
  }

  private fire(simT: number): void {
    while (this.queue.length > 0 && this.queue[0]!.t <= simT) {
      const e = this.queue.shift()!;
      if (simT - e.t <= STALE_S) showEvent(e.e, this.target);
    }
  }

  /* ------------------------------------------------------------------ HUD */

  /** Sets a HUD signal only when its content changed (no re-render for an equal copy). */
  private put<T>(name: string, sig: { value: T }, value: T): void {
    const key = JSON.stringify(value);
    if (this.keys.get(name) === key) return;
    this.keys.set(name, key);
    sig.value = value;
  }

  private syncHud(s: RuntuhMirror): void {
    const h = this.hud;
    h.paused.value = s.pz || this.localPaused;
    this.put('round', h.round, s.hr);
    this.put('alive', h.alive, s.ha);
    this.put('intro', h.intro, s.ic);
    this.put('help', h.help, s.hp);
    const scores: ScoreRow[] = [];
    for (const [id, score, out, offline] of s.sc) {
      const chip = this.chips.get(id);
      if (chip) scores.push({ ...chip, score, out: out === 1, offline: offline === 1 });
    }
    this.put('scores', h.scores, scores);
    this.put(
      'end',
      h.end,
      s.en
        ? {
            title: s.en.t,
            sub: s.en.s,
            rows: s.en.r.flatMap(([id, points, survived]) => {
              const chip = this.chips.get(id);
              return chip ? [{ ...chip, points, survived: survived === 1 }] : [];
            }),
          }
        : null,
    );
    this.put(
      'final',
      h.final,
      s.fi
        ? {
            cols: s.fi.c,
            rows: s.fi.r.flatMap(([id, rounds, total, rank]): FinalRow[] => {
              const chip = this.chips.get(id);
              return chip ? [{ ...chip, rounds, total, rank }] : [];
            }),
          }
        : null,
    );
  }
}
