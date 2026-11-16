/**
 * City blocks: colourful ruko shophouses facing the circuit (shop fronts, painted signs, awnings,
 * window grilles, balconies, AC units, water tanks), mid-rise blocks and far towers with a tiled
 * window texture. Placement uses a coarse occupancy grid so nothing lands on the road.
 * Everything is softly rounded and carries PBR surfaces: plaster walls, satin trims, reflective
 * glass set behind deep frames, canvas awnings, plastic water tanks.
 */
import * as THREE from 'three';
import { type GeoBuilder, hash01, mix, SURF, shade, tube } from './geo';
import type { SignAtlas, UvRect } from './textures';

export const WALL_COLORS = [
  0xf4e3c1, 0xf7c9b6, 0xbfe3d0, 0xf9d976, 0xa8d5e8, 0xf2b8a2, 0xe8e2d6, 0xcde7b0, 0xf5a97f, 0x9ed2c6,
  0xffffff, 0xffe0a3,
];
const AWNING_COLORS = [0x22b35e, 0x2f8cff, 0xff5a1f, 0xf2453d, 0x14b8a6, 0xffc928, 0x3d4a5c];
const GLASS = 0x2b4151;
const DARK = 0x2a2b30;
/** Cheap shared shapes: a soft lump (plants, fruit piles), a tank lid dome, a satellite dish. */
const LUMP = new THREE.IcosahedronGeometry(1, 1);
const DOME = new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
const DISH = new THREE.LatheGeometry(
  [
    new THREE.Vector2(0.0001, -0.12),
    new THREE.Vector2(0.25, -0.1),
    new THREE.Vector2(0.45, -0.04),
    new THREE.Vector2(0.52, 0.02),
  ],
  12,
);

/** 2 m occupancy grid over the city. */
export class Grid {
  readonly cell = 2;
  readonly cols: number;
  readonly rows: number;
  private readonly data: Uint8Array;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    maxX: number,
    maxZ: number,
  ) {
    this.cols = Math.ceil((maxX - minX) / this.cell);
    this.rows = Math.ceil((maxZ - minZ) / this.cell);
    this.data = new Uint8Array(this.cols * this.rows);
  }

  private idx(x: number, z: number): number {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((z - this.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  free(x: number, z: number): boolean {
    const i = this.idx(x, z);
    return i >= 0 && this.data[i] === 0;
  }

  markCircle(x: number, z: number, r: number): void {
    const c = this.cell;
    for (let zz = z - r; zz <= z + r; zz += c) {
      for (let xx = x - r; xx <= x + r; xx += c) {
        if ((xx - x) ** 2 + (zz - z) ** 2 > r * r) continue;
        const i = this.idx(xx, zz);
        if (i >= 0) this.data[i] = 1;
      }
    }
  }

  /** Rotated rectangle: centre, heading angle (local +z = (sin a, cos a)), width (x) and depth (z). */
  rectFree(cx: number, cz: number, a: number, w: number, d: number): boolean {
    const ux = Math.cos(a);
    const uz = -Math.sin(a);
    const vx = Math.sin(a);
    const vz = Math.cos(a);
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const x = cx + ux * (w / 2) * (i / 2) + vx * (d / 2) * (j / 2);
        const z = cz + uz * (w / 2) * (i / 2) + vz * (d / 2) * (j / 2);
        if (!this.free(x, z)) return false;
      }
    }
    return true;
  }

  markRect(cx: number, cz: number, a: number, w: number, d: number): void {
    const ux = Math.cos(a);
    const uz = -Math.sin(a);
    const vx = Math.sin(a);
    const vz = Math.cos(a);
    const step = this.cell * 0.5;
    for (let x = -w / 2; x <= w / 2; x += step) {
      for (let z = -d / 2; z <= d / 2; z += step) {
        const i = this.idx(cx + ux * x + vx * z, cz + uz * x + vz * z);
        if (i >= 0) this.data[i] = 1;
      }
    }
  }
}

export interface ChunkBuilders {
  toon: GeoBuilder;
  sign: GeoBuilder;
  facade: GeoBuilder;
}

