/**
 * The computer cook: the helper that joins a lone player (PRD 6.4, on Sisi Masak) and the brain
 * that keeps a dropped phone's cook working until it reconnects. It plays through the same
 * controls as a phone (stick, Kerja, Ambil, Lempar), never touches state directly.
 *
 * How it decides: it reads the tickets, counts what the kitchen still lacks per ingredient line
 * (what is ordered minus what already exists anywhere: in hands, on counters, cooking, flying),
 * and picks the most useful job it can reach from where it stands. A divider limits what it can
 * reach, so the same brain naturally cooks on Sisi Masak and chops and throws on Sisi Persiapan.
 * Human touches: a short think pause between jobs, a slightly slower walk, and now and then a
 * hesitation; all scaled by the remembered skill.
 */
import { bySkill } from '../common/cpu';
import { CHOPS_TO, canAddToPlate, type Food, type Item, isFull } from './items';
import { COLS, ROWS, type Side, sideOfX } from './kitchens';
import type { Chef, DapurMatch, Pilot, Station } from './logic';
import { type Line, linesOf, PART_LINES, partOf } from './recipes';
import { pickReceiver } from './throw';

export interface BrainStyle {
  /** Pause between jobs (ms). */
  thinkMin: number;
  thinkMax: number;
  /** Stick deflection while walking (speed share). */
  pace: number;
  /** Chance per decision to hesitate instead of acting. */
  slip: number;
  /** Delay before reacting to an incoming throw with full hands (ms). */
  react: number;
}

export function styleFor(skill: number): BrainStyle {
  return {
    thinkMin: Math.round(bySkill(skill, 520, 160)),
    thinkMax: Math.round(bySkill(skill, 1100, 420)),
    pace: bySkill(skill, 0.72, 0.97),
    slip: bySkill(skill, 0.16, 0.03),
    react: Math.round(bySkill(skill, 650, 220)),
  };
}

/** A dropped phone's cook: steady, careful, never brilliant. */
export const TAKEOVER_STYLE: BrainStyle = styleFor(0.5);

type WorkGoal = 'chop' | 'wash' | 'clean' | 'fill' | 'douse';

type Job =
  | { kind: 'grab'; station: number }
  | { kind: 'work'; station: number; goal: WorkGoal; start: number }
  | { kind: 'floor'; item: number }
  | { kind: 'throw'; since: number }
  /** Nowhere to put it: walk to open floor and set it down there. */
  | { kind: 'drop'; x: number; y: number }
  | { kind: 'idle'; x: number; y: number; until: number };

const CHOP_LINES: ReadonlySet<Line> = new Set<Line>(['tomat', 'selada', 'kentang', 'roti']);
const COOKER_OF: Partial<Record<Food, 'stove' | 'fryer' | 'wok'>> = {
  daging: 'stove',
  kentangPotong: 'fryer',
  nasi: 'wok',
  telur: 'wok',
};
const STUCK_MS = 1600;

/** Basket trips other computer cooks are already on, so two of them do not fetch the same thing. */
const CLAIMS = new WeakMap<DapurMatch, Map<number, Line>>();

function claims(m: DapurMatch): Map<number, Line> {
  let c = CLAIMS.get(m);
  if (!c) {
    c = new Map();
    CLAIMS.set(m, c);
  }
  return c;
}
const THROW_WAIT_MS = 2600;
const WORK_MAX_MS = 6000;

export class CookBrain implements Pilot {
  private job: Job | null = null;
  private jobSeen: Job | null = null;
  private nextAt = 0;
  private field: Int16Array | null = null;
  private fieldKey = '';
  private lastX = 0;
  private lastY = 0;
  private stillSince = 0;
  private incomingSeen = Number.POSITIVE_INFINITY;
  /** The plate being picked up goes into the trash (its scraps block every dish). */
  private dump = false;

  /**
   * `role` limits an open kitchen (no divider): the Sisi Masak helper leaves chopping and the
   * prep baskets to the people. In split kitchens the divider already decides.
   */
  constructor(
    private readonly style: BrainStyle,
    private readonly role: Side,
    private readonly rnd: () => number = Math.random,
  ) {}

  think(m: DapurMatch, me: Chef, t: number): void {
    if (m.staggered(me)) {
      this.stop(m, me);
      return;
    }
    this.watchIncoming(m, me, t);
    if (this.job && !this.valid(m, me, this.job, t)) this.finish(m, me, t);
    if (!this.job) {
      if (t < this.nextAt) {
        this.stop(m, me);
        return;
      }
      this.job = this.decide(m, me, t);
      this.stillSince = t;
      this.lastX = me.x;
      this.lastY = me.y;
    }
    this.run(m, me, t);
  }

