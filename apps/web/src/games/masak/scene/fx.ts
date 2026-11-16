/**
 * Cheap effects: one point-sprite particle pool per station (steam, smoke, sizzle, sparkles,
 * food bits) and instanced toon flames. Everything is CPU-simulated on small fixed pools.
 */
import * as THREE from 'three';
import { basic, rand } from './kit';

/* ------------------------------------------------------------------ particles */

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aShape;
attribute vec3 color;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  vColor = color;
  vAlpha = aAlpha;
  vShape = aShape;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a;
  if (vShape < 0.5) {
    a = (1.0 - smoothstep(0.15, 1.0, d)) * 0.9;
  } else if (vShape < 1.5) {
    a = 1.0 - smoothstep(0.7, 1.0, d);
  } else {
    float arm = min(abs(p.x), abs(p.y));
    float star = (1.0 - smoothstep(0.0, 0.07, arm)) * (1.0 - smoothstep(0.2, 1.0, d));
    a = max(star, 1.0 - smoothstep(0.12, 0.3, d));
  }
  a *= vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
`;

let sharedMat: THREE.ShaderMaterial | null = null;

/** One material for every pool; `uScale` is set per viewport before rendering. */
export function particleMaterial(): THREE.ShaderMaterial {
  if (sharedMat) return sharedMat;
  sharedMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uScale: { value: 400 } },
    transparent: true,
    depthWrite: false,
  });
  return sharedMat;
}

export type Shape = 0 | 1 | 2;

export interface Emit {
  x: number;
  y: number;
  z: number;
  /** Random spread of the start position (radius in the XZ plane, and in Y). */
  spread?: number;
  spreadY?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Random extra velocity magnitude. */
  jitter?: number;
  color: number;
  /** Second colour: each particle picks a random mix. */
  color2?: number;
  size: number;
  /** Size multiplier at the end of life. */
  grow?: number;
  life: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
  shape?: Shape;
  /** Stop at this height (food bits landing on a surface). */
  floor?: number;
}

const ATTRS = ['position', 'color', 'aSize', 'aAlpha', 'aShape'] as const;
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

export class Particles {
  readonly points: THREE.Points;
  private readonly cap: number;
  private n = 0;
  private seed = 1;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly shape: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly base: Float32Array;
  private readonly grow: Float32Array;
  private readonly a0: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly floor: Float32Array;
  /** The one-value-per-particle arrays, moved together when a particle dies. */
  private readonly scalars: Float32Array[];
  private readonly attrs: THREE.BufferAttribute[];
  private readonly geo: THREE.BufferGeometry;
  /** Share of requested particles actually spawned (lower on weak devices). */
  density = 1;
  /** Fractional particles carried over between emits when `density` < 1. */
  private owed = 0;

  constructor(cap = 240) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.shape = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.base = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.floor = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.scalars = [
      this.size,
      this.alpha,
      this.shape,
      this.age,
      this.life,
      this.base,
      this.grow,
      this.a0,
      this.grav,
      this.drag,
      this.floor,
    ];
    this.attrs = ATTRS.map((name) => g.getAttribute(name) as THREE.BufferAttribute);
    this.points = new THREE.Points(g, particleMaterial());
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  private r(): number {
    return rand(this.seed++);
  }

  emit(e: Emit, count = 1): void {
    let n = count;
    if (this.density < 1) {
      this.owed += count * this.density;
      n = Math.floor(this.owed);
      this.owed -= n;
    }
    for (let k = 0; k < n; k++) {
      if (this.n >= this.cap) this.kill(0);
      const i = this.n++;
      const ang = this.r() * Math.PI * 2;
      const rad = (e.spread ?? 0) * Math.sqrt(this.r());
      this.pos[i * 3] = e.x + Math.cos(ang) * rad;
      this.pos[i * 3 + 1] = e.y + (this.r() - 0.5) * 2 * (e.spreadY ?? 0);
      this.pos[i * 3 + 2] = e.z + Math.sin(ang) * rad;
      const j = e.jitter ?? 0;
      const ja = this.r() * Math.PI * 2;
      const jb = this.r() * 2 - 1;
      const js = Math.sqrt(1 - jb * jb);
      this.vel[i * 3] = (e.vx ?? 0) + Math.cos(ja) * js * j;
      this.vel[i * 3 + 1] = (e.vy ?? 0) + Math.abs(jb) * j;
      this.vel[i * 3 + 2] = (e.vz ?? 0) + Math.sin(ja) * js * j;
      _c1.setHex(e.color);
      if (e.color2 !== undefined) _c1.lerp(_c2.setHex(e.color2), this.r());
      this.col[i * 3] = _c1.r;
      this.col[i * 3 + 1] = _c1.g;
      this.col[i * 3 + 2] = _c1.b;
      this.base[i] = e.size * (0.75 + this.r() * 0.5);
      this.size[i] = this.base[i]!;
      this.grow[i] = e.grow ?? 1;
      this.a0[i] = e.alpha ?? 1;
      this.alpha[i] = 0;
      this.shape[i] = e.shape ?? 0;
      this.age[i] = 0;
      this.life[i] = e.life * (0.75 + this.r() * 0.5);
      this.grav[i] = e.gravity ?? 0;
      this.drag[i] = e.drag ?? 0;
      this.floor[i] = e.floor ?? -100;
    }
  }

  private kill(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.copy3(this.pos, i, last);
    this.copy3(this.col, i, last);
    this.copy3(this.vel, i, last);
    for (const a of this.scalars) a[i] = a[last]!;
  }

  private copy3(a: Float32Array, i: number, from: number): void {
    a[i * 3] = a[from * 3]!;
    a[i * 3 + 1] = a[from * 3 + 1]!;
    a[i * 3 + 2] = a[from * 3 + 2]!;
  }

  clear(): void {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }

  update(dt: number): void {
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < this.n; ) {
      this.age[i] = this.age[i]! + d;
      const t = this.age[i]! / this.life[i]!;
      if (t >= 1) {
        this.kill(i);
        continue;
      }
      const k = Math.exp(-this.drag[i]! * d);
      this.vel[i * 3] = this.vel[i * 3]! * k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * k - this.grav[i]! * d;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2]! * k;
      this.pos[i * 3] = this.pos[i * 3]! + this.vel[i * 3]! * d;
      this.pos[i * 3 + 1] = this.pos[i * 3 + 1]! + this.vel[i * 3 + 1]! * d;
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + this.vel[i * 3 + 2]! * d;
      if (this.pos[i * 3 + 1]! < this.floor[i]!) {
        this.pos[i * 3 + 1] = this.floor[i]!;
        this.vel[i * 3] = 0;
        this.vel[i * 3 + 1] = 0;
        this.vel[i * 3 + 2] = 0;
      }
      this.size[i] = this.base[i]! * (1 + (this.grow[i]! - 1) * t);
      const fadeIn = Math.min(1, t * 8);
      const fadeOut = 1 - t * t;
      this.alpha[i] = this.a0[i]! * fadeIn * fadeOut;
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const attr of this.attrs) {
      attr.needsUpdate = true;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.n * attr.itemSize);
    }
  }

  /* -------------------------------------------------------------- presets */

  steam(x: number, y: number, z: number, spread = 0.08, strength = 1): void {
    this.emit({
      x,
      y,
      z,
      spread,
      vy: 0.18 * strength,
      jitter: 0.03,
      color: 0xffffff,
      size: 0.034 * strength,
      grow: 3.2,
      life: 1.5,
      alpha: 0.22,
      drag: 0.4,
      shape: 0,
    });
  }

  smoke(x: number, y: number, z: number, dark = 0.5): void {
    const c = dark > 0.7 ? 0x3a3533 : dark > 0.35 ? 0x77706b : 0xb7b0aa;
    this.emit({
      x,
      y,
      z,
      spread: 0.05,
      vy: 0.14,
      jitter: 0.03,
      color: c,
      size: 0.06,
      grow: 2.8,
      life: 1.8,
      alpha: 0.5,
      drag: 0.3,
      shape: 0,
    });
  }

  sizzle(x: number, y: number, z: number, spread: number, count = 3): void {
    this.emit(
      {
        x,
        y,
        z,
        spread,
        vy: 0.45,
        jitter: 0.35,
        color: 0xfff6d0,
        color2: 0xffd36a,
        size: 0.008,
        life: 0.35,
        gravity: 3.2,
        shape: 1,
      },
      count,
    );
  }

  sparkle(x: number, y: number, z: number, spread: number, count = 14): void {
    this.emit(
      {
        x,
        y,
        z,
        spread,
        spreadY: 0.04,
        vy: 0.35,
        jitter: 0.5,
        color: 0xffe066,
        color2: 0xffffff,
        size: 0.05,
        grow: 0.3,
        life: 0.9,
        drag: 2.2,
        gravity: 0.2,
        shape: 2,
      },
      count,
    );
  }

  embers(x: number, y: number, z: number, spread: number, count = 6): void {
    this.emit(
      {
        x,
        y,
        z,
        spread,
        vy: 0.5,
        jitter: 0.25,
        color: 0xffa21a,
        color2: 0xffe27a,
        size: 0.01,
        grow: 0.4,
        life: 1.1,
        drag: 0.8,
        gravity: -0.1,
        shape: 1,
      },
      count,
    );
  }

  bits(x: number, y: number, z: number, color: number, count = 5, floor = -100, color2?: number): void {
    this.emit(
      {
        x,
        y,
        z,
        spread: 0.02,
        vy: 0.55,
        jitter: 0.45,
        color,
        ...(color2 !== undefined ? { color2 } : {}),
        size: 0.008,
        life: 0.55,
        gravity: 5,
        shape: 1,
        floor,
      },
      count,
    );
  }
}

/* ------------------------------------------------------------------ flames */

function flameGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const y = i / N;
    // Round bulb at the bottom, long curling tip.
    const r = 0.36 * Math.sin(Math.PI * Math.min(1, y * 1.6 + 0.12)) ** 0.8 * (1 - y) ** 0.6 + 0.004;
    pts.push(new THREE.Vector2(r, y));
  }
  const g = new THREE.LatheGeometry(pts, 10);
  g.translate(0, -0.05, 0);
  // Hot yellow base, orange body, red tip.
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const a = new THREE.Color(0xffe45a);
  const b = new THREE.Color(0xff9a1f);
  const d = new THREE.Color(0xf2452a);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.05;
    if (y < 0.45) c.copy(a).lerp(b, y / 0.45);
    else c.copy(b).lerp(d, (y - 0.45) / 0.55);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

let flameGeo: THREE.BufferGeometry | null = null;

const _m4 = new THREE.Matrix4();
const _q4 = new THREE.Quaternion();
const _e4 = new THREE.Euler();
const _p4 = new THREE.Vector3();
const _s4 = new THREE.Vector3();

/** A ring (or line) of flickering cartoon flame tongues, yellow at the base, red at the tip. */
export class Flames {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly spots: { x: number; z: number; a: number; tilt: number; seed: number }[] = [];

  constructor(
    count: number,
    layout: 'ring' | 'line',
    size: number,
    private readonly height: number,
    /** Tongue width as a share of the height (fat campfire vs. thin licks). */
    private readonly widthK = 0.55,
    tilt = 0.35,
  ) {
    flameGeo ??= flameGeometry();
    this.mesh = new THREE.InstancedMesh(flameGeo, basic(0xffffff, { vertexColors: true }), count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.group.add(this.mesh);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      if (layout === 'ring') {
        this.spots.push({ x: Math.cos(a) * size, z: Math.sin(a) * size, a, tilt, seed: i * 7 + 3 });
      } else {
        const x = (i / Math.max(1, count - 1) - 0.5) * size;
        this.spots.push({ x, z: (rand(i + 11) - 0.5) * 0.05, a: 0, tilt: 0, seed: i * 7 + 3 });
      }
    }
  }

  /** `intensity` 0 = off, 1 = normal, 2 = roaring. */
  update(t: number, intensity: number): void {
    const vis = intensity > 0.02;
    this.group.visible = vis;
    if (!vis) return;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i]!;
      const flick = 0.75 + 0.25 * Math.sin(t * 17 + s.seed) * Math.sin(t * 7.3 + s.seed * 1.7);
      const h = this.height * intensity * flick;
      const w = this.height * (this.widthK + 0.25 * Math.min(1.5, intensity) * (this.widthK / 0.55));
      _e4.set(Math.sin(s.a) * s.tilt * -1, 0, Math.cos(s.a) * s.tilt);
      _q4.setFromEuler(_e4);
      _p4.set(s.x, 0, s.z);
      _s4.set(w, h, w);
      this.mesh.setMatrixAt(i, _m4.compose(_p4, _q4, _s4));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
