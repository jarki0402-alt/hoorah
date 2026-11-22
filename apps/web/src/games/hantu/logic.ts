/**
 * Hantu Tak Terlihat session (pure). The Host picks the place and how scary; then `rounds`
 * rounds are played with the ghost role passed around (a computer ghost when one person plays).
 * Points per round: residents +3 for escaping, +1 per key, +1 for helping at the fuse, +1 per 3 s
 * of light on the ghost (max 3), +1 per narrow escape (max 2); the ghost +2 per catch and +3
 * when the ghost side wins.
 *
 * Phases: setup → reveal → hunt → end → (reveal of the next round | done).
 */
import { MAPS, type MapId } from './maps';
import { type Fright, type HauntEvent, HauntWorld, SKINS, type Skin } from './world';

export const REVEAL_S = 4.5;
export const END_S = 6.5;

export type Phase = 'setup' | 'reveal' | 'hunt' | 'end' | 'done';
export type SetupStep = 'map' | 'fright';

export interface Person {
  id: number;
  name: string;
  connected: boolean;
}

export interface Tally {
  id: number;
  points: number;
  keys: number;
  fuse: number;
  lit: number;
  near: number;
  escapes: number;
  catches: number;
  flyS: number;
  ghostRounds: number;
}

export interface RoundResult {
  winner: 'penghuni' | 'hantu';
  ghostId: number;
  skin: Skin;
  escaped: number;
  residents: number;
  points: Map<number, number>;
}

export type MatchEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'round'; index: number }
  | { type: 'world'; e: HauntEvent };

function emptyTally(id: number): Tally {
  return {
    id,
    points: 0,
    keys: 0,
    fuse: 0,
    lit: 0,
    near: 0,
    escapes: 0,
    catches: 0,
    flyS: 0,
    ghostRounds: 0,
  };
}

/** Who haunts round `round`: people take turns from `offset`; alone, the computer (cpuId). */
export function ghostFor(people: readonly number[], round: number, offset: number, cpuId: number): number {
  if (people.length < 2) return cpuId;
  const n = people.length;
  return people[(((offset + round) % n) + n) % n]!;
}

export interface MatchOptions {
  rounds: number;
  /** Rotation start remembered between sessions on this screen. */
  offset: number;
  /** Id of the computer ghost (negative). */
  cpuId: number;
  rnd?: () => number;
}

export class HauntMatch {
  phase: Phase = 'setup';
  step: SetupStep = 'map';
  map: MapId = 'rumah';
  fright: Fright = 'ringan';
  round = 0;
  readonly rounds: number;
  world: HauntWorld | null = null;
  phaseT = 0;
  readonly tallies = new Map<number, Tally>();
  readonly results: RoundResult[] = [];
  /** People in the current round (residents plus a human ghost). */
  cast: number[] = [];
  private people: Person[] = [];
  private events: MatchEvent[] = [];
  private readonly offset: number;
  readonly cpuId: number;
  private readonly rnd: () => number;
  /** Speed multiplier given to the computer ghost (set by the driver from its skill). */
  cpuSpeed = 1;

  constructor(opts: MatchOptions) {
    this.rounds = Math.max(1, Math.min(8, Math.floor(opts.rounds)));
    this.offset = opts.offset;
    this.cpuId = opts.cpuId;
    this.rnd = opts.rnd ?? Math.random;
  }

  setPeople(people: readonly Person[]): void {
    this.people = people.map((p) => ({ ...p }));
    for (const p of this.people) if (!this.tallies.has(p.id)) this.tallies.set(p.id, emptyTally(p.id));
  }

  person(id: number): Person | undefined {
    return this.people.find((p) => p.id === id);
  }

  connected(): Person[] {
    return this.people.filter((p) => p.connected);
  }