  /* ------------------------------------------------------------------ execution */

  private stop(m: DapurMatch, me: Chef): void {
    m.steer(me.id, 0, 0);
    m.hold(me.id, false);
  }

  private finish(m: DapurMatch, me: Chef, t: number): void {
    this.job = null;
    claims(m).delete(me.id);
    m.hold(me.id, false);
    m.steer(me.id, 0, 0);
    const span = this.style.thinkMax - this.style.thinkMin;
    this.nextAt = t + this.style.thinkMin + span * this.rnd();
  }

  private run(m: DapurMatch, me: Chef, t: number): void {
    const job = this.job;
    if (!job) return;
    if (job !== this.jobSeen) {
      this.jobSeen = job;
      this.stillSince = t;
    }
    // Stuck behind someone: give up the job and think again.
    if (Math.hypot(me.x - this.lastX, me.y - this.lastY) > 0.05) {
      this.lastX = me.x;
      this.lastY = me.y;
      this.stillSince = t;
    } else if (job.kind !== 'work' && job.kind !== 'throw' && t - this.stillSince > STUCK_MS) {
      this.finish(m, me, t);
      return;
    }
    switch (job.kind) {
      case 'grab': {
        const s = m.stations[job.station]!;
        if (this.approach(m, me, s)) {
          m.steer(me.id, 0, 0);
          m.grab(me.id);
          this.finish(m, me, t);
        }
        return;
      }
      case 'work': {
        const s = m.stations[job.station]!;
        if (!this.approach(m, me, s)) {
          m.hold(me.id, false);
          return;
        }
        m.steer(me.id, 0, 0);
        m.hold(me.id, true);
        if (this.workDone(m, me, s, job.goal) || t - job.start > WORK_MAX_MS) this.finish(m, me, t);
        return;
      }
      case 'floor': {
        const f = m.floor.find((x) => x.id === job.item);
        if (!f) {
          this.finish(m, me, t);
          return;
        }
        if (Math.hypot(f.x - me.x, f.y - me.y) < 0.45) {
          m.steer(me.id, 0, 0);
          m.grab(me.id);
          this.finish(m, me, t);
          return;
        }
        this.walkTo(m, me, [Math.floor(f.y) * COLS + Math.floor(f.x)], f.x, f.y);
        return;
      }
      case 'throw': {
        m.steer(me.id, 0, 0);
        const r = pickReceiver(m.chefs, me, {
          split: m.def.split,
          safe: m.tuning.safeThrows,
          incoming: (id) => m.flights.some((f) => f.toChef === id),
          now: t,
        });
        const ready = !r?.held || m.tuning.safeThrows;
        if (ready || t - job.since > THROW_WAIT_MS) {
          if (!ready) {
            // Waited long enough: leave it on a counter near the divider instead.
            const s = this.freeCounter(m, me, true);
            this.job = s ? { kind: 'grab', station: s.id } : null;
            if (!s) m.throwItem(me.id);
            return;
          }
          m.throwItem(me.id);
          this.finish(m, me, t);
        }
        return;
      }
      case 'drop':
        if (Math.hypot(job.x - me.x, job.y - me.y) < 0.2) {
          m.steer(me.id, 0, 0);
          m.grab(me.id);
          this.finish(m, me, t);
          return;
        }
        this.walkTo(m, me, [Math.floor(job.y) * COLS + Math.floor(job.x)], job.x, job.y);
        return;
      case 'idle':
        if (t >= job.until) {
          this.finish(m, me, t);
          return;
        }
        if (Math.hypot(job.x - me.x, job.y - me.y) < 0.25) m.steer(me.id, 0, 0);
        else this.walkTo(m, me, [Math.floor(job.y) * COLS + Math.floor(job.x)], job.x, job.y);
        return;
    }
  }

  /** Walk to a stand tile of the station and face it. True once it is the targeted station. */
  private approach(m: DapurMatch, me: Chef, s: Station): boolean {
    if (me.target === s.id && DapurMatchDist(s, me) < 0.5) return true;
    const goals = standTiles(m, s, sideOfX(me.x));
    if (goals.length === 0) return false;
    const here = Math.floor(me.y) * COLS + Math.floor(me.x);
    if (goals.includes(here)) {
      // Lean into the station so the cook faces it (the counter stops the walk).
      const dx = s.x + s.w / 2 - me.x;
      const dy = s.y + 0.5 - me.y;
      const d = Math.hypot(dx, dy) || 1;
      m.steer(me.id, (dx / d) * 0.6, (dy / d) * 0.6);
      return false;
    }
    this.walkTo(m, me, goals, s.x + s.w / 2, s.y + 0.5);
    return false;
  }