/** Local frame: x along the facade, y up, +z out of the facade towards the street. */
export function frameMatrix(x: number, y: number, z: number, angle: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
    new THREE.Vector3(1, 1, 1),
  );
}

const _a = new THREE.Vector3();

function tp(m: THREE.Matrix4, x: number, y: number, z: number): [number, number, number] {
  _a.set(x, y, z).applyMatrix4(m);
  return [_a.x, _a.y, _a.z];
}

/** Textured quad in a local frame, facing local +z. */
export function signQuad(
  b: GeoBuilder,
  m: THREE.Matrix4,
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  uv: UvRect,
  tint: THREE.ColorRepresentation = 0xffffff,
): void {
  b.quad(
    tp(m, cx - w / 2, cy - h / 2, cz),
    tp(m, cx + w / 2, cy - h / 2, cz),
    tp(m, cx + w / 2, cy + h / 2, cz),
    tp(m, cx - w / 2, cy + h / 2, cz),
    tint,
    uv,
  );
}

export interface RukoOptions {
  w: number;
  depth: number;
  floors: number;
  seed: number;
  signSlot: number;
}

/**
 * Curved canvas awning in alternating stripes with a scalloped valance, from the wall at
 * height `y0` out to `out` metres, dropping `drop` (local frame `m`, wall at z = 0).
 */
function awning(
  b: GeoBuilder,
  m: THREE.Matrix4,
  w: number,
  y0: number,
  out: number,
  drop: number,
  cA: THREE.ColorRepresentation,
  cB: THREE.ColorRepresentation,
): void {
  const n = Math.max(2, Math.round(w / 0.5));
  const sw = w / n;
  const segs = 5;
  const prof = (t: number): [number, number, number, number] => {
    // Position (y, z) and the outward normal (ny, nz) of the curved sheet.
    const y = y0 - drop * t * t + 0.1 * Math.sin(Math.PI * t);
    const z = out * t;
    const dy = -2 * drop * t + 0.1 * Math.PI * Math.cos(Math.PI * t);
    const dz = out;
    const l = Math.hypot(dy, dz);
    return [y, z, dz / l, -dy / l];
  };
  const prev = b.surface;
  b.surface = SURF.fabric;
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * sw;
    const x1 = x0 + sw;
    const col = new THREE.Color(i % 2 ? cA : cB);
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k <= segs; k++) {
      const [y, z, ny, nz] = prof(k / segs);
      for (const x of [x0, x1]) {
        pos.push(x, y, z);
        nor.push(0, ny, nz);
      }
    }
    // Underside, a little lower, facing down/in.
    const off = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const [y, z, ny, nz] = prof(k / segs);
      for (const x of [x0, x1]) {
        pos.push(x, y - 0.035, z);
        nor.push(0, -ny, -nz);
      }
    }
    for (let k = 0; k < segs; k++) {
      const a = k * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      idx.push(off + a, off + a + 1, off + a + 2, off + a + 1, off + a + 3, off + a + 2);
    }
    // Scalloped flap under the front edge (both faces).
    const [ye, ze] = prof(1);
    const c0 = pos.length / 3;
    const xc = (x0 + x1) / 2;
    const r = sw / 2;
    pos.push(xc, ye, ze + 0.01);
    nor.push(0, 0, 1);
    const fan = 4;
    for (let f = 0; f <= fan; f++) {
      const a = Math.PI + (f / fan) * Math.PI;
      pos.push(xc + Math.cos(a) * r, ye + Math.sin(a) * r * 0.55, ze + 0.01);
      nor.push(0, 0, 1);
    }
    for (let f = 0; f < fan; f++) {
      idx.push(c0, c0 + 1 + f, c0 + 2 + f);
      idx.push(c0, c0 + 2 + f, c0 + 1 + f);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    b.addGeometry(g, m, col);
  }
  b.surface = prev;
}

