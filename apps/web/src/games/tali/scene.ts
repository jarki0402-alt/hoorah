/**
 * Satu Tali 3D world on the shared box-world renderer. Each route has its own light and palette:
 * Tebing Senja (warm dusk cliffs over a deep canyon), Hutan Bambu (mossy blocks, bamboo stalks over
 * a river) and Puncak Salju (snow blocks, ice rafts above a sea of clouds). The team is drawn as
 * blocky fruit avatars tied by one yellow rope that warms to red when stretched; the solo sandbag
 * is a burlap sack with a knot.
 */
import * as THREE from 'three';
import { lerp } from '../../shared/kotak/math';
import { KotakFx } from '../../shared/kotak/render/fx';
import { AvatarLayer, type PlayerLook } from '../../shared/kotak/render/players';
import { RopeLayer } from '../../shared/kotak/render/rope';
import { checkerTexture, SolidLayer, stripeTexture, toyBlock } from '../../shared/kotak/render/solids';
import { KotakStage, type ShadowTier, type StageLook } from '../../shared/kotak/render/stage';
import { STEP } from '../../shared/kotak/sim';
import type { Solid } from '../../shared/kotak/solids';
import type { GfxTier } from '../common/gfx';
import type { Look, RouteId } from './course';
import { SACK_ID, type TaliMatch } from './logic';

interface RouteLook {
  stage: StageLook;
  colors: Record<Look, string>;
  /** Flag cloth. */
  flag: string;
  /** Far below: canyon floor, river or cloud sea. */
  deep: string;
  /** Backdrop blocks (mesas, bamboo, peaks). */
  far: string;
  far2: string;
}

const LOOKS: Record<RouteId, RouteLook> = {
  senja: {
    stage: {
      sky: '#FFB98A',
      fog: { color: '#FFC9A3', near: 45, far: 140 },
      sun: { color: '#FFD7A6', intensity: 2.3, dir: [-0.65, 0.62, 0.45] },
      hemi: { sky: '#FFE6CC', ground: '#8C4F33', intensity: 1.1 },
    },
    colors: {
      start: '#FFE7C4',
      save: '#FFC928',
      finish: '#FFF7F0',
      ground: '#C9794B',
      ground2: '#B4663E',
      plank: '#A86B42',
      mover: '#8A5A3B',
      climb: '#9C6648',
      beam: '#D9A066',
      bar: '#F2453D',
      pole: '#FFF7F0',
      lift: '#5A5D66',
    },
    flag: '#FF5A1F',
    deep: '#C98A63',
    far: '#F0B48A',
    far2: '#E39A6B',
  },
  bambu: {
    stage: {
      sky: '#BFE7CB',
      fog: { color: '#D5F0DB', near: 40, far: 130 },
      sun: { color: '#FFF4D6', intensity: 2.2, dir: [-0.4, 1, 0.5] },
      hemi: { sky: '#E6F7E8', ground: '#4F7F45', intensity: 1.15 },
    },
    colors: {
      start: '#F3EBC8',
      save: '#FFC928',
      finish: '#FFF7F0',
      ground: '#5FA65A',
      ground2: '#4D9249',
      plank: '#C9A15A',
      mover: '#C9A15A',
      climb: '#6E8F4F',
      beam: '#D8C36A',
      bar: '#F2453D',
      pole: '#FFF7F0',
      lift: '#5A5D66',
    },
    flag: '#F2453D',
    deep: '#3FA7C9',
    far: '#6DBA62',
    far2: '#9ACD6A',
  },
  salju: {
    stage: {
      sky: '#9FCBF2',
      fog: { color: '#BFDDF5', near: 45, far: 140 },
      sun: { color: '#FFFFFF', intensity: 2.1, dir: [-0.5, 0.9, 0.6] },
      hemi: { sky: '#EAF3FC', ground: '#7F98B3', intensity: 1.0 },
    },
    colors: {
      start: '#FFE7C4',
      save: '#FFC928',
      finish: '#FFF7F0',
      ground: '#DCE8F4',
      ground2: '#BFD3E8',
      plank: '#A7D3F2',
      mover: '#7FB3E0',
      climb: '#93ADC7',
      beam: '#A7D3F2',
      bar: '#F2453D',
      pole: '#FFF7F0',
      lift: '#5A5D66',
    },
    flag: '#2F8CFF',
    deep: '#FFFFFF',
    far: '#E8F0F8',
    far2: '#93ABC4',
  },
};

