/**
 * Normals for hard-surface parts: area-weighted face normals averaged across edges flatter than
 * the crease angle, split where sharper. Area weighting keeps big flat faces flat next to narrow
 * bevels (the usual "weighted normals" look of good game props). Identical corners are welded.
 */
import { Mesh } from './mesh';

function key(x: number, y: number, z: number, q: number): string {
  return `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
}

/** Recompute normals with a crease angle (degrees) and weld identical vertices. */
export function creaseNormals(m: Mesh, creaseDeg = 40, eps = 1e-5): Mesh {
  const cos = Math.cos((creaseDeg * Math.PI) / 180);
  const T = m.triangleCount;
  const fn = new Float64Array(T * 3); // unit face normals
  const fa = new Float64Array(T * 3); // area-weighted face normals
  for (let t = 0; t < T; t++) {
    const a = m.idx[t * 3]! * 3;
    const b = m.idx[t * 3 + 1]! * 3;
    const c = m.idx[t * 3 + 2]! * 3;
    const ux = m.pos[b]! - m.pos[a]!;
    const uy = m.pos[b + 1]! - m.pos[a + 1]!;
    const uz = m.pos[b + 2]! - m.pos[a + 2]!;
    const vx = m.pos[c]! - m.pos[a]!;
    const vy = m.pos[c + 1]! - m.pos[a + 1]!;
    const vz = m.pos[c + 2]! - m.pos[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fa[t * 3] = nx;
    fa[t * 3 + 1] = ny;
    fa[t * 3 + 2] = nz;
    fn[t * 3] = nx / l;
    fn[t * 3 + 1] = ny / l;
    fn[t * 3 + 2] = nz / l;
  }
  // Group corners by position.
  const groups = new Map<string, number[]>();
  const cornerKey: string[] = new Array(T * 3);
  for (let c = 0; c < T * 3; c++) {
    const v = m.idx[c]! * 3;
    const k = key(m.pos[v]!, m.pos[v + 1]!, m.pos[v + 2]!, eps);
    cornerKey[c] = k;
    let g = groups.get(k);
    if (!g) {
      g = [];
      groups.set(k, g);
    }
    g.push(c);
  }
  const out = new Mesh();
  out.hasUv = m.hasUv;
  if (m.joints) {
    out.joints = [];
    out.weights = [];
  }
  const weld = new Map<string, number>();
  for (let c = 0; c < T * 3; c++) {
    const t = (c / 3) | 0;
    const g = groups.get(cornerKey[c]!)!;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const o of g) {
      const u = (o / 3) | 0;
      if (fn[t * 3]! * fn[u * 3]! + fn[t * 3 + 1]! * fn[u * 3 + 1]! + fn[t * 3 + 2]! * fn[u * 3 + 2]! < cos)
        continue;
      nx += fa[u * 3]!;
      ny += fa[u * 3 + 1]!;
      nz += fa[u * 3 + 2]!;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const v = m.idx[c]!;
    const wk = [
      cornerKey[c],
      Math.round(nx * 1000),
      Math.round(ny * 1000),
      Math.round(nz * 1000),
      Math.round(m.col[v * 3]! * 4096),
      Math.round(m.col[v * 3 + 1]! * 4096),
      Math.round(m.col[v * 3 + 2]! * 4096),
      Math.round(m.surf[v * 4]! * 255),
      Math.round(m.surf[v * 4 + 1]! * 255),
      Math.round(m.surf[v * 4 + 2]! * 255),
      Math.round(m.uv[v * 2]! * 8192),
      Math.round(m.uv[v * 2 + 1]! * 8192),
      m.joints ? m.joints.slice(v * 4, v * 4 + 4).join('.') : '',
    ].join('|');
    let ni = weld.get(wk);
    if (ni === undefined) {
      ni = out.vertexCount;
      weld.set(wk, ni);
      out.pos.push(m.pos[v * 3]!, m.pos[v * 3 + 1]!, m.pos[v * 3 + 2]!);
      out.nor.push(nx, ny, nz);
      out.col.push(m.col[v * 3]!, m.col[v * 3 + 1]!, m.col[v * 3 + 2]!);
      out.surf.push(m.surf[v * 4]!, m.surf[v * 4 + 1]!, m.surf[v * 4 + 2]!, m.surf[v * 4 + 3]!);
      out.uv.push(m.uv[v * 2]!, m.uv[v * 2 + 1]!);
      if (m.joints && m.weights && out.joints && out.weights) {
        for (let k = 0; k < 4; k++) {
          out.joints.push(m.joints[v * 4 + k]!);
          out.weights.push(m.weights[v * 4 + k]!);
        }
      }
    }
    out.idx.push(ni);
  }
  // Drop degenerate triangles.
  const idx = out.idx.slice();
  out.idx.length = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]!;
    const b = idx[t + 1]!;
    const c = idx[t + 2]!;
    if (a !== b && b !== c && a !== c) out.idx.push(a, b, c);
  }
  return out;
}