/** A framed window on a wall: glass flush with the wall, a deep frame, a sill, optional extras. */
function windowUnit(
  b: GeoBuilder,
  m: THREE.Matrix4,
  wx: number,
  yc: number,
  ww: number,
  wh: number,
  trim: THREE.Color,
  style: number,
): void {
  const R = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: THREE.ColorRepresentation,
    r: number,
  ) => b.roundBoxIn(m, x, y, z, sx, sy, sz, c, r);
  b.surface = SURF.satin;
  // Far away: one frame slab behind the glass instead of rails, sill and extras.
  b.lod?.primIn(m, 'box', wx, yc, 0.03, ww + 0.24, wh + 0.24, 0.06, trim);
  b.surface = SURF.glass;
  b.primIn(m, 'box', wx, yc, 0.02, ww, wh, 0.04, GLASS);
  b.lodSkip++;
  b.surface = SURF.satin;
  const fw = 0.11;
  const fd = 0.15;
  R(wx, yc + wh / 2 + fw / 2, fd / 2, ww + fw * 2, fw, fd, trim, 0.035);
  R(wx, yc - wh / 2 - fw / 2, fd / 2, ww + fw * 2, fw, fd, trim, 0.035);
  // Side jambs stay sharp (cheap); the lit top and bottom rails carry the rounded edge.
  b.primIn(m, 'box', wx - ww / 2 - fw / 2, yc, fd / 2, fw, wh, fd * 0.98, trim);
  b.primIn(m, 'box', wx + ww / 2 + fw / 2, yc, fd / 2, fw, wh, fd * 0.98, trim);
  // Slim mullion and transom
  b.primIn(m, 'box', wx, yc, 0.06, 0.05, wh, 0.05, 0xf2efe8);
  b.primIn(m, 'box', wx, yc + wh * 0.2, 0.06, ww, 0.045, 0.05, 0xf2efe8);
  // Sill
  R(wx, yc - wh / 2 - fw - 0.04, 0.17, ww + 0.42, 0.08, 0.32, trim, 0.03);
  if (style === 1) {
    // Teralis grille in front of the glass
    b.surface = SURF.metal;
    for (let g = 0; g < 5; g++)
      b.primIn(m, 'box', wx - ww / 2 + (ww / 4) * g, yc, 0.13, 0.035, wh, 0.035, DARK);
    b.primIn(m, 'box', wx, yc, 0.13, ww, 0.035, 0.035, DARK);
  } else if (style === 2) {
    // Jalousie louvres
    b.surface = SURF.satin;
    for (let g = 0; g < 6; g++)
      b.primIn(m, 'box', wx, yc - wh / 2 + 0.15 + g * 0.24, 0.12, ww, 0.05, 0.07, 0xdcd6c8, -0.35, 0, 0);
  } else if (style === 3) {
    // Concrete sunshade over the window
    b.surface = SURF.plaster;
    R(wx, yc + wh / 2 + 0.34, 0.32, ww + 0.6, 0.09, 0.64, trim, 0.035);
  }
  b.lodSkip--;
}

