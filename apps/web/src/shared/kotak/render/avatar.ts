/**
 * Blocky fruit avatar for the box world: a cube head that is the player's fruit (colours, crown,
 * leaves or spikes made of little boxes, a face drawn on the front), a torso and arms in the
 * player's colour, dark legs, a coloured ring under the feet and, without shadow maps, a soft blob
 * shadow. `pose()` animates idle bob, running, jumping, tumbling, celebrating and the respawn blink.
 */
import type { Fruit } from '@hoorah/protocol';
import * as THREE from 'three';
import type { KotakStage } from './stage';

interface FruitLook {
  skin: string;
  /** Dots painted on the skin (seeds, dimples). */
  dots?: string;
  /** Darker shade for shells, bands and spikes. */
  accent: string;
  top: 'leaf' | 'crown' | 'spikes' | 'stem' | 'hair' | 'star';
  /** Watermelon rind band or avocado shell. */
  shell?: 'band' | 'back';
  /** Cheek and mouth tint. */
  blush: string;
}

const LOOKS: Record<Fruit, FruitLook> = {
  semangka: {
    skin: '#F2453D',
    dots: '#2A1D1A',
    accent: '#1E9E50',
    top: 'stem',
    shell: 'band',
    blush: '#FFB3A8',
  },
  alpukat: { skin: '#D4E88A', accent: '#3E7D27', top: 'stem', shell: 'back', blush: '#F4A08E' },
  durian: { skin: '#B5D152', accent: '#7FA82E', top: 'spikes', blush: '#F4A08E' },
  nanas: { skin: '#F5B700', dots: '#C98A00', accent: '#2E9E4F', top: 'crown', blush: '#FF8A5C' },
  jeruk: { skin: '#FF9A1F', dots: '#E07F0C', accent: '#2E9E4F', top: 'leaf', blush: '#FF6B4A' },
  stroberi: { skin: '#F2453D', dots: '#FFE066', accent: '#2E9E4F', top: 'star', blush: '#FFB3A8' },
  mangga: { skin: '#FFB21E', accent: '#2E9E4F', top: 'leaf', blush: '#FF7A1A' },
  rambutan: { skin: '#D7263D', accent: '#FF6B4A', top: 'hair', blush: '#FFB3A8' },
};

const LEGS = '#2B2F38';
const INK = '#111214';

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

type FaceKind = 'none' | 'happy' | 'wow';

