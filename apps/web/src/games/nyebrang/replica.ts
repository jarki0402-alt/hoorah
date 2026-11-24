/**
 * Long-distance play, far-away main screen: drives the same Phaser scene and HUD as the Host's
 * driver, from the published display state. No rules, computer runners, phones or sounds run here
 * (the shell forwards the Host's sounds and music).
 *
 * The world is drawn at the Host's match time for this server moment (`MatchClock`), so every
 * vehicle, log and train stands exactly where the Host has it now: a far-away player swipes
 * against the same traffic the Host judges (at the phone's stamp, see logic.ts). Runners come
 * from the newest packet, carried forward with what is deterministic (a hop landing on a log,
 * drifting with it). A hop this screen learns of late is played whole from where the runner is
 * drawn, so it never jumps; deaths, near misses and finishes replay the Host's flourishes.
 */
import type { HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { StageEffects } from './effects';
import type { Hud } from './hud';
import { type MapId, World } from './lanes';
import { type DeathKind, type Dir, type Hop, type Phase, type Posed, poseAt, TUNING } from './logic';
import {
  applyMirror,
  camAt,
  DEATHS,
  MarkReader,
  MatchClock,
  type MirrorAction,
  mirrorHud,
  type NyebrangMirror,
  type RunnerWire,
  restPose,
  STATES,
  worldKey,
  worldOf,
} from './mirror';
import type { NyebrangScene, RunnerLook, StageModel, StageRunner } from './scene';

const HUD_MS = 100;
/** Time constant (s) of the camera easing toward the Host's; further than `CAM_SNAP` rows, it jumps. */
const CAM_EASE_S = 0.15;
const CAM_SNAP = 3;

/** A runner as this screen draws it. */
interface Shown extends StageRunner {
  id: number;
  x: number;
  row: number;
  hop: Hop | null;
  state: StageRunner['state'];
  deaths: number;
  deadAt: number;
  deathX: number;
  deathRow: number;
  death: DeathKind | null;
  wire: RunnerWire;
  /** A hop being played here: where it started on this screen, when (match s), which way. */
  from: { x: number; row: number } | null;
  start: number;
  dir: Dir | null;
  /** Match time this screen saw the death (the fall animation plays whole). */
  seenDeath: number;
}

function hopDir(from: { x: number; row: number }, to: { x: number; row: number }): Dir {
  const dr = to.row - from.row;
  if (dr > 0.5) return 'up';
  if (dr < -0.5) return 'down';
  return to.x < from.x ? 'left' : 'right';
}

export class NyebrangReplica implements StageModel {
  map: MapId = 'kota';
  cam = 0;
  t = 0;
  phase: Phase = 'setup';
  world: World = new World('kota', 0, null);
  roster: Shown[] = [];
  private readonly shown = new Map<number, Shown>();
  private readonly looks = new Map<number, RunnerLook>();
  private readonly reader = new MarkReader();
  private readonly clock = new MatchClock();
  private readonly fx: StageEffects;
  private latest: NyebrangMirror | null = null;
  private worldId = '';
  private lastNow: number | null = null;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;
  private hostHeld = false;
  private frozen = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: NyebrangScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {
    this.fx = new StageEffects(scene, hud);
  }

  start(): void {
    this.game.on('mirror', (state) => this.apply(state));
    this.game.on('pause', (paused) => {
      this.localPaused = paused;
      this.syncPause();
    });
    this.localPaused = this.game.paused;
    this.syncPause();
    this.scene.onFrame = () => this.frame();
  }

  pose(r: Posed): { x: number; row: number; lift: number } {
    return poseAt(r, this.t);
  }

  /* ------------------------------------------------------------------ packets */

  private apply(raw: unknown): void {
    const s = applyMirror(raw);
    if (!s) return;
    const prev = this.latest;
    // A late packet from a slower route: the newer state is already shown.
    if (prev && s.t < prev.t) return;
    this.latest = s;
    // Nothing is drawn before the first packet (the world would not be the Host's).
    if (!prev) this.scene.attach(this, this.looks);
    const now = this.game.now();
    this.clock.push(s);
    this.t = this.clock.at(now);
    this.phase = s.ph;
    const fresh = worldKey(s) !== this.worldId;
    if (fresh) {
      this.worldId = worldKey(s);
      this.world = worldOf(s);
      this.map = s.w[0];
      this.cam = camAt(s, this.t);
    }
    const actions = this.reader.read(s);
    // Hops start from where the runner is drawn now, before the new packet moves it.
    for (const a of actions) if (a.type === 'hop') this.startHop(a.id, a.dir);
    this.syncRoster(s, fresh);
    for (const a of actions) this.play(a);
    if (prev && prev.ph !== 'final' && s.ph === 'final') window.setTimeout(celebrate, 300);
    this.hostHeld = s.hold === 1;
    this.syncPause();
    if (!prev || prev.ph !== s.ph || prev.ov[0] !== s.ov[0]) this.renderHud(now);
  }

  private syncRoster(s: NyebrangMirror, fresh: boolean): void {
    const ids = new Set<number>();
    let looksChanged = false;
    for (const w of s.rs) {
      const id = w[0];
      ids.add(id);
      let r = this.shown.get(id);
      if (!r || fresh) {
        r = {
          id,
          x: w[6],
          row: w[7],
          hop: null,
          state: 'run',
          deaths: 0,
          deadAt: w[11],
          deathX: w[12],
          deathRow: w[13],
          death: null,
          wire: w,
          from: null,
          start: 0,
          dir: null,
          seenDeath: Number.NEGATIVE_INFINITY,
        };
        this.shown.set(id, r);
      }
      r.wire = w;
      const look = this.looks.get(id);
      if (!look || look.color !== w[3] || JSON.stringify(look.look) !== JSON.stringify(w[2])) {
        this.looks.set(id, { look: w[2], color: w[3] });
        looksChanged = true;
      }
      this.place(r);
    }
    for (const id of [...this.shown.keys()]) {
      if (ids.has(id)) continue;
      this.shown.delete(id);
      this.looks.delete(id);
      looksChanged = true;
    }
    this.roster = s.rs.map((w) => this.shown.get(w[0])!);
    if (looksChanged) this.scene.setLooks(this.looks);
  }

  private startHop(id: number, dir: Dir | null): void {
    const r = this.shown.get(id);
    if (!r) return;
    const p = poseAt(r, this.t);
    r.from = { x: p.x, row: p.row };
    r.start = this.t;
    r.dir = dir;
    this.fx.hop(id, p.x, p.row);
  }

  private play(a: MirrorAction): void {
    const s = this.latest;
    if (!s) return;
    switch (a.type) {
      case 'hop':
        return;
      case 'death': {
        const r = this.shown.get(a.id);
        if (r) {
          r.seenDeath = this.t;
          r.from = null;
          this.place(r);
        }
        this.fx.death(a.kind, a.x, a.row, s.mo);
        return;
      }
      case 'respawn': {
        const r = this.shown.get(a.id);
        if (r) r.from = null;
        this.fx.respawn(a.id);
        return;
      }
      case 'near': {
        const r = this.shown.get(a.id);
        if (r) {
          const p = poseAt(r, this.t);
          this.fx.near(p.x, p.row);
        }
        return;
      }
      case 'finish': {
        const r = this.shown.get(a.id);
        if (r) this.fx.finish(a.place, r.x, r.row);
        return;
      }
      case 'horn':
        this.scene.fxHorn(a.row);
        return;
    }
  }

  /* ------------------------------------------------------------------ drawing */

  /** Brings one runner to this screen's match time `this.t`. */
  private place(r: Shown): void {
    const s = this.latest;
    if (!s) return;
    const w = r.wire;
    r.state = STATES[w[5]] ?? 'run';
    r.deaths = w[16];
    r.death = w[10] >= 0 ? (DEATHS[w[10]] ?? null) : null;
    r.deathX = w[12];
    r.deathRow = w[13];
    r.deadAt = Math.max(w[11], r.seenDeath);
    const rest = restPose(this.world, w, s.mt, this.t);
    r.x = rest.x;
    r.row = rest.row;
    const from = r.from;
    if (r.state !== 'run' && r.state !== 'done') {
      r.from = null;
      r.hop = null;
      return;
    }
    if (from && this.t - r.start < TUNING.hop) {
      r.hop = {
        fx: from.x,
        fr: from.row,
        tx: rest.x,
        tr: rest.row,
        t0: r.start,
        dir: r.dir ?? hopDir(from, rest),
      };
      return;
    }
    r.from = null;
    r.hop = null;
  }

  private syncPause(): void {
    const frozen = this.localPaused || this.hostHeld;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    this.hud.setPaused(frozen);
    if (frozen) this.phaser.pause();
    else this.phaser.resume();
  }

  private danger(): boolean {
    if (this.phase !== 'run') return false;
    return this.roster.some((r) => r.state === 'run' && r.row - this.cam < 1.2);
  }

  private renderHud(now: number): void {
    const s = this.latest;
    if (!s) return;
    this.lastHud = now;
    this.hud.set(mirrorHud(s, now, this.t, this.danger()));
  }

  private frame(): void {
    const s = this.latest;
    if (!s) return;
    const now = this.game.now();
    const dt = this.lastNow === null ? 0 : Math.max(0, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.t = this.clock.at(now);
    const target = camAt(s, this.t);
    if (s.ph !== 'run' || Math.abs(target - this.cam) > CAM_SNAP) this.cam = target;
    else this.cam += (target - this.cam) * Math.min(1, dt / CAM_EASE_S);
    for (const r of this.roster) this.place(r);
    this.fx.tags(this, (id) => {
      const w = this.shown.get(id)?.wire;
      return w ? { name: w[1], color: w[3], dim: w[4] === 1 } : null;
    });
    this.hud.tidy();
    if (now - this.lastHud >= HUD_MS) this.renderHud(now);
  }
}
