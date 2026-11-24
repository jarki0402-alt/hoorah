/**
 * Seluncur Es 3D world on the shared box-world stage: a round ice floe on a cold dark sea, seen
 * from above at a slant. Blocky fruit skaters stand on it; while aiming each one shows a dotted
 * aim line (faded while the thumb is still searching, solid once locked) and a power arc around
 * the feet. The rim that breaks after this shot is tinted and cracked; when it breaks, sector
 * chunks drift away and sink while the floe shrinks. Splashes leave ripples on the water.
 */
import { sameLook } from '@hoorah/protocol';
import * as THREE from 'three';
import { BlockAvatar } from '../../shared/kotak/render/avatar';
import { KotakFx } from '../../shared/kotak/render/fx';
import { KotakStage, type ShadowTier, type StageLook } from '../../shared/kotak/render/stage';
import { faceYaw } from '../../shared/kotak/sim';
import type { GfxTier } from '../common/gfx';
import { type EsMatch, PHYS, REACH, type Skater, type Vec } from './logic';

const LOOK: StageLook = {
  sky: '#0B2C3D',
  fog: { color: '#0B2C3D', near: 26, far: 60 },
  sun: { color: '#FFFFFF', intensity: 2.4, dir: [-0.35, 1, 0.5] },
  hemi: { sky: '#E1F2F8', ground: '#1C5468', intensity: 1.2 },
};

const ICE_TOP = '#EEF8FC';
const ICE_SIDE = '#8ECFE3';
const ICE_DEEP = '#3F8FAB';
const SEA = '#1C5468';
const SLAB = 0.7;
const DOTS = 18;
const DOT_GAP = 0.48;
const TILT = (57 * Math.PI) / 180;

/** Jagged rim: a fixed wobble of the radius by angle (the same on every floe size). */
function rimWobble(a: number): number {
  return 1 + 0.03 * Math.sin(7 * a + 0.4) + 0.018 * Math.sin(13 * a + 2.1) + 0.01 * Math.sin(29 * a);
}

function iceTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d')!;
  g.fillStyle = ICE_TOP;
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Skate scratches and frost speckles.
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const a = rnd() * Math.PI;
    const l = 20 + rnd() * 70;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(142,207,227,0.35)' : 'rgba(255,255,255,0.8)';
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + 6,
      y + Math.sin(a) * l * 0.5 - 6,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    );
    g.stroke();
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rnd() < 0.6 ? 'rgba(255,255,255,0.9)' : 'rgba(191,230,242,0.6)';
    g.fillRect(rnd() * 512, rnd() * 512, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Unit-radius floe slab with a jagged rim, top at y = 0. */
function floeGeometry(): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(1, 0.9, SLAB, 96, 1);
  geo.translate(0, -SLAB / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const k = rimWobble(Math.atan2(z, x));
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A flat band between two radii, as a ring geometry lying on the ice. */
function bandGeometry(inner: number, outer: number): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(inner, outer, 96, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** The crack line at radius `r` plus zig-zag cracks running out to `outer`, as thin flat quads. */
function crackGeometry(r: number, outer: number): THREE.BufferGeometry {
  const pts: number[] = [];
  const quad = (ax: number, az: number, bx: number, bz: number, w: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * w;
    const nz = (dx / l) * w;
    pts.push(ax - nx, 0, az - nz, bx - nx, 0, bz - nz, bx + nx, 0, bz + nz);
    pts.push(ax - nx, 0, az - nz, bx + nx, 0, bz + nz, ax + nx, 0, az + nz);
  };
  const n = 120;
  let px = 0;
  let pz = 0;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * rimWobble(a + 1.3) + Math.sin(i * 2.7) * 0.05;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (i > 0) quad(px, pz, x, z, 0.045);
    px = x;
    pz = z;
  }
  const spokes = 11;
  for (let k = 0; k < spokes; k++) {
    let a = (k / spokes) * Math.PI * 2 + 0.2;
    let rr = r;
    let x0 = Math.cos(a) * rr;
    let z0 = Math.sin(a) * rr;
    const steps = 3;
    for (let s = 1; s <= steps; s++) {
      rr = r + ((outer - r) * s) / steps;
      a += (s % 2 ? 0.05 : -0.05) * (r / Math.max(1, rr));
      const x1 = Math.cos(a) * rr;
      const z1 = Math.sin(a) * rr;
      quad(x0, z0, x1, z1, 0.035);
      x0 = x1;
      z0 = z1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return g;
}

/** One broken piece of the rim: an annular sector slab. */
function chunkGeometry(inner: number, outer: number, a0: number, a1: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const r = outer * rimWobble(a);
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    const r = inner + Math.sin(i * 1.9) * 0.06;
    s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: SLAB * 0.9, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  return g;
}

interface Chunk {
  mesh: THREE.Mesh;
  vx: number;
  vz: number;
  spin: number;
  axis: THREE.Vector3;
  age: number;
}

interface Ripple {
  mesh: THREE.Mesh;
  age: number;
}

interface Look {
  id: number;
  avatar: BlockAvatar;
  tag: HTMLDivElement;
  arc: THREE.Mesh;
  arcMat: THREE.MeshBasicMaterial;
  color: string;
  name: string;
  fruit: string;
  look: Skater['look'];
}

export class EsScene {
  readonly stage: KotakStage;
  readonly fx: KotakFx;
  private readonly world = new THREE.Group();
  private readonly floe: THREE.Mesh;
  private readonly band: THREE.Mesh;
  private readonly bandMat: THREE.MeshBasicMaterial;
  private readonly cracks: THREE.Mesh;
  private readonly crackMat: THREE.MeshBasicMaterial;
  private readonly iceMats: THREE.Material[];
  private readonly lockedDots: THREE.InstancedMesh;
  private readonly liveDots: THREE.InstancedMesh;
  private readonly ends: THREE.InstancedMesh;
  private readonly floes: { mesh: THREE.Mesh; phase: number }[] = [];
  private readonly chunks: Chunk[] = [];
  private readonly ripples: Ripple[] = [];
  private readonly looks = new Map<number, Look>();
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly tmp = new THREE.Vector3();
  private shownEdge: number;
  private warnFor = -1;
  private camR = 8;
  private shake = 0;
  private t = 0;

  constructor(
    host: HTMLElement,
    private readonly tagHost: HTMLElement,
    level: GfxTier,
    msaa: boolean,
    shadow: ShadowTier,
    private readonly m: EsMatch,
  ) {
    this.stage = new KotakStage(host, level, msaa, shadow, LOOK);
    const scene = this.stage.scene;
    scene.add(this.world);
    this.fx = new KotakFx(level);
    scene.add(this.fx.mesh);

    // The sea, a few far floes bobbing on it.
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), this.stage.material(SEA, { rough: 0.35 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.42;
    sea.receiveShadow = true;
    this.world.add(sea);
    const small = this.stage.material('#E1F2F8', { rough: 0.5 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.4;
      const r = 13 + (i % 4) * 3.5;
      const w = 0.8 + (i % 5) * 0.35;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, w * (0.6 + (i % 3) * 0.2)), small);
      mesh.position.set(Math.cos(a) * r, -0.35, Math.sin(a) * r);
      mesh.rotation.y = a * 2.3;
      this.world.add(mesh);
      this.floes.push({ mesh, phase: i * 1.7 });
    }

    // The floe.
    const top = this.stage.material('#ffffff', { map: iceTexture(), rough: 0.25 });
    const side = this.stage.material(ICE_SIDE, { rough: 0.3 });
    const bottom = this.stage.material(ICE_DEEP, { rough: 0.5 });
    this.iceMats = [side, top, bottom];
    this.floe = new THREE.Mesh(floeGeometry(), this.iceMats);
    this.floe.castShadow = false;
    this.floe.receiveShadow = true;
    this.world.add(this.floe);
    this.shownEdge = m.edge;
    this.floe.scale.set(m.edge, 1, m.edge);

    this.bandMat = new THREE.MeshBasicMaterial({
      color: '#F2453D',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.band = new THREE.Mesh(new THREE.BufferGeometry(), this.bandMat);
    this.band.position.y = 0.01;
    this.world.add(this.band);
    this.crackMat = new THREE.MeshBasicMaterial({
      color: '#0B2C3D',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.cracks = new THREE.Mesh(new THREE.BufferGeometry(), this.crackMat);
    this.cracks.position.y = 0.015;
    this.world.add(this.cracks);

    // Aim dots (solid = locked, faded = still aiming) and the end ring of a locked aim.
    const dot = new THREE.CircleGeometry(0.11, 12);
    dot.rotateX(-Math.PI / 2);
    const n = 8 * DOTS;
    this.lockedDots = new THREE.InstancedMesh(dot, new THREE.MeshBasicMaterial({ color: '#ffffff' }), n);
    this.liveDots = new THREE.InstancedMesh(
      dot,
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }),
      n,
    );
    const ring = new THREE.RingGeometry(0.26, 0.38, 24);
    ring.rotateX(-Math.PI / 2);
    this.ends = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 8);
    for (const im of [this.lockedDots, this.liveDots, this.ends]) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.position.y = 0.03;
      this.world.add(im);
    }
  }

  /* ------------------------------------------------------------------ lineup */

  setPlayers(
    list: readonly {
      id: number;
      name: string;
      fruit: Skater['fruit'];
      look: Skater['look'];
      color: string;
    }[],
  ): void {
    const keep = new Set(list.map((p) => p.id));
    for (const [id, l] of this.looks) {
      if (keep.has(id)) continue;
      this.dropLook(l);
      this.looks.delete(id);
    }
    for (const p of list) {
      const l = this.looks.get(p.id);
      if (l && l.fruit === p.fruit && sameLook(l.look, p.look)) {
        if (l.color !== p.color) {
          l.avatar.setColor(p.color);
          l.arcMat.color.set(p.color);
          l.tag.style.setProperty('--tag', p.color);
          l.color = p.color;
        }
        if (l.name !== p.name) {
          l.tag.textContent = p.name;
          l.name = p.name;
        }
        continue;
      }
      if (l) {
        this.dropLook(l);
        this.looks.delete(p.id);
      }
      const avatar = new BlockAvatar(this.stage, p.look, p.color);
      for (const o of avatar.objects) this.world.add(o);
      const arcGeo = new THREE.RingGeometry(0.66, 0.84, 40, 1, Math.PI / 2, Math.PI * 2);
      arcGeo.rotateX(-Math.PI / 2);
      const arcMat = new THREE.MeshBasicMaterial({
        color: p.color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const arc = new THREE.Mesh(arcGeo, arcMat);
      arc.visible = false;
      this.world.add(arc);
      const tag = document.createElement('div');
      tag.className = 'kt-tag es-tag';
      tag.textContent = p.name;
      tag.style.setProperty('--tag', p.color);
      this.tagHost.appendChild(tag);
      this.looks.set(p.id, {
        id: p.id,
        avatar,
        tag,
        arc,
        arcMat,
        color: p.color,
        name: p.name,
        fruit: p.fruit,
        look: p.look,
      });
    }
  }

  private dropLook(l: Look): void {
    for (const o of l.avatar.objects) this.world.remove(o);
    l.avatar.dispose();
    this.world.remove(l.arc);
    l.arc.geometry.dispose();
    l.arcMat.dispose();
    l.tag.remove();
  }

  /* ------------------------------------------------------------------ events */

  /** The rim breaks: chunks between `to` and `from` drift away and sink; the floe shrinks. */
  crack(from: number, to: number): void {
    const k = Math.max(8, Math.round(from * 1.8));
    const offset = Math.random() * Math.PI * 2;
    for (let i = 0; i < k; i++) {
      const a0 = offset + (i / k) * Math.PI * 2 + 0.015;
      const a1 = offset + ((i + 1) / k) * Math.PI * 2 - 0.015;
      const mesh = new THREE.Mesh(chunkGeometry(to, from, a0, a1), [this.iceMats[1]!, this.iceMats[0]!]);
      const mid = (a0 + a1) / 2;
      const speed = 0.5 + Math.random() * 0.6;
      mesh.receiveShadow = true;
      this.world.add(mesh);
      this.chunks.push({
        mesh,
        vx: Math.cos(mid) * speed,
        vz: Math.sin(mid) * speed,
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35),
        axis: new THREE.Vector3(-Math.sin(mid), 0, Math.cos(mid)),
        age: 0,
      });
    }
    this.shownEdge = to;
    this.floe.scale.set(to, 1, to);
    this.clearWarning();
    this.shake = Math.max(this.shake, 0.25);
    this.fx.debris(0, 0.1, 0, to * 1.4, to * 1.4, '#BFE6F2');
  }

  splash(at: Vec): void {
    this.fx.dust(at.x, -0.3, at.y, 1.6, '#E1F2F8');
    this.fx.debris(at.x, -0.2, at.y, 0.8, 0.8, '#8ECFE3');
    const mat = new THREE.MeshBasicMaterial({
      color: '#E1F2F8',
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const geo = new THREE.RingGeometry(0.5, 0.62, 32);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(at.x, -0.4, at.y);
    this.world.add(mesh);
    this.ripples.push({ mesh, age: 0 });
  }

  hit(at: Vec, speed: number): void {
    this.fx.dust(at.x, 0.3, at.y, Math.min(1.6, speed / 4), '#FFFFFF');
    this.shake = Math.max(this.shake, Math.min(0.3, speed * 0.035));
  }

  celebrate(id: number): void {
    const p = this.m.player(id);
    if (p) this.fx.confetti(p.pos.x, 1.6, p.pos.y, 1);
  }

  /** New round: the full floe again, no leftovers. */
  resetRound(): void {
    for (const c of this.chunks) this.dropChunk(c);
    this.chunks.length = 0;
    this.shownEdge = this.m.edge;
    this.floe.scale.set(this.m.edge, 1, this.m.edge);
    this.clearWarning();
    this.fx.clear();
  }

  /** Stage-px position above a skater's head (HUD call-outs). */
  screenOf(id: number): { x: number; y: number } | null {
    const p = this.m.player(id);
    if (!p) return null;
    return this.stage.toScreen(p.pos.x, 2.3, p.pos.y, this.tmp);
  }

  /** Stage-px position of a point on the ice. */
  screenAt(at: Vec, height = 1.2): { x: number; y: number } | null {
    return this.stage.toScreen(at.x, height, at.y, this.tmp);
  }

  /* ------------------------------------------------------------------ frame */

  private clearWarning(): void {
    this.warnFor = -1;
    this.bandMat.opacity = 0;
    this.crackMat.opacity = 0;
  }

  private updateWarning(): void {
    const m = this.m;
    const show = m.phase === 'aim' || (m.phase === 'slide' && m.nextEdge < m.edge) || m.phase === 'settle';
    if (!show || m.nextEdge >= this.shownEdge - 1e-3) {
      if (this.warnFor !== -1) this.clearWarning();
      return;
    }
    const key = m.round * 100 + m.shot;
    if (this.warnFor !== key) {
      this.warnFor = key;
      this.band.geometry.dispose();
      this.band.geometry = bandGeometry(m.nextEdge, this.shownEdge * 1.02);
      this.cracks.geometry.dispose();
      this.cracks.geometry = crackGeometry(m.nextEdge, this.shownEdge * 0.98);
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    this.bandMat.opacity = 0.1 + pulse * 0.14;
    this.crackMat.opacity = 0.55 + pulse * 0.25;
  }

  private dropChunk(c: Chunk): void {
    this.world.remove(c.mesh);
    c.mesh.geometry.dispose();
  }

  private updateChunks(dt: number): void {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i]!;
      c.age += dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.position.y = -Math.max(0, c.age - 0.6) * 0.35;
      this.q.setFromAxisAngle(c.axis, c.spin * Math.min(1, c.age / 1.6));
      c.mesh.quaternion.copy(this.q);
      if (c.age > 4.5) {
        this.dropChunk(c);
        this.chunks.splice(i, 1);
      }
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.age += dt;
      const k = 1 + r.age * 3.2;
      r.mesh.scale.set(k, 1, k);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - r.age * 0.55);
      if (r.age > 1.5) {
        this.world.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.ripples.splice(i, 1);
      }
    }
  }

  private placeSkater(l: Look, p: Skater, dt: number): void {
    const m = this.m;
    const visible = p.inRound && !p.out;
    l.avatar.setVisible(visible);
    l.tag.style.visibility = visible && m.phase !== 'final' ? 'visible' : 'hidden';
    if (!visible) {
      l.arc.visible = false;
      return;
    }
    let y = 0;
    let ground: number | null = 0;
    if (p.falling !== null) {
      y = -p.falling * p.falling * 5.5;
      ground = null;
    }
    const speed = Math.hypot(p.vel.x, p.vel.y);
    const aim = p.aim ?? p.live;
    let yaw: number;
    if (speed > 0.3) yaw = faceYaw(p.vel.x, p.vel.y);
    else if (aim) yaw = faceYaw(aim.x, aim.y);
    else yaw = faceYaw(-p.pos.x, -p.pos.y);
    l.avatar.place(p.pos.x, y, p.pos.y, yaw, ground);
    const winner = m.phase === 'end' && m.standing().length === 1 && m.standing()[0] === p;
    l.avatar.pose(
      {
        run: 0,
        air: p.falling !== null || speed > 2.2,
        vy: p.falling !== null ? -3 : 1,
        stunned: p.bumped < 0.55,
        frozen: false,
        cheer: winner,
        t: this.t,
      },
      dt,
    );
    const s = this.stage.toScreen(p.pos.x, y + PHYS.radius + 1.65, p.pos.y, this.tmp);
    if (s)
      l.tag.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    l.tag.classList.toggle('is-locked', m.phase === 'aim' && p.aim !== null);

    // Power arc while aiming.
    const pow = aim ? Math.min(1, Math.hypot(aim.x, aim.y)) : 0;
    l.arc.visible = m.phase === 'aim' && pow > 0;
    if (l.arc.visible) {
      l.arc.position.set(p.pos.x, 0.025, p.pos.y);
      const idx = l.arc.geometry.index;
      const total = idx ? idx.count : 0;
      l.arc.geometry.setDrawRange(0, Math.max(6, Math.round((total * pow) / 6) * 6));
      l.arcMat.opacity = p.aim ? 0.95 : 0.55;
    }
  }

  private updateAims(): void {
    const m = this.m;
    let locked = 0;
    let live = 0;
    let ends = 0;
    if (m.phase === 'aim') {
      for (const p of m.standing()) {
        const aim = p.aim ?? p.live;
        if (!aim) continue;
        const pow = Math.min(1, Math.hypot(aim.x, aim.y));
        if (pow <= 0) continue;
        const ux = aim.x / pow;
        const uz = aim.y / pow;
        const length = pow * pow * REACH;
        const solid = p.aim !== null;
        const mesh = solid ? this.lockedDots : this.liveDots;
        this.c.set(this.looks.get(p.id)?.color ?? '#ffffff');
        for (let i = 0; i < DOTS; i++) {
          const d = 0.85 + i * DOT_GAP;
          if (d > length) break;
          const k = solid ? 1 : 0.8;
          this.v.set(p.pos.x + ux * d, 0, p.pos.y + uz * d);
          this.s.set(k, k, k);
          this.m4.compose(this.v, this.q.identity(), this.s);
          const at = solid ? locked++ : live++;
          mesh.setMatrixAt(at, this.m4);
          mesh.setColorAt(at, this.c);
        }
        if (solid && ends < 8) {
          this.v.set(p.pos.x + ux * length, 0, p.pos.y + uz * length);
          this.s.set(1, 1, 1);
          this.m4.compose(this.v, this.q.identity(), this.s);
          this.ends.setMatrixAt(ends, this.m4);
          this.ends.setColorAt(ends, this.c);
          ends++;
        }
      }
    }
    for (const [mesh, n] of [
      [this.lockedDots, locked],
      [this.liveDots, live],
      [this.ends, ends],
    ] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private updateCamera(dt: number): void {
    const target = Math.max(this.m.edge, 3.2) + 1.8;
    this.camR += (target - this.camR) * Math.min(1, dt * 1.5);
    const cam = this.stage.camera;
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.stage.aspect);
    // Leave room for the HUD rows at the top and bottom of the stage.
    const r = this.camR * 1.12;
    const dist = Math.max(r / Math.tan(vfov / 2) / 1.18, r / Math.tan(hfov / 2));
    this.shake = Math.max(0, this.shake - dt * 1.2);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sz = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    cam.position.set(sx, Math.sin(TILT) * dist, Math.cos(TILT) * dist + 0.6 + sz);
    cam.lookAt(sx * 0.5, 0, 0.6);
    this.stage.sun.position.set(-dist * 0.35, dist, dist * 0.5);
    this.stage.sun.target.position.set(0, 0, 0);
    const sc = this.stage.sun.shadow.camera;
    const span = this.camR + 2;
    if (sc.right !== span) {
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      sc.near = 1;
      sc.far = dist * 3;
      sc.updateProjectionMatrix();
    }
  }

  frame(dt: number): void {
    this.t += dt;
    const m = this.m;
    if (m.phase === 'intro' && this.shownEdge !== m.edge && this.chunks.length === 0) {
      this.shownEdge = m.edge;
      this.floe.scale.set(m.edge, 1, m.edge);
    }
    for (const f of this.floes) f.mesh.position.y = -0.36 + Math.sin(this.t * 0.9 + f.phase) * 0.05;
    this.updateWarning();
    this.updateChunks(dt);
    for (const l of this.looks.values()) {
      const p = m.player(l.id);
      if (p) this.placeSkater(l, p, dt);
      else {
        l.avatar.setVisible(false);
        l.arc.visible = false;
        l.tag.style.visibility = 'hidden';
      }
    }
    this.updateAims();
    this.fx.update(dt);
    this.updateCamera(dt);
    this.stage.render();
  }
}