/** Routes' main colour (HUD accents and the picker). */
export const ROUTE_TINT: Record<RouteId, string> = { senja: '#FF8A3D', bambu: '#22B35E', salju: '#2F8CFF' };

export class TaliScene {
  readonly stage: KotakStage;
  readonly fx: KotakFx;
  readonly rope: RopeLayer;
  private solids: SolidLayer | null = null;
  private avatars: AvatarLayer | null = null;
  private readonly course = new THREE.Group();
  private readonly decor = new THREE.Group();
  private readonly sack: THREE.Group;
  private readonly textures: THREE.Texture[] = [];
  private readonly tagHost: HTMLElement;
  private loadedFor: unknown = null;
  private looks: PlayerLook[] = [];
  private deep: THREE.Mesh | null = null;
  private look: RouteLook = LOOKS.senja;

  constructor(host: HTMLElement, tagHost: HTMLElement, level: GfxTier, msaa: boolean, shadow: ShadowTier) {
    this.stage = new KotakStage(host, level, msaa, shadow, LOOKS.senja.stage);
    this.tagHost = tagHost;
    this.fx = new KotakFx(level);
    this.rope = new RopeLayer(this.stage, 4, level === 'low' ? 8 : 12);
    this.sack = this.buildSack();
    this.stage.scene.add(this.course, this.decor, this.fx.mesh, this.rope.mesh, this.sack);
  }

  setPlayers(looks: PlayerLook[]): void {
    this.looks = looks;
    this.avatars?.set(looks);
  }

  get players(): AvatarLayer | null {
    return this.avatars;
  }