  drainEvents(): MatchEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.events.push({ type: 'phase', phase: p });
  }

  /* ------------------------------------------------------------------ setup */

  pick(value: string): boolean {
    if (this.phase !== 'setup') return false;
    if (this.step === 'map' && (value === 'rumah' || value === 'kampung')) {
      this.map = value;
      return true;
    }
    if (this.step === 'fright' && (value === 'ringan' || value === 'beneran')) {
      this.fright = value;
      return true;
    }
    return false;
  }

  next(): void {
    if (this.phase === 'setup' && this.step === 'map') this.step = 'fright';
  }

  back(): void {
    if (this.phase === 'setup' && this.step === 'fright') this.step = 'map';
  }

  start(): void {
    if (this.phase !== 'setup') return;
    this.round = 0;
    this.beginRound();
  }

  get ghostId(): number {
    return this.world?.ghost.id ?? this.cpuId;
  }

  get ghostIsCpu(): boolean {
    return this.ghostId === this.cpuId;
  }

  private beginRound(): void {
    const here = this.connected().map((p) => p.id);
    const ids = here.length ? here : this.people.slice(0, 1).map((p) => p.id);
    const ghostId = ghostFor(ids, this.round, this.offset, this.cpuId);
    const residents = ids.filter((id) => id !== ghostId);
    const skins = SKINS[this.map];
    const skin = skins[Math.floor(this.rnd() * skins.length)] ?? skins[0]!;
    this.world = new HauntWorld({
      map: MAPS[this.map],
      fright: this.fright,
      residents,
      ghostId,
      skin,
      rnd: this.rnd,
      ghostSpeedMul: ghostId === this.cpuId ? this.cpuSpeed : 1,
    });
    this.cast = ghostId === this.cpuId ? residents : [...residents, ghostId];
    const t = this.tallies.get(ghostId);
    if (t) t.ghostRounds++;
    this.events.push({ type: 'round', index: this.round });
    this.setPhase('reveal');
  }

  /* ------------------------------------------------------------------ time */

  update(dt: number): void {
    const step = Math.max(0, Math.min(dt, 0.25));
    this.phaseT += step;
    switch (this.phase) {
      case 'reveal':
        if (this.phaseT >= REVEAL_S) this.setPhase('hunt');
        return;
      case 'hunt': {
        const w = this.world;
        if (!w) return;
        w.update(step);
        for (const e of w.drainEvents()) {
          this.events.push({ type: 'world', e });
          if (e.type === 'over') this.finishRound(e.winner);
        }
        return;
      }
      case 'end':
        if (this.phaseT >= END_S) {
          if (this.round + 1 < this.rounds) {
            this.round++;
            this.beginRound();
          } else this.setPhase('done');
        }
        return;
      default:
        return;
    }
  }

  private finishRound(winner: 'penghuni' | 'hantu'): void {
    const w = this.world;
    if (!w || this.phase !== 'hunt') return;
    const points = new Map<number, number>();
    for (const r of w.residents) {
      const s = r.stats;
      const escaped = r.state === 'out';
      const pts =
        (escaped ? 3 : 0) +
        s.keys +
        (s.fuse >= 1.5 ? 1 : 0) +
        Math.min(3, Math.floor(s.lit / 3)) +
        Math.min(2, s.near);
      points.set(r.id, pts);
      const t = this.tallies.get(r.id) ?? emptyTally(r.id);
      t.points += pts;
      t.keys += s.keys;
      t.fuse += s.fuse;
      t.lit += s.lit;
      t.near += s.near;
      t.flyS += s.flyS;
      if (escaped) t.escapes++;
      this.tallies.set(r.id, t);
    }
    const g = w.ghost;
    const gp = g.catches * 2 + (winner === 'hantu' ? 3 : 0);
    points.set(g.id, gp);
    const gt = this.tallies.get(g.id) ?? emptyTally(g.id);
    gt.points += gp;
    gt.catches += g.catches;
    this.tallies.set(g.id, gt);
    this.results.push({
      winner,
      ghostId: g.id,
      skin: g.skin,
      escaped: w.escapedCount(),
      residents: w.residents.length,
      points,
    });
    this.setPhase('end');
  }

  lastResult(): RoundResult | undefined {
    return this.results[this.results.length - 1];
  }

  /** Role of a person this round. */
  roleOf(id: number): 'ghost' | 'resident' | null {
    const w = this.world;
    if (!w) return null;
    if (w.ghost.id === id) return 'ghost';
    return w.resident(id) ? 'resident' : null;
  }

  /** Next rotation start to remember, so the next session begins with someone new. */
  nextOffset(): number {
    return this.offset + this.rounds;
  }
}
