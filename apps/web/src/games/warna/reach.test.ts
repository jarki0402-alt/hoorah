import { describe, expect, it } from 'vitest';
import { BIOMES, Cell, COLS, cellAt, LEVELS, type Level, parseLevel, ROWS, WORLD_SIZE } from './levels';
import { BOUNCE_TILES, JUMP_TILES, TUNE, World } from './world';

/*
 * Rules every stage must keep (owner 2026-11-22, design "Petualangan Warna Baru", section 5):
 *  - every gem, exit, plate and lever can be reached by one character alone, using only jumps
 *    within the stage's limits: climb 2 tiles and cross 3 (stages 1–5 of a world: 1 and 2), while
 *    the real jump climbs 2.5 and crosses 4. Doors and gates count as open (the puzzle opens them),
 *    pools as floors, lifts as a floor anywhere on their track, a box as a step anywhere it can
 *    slide to, a mushroom as a bounce of 4 tiles;
 *  - footing: every ledge is at least 3 tiles wide (4 in stages 1–12);
 *  - headroom: three empty tiles above every spot a character can stand on;
 *  - exits of one row stand at least 2 tiles apart, plates and levers keep a free tile on each side.
 * The jump limits are checked against the real simulation first.
 * Not checked here: the order of a co-op puzzle (who holds which plate), which needs a full solver.
 */

interface Limits {
  up: number;
  across: number;
  drop: number;
  foot: number;
}

function limitsOf(lv: Level): Limits {
  return {
    up: lv.number <= 5 ? 1 : 2,
    across: lv.number <= 5 ? 2 : 3,
    drop: lv.number <= 5 ? 3 : 4,
    foot: lv.number <= 12 ? 4 : 3,
  };
}

/** Rise of a mushroom bounce the check allows (rows). */
const BOUNCE_UP = 4;
/** Rows above the feet a jumping character can touch (its own row included). */
const TOUCH = 3;
/** Empty rows required above every standing spot. */
const HEADROOM = 3;

const inside = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS;
/** Room for a body: only rock, pools and mushroom caps block (doors, gates, planks are passable). */
const open = (lv: Level, x: number, y: number) => {
  if (!inside(x, y)) return false;
  const c = cellAt(lv, x, y);
  return c !== Cell.Rock && c !== Cell.Pool && c !== Cell.Bounce;
};
const key = (x: number, y: number) => y * COLS + x;

/** Feet rows a character can stand on beyond the map cells: lift tracks and box steps. */
function extraFloors(lv: Level): Set<number> {
  const floors = new Set<number>();
  for (const l of lv.lifts) {
    for (let y = l.yUp; y <= l.yDown; y++) for (let x = l.x; x < l.x + l.w; x++) floors.add(key(x, y));
  }
  for (const b of lv.boxes) {
    const h = b.heavy ? 2 : 1;
    const w = b.heavy ? 2 : 1;
    const floor = b.y + h;
    const fits = (x: number) => {
      if (!inside(x, floor) || cellAt(lv, x, floor) !== Cell.Rock) return false;
      for (let y = floor - h; y < floor; y++) if (!open(lv, x, y)) return false;
      return true;
    };
    let lo = b.x;
    while (fits(lo - 1)) lo--;
    let hi = b.x + w - 1;
    while (fits(hi + 1)) hi++;
    for (let x = lo; x <= hi; x++) floors.add(key(x, floor - h));
  }
  return floors;
}

