import { lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { cueStrip, endBoard, finalBoard } from './board';
import { type Choice, type Cue, LangkahMatch, netTiming, type PlayerInfo, type Stage, TIMING } from './logic';
import {
  ANCHOR_SLACK_MS,
  applyMirror,
  BabakAnchor,
  babakClock,
  CueBook,
  type LangkahMirror,
  MirrorClock,
  poseMatch,
  toMirror,
} from './mirror';

const FRUITS = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'] as const;
const FRAME_MS = 1000 / 60;

function seats(n: number, cpu: boolean, name = (i: number) => `P${i + 1}`): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: cpu ? -(i + 1) : i + 1,
    name: name(i),
    fruit: FRUITS[i % FRUITS.length]!,
    look: { c: lookAt(i).c, s: 3, h: lookAt(i + 5).c, hc: 1, oc: 2 },
    color: '#F2453D',
    cpu,
  }));
}

/** The Host screen as director.ts runs it: frames, a pause-aware babak clock, the anchor. */
class Host {
  readonly m: LangkahMatch;
  readonly anchor = new BabakAnchor();
  server = 1_700_000_000_000;
  paused = false;
  private seq = 0;

  constructor(walkers: PlayerInfo[], pick: Choice = 'eskalator') {
    this.m = new LangkahMatch({ players: walkers, rounds: 4, seed: 7, skill: 0.9 });
    this.m.choose(pick);
    this.m.start();
  }

  /** One frame of `ms` wall time (the game clock clamps a long frame to 0.1 s, as on the Host). */
  frame(ms = FRAME_MS): void {
    this.server += ms;
    if (!this.paused) this.m.tick(Math.min(0.1, ms / 1000));
    this.m.drainEvents();
    const ph = this.m.phase;
    this.anchor.update(!this.paused && (ph === 'play' || ph === 'intro'), this.server, babakClock(this.m));
  }

  runFor(ms: number): void {
    const end = this.server + ms;
    while (this.server + FRAME_MS <= end) this.frame();
  }

  runToPlay(): void {
    for (let i = 0; i < 10_000 && this.m.phase !== 'play'; i++) this.frame();
    expect(this.m.phase).toBe('play');
  }

  state(): LangkahMirror {
    return toMirror({
      match: this.m,
      session: 42,
      seq: ++this.seq,
      anchor: this.anchor.value,
      paused: this.paused,
      hostName: 'Rina',
      offline: (id) => id === 3,
    });
  }
}