/** A 2-4 storey shophouse with its front at local z = 0. */
export function addRuko(cb: ChunkBuilders, m: THREE.Matrix4, signs: SignAtlas, o: RukoOptions): void {
  const { w, depth, floors, seed } = o;
  const r = (k: number) => hash01(seed * 13.7 + k * 3.1);
  const wall = new THREE.Color(WALL_COLORS[Math.floor(r(1) * WALL_COLORS.length)]!);
  const trim = r(2) > 0.5 ? shade(wall, 0.82) : mix(wall, 0xffffff, 0.6);
  const H = 3.6 + (floors - 1) * 3.2;
  const b = cb.toon;
  const prevSurface = b.surface;
  const bevel = b.boxBevel;
  const P = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: THREE.ColorRepresentation,
  ) => b.primIn(m, 'box', x, y, z, sx, sy, sz, c);
  const R = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: THREE.ColorRepresentation,
    rr: number,
  ) => b.roundBoxIn(m, x, y, z, sx, sy, sz, c, rr);

  // Shell: plaster with softly rounded corners.
  b.surface = SURF.plaster;
  R(0, H / 2, -depth / 2, w, H, depth, wall, 0.14);
  // Ground floor: open shop or shutters
  const openShop = r(3) > 0.3;
  b.surface = SURF.matte;
  P(0, 1.5, 0.01, w - 0.7, 2.9, 0.06, 0x3a332c);
  b.lodSkip++;
  if (openShop) {
    // Rolled-up shutter drum, shelves with goods, crates.
    b.surface = SURF.metal;
    b.primIn(m, 'cyl12', 0, 2.86, 0.17, 0.32, w - 0.6, 0.32, 0x9aa0a6, 0, 0, Math.PI / 2);
    for (let k = 0; k < 3; k++) {
      const y = 0.55 + k * 0.7;
      b.surface = SURF.wood;
      P(0, y, 0.06, w - 1.0, 0.06, 0.12, 0x6b4a2a);
      b.surface = SURF.gloss;
      b.boxBevel = 0;
      for (let g = 0; g < Math.floor(w); g++) {
        const gx = -w / 2 + 0.8 + g * ((w - 1.6) / Math.max(1, Math.floor(w) - 1));
        const gc = [0xf2453d, 0xffc928, 0x2f8cff, 0x22b35e, 0xff8a3d, 0xfff7f0][
          Math.floor(r(10 + k * 7 + g) * 6)
        ]!;
        P(gx, y + 0.2, 0.08, 0.5, 0.32, 0.1, gc);
      }
      b.boxBevel = bevel;
    }
    if (r(4) > 0.5) {
      // Plastic crates on the pavement
      b.surface = SURF.plastic;
      for (let k = 0; k < 3; k++) {
        const cx = -w / 2 + 0.9 + k * 0.75;
        R(cx, 0.25, 0.5, 0.6, 0.5, 0.45, [0x22b35e, 0x2f8cff, 0xf2453d][k]!, 0.05);
        b.surface = SURF.gloss;
        b.addGeometry(
          LUMP,
          new THREE.Matrix4().multiplyMatrices(
            m,
            new THREE.Matrix4().compose(
              new THREE.Vector3(cx, 0.56, 0.5),
              new THREE.Quaternion(),
              new THREE.Vector3(0.25, 0.09, 0.19),
            ),
          ),
          [0xffc928, 0xff8a3d, 0x9be05a][Math.floor(r(30 + k) * 3)]!,
        );
        b.surface = SURF.plastic;
      }
    }
  } else {
    // Closed rolling shutter with ribs.
    b.surface = SURF.metal;
    P(0, 1.5, 0.05, w - 0.7, 2.9, 0.05, 0xa7adb3);
    for (let k = 0; k < 9; k++) P(0, 0.2 + k * 0.32, 0.085, w - 0.7, 0.04, 0.02, 0x8a9096);
  }
  b.lodSkip--;
  if (!openShop) {
    b.surface = SURF.metal;
    b.lod?.primIn(m, 'box', 0, 1.5, 0.05, w - 0.7, 2.9, 0.05, 0xa7adb3);
  }
  // Pillars between shops
  b.surface = SURF.satin;
  R(-w / 2 + 0.17, 1.5, 0.06, 0.34, 3.0, 0.22, trim, 0.06);
  R(w / 2 - 0.17, 1.5, 0.06, 0.34, 3.0, 0.22, trim, 0.06);
  // Curved striped awning
  const awn = AWNING_COLORS[Math.floor(r(5) * AWNING_COLORS.length)]!;
  if (r(6) > 0.35) {
    awning(b, m, w + 0.06, 3.15, 1.55, 0.45, awn, r(7) > 0.5 ? 0xfff7f0 : shade(awn, 0.82));
    b.surface = SURF.metal;
    for (const sx of [-1, 1])
      b.addGeometry(
        tube(
          [
            new THREE.Vector3(sx * (w / 2 - 0.1), 3.05, 0.05),
            new THREE.Vector3(sx * (w / 2 - 0.1), 2.8, 1.45),
          ],
          0.025,
          { radial: 6, segments: 2 },
        ),
        m,
        DARK,
      );
  }
  // Sign board
  b.surface = SURF.gloss;
  R(0, 3.7, 0.09, w - 0.3, 0.95, 0.14, DARK, 0.05);
  signQuad(cb.sign, m, 0, 3.7, 0.17, w - 0.5, 0.82, signs.sign(o.signSlot));
  // Two-step cornices between floors
  b.surface = SURF.satin;
  for (let f = 1; f < floors; f++) {
    const y = 3.6 + (f - 1) * 3.2 + 0.02;
    R(0, y + 0.55, 0.1, w + 0.14, 0.2, 0.22, trim, 0.06);
    R(0, y + 0.69, 0.15, w + 0.24, 0.06, 0.3, mix(trim, 0xffffff, 0.25), 0.025);
  }
  // Upper floors
  const nWin = w >= 6 ? 2 : 1;
  for (let f = 1; f < floors; f++) {
    const y0 = 3.6 + (f - 1) * 3.2 + 0.55;
    const style = Math.floor(r(20 + f) * 4);
    for (let k = 0; k < nWin; k++) {
      const wx = nWin === 1 ? 0 : (k === 0 ? -1 : 1) * (w / 4);
      const ww = nWin === 1 ? Math.min(2.4, w - 1.6) : Math.min(1.7, w / 2 - 0.8);
      windowUnit(b, m, wx, y0 + 1.55, ww, 1.45, trim, style);
    }
    // AC unit with a fan grille
    b.lodSkip++;
    if (r(40 + f) > 0.5) {
      const ax = (r(41 + f) > 0.5 ? 1 : -1) * (w / 2 - 0.6);
      b.surface = SURF.plastic;
      R(ax, y0 + 0.5, 0.25, 0.8, 0.5, 0.35, 0xf4f4f4, 0.05);
      b.surface = SURF.metal;
      b.primIn(m, 'cyl8', ax - 0.12, y0 + 0.5, 0.43, 0.36, 0.02, 0.36, 0x9ea4aa, Math.PI / 2, 0, 0);
    }
    b.lodSkip--;
    // Balcony on the first upper floor
    if (f === 1 && r(50) > 0.55) {
      b.surface = SURF.plaster;
      R(0, y0 + 0.2, 0.55, w - 0.2, 0.15, 1.1, trim, 0.05);
      b.lodSkip++;
      b.surface = SURF.metal;
      b.addGeometry(
        tube(
          [
            new THREE.Vector3(-w / 2 + 0.15, y0 + 0.78, 1.07),
            new THREE.Vector3(w / 2 - 0.15, y0 + 0.78, 1.07),
          ],
          0.03,
          { radial: 6, segments: 2 },
        ),
        m,
        DARK,
      );
      for (let g = 0; g < Math.floor(w * 2); g++)
        P(-w / 2 + 0.2 + g * 0.5, y0 + 0.5, 1.07, 0.035, 0.55, 0.035, DARK);
      for (let g = 0; g < 3; g++) {
        const px = -w / 2 + 0.7 + g * ((w - 1.4) / 2);
        b.surface = SURF.matte;
        b.primIn(m, 'cyl8', px, y0 + 0.45, 0.85, 0.36, 0.34, 0.36, 0xb5653a);
        b.surface = SURF.foliage;
        b.addGeometry(
          LUMP,
          new THREE.Matrix4().multiplyMatrices(
            m,
            new THREE.Matrix4().compose(
              new THREE.Vector3(px, y0 + 0.8, 0.85),
              new THREE.Quaternion(),
              new THREE.Vector3(0.3, 0.27, 0.3),
            ),
          ),
          [0x2e9e4f, 0x3fae5a, 0x23803e][g]!,
        );
      }
      b.lodSkip--;
    }
  }
  // Roof: parapet with a capping, plastic water tank on a steel stand, dish.
  const ry = H;
  b.surface = SURF.plaster;
  R(0, ry + 0.3, -0.12, w, 0.6, 0.24, trim, 0.07);
  R(0, ry + 0.3, -depth + 0.12, w, 0.6, 0.24, trim, 0.07);
  R(-w / 2 + 0.12, ry + 0.3, -depth / 2, 0.24, 0.6, depth, trim, 0.07);
  R(w / 2 - 0.12, ry + 0.3, -depth / 2, 0.24, 0.6, depth, trim, 0.07);
  b.surface = SURF.satin;
  R(0, ry + 0.63, -0.12, w + 0.06, 0.07, 0.34, mix(trim, 0xffffff, 0.3), 0.03);
  if (r(60) > 0.35) {
    const tx = (r(61) - 0.5) * (w - 2);
    const tz = -depth * (0.35 + r(62) * 0.4);
    b.surface = SURF.metal;
    for (const lx of [-0.45, 0.45])
      for (const lz of [-0.45, 0.45]) P(tx + lx, ry + 0.65, tz + lz, 0.08, 1.3, 0.08, 0x8a9096);
    R(tx, ry + 1.32, tz, 1.25, 0.08, 1.25, 0x8a9096, 0.03);
    b.surface = SURF.plastic;
    const tank = r(63) > 0.5 ? 0xff8a3d : 0x2f8cff;
    b.primIn(m, 'cyl12', tx, ry + 2.05, tz, 1.3, 1.4, 1.3, tank);
    b.addGeometry(
      DOME,
      new THREE.Matrix4().multiplyMatrices(
        m,
        new THREE.Matrix4().compose(
          new THREE.Vector3(tx, ry + 2.75, tz),
          new THREE.Quaternion(),
          new THREE.Vector3(0.65, 0.2, 0.65),
        ),
      ),
      tank,
    );
    b.primIn(m, 'cyl12', tx, ry + 2.98, tz, 0.42, 0.12, 0.42, shade(tank, 0.8));
  }
  if (r(64) > 0.6) {
    b.surface = SURF.satin;
    b.addGeometry(
      DISH,
      new THREE.Matrix4().multiplyMatrices(
        m,
        new THREE.Matrix4().compose(
          new THREE.Vector3(-w / 4, ry + 1.0, -depth * 0.25),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, 0.4, 0)),
          new THREE.Vector3(1, 1, 1),
        ),
      ),
      0xe8ecef,
    );
    b.surface = SURF.metal;
    P(-w / 4, ry + 0.4, -depth * 0.25, 0.08, 0.8, 0.08, 0x8a9096);
  }
  b.surface = prevSurface;
}