/** All feet positions (x, y = the row the feet rest on) one character can reach from a spawn. */
function reachable(lv: Level, lim: Limits): Set<number> {
  const floors = extraFloors(lv);
  const supports = (x: number, y: number) =>
    !inside(x, y) || cellAt(lv, x, y) !== Cell.Empty || floors.has(key(x, y));
  const stand = (x: number, y: number) => inside(x, y) && open(lv, x, y - 1) && supports(x, y);
  const land = (x: number, from: number): number | null => {
    for (let y = from; y < ROWS; y++) {
      if (!open(lv, x, y - 1)) return null;
      if (supports(x, y)) return y;
    }
    return null;
  };
  const clear = (x: number, top: number, bottom: number) => {
    for (let y = top; y <= bottom; y++) if (!open(lv, x, y)) return false;
    return true;
  };
  const seen = new Set<number>();
  const queue: [number, number][] = [];
  const visit = (x: number, y: number | null) => {
    if (y === null || seen.has(key(x, y))) return;
    seen.add(key(x, y));
    queue.push([x, y]);
  };
  for (const s of lv.spawns) visit(s.x, land(s.x, s.y + 1));
  while (queue.length > 0) {
    const [x, y] = queue.shift() as [number, number];
    const bounce = cellAt(lv, x, y) === Cell.Bounce;
    const up = bounce ? BOUNCE_UP : lim.up;
    for (let dx = -lim.drop; dx <= lim.drop; dx++) {
      const tx = x + dx;
      const step = Math.sign(dx);
      // Walking off a ledge.
      if (Math.abs(dx) === 1 && open(lv, tx, y - 1)) visit(tx, land(tx, y));
      for (let ty = y - up; ty < ROWS; ty++) {
        if (!stand(tx, ty) || (tx === x && ty === y)) continue;
        if (ty <= y) {
          // Up or level: room to rise (the head clears one more row on a full climb).
          const rise = y - ty;
          const headTop = rise >= up && !bounce ? ty - 2 : ty - 1;
          if (Math.abs(dx) > lim.across || !clear(x, headTop, y - 1)) continue;
          let ok = true;
          for (let ix = x + step; ix !== tx && ok; ix += step)
            ok = open(lv, ix, ty - 1) && open(lv, ix, y - 1);
          if (ok) visit(tx, ty);
        } else {
          // Down: nothing above the start height in between, a clear fall at the goal.
          let ok = clear(tx, y - 1, ty - 1);
          for (let ix = x + step; ix !== tx && ok; ix += step) ok = open(lv, ix, y - 1);
          if (ok) visit(tx, ty);
        }
      }
    }
  }
  return seen;
}

/** A stand next to the target with a clear column from the body up to the target's row. */
function touches(lv: Level, seen: Set<number>, tx: number, ty: number): boolean {
  for (const k of seen) {
    const x = k % COLS;
    const y = Math.floor(k / COLS);
    const reach = cellAt(lv, x, y) === Cell.Bounce ? BOUNCE_UP + 1 : TOUCH;
    if (Math.abs(x - tx) > 1 || ty < y - reach || ty > y - 1) continue;
    let ok = true;
    for (let r = ty; r <= y - 1 && ok; r++) ok = open(lv, x, r);
    if (ok && open(lv, tx, ty)) return true;
  }
  return false;
}

/** Standing spots made by the map itself (rock and planks; pools and mushrooms break a ledge). */
function standsOn(lv: Level, x: number, y: number): boolean {
  if (!inside(x, y) || !open(lv, x, y - 1)) return false;
  const c = cellAt(lv, x, y);
  return c === Cell.Rock || c === Cell.Plank;
}

function footingErrors(lv: Level, lim: Limits): string[] {
  const out: string[] = [];
  for (let y = 1; y < ROWS; y++) {
    let x = 0;
    while (x < COLS) {
      if (!standsOn(lv, x, y)) {
        x++;
        continue;
      }
      let x1 = x;
      while (standsOn(lv, x1 + 1, y)) x1++;
      const w = x1 - x + 1;
      if (w < lim.foot) out.push(`ledge ${x}..${x1} row ${y} is ${w} wide`);
      x = x1 + 1;
    }
  }
  return out;
}

function headroomErrors(lv: Level): string[] {
  const out: string[] = [];
  for (let y = 1; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!standsOn(lv, x, y)) continue;
      for (let r = 1; r <= HEADROOM; r++) {
        if (!open(lv, x, y - r)) {
          out.push(`stand ${x},${y} has ${r - 1} free rows`);
          break;
        }
      }
    }
  }
  return out;
}

function spacingErrors(lv: Level): string[] {
  const out: string[] = [];
  for (const a of lv.exits)
    for (const b of lv.exits)
      if (a !== b && a.y === b.y && Math.abs(a.x - b.x) < 2) out.push(`exits ${a.x} and ${b.x} touch`);
  for (const s of [...lv.plates, ...lv.levers])
    if (!open(lv, s.x - 1, s.y) || !open(lv, s.x + 1, s.y)) out.push(`switch ${s.x},${s.y} against a wall`);
  return out;
}

