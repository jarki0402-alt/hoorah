/**
 * Langkah Maut 3D world on the shared box-world stage: a dark, cinematic path over an abyss. All
 * walkers stand side by side in lanes and hop forward one step per cleared arrow; whoever slips
 * tumbles into the dark. Each babak dresses the path differently (moving escalator steps, a rope,
 * fire stairs, a laser corridor, river stones, a cave, memory tiles, a broken lift) with a few
 * instanced meshes so it stays light on Smart TV browsers. The camera trails the group, sways a
 * little and leans in as the tempo climbs ("vertigo").
 */
import { sameLook } from '@hoorah/protocol';
import * as THREE from 'three';
import { BlockAvatar } from '../../shared/kotak/render/avatar';
import { KotakFx } from '../../shared/kotak/render/fx';
import { KotakStage, type ShadowTier, type StageLook } from '../../shared/kotak/render/stage';
import type { GfxTier } from '../common/gfx';
import type { Dir, LangkahMatch, Stage, Walker } from './logic';

const LANE = 1.25;
const STEP = 1.1;
const SLABS = 26;
const BEHIND = 5;

interface StageDress {
  look: StageLook;
  slab: string;
  edge: string;
  wall: string | null;
  rise: number;
  advance: boolean;
}

const DRESS: Record<Stage, StageDress> = {
  eskalator: {
    look: {
      sky: '#0E0F13',
      fog: { color: '#0E0F13', near: 14, far: 42 },
      sun: { color: '#FFE2B8', intensity: 1.8, dir: [0.4, 1, 0.6] },
      hemi: { sky: '#8FA0C8', ground: '#16171C', intensity: 0.8 },
    },
    slab: '#4A4E5A',
    edge: '#FFC928',
    wall: '#22242B',
    rise: 0.42,
    advance: true,
  },
  titian: {
    look: {
      sky: '#0B0D12',
      fog: { color: '#0B0D12', near: 12, far: 40 },
      sun: { color: '#C8D8FF', intensity: 1.5, dir: [-0.5, 1, 0.3] },
      hemi: { sky: '#6E80A8', ground: '#0B0C0E', intensity: 0.7 },
    },
    slab: '#C9A36A',
    edge: '#8C6A4A',
    wall: null,
    rise: 0,
    advance: true,
  },
  tangga: {
    look: {
      sky: '#121318',
      fog: { color: '#121318', near: 14, far: 40 },
      sun: { color: '#FFD9A0', intensity: 1.7, dir: [0.3, 1, 0.5] },
      hemi: { sky: '#A0A8C0', ground: '#1A1B20', intensity: 0.8 },
    },
    slab: '#5A5E6A',
    edge: '#FF8A3D',
    wall: '#2A2D36',
    rise: 0.5,
    advance: true,
  },
  laser: {
    look: {
      sky: '#0A0A0D',
      fog: { color: '#0A0A0D', near: 12, far: 36 },
      sun: { color: '#FFB0A8', intensity: 1.2, dir: [0, 1, 0.4] },
      hemi: { sky: '#7A6A80', ground: '#0A0A0D', intensity: 0.75 },
    },
    slab: '#2A2D36',
    edge: '#4A4E5A',
    wall: '#1E2026',
    rise: 0,
    advance: true,
  },
  batu: {
    look: {
      sky: '#071A24',
      fog: { color: '#071A24', near: 14, far: 40 },
      sun: { color: '#E8F4FF', intensity: 1.8, dir: [-0.3, 1, 0.5] },
      hemi: { sky: '#9CC8DC', ground: '#0B2C3D', intensity: 0.9 },
    },
    slab: '#5A5E6A',
    edge: '#14B8A6',
    wall: null,
    rise: 0,
    advance: true,
  },
  gua: {
    look: {
      sky: '#070708',
      fog: { color: '#070708', near: 8, far: 26 },
      sun: { color: '#FFB25A', intensity: 1.4, dir: [0.2, 1, 0.8] },
      hemi: { sky: '#8A6A50', ground: '#070708', intensity: 0.55 },
    },
    slab: '#4A3E34',
    edge: '#FFB25A',
    wall: '#2A221C',
    rise: 0.08,
    advance: true,
  },
  ingat: {
    look: {
      sky: '#0D0E12',
      fog: { color: '#0D0E12', near: 14, far: 42 },
      sun: { color: '#FFFFFF', intensity: 1.4, dir: [0, 1, 0.5] },
      hemi: { sky: '#A8B0C8', ground: '#0D0E12', intensity: 0.8 },
    },
    slab: '#24262C',
    edge: '#22B35E',
    wall: null,
    rise: 0,
    advance: true,
  },
  lift: {
    look: {
      sky: '#0C0D10',
      fog: { color: '#0C0D10', near: 14, far: 40 },
      sun: { color: '#FFE9C8', intensity: 1.6, dir: [0.2, 1, 0.7] },
      hemi: { sky: '#9AA0B0', ground: '#0C0D10', intensity: 0.8 },
    },
    slab: '#3A3D46',
    edge: '#C4C7CC',
    wall: '#2A2D36',
    rise: 0,
    advance: false,
  },
};

