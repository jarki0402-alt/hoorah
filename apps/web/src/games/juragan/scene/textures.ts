/** Procedural textures for the tabletop: teak planks, dice faces and the Kabar card back. */
import * as THREE from 'three';
import { KABAR_NAME } from '../strings';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Warm teak planks running away from the camera, with grain and knots. Tiles seamlessly. */
export function woodTexture(size = 1024): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  if (ctx) {
    const rnd = seeded(29);
    const planks = 6;
    const pw = size / planks;
    const tones = ['#7A4A28', '#83522D', '#76462A', '#8A5732', '#7E4D2B', '#875430'];
    for (let p = 0; p < planks; p++) {
      const x = p * pw;
      ctx.fillStyle = tones[p % tones.length]!;
      ctx.fillRect(x, 0, pw, size);
      // Long grain: wavy darker and lighter lines.
      for (let g = 0; g < 26; g++) {
        const gx = x + rnd() * pw;
        const amp = 2 + rnd() * 6;
        const freq = 1 + Math.floor(rnd() * 3);
        const phase = rnd() * Math.PI * 2;
        ctx.strokeStyle = rnd() < 0.6 ? 'rgba(52,26,10,0.22)' : 'rgba(255,214,160,0.08)';
        ctx.lineWidth = 0.8 + rnd() * 2.2;
        ctx.beginPath();
        for (let y = 0; y <= size; y += 16) {
          const xx = gx + Math.sin((y / size) * Math.PI * 2 * freq + phase) * amp;
          if (y === 0) ctx.moveTo(xx, y);
          else ctx.lineTo(xx, y);
        }
        ctx.stroke();
      }
      // A knot now and then.
      if (rnd() < 0.7) {
        const kx = x + pw * (0.3 + rnd() * 0.4);
        const ky = rnd() * size;
        for (let r = 3; r >= 1; r--) {
          ctx.strokeStyle = `rgba(48,22,8,${0.12 * r})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(kx, ky, 6 * r, 16 * r, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Seam shadow and a sheen line.
      ctx.fillStyle = 'rgba(30,14,4,0.55)';
      ctx.fillRect(x, 0, 3, size);
      ctx.fillStyle = 'rgba(255,220,170,0.08)';
      ctx.fillRect(x + 3, 0, 2, size);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Pip positions (0..1) for each face value. */
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.27, 0.27],
    [0.73, 0.73],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.5, 0.5],
    [0.26, 0.74],
    [0.74, 0.74],
  ],
  6: [
    [0.28, 0.24],
    [0.72, 0.24],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.76],
    [0.72, 0.76],
  ],
};

/** One die face: ivory with drilled pips; the 1 and the 4 are red, as on dice sold in Indonesia. */
export function diceFace(value: number, size = 256): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
    g.addColorStop(0, '#FFFBF2');
    g.addColorStop(1, '#F1E6D2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const red = value === 1 || value === 4;
    const r = value === 1 ? size * 0.14 : size * 0.085;
    for (const [px, py] of PIPS[value] ?? []) {
      const x = px * size;
      const y = py * size;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x + r * 0.12, y + r * 0.16, r * 1.06, 0, Math.PI * 2);
      ctx.fill();
      const pg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      pg.addColorStop(0, red ? '#9E1B14' : '#050506');
      pg.addColorStop(1, red ? '#D8322A' : '#2A2B30');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The back of a Kabar card: warm yellow, a folded newspaper and the word KABAR. */
export function cardBack(w = 384, h = 512): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#FFD54A');
    g.addColorStop(1, '#FFB81C');
    ctx.fillStyle = g;
    ctx.fillRect(w * 0.06, h * 0.045, w * 0.88, h * 0.91);
    ctx.strokeStyle = '#1E1F24';
    ctx.lineWidth = w * 0.02;
    ctx.strokeRect(w * 0.11, h * 0.08, w * 0.78, h * 0.84);
    // Newspaper
    ctx.save();
    ctx.translate(w / 2, h * 0.42);
    ctx.rotate(-0.12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-w * 0.22, -h * 0.15, w * 0.44, h * 0.3);
    ctx.strokeRect(-w * 0.22, -h * 0.15, w * 0.44, h * 0.3);
    ctx.fillStyle = '#1E1F24';
    ctx.fillRect(-w * 0.17, -h * 0.11, w * 0.34, h * 0.05);
    ctx.fillStyle = '#F2453D';
    ctx.fillRect(-w * 0.17, -h * 0.04, w * 0.14, h * 0.1);
    ctx.fillStyle = '#9A8F7D';
    for (let k = 0; k < 3; k++) ctx.fillRect(0, -h * 0.04 + k * h * 0.035, w * 0.17, h * 0.014);
    ctx.restore();
    ctx.fillStyle = '#1E1F24';
    ctx.font = `800 ${Math.round(w * 0.2)}px "Baloo 2", ui-rounded, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(KABAR_NAME.toUpperCase(), w / 2, h * 0.76);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * A soft contact shadow for when there is no shadow map (Smart TV level, or shadows dropped by the
 * governor): white with an alpha that stays dark up to `inner` of the half-size and fades to
 * nothing at the edge. `p` shapes it: 2 = ellipse, higher = rounder-cornered rectangle.
 */
export function softShadow(size = 64, inner = 0.3, p = 2): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = Math.abs(((x + 0.5) / size) * 2 - 1);
      const v = Math.abs(((y + 0.5) / size) * 2 - 1);
      const d = (u ** p + v ** p) ** (1 / p);
      const t = Math.min(1, Math.max(0, (d - inner) / (1 - inner)));
      const a = (1 - t * t * (3 - 2 * t)) ** 1.4;
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  const tex = new THREE.DataTexture(data, size, size);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