/** Box with the tiled window texture on its sides (no bottom). */
export function addFacadeBox(
  b: GeoBuilder,
  m: THREE.Matrix4,
  w: number,
  h: number,
  d: number,
  c: THREE.ColorRepresentation,
  bayW = 3.4,
  bayH = 3.2,
): void {
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const uW = w / bayW;
  const uD = d / bayW;
  const vH = h / bayH;
  // Front (+z), back (-z), right (+x), left (-x)
  b.quad(tp(m, x0, 0, z1), tp(m, x1, 0, z1), tp(m, x1, h, z1), tp(m, x0, h, z1), c, [0, 0, uW, vH]);
  b.quad(tp(m, x1, 0, z0), tp(m, x0, 0, z0), tp(m, x0, h, z0), tp(m, x1, h, z0), c, [0, 0, uW, vH]);
  b.quad(tp(m, x1, 0, z1), tp(m, x1, 0, z0), tp(m, x1, h, z0), tp(m, x1, h, z1), c, [0, 0, uD, vH]);
  b.quad(tp(m, x0, 0, z0), tp(m, x0, 0, z1), tp(m, x0, h, z1), tp(m, x0, h, z0), c, [0, 0, uD, vH]);
  // Roof uses a plain corner of the tile.
  b.quad(
    tp(m, x0, h, z1),
    tp(m, x1, h, z1),
    tp(m, x1, h, z0),
    tp(m, x0, h, z0),
    shade(c, 0.85),
    [0.02, 0.9, 0.08, 0.96],
  );
}

