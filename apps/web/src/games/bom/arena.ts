/**
 * Bom Oper arenas: a flat yard fenced on all sides with a few obstacles to run round, in three
 * worlds the Host picks from: Halaman Rumah (trees, a well, a bench), Pasar Kaget (stalls and
 * crates in rows) and Atap Gedung (water tanks, air-con units, a skylight). Pure data.
 */
import { v3 } from '../../shared/kotak/math';
import type { SolidDef } from '../../shared/kotak/solids';

export type ArenaId = 'halaman' | 'pasar' | 'atap';
export const ARENAS: readonly ArenaId[] = ['halaman', 'pasar', 'atap'];

export function isArenaId(v: unknown): v is ArenaId {
  return typeof v === 'string' && (ARENAS as readonly string[]).includes(v);
}

/** Renderer looks (palette per arena in scene.ts). */
export type ArenaLook =
  | 'floor'
  | 'fence'
  | 'tree'
  | 'well'
  | 'bench'
  | 'pot'
  | 'stall'
  | 'crate'
  | 'tank'
  | 'ac'
  | 'skylight'
  | 'vent';

export interface Arena {
  id: ArenaId;
  /** Half size of the playing floor (x, z). */
  hx: number;
  hz: number;
  solids: SolidDef[];
  /** Start spots, spread round the yard. */
  spawns: { x: number; z: number }[];
}

const HX = 12.5;
const HZ = 7.5;

function base(): SolidDef[] {
  const s: SolidDef[] = [];
  s.push({ pos: v3(0, -0.5, 0), half: v3(HX + 1, 0.5, HZ + 1), look: 'floor', role: 'floor' });
  const h = 0.6;
  const t = 0.3;
  s.push({ pos: v3(0, h, -HZ - t), half: v3(HX + 2 * t, h, t), look: 'fence', role: 'wall' });
  s.push({ pos: v3(0, h, HZ + t), half: v3(HX + 2 * t, h, t), look: 'fence', role: 'wall' });
  s.push({ pos: v3(-HX - t, h, 0), half: v3(t, h, HZ), look: 'fence', role: 'wall' });
  s.push({ pos: v3(HX + t, h, 0), half: v3(t, h, HZ), look: 'fence', role: 'wall' });
  return s;
}

/** An obstacle standing on the floor: centre (x, z), half size, height. */
function prop(look: ArenaLook, x: number, z: number, hx: number, hz: number, h: number, yaw = 0): SolidDef {
  return { pos: v3(x, h / 2, z), half: v3(hx, h / 2, hz), look, role: 'wall', yaw };
}

function halaman(): SolidDef[] {
  return [
    prop('tree', -7, -3.2, 0.5, 0.5, 2.6),
    prop('tree', 7.5, 3.4, 0.5, 0.5, 2.6),
    prop('tree', 4.5, -4.2, 0.5, 0.5, 2.6),
    prop('well', -2.5, 3, 1, 1, 1),
    prop('bench', 1.5, -0.6, 1.4, 0.45, 0.7, 0.3),
    prop('pot', -9.5, 4.5, 0.45, 0.45, 0.8),
    prop('pot', 10, -5, 0.45, 0.45, 0.8),
  ];
}

function pasar(): SolidDef[] {
  return [
    prop('stall', -6.5, -3.5, 1.7, 0.9, 1.1),
    prop('stall', 0, -3.5, 1.7, 0.9, 1.1),
    prop('stall', 6.5, -3.5, 1.7, 0.9, 1.1),
    prop('stall', -3.2, 3.4, 1.7, 0.9, 1.1),
    prop('stall', 3.2, 3.4, 1.7, 0.9, 1.1),
    prop('crate', -10, 0.4, 0.55, 0.55, 1.1),
    prop('crate', 10, 0.2, 0.55, 0.55, 1.1, 0.4),
    prop('crate', 0, 0.6, 0.5, 0.5, 0.9, 0.7),
  ];
}

function atap(): SolidDef[] {
  return [
    prop('tank', -6, 2.6, 1.2, 1.2, 2.2),
    prop('tank', 7.5, -3, 1.2, 1.2, 2.2),
    prop('ac', 1.5, 3.8, 0.9, 0.6, 0.9),
    prop('ac', -9.5, -4.6, 0.9, 0.6, 0.9),
    prop('skylight', 0, -1.6, 2.2, 1.2, 0.5),
    prop('vent', 9.5, 4, 0.5, 0.5, 1.3),
    prop('vent', -2.5, -5.2, 0.5, 0.5, 1.3),
  ];
}

const SPAWNS: { x: number; z: number }[] = [
  { x: -8.5, z: 0 },
  { x: 8.5, z: -1 },
  { x: -4, z: -5.8 },
  { x: 4, z: 5.8 },
  { x: -4.5, z: 6 },
  { x: 4.5, z: -6 },
  { x: -10.5, z: -6 },
  { x: 10.5, z: 6 },
];

export function buildArena(id: ArenaId): Arena {
  const props = id === 'halaman' ? halaman() : id === 'pasar' ? pasar() : atap();
  return { id, hx: HX, hz: HZ, solids: [...base(), ...props], spawns: SPAWNS };
}
