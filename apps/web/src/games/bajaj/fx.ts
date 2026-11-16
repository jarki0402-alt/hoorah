/**
 * Effects: one pooled particle system per blend mode (smoke/dust/steam vs. sparks/flames),
 * floating kardus item boxes, oil slicks, horn shockwave rings, skid marks and blob shadows.
 * Everything is pooled and instanced: a handful of draw calls whatever happens on track.
 */
import * as THREE from 'three';
import { GeoBuilder, hash01 } from './geo';
import type { Hazard, ItemBox, Projectile } from './logic';

/* ------------------------------------------------------------------ particles */

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(220.0, aSize * projectionMatrix[1][1] * uScale / max(0.1, -mv.z));
  vColor = aColor;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, uSoft, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

export interface SpawnOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  size1?: number;
  color: THREE.Color | number;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly a0: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private next = 0;
  private alive = 0;
  readonly uniforms = { uScale: { value: 360 }, uSoft: { value: 0.1 } };
  private readonly tmpC = new THREE.Color();

  constructor(
    readonly max: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms.uSoft.value = additive ? 0.0 : 0.22;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  spawn(o: SpawnOpts): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx ?? 0;
    this.vel[i * 3 + 1] = o.vy ?? 0;
    this.vel[i * 3 + 2] = o.vz ?? 0;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.s0[i] = o.size;
    this.s1[i] = o.size1 ?? o.size;
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    const c = typeof o.color === 'number' ? this.tmpC.setHex(o.color) : o.color;
    this.col[i * 4] = c.r;
    this.col[i * 4 + 1] = c.g;
    this.col[i * 4 + 2] = c.b;
    this.alive = Math.max(this.alive, 1);
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let any = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i]! <= 0) {
        if (this.size[i] !== 0) this.size[i] = 0;
        continue;
      }
      any++;
      const l = this.life[i]! - dt;
      this.life[i] = l;
      if (l <= 0) {
        this.size[i] = 0;
        continue;
      }
      const t = 1 - l / this.maxLife[i]!;
      const k = Math.max(0, 1 - this.drag[i]! * dt);
      this.vel[i * 3]! *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * k - this.grav[i]! * dt;
      this.vel[i * 3 + 2]! *= k;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
      this.size[i] = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t;
      this.col[i * 4 + 3] = this.a0[i]! * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
    this.alive = any;
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Pixel scale for the current viewport (half its height in device px). */
  setViewportHeight(px: number): void {
    this.uniforms.uScale.value = px * 0.5;
  }
}

/* ------------------------------------------------------------------ item boxes */