/** Mid-rise block (5-9 floors) with floor ledges, corner pilasters and roof clutter. */
export function addBlock(
  cb: ChunkBuilders,
  m: THREE.Matrix4,
  w: number,
  d: number,
  floors: number,
  seed: number,
): void {
  const r = (k: number) => hash01(seed * 7.3 + k * 1.9);
  const c = new THREE.Color(WALL_COLORS[Math.floor(r(1) * WALL_COLORS.length)]!);
  const h = floors * 3.2 + 1;
  addFacadeBox(
    cb.facade,
    new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, 0, -d / 2)),
    w,
    h,
    d,
    c,
  );
  const b = cb.toon;
  const prev = b.surface;
  const R = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    col: THREE.ColorRepresentation,
    rr: number,
  ) => b.roundBoxIn(m, x, y, z, sx, sy, sz, col, rr);
  const trim = shade(c, 0.86);
  b.surface = SURF.plaster;
  // Ground-floor band, corner pilasters and a ledge every second floor all round.
  R(0, 1.6, 0.0, w + 0.1, 3.2, 0.14, shade(c, 0.8), 0.05);
  for (const sx of [-1, 1])
    for (const sz of [0, -d])
      R(sx * (w / 2 - 0.12), h / 2, sz + (sz === 0 ? -0.12 : 0.12), 0.4, h, 0.4, trim, 0.1);
  for (let f = 2; f < floors; f += 2) R(0, f * 3.2 + 0.18, -d / 2, w + 0.18, 0.16, d + 0.18, trim, 0.06);
  // Roof parapet with a capping
  R(0, h + 0.3, -d / 2, w + 0.3, 0.6, d + 0.3, shade(c, 0.9), 0.1);
  b.surface = SURF.satin;
  R(0, h + 0.63, -d / 2, w + 0.38, 0.07, d + 0.38, mix(c, 0xffffff, 0.35), 0.03);
  if (r(2) > 0.4) {
    b.surface = SURF.plastic;
    const tank = r(4) > 0.5 ? 0xff8a3d : 0x2f8cff;
    const tx = (r(3) - 0.5) * w * 0.5;
    b.primIn(m, 'cyl12', tx, h + 1.5, -d * 0.5, 1.6, 2.0, 1.6, tank);
    b.addGeometry(
      DOME,
      new THREE.Matrix4().multiplyMatrices(
        m,
        new THREE.Matrix4().compose(
          new THREE.Vector3(tx, h + 2.5, -d * 0.5),
          new THREE.Quaternion(),
          new THREE.Vector3(0.8, 0.25, 0.8),
        ),
      ),
      tank,
    );
  }
  if (r(5) > 0.5) {
    // Rooftop billboard frame
    b.surface = SURF.gloss;
    R(0, h + 2.4, -d * 0.7, w * 0.6, 3.2, 0.25, [0xffc928, 0xfff7f0, 0x22b35e][Math.floor(r(6) * 3)]!, 0.08);
    b.surface = SURF.metal;
    for (const sx of [-1, 1]) b.primIn(m, 'box', sx * w * 0.25, h + 1.0, -d * 0.7, 0.15, 2.0, 0.15, 0x3b3c42);
  }
  b.surface = prev;
}

