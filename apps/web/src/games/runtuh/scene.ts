/**
 * Lantai Runtuh 3D world on the shared box-world renderer: a quiz show stage at night. The tile
 * grid floats over a dark pit inside a frame of chasing marquee bulbs, with a backdrop and soft
 * spotlight beams. Tiles show what the round asks about (colour, symbol, number), flash white or
 * red while they crumble, glow yellow when they are the safe answer, and the lights drop for Gelap.
 */
import * as THREE from 'three';
import { DEFAULT_RIG, GroupCamera } from '../../shared/kotak/camera';
import { KotakFx } from '../../shared/kotak/render/fx';
import { AvatarLayer, type PlayerLook } from '../../shared/kotak/render/players';
import { SolidLayer, toyBlock } from '../../shared/kotak/render/solids';
import { KotakStage, type ShadowTier, type StageLook } from '../../shared/kotak/render/stage';
import { STEP } from '../../shared/kotak/sim';
import type { Solid } from '../../shared/kotak/solids';
import type { GfxTier } from '../common/gfx';
import { COLOR_HEX, COLS, ROWS, TILE, type TileFace } from './arena';
import type { Rule, RuntuhMatch } from './logic';

const LOOK: StageLook = {
  sky: '#12141B',
  fog: { color: '#12141B', near: 30, far: 70 },
  sun: { color: '#FFF1D6', intensity: 2.2, dir: [-0.3, 1, 0.45] },
  hemi: { sky: '#C9D8FF', ground: '#2A2D36', intensity: 1.05 },
};

type Mode = 'color' | 'number' | 'symbol';

function modeOf(rule: Rule): Mode {
  if (rule === 'angka') return 'number';
  if (rule === 'simbol') return 'symbol';
  return 'color';
}

function drawSymbol(
  g: CanvasRenderingContext2D,
  symbol: TileFace['symbol'],
  cx: number,
  cy: number,
  r: number,
): void {
  g.beginPath();
  switch (symbol) {
    case 'bintang':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      break;
    case 'bulan':
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(cx + r * 0.45, cy - r * 0.25, r * 0.85, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      break;
    case 'hati':
      g.moveTo(cx, cy + r * 0.85);
      g.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.7, cy - r * 1.05, cx, cy - r * 0.45);
      g.bezierCurveTo(cx + r * 0.7, cy - r * 1.05, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.85);
      g.fill();
      break;
    case 'segitiga':
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 0.95, cy + r * 0.75);
      g.lineTo(cx - r * 0.95, cy + r * 0.75);
      g.closePath();
      g.fill();
      break;
  }
}

const faceCache = new Map<string, THREE.CanvasTexture>();

function faceTexture(mode: Mode, f: TileFace): THREE.CanvasTexture {
  const key =
    mode === 'color' ? `c|${f.color}` : mode === 'number' ? `n|${f.number}` : `s|${f.color}|${f.symbol}`;
  let t = faceCache.get(key);
  if (t) return t;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = s;
  cv.height = s;
  const g = cv.getContext('2d');
  if (g) {
    const base = mode === 'number' ? '#FFF7F0' : COLOR_HEX[f.color];
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 6;
    g.strokeRect(6, 6, s - 12, s - 12);
    if (mode === 'number') {
      g.fillStyle = '#111214';
      g.font = '800 92px "Baloo 2", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(f.number), s / 2, s / 2 + 6);
    } else if (mode === 'symbol') {
      g.fillStyle = 'rgba(17,18,20,0.35)';
      drawSymbol(g, f.symbol, s / 2 + 3, s / 2 + 4, 36);
      g.fillStyle = '#FFFFFF';
      drawSymbol(g, f.symbol, s / 2, s / 2, 36);
    }
  }
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  faceCache.set(key, t);
  return t;
}

interface TileView {
  top: THREE.Mesh;
  mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
}

export class RuntuhScene {
  readonly stage: KotakStage;
  readonly fx: KotakFx;
  readonly camera: GroupCamera;
  readonly players: AvatarLayer;
  private readonly solids: SolidLayer;
  private readonly tiles: TileView[] = [];
  private readonly bulbs: THREE.Mesh[] = [];
  private readonly bulbMats: THREE.MeshBasicMaterial[] = [];
  private readonly beams: THREE.Mesh[] = [];
  private faceVersion = -1;
  private ruleShown: Rule | null = null;
  private light = 1;
  private reveal = 0;
  private t = 0;