function emptyMap(): string[] {
  const e = `#${'.'.repeat(COLS - 2)}#`;
  const f = '#'.repeat(COLS);
  return [f, ...Array.from({ length: ROWS - 4 }, () => e), `#..S${'.'.repeat(COLS - 5)}#`, f, f];
}

function settle(w: World): void {
  for (let i = 0; i < 30; i++) w.update(1 / 60);
}

describe('stage rules', () => {
  it('the real jump climbs 2.5 tiles whether tapped or held', () => {
    for (const hold of [2, 60]) {
      const w = new World(parseLevel({ par: 60, rows: emptyMap() }, 0), [{ owner: 1, sub: 0 }]);
      settle(w);
      const c = w.chars[0]!;
      const y0 = c.y;
      let top = y0;
      w.setInput(0, 0, true);
      for (let i = 0; i < 70; i++) {
        if (i === hold) w.setInput(0, 0, false);
        w.update(1 / 60);
        top = Math.min(top, c.y);
      }
      expect(y0 - top).toBeGreaterThan(2 + 0.4);
      expect(y0 - top).toBeLessThan(JUMP_TILES + 0.1);
    }
  });

  it('a running jump crosses more than 3 tiles while climbing 2', () => {
    const w = new World(parseLevel({ par: 60, rows: emptyMap() }, 0), [{ owner: 1, sub: 0 }]);
    settle(w);
    const c = w.chars[0]!;
    w.setInput(0, 1, false);
    for (let i = 0; i < 30; i++) w.update(1 / 60);
    const x0 = c.x;
    const y0 = c.y;
    w.setInput(0, 1, true);
    w.update(1 / 60);
    w.setInput(0, 1, false);
    let x2 = x0;
    for (let i = 0; i < 80; i++) {
      w.update(1 / 60);
      if (c.y < y0 - 2) x2 = c.x;
    }
    expect(x2 - x0 + TUNE.charW).toBeGreaterThan(3.3);
  });

  it('a mushroom bounces higher than the check allows', () => {
    const rows = emptyMap();
    rows[15] = `#..S.m${'.'.repeat(COLS - 7)}#`;
    const w = new World(parseLevel({ par: 60, rows }, 0), [{ owner: 1, sub: 0 }]);
    settle(w);
    const c = w.chars[0]!;
    const floor = c.y;
    w.setInput(0, 1, false);
    let top = c.y;
    for (let i = 0; i < 90; i++) {
      w.update(1 / 60);
      if (c.x > 5.4) w.setInput(0, 0, false);
      top = Math.min(top, c.y);
    }
    expect(floor - top).toBeGreaterThan(BOUNCE_UP + 0.25);
    expect(BOUNCE_TILES).toBeGreaterThan(BOUNCE_UP);
  });

  it('every world holds 30 stages at most and numbers them from 1', () => {
    for (const b of BIOMES) {
      expect(b.levels.length).toBeLessThanOrEqual(WORLD_SIZE);
      b.levels.forEach((lv, i) => {
        expect(lv.number).toBe(i + 1);
      });
    }
    expect(BIOMES.find((b) => b.id === 'hutan')?.levels.length).toBe(WORLD_SIZE);
  });

  for (const lv of LEVELS) {
    const lim = limitsOf(lv);
    it(`${lv.id}: every gem, exit, plate and lever is reachable alone within the limits`, () => {
      const seen = reachable(lv, lim);
      const targets = [
        ...lv.gems.map((g) => ['gem', g.x, g.y] as const),
        ...lv.exits.map((g) => ['exit', g.x, g.y] as const),
        ...lv.plates.map((g) => ['plate', g.x, g.y] as const),
        ...lv.levers.map((g) => ['lever', g.x, g.y] as const),
      ];
      const missed = targets
        .filter(([, x, y]) => !touches(lv, seen, x, y))
        .map(([k, x, y]) => `${k} ${x},${y}`);
      expect(missed.join('; ')).toBe('');
    });
    it(`${lv.id}: footing, headroom and spacing`, () => {
      expect([...footingErrors(lv, lim), ...headroomErrors(lv), ...spacingErrors(lv)].join('; ')).toBe('');
      expect(lv.spawns.length).toBeGreaterThanOrEqual(2);
      expect(lv.exits.length).toBeGreaterThanOrEqual(2);
    });
  }
});
