/**
 * The static cooking-show set: back wall with subway tiles, window with daylight, shelves with
 * jars, hanging utensils, a back counter with a rice cooker and a kerupuk tin, the orange island
 * with its butcher-block top, and the cookware that never moves (board, cobek, wok, pan, plate,
 * grill, loyang). Static pieces are baked into a few vertex-coloured meshes.
 */
import * as THREE from 'three';
import type { DishId } from '../recipes';
import { type Blob, blobShadows } from './blobs';
import { Batch, basic, lathe, PAL, rand, rbox, shell, vcToon } from './kit';
import { bakeToonLight } from './light';
import { BACK_COUNTER_Z, FLOOR_Y, ISLAND, ON_STOVE, SPOT, STOVE, WALL_Z } from './spots';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);

/* ------------------------------------------------------------------ cookware (also used by rigs) */

export function addBoard(b: Batch, x: number, z: number): void {
  b.add(rbox(0.46, 0.03, 0.31, 0.012), PAL.wood3, { p: [x, 0.015, z] });
  // End grain stripes + juice groove.
  for (let i = 0; i < 6; i++) {
    b.add(box(0.43, 0.002, 0.004), PAL.wood2, { p: [x, 0.0305, z - 0.12 + i * 0.048] });
  }
  b.add(cyl(0.012, 0.012, 0.031, 16), PAL.woodDark, { p: [x + 0.19, 0.015, z - 0.11] });
}

export function addWok(b: Batch, x: number, y: number, z: number, yaw = 1.9): void {
  const w = new Batch();
  const prof: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2) * 0.92;
    prof.push([Math.sin(a) * 0.2, (1 - Math.cos(a)) * 0.16]);
  }
  w.add(shell(prof, 0.006, 40), PAL.iron);
  // Long wooden handle (+X before the yaw) and the small loop handle opposite.
  w.add(cyl(0.008, 0.008, 0.06, 10), PAL.iron2, { p: [0.215, 0.11, 0], r: [0, 0, Math.PI / 2 + 0.25] });
  w.add(rbox(0.2, 0.026, 0.03, 0.012), PAL.woodDark, { p: [0.33, 0.14, 0], r: [0, 0, 0.25] });
  w.add(new THREE.TorusGeometry(0.022, 0.005, 6, 16, Math.PI), PAL.iron2, {
    p: [-0.205, 0.125, 0],
    r: [Math.PI / 2, 0, Math.PI / 2],
  });
  b.addBaked(w.geometry(), { p: [x, y, z], r: [0, yaw, 0] });
}

export function addPan(b: Batch, x: number, y: number, z: number): void {
  b.add(
    shell(
      [
        [0.0005, 0],
        [0.1, 0],
        [0.115, 0.012],
        [0.128, 0.04],
      ],
      0.006,
      36,
    ),
    PAL.iron2,
    { p: [x, y, z] },
  );
  b.add(cyl(0.1, 0.1, 0.002, 36), 0x24262a, { p: [x, y + 0.005, z] });
  b.add(rbox(0.17, 0.018, 0.028, 0.009), PAL.ink, { p: [x + 0.2, y + 0.05, z + 0.06], r: [0, -0.5, 0.18] });
}

export function addPlate(b: Batch, x: number, z: number, rim: number = PAL.plateRim): void {
  b.add(
    lathe(
      [
        [0.0005, 0.002],
        [0.09, 0.002],
        [0.1, 0.008],
        [0.135, 0.02],
        [0.14, 0.024],
        [0.137, 0.026],
        [0.1, 0.014],
        [0.0005, 0.011],
      ],
      44,
    ),
    PAL.white,
    { p: [x, 0, z] },
  );
  b.add(new THREE.TorusGeometry(0.128, 0.0028, 4, 48), rim, { p: [x, 0.0225, z], r: [Math.PI / 2, 0, 0] });
}

