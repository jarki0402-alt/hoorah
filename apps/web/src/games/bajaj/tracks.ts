/**
 * The three circuits: Lingkar Kota (city loop with flyover and roundabout), Pesisir Pantai (beach
 * promenade, a pier over the sea, a humpback bridge you can hop, a lighthouse hairpin) and Jalur
 * Puncak (switchbacks up a tea-covered slope, a tunnel through the ridge, a fast descent).
 * Every loop starts at s = 0 with a straight behind it for the grid.
 */
import type { CircuitId } from './maps/types';
import {
  A,
  FLYOVER_HEIGHT,
  type Landmarks,
  S,
  smooth,
  Track,
  type TrackDef,
  WALL_DEFAULT,
  WALL_FLYOVER,
  WALL_ISLAND,
  WALL_NARROW,
} from './track';

/** Wall that narrows smoothly to `narrow` inside [s0, s1] over `ramp` metres. */
function narrowIn(
  s: number,
  s0: number,
  s1: number,
  ramp: number,
  narrow: number,
  wide = WALL_DEFAULT,
): number {
  const e = smooth(Math.min(s - s0, s1 - s) / ramp);
  return wide + (narrow - wide) * e;
}

/** Cubic Hermite (Catmull-Rom tangents) through (s, y) keys, closed over the loop. */
function keyed(keys: readonly [number, number][], s: number, L: number): number {
  const n = keys.length;
  let i = 0;
  while (i < n - 1 && keys[i + 1]![0] <= s) i++;
  const k0 = keys[i]!;
  const k1 = keys[(i + 1) % n]!;
  const s1 = i + 1 < n ? k1[0] : k1[0] + L;
  const span = s1 - k0[0] || 1;
  const t = (s - k0[0]) / span;
  const prev = keys[(i - 1 + n) % n]!;
  const next = keys[(i + 2) % n]!;
  const sPrev = i - 1 >= 0 ? prev[0] : prev[0] - L;
  const sNext = i + 2 < n ? next[0] : next[0] + L;
  const m0 = ((k1[1] - prev[1]) / (s1 - sPrev)) * span;
  const m1 = ((next[1] - k0[1]) / (sNext - k0[0])) * span;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * k0[1] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * k1[1] + (t3 - t2) * m1;
}

/* ------------------------------------------------------------------ Lingkar Kota */

export const KOTA: TrackDef = {
  id: 'kota',
  // Clockwise: start straight east, a fast right, the market wiggle, the roundabout,
  // the flyover westwards, a two-corner U back onto the start straight.
  segments: [
    S(160),
    A(40, 90),
    S(14),
    A(28, -32),
    S(10),
    A(28, 64),
    S(10),
    A(28, -32),
    S(14),
    A(44, 180),
    S(25),
    A(30, -90),
    S(210),
    A(32, 90),
    S(27.3125),
    A(30, 90),
    S(130),
  ],
  marks(at, L, g) {
    const flyS0 = at(12);
    const crossX = -23;
    const flyMid = flyS0 + (82 - crossX);
    const flyover = {
      s0: flyMid - 82,
      top0: flyMid - 31,
      top1: flyMid + 31,
      s1: Math.min(flyS0 + 204, flyMid + 82),
      crossX,
      z: g.z[Math.round(flyMid / g.step) % g.n]!,
    };
    const radius = 44;
    const rbMid = Math.round((at(9) + at(10)) / 2 / g.step) % g.n;
    return {
      itemRows: [110, at(8) + 7, flyMid, at(16) + 60],
      startStraight: { s0: at(16), s1: L + at(1) },
      flyover,
      roundabout: {
        s0: at(9),
        s1: at(10),
        cx: g.x[rbMid]! - g.tz[rbMid]! * radius,
        cz: g.z[rbMid]! + g.tx[rbMid]! * radius,
        radius,
      },
      market: { s0: at(2) - 6, s1: at(9) },
    };
  },
  height(s, m) {
    const f = m.flyover!;
    if (s <= f.s0 || s >= f.s1) return 0;
    const h =
      s < f.top0
        ? smooth((s - f.s0) / (f.top0 - f.s0))
        : s > f.top1
          ? 1 - smooth((s - f.top1) / (f.s1 - f.top1))
          : 1;
    return h * FLYOVER_HEIGHT;
  },
  walls(s, m, y) {
    const rb = m.roundabout!;
    const e = smooth(y / FLYOVER_HEIGHT / 0.1);
    const isl = smooth(Math.min(s - rb.s0, rb.s1 - s) / 10);
    const fly = WALL_DEFAULT + (WALL_FLYOVER - WALL_DEFAULT) * e;
    return [fly, Math.min(fly, WALL_DEFAULT + (WALL_ISLAND - WALL_DEFAULT) * isl)];
  },
};

/* ------------------------------------------------------------------ Pesisir Pantai */

export const PIER_HEIGHT = 1.4;
export const BRIDGE_HEIGHT = 1.6;
/** Shoreline (z) of Pesisir Pantai: sand to the north of it, sea to the south. */
export const SHORE_Z = 74;