  /** Build the current section (once per section). */
  load(m: TaliMatch): void {
    if (this.loadedFor === m.sim) return;
    this.loadedFor = m.sim;
    this.look = LOOKS[m.route];
    this.stage.setLook(this.look.stage);
    this.solids?.dispose();
    this.avatars?.dispose();
    this.course.clear();
    this.decor.clear();
    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    this.fx.clear();
    this.rope.reset();

    const st = this.stage;
    const L = this.look;
    const checker = checkerTexture('#FFC928', '#FFF7F0', 4);
    const finish = checkerTexture('#111214', '#FFF7F0', 6);
    const stripes = stripeTexture('#F2453D', '#FFF7F0');
    this.textures.push(checker, finish, stripes);

    const build = (s: Solid): THREE.Object3D | null => {
      const d = s.def;
      const look = (d.look ?? 'ground') as Look;
      const { x: hx, y: hy, z: hz } = d.half;
      switch (look) {
        case 'save': {
          const tex = checker.clone();
          tex.repeat.set(hx, hz);
          tex.needsUpdate = true;
          this.textures.push(tex);
          const g = toyBlock(st, L.colors.save, hx, hy, hz, { top: tex });
          g.add(this.flag(hx - 0.5, hy, -hz + 0.5, L.flag, 2.4));
          return g;
        }
        case 'start': {
          const g = toyBlock(st, L.colors.start, hx, hy, hz);
          g.add(this.flag(-hx + 0.6, hy, -hz + 0.5, L.flag, 2.4));
          return g;
        }
        case 'finish': {
          const tex = finish.clone();
          tex.repeat.set(hx, hz);
          tex.needsUpdate = true;
          this.textures.push(tex);
          const g = toyBlock(st, L.colors.finish, hx, hy, hz, { top: tex });
          g.add(this.flag(hx - 1.2, hy, 0, L.flag, 4.6));
          return g;
        }
        case 'bar': {
          const tex = stripes.clone();
          tex.repeat.set(hx, 1);
          tex.needsUpdate = true;
          this.textures.push(tex);
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
            st.material('#ffffff', { map: tex }),
          );
          bar.castShadow = true;
          return bar;
        }
        case 'pole': {
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(hx, hx * 1.2, hy * 2, 12),
            st.material(L.colors.pole),
          );
          pole.castShadow = true;
          const cap = new THREE.Mesh(new THREE.SphereGeometry(hx * 1.3, 12, 8), st.material('#F2453D'));
          cap.position.y = hy;
          pole.add(cap);
          return pole;
        }
        case 'climb':
          return this.climbWall(hx, hy, hz);
        case 'mover':
        case 'beam': {
          const g = toyBlock(st, L.colors[look], hx, hy, hz, { flat: true });
          // Plank lines across the top.
          const n = Math.max(2, Math.round(hx * 1.6));
          const dark = st.material(new THREE.Color(L.colors[look]).multiplyScalar(0.72));
          for (let i = 1; i < n; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, hz * 2), dark);
            line.position.set(-hx + (i * hx * 2) / n, hy + 0.005, 0);
            g.add(line);
          }
          return g;
        }
        case 'lift': {
          const g = toyBlock(st, L.colors.lift, hx, hy, hz, { flat: true });
          for (const z of [-hz + 0.12, hz - 0.12]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.16, 0.12), st.material('#FFC928'));
            rail.position.set(0, hy + 0.08, z);
            g.add(rail);
          }
          return g;
        }
        default:
          return toyBlock(st, L.colors[look] ?? L.colors.ground, hx, hy, hz);
      }
    };
    this.solids = new SolidLayer(m.sim, build);
    this.course.add(this.solids.group);
    this.buildDecor(m);
    this.avatars = new AvatarLayer(st, m.sim, this.tagHost);
    this.avatars.set(this.looks);
    this.course.add(this.avatars.group);
  }

  /** A tall wall with chunky handholds on the side the team climbs. */
  private climbWall(hx: number, hy: number, hz: number): THREE.Group {
    const st = this.stage;
    const g = toyBlock(st, this.look.colors.climb, hx, hy, hz);
    const holds = ['#FFC928', '#FF8A3D', '#22B35E', '#2F8CFF', '#F2453D'];
    const mats = holds.map((c) => st.material(c, { rough: 0.5 }));
    const geo = new THREE.BoxGeometry(0.22, 0.2, 0.34);
    let k = 0;
    const climbH = Math.min(hy * 2, 4.4);
    for (let y = hy - 0.5; y > hy - climbH; y -= 0.55) {
      for (let z = -hz + 0.5; z < hz - 0.3; z += 0.9) {
        k++;
        const m = new THREE.Mesh(geo, mats[k % mats.length]!);
        m.position.set(-hx - 0.08, y, z + ((k * 0.37) % 0.4) - 0.2);
        m.rotation.x = (k % 3) * 0.3;
        m.castShadow = true;
        g.add(m);
      }
    }
    return g;
  }

  private flag(x: number, y: number, z: number, color: string, height: number): THREE.Group {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, height, 6),
      this.stage.material('#FFF7F0'),
    );
    pole.position.set(x, y + height / 2, z);
    const w = height > 3 ? 1.5 : 0.8;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.62, 0.05), this.stage.material(color));
    cloth.position.set(x + w / 2 + 0.05, y + height - w * 0.34, z);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.stage.material('#FFC928'));
    knob.position.set(x, y + height + 0.08, z);
    g.add(pole, cloth, knob);
    g.traverse((o) => {
      (o as THREE.Mesh).castShadow = true;
    });
    return g;
  }

  private buildSack(): THREE.Group {
    const st = this.stage;
    const g = new THREE.Group();
    const burlap = st.material('#B98B5A', { rough: 0.95 });
    const band = st.material('#8A6238', { rough: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.62), burlap);
    body.position.y = 0.39;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.3), burlap);
    neck.position.y = 0.88;
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.34), band);
    tie.position.y = 0.8;
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.02), st.material('#E9D2A6'));
    patch.position.set(0, 0.42, 0.32);
    g.add(body, neck, tie, patch);
    g.traverse((o) => {
      (o as THREE.Mesh).castShadow = true;
    });
    g.visible = false;
    return g;
  }

  /** Backdrop of the route: far blocks, a floor far below, a few clouds. */
  private buildDecor(m: TaliMatch): void {
    const st = this.stage;
    const L = this.look;
    const x0 = -40;
    const x1 = m.section.finishX + 60;
    const deepY = m.section.killY + 1.5;
    const deep = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0 + 240, 300),
      st.light
        ? new THREE.MeshLambertMaterial({ color: L.deep })
        : new THREE.MeshStandardMaterial({
            color: L.deep,
            roughness: m.route === 'bambu' ? 0.35 : 0.95,
            metalness: 0,
          }),
    );
    deep.rotation.x = -Math.PI / 2;
    deep.position.set((x0 + x1) / 2, deepY, -40);
    deep.receiveShadow = true;
    this.decor.add(deep);
    this.deep = deep;
    const far = st.material(L.far);
    const far2 = st.material(L.far2);
    let seed = 11 + ['senja', 'bambu', 'salju'].indexOf(m.route) * 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const baseY = deepY;
    for (let x = x0; x < x1; x += 7 + rnd() * 9) {
      const z = -26 - rnd() * 34;
      if (m.route === 'bambu') {
        // Bamboo stalks: tall thin boxes with joints.
        const h = 14 + rnd() * 16;
        const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), rnd() > 0.5 ? far : far2);
        stalk.position.set(x, baseY + h / 2, z);
        this.decor.add(stalk);
        if (!st.light) {
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 1.2), far2);
          leaf.position.set(x + 1, baseY + h - 1, z);
          leaf.rotation.y = rnd() * 3;
          this.decor.add(leaf);
        }
      } else if (m.route === 'salju') {
        // Snowy peaks: stacked boxes narrowing upward, white caps.
        const w = 8 + rnd() * 10;
        const levels = 3 + Math.floor(rnd() * 3);
        for (let i = 0; i < levels; i++) {
          const k = 1 - i / levels;
          const b = new THREE.Mesh(
            new THREE.BoxGeometry(w * k, 4, w * k * 0.8),
            i >= levels - 1 ? far : far2,
          );
          b.position.set(x, baseY + 2 + i * 4, z);
          this.decor.add(b);
        }
      } else {
        // Mesas of layered rock, far behind so the dusk sky stays open.
        const w = 6 + rnd() * 10;
        const h = 5 + rnd() * 8;
        const zf = z - 18;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.7), rnd() > 0.5 ? far : far2);
        b.position.set(x, baseY + h / 2, zf);
        this.decor.add(b);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 1, w * 0.7 + 0.8), far2);
        cap.position.set(x, baseY + h, zf);
        this.decor.add(cap);
      }
    }
    const cloud = st.material('#FFFFFF');
    for (let x = x0; x < x1; x += 26 + rnd() * 20) {
      const c = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(3 + rnd() * 3, 1.3 + rnd(), 2.4 + rnd() * 2), cloud);
        b.position.set(i * 2.3, rnd() * 0.8, rnd() * 1.4);
        c.add(b);
      }
      c.position.set(x, m.section.solids[m.section.finish]!.pos.y + 14 + rnd() * 8, -48 - rnd() * 20);
      this.decor.add(c);
    }
  }

  frame(m: TaliMatch, dt: number): void {
    this.load(m);
    const t = m.sim.t - STEP + m.alpha * STEP;
    this.solids?.update(t);
    this.avatars?.update(m.alpha, dt);
    this.rope.update(m.sim, m.rope, m.alpha, dt);
    const s = m.sack ? m.sim.body(SACK_ID) : undefined;
    this.sack.visible = !!s?.active;
    if (s) {
      this.sack.position.set(
        lerp(s.prev.x, s.pos.x, m.alpha),
        lerp(s.prev.y, s.pos.y, m.alpha),
        lerp(s.prev.z, s.pos.z, m.alpha),
      );
      // Tumbles a little in the air.
      this.sack.rotation.z = s.ground < 0 ? Math.sin(m.sim.t * 9) * 0.25 : 0;
    }
    if (this.deep) this.deep.position.x = m.camera.view.focus.x;
    this.fx.update(dt);
    m.setAspect(this.stage.aspect);
    this.stage.applyView(m.camera.rig, m.camera.view);
    this.stage.render();
  }
}