/** Skin texture with dots; the front also gets the face. */
function skinCanvas(look: FruitLook, face: FaceKind): HTMLCanvasElement {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = s;
  cv.height = s;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.fillStyle = look.skin;
  g.fillRect(0, 0, s, s);
  if (look.dots) {
    g.fillStyle = look.dots;
    const spots: [number, number][] =
      face === 'none'
        ? [
            [24, 24],
            [70, 18],
            [108, 40],
            [20, 80],
            [64, 64],
            [104, 100],
            [40, 112],
          ]
        : [
            [20, 18],
            [64, 12],
            [104, 22],
            [14, 112],
            [112, 112],
            [62, 120],
          ];
    for (const [x, y] of spots) {
      g.beginPath();
      g.ellipse(x, y, 3.2, 4.4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (face === 'none') return cv;
  // Rosy cheeks, eyes with a highlight, a smile or an "o".
  g.fillStyle = look.blush;
  g.globalAlpha = 0.75;
  g.beginPath();
  g.arc(26, 78, 11, 0, Math.PI * 2);
  g.arc(102, 78, 11, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = INK;
  for (const x of [42, 86]) {
    g.beginPath();
    g.ellipse(x, 60, 8, 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#FFFFFF';
  for (const x of [45, 89]) {
    g.beginPath();
    g.arc(x, 56, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  if (face === 'happy') {
    g.arc(64, 78, 13, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  } else {
    g.ellipse(64, 88, 7, 9, 0, 0, Math.PI * 2);
    g.fill();
  }
  return cv;
}

const textureCache = new Map<string, THREE.CanvasTexture>();

function texture(look: FruitLook, face: FaceKind): THREE.CanvasTexture {
  const key = `${look.skin}|${look.dots ?? ''}|${look.blush}|${face}`;
  let t = textureCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(skinCanvas(look, face));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textureCache.set(key, t);
  }
  return t;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

function box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

let blobTexture: THREE.CanvasTexture | null = null;
function blob(): THREE.CanvasTexture {
  if (blobTexture) return blobTexture;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  blobTexture = new THREE.CanvasTexture(cv);
  return blobTexture;
}

export interface AvatarPose {
  /** Planar speed 0..1 of the top speed. */
  run: number;
  air: boolean;
  /** Vertical speed (m/s). */
  vy: number;
  /** Knocked (tumbling arms). */
  stunned: boolean;
  /** Respawn pause: blink. */
  frozen: boolean;
  /** Arms up. */
  cheer: boolean;
  /** Seconds, for cycles. */
  t: number;
}

export class BlockAvatar {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly shadow: THREE.Mesh | null;
  private readonly faceMat: THREE.MeshBasicMaterial | THREE.Material;
  private readonly happy: THREE.Texture;
  private readonly wow: THREE.Texture;
  private readonly torsoMat: THREE.Material & { color: THREE.Color };
  private readonly armMat: THREE.Material & { color: THREE.Color };
  private readonly ringMat: THREE.MeshBasicMaterial;
  private phase = Math.random() * 10;
  private stride = 0;

  constructor(stage: KotakStage, fruit: Fruit, color: string) {
    const look = LOOKS[fruit];
    const skin = stage.material('#ffffff', { map: texture(look, 'none'), rough: 0.6 });
    this.happy = texture(look, 'happy');
    this.wow = texture(look, 'wow');
    this.faceMat = stage.material('#ffffff', { map: this.happy, rough: 0.6 });
    const accent = stage.material(look.accent, { rough: 0.6 });
    this.torsoMat = stage.material(color, { rough: 0.55 }) as THREE.Material & { color: THREE.Color };
    this.armMat = stage.material(shade(color, 0.82), { rough: 0.55 }) as THREE.Material & {
      color: THREE.Color;
    };
    const legMat = stage.material(LEGS, { rough: 0.8 });

    // Legs pivot at the hips (y 0.48).
    for (const [leg, x] of [
      [this.legL, -0.13],
      [this.legR, 0.13],
    ] as const) {
      leg.position.set(x, 0.48, 0);
      leg.add(box(legMat, 0.2, 0.48, 0.24, 0, -0.24, 0));
      this.body.add(leg);
    }
    // Torso with a lighter belly patch.
    this.body.add(box(this.torsoMat, 0.56, 0.5, 0.36, 0, 0.73, 0));
    this.body.add(box(stage.material('#FFF7F0', { rough: 0.7 }), 0.3, 0.2, 0.02, 0, 0.7, 0.185));
    // Arms pivot at the shoulders.
    for (const [arm, x] of [
      [this.armL, -0.36],
      [this.armR, 0.36],
    ] as const) {
      arm.position.set(x, 0.94, 0);
      arm.add(box(this.armMat, 0.16, 0.44, 0.2, 0, -0.2, 0));
      arm.add(box(skin, 0.17, 0.12, 0.21, 0, -0.44, 0));
      this.body.add(arm);
    }
    // Head: front face (+z) carries the face texture.
    const s = 0.64;
    const headMesh = new THREE.Mesh(BOX, [skin, skin, skin, skin, this.faceMat, skin]);
    headMesh.scale.set(s, s, s);
    this.head.add(headMesh);
    this.head.position.set(0, 0.98 + s / 2, 0);
    this.addTop(look, accent, stage, s);
    this.body.add(this.head);
    this.root.add(this.body);

    // Coloured ring at the feet: who is who, even in the dark.
    this.ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 28), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);

    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m !== this.ring) {
        m.castShadow = true;
        m.receiveShadow = false;
      }
    });
    if (stage.light || !stage.shadowsOn) {
      this.shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 1.1),
        new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false }),
      );
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.renderOrder = 1;
    } else this.shadow = null;
  }

  private addTop(look: FruitLook, accent: THREE.Material, stage: KotakStage, s: number): void {
    const top = s / 2;
    const stem = stage.material('#6B4423', { rough: 0.8 });
    const h = this.head;
    switch (look.top) {
      case 'stem':
        h.add(box(stem, 0.07, 0.16, 0.07, 0, top + 0.08, 0));
        if (look.shell === 'band') {
          // Watermelon rind: a green band around the lower head.
          h.add(box(accent, s + 0.04, 0.12, s + 0.04, 0, -top + 0.06, 0));
        } else if (look.shell === 'back') {
          // Avocado shell on the back of the head.
          h.add(box(accent, s + 0.04, s + 0.04, 0.1, 0, 0, -top - 0.03));
        }
        break;
      case 'leaf':
        h.add(box(stem, 0.07, 0.12, 0.07, 0, top + 0.06, 0));
        h.add(box(accent, 0.26, 0.05, 0.14, 0.13, top + 0.12, 0).rotateZ(0.35));
        break;
      case 'crown':
        for (let i = -1; i <= 1; i++) {
          const leaf = box(
            accent,
            0.1,
            0.34 - Math.abs(i) * 0.08,
            0.1,
            i * 0.1,
            top + 0.15 - Math.abs(i) * 0.04,
            0,
          );
          leaf.rotation.z = -i * 0.35;
          h.add(leaf);
        }
        break;
      case 'star':
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const leaf = box(accent, 0.1, 0.04, 0.26, Math.sin(a) * 0.12, top + 0.02, Math.cos(a) * 0.12);
          leaf.rotation.y = a;
          h.add(leaf);
        }
        h.add(box(stem, 0.06, 0.12, 0.06, 0, top + 0.08, 0));
        break;
      case 'spikes':
      case 'hair': {
        const cone = new THREE.ConeGeometry(
          look.top === 'spikes' ? 0.07 : 0.04,
          look.top === 'spikes' ? 0.14 : 0.16,
          4,
        );
        const spots: [number, number, number, number, number][] = [];
        for (const x of [-0.18, 0, 0.18])
          for (const z of [-0.18, 0, 0.18]) spots.push([x, top + 0.06, z, 0, 0]);
        for (const y of [-0.12, 0.12]) {
          spots.push([top + 0.06, y, 0, 0, -Math.PI / 2]);
          spots.push([-top - 0.06, y, 0, 0, Math.PI / 2]);
          spots.push([0, y, -top - 0.06, -Math.PI / 2, 0]);
        }
        for (const [x, y, z, rx, rz] of spots) {
          const m = new THREE.Mesh(cone, accent);
          m.position.set(x, y, z);
          m.rotation.set(rx, 0, rz);
          h.add(m);
        }
        if (look.top === 'spikes') h.add(box(stem, 0.06, 0.14, 0.06, 0, top + 0.13, 0));
        break;
      }
    }
  }

  /** Scene parts to add (the blob shadow lives outside the root so it stays on the ground). */
  get objects(): THREE.Object3D[] {
    return this.shadow ? [this.root, this.shadow] : [this.root];
  }

  setColor(color: string): void {
    this.torsoMat.color.set(color);
    this.armMat.color.set(shade(color, 0.82));
    this.ringMat.color.set(color);
  }

  /** Position (feet), facing and the ground under the feet (null = nothing below). */
  place(x: number, y: number, z: number, yaw: number, groundY: number | null): void {
    this.root.position.set(x, y, z);
    this.body.rotation.y = yaw;
    const onGround = groundY !== null && y - groundY < 0.05;
    this.ring.visible = groundY !== null;
    if (groundY !== null) this.ring.position.y = groundY - y + 0.03;
    if (this.shadow) {
      this.shadow.visible = groundY !== null;
      if (groundY !== null) {
        const k = Math.max(0.35, 1 - (y - groundY) * 0.18);
        this.shadow.position.set(x, groundY + 0.025, z);
        this.shadow.scale.setScalar(k);
      }
    }
    this.ringMat.opacity = onGround ? 0.85 : 0.5;
  }

  /** Brighter ring (dark rounds). */
  setGlow(on: boolean): void {
    this.ringMat.opacity = on ? 1 : 0.85;
    this.ring.scale.setScalar(on ? 1.25 : 1);
  }

  setVisible(on: boolean): void {
    this.root.visible = on;
    if (this.shadow) this.shadow.visible = on && this.shadow.visible;
  }

  pose(p: AvatarPose, dt: number): void {
    this.phase += dt;
    const run = Math.min(1, p.run);
    this.stride += dt * (6 + run * 9);
    const swing = Math.sin(this.stride) * 0.95 * run;
    let armL = -swing * 0.9;
    let armR = swing * 0.9;
    let legL = swing;
    let legR = -swing;
    let bob = Math.abs(Math.cos(this.stride)) * 0.06 * run;
    let tilt = run * 0.12;
    if (run < 0.05 && !p.air) {
      // Idle breathing.
      bob = Math.sin(this.phase * 2.4) * 0.015;
      armL = 0.06;
      armR = -0.06;
      legL = 0;
      legR = 0;
      tilt = 0;
    }
    if (p.air) {
      const up = p.vy > 0;
      armL = up ? -2.6 : -1.9;
      armR = up ? -2.6 : -1.9;
      legL = up ? 0.6 : -0.3;
      legR = up ? -0.2 : 0.4;
      bob = 0;
      tilt = up ? -0.08 : 0.1;
    }
    if (p.stunned) {
      const w = this.phase * 22;
      armL = -2.2 + Math.sin(w) * 0.9;
      armR = -2.2 + Math.cos(w) * 0.9;
      legL = Math.sin(w * 0.8) * 0.7;
      legR = -legL;
      tilt = -0.25;
    }
    if (p.cheer) {
      const w = this.phase * 9;
      armL = -2.8 + Math.sin(w) * 0.3;
      armR = -2.8 - Math.sin(w) * 0.3;
      bob = Math.abs(Math.sin(w * 0.5)) * 0.18;
    }
    this.armL.rotation.x = armL;
    this.armR.rotation.x = armR;
    this.legL.rotation.x = legL;
    this.legR.rotation.x = legR;
    this.body.position.y = bob;
    this.body.rotation.x = tilt;
    // Squash when landing hard is handled by the caller through `squash`.
    const face = p.air || p.stunned ? this.wow : this.happy;
    const fm = this.faceMat as THREE.MeshLambertMaterial;
    if (fm.map !== face) {
      fm.map = face;
      fm.needsUpdate = true;
    }
    this.body.visible = !p.frozen || Math.floor(this.phase * 10) % 2 === 0;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry !== BOX) m.geometry.dispose();
    });
    this.shadow?.geometry.dispose();
  }
}