export function addCobek(b: Batch, x: number, z: number, k = 1): void {
  // Volcanic stone: a wide, shallow dish with a thick rounded rim and three stubby feet.
  b.add(
    shell(
      [
        [0.0005, 0.008],
        [0.075, 0.008],
        [0.108, 0.02],
        [0.128, 0.042],
        [0.13, 0.05],
      ],
      0.02,
      36,
    ),
    0x6e655e,
    { p: [x, 0, z], s: k },
  );
  b.add(new THREE.TorusGeometry(0.121, 0.011, 8, 40), 0x7b716a, {
    p: [x, 0.05 * k, z],
    r: [Math.PI / 2, 0, 0],
    s: k,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.add(sph(0.018 * k, 8, 6), 0x5f5751, {
      p: [x + Math.cos(a) * 0.06 * k, 0.006, z + Math.sin(a) * 0.06 * k],
      s: [1, 0.5, 1],
    });
  }
}

export function addBowl(b: Batch, x: number, z: number): void {
  b.add(
    shell(
      [
        [0.0005, 0],
        [0.07, 0],
        [0.12, 0.03],
        [0.145, 0.075],
      ],
      0.005,
      40,
    ),
    0xfffaf0,
    { p: [x, 0, z] },
  );
  // Mint enamel inside, so white flour and pale batter stand out.
  b.add(
    lathe(
      [
        [0.0005, 0.0034],
        [0.0638, 0.0034],
        [0.1138, 0.0334],
        [0.1388, 0.0774],
      ],
      40,
    ),
    0xd5eee2,
    { p: [x, 0, z] },
  );
  b.add(new THREE.TorusGeometry(0.143, 0.006, 6, 48), PAL.green, {
    p: [x, 0.076, z],
    r: [Math.PI / 2, 0, 0],
  });
}

export function addTray(b: Batch, x: number, z: number): void {
  b.add(rbox(0.4, 0.014, 0.28, 0.007), 0xfff3e0, { p: [x, 0.007, z] });
  for (const [dx, dz, w, d] of [
    [0, -0.137, 0.4, 0.008],
    [0, 0.137, 0.4, 0.008],
    [-0.197, 0, 0.008, 0.28],
    [0.197, 0, 0.008, 0.28],
  ] as const) {
    b.add(rbox(w, 0.028, d, 0.003), PAL.green, { p: [x + dx, 0.014, z + dz] });
  }
  // A banana leaf liner.
  b.add(rbox(0.34, 0.003, 0.22, 0.0015), PAL.leaf, { p: [x, 0.0155, z], r: [0, 0.04, 0] });
  for (let i = 0; i < 7; i++) {
    b.add(box(0.003, 0.0012, 0.2), PAL.leafDark, { p: [x - 0.15 + i * 0.05, 0.0175, z], r: [0, 0.6, 0] });
  }
}

export function addLoyang(b: Batch, x: number, y: number, z: number): void {
  b.add(
    shell(
      [
        [0.0005, 0],
        [0.135, 0],
        [0.14, 0.004],
        [0.142, 0.046],
      ],
      0.009,
      44,
    ),
    PAL.iron,
    { p: [x, y, z] },
  );
  for (const s of [-1, 1]) {
    b.add(rbox(0.05, 0.016, 0.03, 0.006), PAL.iron2, { p: [x + s * 0.17, y + 0.038, z] });
  }
}

export function addStove(b: Batch): void {
  const { x0, x1, z, top } = STOVE;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  b.add(rbox(w, top, 0.42, 0.02), 0x3a3d43, { p: [cx, top / 2, z] });
  b.add(rbox(w - 0.03, 0.006, 0.39, 0.003), 0x24262a, { p: [cx, top, z] });
  // Front panel with orange knobs.
  b.add(rbox(w - 0.02, 0.05, 0.01, 0.004), 0xd7dadf, { p: [cx, top / 2, z + 0.212] });
  for (const kx of [STOVE.left, STOVE.right]) {
    b.add(cyl(0.022, 0.024, 0.02, 20), PAL.orange, { p: [kx, top / 2, z + 0.225], r: [Math.PI / 2, 0, 0] });
    b.add(box(0.006, 0.03, 0.006), PAL.cream, { p: [kx, top / 2, z + 0.236] });
    // Burner cap + crown.
    b.add(cyl(0.05, 0.056, 0.012, 24), 0x55595f, { p: [kx, top + 0.006, z] });
    b.add(cyl(0.032, 0.034, 0.012, 20), 0x1c1d20, { p: [kx, top + 0.015, z] });
    // Pan supports.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      b.add(box(0.07, 0.012, 0.01), 0x1c1d20, {
        p: [kx + Math.cos(a) * 0.1, top + 0.02, z + Math.sin(a) * 0.1],
        r: [0, -a, 0],
      });
    }
  }
}

export function addGrill(b: Batch, x: number, z: number): void {
  const L = 0.56;
  // Trough on short legs.
  b.add(rbox(L, 0.075, 0.2, 0.008), 0x3f434a, { p: [x, 0.065, z] });
  b.add(rbox(L - 0.03, 0.01, 0.17, 0.004), 0x1d1e21, { p: [x, 0.1, z] });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.add(cyl(0.01, 0.012, 0.03, 8), 0x2b2d31, { p: [x + sx * 0.25, 0.015, z + sz * 0.08] });
  // Rim the skewers rest on.
  for (const sz of [-1, 1]) b.add(box(L, 0.012, 0.012), 0x9aa3ab, { p: [x, 0.108, z + sz * 0.098] });
  // Grate wires.
  for (let i = 0; i < 12; i++)
    b.add(cyl(0.0018, 0.0018, 0.19, 5), 0xb7bfc6, {
      p: [x - 0.25 + i * 0.045, 0.112, z],
      r: [Math.PI / 2, 0, 0],
    });
}

/* ------------------------------------------------------------------ the room */