  constructor(
    host: HTMLElement,
    tagHost: HTMLElement,
    level: GfxTier,
    msaa: boolean,
    shadow: ShadowTier,
    private readonly m: RuntuhMatch,
  ) {
    this.stage = new KotakStage(host, level, msaa, shadow, LOOK);
    this.fx = new KotakFx(level);
    const st = this.stage;
    this.solids = new SolidLayer(m.sim, (s: Solid) => {
      const g = toyBlock(st, '#3A3C42', s.def.half.x, s.def.half.y, s.def.half.z, {
        top: faceTexture('color', m.faces[s.id]!),
      });
      const top = g.children[1] as THREE.Mesh;
      this.tiles[s.id] = { top, mat: top.material as TileView['mat'] };
      return g;
    });
    this.solids.onWarn = (s, _obj, k) => {
      const tv = this.tiles[s.id];
      if (!tv) return;
      const on = Math.floor(k * (8 + k * 10)) % 2 === 0;
      tv.mat.emissive.set(this.m.rule === 'gelombang' ? '#FF3B2E' : '#FFFFFF');
      tv.mat.emissiveIntensity = on ? 0.9 : 0.15;
    };
    st.scene.add(this.solids.group, this.fx.mesh);
    this.buildSet();
    this.players = new AvatarLayer(st, m.sim, tagHost);
    st.scene.add(this.players.group);
    this.camera = new GroupCamera(
      {
        ...DEFAULT_RIG,
        fov: 36,
        pitch: 0.92,
        minDist: 22,
        maxDist: 34,
        fill: 0.86,
        lead: { x: 0, y: 0, z: 0.6 },
      },
      st.aspect,
    );
    this.frameStage();
  }

  setPlayers(looks: PlayerLook[]): void {
    this.players.set(looks);
  }

  private frameStage(): void {
    const hx = (COLS * TILE) / 2 + 0.6;
    const hz = (ROWS * TILE) / 2 + 0.6;
    this.camera.aspect = this.stage.aspect;
    this.camera.snap([
      { x: -hx, y: 0, z: -hz },
      { x: hx, y: 0, z: -hz },
      { x: -hx, y: 0, z: hz },
      { x: hx, y: 0, z: hz },
      { x: 0, y: 2, z: -hz },
    ]);
  }

