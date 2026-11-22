/**
 * Bom Oper 3D yard on the shared box-world renderer, in an inked comic style: flat bright colours
 * with thick black outlines (inverted hulls) on every prop. The bomb is a round black ball with a
 * sputtering fuse that pulses faster as it burns (the only clue to the secret time), a dashed red
 * ring on the ground shows OPER's reach around the holder, a white ring marks who is immune, and
 * a BUM leaves a comic burst, smoke and a sooty runner.
 */
import * as THREE from 'three';
import { lerp } from '../../shared/kotak/math';
import { KotakFx } from '../../shared/kotak/render/fx';
import { AvatarLayer, type PlayerLook } from '../../shared/kotak/render/players';
import { checkerTexture, SolidLayer, toyBlock } from '../../shared/kotak/render/solids';
import { KotakStage, type ShadowTier, type StageLook } from '../../shared/kotak/render/stage';
import { STEP } from '../../shared/kotak/sim';
import type { Solid } from '../../shared/kotak/solids';
import type { GfxTier } from '../common/gfx';
import type { ArenaId, ArenaLook } from './arena';
import { type Bomb, type BomMatch, RULES } from './logic';

interface Theme {
  stage: StageLook;
  colors: Record<ArenaLook, string>;
  floorB: string;
}

const THEMES: Record<ArenaId, Theme> = {
  halaman: {
    stage: {
      sky: '#9FD9FF',
      sun: { color: '#FFF4DE', intensity: 2.3, dir: [-0.4, 1, 0.6] },
      hemi: { sky: '#E3F4FF', ground: '#5E9E4E', intensity: 1.2 },
    },
    colors: {
      floor: '#7CC86A',
      fence: '#FFF7F0',
      tree: '#9A6B45',
      well: '#B9B2A6',
      bench: '#C98A4E',
      pot: '#E07A4A',
      stall: '#FF8A3D',
      crate: '#C98A4E',
      tank: '#2F8CFF',
      ac: '#E9E2D6',
      skylight: '#9FD9FF',
      vent: '#8B8F99',
    },
    floorB: '#6DB85C',
  },
  pasar: {
    stage: {
      sky: '#FFE2A8',
      sun: { color: '#FFF0D6', intensity: 2.2, dir: [-0.5, 1, 0.4] },
      hemi: { sky: '#FFF4DE', ground: '#9A7A5A', intensity: 1.2 },
    },
    colors: {
      floor: '#D9CBB4',
      fence: '#2F8CFF',
      tree: '#9A6B45',
      well: '#B9B2A6',
      bench: '#C98A4E',
      pot: '#E07A4A',
      stall: '#C98A4E',
      crate: '#B97A4A',
      tank: '#2F8CFF',
      ac: '#E9E2D6',
      skylight: '#9FD9FF',
      vent: '#8B8F99',
    },
    floorB: '#CBBBA2',
  },
  atap: {
    stage: {
      sky: '#BFE0FF',
      sun: { color: '#FFFFFF', intensity: 2.4, dir: [-0.6, 1, 0.5] },
      hemi: { sky: '#EAF5FF', ground: '#7C8592', intensity: 1.2 },
    },
    colors: {
      floor: '#B7BCC4',
      fence: '#E9E2D6',
      tree: '#9A6B45',
      well: '#B9B2A6',
      bench: '#C98A4E',
      pot: '#E07A4A',
      stall: '#FF8A3D',
      crate: '#C98A4E',
      tank: '#2F8CFF',
      ac: '#F4F4F4',
      skylight: '#9FD9FF',
      vent: '#8B8F99',
    },
    floorB: '#A9AFB8',
  },
};

const STALL_ROOFS = ['#F2453D', '#22B35E', '#FFC928', '#2F8CFF', '#FF8A3D'];
/** Goods on the counters: warm fruit and veg colours that stay clear under any canopy. */
const GOODS = ['#FFC928', '#22B35E', '#FF8A3D'];

interface BombView {
  group: THREE.Group;
  spark: THREE.Mesh;
  ring: THREE.Group;
  phase: number;
}

export class BomScene {
  readonly stage: KotakStage;
  readonly fx: KotakFx;
  private solids: SolidLayer | null = null;
  private avatars: AvatarLayer | null = null;
  private readonly world = new THREE.Group();
  private readonly decor = new THREE.Group();
  private readonly bombs: BombView[] = [];
  private readonly shields: THREE.Mesh[] = [];
  private readonly bursts: { mesh: THREE.Mesh; t: number }[] = [];
  private readonly ink: THREE.MeshBasicMaterial;
  private readonly textures: THREE.Texture[] = [];
  private loaded = false;
  private looks: PlayerLook[] = [];
  private readonly soot = new Map<number, number>();