function addRoom(b: Batch, glow: Batch): void {
  // Floor: terracotta tiles.
  const T = 0.42;
  for (let ix = -9; ix < 9; ix++) {
    for (let iz = -4; iz < 7; iz++) {
      const c = (ix + iz) & 1 ? PAL.floor : PAL.floor2;
      b.add(box(T - 0.008, 0.02, T - 0.008), c, { p: [ix * T + T / 2, FLOOR_Y - 0.01, iz * T + T / 2] });
    }
  }
  // Back wall: cream paint with a soft darker band at the top, grout behind the tiles.
  b.addShaded(box(8.4, 3.8, 0.04), (_x, y) => (y > 1.95 ? PAL.wallShade : PAL.wall), {
    p: [0, 1.0, WALL_Z - 0.02],
  });
  b.add(box(8.4, 0.46, 0.006), PAL.grout, { p: [0, 0.22, WALL_Z + 0.003] });
  const tw = 0.15;
  const th = 0.075;
  for (let row = 0; row < 6; row++) {
    const off = row & 1 ? tw / 2 : 0;
    for (let i = -28; i < 28; i++) {
      const k = row * 97 + i;
      const r = rand(k + 5);
      const c = r < 0.18 ? PAL.tile2 : r < 0.3 ? PAL.tile3 : PAL.tile;
      b.add(box(tw - 0.007, th - 0.007, 0.012), c, {
        p: [i * tw + off, 0.0 + th / 2 + row * th + 0.004, WALL_Z + 0.009],
      });
    }
  }
  // Trim above the tiles.
  b.add(rbox(8.4, 0.03, 0.03, 0.008), PAL.trim, { p: [0, 0.465, WALL_Z + 0.015] });

  // Back counter: wooden top on cream cabinets.
  b.add(box(8.4, 0.9, 0.56), 0xf3dcc0, { p: [0, FLOOR_Y + 0.45 - 0.04, (WALL_Z + BACK_COUNTER_Z) / 2] });
  b.add(rbox(8.4, 0.05, 0.6, 0.012), PAL.wood, { p: [0, -0.025, (WALL_Z + BACK_COUNTER_Z) / 2 + 0.02] });

  // Window with café curtain.
  const wx = 1.05;
  const wy = 1.38;
  const ww = 1.02;
  const wh = 0.86;
  const frame = 0xfff1de;
  b.add(rbox(ww + 0.1, 0.06, 0.05, 0.01), frame, { p: [wx, wy + wh / 2 + 0.03, WALL_Z + 0.025] });
  b.add(rbox(ww + 0.18, 0.045, 0.12, 0.01), PAL.trim, { p: [wx, wy - wh / 2 - 0.02, WALL_Z + 0.06] });
  for (const s of [-1, 1])
    b.add(rbox(0.06, wh + 0.1, 0.05, 0.01), frame, { p: [wx + (s * (ww + 0.04)) / 2, wy, WALL_Z + 0.025] });
  b.add(box(0.035, wh, 0.03), frame, { p: [wx, wy, WALL_Z + 0.03] });
  b.add(box(ww, 0.035, 0.03), frame, { p: [wx, wy + 0.05, WALL_Z + 0.03] });
  // Daylight through the glass (unlit): sky gradient, sun, a tree and a neighbour's roof.
  glow.addShaded(
    new THREE.PlaneGeometry(ww, wh, 1, 8),
    (_x, y) => (y > wy + 0.2 ? 0xa9dcff : y > wy - 0.1 ? 0xc9eaff : 0xe6f6ff),
    {
      p: [wx, wy, WALL_Z + 0.012],
    },
  );
  glow.add(new THREE.CircleGeometry(0.075, 24), 0xfff3c4, { p: [wx + 0.3, wy + 0.24, WALL_Z + 0.014] });
  for (let i = 0; i < 9; i++) {
    const a = i / 9;
    glow.add(new THREE.CircleGeometry(0.09 + rand(i + 2) * 0.05, 16), i % 2 ? 0x6cc36d : 0x5bb35f, {
      p: [wx - 0.45 + a * 0.5, wy - 0.33 + rand(i + 7) * 0.12, WALL_Z + 0.015 + i * 0.0003],
    });
  }
  glow.add(new THREE.PlaneGeometry(0.42, 0.12), 0xe0814f, {
    p: [wx + 0.3, wy - 0.38, WALL_Z + 0.016],
    r: [0, 0, 0],
  });
  glow.add(new THREE.PlaneGeometry(0.46, 0.035), 0xc8653a, { p: [wx + 0.3, wy - 0.31, WALL_Z + 0.017] });
  // Curtain valance: scallops.
  b.add(box(ww + 0.12, 0.012, 0.012), PAL.woodDark, { p: [wx, wy + wh / 2 - 0.02, WALL_Z + 0.07] });
  for (let i = 0; i < 9; i++) {
    const x = wx - ww / 2 + (i + 0.5) * (ww / 9);
    b.add(cyl(0.058, 0.058, 0.02, 14), i % 2 ? PAL.yellow : 0xfff0c2, {
      p: [x, wy + wh / 2 - 0.08, WALL_Z + 0.075],
      r: [Math.PI / 2, 0, 0],
      s: [1, 1, 1.6],
    });
  }
  b.add(box(ww + 0.06, 0.11, 0.018), 0xfff0c2, { p: [wx, wy + wh / 2 - 0.03, WALL_Z + 0.072] });
  // Herb pot on the sill.
  addPot(b, wx - 0.3, wy - wh / 2 + 0.0, WALL_Z + 0.07, 0.05);
  addPot(b, wx + 0.36, wy - wh / 2 + 0.0, WALL_Z + 0.07, 0.04);

  // Shelves on the right with jars.
  const sx = 2.2;
  for (const sy of [1.08, 1.48]) {
    b.add(rbox(0.95, 0.03, 0.2, 0.008), PAL.wood, { p: [sx, sy, WALL_Z + 0.1] });
    for (const bx of [-0.38, 0.38])
      b.add(box(0.02, 0.09, 0.14), PAL.woodDark, { p: [sx + bx, sy - 0.06, WALL_Z + 0.07] });
  }
  const jarColors = [0xe0261b, 0xf2a10c, 0xfff1d6, 0x6a3b1f, 0x35a853, 0xffd23f, 0xd0451b];
  for (let i = 0; i < 7; i++) {
    const h = 0.1 + rand(i + 31) * 0.07;
    const jx = sx - 0.36 + i * 0.12;
    addJar(b, jx, 1.095, WALL_Z + 0.1, h, jarColors[i]!);
  }
  // Upper shelf: stacked plates, a teapot and a kerupuk jar.
  for (let i = 0; i < 4; i++)
    b.add(cyl(0.075, 0.07, 0.012, 24), i % 2 ? PAL.white : 0xfff3e0, {
      p: [sx - 0.28, 1.503 + i * 0.013, WALL_Z + 0.1],
    });
  b.add(sph(0.07, 20, 14), PAL.orange, { p: [sx + 0.02, 1.555, WALL_Z + 0.1], s: [1, 0.85, 1] });
  b.add(cyl(0.012, 0.018, 0.08, 8), PAL.orange, { p: [sx + 0.1, 1.57, WALL_Z + 0.1], r: [0, 0, -0.9] });
  b.add(sph(0.02, 10, 8), PAL.yellow, { p: [sx + 0.02, 1.62, WALL_Z + 0.1] });
  addJar(b, sx + 0.27, 1.495, WALL_Z + 0.1, 0.16, 0xffe8b0);

  // Utensil rail on the left: sutil, centong, irus, serok, parutan.
  const rx = 2.25;
  const ry = 0.6;
  b.add(cyl(0.008, 0.008, 0.9, 10), PAL.steel, { p: [rx, ry, WALL_Z + 0.06], r: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1])
    b.add(cyl(0.012, 0.012, 0.06, 8), PAL.steelDark, {
      p: [rx + s * 0.44, ry, WALL_Z + 0.03],
      r: [Math.PI / 2, 0, 0],
    });
  const tools: [number, 'turner' | 'paddle' | 'ladle' | 'skimmer' | 'grater'][] = [
    [-0.33, 'turner'],
    [-0.17, 'ladle'],
    [0.0, 'paddle'],
    [0.16, 'skimmer'],
    [0.32, 'grater'],
  ];
  for (const [dx, kind] of tools) addHangingTool(b, rx + dx, ry, WALL_Z + 0.07, kind);

  // Back counter props.
  addRiceCooker(b, -1.35, BACK_COUNTER_Z - 0.3);
  addKerupukTin(b, -0.66, BACK_COUNTER_Z - 0.32);
  addBottles(b, 2.75, BACK_COUNTER_Z - 0.28);
  addPotOnCounter(b, -2.2, BACK_COUNTER_Z - 0.3);
  // A wall clock above the window.
  b.add(cyl(0.11, 0.11, 0.025, 32), PAL.orange, { p: [wx, 2.02, WALL_Z + 0.02], r: [Math.PI / 2, 0, 0] });
  b.add(cyl(0.092, 0.092, 0.01, 32), PAL.cream, { p: [wx, 2.02, WALL_Z + 0.036], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add(box(0.006, 0.014, 0.004), PAL.ink, {
      p: [wx + Math.sin(a) * 0.075, 2.02 + Math.cos(a) * 0.075, WALL_Z + 0.042],
      r: [0, 0, -a],
    });
  }
  b.add(box(0.007, 0.05, 0.004), PAL.ink, { p: [wx + 0.012, 2.04, WALL_Z + 0.045], r: [0, 0, -0.5] });
  b.add(box(0.006, 0.068, 0.004), PAL.ink, { p: [wx - 0.024, 2.01, WALL_Z + 0.046], r: [0, 0, 2.2] });

  // The island: butcher-block top on an orange cabinet, yellow knobs, a striped towel.
  const iw = ISLAND.x1 - ISLAND.x0;
  const idp = ISLAND.z1 - ISLAND.z0;
  for (let i = 0; i < 9; i++) {
    const c = [PAL.wood, PAL.wood2, PAL.wood3][i % 3]!;
    b.add(rbox(iw, 0.06, idp / 9 + 0.001, 0.006), c, {
      p: [0, -0.03, ISLAND.z0 + (i + 0.5) * (idp / 9)],
    });
  }
  b.add(box(iw - 0.08, FLOOR_Y * -1 - 0.1, idp - 0.06), PAL.island, {
    p: [0, (FLOOR_Y - 0.06) / 2 - 0.02, 0],
  });
  b.add(box(iw - 0.12, 0.08, idp - 0.1), 0x3b2a22, { p: [0, FLOOR_Y + 0.04, 0] });
  const doors = 4;
  for (let i = 0; i < doors; i++) {
    const dw = (iw - 0.16) / doors;
    const dx = ISLAND.x0 + 0.08 + (i + 0.5) * dw;
    b.add(rbox(dw - 0.03, 0.62, 0.02, 0.01), PAL.islandDark, { p: [dx, -0.43, ISLAND.z1 - 0.025] });
    b.add(rbox(dw - 0.11, 0.52, 0.02, 0.01), PAL.island, { p: [dx, -0.43, ISLAND.z1 - 0.018] });
    b.add(sph(0.016, 12, 8), PAL.knob, {
      p: [dx + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), -0.2, ISLAND.z1 - 0.004],
    });
  }
  // Towel over the front edge.
  for (let i = 0; i < 6; i++) {
    b.add(box(0.03, 0.3, 0.012), i % 2 ? PAL.cream : PAL.orange, {
      p: [-0.62 + i * 0.03, -0.17, ISLAND.z1 + 0.012],
    });
  }
  b.add(rbox(0.19, 0.03, 0.06, 0.01), PAL.cream, { p: [-0.545, -0.005, ISLAND.z1 - 0.01] });

  // Pendant lamps above the island.
  for (const lx of [-0.55, 0.85]) {
    b.add(cyl(0.004, 0.004, 0.9, 6), PAL.ink, { p: [lx, 2.2, -0.15] });
    b.add(
      lathe(
        [
          [0.02, 0.1],
          [0.05, 0.09],
          [0.14, 0.0],
          [0.15, -0.01],
        ],
        28,
      ),
      PAL.yellow,
      { p: [lx, 1.65, -0.15] },
    );
    glow.add(sph(0.045, 14, 10), 0xfff6d8, { p: [lx, 1.64, -0.15] });
  }
}

