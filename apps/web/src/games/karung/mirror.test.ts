import { type Fruit, type Look, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import type { TickerLine } from './commentary';
import { type BoardRow, type HudState, type Overlay, type Plate, plateBox } from './hud';
import { DEFAULT_TUNING, type Phase } from './logic';
import {
  applyMirror,
  type KarungMirror,
  MarkReader,
  MirrorMarks,
  type MirrorSource,
  MirrorTimeline,
  mirrorClocks,
  mirrorHud,
  mirrorRoster,
  toMirror,
} from './mirror';
import { CLOCK_AHEAD_MAX_MS } from './playout';
import { formatClock, STR } from './strings';

const FRUITS: Fruit[] = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'];
const COLORS = ['#F2453D', '#2F7BEA', '#2DB36A', '#FFC928', '#FF8A1F', '#1BB5C9', '#E2559A', '#8A5A2B'];
const LANES = { centers: [300, 350, 400, 450, 500, 550, 600, 650], spacing: 50 };
const ORIGIN = { x: 0, y: 0 };

const lookOf = (id: number): Look => lookOfFruit(FRUITS[(id - 1) % FRUITS.length]!);
const colorOf = (id: number): string => COLORS[(id - 1) % COLORS.length]!;

function plates(n: number): Plate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Pemain Nomor ${i + 1} Yang Panjang`,
    look: lookOf(i + 1),
    color: colorOf(i + 1),
    connected: i !== 2,
    place: i + 1,
    streak: i,
    finished: i === 0,
    stumble: i === 1,
    ...plateBox(i, LANES.centers, LANES.spacing, ORIGIN),
  }));
}

function board(n: number): BoardRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Pemain Nomor ${i + 1} Yang Panjang`,
    look: lookOf(i + 1),
    color: colorOf(i + 1),
    rank: i + 1,
    racePlace: i < 8 ? i + 1 : null,
    plus: Math.max(0, 8 - i),
    total: 30 - i,
  }));
}

const faces = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, look: lookOf(i + 1), color: colorOf(i + 1) }));

const OVERLAYS: Overlay[] = [
  { kind: 'none' },
  { kind: 'go' },
  { kind: 'waiting', players: faces(1) },
  { kind: 'count', value: 3, label: STR.raceOf(1, 3) },
  {
    kind: 'raceEnd',
    title: 'Pemain 1 menang!',
    sub: 'Selisih 0,1 dtk',
    look: lookOf(1),
    color: '#F2453D',
    photo: true,
  },
  {
    kind: 'raceEnd',
    title: STR.notFinished,
    sub: STR.raceNoFinish(2),
    look: null,
    color: '#FFC928',
    photo: false,
  },
  { kind: 'standings', eyebrow: STR.boardEyebrow(1, 3), rows: board(8), next: STR.boardNext(2) },
  { kind: 'matchEnd', title: 'Pemain 1 juara!', sub: 'Tiga balapan', winners: faces(2) },
];

interface Opts {
  n?: number;
  phase?: Phase;
  overlay?: Overlay;
  server?: number;
  elapsed?: number;
  grace?: number | null;
  ticker?: TickerLine | null;
  marks?: MirrorMarks;
  held?: boolean;
}

function hud(o: Opts, t: number): HudState {
  const elapsed = o.elapsed ?? 12_345;
  const grace = o.grace ?? null;
  return {
    live: true,
    raceLabel: STR.raceOf(2, 3),
    timer: formatClock(elapsed),
    grace: grace === null ? null : STR.graceLeft(Math.ceil(grace / 1000)),
    prompt: true,
    hint: t < 0,
    plates: plates(o.n ?? 4),
    overlay: o.overlay ?? { kind: 'none' },
  };
}

const ANCHOR = 990_000;
/** The go beat: three countdown steps of `countBeats` beats after beat 0. */
const COUNT_STEP = DEFAULT_TUNING.countBeats * DEFAULT_TUNING.beatMs;
const GO_AT = ANCHOR + 3 * COUNT_STEP;