  /** Stage frame with marquee bulbs, the backdrop and spotlight beams. */
  private buildSet(): void {
    const st = this.stage;
    const w = COLS * TILE;
    const d = ROWS * TILE;
    const rim = st.material('#23252C', { rough: 0.5 });
    const trim = st.material('#FFC928', { rough: 0.4 });
    const frame = new THREE.Group();
    const bar = (x: number, z: number, sx: number, sz: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), rim);
      b.position.set(x, -0.45, z);
      b.receiveShadow = true;
      frame.add(b);
      const t = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), trim);
      t.position.set(x, -0.19, z);
      frame.add(t);
    };
    bar(0, -d / 2 - 0.55, w + 2.2, 0.9);
    bar(0, d / 2 + 0.55, w + 2.2, 0.9);
    bar(-w / 2 - 0.55, 0, 0.9, d);
    bar(w / 2 + 0.55, 0, 0.9, d);
    st.scene.add(frame);
    // Chasing bulbs along the front and the sides.
    const bulbGeo = new THREE.BoxGeometry(0.22, 0.14, 0.22);
    const addBulb = (x: number, z: number) => {
      const mat = new THREE.MeshBasicMaterial({ color: '#FFC928' });
      const b = new THREE.Mesh(bulbGeo, mat);
      b.position.set(x, -0.1, z);
      this.bulbs.push(b);
      this.bulbMats.push(mat);
      st.scene.add(b);
    };
    for (let x = -w / 2 - 0.5; x <= w / 2 + 0.5; x += 0.9) {
      addBulb(x, d / 2 + 0.55);
      addBulb(x, -d / 2 - 0.55);
    }
    for (let z = -d / 2; z <= d / 2; z += 0.9) {
      addBulb(-w / 2 - 0.55, z);
      addBulb(w / 2 + 0.55, z);
    }
    // Backdrop: a dark wall with a lit sign frame.
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w + 14, 9, 0.6),
      st.material('#1A1C23', { rough: 0.9 }),
    );
    wall.position.set(0, 2.5, -d / 2 - 6);
    wall.receiveShadow = true;
    st.scene.add(wall);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(12, 2.2, 0.3),
      st.material('#2A2D36', { emissive: '#331F05' }),
    );
    sign.position.set(0, 4.6, -d / 2 - 5.6);
    st.scene.add(sign);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? '#FF8A3D' : '#FFC928' });
      const b = new THREE.Mesh(bulbGeo, mat);
      const k = i / 17;
      b.position.set(-6 + k * 12, i % 2 ? 5.75 : 3.45, -d / 2 - 5.4);
      this.bulbs.push(b);
      this.bulbMats.push(mat);
      st.scene.add(b);
    }
    if (!st.light) {
      // Soft beams from lamps above the backdrop.
      const beamGeo = new THREE.ConeGeometry(3.2, 16, 20, 1, true);
      for (const x of [-9, 0, 9]) {
        const beam = new THREE.Mesh(
          beamGeo,
          new THREE.MeshBasicMaterial({
            color: '#FFE9B8',
            transparent: true,
            opacity: 0.06,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        );
        beam.position.set(x, 6, -3);
        beam.rotation.x = 0.35;
        beam.rotation.z = x * -0.02;
        this.beams.push(beam);
        st.scene.add(beam);
      }
    }
  }

  /** Lights up again for a moment (Gelap: the drop is shown). */
  flashReveal(): void {
    this.reveal = 1;
  }

  private refreshFaces(): void {
    const m = this.m;
    if (this.faceVersion === m.faceVersion && this.ruleShown === m.rule) return;
    this.faceVersion = m.faceVersion;
    this.ruleShown = m.rule;
    const mode = modeOf(m.rule);
    for (let i = 0; i < this.tiles.length; i++) {
      const tv = this.tiles[i];
      const f = m.faces[i];
      if (!tv || !f) continue;
      const tex = faceTexture(mode, f);
      if (tv.mat.map !== tex) {
        tv.mat.map = tex;
        tv.mat.needsUpdate = true;
      }
    }
  }

  frame(alpha: number, dt: number): void {
    const m = this.m;
    this.t += dt;
    this.refreshFaces();
    const simT = m.sim.t - STEP + alpha * STEP;
    // Glow and calm tiles (warning tiles are set by the layer's onWarn).
    const pulse = 0.55 + 0.35 * Math.sin(this.t * 7);
    for (let i = 0; i < this.tiles.length; i++) {
      const tv = this.tiles[i]!;
      const s = m.sim.solids[i]!;
      if (s.state === 'warn') continue;
      if (m.glow.has(i)) {
        tv.mat.emissive.set('#FFC928');
        tv.mat.emissiveIntensity = m.dark ? 1.1 : pulse * 0.6;
      } else {
        tv.mat.emissiveIntensity = 0;
      }
    }
    this.solids.update(simT);
    this.players.update(alpha, dt);
    // Lights: down in the dark round, a bright flash on reveal.
    this.reveal = Math.max(0, this.reveal - dt * 1.4);
    const target = m.dark ? 0.12 : 1;
    this.light += (Math.max(target, this.reveal) - this.light) * Math.min(1, dt * 6);
    this.stage.hemi.intensity = LOOK.hemi.intensity * this.light;
    this.stage.sun.intensity = LOOK.sun.intensity * this.light;
    this.players.setGlow(m.dark);
    for (const b of this.beams) (b.material as THREE.MeshBasicMaterial).opacity = 0.06 * this.light;
    // Chasing marquee bulbs.
    const step = Math.floor(this.t * 8);
    for (let i = 0; i < this.bulbMats.length; i++) {
      const on = (i + step) % 3 !== 0;
      this.bulbMats[i]!.color.set(on ? (i % 2 ? '#FF8A3D' : '#FFC928') : '#5A4A2A');
    }
    this.fx.update(dt);
    if (Math.abs(this.camera.aspect - this.stage.aspect) > 0.001) this.frameStage();
    this.stage.applyView(this.camera.rig, this.camera.view);
    this.stage.render();
  }
}
