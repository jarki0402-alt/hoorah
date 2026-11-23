import { describe, expect, it } from 'vitest';
import { Cell, COLS, cellAt, colorCount, foldSlot, LEVELS, type LevelDef, parseLevel, ROWS } from './levels';
import { TUNE, World } from './world';

const EMPTY = `#${'.'.repeat(COLS - 2)}#`;
const FLOOR = '#'.repeat(COLS);

/** A test map: rows given from the top, padded with empty rows and two floor rows at the bottom. */
function map(rows: string[], lifts: LevelDef['lifts'] = []) {
  const all = [FLOOR, ...Array.from({ length: ROWS - 3 - rows.length }, () => EMPTY), ...rows, FLOOR, FLOOR];
  return parseLevel({ par: 60, rows: all, lifts }, 0);
}

function row(cells: Record<number, string>): string {
  let s = '#';
  for (let x = 1; x < COLS - 1; x++) s += cells[x] ?? '.';
  return `${s}#`;
}

function run(w: World, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) w.update(1 / 60);
}

const two = [
  { owner: 1, sub: 0 as const },
  { owner: 2, sub: 0 as const },
];

describe('stage maps', () => {
  it('parse with rock borders, spawns, exits and linked channels', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(6);
    for (const lv of LEVELS) {
      for (let x = 0; x < COLS; x++) {
        expect(cellAt(lv, x, 0), `${lv.id} top`).toBe(Cell.Rock);
        expect(cellAt(lv, x, ROWS - 1), `${lv.id} bottom`).toBe(Cell.Rock);
      }
      for (let y = 0; y < ROWS; y++) {
        expect(cellAt(lv, 0, y)).toBe(Cell.Rock);
        expect(cellAt(lv, COLS - 1, y)).toBe(Cell.Rock);
      }
      expect(lv.spawns.length, lv.id).toBeGreaterThanOrEqual(2);
      for (const slot of [0, 1, 2, 3])
        expect(
          lv.exits.some((e) => e.slot === slot),
          `${lv.id} exit ${slot}`,
        ).toBe(true);
      for (const e of lv.exits) {
        expect(cellAt(lv, e.x, e.y - 1), `${lv.id} door head`).toBe(Cell.Empty);
        expect(cellAt(lv, e.x, e.y + 1), `${lv.id} door floor`).not.toBe(Cell.Empty);
      }
      const targets = new Set<number>(lv.lifts.map((l) => l.ch));
      for (let i = 0; i < lv.cells.length; i++) if (lv.cells[i] === Cell.Door) targets.add(lv.meta[i]!);
      for (const ch of targets) expect(lv.channels, `${lv.id} channel ${ch} has a trigger`).toContain(ch);
      for (const ch of lv.channels)
        expect(targets.has(ch), `${lv.id} channel ${ch} drives something`).toBe(true);
      for (const l of lv.lifts) {
        for (let x = l.x; x < l.x + l.w; x++) {
          for (let y = Math.floor(l.yUp); y <= Math.floor(l.yDown); y++)
            expect(cellAt(lv, x, y), `${lv.id} lift path ${x},${y}`).toBe(Cell.Empty);
        }
      }
      for (const b of lv.boxes.filter((b) => b.heavy)) {
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const)
          expect(cellAt(lv, b.x + dx, b.y + dy)).toBe(Cell.Empty);
      }
    }
  });

  it('folds colour slots onto the colours in play', () => {
    expect(colorCount(1)).toBe(2);
    expect(colorCount(3)).toBe(3);
    expect(colorCount(8)).toBe(4);
    expect(foldSlot(2, 2)).toBe(0);
    expect(foldSlot(3, 2)).toBe(1);
    expect(foldSlot(3, 3)).toBe(0);
    expect(foldSlot(3, 4)).toBe(3);
  });
});