function source(o: Opts = {}): MirrorSource {
  return {
    server: o.server ?? 1_000_000,
    phase: o.phase ?? 'race',
    race: 2,
    totalRaces: 3,
    elapsed: o.elapsed ?? 12_345,
    grace: o.grace ?? null,
    anchor: ANCHOR,
    beatMs: DEFAULT_TUNING.beatMs,
    startAt: GO_AT,
    trackLength: DEFAULT_TUNING.trackLength,
    hopMs: DEFAULT_TUNING.hopMs,
    stumbleMs: DEFAULT_TUNING.stumbleMs,
    hud: hud(o, 0),
    dist: (id) => id * 3.25,
    marks: o.marks ?? new MirrorMarks(),
    lastOrder: [1, 2, 3],
    ticker: o.ticker === undefined ? { key: 7, bold: 'Pemain 1', text: 'melompat jauh!' } : o.ticker,
    held: o.held ?? false,
  };
}

const wire = (src: MirrorSource): unknown => JSON.parse(JSON.stringify(toMirror(src)));

describe('toMirror / applyMirror', () => {
  it('round-trips every overlay through JSON', () => {
    for (const overlay of OVERLAYS) {
      const packed = toMirror(source({ overlay }));
      expect(applyMirror(JSON.parse(JSON.stringify(packed)))).toEqual(packed);
    }
  });

  it('rebuilds the HUD the Host showed, plates on this screen’s lanes', () => {
    for (const overlay of OVERLAYS) {
      const src = source({ overlay, grace: 4_200, n: 8 });
      const s = applyMirror(wire(src))!;
      expect(mirrorHud(s, { elapsed: 12_345, grace: 4_200, overlay: null }, LANES, ORIGIN)).toEqual(src.hud);
    }
  });

  it('gives the scene the roster in lane order with distances', () => {
    const s = applyMirror(wire(source({ n: 3 })))!;
    expect(mirrorRoster(s)).toEqual([
      { id: 1, look: lookOf(1), color: colorOf(1), connected: true, dist: 3.25 },
      { id: 2, look: lookOf(2), color: colorOf(2), connected: true, dist: 6.5 },
      { id: 3, look: lookOf(3), color: colorOf(3), connected: false, dist: 9.75 },
    ]);
  });

  it('keeps a full race with standings of 16 players well under one packet', () => {
    const overlay: Overlay = {
      kind: 'standings',
      eyebrow: STR.boardEyebrow(2, 3),
      rows: board(16),
      next: STR.boardLast,
    };
    const json = JSON.stringify(toMirror(source({ n: 8, overlay, grace: 5_000 })));
    expect(json.length).toBeLessThan(5_000);
    const racing = JSON.stringify(toMirror(source({ n: 8 })));
    expect(racing.length).toBeLessThan(2_500);
  });

  it('rejects malformed states', () => {
    const good = toMirror(source({ n: 2, overlay: OVERLAYS[6] }));
    const json = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
    const row = (json.rc as unknown[][])[0]!;
    const bad: unknown[] = [
      null,
      42,
      'state',
      [],
      { ...json, v: 2 },
      { ...json, t: 'now' },
      { ...json, ph: 'party' },
      { ...json, r: 0 },
      { ...json, n: 999 },
      { ...json, el: -5 },
      { ...json, gr: 'soon' },
      { ...json, bm: 0 },
      { ...json, tl: Number.NaN },
      { ...json, lv: 1 },
      { ...json, hold: 'yes' },
      { ...json, rc: 'racers' },
      { ...json, rc: Array.from({ length: 17 }, () => row) },
      { ...json, rc: [[...row.slice(0, 14)]] },
      { ...json, rc: [[...row.slice(0, 2), { c: 'nobody' }, ...row.slice(3)]] },
      { ...json, rc: [[...row.slice(0, 3), 'red', ...row.slice(4)]] },
      { ...json, rc: [[...row.slice(0, 5), 5000, ...row.slice(6)]] },
      { ...json, rc: [[...row.slice(0, 7), 3, ...row.slice(8)]] },
      { ...json, rc: [[row[0], 'x'.repeat(41), ...row.slice(2)]] },
      { ...json, ov: ['x'] },
      { ...json, ov: ['c', 3] },
      { ...json, ov: ['e', 'a', 'b', { c: 'nobody' }, '#FFC928', true] },
      { ...json, ov: ['s', 'a', [[1, 'b']], 'c'] },
      { ...json, ov: ['m', 'a', 'b', [[1, lookOf(1), 'blue']]] },
      { ...json, lo: ['a'] },
      { ...json, tk: [1, 'a'] },
      { ...json, tk: [1, 'a', 'x'.repeat(201)] },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
    expect(applyMirror(json)).not.toBeNull();
  });
});

describe('MirrorMarks / MarkReader', () => {
  const packet = (marks: MirrorMarks, n = 3): KarungMirror => applyMirror(wire(source({ n, marks })))!;

  it('sets a baseline first, then replays hops, supers, stumbles, finishes and flashes', () => {
    const marks = new MirrorMarks();
    marks.hop(1, 'long');
    const reader = new MarkReader();
    expect(reader.read(packet(marks))).toEqual([]);

    marks.hop(1, 'short');
    marks.hop(2, 'super');
    marks.stumble(3);
    marks.finish(1, 1);
    marks.flash();
    expect(reader.read(packet(marks))).toEqual([
      { type: 'hop', id: 1, kind: 'short', to: 3.25, color: colorOf(1) },
      { type: 'finish', id: 1, place: 1 },
      { type: 'hop', id: 2, kind: 'super', to: 6.5, color: colorOf(2) },
      { type: 'stumble', id: 3, durMs: DEFAULT_TUNING.stumbleMs },
      { type: 'flash' },
    ]);
    // Nothing new: nothing to play.
    expect(reader.read(packet(marks))).toEqual([]);
  });

  it('merges several hops in one packet into one, keeping a super', () => {
    const marks = new MirrorMarks();
    const reader = new MarkReader();
    reader.read(packet(marks));
    marks.hop(1, 'super');
    marks.hop(1, 'long');
    expect(reader.read(packet(marks))).toEqual([
      { type: 'hop', id: 1, kind: 'super', to: 3.25, color: colorOf(1) },
    ]);
  });

  it('finishes again in the next race and ignores non-hops', () => {
    const marks = new MirrorMarks();
    const reader = new MarkReader();
    marks.hop(1, 'none');
    marks.hop(1, 'stumble');
    expect(marks.get(1).hops).toBe(0);
    marks.finish(2, 1);
    reader.read(packet(marks));
    marks.newRace();
    reader.read(packet(marks));
    marks.finish(2, 2);
    expect(reader.read(packet(marks))).toEqual([{ type: 'finish', id: 2, place: 2 }]);
  });

  it('takes a fresh baseline when the Host restarted', () => {
    const marks = new MirrorMarks();
    for (let i = 0; i < 5; i++) marks.hop(1, 'long');
    const reader = new MarkReader();
    reader.read(packet(marks));
    expect(reader.read(packet(new MirrorMarks()))).toEqual([]);
  });
});

describe('mirrorClocks (server time)', () => {
  const at = (o: Opts): KarungMirror => applyMirror(wire(source(o)))!;
  const label = STR.raceOf(2, 3);

  it('runs the race clock and the finish grace on server time from the newest packet', () => {
    const s = at({ server: 1000, elapsed: 5000, grace: 8000 });
    expect(mirrorClocks(s, 1300)).toEqual({ elapsed: 5300, grace: 7700, overlay: null });
    expect(mirrorClocks(s, 1000 + 9000).grace).toBe(8000 - CLOCK_AHEAD_MAX_MS);
    // Paused Host: the clocks stand still.
    expect(mirrorClocks(at({ server: 1000, elapsed: 5000, grace: 8000, held: true }), 1300)).toEqual({
      elapsed: 5000,
      grace: 8000,
      overlay: null,
    });
  });

  it('counts 3, 2, 1 on the Host beats and shows GO on the go beat, not when the packet lands', () => {
    const count = (server: number) =>
      at({ server, phase: 'countdown', elapsed: 0, overlay: { kind: 'count', value: 3, label } });
    const s = count(ANCHOR);
    expect(mirrorClocks(s, ANCHOR - 50).overlay).toEqual({ kind: 'count', value: 3, label });
    expect(mirrorClocks(s, ANCHOR + COUNT_STEP - 1).overlay).toEqual({ kind: 'count', value: 3, label });
    expect(mirrorClocks(s, ANCHOR + COUNT_STEP).overlay).toEqual({ kind: 'count', value: 2, label });
    const late = count(ANCHOR + 2 * COUNT_STEP - 100);
    expect(mirrorClocks(late, ANCHOR + 2 * COUNT_STEP).overlay).toEqual({ kind: 'count', value: 1, label });
    const go = mirrorClocks(late, GO_AT + 40);
    expect(go).toMatchObject({ grace: null, overlay: { kind: 'go' } });
    expect(go.elapsed).toBeCloseTo(40, 0);
    expect(mirrorHud(late, go, LANES, ORIGIN).overlay).toEqual({ kind: 'go' });
  });

  it('keeps the packet overlay while the Host is paused or outside the countdown', () => {
    const held = at({
      server: ANCHOR,
      phase: 'countdown',
      held: true,
      overlay: { kind: 'count', value: 3, label },
    });
    expect(mirrorClocks(held, GO_AT + 10).overlay).toBeNull();
    expect(mirrorClocks(at({ phase: 'standings' }), 2_000_000).overlay).toBeNull();
  });

  it('rejects a go beat before beat 0', () => {
    const raw = wire(source()) as Record<string, unknown>;
    expect(applyMirror({ ...raw, gs: ANCHOR - 1 })).toBeNull();
    expect(applyMirror({ ...raw, gs: 'x' })).toBeNull();
  });
});

describe('MirrorTimeline', () => {
  const at = (t: number, elapsed: number, o: Opts = {}): KarungMirror =>
    applyMirror(wire(source({ ...o, server: t, elapsed })))!;
  it('releases packets in order once the playback point passes them', () => {
    const tl = new MirrorTimeline();
    tl.push(at(1000, 0), 1000);
    expect(tl.flush().map((s) => s.t)).toEqual([1000]);
    tl.push(at(1070, 70), 1070);
    tl.push(at(1140, 140), 1140);
    expect(tl.due(1140)).toEqual([]);
    // No trip and no jitter: packets come out 1.5 packet gaps after they were made.
    const behind = tl.behind!;
    expect(behind).toBeCloseTo(105, 6);
    expect(tl.due(1070 + behind - 1)).toEqual([]);
    expect(tl.due(1070 + behind).map((s) => s.t)).toEqual([1070]);
    expect(tl.due(1140 + behind).map((s) => s.t)).toEqual([1140]);
    expect(tl.due(9999)).toEqual([]);
  });

  it('plays a fast direct link close behind, and follows a route change in order without bursts', () => {
    const tl = new MirrorTimeline();
    const trip = (t: number) => (t < 4000 ? 260 + ((t * 7) % 60) : 30 + ((t * 7) % 5));
    const sent = Array.from({ length: 200 }, (_, i) => i * 60);
    let k = 0;
    let lastT = Number.NEGATIVE_INFINITY;
    let most = 0;
    for (let now = 0; now < 12_000; now += 16) {
      while (k < sent.length && sent[k]! + trip(sent[k]!) <= now) {
        const t = sent[k++]!;
        if (tl.push(at(t, t), t + trip(t))) tl.flush();
      }
      const out = tl.due(now);
      most = Math.max(most, out.length);
      for (const p of out) {
        expect(p.t).toBeGreaterThan(lastT);
        lastT = p.t;
      }
    }
    // Hops come out one frame at a time, never in a burst that would skip the Host's rhythm.
    expect(most).toBeLessThanOrEqual(1);
    expect(tl.lag).toBeLessThan(36);
    expect(tl.behind! - tl.lag!).toBeLessThan(120);
  });

  it('snaps on a new phase, a pause or a Host restart, handing out what was waiting first', () => {
    const tl = new MirrorTimeline();
    tl.push(at(1000, 0), 1000);
    tl.flush();
    expect(tl.push(at(1070, 70), 1070)).toBe(false);
    expect(tl.push(at(1140, 140, { phase: 'raceEnd' }), 1140)).toBe(true);
    expect(tl.flush().map((s) => s.ph)).toEqual(['race', 'raceEnd']);
    expect(tl.push(at(1200, 140, { phase: 'raceEnd', held: true }), 1200)).toBe(true);
    expect(tl.push(at(500, 0, { phase: 'raceEnd', held: true }), 1300)).toBe(true);
  });

  it('never keeps more than a short queue when this screen stops drawing', () => {
    const tl = new MirrorTimeline();
    tl.push(at(0, 0), 0);
    tl.flush();
    for (let i = 1; i <= 100; i++) tl.push(at(i * 70, i * 70), i * 70);
    // Playback point far before every packet: only the overflow comes out.
    expect(tl.due(-10_000).length).toBe(60);
  });
});
