/**
 * Levels of detail for finished meshes: weld by position (so hard edges do not become holes),
 * decimate with quadric errors, carry colour, surface and occlusion over from the surviving
 * vertices, then rebuild crease normals.
 */
import { Mesh } from './mesh';
import { creaseNormals } from './normals';
import { simplify } from './simplify';

export function decimate(m: Mesh, targetTris: number, creaseDeg = 40): Mesh {
  if (m.triangleCount <= targetTris) return m.clone();
  const map = new Map<string, number>();
  const rep: number[] = [];
  const pos: number[] = [];
  const remap: number[] = [];
  for (let i = 0; i < m.vertexCount; i++) {
    const k = `${Math.round(m.pos[i * 3]! * 1e5)},${Math.round(m.pos[i * 3 + 1]! * 1e5)},${Math.round(m.pos[i * 3 + 2]! * 1e5)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = rep.length;
      map.set(k, j);
      rep.push(i);
      pos.push(m.pos[i * 3]!, m.pos[i * 3 + 1]!, m.pos[i * 3 + 2]!);
    }
    remap.push(j);
  }
  const idx: number[] = [];
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = remap[m.idx[t]!]!;
    const b = remap[m.idx[t + 1]!]!;
    const c = remap[m.idx[t + 2]!]!;
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const s = simplify(pos, idx, targetTris, { border: 20 });
  const out = new Mesh();
  out.hasUv = m.hasUv;
  for (let i = 0; i < s.source.length; i++) {
    const o = rep[s.source[i]!]!;
    out.pos.push(s.pos[i * 3]!, s.pos[i * 3 + 1]!, s.pos[i * 3 + 2]!);
    out.nor.push(m.nor[o * 3]!, m.nor[o * 3 + 1]!, m.nor[o * 3 + 2]!);
    out.col.push(m.col[o * 3]!, m.col[o * 3 + 1]!, m.col[o * 3 + 2]!);
    out.surf.push(m.surf[o * 4]!, m.surf[o * 4 + 1]!, m.surf[o * 4 + 2]!, m.surf[o * 4 + 3]!);
    out.uv.push(m.uv[o * 2]!, m.uv[o * 2 + 1]!);
  }
  for (const i of s.idx) out.idx.push(i);
  return creaseNormals(out, creaseDeg);
}