function addPot(b: Batch, x: number, y: number, z: number, r: number): void {
  b.add(
    lathe(
      [
        [r * 0.7, 0],
        [r, r * 1.3],
        [r * 1.1, r * 1.35],
        [r * 1.1, r * 1.5],
      ],
      16,
    ),
    0xc8653a,
    { p: [x, y, z] },
  );
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.add(sph(r * 0.8, 8, 6), i % 2 ? PAL.leaf : PAL.leafDark, {
      p: [x + Math.cos(a) * r * 0.6, y + r * 2.1 + rand(i + 4) * r, z + Math.sin(a) * r * 0.4],
      s: [0.6, 1.4, 0.4],
      r: [0, a, Math.cos(a) * 0.5],
    });
  }
}

function addJar(b: Batch, x: number, y: number, z: number, h: number, fill: number): void {
  const r = 0.045;
  b.add(cyl(r, r, h, 20), 0xdff2ee, { p: [x, y + h / 2, z] });
  b.add(cyl(r * 0.88, r * 0.88, h * 0.7, 20), fill, { p: [x, y + h * 0.36, z + 0.004] });
  b.add(cyl(r * 1.05, r * 1.05, 0.025, 20), PAL.red, { p: [x, y + h + 0.012, z] });
  b.add(box(r * 1.3, h * 0.28, 0.002), PAL.cream, { p: [x, y + h * 0.5, z + r + 0.001] });
}

