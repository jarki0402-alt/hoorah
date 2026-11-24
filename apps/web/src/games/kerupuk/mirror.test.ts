import { type Look, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { GO_SHOW_MS, type Overlay } from './hud';
import { laneLayout } from './layout';
import {
  BITES,
  CHEW_MS,
  CHOKE_MS,
  COUNT_MS,
  FAR_MAX_LAG_MS,
  FAR_SETTLE_MS,
  GameClock,
  KerupukLogic,
  type Lane,
  MAX_LAG_MS,
  ROUND_MS,
  swingOffset,
} from './logic';
import {
  applyMirror,
  type KerupukMirror,
  MarkReader,
  type MirrorLaneSource,
  type MirrorSource,
  mirrorHud,
  mirrorLanes,
  mirrorNow,
  mirrorPhase,
  toMirror,
} from './mirror';
import { STR } from './strings';

const LOOK: Look = lookOfFruit('semangka');
const ORIGIN = { x: 0, y: 0 };

/** A server clock the test moves by hand, starting at a realistic epoch value. */
function serverClock(start = 1_764_000_000_000) {
  const c = { t: start, now: () => c.t };
  return c;
}

function setup(ids: number[] = [1, 2]) {
  const server = serverClock();
  const clock = new GameClock(server.now);
  const logic = new KerupukLogic({
    rounds: 3,
    roster: ids.map((id) => ({ id, connected: true })),
    now: clock.now(),
  });
  return { server, clock, logic };
}

function laneSource(logic: KerupukLogic, l: Lane, name = `Pemain ${l.id}`): MirrorLaneSource {
  const s = logic.stats.get(l.id)!;
  return {
    id: l.id,
    name,
    look: LOOK,
    color: '#F2453D',
    connected: true,
    bites: l.bites,
    swing: l.swing,
    chokeUntil: l.choking ? l.chokeUntil : 0,
    finished: l.finishedAt !== null,
    mood: 'play',
    score: s.score,
    gain: null,
    marks: { bites: s.bites, perfect: s.perfect, chokes: s.chokes },
  };
}

function source(
  logic: KerupukLogic,
  clock: GameClock,
  overlay: Overlay = { kind: 'none' },
  names?: (id: number) => string,
): MirrorSource {
  return {
    phase: logic.phase,
    round: logic.round,
    rounds: logic.rounds,
    now: clock.now(),
    goAt: logic.goAt,
    endsAt: logic.roundEndsAt,
    held: clock.paused,
    toServer: (t) => clock.toServer(t),
    lanes: logic.lanes.map((l) => laneSource(logic, l, names?.(l.id))),
    overlay,
    line: { key: 7, bold: 'Pak RT:', text: 'Ayo gigit!' },
  };
}

/** What the far screen gets: the published state after a trip through JSON. */
function wire(src: MirrorSource): KerupukMirror {
  const s = applyMirror(JSON.parse(JSON.stringify(toMirror(src))));
  expect(s).not.toBeNull();
  return s!;
}

/** First game time >= from when the lane's kerupuk is dead centre. */
function centreAfter(l: Lane, from: number): number {
  const half = l.swing.period / 2;
  return l.swing.start + Math.ceil((from - l.swing.start) / half) * half;
}

/** First game time >= from when the lane's kerupuk is at its far right. */
function edgeAfter(l: Lane, from: number): number {
  const p = l.swing.period;
  return l.swing.start + p / 4 + Math.ceil((from - l.swing.start - p / 4) / p) * p;
}

function start(logic: KerupukLogic): void {
  logic.tick(logic.goAt);
  expect(logic.phase).toBe('play');
}

/** Bite lane `id` dead centre (pressed and arrived at once), returns the game time used. */
function biteAt(logic: KerupukLogic, id: number, from: number): number {
  const l = logic.lane(id)!;
  const t = centreAfter(l, Math.max(from, l.lastBiteAt + CHEW_MS + 1));
  logic.tick(t);
  logic.bite(id, t, t);
  return t;
}

describe('mirror wire', () => {
  it('survives a JSON round trip unchanged', () => {
    const { clock, logic } = setup([1, 2, 3]);
    start(logic);
    biteAt(logic, 2, logic.goAt + 1);
    const overlays: Overlay[] = [
      { kind: 'none' },
      { kind: 'waiting' },
      { kind: 'intro', key: 1, title: 'Ronde 1', sub: 'Siap', hint: 'Tekan GIGIT', count: '3', record: null },
      {
        kind: 'roundEnd',
        key: 4,
        title: 'Menang',
        sub: 'Cepat',
        next: null,
        rows: [{ id: 1, name: 'Sari', look: LOOK, color: '#F2453D', rank: 1, detail: '7/7', points: '+5' }],
      },
      {
        kind: 'finale',
        key: 5,
        title: 'Juara',
        sub: 'Hebat',
        rows: [{ id: 1, name: 'Sari', look: LOOK, color: '#F2453D', rank: 0, detail: 'x', points: 'y' }],
        record: { text: 'Rekor baru', isNew: true },
      },
    ];
    for (const overlay of overlays) {
      const m = toMirror(source(logic, clock, overlay));
      expect(applyMirror(JSON.parse(JSON.stringify(m)))).toEqual(m);
    }
  });

  it('rejects malformed states', () => {
    const { clock, logic } = setup();
    const good = toMirror(source(logic, clock));
    const bad = (patch: (m: Record<string, unknown>) => void) => {
      const m = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      patch(m);
      return applyMirror(m);
    };
    expect(applyMirror(null)).toBeNull();
    expect(applyMirror('x')).toBeNull();
    expect(applyMirror([])).toBeNull();
    expect(bad((m) => (m.v = 2))).toBeNull();
    expect(bad((m) => (m.ph = 'party'))).toBeNull();
    expect(bad((m) => (m.r = 0))).toBeNull();
    expect(bad((m) => (m.r = 4))).toBeNull();
    expect(bad((m) => (m.go = 'soon'))).toBeNull();
    expect(bad((m) => (m.end = (m.go as number) - 1))).toBeNull();
    expect(bad((m) => (m.hd = Number.NaN))).toBeNull();
    expect(bad((m) => (m.ov = ['x']))).toBeNull();
    expect(bad((m) => (m.ov = ['i', 1, 'a', 'b']))).toBeNull();
    expect(bad((m) => (m.tk = [1, 'a']))).toBeNull();
    expect(bad((m) => (m.ln = 'lanes'))).toBeNull();
    expect(bad((m) => (m.ln = Array.from({ length: 17 }, () => (m.ln as unknown[])[0])))).toBeNull();
    const row = (i: number, v: unknown) => (m: Record<string, unknown>) => {
      ((m.ln as unknown[][])[0] as unknown[])[i] = v;
    };
    expect(bad(row(1, 'x'.repeat(41)))).toBeNull();
    expect(bad(row(2, { c: 'nobody' }))).toBeNull();
    expect(bad(row(3, 'red'))).toBeNull();
    expect(bad(row(5, BITES + 1))).toBeNull();
    expect(bad(row(7, 0))).toBeNull();
    expect(bad(row(7, -5))).toBeNull();
    expect(bad(row(10, 9))).toBeNull();
    expect(bad(row(14, 3))).toBeNull();
    // Two lanes for one player.
    expect(bad((m) => ((m.ln as unknown[][])[1]![0] = (m.ln as unknown[][])[0]![0]))).toBeNull();
    expect(bad(() => {})).toEqual(good);
  });

  it('stays well under the packet limit with 8 players and a full finale', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const { clock, logic } = setup(ids);
    start(logic);
    const long = (id: number) => `${'Pemain Dengan Nama Panjang'.slice(0, 30)} ${id}`.padEnd(40, 'x');
    const rows = ids.slice(0, 5).map((id, i) => ({
      id,
      name: long(id),
      look: LOOK,
      color: '#F2453D',
      rank: i + 1,
      detail: STR.rankLabel(21, 3),
      points: STR.points(15),
    }));
    const overlay: Overlay = {
      kind: 'finale',
      key: 99,
      title: 'Juara Makan Kerupuk: Pemain Dengan Nama Panjang',
      sub: STR.finaleSub,
      rows,
      record: null,
    };
    const json = JSON.stringify(toMirror(source(logic, clock, overlay, long)));
    expect(json.length).toBeLessThan(4000);
  });
});