export class BoxField {
  readonly mesh: THREE.InstancedMesh;
  readonly ring: THREE.InstancedMesh;
  private readonly scale: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    private readonly boxes: readonly ItemBox[],
    kardus: THREE.Texture,
  ) {
    const g = new THREE.BoxGeometry(1.15, 1.15, 1.15);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ map: kardus }), boxes.length);
    this.mesh.frustumCulled = false;
    // A soft yellow halo ring under each box so rows read from far away.
    const rg = new THREE.RingGeometry(0.55, 0.85, 24);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.InstancedMesh(
      rg,
      new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.55, depthWrite: false }),
      boxes.length,
    );
    this.ring.frustumCulled = false;
    this.scale = new Float32Array(boxes.length).fill(1);
  }

  update(t: number, dt: number): void {
    this.boxes.forEach((b, i) => {
      const target = b.active ? 1 : 0;
      const sp = b.active ? 5 : 14;
      this.scale[i] = this.scale[i]! + (target - this.scale[i]!) * Math.min(1, dt * sp);
      const k = this.scale[i]!;
      const pop = b.active && k < 0.98 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1;
      this.e.set(0.35, t * 1.6 + i * 0.7, 0.2);
      this.q.setFromEuler(this.e);
      this.p.set(b.x, b.y + 1.25 + Math.sin(t * 2.4 + i) * 0.16, b.z);
      this.s.setScalar(Math.max(0.0001, k * pop));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.q.identity();
      this.p.set(b.x, b.y + 0.05, b.z);
      this.s.setScalar(Math.max(0.0001, k * (1 + Math.sin(t * 3 + i) * 0.08)));
      this.m.compose(this.p, this.q, this.s);
      this.ring.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.ring.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ oil slicks */

function slickGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const n = 18;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1.35 + Math.sin(a * 3) * 0.22 + hash01(i) * 0.25;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[(i + 1) % n]!;
    b.tri([0, 0, 0], [x1, 0, z1], [x0, 0, z0], 0x15171b);
  }
  // Sheen
  for (let i = 0; i < 8; i++) {
    const a0 = 0.6 + i * 0.12;
    const a1 = a0 + 0.12;
    b.tri(
      [0.2, 0.004, -0.1],
      [Math.cos(a1) * 0.8, 0.004, Math.sin(a1) * 0.8],
      [Math.cos(a0) * 0.8, 0.004, Math.sin(a0) * 0.8],
      0x3d4650,
    );
  }
  b.prim('sphereMd', -0.4, 0.01, 0.35, 0.35, 0.02, 0.18, 0x9aa7b3);
  return b.build();
}

export class OilField {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(max: number) {
    this.mesh = new THREE.InstancedMesh(
      slickGeometry(),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
      max,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(oils: readonly Hazard[], raceT: number): void {
    const list = oils.filter((o) => o.kind === 'oil');
    const n = Math.min(list.length, this.mesh.instanceMatrix.count);
    list.slice(0, n).forEach((o, i) => {
      const age = (raceT - o.born) / 1000;
      const k = Math.min(1, age / 0.35) * Math.min(1, o.life / 0.6);
      this.q.setFromAxisAngle(this.up, o.id * 1.7);
      this.p.set(o.x, o.y + 0.03, o.z);
      this.s.set(k, 1, k);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ horn rings */

export class HornRings {
  readonly group = new THREE.Group();
  private readonly rings: { mesh: THREE.Mesh; t: number; delay: number; x: number; y: number; z: number }[] =
    [];

  constructor() {
    const g = new THREE.RingGeometry(0.86, 1, 48);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xff8a3d : 0xffc928,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.rings.push({ mesh, t: -1, delay: 0, x: 0, y: 0, z: 0 });
    }
  }

  blast(x: number, y: number, z: number): void {
    let n = 0;
    for (const r of this.rings) {
      if (r.t >= 0) continue;
      r.t = 0;
      r.delay = n * 0.12;
      r.x = x;
      r.y = y;
      r.z = z;
      if (++n >= 3) break;
    }
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (r.t < 0) continue;
      r.t += dt;
      const t = (r.t - r.delay) / 0.55;
      if (t < 0) continue;
      if (t >= 1) {
        r.t = -1;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.visible = true;
      const rad = 1 + t * 12.5;
      r.mesh.position.set(r.x, r.y + 0.6 + t * 0.8, r.z);
      r.mesh.scale.set(rad, 1, rad);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    }
  }
}

/* ------------------------------------------------------------------ skid marks */

export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private readonly born: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(private readonly max = 600) {
    const g = new THREE.PlaneGeometry(0.22, 0.7);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(
      g,
      new THREE.MeshBasicMaterial({
        color: 0x1b1c20,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      max,
    );
    this.mesh.frustumCulled = false;
    this.born = new Float32Array(max).fill(-1e9);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this.m);
  }

  add(x: number, y: number, z: number, heading: number, t: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.q.setFromAxisAngle(this.up, heading);
    this.m.compose(this.p.set(x, y + 0.025, z), this.q, this.s.set(1, 1, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.born[i] = t;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ blob shadows */

export class Shadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(count: number, tex: THREE.Texture) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(
      g,
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5,
      }),
      count,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  set(i: number, x: number, y: number, z: number, heading: number, w: number, l: number): void {
    this.q.setFromAxisAngle(this.up, heading);
    this.m.compose(this.p.set(x, y + 0.04, z), this.q, this.s.set(w, 1, l));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ throwables */

function durianGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.prim('sphereLo', 0, 0, 0, 0.9, 0.85, 0.9, 0xb5d152);
  const ico = new THREE.IcosahedronGeometry(1, 1);
  const p = ico.getAttribute('position') as THREE.BufferAttribute;
  const up = new THREE.Vector3(0, 1, 0);
  const seen = new Set<string>();
  for (let i = 0; i < p.count; i++) {
    const n = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const key = `${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = new THREE.Matrix4().compose(
      n.clone().multiplyScalar(0.44),
      new THREE.Quaternion().setFromUnitVectors(up, n),
      new THREE.Vector3(0.13, 0.22, 0.13),
    );
    b.addGeometry(new THREE.ConeGeometry(0.5, 1, 5), m, 0x7fa82e);
  }
  b.prim('cyl6', 0, 0.5, 0, 0.07, 0.16, 0.07, 0x6b4423);
  return b.build();
}

function petasanGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // A fat red cracker on its side, gold bands, a fuse at the back; points along +z.
  b.prim('cyl12', 0, 0, 0, 0.42, 1.25, 0.42, 0xf2453d, Math.PI / 2, 0, 0);
  for (const z of [-0.5, 0, 0.5]) b.prim('cyl12', 0, 0, z, 0.45, 0.1, 0.45, 0xffc928, Math.PI / 2, 0, 0);
  b.prim('cone8', 0, 0, 0.78, 0.42, 0.32, 0.42, 0xffc928, Math.PI / 2, 0, 0);
  b.prim('cyl6', 0, 0.08, -0.72, 0.05, 0.3, 0.05, 0x2a2b30, Math.PI / 2 - 0.4, 0, 0);
  return b.build();
}

/** Pool of thrown durians, petasan and durians lying on the road. */
export class Throwables {
  readonly group = new THREE.Group();
  private readonly durians: THREE.Mesh[] = [];
  private readonly petasan: THREE.Mesh[] = [];
  private readonly traps: THREE.Mesh[] = [];

  constructor(mat: THREE.Material, max = 12) {
    const dg = durianGeometry();
    const pg = petasanGeometry();
    for (let i = 0; i < max; i++) {
      const d = new THREE.Mesh(dg, mat);
      const p = new THREE.Mesh(pg, mat);
      const t = new THREE.Mesh(dg, mat);
      for (const m of [d, p, t]) {
        m.visible = false;
        this.group.add(m);
      }
      this.durians.push(d);
      this.petasan.push(p);
      this.traps.push(t);
    }
  }

  update(projectiles: readonly Projectile[], hazards: readonly Hazard[], alpha: number, timeS: number): void {
    let di = 0;
    let pi = 0;
    for (const p of projectiles) {
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      const z = p.prevZ + (p.z - p.prevZ) * alpha;
      const yaw = Math.atan2(p.x - p.prevX, p.z - p.prevZ);
      if (p.kind === 'durian') {
        const m = this.durians[di++];
        if (!m) continue;
        m.visible = true;
        m.position.set(x, y, z);
        m.rotation.set(timeS * 14, yaw, 0);
      } else {
        const m = this.petasan[pi++];
        if (!m) continue;
        m.visible = true;
        m.position.set(x, y + Math.sin(timeS * 30) * 0.05, z);
        m.rotation.set(0, yaw, Math.sin(timeS * 22) * 0.2);
      }
    }
    for (; di < this.durians.length; di++) this.durians[di]!.visible = false;
    for (; pi < this.petasan.length; pi++) this.petasan[pi]!.visible = false;
    let ti = 0;
    for (const h of hazards) {
      if (h.kind !== 'durian') continue;
      const m = this.traps[ti++];
      if (!m) break;
      m.visible = true;
      m.position.set(h.x, h.y + 0.42, h.z);
      m.rotation.set(0, h.id * 1.3, 0);
    }
    for (; ti < this.traps.length; ti++) this.traps[ti]!.visible = false;
  }
}

/** Arena: three little lamps over every bajaj, lit for each life left. */
export class LifeLamps {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly on = new THREE.Color(0xffc928);
  private readonly off = new THREE.Color(0x3a3b40);
  private readonly blink = new THREE.Color(0xf2453d);

  constructor(karts: number) {
    const b = new GeoBuilder();
    b.prim('sphereLo', 0, 0, 0, 0.36, 0.36, 0.36, 0xffffff);
    b.prim('cyl8', 0, -0.24, 0, 0.26, 0.12, 0.26, 0x2a2b30);
    this.mesh = new THREE.InstancedMesh(
      b.build(),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
      karts * 3,
    );
    this.mesh.frustumCulled = false;
    for (let i = 0; i < karts * 3; i++) this.mesh.setColorAt(i, this.on);
  }

  set(
    kart: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    lives: number,
    visible: boolean,
    flash: boolean,
  ): void {
    for (let j = 0; j < 3; j++) {
      const i = kart * 3 + j;
      const off = (j - 1) * 0.5;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      this.p.set(x + Math.cos(yaw) * off, y + 2.55, z - Math.sin(yaw) * off);
      this.s.setScalar(visible ? 1 : 0.0001);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, j < lives ? this.on : flash && j === lives ? this.blink : this.off);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