  private walkTo(m: DapurMatch, me: Chef, goals: number[], fx: number, fy: number): void {
    const field = this.distances(m, goals);
    const col = Math.floor(me.x);
    const row = Math.floor(me.y);
    const here = row * COLS + col;
    const mine = field[here] ?? -1;
    if (mine === 0) {
      this.steerTo(m, me, fx, fy);
      return;
    }
    let best = -1;
    let bd = mine < 0 ? 32767 : mine;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        if (dx && dy && (m.solid(col + dx, row) || m.solid(col, row + dy))) continue;
        const v = field[r * COLS + c] ?? -1;
        if (v < 0 || v >= bd) continue;
        bd = v;
        best = r * COLS + c;
      }
    }
    if (best < 0) {
      this.steerTo(m, me, fx, fy);
      return;
    }
    this.steerTo(m, me, (best % COLS) + 0.5, Math.floor(best / COLS) + 0.5);
  }

  private steerTo(m: DapurMatch, me: Chef, x: number, y: number): void {
    const dx = x - me.x;
    const dy = y - me.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) {
      m.steer(me.id, 0, 0);
      return;
    }
    const k = this.style.pace * Math.min(1, 0.45 + d);
    m.steer(me.id, (dx / d) * k, (dy / d) * k);
  }

  /** BFS step counts to the goal tiles over walkable floor (diagonals without cutting corners). */
  private distances(m: DapurMatch, goals: number[]): Int16Array {
    const key = `${goals.join(',')}|${m.moved ? 1 : 0}`;
    if (this.field && this.fieldKey === key) return this.field;
    const f = new Int16Array(COLS * ROWS).fill(-1);
    const queue: number[] = [];
    for (const g of goals) {
      f[g] = 0;
      queue.push(g);
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi]!;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const c = col + dx;
          const r = row + dy;
          if (m.solid(c, r)) continue;
          if (dx && dy && (m.solid(col + dx, row) || m.solid(col, row + dy))) continue;
          const j = r * COLS + c;
          if (f[j] !== -1) continue;
          f[j] = (f[i] ?? 0) + 1;
          queue.push(j);
        }
      }
    }
    this.field = f;
    this.fieldKey = key;
    return f;
  }

  /* ------------------------------------------------------------------ validity */

  private valid(m: DapurMatch, me: Chef, job: Job, t: number): boolean {
    switch (job.kind) {
      case 'grab': {
        const s = m.stations[job.station];
        if (!s || s.fire || !reachable(m, me, s)) return false;
        if (s.kind !== 'counter' && s.kind !== 'board') return true;
        const h = me.held;
        if (!h) return !!s.item;
        if (!s.item) return true;
        // Only worth it while the two still combine.
        if (h.k === 'plate' && s.item.k === 'food') return canAddToPlate(h.on, s.item.food);
        if (h.k === 'food' && s.item.k === 'plate') return canAddToPlate(s.item.on, h.food);
        if (h.k === 'plate' && s.item.k === 'plate') return h.on.length > 0 && fitsAll(s.item.on, h.on);
        return false;
      }
      case 'work': {
        const s = m.stations[job.station];
        if (!s || !reachable(m, me, s)) return false;
        if (job.goal === 'douse') return s.fire && me.held?.k === 'extinguisher';
        return !s.fire;
      }
      case 'floor':
        return !me.held && m.floor.some((f) => f.id === job.item);
      case 'throw':
      case 'drop':
        return !!me.held;
      case 'idle':
        return t < job.until;
    }
  }

  private workDone(m: DapurMatch, me: Chef, s: Station, goal: WorkGoal): boolean {
    switch (goal) {
      case 'chop':
        return !(s.item?.k === 'food' && CHOPS_TO[s.item.food]);
      case 'wash':
        return s.dirty === 0 || plates(m) >= 3;
      case 'clean':
        return me.stains.length === 0;
      case 'fill':
        return !(me.held?.k === 'glass') || isFull(me.held);
      case 'douse':
        return !s.fire;
    }
  }

  /** With full hands and something flying in, set it down first (not on Santai: nothing hurts). */
  private watchIncoming(m: DapurMatch, me: Chef, t: number): void {
    const incoming = m.flights.some((f) => f.toChef === me.id);
    if (!incoming) {
      this.incomingSeen = Number.POSITIVE_INFINITY;
      return;
    }
    if (this.incomingSeen === Number.POSITIVE_INFINITY) this.incomingSeen = t;
    if (!me.held || m.tuning.safeThrows || t - this.incomingSeen < this.style.react) return;
    if (this.job?.kind === 'grab') {
      const s = m.stations[this.job.station];
      if (s && s.kind === 'counter' && !s.item) return;
    }
    const s = this.freeCounter(m, me, false);
    if (s) this.job = { kind: 'grab', station: s.id };
  }

  /* ------------------------------------------------------------------ decisions */

  private decide(m: DapurMatch, me: Chef, t: number): Job | null {
    if (this.rnd() < this.style.slip) {
      // A human moment: look around for a second.
      return { kind: 'idle', x: me.x, y: me.y, until: t + 500 + this.rnd() * 700 };
    }
    const job = me.held ? this.useHeld(m, me, me.held, t) : this.findWork(m, me, t);
    return job ?? this.idleSpot(m, me, t);
  }

  private useHeld(m: DapurMatch, me: Chef, h: Item, t: number): Job | null {
    const split = m.def.split;
    const fire = m.stations.find((s) => s.fire && reachable(m, me, s));
    if (h.k === 'extinguisher') {
      if (fire) return { kind: 'work', station: fire.id, goal: 'douse', start: t };
      return this.putDown(m, me);
    }
    // Finished hand-ins go to the pass (or across to whoever can reach it).
    const part = partOf(h);
    if (part && m.orders.wants(part, t)) {
      const pass = m.stations.find((s) => s.kind === 'pass' && reachable(m, me, s));
      if (pass) return { kind: 'grab', station: pass.id };
      if (split && this.usableAcross(m, me, 'pass')) return { kind: 'throw', since: t };
    }
    if (h.k === 'glass') {
      if (!isFull(h)) {
        const tap = m.stations.find((s) => s.kind === 'soda' && reachable(m, me, s));
        if (tap) return { kind: 'work', station: tap.id, goal: 'fill', start: t };
        if (split && this.usableAcross(m, me, 'soda')) return { kind: 'throw', since: t };
      }
      if ((this.needs(m, t).get('gelas') ?? 0) < 0) {
        const bin = this.nearest(m, me, (s) => s.kind === 'trash');
        if (bin) return { kind: 'grab', station: bin.id };
      }
      return this.putDown(m, me, true);
    }
    if (h.k === 'plate') {
      if (this.dump && h.on.length > 0) {
        const bin = this.nearest(m, me, (s) => s.kind === 'trash');
        if (bin) return { kind: 'grab', station: bin.id };
      }
      this.dump = false;
      // Pour it onto another plate when everything fits (one plate per dish, not scraps everywhere).
      if (h.on.length > 0) {
        const merge = this.fullestPlate(m, me, (on) => on.length >= h.on.length && fitsAll(on, h.on));
        if (merge) return { kind: 'grab', station: merge.id };
      }
      // Fill it from what is ready nearby, else park it on a counter near the pass.
      const src = this.plateSource(m, me, h.on);
      if (src) return { kind: 'grab', station: src.id };
      if (split && !this.reachesKind(m, me, 'pass') && this.usableAcross(m, me, 'pass') && h.on.length)
        return { kind: 'throw', since: t };
      if (h.on.length === 0 && !this.plateWanted(m, t)) {
        const rack = m.stations.find((s) => s.kind === 'rack' && reachable(m, me, s));
        if (rack) return { kind: 'grab', station: rack.id };
      }
      return this.putDown(m, me, true);
    }
    // Food.
    const f = h.food;
    if (f === 'gosong') {
      const bin = this.nearest(m, me, (s) => s.kind === 'trash');
      return bin ? { kind: 'grab', station: bin.id } : this.putDown(m, me);
    }
    if (CHOPS_TO[f]) {
      const board = this.nearest(m, me, (s) => s.kind === 'board' && !s.item);
      if (board) return { kind: 'grab', station: board.id };
      if (split && !this.reachesKind(m, me, 'board') && this.usableAcross(m, me, 'board'))
        return { kind: 'throw', since: t };
      return this.putDown(m, me);
    }
    const cooker = COOKER_OF[f];
    if (cooker) {
      const s = this.nearest(
        m,
        me,
        (x) => x.kind === cooker && !x.item && !x.pot.includes(f) && (cooker !== 'wok' || x.pot.length < 2),
      );
      if (s) return { kind: 'grab', station: s.id };
      if (split && !this.reachesKind(m, me, cooker) && this.usableAcross(m, me, cooker))
        return { kind: 'throw', since: t };
      return this.putDown(m, me);
    }
    // Plateable food: onto the fullest plate that takes it, else across, else park it.
    const plateHere = this.fullestPlate(m, me, (on) => canAddToPlate(on, f));
    if (plateHere) return { kind: 'grab', station: plateHere.id };
    if (split && !this.reachesKind(m, me, 'pass') && this.usableAcross(m, me, 'pass'))
      return { kind: 'throw', since: t };
    if (this.surplus(m, f, t)) {
      const bin = this.nearest(m, me, (s) => s.kind === 'trash');
      if (bin) return { kind: 'grab', station: bin.id };
    }
    return this.putDown(m, me, true);
  }

  private findWork(m: DapurMatch, me: Chef, t: number): Job | null {
    const open = !m.def.split;
    const helper = open && this.role === 1;
    // 1. Fire: fetch the extinguisher.
    if (m.stations.some((s) => s.fire && reachable(m, me, s))) {
      const ext = this.nearest(m, me, (s) => s.item?.k === 'extinguisher');
      if (ext) return { kind: 'grab', station: ext.id };
      const ef = m.floor.find((f) => f.item.k === 'extinguisher' && sideOfX(f.x) === sideOfX(me.x));
      if (ef) return { kind: 'floor', item: ef.id };
    }
    // 2. Burnt food out of a cooker.
    const burnt = this.nearest(
      m,
      me,
      (s) => isCookerKind(s) && s.item?.k === 'food' && s.item.food === 'gosong',
    );
    if (burnt) return { kind: 'grab', station: burnt.id };
    // 3. Cooked food: take it before it burns, or when a plate is waiting for it.
    const cooked = this.nearest(m, me, (s) => isCookerKind(s) && m.heatLevel(s) >= 1 && m.heatLevel(s) < 2);
    if (cooked && cooked.item?.k === 'food') {
      const cf = cooked.item.food;
      const plateFor = this.fullestPlate(m, me, (on) => canAddToPlate(on, cf));
      if (plateFor || m.heatLevel(cooked) > 1.35) return { kind: 'grab', station: cooked.id };
      const rack = this.nearest(m, me, (s) => s.kind === 'rack' && s.plates > 0);
      if (rack) return { kind: 'grab', station: rack.id };
      return { kind: 'grab', station: cooked.id };
    }
    // 4. A finished dish waiting on a counter.
    const ready = this.nearest(m, me, (s) => {
      if (!isSurface(s) || !s.item) return false;
      const p = partOf(s.item);
      return !!p && !!m.orders.wants(p, t);
    });
    if (ready) return { kind: 'grab', station: ready.id };
    // 5. Something on a board to chop.
    if (!helper) {
      const board = this.nearest(
        m,
        me,
        (s) =>
          s.kind === 'board' &&
          s.item?.k === 'food' &&
          !!CHOPS_TO[s.item.food] &&
          !m.chefs.some((c) => c.id !== me.id && c.target === s.id && c.busy === 'chop'),
      );
      if (board) return { kind: 'work', station: board.id, goal: 'chop', start: t };
    }
    // 5b. Two plates on counters that fit together: carry the smaller onto the bigger.
    const onCounters = m.stations.filter((s) => isSurface(s) && s.item?.k === 'plate' && reachable(m, me, s));
    for (const a of onCounters) {
      const pa = a.item as Extract<Item, { k: 'plate' }>;
      if (pa.on.length === 0) continue;
      const fits = onCounters.some((b) => {
        const pb = b.item as Extract<Item, { k: 'plate' }>;
        return b !== a && pb.on.length >= pa.on.length && fitsAll(pb.on, pa.on);
      });
      if (fits) return { kind: 'grab', station: a.id };
    }
    // 5c. Stalled: food is ready but every plate is taken by scraps that cannot become a dish
    // with it, and no clean plate is coming. Scrap the least finished plate.
    if (!helper || onCounters.length > 0) {
      const rack = m.stations.find((s) => s.kind === 'rack');
      const sink = m.stations.find((s) => s.kind === 'sink');
      const noPlates = (rack?.plates ?? 0) === 0 && (sink?.dirty ?? 0) === 0 && m.platesAway === 0;
      const waiting = m.stations.some(
        (s) =>
          s.item?.k === 'food' &&
          !onCounters.some(
            (p) => p.item?.k === 'plate' && canAddToPlate(p.item.on, (s.item as { food: Food }).food),
          ) &&
          canAddToPlate([], s.item.food),
      );
      if (noPlates && waiting && onCounters.length > 0 && !m.chefs.some((c) => c.held?.k === 'plate')) {
        const worst = [...onCounters].sort(
          (a, b) => (a.item as { on: Food[] }).on.length - (b.item as { on: Food[] }).on.length,
        )[0]!;
        this.dump = true;
        return { kind: 'grab', station: worst.id };
      }
    }
    // 6. Loose food on counters that has somewhere to go.
    const loose = this.nearest(m, me, (s) => {
      if (!isSurface(s) || s.item?.k !== 'food') return false;
      return this.hasUse(m, me, s.item.food, s.id, helper);
    });
    if (loose) return { kind: 'grab', station: loose.id };
    // 7. Useful things on the floor.
    const side = sideOfX(me.x);
    let floorBest: { id: number; d: number } | null = null;
    for (const f of m.floor) {
      if (m.def.split && sideOfX(f.x) !== side) continue;
      if (f.item.k === 'food' && f.item.food === 'gosong') continue;
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      if (!floorBest || d < floorBest.d) floorBest = { id: f.id, d };
    }
    if (floorBest) return { kind: 'floor', item: floorBest.id };
    // 8. Plates and glasses for what is ordered (a plate only while there is room to set it down).
    const need = this.needs(m, t);
    const room = this.freeCount(m, me);
    if (room === 0) {
      const clutter = this.nearest(m, me, (s) => {
        if (s.kind !== 'counter' || !s.item) return false;
        const it = s.item;
        if (it.k === 'glass') return (need.get('gelas') ?? 0) < 0;
        if (it.k === 'food') return this.surplus(m, it.food, t);
        if (it.k === 'plate') return it.on.length === 0 && (need.get('piring') ?? 0) < 0;
        return false;
      });
      if (clutter) return { kind: 'grab', station: clutter.id };
    }
    if ((need.get('piring') ?? 0) > 0 && (room >= 2 || !this.platesInPlay(m))) {
      const rack = this.nearest(m, me, (s) => s.kind === 'rack' && s.plates > 0);
      if (rack && this.reachesKind(m, me, 'pass')) return { kind: 'grab', station: rack.id };
    }
    if ((need.get('gelas') ?? 0) > 0) {
      const cups = this.nearest(m, me, (s) => s.kind === 'cups');
      if (cups) return { kind: 'grab', station: cups.id };
    }
    // 9. Raw ingredients, most urgent ticket first.
    for (const k of [...m.orders.tickets].sort((a, b) => m.orders.timeLeft(a, t) - m.orders.timeLeft(b, t))) {
      for (const part of m.orders.missing(k)) {
        for (const line of PART_LINES[part]) {
          if (line === 'piring' || line === 'gelas') continue;
          if ((need.get(line) ?? 0) <= 0) continue;
          if (helper && CHOP_LINES.has(line)) continue;
          const basket = this.nearest(m, me, (s) => s.kind === 'basket' && s.source === line);
          if (basket) {
            claims(m).set(me.id, line);
            return { kind: 'grab', station: basket.id };
          }
        }
      }
    }
    // 10. Dishes, then the apron.
    const sink = this.nearest(m, me, (s) => s.kind === 'sink');
    if (sink && sink.dirty > 0 && plates(m) < 3)
      return { kind: 'work', station: sink.id, goal: 'wash', start: t };
    if (sink && me.stains.length > 0 && this.rnd() < 0.3)
      return { kind: 'work', station: sink.id, goal: 'clean', start: t };
    if (sink && sink.dirty > 0) return { kind: 'work', station: sink.id, goal: 'wash', start: t };
    return null;
  }

  /** Is there a reachable next step for this food (or one across the divider)? */
  private hasUse(m: DapurMatch, me: Chef, f: Food, from: number, helper: boolean): boolean {
    if (f === 'gosong') return true;
    const across = m.def.split;
    if (CHOPS_TO[f]) {
      if (helper) return false;
      if (!this.reachesKind(m, me, 'board')) return across && this.lineWanted(m, f, m.now);
      const onBoard = m.stations[from]?.kind === 'board';
      return !onBoard && !!this.nearest(m, me, (s) => s.kind === 'board' && !s.item);
    }
    const cooker = COOKER_OF[f];
    if (cooker) {
      if (!this.reachesKind(m, me, cooker)) return across && this.lineWanted(m, f, m.now);
      return !!this.nearest(
        m,
        me,
        (s) => s.kind === cooker && !s.item && !s.pot.includes(f) && (cooker !== 'wok' || s.pot.length < 2),
      );
    }
    // Plateable: a plate elsewhere that takes it, or the pass is across (throw it).
    if (
      this.nearest(
        m,
        me,
        (s) => s.id !== from && s.item?.k === 'plate' && canAddToPlate(s.item.on, f) && isSurface(s),
      )
    )
      return true;
    if (m.def.split && !this.reachesKind(m, me, 'pass')) return this.lineWanted(m, f, m.now);
    return false;
  }

  /** A reachable counter that holds a food the plate in hand can take, or a cooker with it ready. */
  private plateSource(m: DapurMatch, me: Chef, on: readonly Food[]): Station | null {
    return this.nearest(m, me, (s) => {
      if (s.item?.k !== 'food') return false;
      if (!canAddToPlate(on, s.item.food)) return false;
      if (isCookerKind(s)) return m.heatLevel(s) >= 1 && m.heatLevel(s) < 2;
      return isSurface(s);
    });
  }

  /** The plate on a counter with the most on it that passes `ok`, nearest on a tie. */
  private fullestPlate(m: DapurMatch, me: Chef, ok: (on: readonly Food[]) => boolean): Station | null {
    let best: Station | null = null;
    let bn = -1;
    let bd = Infinity;
    for (const s of m.stations) {
      if (!isSurface(s) || s.item?.k !== 'plate' || s.fire || !reachable(m, me, s) || !ok(s.item.on))
        continue;
      const n = s.item.on.length;
      const d = DapurMatchDist(s, me);
      if (n > bn || (n === bn && d < bd)) {
        bn = n;
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private platesInPlay(m: DapurMatch): boolean {
    return (
      m.chefs.some((c) => c.held?.k === 'plate') ||
      m.stations.some((s) => s.item?.k === 'plate') ||
      m.floor.some((f) => f.item.k === 'plate')
    );
  }

  private plateWanted(m: DapurMatch, t: number): boolean {
    return (this.needs(m, t).get('piring') ?? 0) >= 0;
  }

  /** Some open ticket still needs this food's line (supply aside: a spare is fine to pass on). */
  private lineWanted(m: DapurMatch, f: Food, _t: number): boolean {
    const lines = linesOf(f);
    return m.orders.tickets.some((k) =>
      m.orders.missing(k).some((p) => PART_LINES[p].some((l) => lines.includes(l))),
    );
  }

  /** Nobody needs it: no ticket uses its line and there is more than enough of it around. */
  private surplus(m: DapurMatch, f: Food, t: number): boolean {
    if (this.lineWanted(m, f, t)) return false;
    const need = this.needs(m, t);
    return linesOf(f).every((l) => (need.get(l) ?? 0) < 0);
  }

  /** Ordered minus existing, per ingredient line (negative = surplus). */
  private needs(m: DapurMatch, _t: number): Map<Line, number> {
    const n = new Map<Line, number>();
    const add = (l: Line, d: number) => n.set(l, (n.get(l) ?? 0) + d);
    for (const k of m.orders.tickets)
      for (const part of m.orders.missing(k)) for (const l of PART_LINES[part]) add(l, 1);
    const count = (it: Item | null) => {
      if (!it) return;
      if (it.k === 'food') for (const l of linesOf(it.food)) add(l, -1);
      else if (it.k === 'plate') {
        add('piring', -1);
        for (const f of it.on) for (const l of linesOf(f)) add(l, -1);
      } else if (it.k === 'glass') add('gelas', -1);
    };
    for (const c of m.chefs) count(c.held);
    for (const s of m.stations) {
      count(s.item);
      for (const f of s.pot) for (const l of linesOf(f)) add(l, -1);
    }
    for (const f of m.floor) count(f.item);
    for (const f of m.flights) count(f.item);
    for (const [id, line] of claims(m)) if (m.chef(id)?.held === null) add(line, -1);
    return n;
  }

  /* ------------------------------------------------------------------ helpers */

  private putDown(m: DapurMatch, me: Chef, nearPass = false): Job | null {
    const s = nearPass ? this.counterNearPass(m, me) : this.freeCounter(m, me, false);
    if (s) return { kind: 'grab', station: s.id };
    const spot = openFloor(m, me);
    return spot ? { kind: 'drop', x: spot.x, y: spot.y } : null;
  }

  private freeCount(m: DapurMatch, me: Chef): number {
    let n = 0;
    for (const s of m.stations) if (s.kind === 'counter' && !s.item && !s.fire && reachable(m, me, s)) n++;
    return n;
  }

  private counterNearPass(m: DapurMatch, me: Chef): Station | null {
    const pass = m.stations.find((s) => s.kind === 'pass' && reachable(m, me, s));
    if (!pass) return this.freeCounter(m, me, false);
    let best: Station | null = null;
    let bd = Infinity;
    for (const s of m.stations) {
      if (s.kind !== 'counter' || s.item || s.fire || !reachable(m, me, s)) continue;
      const d = Math.hypot(s.x - pass.x, s.y - pass.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Nearest free counter; `byDivider` prefers ones close to the middle (for a later throw). */
  private freeCounter(m: DapurMatch, me: Chef, byDivider: boolean): Station | null {
    let best: Station | null = null;
    let bd = Infinity;
    for (const s of m.stations) {
      if (s.kind !== 'counter' || s.item || s.fire || !reachable(m, me, s)) continue;
      const d = byDivider ? Math.abs(s.x + 0.5 - COLS / 2) : DapurMatchDist(s, me);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private nearest(m: DapurMatch, me: Chef, ok: (s: Station) => boolean): Station | null {
    let best: Station | null = null;
    let bd = Infinity;
    for (const s of m.stations) {
      if (s.fire || !ok(s) || !reachable(m, me, s)) continue;
      const d = DapurMatchDist(s, me);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** A station of this kind that someone on the other side of the divider can reach. */
  private usableAcross(m: DapurMatch, me: Chef, kind: Station['kind']): boolean {
    const other: Side = sideOfX(me.x) === 0 ? 1 : 0;
    return m.stations.some((s) => s.kind === kind && standTiles(m, s, other).length > 0);
  }

  private reachesKind(m: DapurMatch, me: Chef, kind: Station['kind']): boolean {
    return m.stations.some((s) => s.kind === kind && reachable(m, me, s));
  }

  /** Where to wait: near the divider on a split kitchen (ready to catch), else mid-floor. */
  private idleSpot(m: DapurMatch, me: Chef, t: number): Job {
    const side = sideOfX(me.x);
    const x = m.def.split ? (side === 0 ? 5.3 : 8.7) : side === 0 ? 4.5 : 9.5;
    const y = 2.5 + this.rnd() * 2;
    return { kind: 'idle', x, y, until: t + 700 + this.rnd() * 600 };
  }
}

function DapurMatchDist(s: Station, c: Chef): number {
  const qx = Math.max(s.x, Math.min(s.x + s.w, c.x));
  const qy = Math.max(s.y, Math.min(s.y + 1, c.y));
  return Math.hypot(c.x - qx, c.y - qy);
}

/** Every food of `add` fits on a plate holding `on`. */
function fitsAll(on: readonly Food[], add: readonly Food[]): boolean {
  const acc = [...on];
  for (const f of add) {
    if (!canAddToPlate(acc, f)) return false;
    acc.push(f);
  }
  return true;
}

const isSurface = (s: Station): boolean => s.kind === 'counter' || s.kind === 'board';
const isCookerKind = (s: Station): boolean => s.kind === 'stove' || s.kind === 'fryer' || s.kind === 'wok';

/** Clean plates in the rack. */
function plates(m: DapurMatch): number {
  return m.stations.find((s) => s.kind === 'rack')?.plates ?? 0;
}

/** The nearest floor tile with no station in reach (to set something down on the floor). */
function openFloor(m: DapurMatch, me: Chef): { x: number; y: number } | null {
  const side = sideOfX(me.x);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (m.solid(c, r) || (m.def.split && sideOfX(c + 0.5) !== side)) continue;
      let clear = true;
      for (let dy = -1; dy <= 1 && clear; dy++)
        for (let dx = -1; dx <= 1; dx++) if (m.stationAt(c + dx, r + dy)) clear = false;
      if (!clear) continue;
      const d = Math.hypot(c + 0.5 - me.x, r + 0.5 - me.y);
      if (d < bd) {
        bd = d;
        best = { x: c + 0.5, y: r + 0.5 };
      }
    }
  }
  return best;
}

/** Floor tiles next to a station on one side of the kitchen. */
export function standTiles(m: DapurMatch, s: Station, side: Side): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.w; i++) {
    const tx = s.x + i;
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const c = tx + dx;
      const r = s.y + dy;
      if (m.solid(c, r)) continue;
      if (m.def.split && sideOfX(c + 0.5) !== side) continue;
      out.push(r * COLS + c);
    }
  }
  return out;
}

/** Can this cook walk up to the station (same side of a divider, a free tile next to it)? */
export function reachable(m: DapurMatch, me: Chef, s: Station): boolean {
  return standTiles(m, s, sideOfX(me.x)).length > 0;
}