function addHangingTool(b: Batch, x: number, y: number, z: number, kind: string): void {
  b.add(new THREE.TorusGeometry(0.012, 0.0025, 4, 10), PAL.steelDark, { p: [x, y - 0.012, z - 0.01] });
  const handleLen = 0.16;
  b.add(rbox(0.018, handleLen, 0.012, 0.006), PAL.woodDark, { p: [x, y - 0.03 - handleLen / 2, z] });
  const by = y - 0.03 - handleLen - 0.02;
  switch (kind) {
    case 'turner':
      b.add(rbox(0.07, 0.09, 0.005, 0.01), PAL.steel, { p: [x, by - 0.03, z] });
      break;
    case 'paddle':
      b.add(sph(0.04, 14, 10), PAL.wood3, { p: [x, by - 0.03, z], s: [1, 1.2, 0.18] });
      break;
    case 'ladle':
      b.add(sph(0.04, 14, 10), PAL.steel, { p: [x, by - 0.03, z + 0.01], s: [1, 1, 0.6] });
      break;
    case 'skimmer':
      b.add(cyl(0.045, 0.045, 0.006, 20), PAL.steelDark, { p: [x, by - 0.035, z], r: [Math.PI / 2, 0, 0] });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add(cyl(0.005, 0.005, 0.008, 6), PAL.steel, {
          p: [x + Math.cos(a) * 0.025, by - 0.035 + Math.sin(a) * 0.025, z + 0.001],
          r: [Math.PI / 2, 0, 0],
        });
      }
      break;
    default:
      b.add(rbox(0.06, 0.13, 0.006, 0.008), PAL.steel, { p: [x, by - 0.05, z] });
      for (let i = 0; i < 5; i++)
        b.add(box(0.04, 0.004, 0.004), PAL.steelDark, { p: [x, by - 0.01 - i * 0.022, z + 0.004] });
  }
}

