/**
 * Petualangan Warna stages: 32×18 tile maps written as text, parsed once into typed data (pure).
 *
 * Colour slots: maps name colours by slot (A..D). A stage is played with K colours (2 for two
 * characters, 3 for three, 4 for four or more); a slot past K folds onto an existing colour
 * (`slot % K`), so every stage is designed to be solvable by two characters of slots A and B
 * while extra colours only add personal gems and exits.
 *
 * Legend
 *   #  rock                 .  empty
 *   A-D pool of a slot       a-d colour gate (solid except for that slot)
 *   E-H exit door of a slot (bottom cell; the cell above must be empty)
 *   e-h gem of a slot        S  spawn          K  checkpoint flag
 *   o  box (1×1)             O  heavy box (2×2, top-left cell; the other three cells are '.')
 *   u v w  pressure plate on channel 1 2 3     U V W  door cell on channel 1 2 3
 *   j k l  lever on channel 1 2 3
 * Lifts are listed apart: a platform `w` tiles wide at column `x`, its top at `yDown` while its
 * channel is off and `yUp` while it is on.
 */

export const COLS = 32;
export const ROWS = 18;

export type Slot = 0 | 1 | 2 | 3;

export const Cell = { Empty: 0, Rock: 1, Pool: 2, Gate: 3, Door: 4 } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

export interface Plate {
  x: number;
  y: number;
  ch: number;
}

export interface Lever {
  x: number;
  y: number;
  ch: number;
}

export interface LiftDef {
  ch: number;
  x: number;
  w: number;
  yDown: number;
  yUp: number;
}

export interface Placed {
  x: number;
  y: number;
  slot: Slot;
}

export interface LevelDef {
  id: string;
  /** Seconds for the time star. */
  par: number;
  rows: readonly string[];
  lifts?: readonly LiftDef[];
}

export interface Level {
  id: string;
  index: number;
  par: number;
  /** Cell kinds, row-major (`y * COLS + x`). */
  cells: Uint8Array;
  /** Slot of pool and gate cells, channel of door cells (row-major, 0 elsewhere). */
  meta: Uint8Array;
  spawns: { x: number; y: number }[];
  exits: Placed[];
  gems: Placed[];
  checkpoints: { x: number; y: number }[];
  boxes: { x: number; y: number; heavy: boolean }[];
  plates: Plate[];
  levers: Lever[];
  lifts: LiftDef[];
  /** Channels used by any trigger. */
  channels: number[];
}

const DEFS: readonly LevelDef[] = [
  {
    id: 'kolam',
    par: 60,
    rows: [
      '################################',
      '#..............................#',
      '#..............e...............#',
      '#.............................E#',
      '#...#########AAAAA##############',
      '#..............................#',
      '###..................f.........#',
      '#.............................F#',
      '#...###############BBBBB########',
      '#..............................#',
      '###.............g..............#',
      '#.............................G#',
      '#...##########CCCCC#############',
      '#..............................#',
      '###..............h.............#',
      '#..SSSSSSSS...................H#',
      '###############DDDDD############',
      '################################',
    ],
  },
  {
    id: 'injak',
    par: 90,
    rows: [
      '################################',
      '#.....................U........#',
      '#.....................U........#',
      '#.....................U........#',
      '#.....................U........#',
      '#.....................U........#',
      '#.....................U........#',
      '#.....................U........#',
      '#.....................U........#',
      '#.....................U........#',
      '#.....................U........#',
      '#######.........gefh..U.....####',
      '#.....b...............U.....a..#',
      '#.....b.........####..U.....a..#',
      '#.....b.........####..U.....a..#',
      '#.u...bSSSSSSSS.####..U.EFGHa.u#',
      '################################',
      '################################',
    ],
  },
  {
    id: 'kotak',
    par: 120,
    rows: [
      '################################',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#...........g......e........f..#',
      '#.............................j#',
      '#.......................#BBBBB##',
      '#....................#..U......#',
      '#....................#..U..h...#',
      '#........O...........#..U......#',
      '#SSSSSSSS............#.KU.EFGH.#',
      '################################',
      '################################',
    ],
  },
  {
    id: 'lift',
    par: 120,
    lifts: [{ ch: 1, x: 12, w: 3, yDown: 16, yUp: 4 }],
    rows: [
      '################################',
      '#..............................#',
      '#............................g.#',
      '#...............j.K...EFGH.....#',
      '#..............#################',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#.f..........e.................#',
      '######BBBBB#...................#',
      '######.........................#',
      '#....a.........................#',
      '#....a.........................#',
      '#....a..................h......#',
      '#.u..aSSSSSS...SS..............#',
      '############...#####DDDDDDD#####',
      '################################',
    ],
  },
  {
    id: 'menara',
    par: 150,
    lifts: [
      { ch: 1, x: 9, w: 3, yDown: 16, yUp: 13 },
      { ch: 2, x: 17, w: 3, yDown: 13, yUp: 10 },
    ],
    rows: [
      '################################',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#............................g.#',
      '#..............................#',
      '#..............f...............#',
      '#.........................EFGH.#',
      '#...................##bb########',
      '#....e..............##v.########',
      '#............K......############',
      '#.h.........###aa...############',
      '#...........###.j###############',
      '#SSSSSSSS...####################',
      '#########...####################',
      '################################',
    ],
  },
  {
    id: 'besar',
    par: 180,
    lifts: [{ ch: 2, x: 18, w: 3, yDown: 16, yUp: 8 }],
    rows: [
      '################################',
      '#..............................#',
      '#..............................#',
      '#.....................e....g...#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#.....................k.KEFGH..#',
      '#....................###########',
      '#....................###########',
      '#....................###########',
      '###########..........###########',
      '#.h.......Uk.f.......###########',
      '#.........U#BBBBB#...###########',
      '#.....O...U..........###########',
      '#SSuSS..SSU..........###########',
      '##################...###########',
      '################################',
    ],
  },
];