/** Far tower with a glassy or plastered skin, ledges and a rounded crown. */
export function addTower(
  cb: ChunkBuilders,
  m: THREE.Matrix4,
  w: number,
  d: number,
  h: number,
  seed: number,
): void {
  const r = (k: number) => hash01(seed * 5.1 + k * 2.3);
  const palette = [0xdfe6ec, 0xc9dbe8, 0xf1e7d6, 0xb7cfe0, 0xe9edf0, 0xd8e8d6];
  const c = palette[Math.floor(r(1) * palette.length)]!;
  addFacadeBox(cb.facade, m, w, h, d, c, 3, 3.4);
  const b = cb.toon;
  const prev = b.surface;
  b.surface = SURF.satin;
  // Far away and in haze: sharp, cheap ledges.
  const bevel = b.boxBevel;
  b.boxBevel = 0;
  for (let y = 13.6; y < h - 2; y += 13.6)
    b.primIn(m, 'box', 0, y, 0, w + 0.2, 0.22, d + 0.2, shade(c, 0.88));
  if (r(2) > 0.5) {
    // Setback crown
    addFacadeBox(
      cb.facade,
      new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, h, 0)),
      w * 0.7,
      h * 0.12,
      d * 0.7,
      c,
      3,
      3.4,
    );
    b.surface = SURF.steel;
    b.primIn(m, 'cyl6', 0, h * 1.12 + 4, 0, 0.3, 8, 0.3, 0xd0d4d8);
  } else {
    b.surface = SURF.plaster;
    b.primIn(m, 'box', 0, h + 0.6, 0, w + 0.4, 1.2, d + 0.4, shade(c, 0.85));
  }
  b.boxBevel = bevel;
  b.surface = prev;
}