  constructor(
    host: HTMLElement,
    private readonly tagHost: HTMLElement,
    level: GfxTier,
    msaa: boolean,
    shadow: ShadowTier,
  ) {
    this.stage = new KotakStage(host, level, msaa, shadow, THEMES.halaman.stage);
    this.fx = new KotakFx(level);
    this.ink = new THREE.MeshBasicMaterial({ color: '#111214', side: THREE.BackSide });
    this.stage.scene.add(this.world, this.decor, this.fx.mesh);
    for (let i = 0; i < 2; i++) this.bombs.push(this.buildBomb());
    const shieldGeo = new THREE.RingGeometry(0.62, 0.74, 28);
    const shieldMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85 });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(shieldGeo, shieldMat);
      s.rotation.x = -Math.PI / 2;
      s.visible = false;
      this.shields.push(s);
      this.stage.scene.add(s);
    }
  }

  setPlayers(looks: PlayerLook[]): void {
    this.looks = looks;
    this.applyLooks();
  }

  get players(): AvatarLayer | null {
    return this.avatars;
  }

  /** Blacken a runner for a moment after a BUM (sooty comic face). */
  sootify(id: number, seconds: number): void {
    this.soot.set(id, seconds);
    this.applyLooks();
  }

  private applyLooks(): void {
    this.avatars?.set(this.looks.map((l) => (this.soot.has(l.id) ? { ...l, color: '#2B2F38' } : l)));
  }

  /** Build the yard once. */
  load(m: BomMatch): void {
    if (this.loaded) return;
    this.loaded = true;
    const T = THEMES[m.arena.id];
    this.stage.setLook(T.stage);
    const st = this.stage;
    const floorTex = checkerTexture(T.colors.floor, T.floorB, 8, 256);
    floorTex.repeat.set(m.arena.hx / 2, m.arena.hz / 2);
    this.textures.push(floorTex);
    let stall = 0;
    const build = (s: Solid): THREE.Object3D | null => {
      const d = s.def;
      const look = (d.look ?? 'crate') as ArenaLook;
      const { x: hx, y: hy, z: hz } = d.half;
      const color = T.colors[look];
      switch (look) {
        case 'floor': {
          const tex = floorTex.clone();
          tex.needsUpdate = true;
          this.textures.push(tex);
          return toyBlock(st, color, hx, hy, hz, { top: tex });
        }
        case 'fence':
          return this.inked(toyBlock(st, color, hx, hy, hz), hx, hy, hz);
        case 'tree': {
          const g = this.inked(toyBlock(st, color, hx * 0.6, hy, hz * 0.6), hx * 0.6, hy, hz * 0.6);
          const crown = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), st.material('#22B35E'));
          crown.position.y = hy + 0.5;
          crown.castShadow = true;
          g.add(crown, this.hull(1.1, 0.8, 1.1, 0, hy + 0.5, 0));
          return g;
        }
        case 'stall': {
          const g = this.inked(toyBlock(st, color, hx, hy, hz), hx, hy, hz);
          const roof = STALL_ROOFS[stall++ % STALL_ROOFS.length]!;
          // See-through canopy so runners behind the stall stay visible from the sofa.
          const roofMat = st.material(roof) as THREE.MeshStandardMaterial;
          roofMat.transparent = true;
          roofMat.opacity = 0.62;
          roofMat.depthWrite = false;
          const canopy = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + 0.3, 0.1, hz * 2 + 0.3), roofMat);
          canopy.position.y = hy + 1.2;
          canopy.castShadow = true;
          for (const sx of [-1, 1])
            for (const sz of [-1, 1]) {
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), st.material('#FFF7F0'));
              post.position.set(sx * (hx + 0.15), hy + 0.6, sz * (hz + 0.25));
              g.add(post);
            }
          // Goods on the counter.
          for (let i = 0; i < 3; i++) {
            const box = new THREE.Mesh(
              new THREE.BoxGeometry(0.5, 0.3, 0.5),
              st.material(GOODS[i % GOODS.length]!),
            );
            box.position.set(-hx + 0.6 + i * (hx - 0.3), hy + 0.15, 0);
            g.add(box);
          }
          g.add(canopy);
          return g;
        }
        case 'tank': {
          const g = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CylinderGeometry(hx, hx, hy * 2, 18), st.material(color));
          body.castShadow = true;
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(hx * 0.4, hx * 0.4, 0.2, 12),
            st.material('#FFF7F0'),
          );
          cap.position.y = hy + 0.1;
          const out = new THREE.Mesh(
            new THREE.CylinderGeometry(hx + 0.06, hx + 0.06, hy * 2 + 0.06, 18),
            this.ink,
          );
          g.add(body, cap, out);
          return g;
        }
        case 'skylight': {
          const g = this.inked(toyBlock(st, '#E9E2D6', hx, hy, hz), hx, hy, hz);
          const glass = new THREE.Mesh(
            new THREE.BoxGeometry(hx * 1.7, 0.06, hz * 1.6),
            st.material(color, { emissive: '#3A6A8F' }),
          );
          glass.position.y = hy + 0.02;
          g.add(glass);
          return g;
        }
        default:
          return this.inked(toyBlock(st, color, hx, hy, hz), hx, hy, hz);
      }
    };
    this.solids = new SolidLayer(m.sim, build);
    this.world.add(this.solids.group);
    this.avatars = new AvatarLayer(st, m.sim, this.tagHost);
    this.applyLooks();
    this.world.add(this.avatars.group);
    this.buildDecor(m);
  }

  /** A black outline box around a block of half size (hx, hy, hz). */
  private hull(hx: number, hy: number, hz: number, x = 0, y = 0, z = 0): THREE.Mesh {
    const h = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + 0.1, hy * 2 + 0.1, hz * 2 + 0.1), this.ink);
    h.position.set(x, y, z);
    return h;
  }

  private inked(g: THREE.Group, hx: number, hy: number, hz: number): THREE.Group {
    g.add(this.hull(hx, hy, hz));
    return g;
  }

  private buildBomb(): BombView {
    const st = this.stage;
    const group = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 18, 14),
      st.material('#22242A', { rough: 0.35 }),
    );
    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#FFFFFF' }),
    );
    shine.position.set(-0.17, 0.2, 0.28);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), st.material('#8B8F99'));
    neck.position.y = 0.44;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), st.material('#E9D2A6'));
    fuse.position.set(0.06, 0.62, 0);
    fuse.rotation.z = -0.4;
    const spark = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({ color: '#FFC928' }),
    );
    spark.position.set(0.13, 0.78, 0);
    const outline = new THREE.Mesh(new THREE.SphereGeometry(0.47, 18, 14), this.ink);
    group.add(ball, shine, neck, fuse, spark, outline);
    group.traverse((o) => {
      (o as THREE.Mesh).castShadow = o !== spark;
    });
    group.scale.setScalar(1.3);
    group.visible = false;
    this.stage.scene.add(group);
    // OPER's reach: a dashed red ring on the ground.
    const ring = new THREE.Group();
    const dash = new THREE.BoxGeometry(0.5, 0.04, 0.12);
    const red = new THREE.MeshBasicMaterial({ color: '#F2453D' });
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = new THREE.Mesh(dash, red);
      d.position.set(Math.cos(a) * RULES.passRange, 0.03, Math.sin(a) * RULES.passRange);
      d.rotation.y = -a + Math.PI / 2;
      ring.add(d);
    }
    ring.visible = false;
    this.stage.scene.add(ring);
    return { group, spark, ring, phase: 0 };
  }

  /** Comic "BUM" burst: a jagged yellow star with an ink edge that pops and fades. */
  burst(x: number, y: number, z: number): void {
    const shape = new THREE.Shape();
    const n = 12;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? 0.9 : 1.8;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#FFC928', transparent: true }));
    const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#F2453D', transparent: true }));
    edge.scale.setScalar(1.18);
    edge.position.z = -0.01;
    mesh.add(edge);
    mesh.position.set(x, y + 1.2, z);
    this.stage.scene.add(mesh);
    this.bursts.push({ mesh, t: 0 });
    this.fx.dust(x, y, z, 1.8, '#3A3C42');
    this.fx.debris(x, y + 0.5, z, 1.4, 1.4, '#22242A');
  }

  private buildDecor(m: BomMatch): void {
    const st = this.stage;
    const id = m.arena.id;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 160),
      st.material(id === 'atap' ? '#8FA3B8' : id === 'pasar' ? '#C9B79A' : '#6DB85C'),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = id === 'atap' ? -14 : -1.05;
    ground.receiveShadow = true;
    this.decor.add(ground);
    let seed = 5 + ['halaman', 'pasar', 'atap'].indexOf(id) * 13;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const far = (color: string) => st.material(color);
    if (id === 'atap') {
      // Other rooftops of the city around.
      for (let i = 0; i < 18; i++) {
        const w = 6 + rnd() * 8;
        const h = 8 + rnd() * 18;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), far(rnd() > 0.5 ? '#D9DEE5' : '#C4CCD6'));
        const a = rnd() * Math.PI * 2;
        const r = 30 + rnd() * 30;
        b.position.set(Math.cos(a) * r, -14 + h / 2, Math.sin(a) * r * 0.7 - 10);
        this.decor.add(b);
      }
    } else {
      // Houses and trees round the yard or market.
      const roofs = ['#F2453D', '#FF8A3D', '#2F8CFF', '#22B35E'];
      for (let i = 0; i < 14; i++) {
        const x = -32 + i * 5 + rnd() * 2;
        const h = 3 + rnd() * 2;
        const house = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), far('#FFF7F0'));
        house.position.set(x, h / 2 - 1, -14 - rnd() * 4);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 4.4), far(roofs[i % roofs.length]!));
        roof.position.set(x, h - 0.6, house.position.z);
        this.decor.add(house, roof);
      }
    }
  }

  frame(m: BomMatch, dt: number): void {
    this.load(m);
    const t = m.sim.t - STEP + m.alpha * STEP;
    this.solids?.update(t);
    for (const [id, left] of this.soot) {
      const next = left - dt;
      if (next <= 0) {
        this.soot.delete(id);
        this.applyLooks();
      } else this.soot.set(id, next);
    }
    this.avatars?.update(m.alpha, dt);
    for (let i = 0; i < this.bombs.length; i++) this.placeBomb(m, this.bombs[i]!, m.bombs[i], dt);
    let s = 0;
    for (const r of m.runners) {
      if (r.out || m.immuneLeft(r) <= 0 || s >= this.shields.length) continue;
      const b = m.sim.body(r.id);
      if (!b) continue;
      const sh = this.shields[s++]!;
      sh.visible = true;
      sh.position.set(lerp(b.prev.x, b.pos.x, m.alpha), b.pos.y + 0.04, lerp(b.prev.z, b.pos.z, m.alpha));
    }
    for (; s < this.shields.length; s++) this.shields[s]!.visible = false;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.t += dt;
      const k = b.t / 0.9;
      b.mesh.scale.setScalar(0.4 + Math.min(1, k * 3) * 1.1);
      b.mesh.quaternion.copy(this.stage.camera.quaternion);
      const mat = b.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - Math.max(0, k - 0.5) * 2);
      ((b.mesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = mat.opacity;
      if (k >= 1) {
        b.mesh.removeFromParent();
        b.mesh.geometry.dispose();
        mat.dispose();
        this.bursts.splice(i, 1);
      }
    }
    this.fx.update(dt);
    m.setAspect(this.stage.aspect);
    this.stage.applyView(m.camera.rig, m.camera.view);
    this.stage.render();
  }

  /** Where a runner holds the bomb: up in both hands, a little in front of the chest. */
  private headOf(m: BomMatch, id: number): THREE.Vector3 | null {
    const b = m.sim.body(id);
    if (!b) return null;
    return new THREE.Vector3(
      lerp(b.prev.x, b.pos.x, m.alpha) + Math.sin(b.yaw) * 0.55,
      lerp(b.prev.y, b.pos.y, m.alpha) + m.sim.tuning.height * 0.75,
      lerp(b.prev.z, b.pos.z, m.alpha) + Math.cos(b.yaw) * 0.55,
    );
  }

  private placeBomb(m: BomMatch, v: BombView, b: Bomb | undefined, dt: number): void {
    const show = !!b && !b.exploded && (m.phase === 'drop' || m.phase === 'play' || m.phase === 'boom');
    v.group.visible = show;
    v.ring.visible = false;
    if (!b || !show) return;
    const head = this.headOf(m, b.holder);
    if (!head) {
      v.group.visible = false;
      return;
    }
    if (m.phase === 'drop') {
      // Falling from the sky onto the holder.
      const k = Math.min(1, m.phaseT / RULES.drop);
      head.y += (1 - k * k) * 12;
    } else if (b.flight) {
      const from = this.headOf(m, b.flight.from);
      const k = Math.min(1, (m.sim.t - b.flight.at) / RULES.flight);
      if (from) {
        head.lerpVectors(from, head, k);
        head.y += Math.sin(k * Math.PI) * 1.4;
      }
    } else head.y += Math.sin(m.sim.t * 6) * 0.06;
    v.group.position.copy(head);
    // The fuse sputters faster as it burns; this is the only clue to the secret time.
    const burnt = m.burnt(b);
    const hz = 1.2 + burnt ** 1.6 * 7;
    v.phase += dt * hz * Math.PI * 2;
    const pulse = 0.5 + 0.5 * Math.sin(v.phase);
    v.spark.scale.setScalar(0.7 + pulse * 0.9);
    (v.spark.material as THREE.MeshBasicMaterial).color.set(pulse > 0.6 ? '#FFF7F0' : '#FF8A3D');
    v.group.rotation.y += dt * 1.5;
    if (m.phase === 'play' && !b.flight) {
      const body = m.sim.body(b.holder);
      if (body) {
        v.ring.visible = true;
        v.ring.position.set(head.x, body.pos.y, head.z);
        v.ring.rotation.y += dt * 0.6;
      }
    }
  }
}