describe('platformer world', () => {
  it('lands on the floor and jumps between two and three tiles high', () => {
    const lv = map([row({ 3: 'S', 4: 'S' })]);
    const w = new World(lv, two);
    run(w, 0.5);
    const c = w.chars[0]!;
    expect(c.grounded).toBe(true);
    expect(c.y + TUNE.charH).toBeCloseTo(ROWS - 2, 3);
    const floor = c.y;
    let top = c.y;
    w.setInput(0, 0, true);
    for (let i = 0; i < 90; i++) {
      w.update(1 / 60);
      top = Math.min(top, c.y);
    }
    const height = floor - top;
    expect(height).toBeGreaterThan(2.15);
    expect(height).toBeLessThan(2.95);
  });

  it('forgives a late jump (coyote time) and an early one (buffer)', () => {
    const ledge = map([row({ 2: 'S', 3: 'S' }), row({ 1: '#', 2: '#', 3: '#', 4: '#' })]);
    const w = new World(ledge, two);
    run(w, 0.4);
    const c = w.chars[0]!;
    w.setInput(0, 1, false);
    // Walk off the ledge, then press jump a moment after leaving it.
    let left = false;
    for (let i = 0; i < 120 && !left; i++) {
      w.update(1 / 120);
      if (!c.grounded) left = true;
    }
    expect(left).toBe(true);
    w.update(0.05);
    w.setInput(0, 1, true);
    w.update(1 / 120);
    w.update(1 / 120);
    expect(c.vy).toBeLessThan(0);
    w.setInput(0, 0, false);
    // Buffer: press just before landing.
    run(w, 1.5);
    expect(c.grounded).toBe(true);
    const w2 = new World(map([row({ 3: 'S', 4: 'S' })]), two);
    const d = w2.chars[0]!;
    d.y -= 1.2;
    let jumped = false;
    for (let i = 0; i < 240; i++) {
      const bottom = d.y + TUNE.charH;
      w2.setInput(0, 0, ROWS - 2 - bottom < 0.25 && d.vy > 0 ? true : d.inJump);
      w2.update(1 / 120);
      if (d.vy < -5) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('sends other colours back from a pool and lets the matching colour wade through', () => {
    // A B pool in the floor under x = 8..12.
    const rows = [...Array.from({ length: ROWS }, (_, y) => (y === 0 || y >= ROWS - 2 ? FLOOR : EMPTY))];
    rows[ROWS - 3] = row({ 3: 'S', 4: 'S' });
    rows[ROWS - 2] = `#${'#'.repeat(7)}BBBBB${'#'.repeat(COLS - 14)}#`;
    const pools = parseLevel({ par: 60, rows }, 0);
    const w = new World(pools, two);
    run(w, 0.3);
    w.setInput(0, 1, false); // Merah walks into the blue pool.
    w.setInput(1, 1, false); // Biru wades through.
    let died = false;
    for (let i = 0; i < 400; i++) {
      w.update(1 / 120);
      for (const e of w.drainEvents()) if (e.type === 'die' && e.key === 0) died = true;
    }
    expect(died).toBe(true);
    expect(w.chars[1]!.dead).toBe(false);
    expect(w.chars[1]!.x).toBeGreaterThan(13);
  });

  it('blocks other colours at a gate', () => {
    const rows = Array.from({ length: ROWS }, (_, y) => (y === 0 || y >= ROWS - 2 ? FLOOR : EMPTY));
    rows[ROWS - 3] = row({ 3: 'S', 4: 'S', 10: 'b' });
    rows[ROWS - 4] = row({ 10: 'b' });
    rows[ROWS - 5] = row({ 10: '#' });
    const w = new World(parseLevel({ par: 60, rows }, 0), two);
    w.setInput(0, 1, false);
    w.setInput(1, 1, false);
    run(w, 2.5);
    expect(w.chars[0]!.x + TUNE.charW).toBeLessThanOrEqual(10 + 1e-3);
    expect(w.chars[1]!.x).toBeGreaterThan(11);
  });

  it('opens a door while a plate is held and never closes it on someone', () => {
    const rows = Array.from({ length: ROWS }, (_, y) => (y === 0 || y >= ROWS - 2 ? FLOOR : EMPTY));
    rows[ROWS - 3] = row({ 3: 'S', 4: 'S', 6: 'u', 12: 'U' });
    for (let y = 1; y < ROWS - 3; y++) rows[y] = row({ 12: 'U' });
    const w = new World(parseLevel({ par: 60, rows }, 0), two);
    run(w, 0.3);
    expect(w.doorOpen.get(1)).toBe(false);
    // Merah steps on the plate.
    w.setInput(0, 1, false);
    for (let i = 0; i < 400 && !w.plateOn[0]; i++) w.update(1 / 120);
    w.setInput(0, 0, false);
    run(w, 0.3);
    expect(w.plateOn[0]).toBe(true);
    expect(w.doorOpen.get(1)).toBe(true);
    // Biru walks into the doorway, Merah leaves the plate: the door waits for Biru.
    w.setInput(1, 1, false);
    for (let i = 0; i < 600; i++) {
      w.update(1 / 120);
      const b = w.chars[1]!;
      if (b.x + TUNE.charW > 12.3 && b.x < 12.7) break;
    }
    w.setInput(1, 0, false);
    w.setInput(0, -1, false);
    run(w, 0.4);
    expect(w.plateOn[0]).toBe(false);
    expect(w.doorOpen.get(1)).toBe(true);
    w.setInput(1, 1, false);
    run(w, 1);
    expect(w.doorOpen.get(1)).toBe(false);
  });

  it('moves a heavy box only with two pushers (one when playing alone)', () => {
    const rows = Array.from({ length: ROWS }, (_, y) => (y === 0 || y >= ROWS - 2 ? FLOOR : EMPTY));
    rows[ROWS - 4] = row({ 8: 'O' });
    rows[ROWS - 3] = row({ 3: 'S', 4: 'S' });
    const lv = parseLevel({ par: 60, rows }, 0);
    const w = new World(lv, two);
    run(w, 0.3);
    const x0 = w.boxes[0]!.x;
    w.setInput(0, 1, false);
    run(w, 1.5);
    expect(w.boxes[0]!.x).toBeCloseTo(x0, 3);
    w.setInput(1, 1, false);
    run(w, 1.5);
    expect(w.boxes[0]!.x).toBeGreaterThan(x0 + 1);

    const solo = new World(lv, two, { solo: true });
    run(solo, 0.3);
    solo.setInput(0, 1, false);
    run(solo, 1.5);
    expect(solo.boxes[0]!.x).toBeGreaterThan(x0 + 1);
  });

  it('never lets a character stand on another one (no stacking)', () => {
    const lv = map([row({ 3: 'S', 4: 'S' })]);
    const w = new World(lv, two);
    run(w, 0.3);
    const top = w.chars[1]!;
    const bottom = w.chars[0]!;
    top.x = bottom.x;
    top.y = bottom.y - TUNE.charH - 0.3;
    run(w, 0.6);
    expect(top.support).toBeNull();
    expect(top.grounded).toBe(true);
    expect(top.y).toBeCloseTo(bottom.y, 3);
  });

  it('flips a lever by walking over it and raises a lift on its channel', () => {
    const lifts = [{ ch: 1, x: 14, w: 3, yDown: ROWS - 3, yUp: ROWS - 8 }];
    const rows = Array.from({ length: ROWS }, (_, y) => (y === 0 || y >= ROWS - 2 ? FLOOR : EMPTY));
    rows[ROWS - 3] = row({ 3: 'S', 4: 'S', 8: 'j' });
    const w = new World(parseLevel({ par: 60, rows, lifts }, 0), two);
    run(w, 0.3);
    w.setInput(0, 1, false);
    run(w, 1);
    w.setInput(0, 0, false);
    expect(w.leverOn[0]).toBe(true);
    run(w, 3);
    expect(w.lifts[0]!.y).toBeCloseTo(ROWS - 8, 3);
  });

  it('finishes when every character stands at its own door', () => {
    const rows = Array.from({ length: ROWS }, (_, y) => (y === 0 || y >= ROWS - 2 ? FLOOR : EMPTY));
    rows[ROWS - 3] = row({ 3: 'S', 4: 'S', 10: 'F', 12: 'E' });
    const w = new World(parseLevel({ par: 60, rows }, 0), two);
    w.setInput(0, 1, false);
    w.setInput(1, 1, false);
    let cleared = false;
    for (let i = 0; i < 800 && !cleared; i++) {
      for (const c of w.chars) {
        const door = c.slot === 0 ? 12 : 10;
        const mid = c.x + TUNE.charW / 2;
        w.setInput(c.key, Math.abs(mid - (door + 0.5)) < 0.15 ? 0 : Math.sign(door + 0.5 - mid), false);
      }
      w.update(1 / 60);
      for (const e of w.drainEvents()) if (e.type === 'clear') cleared = true;
    }
    expect(cleared).toBe(true);
    expect(w.exitCount(0)).toEqual({ in: 1, total: 1 });
  });
});

describe('feel and helpers (owner 2026-11-22)', () => {
  it('runs at full speed past a quarter of the stick and stands below it', () => {
    const w = new World(map([row({ 3: 'S', 4: 'S' })]), two);
    run(w, 0.4);
    const c = w.chars[0]!;
    w.setInput(0, 0.2, false);
    expect(c.inX).toBe(0);
    w.setInput(0, 0.3, false);
    expect(c.inX).toBe(1);
    run(w, 0.5);
    expect(c.vx).toBeCloseTo(TUNE.run, 3);
  });

  it('jumps again on every landing while the button is held', () => {
    const w = new World(map([row({ 3: 'S', 4: 'S' })]), two);
    run(w, 0.4);
    const c = w.chars[0]!;
    let jumps = 0;
    w.setInput(0, 0, true);
    for (let i = 0; i < 60 * 3; i++) {
      w.update(1 / 60);
      for (const e of w.drainEvents()) if (e.type === 'jump') jumps++;
    }
    expect(jumps).toBeGreaterThanOrEqual(3);
    expect(c.stats.jumps).toBe(jumps);
  });

  it('passes up through a wooden plank and stands on it', () => {
    const lv = map([row({ 3: '=', 4: '=', 5: '=', 6: '=' }), row({ 4: 'S', 8: 'S' })]);
    const w = new World(lv, two);
    run(w, 0.4);
    const c = w.chars[0]!;
    const floor = c.y;
    w.setInput(0, 0, true);
    w.update(1 / 60);
    w.setInput(0, 0, false);
    run(w, 1.2);
    expect(c.grounded).toBe(true);
    expect(floor - c.y).toBeCloseTo(2, 1);
  });

  it('bounces off a mushroom', () => {
    const lv = map([row({ 3: 'S', 5: 'm', 9: 'S' })]);
    const w = new World(lv, two);
    run(w, 0.4);
    w.setInput(0, 1, false);
    let bounced = false;
    for (let i = 0; i < 60; i++) {
      w.update(1 / 60);
      for (const e of w.drainEvents()) if (e.type === 'bounce') bounced = true;
      if (bounced) w.setInput(0, 0, false);
    }
    expect(bounced).toBe(true);
  });

  it('lays a helper plank over a pool after three falls into it', () => {
    const lv = map([row({ 3: 'S', 12: 'S' }), row({ 6: 'B', 7: 'B', 8: 'B' }).replace(/\./g, '#')]);
    const w = new World(lv, two);
    run(w, 0.4);
    const red = w.chars[0]!;
    let assists = 0;
    for (let fall = 0; fall < 3; fall++) {
      red.x = 7.1;
      red.y = ROWS - 4;
      red.vy = 0;
      run(w, 1.5);
      for (const e of w.drainEvents()) if (e.type === 'assist') assists++;
    }
    expect(red.stats.deaths).toBe(3);
    expect(assists).toBe(1);
    expect(w.assist.size).toBe(3);
    red.x = 7.1;
    red.y = ROWS - 5;
    run(w, 1);
    expect(red.dead).toBe(false);
    expect(red.grounded).toBe(true);
  });

  it('lets a third colour through the gate it pairs with', () => {
    const lv = map([row({ 3: 'S', 4: 'S', 5: 'S' })]);
    const w = new World(lv, [...two, { owner: 3, sub: 0 }]);
    expect(w.gateOpenFor(0, 2)).toBe(true);
    expect(w.gateOpenFor(1, 2)).toBe(false);
    expect(w.gateOpenFor(0, 0)).toBe(true);
    expect(w.gateOpenFor(0, 1)).toBe(false);
  });
});