/** Through JSON and validation, as it crosses the network. */
function wire(state: LangkahMirror): LangkahMirror {
  const parsed = applyMirror(JSON.parse(JSON.stringify(state)));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

/** The far-away screen without its stage: clock, cue book and the posed match. */
class Far {
  readonly clock = new MirrorClock();
  readonly book = new CueBook();
  readonly m = new LangkahMatch({ players: [], rounds: 4, seed: 1 });

  take(s: LangkahMirror): void {
    if (!this.clock.push(s)) return;
    this.book.take(s);
    poseMatch(this.m, s);
  }

  at(serverMs: number): LangkahMatch {
    this.m.t = this.clock.at(serverMs);
    this.m.cues = this.book.cues;
    return this.m;
  }
}

/** A cue with its times in whole ms (the wire carries ms precision). */
const ms = (c: Cue | undefined) =>
  c && {
    ...c,
    show: Math.round(c.show * 1000),
    open: Math.round(c.open * 1000),
    at: Math.round(c.at * 1000),
    close: Math.round(c.close * 1000),
    hide: c.hide === null ? null : Math.round(c.hide * 1000),
  };

const shape = (m: LangkahMatch) => {
  const s = cueStrip(m);
  return s ? { mode: s.mode, now: s.now?.dir ?? null, hidden: s.now?.hidden ?? null, next: s.next } : null;
};

describe('langkah mirror', () => {
  it('round-trips a running babak through JSON', () => {
    const host = new Host(seats(4, true));
    host.runToPlay();
    host.runFor(8000);
    const state = host.state();
    expect(state.o).not.toBeNull();
    expect(state.h).toBeNull();
    expect(state.cu.length).toBeGreaterThan(0);
    expect(wire(state)).toEqual(state);
  });

  it('round-trips the menu, a pause and the memory babak', () => {
    const menu = new LangkahMatch({ players: seats(2, false), rounds: 4, seed: 3 });
    const setup = toMirror({
      match: menu,
      session: 1,
      seq: 1,
      anchor: null,
      paused: false,
      hostName: 'Budi',
      offline: () => false,
    });
    expect(setup.ph).toBe('setup');
    expect(wire(setup)).toEqual(setup);

    const host = new Host(seats(3, true), 'ingat');
    host.runToPlay();
    host.runFor(3000);
    host.paused = true;
    host.frame();
    const held = host.state();
    expect(held.pz).toBe(true);
    expect(held.o).toBeNull();
    expect(held.h).toBe(Math.round(host.m.t * 1000) / 1000);
    expect(held.mo).not.toBeNull();
    expect(wire(held)).toEqual(held);
  });

  it('rejects malformed states', () => {
    const host = new Host(seats(3, true));
    host.runToPlay();
    host.runFor(6000);
    const good = JSON.parse(JSON.stringify(host.state())) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad = (patch: Record<string, unknown>) => applyMirror({ ...good, ...patch });
    expect(applyMirror(null)).toBeNull();
    expect(applyMirror('x')).toBeNull();
    expect(bad({ v: 2 })).toBeNull();
    expect(bad({ ph: 'boom' })).toBeNull();
    expect(bad({ pk: 'nope' })).toBeNull();
    expect(bad({ pn: ['eskalator', 'mars'] })).toBeNull();
    expect(bad({ no: 9 })).toBeNull();
    // Both clocks, or none.
    expect(bad({ h: 3 })).toBeNull();
    expect(bad({ o: null, h: null })).toBeNull();
    expect(bad({ o: 'soon' })).toBeNull();
    expect(bad({ hn: 'x'.repeat(41) })).toBeNull();
    const wk = good.wk as unknown[][];
    expect(bad({ wk: wk.slice(1) })).toBeNull();
    expect(bad({ wk: [[...wk[0]!.slice(0, 2), 99, ...wk[0]!.slice(3)], ...wk.slice(1)] })).toBeNull();
    const cu = good.cu as unknown[][];
    expect(bad({ cu: [[cu[0]![0], 7, ...cu[0]!.slice(2)], ...cu.slice(1)] })).toBeNull();
    expect(bad({ cu: [cu[0], cu[2]] })).toBeNull();
    expect(bad({ cu: [[...cu[0]!.slice(0, 4), -1, ...cu[0]!.slice(5)]] })).toBeNull();
    expect(bad({ pl: [{ id: 0, n: 'X', f: 'semangka', l: { c: 'leo' }, c: '#fff' }] })).toBeNull();
    expect(bad({ pl: Array.from({ length: 17 }, () => (good.pl as unknown[])[0]) })).toBeNull();
    expect(bad({ mo: [0, 3, 5] })).toBeNull();
    expect(bad({ rc: [1, 'A'] })).toBeNull();
  });

  it('shows each cue at the same server time as the Host, however late the state arrives', () => {
    const host = new Host(seats(4, true));
    const far = new Far();
    const delayMs = 250;
    const inFlight: { at: number; s: LangkahMirror }[] = [];
    host.runToPlay();
    let checked = 0;
    for (let f = 0; f < 60 * 20; f++) {
      host.frame();
      inFlight.push({ at: host.server + delayMs, s: wire(host.state()) });
      while (inFlight.length > 0 && inFlight[0]!.at <= host.server) far.take(inFlight.shift()!.s);
      if (!far.clock.latest || far.clock.latest.o === null) continue;
      const b = far.at(host.server);
      expect(Math.abs(b.t - host.m.t)).toBeLessThan(0.001);
      // Every cue the Host shows is already in the far screen's book, with the same schedule.
      for (const c of host.m.cues) if (c.show <= host.m.t) expect(ms(b.cues[c.i])).toEqual(ms(c));
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('starts play at the anchored server moment, with the opening cues already known', () => {
    const host = new Host(seats(4, true), 'tangga');
    const far = new Far();
    for (let i = 0; i < 60 && host.m.phase === 'intro'; i++) host.frame();
    const early = wire(host.state());
    expect(early.ph).toBe('intro');
    expect(early.o).not.toBeNull();
    // The intro card counts down to babak time 0: the anchor is the server moment play begins.
    const start = early.o!;
    expect(Math.abs(start - (host.server + (TIMING.intro - host.m.phaseT) * 1000))).toBeLessThan(1);
    // States arrive 300 ms late; the far screen still switches to play on the anchor.
    const inFlight: { at: number; s: LangkahMirror }[] = [];
    let hostPlay: number | null = null;
    let farPlay: number | null = null;
    let cuesBefore = 0;
    for (let f = 0; f < 60 * 6; f++) {
      host.frame();
      if (hostPlay === null && host.m.phase === 'play') hostPlay = host.server;
      inFlight.push({ at: host.server + 300, s: wire(host.state()) });
      while (inFlight.length > 0 && inFlight[0]!.at <= host.server) far.take(inFlight.shift()!.s);
      if (farPlay === null && far.clock.playing(host.server)) {
        farPlay = host.server;
        cuesBefore = far.book.cues.length;
      }
    }
    expect(hostPlay).not.toBeNull();
    expect(farPlay).not.toBeNull();
    expect(Math.abs(farPlay! - hostPlay!)).toBeLessThanOrEqual(FRAME_MS + 1);
    expect(cuesBefore).toBeGreaterThanOrEqual(2);
    const first = far.book.cues[0]!;
    expect(first.show).toBeGreaterThan(0);
  });

  it('builds the opening cues during the intro card without announcing them', () => {
    const m = new LangkahMatch({ players: seats(2, false), rounds: 4, seed: 11 });
    m.choose('eskalator');
    m.start();
    m.drainEvents();
    for (let i = 0; i < 1000 && m.phase === 'intro'; i++) {
      m.tick(1 / 60);
      if (m.phase === 'intro') expect(m.drainEvents().some((e) => e.k === 'cue')).toBe(false);
    }
    expect(m.cues.length).toBeGreaterThan(0);
    expect(m.cues.every((c) => c.at <= 3 + 1e-9)).toBe(true);
  });

  it('draws the same cue strip as the Host at the same server time', () => {
    const host = new Host(seats(3, true), 'gua');
    const far = new Far();
    host.runToPlay();
    for (let f = 0; f < 60 * 15; f++) {
      host.frame();
      far.take(wire(host.state()));
      expect(shape(far.at(host.server))).toEqual(shape(host.m));
    }
  });

  it('keeps the babak clock exact across a pause', () => {
    const host = new Host(seats(2, true), 'titian');
    const far = new Far();
    host.runToPlay();
    host.runFor(5000);
    far.take(wire(host.state()));
    const before = far.clock.latest!.o!;
    expect(Math.abs(far.at(host.server).t - host.m.t)).toBeLessThan(0.001);

    host.paused = true;
    host.frame();
    far.take(wire(host.state()));
    const frozen = host.m.t;
    host.runFor(2000);
    expect(far.at(host.server).t).toBe(Math.round(frozen * 1000) / 1000);

    host.paused = false;
    host.frame();
    far.take(wire(host.state()));
    host.runFor(1000);
    far.take(wire(host.state()));
    const after = far.clock.latest!.o!;
    // The 2 s pause (plus the frame that resumed) moved the anchor; the babak time still matches.
    expect(after - before).toBeGreaterThan(1990);
    expect(Math.abs(far.at(host.server).t - host.m.t)).toBeLessThan(0.001);
    expect(shape(far.at(host.server))).toEqual(shape(host.m));
  });

  it('follows a slow Host frame without running backwards', () => {
    const host = new Host(seats(2, true));
    const far = new Far();
    host.runToPlay();
    host.runFor(4000);
    far.take(wire(host.state()));
    const o1 = far.clock.latest!.o!;
    let shown = far.at(host.server).t;
    // A 400 ms frame only moves the babak 0.1 s on the Host: the anchor follows it.
    host.frame(400);
    far.take(wire(host.state()));
    expect(far.clock.latest!.o! - o1).toBeGreaterThan(ANCHOR_SLACK_MS);
    for (let f = 0; f < 60; f++) {
      host.frame();
      far.take(wire(host.state()));
      const t = far.at(host.server).t;
      expect(t).toBeGreaterThanOrEqual(shown);
      shown = t;
    }
    expect(Math.abs(shown - host.m.t)).toBeLessThan(0.001);
  });

  it('keeps the anchor steady through small jitter (equal states are not resent)', () => {
    const anchor = new BabakAnchor();
    const o = anchor.update(true, 10_000, 2);
    expect(anchor.update(true, 10_016 + ANCHOR_SLACK_MS - 2, 2.016)).toBe(o);
    expect(anchor.update(true, 10_040 + ANCHOR_SLACK_MS + 5, 2.04)).not.toBe(o);
    expect(anchor.update(false, 10_050, 2.04)).toBeNull();
    expect(anchor.value).toBeNull();
  });

  it('ignores old or repeated states but accepts a restarted Host', () => {
    const host = new Host(seats(2, true));
    host.runToPlay();
    const a = host.state();
    const b = host.state();
    const clock = new MirrorClock();
    expect(clock.push(b)).toBe(true);
    expect(clock.push(a)).toBe(false);
    expect(clock.push(b)).toBe(false);
    expect(clock.push({ ...a, ss: 43, sq: 1 })).toBe(true);
  });

  it('poses the walkers, the summary and the final table like the Host', () => {
    const host = new Host(seats(4, true), 'batu');
    const far = new Far();
    host.runToPlay();
    for (let i = 0; i < 60 * 70 && host.m.phase !== 'end'; i++) host.frame();
    expect(host.m.phase).toBe('end');
    far.take(wire(host.state()));
    const b = far.at(host.server);
    expect(b.players.map((p) => [p.id, p.step, p.fallen, p.inRound])).toEqual(
      host.m.players.map((p) => [p.id, p.step, p.fallen, p.inRound]),
    );
    expect(endBoard(b)).toEqual(endBoard(host.m));
    for (let i = 0; i < 60 * 300 && host.m.phase !== 'final'; i++) host.frame();
    expect(host.m.phase).toBe('final');
    far.take(wire(host.state()));
    expect(finalBoard(far.at(host.server))).toEqual(finalBoard(host.m));
  });

  it('stays well under the 7.5 KB packet with 16 walkers', () => {
    const long = (i: number) => `Pemain Nomor ${String(i + 1).padStart(2, '0')}xx`;
    let biggest = 0;
    for (const stage of ['eskalator', 'ingat', 'laser', 'lift'] as Stage[]) {
      const host = new Host(seats(16, true, long), stage);
      host.runToPlay();
      for (let f = 0; f < 60 * 58; f++) {
        host.frame();
        if (f % 30 === 0) biggest = Math.max(biggest, JSON.stringify(host.state()).length);
      }
    }
    expect(biggest).toBeLessThan(4000);
  });
});

describe('network grace while a far-away screen watches', () => {
  it('is wider and lets a far press be judged by its stamp', () => {
    expect(netTiming(false)).toEqual({ grace: TIMING.grace, maxLag: TIMING.maxLag });
    const far = netTiming(true);
    expect(far.grace).toBe(0.6);
    expect(far.grace).toBeGreaterThan(TIMING.grace);
    // A press may claim at least as much delay as the grace waits for it.
    expect(far.maxLag).toBeGreaterThanOrEqual(far.grace);
  });

  function toFirstClose(grace: number, extra: number) {
    const m = new LangkahMatch({ players: seats(2, false), rounds: 4, seed: 5 });
    m.grace = grace;
    m.choose('eskalator');
    m.start();
    for (let i = 0; i < 10_000 && m.phase !== 'play'; i++) m.tick(1 / 60);
    for (let i = 0; i < 10_000 && m.cues.length === 0; i++) m.tick(1 / 60);
    const c = m.cues[0]!;
    while (m.t < c.close + extra) m.tick(1 / 60);
    m.drainEvents();
    return { m, c };
  }

  it('calls a miss only after the wider grace', () => {
    const near = toFirstClose(TIMING.grace, 0.45);
    expect(near.m.player(1)!.fallen).toBe(true);
    const far = toFirstClose(netTiming(true).grace, 0.45);
    expect(far.m.player(1)!.fallen).toBe(false);
    // The far press made on the beat arrives now: judged by its stamp, same verdict as at the Host.
    expect(far.m.press(1, far.c.dir, far.c.at)).toBe('pas');
    // Whoever really missed falls once the wider grace ends.
    while (far.m.t <= far.c.close + netTiming(true).grace + 0.02) far.m.tick(1 / 60);
    expect(far.m.player(2)!.fallen).toBe(true);
    expect(far.m.player(2)!.why).toBe('late');
    expect(far.m.player(1)!.fallen).toBe(false);
  });
});