function addRiceCooker(b: Batch, x: number, z: number): void {
  b.add(rbox(0.3, 0.2, 0.26, 0.08, 3), 0xfffaf2, { p: [x, 0.1, z] });
  b.add(sph(0.14, 24, 12), 0xfffaf2, { p: [x, 0.2, z], s: [1.05, 0.38, 0.92] });
  // Floral band and the red button.
  for (let i = 0; i < 5; i++) {
    b.add(sph(0.016, 8, 6), i % 2 ? PAL.orange : PAL.red, {
      p: [x - 0.09 + i * 0.045, 0.1, z + 0.131],
      s: [1, 1, 0.3],
    });
  }
  b.add(rbox(0.06, 0.035, 0.02, 0.008), 0x9aa3ab, { p: [x, 0.05, z + 0.13] });
  b.add(sph(0.009, 8, 6), PAL.red, { p: [x - 0.012, 0.05, z + 0.142] });
  b.add(rbox(0.12, 0.022, 0.03, 0.01), 0x9aa3ab, { p: [x, 0.265, z] });
}

function addKerupukTin(b: Batch, x: number, z: number): void {
  b.add(box(0.22, 0.32, 0.22), PAL.red, { p: [x, 0.16, z] });
  b.add(box(0.16, 0.2, 0.004), 0xd8eef5, { p: [x, 0.17, z + 0.111] });
  for (let i = 0; i < 6; i++) {
    b.add(cyl(0.03, 0.03, 0.004, 12), 0xfff0c8, {
      p: [x - 0.045 + (i % 3) * 0.045, 0.12 + Math.floor(i / 3) * 0.06 + rand(i) * 0.02, z + 0.114],
      r: [Math.PI / 2, 0, rand(i + 4)],
    });
  }
  b.add(cyl(0.085, 0.085, 0.03, 24), 0xc8d0d6, { p: [x, 0.335, z] });
}

function addBottles(b: Batch, x: number, z: number): void {
  // Sweet soy sauce, cooking oil, a sambal jar.
  b.add(cyl(0.035, 0.035, 0.2, 16), 0x2a1a12, { p: [x, 0.1, z] });
  b.add(cyl(0.012, 0.03, 0.05, 12), 0x2a1a12, { p: [x, 0.225, z] });
  b.add(cyl(0.036, 0.036, 0.07, 16), PAL.yellow, { p: [x, 0.1, z] });
  b.add(cyl(0.04, 0.04, 0.22, 16), 0xf0c84a, { p: [x + 0.11, 0.11, z + 0.02] });
  b.add(cyl(0.015, 0.015, 0.04, 10), PAL.green, { p: [x + 0.11, 0.24, z + 0.02] });
  b.add(cyl(0.045, 0.045, 0.09, 18), PAL.chili, { p: [x - 0.1, 0.045, z + 0.04] });
  b.add(cyl(0.048, 0.048, 0.02, 18), PAL.yellow, { p: [x - 0.1, 0.1, z + 0.04] });
}

function addPotOnCounter(b: Batch, x: number, z: number): void {
  b.add(cyl(0.13, 0.12, 0.16, 28), PAL.steel, { p: [x, 0.08, z] });
  b.add(cyl(0.135, 0.135, 0.015, 28), PAL.steelDark, { p: [x, 0.165, z] });
  b.add(sph(0.02, 10, 8), PAL.ink, { p: [x, 0.18, z] });
  for (const s of [-1, 1]) b.add(rbox(0.04, 0.015, 0.03, 0.006), PAL.ink, { p: [x + s * 0.15, 0.13, z] });
}

/* ------------------------------------------------------------------ island dressing */