const SLOT_OF: Record<string, Slot> = { A: 0, B: 1, C: 2, D: 3 };

function slotOf(ch: string, base: string): Slot {
  return (ch.charCodeAt(0) - base.charCodeAt(0)) as Slot;
}

/** Parses one stage. Throws on a malformed map (caught by the tests, never at runtime). */
export function parseLevel(def: LevelDef, index: number): Level {
  if (def.rows.length !== ROWS) throw new Error(`${def.id}: ${def.rows.length} rows`);
  const cells = new Uint8Array(COLS * ROWS);
  const meta = new Uint8Array(COLS * ROWS);
  const level: Level = {
    id: def.id,
    index,
    par: def.par,
    cells,
    meta,
    spawns: [],
    exits: [],
    gems: [],
    checkpoints: [],
    boxes: [],
    plates: [],
    levers: [],
    lifts: [...(def.lifts ?? [])],
    channels: [],
  };
  const channels = new Set<number>();
  def.rows.forEach((row, y) => {
    if (row.length !== COLS) throw new Error(`${def.id}: row ${y} has ${row.length} cols`);
    for (let x = 0; x < COLS; x++) {
      const ch = row[x]!;
      const i = y * COLS + x;
      if (ch === '#') cells[i] = Cell.Rock;
      else if (ch in SLOT_OF) {
        cells[i] = Cell.Pool;
        meta[i] = SLOT_OF[ch]!;
      } else if (ch >= 'a' && ch <= 'd') {
        cells[i] = Cell.Gate;
        meta[i] = slotOf(ch, 'a');
      } else if (ch >= 'E' && ch <= 'H') level.exits.push({ x, y, slot: slotOf(ch, 'E') });
      else if (ch >= 'e' && ch <= 'h') level.gems.push({ x, y, slot: slotOf(ch, 'e') });
      else if (ch === 'S') level.spawns.push({ x, y });
      else if (ch === 'K') level.checkpoints.push({ x, y });
      else if (ch === 'o') level.boxes.push({ x, y, heavy: false });
      else if (ch === 'O') level.boxes.push({ x, y, heavy: true });
      else if (ch >= 'u' && ch <= 'w') {
        const c = ch.charCodeAt(0) - 'u'.charCodeAt(0) + 1;
        level.plates.push({ x, y, ch: c });
        channels.add(c);
      } else if (ch >= 'U' && ch <= 'W') {
        cells[i] = Cell.Door;
        meta[i] = ch.charCodeAt(0) - 'U'.charCodeAt(0) + 1;
      } else if (ch >= 'j' && ch <= 'l') {
        const c = ch.charCodeAt(0) - 'j'.charCodeAt(0) + 1;
        level.levers.push({ x, y, ch: c });
        channels.add(c);
      } else if (ch !== '.') throw new Error(`${def.id}: unknown '${ch}' at ${x},${y}`);
    }
  });
  level.channels = [...channels].sort((a, b) => a - b);
  return level;
}

export const LEVELS: readonly Level[] = DEFS.map((d, i) => parseLevel(d, i));
export const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);

export function levelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** Number of colours for this many characters: 2 to 4. */
export function colorCount(characters: number): number {
  return Math.max(2, Math.min(4, characters));
}

/** The colour a map slot is played as with `k` colours. */
export function foldSlot(slot: number, k: number): Slot {
  return (slot % Math.max(1, k)) as Slot;
}

export function cellAt(level: Level, x: number, y: number): Cell {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return Cell.Rock;
  return level.cells[y * COLS + x] as Cell;
}

export function metaAt(level: Level, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return 0;
  return level.meta[y * COLS + x]!;
}