describe('the far screen draws the Host’s swing from server time', () => {
  it('matches the Host’s kerupuk at the same server time, bites and pause included', () => {
    const { server, clock, logic } = setup([1, 2, 3]);
    logic.setFarPlay(true);
    const check = (s: KerupukMirror) => {
      const lanesB = mirrorLanes(s);
      const nowB = mirrorNow(s, server.t);
      for (const [i, la] of logic.lanes.entries()) {
        const a = swingOffset(la.swing, clock.now());
        expect(swingOffset(lanesB[i]!.swing, nowB)).toBeCloseTo(a, 2);
      }
    };
    // Before GIGIT and every 37 ms for a while after.
    check(wire(source(logic, clock)));
    server.t = clock.toServer(logic.goAt);
    start(logic);
    let s = wire(source(logic, clock));
    for (let k = 0; k < 60; k++) {
      server.t += 37;
      check(s);
    }
    // Bites speed the swing up; the next state carries the new phase.
    let t = biteAt(logic, 1, clock.now());
    t = biteAt(logic, 1, t);
    biteAt(logic, 2, t);
    server.t = clock.toServer(Math.max(clock.now(), t)) + 5;
    s = wire(source(logic, clock));
    for (let k = 0; k < 40; k++) {
      server.t += 53;
      check(s);
    }
    // The Host pauses: both stand still at the same spot however long the pause lasts.
    clock.pause();
    s = wire(source(logic, clock));
    expect(s.hd).not.toBeNull();
    check(s);
    server.t += 9_000;
    check(s);
    expect(mirrorHud(s, mirrorNow(s, server.t), ORIGIN).secs).toBe(
      Math.ceil((logic.roundEndsAt - clock.now()) / 1000),
    );
    // Resumed: swings are re-anchored in the new server time and keep matching.
    clock.resume();
    s = wire(source(logic, clock));
    expect(s.hd).toBeNull();
    for (let k = 0; k < 40; k++) {
      server.t += 41;
      check(s);
    }
  });

  it('a press stamped when the far screen shows the kerupuk centred is a PAS bite on the Host', () => {
    const { server, clock, logic } = setup([1, 2]);
    logic.setFarPlay(true);
    server.t = clock.toServer(logic.goAt) + 1500;
    logic.tick(clock.now());
    const s = wire(source(logic, clock));
    const laneB = mirrorLanes(s)[1]!;
    // Server time the far screen draws lane 2 dead centre.
    const half = laneB.swing.period / 2;
    const stamp = laneB.swing.start + Math.ceil((server.t - laneB.swing.start) / half) * half;
    expect(Math.abs(swingOffset(laneB.swing, stamp))).toBeLessThan(0.02);
    // The press reaches the Host 450 ms later through the server.
    server.t = stamp + 450;
    logic.tick(clock.now());
    expect(logic.bite(2, clock.toGame(stamp), clock.now())).toBe('perfect');
  });
});

