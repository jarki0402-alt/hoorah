import { describe, expect, it } from 'vitest';
import { GhostBrain, nextStep } from './brain';
import { castRay, inCone, lineOfSight, opaqueFor } from './light';
import { ghostFor, HauntMatch, REVEAL_S } from './logic';
import { COLS, MAP_IDS, MAPS, pickKeys, ROWS, Tile, tileAt } from './maps';
import { buildResult, pickAwards } from './results';
import { HauntWorld, TUNE } from './world';

function seq(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function world(residents = [1, 2], ghostId = 9) {
  return new HauntWorld({
    map: MAPS.rumah,
    fright: 'beneran',
    residents,
    ghostId,
    skin: 'bayangan',
    rnd: seq(3),
  });
}

function run(w: HauntWorld, s: number): void {
  for (let t = 0; t < s; t += 1 / 60) w.update(1 / 60);
}

describe('maps', () => {
  it('are closed, with spawns, keys, a fuse and a reachable exit', () => {
    for (const id of MAP_IDS) {
      const m = MAPS[id];
      for (let x = 0; x < COLS; x++) {
        expect([Tile.Wall, Tile.Exit]).toContain(tileAt(m, x, 0));
        expect([Tile.Wall, Tile.Exit]).toContain(tileAt(m, x, ROWS - 1));
      }
      expect(m.spawns.length).toBeGreaterThanOrEqual(7);
      expect(m.keySpots.length).toBeGreaterThanOrEqual(5);
      expect(m.exits.length).toBe(2);
      // Every key spot and the fuse can be reached by the ghost's path search from its start.
      for (const k of [...m.keySpots, m.spawns[0]!])
        expect(nextStep(m, m.ghost.x, m.ghost.y, k.x, k.y), `${id} ${k.x},${k.y}`).not.toBeNull();
    }
  });

  it('picks three key spots far apart', () => {
    const keys = pickKeys(MAPS.rumah, seq(5));
    expect(keys).toHaveLength(3);
    expect(new Set(keys.map((k) => `${k.x},${k.y}`)).size).toBe(3);
  });
});

describe('light', () => {
  it('stops rays at walls and tests cones', () => {
    const op = opaqueFor(MAPS.rumah, () => false, false);
    // From the corridor straight up into the wall row 7 (doorways excepted).
    expect(castRay(op, 3.5, 8.5, -Math.PI / 2, 10)).toBeCloseTo(0.5, 3);
    expect(lineOfSight(op, 2.5, 8.5, 28.5, 8.5)).toBe(true);
    expect(lineOfSight(op, 2.5, 8.5, 2.5, 3.5)).toBe(false);
    expect(inCone(0, 0, 0, 0.5, 5, 3, 0.5)).toBe(true);
    expect(inCone(0, 0, 0, 0.5, 5, 0, 3)).toBe(false);
    expect(inCone(0, 0, 0, 0.5, 5, 7, 0)).toBe(false);
  });
});

describe('round', () => {
  it('finds keys, charges the fuse, opens the exit and lets residents escape', () => {
    const w = world([1]);
    const r = w.residents[0]!;
    w.ghost.x = 26.5;
    w.ghost.y = 1.5;
    for (const k of w.keys) {
      r.x = k.x + 0.5;
      r.y = k.y + 0.5;
      w.update(1 / 60);
    }
    expect(w.keysFound).toBe(3);
    expect(w.exitOpen).toBe(false);
    r.x = MAPS.rumah.fuse.x - 0.5;
    r.y = MAPS.rumah.fuse.y + 0.5;
    run(w, TUNE.fuseS + 0.3);
    expect(w.fuseOn).toBe(true);
    expect(w.exitOpen).toBe(true);
    expect(w.ghostRevealed()).toBe(true);
    const e = MAPS.rumah.exits[0]!;
    r.x = e.x + 0.5;
    r.y = e.y - 0.5;
    w.setStick(1, 0, 1);
    run(w, 0.6);
    expect(r.state).toBe('out');
    expect(w.over).toBe(true);
    expect(w.winner).toBe('penghuni');
  });

  it('turns a caught resident into a firefly, and the ghost wins when nobody escapes', () => {
    const w = world([1]);
    const r = w.residents[0]!;
    w.ghost.x = r.x + 0.3;
    w.ghost.y = r.y;
    w.update(1 / 60);
    expect(r.state).toBe('fly');
    expect(w.ghost.catches).toBe(1);
    expect(w.over).toBe(true);
    expect(w.winner).toBe('hantu');
  });

  it('dazzles a ghost held in a beam, which then cannot catch', () => {
    const w = world([1, 2]);
    const r = w.residents[0]!;
    r.x = 4.5;
    r.y = 8.5;
    r.face = 0;
    w.residents[1]!.x = 20.5;
    w.residents[1]!.y = 15.5;
    w.ghost.x = 8.5;
    w.ghost.y = 8.5;
    run(w, TUNE.silauAfter + 0.1);
    expect(w.ghost.silau).toBeGreaterThan(0);
    expect(r.stats.lit).toBeGreaterThan(1);
    w.ghost.x = r.x + 0.3;
    w.update(1 / 60);
    expect(r.state).toBe('in');
  });

  it('slams a door that blocks residents but not the ghost, and turns the lights out', () => {
    const w = world([1]);
    const g = w.ghost;
    g.x = 14.5;
    g.y = 8.5;
    expect(w.slam()).toBe(false);
    g.doorCd = 0;
    expect(w.slam()).toBe(true);
    expect(w.slam()).toBe(false);
    expect(w.isShut(14, 7)).toBe(true);
    expect(w.isShut(15, 7)).toBe(true);
    g.x = 28.5;
    g.y = 15.5;
    const r = w.residents[0]!;
    r.x = 14.5;
    r.y = 8.5;
    w.setStick(1, 0, -1);
    run(w, 0.5);
    expect(r.y).toBeGreaterThan(8);
    g.lightsCd = 0;
    expect(w.lightsOut()).toBe(true);
    expect(w.lampOn()).toBe(false);
    expect(w.shining(r)).toBe(false);
    run(w, TUNE.doorShutS + 0.2);
    expect(w.isShut(14, 7)).toBe(false);
  });

  it('beats the heart faster as the ghost comes closer', () => {
    const w = world([1]);
    const r = w.residents[0]!;
    w.ghost.x = r.x + 6;
    w.ghost.y = r.y - 0.5;
    w.update(1 / 60);
    const far = r.heart;
    w.ghost.x = r.x + 2;
    w.update(1 / 60);
    expect(r.heart).toBeGreaterThan(far);
  });
});

describe('computer ghost', () => {
  it('walks towards a resident it notices', () => {
    const w = world([1]);
    const brain = new GhostBrain(0.9, seq(2));
    const r = w.residents[0]!;
    r.x = 10.5;
    r.y = 8.5;
    w.ghost.x = 18.5;
    w.ghost.y = 8.5;
    const d0 = Math.hypot(r.x - w.ghost.x, r.y - w.ghost.y);
    for (let i = 0; i < 120; i++) {
      const s = brain.update(w, 1 / 60);
      w.setStick(w.ghost.id, s.x, s.y);
      w.update(1 / 60);
    }
    expect(Math.hypot(r.x - w.ghost.x, r.y - w.ghost.y)).toBeLessThan(d0 - 1);
  });
});

describe('session', () => {
  it('passes the ghost role around and uses the computer when alone', () => {
    expect(ghostFor([4], 0, 0, -1)).toBe(-1);
    expect([0, 1, 2].map((r) => ghostFor([4, 5, 6], r, 1, -1))).toEqual([5, 6, 4]);
  });

  it('runs setup, reveal, hunt and end, then scores everyone', () => {
    const m = new HauntMatch({ rounds: 2, offset: 0, cpuId: -1, rnd: seq(7) });
    m.setPeople([
      { id: 1, name: 'Rina', connected: true },
      { id: 2, name: 'Tono', connected: true },
      { id: 3, name: 'Dodi', connected: true },
    ]);
    expect(m.pick('kampung')).toBe(true);
    m.next();
    expect(m.pick('beneran')).toBe(true);
    m.start();
    expect(m.phase).toBe('reveal');
    expect(m.roleOf(1)).toBe('ghost');
    for (let t = 0; t < REVEAL_S + 0.1; t += 1 / 30) m.update(1 / 30);
    expect(m.phase).toBe('hunt');
    // The ghost touches both residents.
    const w = m.world!;
    for (const r of w.residents) {
      w.ghost.x = r.x;
      w.ghost.y = r.y;
      m.update(1 / 60);
    }
    expect(m.phase).toBe('end');
    expect(m.lastResult()?.winner).toBe('hantu');
    expect(m.tallies.get(1)?.points).toBe(7);
    for (let t = 0; t < 7; t += 1 / 30) m.update(1 / 30);
    expect(m.phase).toBe('reveal');
    expect(m.roleOf(2)).toBe('ghost');
    const res = buildResult(m, [1, 2, 3], (id) => m.person(id)?.name ?? '');
    expect(res.ranking[0]?.playerId).toBe(1);
    expect(new Set(res.awards?.map((a) => a.playerId))).toEqual(new Set([1, 2, 3]));
  });

  it('gives every player a title', () => {
    const base = {
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
    const a = pickAwards(
      [
        { ...base, id: 1, catches: 2 },
        { ...base, id: 2, keys: 2, lit: 4 },
        { ...base, id: 3 },
      ],
      [1, 2, 3],
    );
    expect(a.map((x) => x.playerId).sort()).toEqual([1, 2, 3]);
    expect(a.find((x) => x.playerId === 1)?.title).toBe('Hantu Sunyi');
  });
});
