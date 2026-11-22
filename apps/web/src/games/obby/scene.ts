/**
 * Obby 3D world on the shared box-world renderer: a toy island course over a bright sea under a
 * sunny sky. Platforms are chunky plastic blocks in primary colours, save pads are yellow and
 * white checks with a flag, the finish has a chequered arch, the sweeper bar is red and white,
 * conveyors scroll their arrows and springs are red pads on a white coil.
 */
import * as THREE from 'three';
import { KotakFx } from '../../shared/kotak/render/fx';
import { AvatarLayer, type PlayerLook } from '../../shared/kotak/render/players';
import { checkerTexture, SolidLayer, stripeTexture, toyBlock } from '../../shared/kotak/render/solids';
import { KotakStage, type ShadowTier, type StageLook } from '../../shared/kotak/render/stage';
import { STEP } from '../../shared/kotak/sim';
import type { Solid } from '../../shared/kotak/solids';
import type { GfxTier } from '../common/gfx';
import type { Look } from './course';
import type { ObbyMatch } from './logic';

const LOOK: StageLook = {
  sky: '#9FD9FF',
  fog: { color: '#BFE6FF', near: 60, far: 150 },
  sun: { color: '#FFF4DE', intensity: 2.4, dir: [-0.45, 1, 0.55] },
  hemi: { sky: '#DDF1FF', ground: '#7FB7D9', intensity: 1.15 },
};

const COLOR: Record<Look, string> = {
  start: '#FFF7F0',
  save: '#FFC928',
  finish: '#FFF7F0',
  red: '#F2453D',
  blue: '#2F8CFF',
  green: '#22B35E',
  yellow: '#FFC928',
  orange: '#FF8A3D',
  teal: '#14B8A6',
  fragile: '#FFD84D',
  belt: '#3A3C42',
  spring: '#F2453D',
  bar: '#F2453D',
  pole: '#FFF7F0',
};

function arrowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = '#3A3C42';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#FFC928';
    // Chevron pointing to -x (the belt runs against the race).
    g.beginPath();
    g.moveTo(14, 32);
    g.lineTo(34, 12);
    g.lineTo(46, 12);
    g.lineTo(26, 32);
    g.lineTo(46, 52);
    g.lineTo(34, 52);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function crackTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = '#FFD84D';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#C99A12';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(8, 10);
    g.lineTo(28, 30);
    g.lineTo(22, 50);
    g.moveTo(28, 30);
    g.lineTo(54, 24);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.strokeRect(3, 3, 58, 58);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ObbyScene {
  readonly stage: KotakStage;
  readonly fx: KotakFx;
  private solids: SolidLayer | null = null;
  private avatars: AvatarLayer | null = null;
  private readonly course = new THREE.Group();
  private readonly decor = new THREE.Group();
  private readonly belts: { tex: THREE.Texture; speed: number; len: number }[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly tagHost: HTMLElement;
  private loadedFor: unknown = null;
  private looks: PlayerLook[] = [];
  private sea: THREE.Mesh | null = null;

  constructor(host: HTMLElement, tagHost: HTMLElement, level: GfxTier, msaa: boolean, shadow: ShadowTier) {
    this.stage = new KotakStage(host, level, msaa, shadow, LOOK);
    this.tagHost = tagHost;
    this.fx = new KotakFx(level);
    this.stage.scene.add(this.course, this.decor, this.fx.mesh);
  }

  setPlayers(looks: PlayerLook[]): void {
    this.looks = looks;
    this.avatars?.set(looks);
  }

  get players(): AvatarLayer | null {
    return this.avatars;
  }

  /** Build the course of the match's current track (once per track). */
  load(m: ObbyMatch): void {
    if (this.loadedFor === m.sim) return;
    this.loadedFor = m.sim;
    this.solids?.dispose();
    this.avatars?.dispose();
    this.course.clear();
    this.decor.clear();
    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    this.belts.length = 0;
    this.fx.clear();

    const st = this.stage;
    const checker = checkerTexture('#FFC928', '#FFF7F0', 4);
    const finish = checkerTexture('#111214', '#FFF7F0', 6);
    const stripes = stripeTexture('#F2453D', '#FFF7F0');
    const start = stripeTexture('#FFF7F0', '#FFE7C4');
    const crack = crackTexture();
    this.textures.push(checker, finish, stripes, start, crack);

    const build = (s: Solid): THREE.Object3D | null => {
      const d = s.def;
      const look = (d.look ?? 'blue') as Look;
      const { x: hx, y: hy, z: hz } = d.half;
      switch (look) {
        case 'save': {
          const tex = checker.clone();
          tex.repeat.set(hx, hz);
          tex.needsUpdate = true;
          this.textures.push(tex);
          const g = toyBlock(st, COLOR.save, hx, hy, hz, { top: tex });
          g.add(this.flag(hx - 0.4, hy, -hz + 0.4, '#FF5A1F'));
          return g;
        }
        case 'finish': {
          const tex = finish.clone();
          tex.repeat.set(hx, hz);
          tex.needsUpdate = true;
          this.textures.push(tex);
          const g = toyBlock(st, '#FFF7F0', hx, hy, hz, { top: tex });
          g.add(this.arch(-hx + 1.2, hy, hz));
          return g;
        }
        case 'start': {
          const tex = start.clone();
          tex.repeat.set(hx / 2, hz / 2);
          tex.needsUpdate = true;
          this.textures.push(tex);
          return toyBlock(st, '#FFE7C4', hx, hy, hz, { top: tex });
        }
        case 'fragile': {
          const g = toyBlock(st, COLOR.fragile, hx, hy, hz, { top: crack, flat: true });
          g.userData.flash = true;
          return g;
        }
        case 'belt': {
          const tex = arrowTexture();
          tex.repeat.set(hx, hz);
          this.textures.push(tex);
          const speed = Math.abs(d.conveyor?.x ?? 0);
          this.belts.push({ tex, speed, len: 2 });
          const g = toyBlock(st, '#5A5D66', hx, hy, hz, { top: tex });
          // Yellow side rails.
          for (const z of [-hz - 0.08, hz + 0.08]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.22, 0.16), st.material('#FFC928'));
            rail.position.set(0, hy - 0.05, z);
            rail.castShadow = true;
            g.add(rail);
          }
          return g;
        }
        case 'spring': {
          const g = new THREE.Group();
          const coil = new THREE.Mesh(
            new THREE.CylinderGeometry(hx * 0.7, hx * 0.7, hy * 2, 12),
            st.material('#E9E2D6'),
          );
          g.add(coil);
          const pad = new THREE.Mesh(
            new THREE.CylinderGeometry(hx * 0.95, hx * 0.95, 0.12, 16),
            st.material(COLOR.spring),
          );
          pad.position.y = hy;
          pad.castShadow = true;
          g.add(pad);
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
            st.material(COLOR.pole),
          );
          pole.castShadow = true;
          const cap = new THREE.Mesh(new THREE.SphereGeometry(hx * 1.3, 12, 8), st.material('#F2453D'));
          cap.position.y = hy;
          pole.add(cap);
          return pole;
        }
        default:
          return toyBlock(st, COLOR[look] ?? '#2F8CFF', hx, hy, hz);
      }
    };
    this.solids = new SolidLayer(m.sim, build);
    this.solids.onWarn = (_s, obj, k) => {
      const top = obj.children[1] as THREE.Mesh | undefined;
      const mat = top?.material as THREE.MeshStandardMaterial | undefined;
      if (!mat?.color) return;
      const on = Math.floor(k * 10) % 2 === 0;
      mat.color.set(on ? '#FFFFFF' : '#FF8A3D');
    };
    this.course.add(this.solids.group);
    this.buildDecor(m);
    this.avatars = new AvatarLayer(st, m.sim, this.tagHost);
    this.avatars.set(this.looks);
    this.course.add(this.avatars.group);
    // A restored tile gets its colour back.
    for (const s of m.sim.solids) if (s.def.look === 'fragile') this.resetTile(s.id);
  }

  /** Restore a fragile tile's colour (it flashed while warning). */
  resetTile(id: number): void {
    const obj = this.solids?.object(id);
    const top = obj?.children[1] as THREE.Mesh | undefined;
    const mat = top?.material as THREE.MeshStandardMaterial | undefined;
    mat?.color?.set('#FFFFFF');
  }

  private flag(x: number, y: number, z: number, color: string): THREE.Group {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6),
      this.stage.material('#FFF7F0'),
    );
    pole.position.set(x, y + 1.1, z);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), this.stage.material(color));
    cloth.position.set(x + 0.37, y + 1.95, z);
    g.add(pole, cloth);
    g.traverse((o) => {
      (o as THREE.Mesh).castShadow = true;
    });
    return g;
  }

  private arch(x: number, y: number, hz: number): THREE.Group {
    const g = new THREE.Group();
    const white = this.stage.material('#FFF7F0');
    for (const z of [-hz + 0.3, hz - 0.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), white);
      post.position.set(x, y + 1.8, z);
      g.add(post);
    }
    const tex = checkerTexture('#111214', '#FFF7F0', 2);
    tex.repeat.set(hz * 2, 1);
    this.textures.push(tex);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.8, hz * 2),
      this.stage.material('#ffffff', { map: tex }),
    );
    banner.position.set(x, y + 3.7, 0);
    g.add(banner);
    g.traverse((o) => {
      (o as THREE.Mesh).castShadow = true;
    });
    return g;
  }

  /** Sea, distant toy islands and puffy box clouds. */
  private buildDecor(m: ObbyMatch): void {
    const st = this.stage;
    const x0 = -40;
    const x1 = m.course.finishX + 60;
    const seaY = m.course.killY + 3;
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0 + 200, 260),
      st.light
        ? new THREE.MeshLambertMaterial({ color: '#48B4E6' })
        : new THREE.MeshStandardMaterial({ color: '#48B4E6', roughness: 0.35, metalness: 0 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set((x0 + x1) / 2, seaY, -40);
    sea.receiveShadow = true;
    this.decor.add(sea);
    this.sea = sea;
    const sand = st.material('#FFE2A8');
    const leaf = st.material('#22B35E');
    const trunk = st.material('#B97A4A');
    const cloudMat = st.material('#FFFFFF');
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let x = x0; x < x1; x += 22 + rnd() * 16) {
      const z = -30 - rnd() * 30;
      const w = 6 + rnd() * 8;
      const island = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, w * 0.7), sand);
      island.position.set(x, seaY + 0.4, z);
      this.decor.add(island);
      if (!st.light || rnd() > 0.5) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), trunk);
        t.position.set(x, seaY + 2.8, z);
        const crown = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 2.6), leaf);
        crown.position.set(x, seaY + 4.9, z);
        crown.rotation.y = rnd();
        this.decor.add(t, crown);
      }
    }
    for (let x = x0; x < x1; x += 30 + rnd() * 20) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(3 + rnd() * 3, 1.4 + rnd(), 2.5 + rnd() * 2),
          cloudMat,
        );
        b.position.set(i * 2.4, rnd() * 0.8, rnd() * 1.5);
        c.add(b);
      }
      c.position.set(x, 16 + rnd() * 8, -45 - rnd() * 25);
      this.decor.add(c);
    }
  }

  frame(m: ObbyMatch, dt: number): void {
    this.load(m);
    const t = m.sim.t - STEP + m.alpha * STEP;
    this.solids?.update(t);
    this.avatars?.update(m.alpha, dt);
    for (const b of this.belts) b.tex.offset.x = ((t * b.speed) / b.len) % 1;
    if (this.sea) this.sea.position.x = m.camera.view.focus.x;
    this.fx.update(dt);
    m.setAspect(this.stage.aspect);
    this.stage.applyView(m.camera.rig, m.camera.view);
    this.stage.render();
  }
}