describe('far-away play grace (judging stays by stamp)', () => {
  it('trusts stamps up to FAR_MAX_LAG_MS old while a far screen watches', () => {
    expect(FAR_MAX_LAG_MS).toBeGreaterThan(MAX_LAG_MS);
    for (const far of [false, true]) {
      const { logic } = setup([1, 2]);
      logic.setFarPlay(far);
      start(logic);
      const l = logic.lane(1)!;
      const stamp = centreAfter(l, logic.goAt + 100);
      // Arrives 900 ms late: past the near window, inside the far one.
      const arrival = stamp + 900;
      logic.tick(arrival);
      const out = logic.bite(1, stamp, arrival);
      if (far) expect(out).toBe('perfect');
      else expect(out).not.toBe('perfect');
    }
    const { logic } = setup();
    logic.setFarPlay(true);
    logic.setFarPlay(false);
    expect(logic.maxLagMs).toBe(MAX_LAG_MS);
    expect(logic.settleMs).toBe(0);
  });

  it('time cap: a far press stamped before it still counts, and the round ends after the settle window', () => {
    const { logic } = setup([1, 2]);
    logic.setFarPlay(true);
    start(logic);
    const cap = logic.roundEndsAt;
    const l = logic.lane(2)!;
    // Put lane 2's kerupuk dead centre 300 ms before the cap.
    const stamp = cap - 300;
    l.swing = { start: stamp, period: l.swing.period };
    logic.tick(cap + 100);
    expect(logic.phase).toBe('play');
    const arrival = cap + 400;
    logic.tick(arrival);
    expect(logic.bite(2, stamp, arrival)).toBe('perfect');
    expect(l.bites).toBe(1);
    // A press stamped after the cap never counts.
    expect(logic.bite(1, cap + 10, arrival)).toBe('ignored');
    logic.tick(cap + FAR_SETTLE_MS - 1);
    expect(logic.phase).toBe('play');
    logic.tick(cap + FAR_SETTLE_MS);
    expect(logic.phase).toBe('roundEnd');
    expect(logic.lastRoundEnd?.placements[0]?.id).toBe(2);

    // Without a far screen the cap ends the round at once (as before).
    const near = setup([1, 2]).logic;
    start(near);
    near.tick(near.roundEndsAt);
    expect(near.phase).toBe('roundEnd');
  });

  it('first finish: an earlier stamped finish that arrives later wins the round', () => {
    const { logic } = setup([1, 2]);
    logic.setFarPlay(true);
    start(logic);
    // Both eat six bites.
    let t = logic.goAt + 1;
    for (let i = 0; i < BITES - 1; i++) {
      t = biteAt(logic, 1, t);
      t = biteAt(logic, 2, t);
    }
    // The far player (2) takes the last bite first, but the press is still on its way.
    const farStamp = centreAfter(logic.lane(2)!, t + CHEW_MS + 1);
    const nearStamp = centreAfter(logic.lane(1)!, farStamp + 1);
    logic.tick(nearStamp);
    expect(logic.bite(1, nearStamp, nearStamp)).toBe('finish');
    expect(logic.phase).toBe('play');
    expect(logic.finish).toEqual({ id: 1, at: nearStamp });
    const arrival = Math.max(nearStamp, farStamp + 450);
    logic.tick(arrival);
    expect(logic.bite(2, farStamp, arrival)).toBe('finish');
    expect(logic.finish).toEqual({ id: 2, at: farStamp });
    logic.tick(farStamp + FAR_SETTLE_MS);
    expect(logic.phase).toBe('roundEnd');
    const info = logic.lastRoundEnd!;
    expect(info.reason).toBe('finish');
    expect(info.finisher).toBe(2);
    expect(info.time).toBe(farStamp - logic.goAt);
    expect(info.placements.map((p) => [p.id, p.rank])).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  it('first finish: presses stamped after it are ignored while it settles; near play ends at once', () => {
    const { logic } = setup([1, 2]);
    logic.setFarPlay(true);
    start(logic);
    let t = logic.goAt + 1;
    for (let i = 0; i < BITES; i++) t = biteAt(logic, 1, t);
    expect(logic.phase).toBe('play');
    const l2 = logic.lane(2)!;
    const late = centreAfter(l2, t + 1);
    logic.tick(late);
    expect(logic.bite(2, late, late)).toBe('ignored');
    expect(l2.bites).toBe(0);

    const near = setup([1, 2]).logic;
    start(near);
    let n = near.goAt + 1;
    for (let i = 0; i < BITES; i++) n = biteAt(near, 1, n);
    expect(near.phase).toBe('roundEnd');
  });

  it('a press stamped during a choke stays ignored when it arrives after the recovery', () => {
    const { logic } = setup([1, 2]);
    logic.setFarPlay(true);
    start(logic);
    const l = logic.lane(1)!;
    const miss = edgeAfter(l, logic.goAt + 1);
    logic.tick(miss);
    expect(logic.bite(1, miss, miss)).toBe('choke');
    const during = centreAfter(l, miss + 1);
    expect(during).toBeLessThan(miss + CHOKE_MS);
    const arrival = miss + CHOKE_MS + 200;
    logic.tick(arrival);
    expect(l.choking).toBe(false);
    expect(logic.bite(1, during, arrival)).toBe('ignored');
    expect(l.bites).toBe(0);
  });
});

describe('far screen HUD and effects', () => {
  it('counts down and calls GIGIT on its own clock, before the Host’s next packet', () => {
    const { clock, logic } = setup([1, 2]);
    const intro: Overlay = {
      kind: 'intro',
      key: 1,
      title: 'T',
      sub: 'S',
      hint: 'H',
      count: null,
      record: null,
    };
    const s = wire(source(logic, clock, intro));
    const go = s.go;
    expect(mirrorHud(s, go - COUNT_MS - 10, ORIGIN).overlay).toMatchObject({ kind: 'intro', count: null });
    expect(mirrorHud(s, go - 2500, ORIGIN).overlay).toMatchObject({ kind: 'intro', count: '3' });
    expect(mirrorHud(s, go - 1, ORIGIN).overlay).toMatchObject({ kind: 'intro', count: '1' });
    expect(mirrorHud(s, go - 1, ORIGIN).secs).toBe(ROUND_MS / 1000);
    // Still the intro packet, but GIGIT has come by this screen's clock.
    expect(mirrorPhase(s, go)).toBe('play');
    expect(mirrorHud(s, go + 10, ORIGIN).overlay).toMatchObject({ kind: 'intro', count: STR.countGo });
    expect(mirrorHud(s, go + GO_SHOW_MS, ORIGIN).overlay).toEqual({ kind: 'none' });
    const hud = mirrorHud(s, s.end - 9_500, ORIGIN);
    expect(hud.secs).toBe(10);
    expect(hud.urgent).toBe(true);
    expect(mirrorHud(s, s.end + 500, ORIGIN).secs).toBe(0);
  });

  it('places plates on this screen’s lanes and shows chokes by server time', () => {
    const { clock, logic } = setup([1, 2, 3]);
    start(logic);
    const l = logic.lane(2)!;
    const miss = edgeAfter(l, logic.goAt + 1);
    logic.tick(miss);
    logic.bite(2, miss, miss);
    const s = wire(source(logic, clock));
    const origin = { x: 160, y: 40 };
    const lay = laneLayout(3);
    const until = clock.toServer(miss + CHOKE_MS);
    const hud = mirrorHud(s, until - 1, origin);
    expect(hud.plates.map((p) => p.x)).toEqual(lay.xs.map((x) => x + origin.x));
    expect(hud.plates.map((p) => p.choking)).toEqual([false, true, false]);
    expect(mirrorHud(s, until + 1, origin).plates[1]!.choking).toBe(false);
    expect(hud.chip).toBe(STR.roundChip(1, 3));
  });

  it('replays bites, PAS, finishes and chokes from the running totals, once', () => {
    const { clock, logic } = setup([1, 2]);
    start(logic);
    const reader = new MarkReader();
    expect(reader.read(wire(source(logic, clock)))).toEqual([]);
    let t = biteAt(logic, 1, logic.goAt + 1);
    expect(reader.read(wire(source(logic, clock)))).toEqual([
      { type: 'bite', id: 1, perfect: true, finished: false },
    ]);
    // The same state again (resent) plays nothing.
    expect(reader.read(wire(source(logic, clock)))).toEqual([]);
    const l2 = logic.lane(2)!;
    const miss = edgeAfter(l2, t + 1);
    logic.tick(miss);
    logic.bite(2, miss, miss);
    expect(reader.read(wire(source(logic, clock)))).toEqual([{ type: 'choke', id: 2 }]);
    for (let i = 1; i < BITES; i++) t = biteAt(logic, 1, t);
    const marks = reader.read(wire(source(logic, clock)));
    // Several bites merged into one packet still show once, as the finish.
    expect(marks).toEqual([{ type: 'bite', id: 1, perfect: true, finished: true }]);
    // A restarted Host (totals went down) is only a new baseline.
    const fresh = setup([1, 2]);
    expect(reader.read(wire(source(fresh.logic, fresh.clock)))).toEqual([]);
  });

  it('a first packet is only the baseline', () => {
    const { clock, logic } = setup([1, 2]);
    start(logic);
    biteAt(logic, 1, logic.goAt + 1);
    expect(new MarkReader().read(wire(source(logic, clock)))).toEqual([]);
  });
});