interface Look {
  id: number;
  avatar: BlockAvatar;
  tag: HTMLDivElement;
  color: string;
  name: string;
  fruit: string;
  look: Walker['look'];
  lane: number;
  /** Step shown (eases towards the walker's real step). */
  shown: number;
  hopT: number;
  lean: number;
  duck: number;
  fallT: number;
  flash: number;
}

const DIR_LEAN: Record<Dir, number> = { left: 1, right: -1, up: 0, down: 0 };

export class LangkahScene {
  readonly stage: KotakStage;
  readonly fx: KotakFx;
  private readonly world = new THREE.Group();
  private readonly dress = new THREE.Group();
  private readonly looks = new Map<number, Look>();
  private slabs: THREE.InstancedMesh | null = null;
  private edges: THREE.InstancedMesh | null = null;
  private lasers: THREE.InstancedMesh | null = null;
  private cabin: THREE.Group | null = null;
  private shaft: THREE.InstancedMesh | null = null;
  private water: THREE.Mesh | null = null;
  private current: Stage | null = null;
  private lanes = 1;
  private camStep = 0;
  private shake = 0;
  private t = 0;
  private flicker = 1;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    host: HTMLElement,
    private readonly tagHost: HTMLElement,
    level: GfxTier,
    msaa: boolean,
    shadow: ShadowTier,
    private readonly m: LangkahMatch,
  ) {
    this.stage = new KotakStage(host, level, msaa, shadow, DRESS.eskalator.look);
    this.stage.scene.add(this.world);
    this.world.add(this.dress);
    this.fx = new KotakFx(level);
    this.stage.scene.add(this.fx.mesh);
  }

  /* ------------------------------------------------------------------ lineup */

  setPlayers(
    list: readonly {
      id: number;
      name: string;
      fruit: Walker['fruit'];
      look: Walker['look'];
      color: string;
    }[],
  ): void {
    const keep = new Set(list.map((p) => p.id));
    for (const [id, l] of this.looks) {
      if (keep.has(id)) continue;
      this.dropLook(l);
      this.looks.delete(id);
    }
    list.forEach((p, i) => {
      const l = this.looks.get(p.id);
      if (l && l.fruit === p.fruit && sameLook(l.look, p.look)) {
        l.lane = i;
        if (l.color !== p.color) {
          l.avatar.setColor(p.color);
          l.tag.style.setProperty('--tag', p.color);
          l.color = p.color;
        }
        if (l.name !== p.name) {
          l.tag.textContent = p.name;
          l.name = p.name;
        }
        return;
      }
      if (l) {
        this.dropLook(l);
        this.looks.delete(p.id);
      }
      const avatar = new BlockAvatar(this.stage, p.look, p.color);
      for (const o of avatar.objects) this.world.add(o);
      const tag = document.createElement('div');
      tag.className = 'kt-tag lm-tag';
      tag.textContent = p.name;
      tag.style.setProperty('--tag', p.color);
      this.tagHost.appendChild(tag);
      this.looks.set(p.id, {
        id: p.id,
        avatar,
        tag,
        color: p.color,
        name: p.name,
        fruit: p.fruit,
        look: p.look,
        lane: i,
        shown: 0,
        hopT: 1,
        lean: 0,
        duck: 0,
        fallT: 0,
        flash: 0,
      });
    });
    this.lanes = Math.max(1, list.length);
    if (this.current) this.build(this.current);
  }

  private dropLook(l: Look): void {
    for (const o of l.avatar.objects) this.world.remove(o);
    l.avatar.dispose();
    l.tag.remove();
  }

  private laneX(lane: number): number {
    return (lane - (this.lanes - 1) / 2) * LANE;
  }

  /* ------------------------------------------------------------------ set dressing */

  private clearDress(): void {
    this.dress.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.dress.clear();
    this.slabs = null;
    this.edges = null;
    this.lasers = null;
    this.cabin = null;
    this.shaft = null;
    this.water = null;
  }

  /** Builds the babak's set (and again when the lineup width changes). */
  build(stage: Stage): void {
    this.clearDress();
    this.current = stage;
    const d = DRESS[stage];
    this.stage.setLook(d.look);
    const width = this.lanes * LANE + 0.8;
    const box = new THREE.BoxGeometry(1, 1, 1);

    if (stage === 'lift') {
      this.buildLift(width);
      return;
    }
    // Walkway pieces: one slab per step across all lanes (or a rope / stone per lane).
    if (stage === 'titian') {
      const rope = new THREE.InstancedMesh(box, this.stage.material(d.slab, { rough: 0.8 }), this.lanes);
      for (let i = 0; i < this.lanes; i++) {
        this.m4.compose(
          this.v.set(this.laneX(i), -0.06, -SLABS * STEP * 0.5 + BEHIND * STEP),
          this.q.identity(),
          this.s.set(0.12, 0.12, SLABS * STEP * 3),
        );
        rope.setMatrixAt(i, this.m4);
      }
      rope.userData.follow = true;
      this.dress.add(rope);
      this.edges = new THREE.InstancedMesh(box, this.stage.material(d.edge), SLABS);
      this.edges.userData.posts = true;
    } else if (stage === 'batu') {
      const geo = new THREE.CylinderGeometry(0.45, 0.55, 0.4, 10);
      this.slabs = new THREE.InstancedMesh(
        geo,
        this.stage.material(d.slab, { rough: 0.9 }),
        SLABS * this.lanes,
      );
      this.slabs.userData.perLane = true;
      this.water = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 160),
        this.stage.material('#0B2C3D', { rough: 0.3 }),
      );
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.y = -0.3;
      this.dress.add(this.water);
    } else {
      this.slabs = new THREE.InstancedMesh(box, this.stage.material(d.slab, { rough: 0.85 }), SLABS);
      this.edges = new THREE.InstancedMesh(box, this.stage.material(d.edge, { emissive: d.edge }), SLABS);
    }
    for (const im of [this.slabs, this.edges]) {
      if (!im) continue;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.receiveShadow = true;
      this.dress.add(im);
    }
    if (d.wall) {
      const wallMat = this.stage.material(d.wall, { rough: 0.95 });
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(box, wallMat);
        wall.scale.set(0.5, stage === 'gua' ? 7 : 4, SLABS * STEP * 3);
        wall.position.set((side * width) / 2 + side * 0.25, 1, 0);
        wall.userData.follow = true;
        this.dress.add(wall);
      }
    }
    if (stage === 'eskalator') {
      // Handrails on both sides.
      const rail = this.stage.material('#111214', { rough: 0.5 });
      for (const side of [-1, 1]) {
        const r = new THREE.Mesh(box, rail);
        r.scale.set(0.18, 0.14, SLABS * STEP * 3);
        r.position.set((side * width) / 2, 1.1, 0);
        r.userData.follow = true;
        r.userData.slope = true;
        this.dress.add(r);
      }
    }
    if (stage === 'laser') {
      const mat = new THREE.MeshBasicMaterial({ color: '#FF3B30' });
      this.lasers = new THREE.InstancedMesh(box, mat, 12);
      this.lasers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.lasers.frustumCulled = false;
      this.dress.add(this.lasers);
    }
  }

  private buildLift(width: number): void {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cabin = new THREE.Group();
    const frame = this.stage.material('#3A3D46', { rough: 0.6 });
    const floor = new THREE.Mesh(box, this.stage.material('#2A2D36', { rough: 0.8 }));
    floor.scale.set(width + 0.6, 0.3, 3.2);
    floor.position.set(0, -0.15, 0);
    floor.receiveShadow = true;
    cabin.add(floor);
    const roof = new THREE.Mesh(box, frame);
    roof.scale.set(width + 0.6, 0.2, 3.2);
    roof.position.set(0, 3.1, 0);
    cabin.add(roof);
    for (const x of [-1, 1]) {
      const wall = new THREE.Mesh(box, frame);
      wall.scale.set(0.2, 3.2, 3.2);
      wall.position.set((x * (width + 0.6)) / 2, 1.5, 0);
      cabin.add(wall);
    }
    const back = new THREE.Mesh(box, this.stage.material('#1E2026', { rough: 0.9 }));
    back.scale.set(width + 0.6, 3.2, 0.2);
    back.position.set(0, 1.5, -1.6);
    cabin.add(back);
    const cableMat = this.stage.material('#8E929C', { rough: 0.4 });
    for (const x of [-0.3, 0.3]) {
      const cable = new THREE.Mesh(box, cableMat);
      cable.scale.set(0.06, 20, 0.06);
      cable.position.set(x * width, 13, 0);
      cabin.add(cable);
    }
    this.dress.add(cabin);
    this.cabin = cabin;
    // Shaft rungs streaming past as the lift drops.
    this.shaft = new THREE.InstancedMesh(box, this.stage.material('#24262C', { rough: 0.9 }), 16);
    this.shaft.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shaft.frustumCulled = false;
    this.dress.add(this.shaft);
  }

  /* ------------------------------------------------------------------ events */

  resetBabak(stage: Stage): void {
    this.build(stage);
    this.camStep = 0;
    for (const l of this.looks.values()) {
      l.shown = 0;
      l.hopT = 1;
      l.lean = 0;
      l.duck = 0;
      l.fallT = 0;
    }
    this.fx.clear();
  }

  /** A walker cleared a cue: hop (or lean / duck for the stages that do that). */
  step(id: number, dir: Dir): void {
    const l = this.looks.get(id);
    if (!l) return;
    l.hopT = 0;
    l.flash = 1;
    if (this.current === 'titian' || this.current === 'lift')
      l.lean = DIR_LEAN[dir] || (dir === 'up' ? 0.01 : -0.01);
    if (this.current === 'laser' && dir === 'down') l.duck = 1;
  }

  fall(id: number): void {
    const l = this.looks.get(id);
    if (!l) return;
    l.fallT = 0.0001;
    const p = this.posOf(l);
    this.fx.fall(p.x, p.y + 0.6, p.z, l.color);
    this.shake = Math.max(this.shake, 0.15);
  }

  /** The lift jolts / the cave rumbles on a beat. */
  jolt(strength = 0.2): void {
    this.shake = Math.max(this.shake, strength);
    if (this.current === 'gua') {
      const z = -this.camStep * STEP - 4 - Math.random() * 4;
      this.fx.debris((Math.random() - 0.5) * this.lanes * LANE, 5, z, 1.2, 1.2, '#6B5A4A');
    }
  }

  celebrate(ids: readonly number[]): void {
    for (const id of ids) {
      const l = this.looks.get(id);
      if (!l) continue;
      const p = this.posOf(l);
      this.fx.confetti(p.x, p.y + 1.6, p.z, 0.6);
    }
  }

  screenOf(id: number): { x: number; y: number } | null {
    const l = this.looks.get(id);
    if (!l) return null;
    const p = this.posOf(l);
    return this.stage.toScreen(p.x, p.y + 2.3, p.z, this.tmp);
  }

  private posOf(l: Look): { x: number; y: number; z: number } {
    const d = DRESS[this.current ?? 'eskalator'];
    const k = d.advance ? l.shown : 0;
    return { x: this.laneX(l.lane), y: k * d.rise, z: -k * STEP };
  }

  /* ------------------------------------------------------------------ frame */

  private updateDress(): void {
    const stage = this.current;
    if (!stage) return;
    const d = DRESS[stage];
    const width = this.lanes * LANE + 0.8;
    const base = Math.floor(this.camStep) - BEHIND;
    if (this.slabs?.userData.perLane) {
      let n = 0;
      for (let k = 0; k < SLABS; k++) {
        const step = base + k;
        for (let lane = 0; lane < this.lanes; lane++) {
          // Stones behind the group sink.
          const sink = step < this.camStep - 1 ? Math.min(1, this.camStep - 1 - step) * 0.5 : 0;
          const bob = Math.sin(this.t * 2 + step * 1.3 + lane) * 0.03;
          this.m4.compose(
            this.v.set(
              this.laneX(lane) + Math.sin(step * 2.1 + lane) * 0.12,
              -0.2 - sink + bob,
              -step * STEP,
            ),
            this.q.identity(),
            this.s.set(1, 1, 1),
          );
          this.slabs.setMatrixAt(n++, this.m4);
        }
      }
      this.slabs.count = n;
      this.slabs.instanceMatrix.needsUpdate = true;
    } else if (this.slabs) {
      for (let k = 0; k < SLABS; k++) {
        const step = base + k;
        const y = step * d.rise;
        const thick = d.rise > 0 ? d.rise + 0.3 : 0.3;
        this.m4.compose(
          this.v.set(0, y - thick / 2, -step * STEP),
          this.q.identity(),
          this.s.set(width, thick, STEP * (stage === 'ingat' ? 0.86 : 0.98)),
        );
        this.slabs.setMatrixAt(k, this.m4);
      }
      this.slabs.instanceMatrix.needsUpdate = true;
    }
    if (this.edges) {
      for (let k = 0; k < SLABS; k++) {
        const step = base + k;
        if (this.edges.userData.posts) {
          // Rope posts every few metres.
          const z = -Math.round(step / 4) * 4 * STEP;
          this.m4.compose(this.v.set(-width / 2, -0.6, z), this.q.identity(), this.s.set(0.18, 1.4, 0.18));
          this.edges.setMatrixAt(k, this.m4);
          continue;
        }
        const y = step * d.rise;
        this.m4.compose(
          this.v.set(0, y + 0.005, -step * STEP + STEP * 0.44),
          this.q.identity(),
          this.s.set(width, 0.03, 0.08),
        );
        this.edges.setMatrixAt(k, this.m4);
      }
      this.edges.instanceMatrix.needsUpdate = true;
    }
    for (const o of this.dress.children) {
      if (!o.userData.follow) continue;
      const z = -this.camStep * STEP;
      o.position.z = z;
      if (o.userData.slope) {
        o.position.y = this.camStep * d.rise + 1.1;
        o.rotation.x = Math.atan2(d.rise, STEP);
      } else if (d.rise > 0 && o !== this.water) o.position.y = this.camStep * d.rise + 1;
    }
    if (this.water) this.water.position.z = -this.camStep * STEP - 20;
    if (this.lasers) this.updateLasers(width);
    if (this.shaft) {
      for (let i = 0; i < 16; i++) {
        const y = ((i * 2.2 + this.t * 3.5) % 35) - 12;
        this.m4.compose(this.v.set(0, y, -2.4), this.q.identity(), this.s.set(width + 4, 0.25, 0.3));
        this.shaft.setMatrixAt(i, this.m4);
      }
      this.shaft.instanceMatrix.needsUpdate = true;
    }
  }

  private updateLasers(width: number): void {
    const m = this.m;
    const im = this.lasers!;
    let n = 0;
    const lead = m.alive()[0];
    const from = lead ? lead.next : 0;
    for (const c of m.cues) {
      if (n >= 12) break;
      if (c.i < from - 1 || c.show > m.t) continue;
      const passed = c.close + 0.4 < m.t;
      if (passed) continue;
      const high = c.dir === 'down';
      const y = high ? 1.25 : 0.32;
      const pulse = 1 + Math.sin(this.t * 30 + c.i) * 0.15;
      this.m4.compose(
        this.v.set(0, y, -(c.i + 0.55) * STEP),
        this.q.identity(),
        this.s.set(width + 0.6, 0.07 * pulse, 0.07 * pulse),
      );
      im.setMatrixAt(n++, this.m4);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
  }

  private placeWalker(l: Look, p: Walker, dt: number): void {
    const m = this.m;
    const d = DRESS[this.current ?? 'eskalator'];
    const show = p.inRound && m.phase !== 'final' && m.phase !== 'done';
    if (!show) {
      l.avatar.setVisible(false);
      l.tag.style.visibility = 'hidden';
      return;
    }
    // Ease the shown step towards the real one (hop animation).
    const target = p.step;
    if (l.shown < target) l.shown = Math.min(target, l.shown + dt / 0.16);
    else if (l.shown > target) l.shown = target;
    l.hopT = Math.min(1, l.hopT + dt / 0.2);
    l.lean *= Math.exp(-dt * 3.2);
    l.duck = Math.max(0, l.duck - dt * 2.6);
    l.flash = Math.max(0, l.flash - dt * 3);
    const base = this.posOf(l);
    let y = base.y + Math.sin(Math.PI * l.hopT) * (d.advance ? 0.35 : 0.08);
    let visible = true;
    let ground: number | null = base.y;
    if (p.fallen) {
      if (l.fallT === 0) l.fallT = 0.0001;
      l.fallT += dt;
      y = base.y - l.fallT * l.fallT * 9;
      ground = null;
      visible = l.fallT < 1.4;
    }
    l.avatar.setVisible(visible);
    l.tag.style.visibility = visible && !p.fallen ? 'visible' : 'hidden';
    if (!visible) return;
    l.avatar.place(base.x, y, base.z, Math.PI, ground);
    l.avatar.root.rotation.z = p.fallen ? l.fallT * 3 : l.lean * 0.35;
    l.avatar.root.scale.y = 1 - l.duck * 0.4;
    l.avatar.pose(
      {
        run: 0,
        air: l.hopT < 0.95 || p.fallen,
        vy: l.hopT < 0.5 ? 1 : -1,
        stunned: p.fallen,
        frozen: false,
        cheer: m.phase === 'end' && !p.fallen,
        t: this.t,
      },
      dt,
    );
    const s = this.stage.toScreen(base.x, y + 2.05, base.z, this.tmp);
    if (s)
      l.tag.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    l.tag.classList.toggle('is-pas', l.flash > 0.2 && p.lastJudge === 'pas');
  }

  private updateCamera(dt: number): void {
    const m = this.m;
    const d = DRESS[this.current ?? 'eskalator'];
    const alive = m.alive();
    const lead = alive.length > 0 ? Math.max(...alive.map((p) => p.step)) : this.camStep;
    const target = d.advance ? lead : 0;
    this.camStep += (target - this.camStep) * Math.min(1, dt * 4);
    const cam = this.stage.camera;
    const width = this.lanes * LANE + 2.4;
    const tension = m.phase === 'play' ? Math.min(1, Math.max(0, (m.speed - 1) / 1.6)) : 0;
    // Vertigo: the lens widens while the camera creeps closer as the tempo climbs.
    cam.fov = 44 + tension * 8;
    const hfov = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * this.stage.aspect);
    // The walker list takes the right edge of the stage: fit the lanes into about 70% of the width.
    const dist = Math.max(10, width / 2 / Math.tan(hfov / 2) / 0.7 + 2) * (1 - tension * 0.12);
    const fy = this.camStep * d.rise;
    const fz = -this.camStep * STEP;
    this.shake = Math.max(0, this.shake - dt * 0.9);
    const sx = (Math.random() - 0.5) * this.shake + Math.sin(this.t * 0.5) * 0.25 * (0.3 + tension);
    const sy = (Math.random() - 0.5) * this.shake;
    if (this.current === 'lift') {
      cam.position.set(sx, 2.6 + sy, 4.2 + dist * 0.55);
      cam.lookAt(0, 1.1, -0.4);
    } else {
      cam.position.set(sx - width * 0.06, fy + 3 + dist * 0.5 + sy, fz + dist * 0.8);
      cam.lookAt(sx * 0.4 - width * 0.06, fy + 0.4, fz - 2.2);
    }
    cam.updateProjectionMatrix();
    this.stage.sun.position.set(6, fy + 18, fz + 10);
    this.stage.sun.target.position.set(0, fy, fz - 2);
    const sc = this.stage.sun.shadow.camera;
    const span = width / 2 + 4;
    if (sc.right !== span) {
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      sc.near = 1;
      sc.far = 60;
      sc.updateProjectionMatrix();
    }
    if (this.cabin) {
      this.cabin.position.x = (Math.random() - 0.5) * this.shake * 0.6;
      this.cabin.rotation.z = (Math.random() - 0.5) * this.shake * 0.08;
    }
    if (this.current === 'gua') {
      // Torch flicker.
      this.flicker += (0.75 + Math.random() * 0.5 - this.flicker) * Math.min(1, dt * 10);
      this.stage.hemi.intensity = DRESS.gua.look.hemi.intensity * this.flicker;
    }
  }

  frame(dt: number): void {
    this.t += dt;
    const m = this.m;
    if (m.phase !== 'setup' && this.current !== m.stage) this.resetBabak(m.stage);
    if (!this.current) this.build(m.stage);
    this.updateCamera(dt);
    this.updateDress();
    for (const l of this.looks.values()) {
      const p = m.player(l.id);
      if (p) this.placeWalker(l, p, dt);
      else {
        l.avatar.setVisible(false);
        l.tag.style.visibility = 'hidden';
      }
    }
    this.fx.update(dt);
    this.stage.render();
  }

  /** Name tags on or off (off while a card covers the stage). */
  setTags(on: boolean): void {
    this.tagHost.style.display = on ? '' : 'none';
  }
}