export const PANTAI: TrackDef = {
  id: 'pantai',
  // Promenade east, right onto the pier, a U-turn platform over the sea, back to shore, west along
  // the beach road over the humpback bridge and a dune wiggle, the lighthouse hairpin, home.
  segments: [
    S(120),
    A(40, 90),
    S(90),
    A(26, 180),
    S(52),
    A(28, -90),
    S(90),
    A(45, -22),
    S(18),
    A(45, 44),
    S(18),
    A(45, -22),
    S(50),
    A(25, 180),
    S(160.808),
  ],
  marks(at, L, g) {
    const hp = Math.round((at(13) + at(14)) / 2 / g.step) % g.n;
    // Outside of the right-hand hairpin is to the left: (tz, -tx).
    return {
      itemRows: [70, at(2) + 52, at(6) + 14, at(14) + 70],
      startStraight: { s0: at(14), s1: L + at(1) },
      pier: { s0: at(2) + 24, s1: at(5) + 6 },
      bridge: { s0: at(6) + 36, top: at(6) + 48, s1: at(6) + 53 },
      lighthouse: { x: g.x[hp]! + g.tz[hp]! * 30, z: g.z[hp]! - g.tx[hp]! * 30 },
    };
  },
  height(s, m) {
    const p = m.pier!;
    const b = m.bridge!;
    let y = 0;
    if (s > p.s0 && s < p.s1) y = PIER_HEIGHT * smooth(Math.min(s - p.s0, p.s1 - s) / 10);
    if (s > b.s0 && s < b.s1) {
      // Gentle climb, then a quick drop: fast karts leave the ground for a moment.
      // Steepening ramp into the lip (a kicker), so speed carries the kart off the crest.
      y =
        s < b.top
          ? BRIDGE_HEIGHT * ((s - b.s0) / (b.top - b.s0)) ** 1.6
          : BRIDGE_HEIGHT * (1 - smooth((s - b.top) / (b.s1 - b.top)));
    }
    return y;
  },
  walls(s, m) {
    const p = m.pier!;
    const b = m.bridge!;
    let w = WALL_DEFAULT;
    if (s > p.s0 - 8 && s < p.s1 + 8) w = narrowIn(s, p.s0 - 8, p.s1 + 8, 8, WALL_NARROW);
    if (s > b.s0 - 10 && s < b.s1 + 10) w = Math.min(w, narrowIn(s, b.s0 - 10, b.s1 + 10, 8, WALL_NARROW));
    return [w, w];
  },
};

/* ------------------------------------------------------------------ Jalur Puncak */

export const PUNCAK: TrackDef = {
  id: 'puncak',
  // Start mid-slope, a left hairpin up to the second terrace, a right hairpin to the ridge road,
  // through the tunnel, then a long fast descent around the valley back to the start.
  segments: [
    S(100),
    A(20, -180),
    S(130),
    A(20, 180),
    S(200.058),
    A(32, 90),
    S(30),
    A(45, 30),
    S(20),
    A(45, -30),
    S(23.679),
    A(32, 90),
    S(200),
    A(34, 90),
    S(40),
    A(26, 90),
    S(60),
  ],
  marks(at, L) {
    return {
      itemRows: [60, at(2) + 60, at(4) + 30, at(12) + 100],
      startStraight: { s0: at(16), s1: L + at(1) },
      tunnel: { s0: at(4) + 74, s1: at(4) + 142 },
      viewpoint: { s: (at(3) + at(4)) / 2, side: -1 },
      hairpins: [(at(1) + at(2)) / 2, (at(3) + at(4)) / 2],
    };
  },
  height(s, _m, L) {
    // The spline may dip a little under the valley floor between keys: never below 0.
    return Math.max(0, keyed(puncakKeys(L), s, L));
  },
  walls(s, m) {
    const t = m.tunnel!;
    if (s > t.s0 - 10 && s < t.s1 + 10)
      return [
        narrowIn(s, t.s0 - 10, t.s1 + 10, 8, WALL_NARROW),
        narrowIn(s, t.s0 - 10, t.s1 + 10, 8, WALL_NARROW),
      ];
    return [WALL_DEFAULT, WALL_DEFAULT];
  },
};

let puncakKeyCache: [number, number][] | null = null;
function puncakKeys(L: number): [number, number][] {
  if (puncakKeyCache) return puncakKeyCache;
  // Segment starts of PUNCAK (kept in sync with its segment list).
  const at: number[] = [];
  let acc = 0;
  for (const seg of PUNCAK.segments) {
    at.push(acc);
    acc += seg.kind === 'straight' ? seg.len : (Math.abs(seg.deg) * Math.PI * seg.radius) / 180;
  }
  const a = (i: number) => (at[i]! / acc) * L;
  puncakKeyCache = [
    [0, 4],
    [a(1), 4.5],
    [a(2), 6.5],
    [a(3), 11],
    [a(4), 13],
    [a(4) + 60, 15.5],
    [a(4) + 150, 15.5],
    [a(5), 14],
    [a(7), 12],
    [a(11), 7],
    [a(12) + 60, 3],
    [a(12) + 140, 0],
    [a(13), 0],
    [a(15), 2.5],
  ];
  return puncakKeyCache;
}

export const TRACK_DEFS: Record<CircuitId, TrackDef> = { kota: KOTA, pantai: PANTAI, puncak: PUNCAK };

const cache = new Map<CircuitId, Track>();
/** Each circuit is built once per page. */
export function getTrack(id: CircuitId = 'kota'): Track {
  let t = cache.get(id);
  if (!t) {
    t = new Track(TRACK_DEFS[id]);
    cache.set(id, t);
  }
  return t;
}

export type { Landmarks };