/** Small things on the island so every close-up has context. */
function addDressing(b: Batch): void {
  // Bowl of sliced spring onion and a lime behind the board.
  b.add(
    shell(
      [
        [0.0005, 0],
        [0.04, 0],
        [0.06, 0.02],
        [0.065, 0.035],
      ],
      0.004,
      24,
    ),
    0xfff6e8,
    { p: [-1.28, 0, -0.2] },
  );
  b.add(new THREE.TorusGeometry(0.064, 0.004, 6, 24), PAL.orange, {
    p: [-1.28, 0.035, -0.2],
    r: [Math.PI / 2, 0, 0],
  });
  for (let i = 0; i < 16; i++) {
    const a = rand(i + 61) * Math.PI * 2;
    const r = Math.sqrt(rand(i + 62)) * 0.045;
    b.add(new THREE.TorusGeometry(0.006, 0.0025, 4, 10), i % 3 ? 0x5fbf48 : 0xe8f5c0, {
      p: [-1.28 + Math.cos(a) * r, 0.026 + rand(i) * 0.006, -0.2 + Math.sin(a) * r],
      r: [Math.PI / 2 + (rand(i + 3) - 0.5), 0, rand(i + 4)],
    });
  }
  b.add(sph(0.026, 14, 10), 0x7cc242, { p: [-0.7, 0.024, -0.24], s: [1, 0.92, 1] });
  b.add(sph(0.026, 14, 10), 0x8fcf55, { p: [-0.64, 0.024, -0.2], s: [1, 0.92, 1] });
  b.add(cyl(0.004, 0.005, 0.008, 6), 0x5b8f2a, { p: [-0.7, 0.05, -0.24] });

  // Iced sweet tea in a tall glass, with ice and a straw.
  const tx = 0.36;
  const tz = -0.14;
  b.add(cyl(0.032, 0.028, 0.13, 20), 0xd9eef0, { p: [tx, 0.065, tz] });
  b.add(cyl(0.029, 0.026, 0.105, 20), 0xb5651d, { p: [tx, 0.056, tz + 0.001] });
  for (let i = 0; i < 4; i++) {
    b.add(rbox(0.018, 0.016, 0.018, 0.004), 0xf2fbff, {
      p: [tx + (i % 2 ? 0.01 : -0.01), 0.112 + (i > 1 ? 0.01 : 0), tz + (i > 1 ? 0.008 : -0.006)],
      r: [rand(i) * 0.6, rand(i + 1), 0],
    });
  }
  b.add(cyl(0.003, 0.003, 0.17, 8), PAL.red, { p: [tx + 0.012, 0.13, tz], r: [0, 0, -0.25] });
  b.add(cyl(0.026, 0.026, 0.004, 20), 0xfff6e8, { p: [tx, 0.002, tz] });

  // Spoon and fork on a napkin, Indonesian style, right of the plate.
  const nx = 0.33;
  const nz = 0.17;
  b.add(rbox(0.09, 0.004, 0.16, 0.002), PAL.cream, { p: [nx, 0.002, nz], r: [0, 0.12, 0] });
  b.add(box(0.012, 0.0045, 0.16), PAL.orange, { p: [nx - 0.03, 0.0025, nz], r: [0, 0.12, 0] });
  b.add(sph(0.016, 12, 8), PAL.steel, {
    p: [nx - 0.012, 0.007, nz - 0.05],
    s: [0.8, 0.25, 1.2],
    r: [0, 0.12, 0],
  });
  b.add(rbox(0.008, 0.004, 0.1, 0.002), PAL.steel, { p: [nx - 0.006, 0.006, nz + 0.03], r: [0, 0.12, 0] });
  b.add(rbox(0.008, 0.004, 0.1, 0.002), PAL.steel, { p: [nx + 0.022, 0.006, nz + 0.03], r: [0, 0.12, 0] });
  for (let i = 0; i < 4; i++) {
    b.add(box(0.0018, 0.003, 0.03), PAL.steel, {
      p: [nx + 0.016 + i * 0.0045, 0.006, nz - 0.035],
      r: [0, 0.12, 0],
    });
  }

  // Two eggs in a small bowl and the salt pot near the stove; soy sauce behind the wok.
  b.add(
    shell(
      [
        [0.0005, 0],
        [0.035, 0],
        [0.055, 0.02],
        [0.058, 0.03],
      ],
      0.004,
      24,
    ),
    0xe9f4f2,
    { p: [1.33, 0, -0.24] },
  );
  b.add(sph(0.022, 14, 10), 0xf3d9b4, { p: [1.32, 0.03, -0.235], s: [0.85, 1.1, 0.85], r: [0.3, 0, 0.2] });
  b.add(sph(0.022, 14, 10), 0xf7e6cc, { p: [1.345, 0.03, -0.255], s: [0.85, 1.1, 0.85], r: [-0.2, 0, -0.3] });
  b.addShaded(new THREE.SphereGeometry(0.02, 12, 8), () => 0xfff4dc, {
    p: [1.3, 0.028, -0.25],
    s: [0.85, 1.1, 0.85],
  });
  b.add(cyl(0.022, 0.024, 0.05, 16), 0xffffff, { p: [1.38, 0.025, 0.02] });
  b.add(cyl(0.023, 0.023, 0.012, 16), PAL.red, { p: [1.38, 0.054, 0.02] });
  const kx = 1.3;
  const kz = -0.36;
  b.add(cyl(0.028, 0.028, 0.16, 16), 0x2a1a12, { p: [kx, 0.08, kz] });
  b.add(cyl(0.01, 0.024, 0.04, 12), 0x2a1a12, { p: [kx, 0.18, kz] });
  b.add(cyl(0.029, 0.029, 0.06, 16), PAL.yellow, { p: [kx, 0.08, kz] });
  b.add(cyl(0.006, 0.006, 0.012, 8), PAL.red, { p: [kx, 0.205, kz] });
}

/* ------------------------------------------------------------------ blob shadows */

const ISLAND_TOP: number = ISLAND.top;
/** Stove plate under the burners. */
const STOVE_TOP = STOVE.top + 0.003;
const round = (x: number, z: number, r: number, h: number, y = ISLAND_TOP): Blob => ({
  x,
  y,
  z,
  rx: r,
  rz: r,
  h,
});

