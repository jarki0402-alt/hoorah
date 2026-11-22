/**
 * Hantu Tak Terlihat maps: 32×18 top-down floor plans written as text, parsed once (pure).
 *
 * Legend
 *   #  wall            .  floor           o  furniture (blocks walking, not light or the ghost)
 *   T  tree (blocks walking and light; the ghost floats through)
 *   r  rug or rice field (floor, drawn differently)
 *   D  door (open; the ghost can slam it shut for a few seconds)
 *   X  exit (locked until 3 keys are found and the fuse is on)
 *   K  possible key spot (3 are picked each round)       F  fuse box (solid)
 *   L  ceiling lamp (floor)    S  resident start    G  ghost start
 */

export const COLS = 32;
export const ROWS = 18;

export const Tile = { Floor: 0, Wall: 1, Prop: 2, Door: 3, Exit: 4, Fuse: 5, Tree: 6, Rug: 7 } as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export type MapId = 'rumah' | 'kampung';
export const MAP_IDS: readonly MapId[] = ['rumah', 'kampung'];

export interface Pt {
  x: number;
  y: number;
}

export interface Label extends Pt {
  text: string;
}

export interface HauntMap {
  id: MapId;
  tiles: Uint8Array;
  doors: Pt[];
  exits: Pt[];
  keySpots: Pt[];
  fuse: Pt;
  lamps: Pt[];
  spawns: Pt[];
  ghost: Pt;
  labels: Label[];
}

interface MapDef {
  id: MapId;
  rows: readonly string[];
  labels: Label[];
}

const DEFS: readonly MapDef[] = [
  {
    id: 'rumah',
    rows: [
      '################################',
      '#oo.....o#o........o#....oooo..#',
      '#o...K...#..........#.........K#',
      '#........#...oooo...D..........#',
      '#...L....D...oooo...#....L.....#',
      '#........#....L.....#.o......oo#',
      '#oo....K.#K.........#.o...G....#',
      '#####DD#######DD#########DD#####',
      '#..............................#',
      '#.......L..............L.......#',
      '####DD######..########DD########',
      '#oo.......K....#o.............o#',
      '#..............#....ooo.......F#',
      '#...ooo..L.....D....ooo...L....#',
      '#..............#...........K...#',
      '#o..SSSSSSSS...#oo...........oo#',
      '#..............#K..............#',
      '######XX########################',
    ],
    labels: [
      { x: 4.5, y: 3.2, text: 'KAMAR' },
      { x: 15, y: 1.8, text: 'RUANG MAKAN' },
      { x: 25.5, y: 3.2, text: 'DAPUR' },
      { x: 15.5, y: 8.6, text: 'LORONG' },
      { x: 7.5, y: 12.3, text: 'RUANG TAMU' },
      { x: 23, y: 15.6, text: 'GUDANG' },
    ],
  },
  {
    id: 'kampung',
    rows: [
      '##############XX################',
      '#T....T.......................T#',
      '#..#####.......T.....#######...#',
      '#..#...D.............#.....#.G.#',
      '#..#.K.#....rrrrr....#..K..#.T.#',
      '#..#####....rrrrr....###D###...#',
      '#T..........rrKrr..............#',
      '#......T....rrrrr.....T........#',
      '#...L.........L..........L.....#',
      '#.####D####........o.......T...#',
      '#.#.......#...........########.#',
      '#.#o....K.#.....T.....#......#.#',
      '#.#...L...D...........D..L..K#.#',
      '#.#oo.....#...F.......#oo....#.#',
      '#.#########...........########.#',
      '#T.........SSSSSSS............T#',
      '#.....K..................T.....#',
      '################################',
    ],
    labels: [
      { x: 15, y: 1.2, text: 'GERBANG' },
      { x: 5, y: 1.6, text: 'RUMAH KOSONG' },
      { x: 24.5, y: 1.6, text: 'RUMAH PAK RT' },
      { x: 14.5, y: 3.6, text: 'SAWAH' },
      { x: 6, y: 15.4, text: 'LUMBUNG' },
      { x: 26, y: 15.4, text: 'WARUNG' },
      { x: 14.5, y: 12.3, text: 'GARDU' },
    ],
  },
];

const TILE_OF: Record<string, Tile> = {
  '#': Tile.Wall,
  o: Tile.Prop,
  T: Tile.Tree,
  r: Tile.Rug,
  D: Tile.Door,
  X: Tile.Exit,
  F: Tile.Fuse,
};

export function parseMap(def: MapDef): HauntMap {
  if (def.rows.length !== ROWS) throw new Error(`${def.id}: ${def.rows.length} rows`);
  const tiles = new Uint8Array(COLS * ROWS);
  const m: HauntMap = {
    id: def.id,
    tiles,
    doors: [],
    exits: [],
    keySpots: [],
    fuse: { x: 0, y: 0 },
    lamps: [],
    spawns: [],
    ghost: { x: 1, y: 1 },
    labels: def.labels,
  };
  let fuses = 0;
  def.rows.forEach((row, y) => {
    if (row.length !== COLS) throw new Error(`${def.id}: row ${y} has ${row.length} cols`);
    for (let x = 0; x < COLS; x++) {
      const ch = row[x]!;
      const t = TILE_OF[ch];
      if (t !== undefined) tiles[y * COLS + x] = t;
      if (ch === 'D') m.doors.push({ x, y });
      else if (ch === 'X') m.exits.push({ x, y });
      else if (ch === 'F') {
        m.fuse = { x, y };
        fuses++;
      } else if (ch === 'K') m.keySpots.push({ x, y });
      else if (ch === 'L') m.lamps.push({ x, y });
      else if (ch === 'S') m.spawns.push({ x, y });
      else if (ch === 'G') m.ghost = { x, y };
      else if (t === undefined && ch !== '.') throw new Error(`${def.id}: unknown '${ch}' at ${x},${y}`);
    }
  });
  if (fuses !== 1) throw new Error(`${def.id}: needs one fuse`);
  return m;
}

export const MAPS: Record<MapId, HauntMap> = {
  rumah: parseMap(DEFS[0]!),
  kampung: parseMap(DEFS[1]!),
};

export function tileAt(m: HauntMap, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return Tile.Wall;
  return m.tiles[y * COLS + x] as Tile;
}

/** Three key spots far apart: a random first one, then each next the farthest from those chosen. */
export function pickKeys(m: HauntMap, rnd: () => number, count = 3): Pt[] {
  const spots = [...m.keySpots];
  if (spots.length <= count) return spots;
  const out: Pt[] = [spots.splice(Math.floor(rnd() * spots.length), 1)[0]!];
  while (out.length < count && spots.length) {
    let best = 0;
    let bestD = -1;
    spots.forEach((s, i) => {
      // A little noise so the same map does not always give the same three.
      const d = Math.min(...out.map((o) => Math.hypot(o.x - s.x, o.y - s.y))) + rnd() * 3;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    });
    out.push(spots.splice(best, 1)[0]!);
  }
  return out;
}