/** Under the board and the dressing on the island (every dish). */
const COMMON_BLOBS: readonly Blob[] = [
  { x: SPOT.board[0], y: ISLAND_TOP, z: SPOT.board[2], rx: 0.26, rz: 0.18, h: 0.015 },
  round(0.36, -0.14, 0.045, 0.065),
  round(1.3, -0.36, 0.04, 0.09),
  round(-1.28, -0.2, 0.075, 0.02),
  round(-0.67, -0.22, 0.05, 0.024),
  round(1.33, -0.24, 0.065, 0.02),
  round(1.38, 0.02, 0.03, 0.03),
];
const STOVE_BLOB: Blob = {
  x: (STOVE.x0 + STOVE.x1) / 2,
  y: ISLAND_TOP,
  z: STOVE.z,
  rx: 0.52,
  rz: 0.25,
  h: 0.04,
};
const PLATE_BLOB = round(SPOT.plate[0], SPOT.plate[2], 0.155, 0.012);
const DISH_BLOBS: Readonly<Record<DishId, readonly Blob[]>> = {
  nasgor: [
    STOVE_BLOB,
    PLATE_BLOB,
    round(SPOT.cobek[0], SPOT.cobek[2], 0.12, 0.025),
    round(SPOT.wok[0], SPOT.wok[2], 0.21, 0.06, STOVE_TOP),
    round(SPOT.pan[0], SPOT.pan[2], 0.14, 0.03, STOVE_TOP),
  ],
  sate: [
    PLATE_BLOB,
    { x: SPOT.tray[0], y: ISLAND_TOP, z: SPOT.tray[2], rx: 0.23, rz: 0.165, h: 0.012 },
    { x: SPOT.grill[0], y: ISLAND_TOP, z: SPOT.grill[2], rx: 0.31, rz: 0.13, h: 0.05 },
  ],
  martabak: [
    STOVE_BLOB,
    round(SPOT.bowl[0], SPOT.bowl[2], 0.155, 0.035),
    round(SPOT.loyang[0], SPOT.loyang[2], 0.155, 0.025, STOVE_TOP),
  ],
};

/* ------------------------------------------------------------------ public */

/** Room chunk size (metres): close station cameras skip the walls, shelves and floor they miss. */
const ROOM_CELL = 0.9;
/** Island chunk size: a station camera sees about one cooking spot. */
const ISLAND_CELL = 0.45;

/** Weak devices: the toon lighting of the fixed set is baked into its colours, drawn unlit. */
function bakeSet(root: THREE.Object3D): void {
  const lit = vcToon();
  const flat = basic(0xffffff, { vertexColors: true });
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.material !== lit) return;
    bakeToonLight(m.geometry);
    m.material = flat;
  });
}

export class Kitchen {
  readonly group = new THREE.Group();
  private readonly dishGroups: Record<DishId, THREE.Group>;
  private readonly blobs: THREE.Object3D[] = [];
  private dish: DishId | null = null;

  /** `baked`: light the fixed set once at load (no shadow map, cheapest pixels). */
  constructor(opts: { baked?: boolean } = {}) {
    const room = new Batch();
    const glow = new Batch();
    addRoom(room, glow);
    const common = new Batch();
    addBoard(common, SPOT.board[0], SPOT.board[2]);
    addDressing(common);
    this.group.add(room.buildChunks(ROOM_CELL, vcToon(), false));
    this.group.add(common.buildChunks(ISLAND_CELL));
    const commonBlobs = blobShadows(COMMON_BLOBS);
    this.blobs.push(commonBlobs);
    this.group.add(commonBlobs);
    const glowMesh = glow.build(basic(0xffffff, { vertexColors: true }), false);
    glowMesh.receiveShadow = false;
    this.group.add(glowMesh);

    const nasgor = new Batch();
    addCobek(nasgor, SPOT.cobek[0], SPOT.cobek[2], 0.85);
    addStove(nasgor);
    addWok(nasgor, SPOT.wok[0], ON_STOVE, SPOT.wok[2]);
    addPan(nasgor, SPOT.pan[0], ON_STOVE, SPOT.pan[2]);
    addPlate(nasgor, SPOT.plate[0], SPOT.plate[2]);

    const sate = new Batch();
    addTray(sate, SPOT.tray[0], SPOT.tray[2]);
    addGrill(sate, SPOT.grill[0], SPOT.grill[2]);
    addPlate(sate, SPOT.plate[0], SPOT.plate[2], PAL.green);

    const martabak = new Batch();
    addBowl(martabak, SPOT.bowl[0], SPOT.bowl[2]);
    addStove(martabak);
    addLoyang(martabak, SPOT.loyang[0], ON_STOVE, SPOT.loyang[2]);

    this.dishGroups = {
      nasgor: new THREE.Group().add(nasgor.buildChunks(ISLAND_CELL)),
      sate: new THREE.Group().add(sate.buildChunks(ISLAND_CELL)),
      martabak: new THREE.Group().add(martabak.buildChunks(ISLAND_CELL)),
    };
    for (const [d, g] of Object.entries(this.dishGroups) as [DishId, THREE.Group][]) {
      const b = blobShadows(DISH_BLOBS[d]);
      this.blobs.push(b);
      g.add(b);
      this.group.add(g);
    }
    if (opts.baked) bakeSet(this.group);
    this.setContactShadows(false);
    this.setDish('nasgor');
  }

  setDish(d: DishId): void {
    if (d === this.dish) return;
    this.dish = d;
    for (const [k, g] of Object.entries(this.dishGroups)) g.visible = k === d;
  }

  /** Blob shadows under the cookware: on when the shadow map is off. */
  setContactShadows(on: boolean): void {
    for (const b of this.blobs) b.visible = on;
  }
}
