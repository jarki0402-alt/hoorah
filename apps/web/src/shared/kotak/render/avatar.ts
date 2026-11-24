/**
 * Blocky player avatar for the box world (owner 2026-11-24: players are cast characters, not
 * fruits): a cube head in the player's skin tone with a face drawn on the front, hair, a veil or a
 * hat built from little boxes in the player's hair colour, a torso and arms in the outfit colour,
 * dark legs, a ring in the player colour under the feet and, without shadow maps, a soft blob
 * shadow. `pose()` animates idle bob, running, jumping, tumbling, celebrating and the respawn blink.
 */
import { type Fruit, type Look, lookOfFruit } from '@hoorah/protocol';
import * as THREE from 'three';
import { type Person, resolveLook, SKIN_PALETTE } from '../../art/people';
import type { KotakStage } from './stage';

const LEGS = '#2B2F38';
const INK = '#1B1B22';
const BLUSH = '#FF8A8A';

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

type FaceKind = 'none' | 'happy' | 'wow';

/** Skin texture; the front also gets the face and the face accessories (glasses, beard, freckles). */
function skinCanvas(p: Person, face: FaceKind): HTMLCanvasElement {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = s;
  cv.height = s;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.fillStyle = SKIN_PALETTE[p.skin - 1] ?? SKIN_PALETTE[1];
  g.fillRect(0, 0, s, s);
  if (face === 'none') return cv;
  const has = (a: string) => (p.acc as readonly string[]).includes(a);
  if (has('beard')) {
    g.fillStyle = p.hairColor;
    g.beginPath();
    g.moveTo(8, 70);
    g.quadraticCurveTo(64, 150, 120, 70);
    g.lineTo(120, 128);
    g.lineTo(8, 128);
    g.closePath();
    g.fill();
  }
  g.fillStyle = BLUSH;
  g.globalAlpha = 0.55;
  g.beginPath();
  g.arc(26, 80, 10, 0, Math.PI * 2);
  g.arc(102, 80, 10, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  if (has('freckles')) {
    g.fillStyle = shade(SKIN_PALETTE[p.skin - 1] ?? SKIN_PALETTE[1], 0.7);
    for (const [x, y] of [
      [20, 72],
      [30, 76],
      [98, 76],
      [108, 72],
    ] as const) {
      g.beginPath();
      g.arc(x, y, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = INK;
  for (const x of [42, 86]) {
    g.beginPath();
    g.ellipse(x, 60, 7, 9, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#FFFFFF';
  for (const x of [45, 89]) {
    g.beginPath();
    g.arc(x, 56, 2.8, 0, Math.PI * 2);
    g.fill();
  }
  if (has('glasses')) {
    g.strokeStyle = INK;
    g.lineWidth = 4;
    for (const x of [42, 86]) {
      g.beginPath();
      g.arc(x, 60, 15, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(57, 60);
    g.lineTo(71, 60);
    g.stroke();
  }
  if (has('mustache')) {
    g.fillStyle = p.hairColor;
    g.beginPath();
    g.ellipse(52, 80, 12, 5, 0.2, 0, Math.PI * 2);
    g.ellipse(76, 80, 12, 5, -0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#3A1A1E';
  g.fillStyle = '#3A1A1E';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  if (face === 'happy') {
    g.arc(64, 82, 13, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  } else {
    g.ellipse(64, 94, 7, 9, 0, 0, Math.PI * 2);
    g.fill();
  }
  return cv;
}

const textureCache = new Map<string, THREE.CanvasTexture>();

function texture(p: Person, face: FaceKind): THREE.CanvasTexture {
  const key = `${p.skin}|${p.hairColor}|${p.acc.join(',')}|${face}`;
  let t = textureCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(skinCanvas(p, face));
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
  private readonly badgeMat: THREE.Material & { color: THREE.Color };
  private phase = Math.random() * 10;
  private stride = 0;

  /** `who`: the player's look (a fruit only for old callers: the matching character). */
  constructor(stage: KotakStage, who: Look | Fruit, color: string) {
    const p = resolveLook(typeof who === 'string' ? lookOfFruit(who) : who);
    const skin = stage.material('#ffffff', { map: texture(p, 'none'), rough: 0.6 });
    this.happy = texture(p, 'happy');
    this.wow = texture(p, 'wow');
    this.faceMat = stage.material('#ffffff', { map: this.happy, rough: 0.6 });
    this.torsoMat = stage.material(p.outfitColor, { rough: 0.55 }) as THREE.Material & { color: THREE.Color };
    this.armMat = stage.material(shade(p.outfitColor, 0.84), { rough: 0.55 }) as THREE.Material & {
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
    // Torso in the outfit colour with a small badge in the player colour (who is who, up close).
    this.body.add(box(this.torsoMat, 0.56, 0.5, 0.36, 0, 0.73, 0));
    this.badgeMat = stage.material(color, { rough: 0.6 }) as THREE.Material & { color: THREE.Color };
    this.body.add(box(this.badgeMat, 0.14, 0.14, 0.02, 0.14, 0.82, 0.185));
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
    const s = 0.62;
    const headMesh = new THREE.Mesh(BOX, [skin, skin, skin, skin, this.faceMat, skin]);
    headMesh.scale.set(s, s, s);
    this.head.add(headMesh);
    this.head.position.set(0, 0.98 + s / 2, 0);
    this.addHair(p, stage, s);
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

  /** Hair, veil or hat from boxes, in the character's hair colour (hats in their own colour). */
  private addHair(p: Person, stage: KotakStage, s: number): void {
    const h = this.head;
    const t = s / 2;
    const hair = stage.material(p.hairColor, { rough: 0.75 });
    const dark = stage.material(shade(p.hairColor, 0.82), { rough: 0.75 });
    const cap = (depthBack = 0.1) => {
      // A slab over the top and a panel down the back: most short styles start here.
      h.add(box(hair, s + 0.05, 0.12, s + 0.05, 0, t + 0.02, 0));
      h.add(box(hair, s + 0.05, s * 0.62, depthBack, 0, t - s * 0.27, -t - depthBack / 2 + 0.03));
    };
    const fringe = (height = 0.1) =>
      h.add(box(hair, s + 0.04, height, 0.06, 0, t - height / 2 + 0.01, t + 0.01));
    const sides = (down = 0.32) => {
      for (const x of [-1, 1]) h.add(box(hair, 0.06, down, s * 0.72, x * (t + 0.02), t - down / 2, -0.06));
    };
    switch (p.hair) {
      case 'bald':
        for (const x of [-1, 1]) h.add(box(hair, 0.05, 0.12, s * 0.5, x * (t + 0.02), 0.02, -0.08));
        break;
      case 'buzz':
        h.add(box(hair, s + 0.02, 0.05, s + 0.02, 0, t + 0.005, 0));
        break;
      case 'opa':
        for (const x of [-1, 1]) h.add(box(hair, 0.06, 0.18, s * 0.6, x * (t + 0.02), 0.04, -0.06));
        h.add(box(hair, s + 0.04, 0.18, 0.06, 0, 0.04, -t - 0.02));
        break;
      case 'spiky':
        cap();
        for (const [x, z] of [
          [-0.16, 0.12],
          [0.02, 0.16],
          [0.18, 0.08],
          [-0.06, -0.08],
        ] as const) {
          const spike = box(hair, 0.14, 0.18, 0.14, x, t + 0.12, z);
          spike.rotation.set(0.3, 0, x * 2);
          h.add(spike);
        }
        break;
      case 'mohawk':
        h.add(box(hair, 0.14, 0.24, s * 0.9, 0, t + 0.12, 0));
        break;
      case 'tuft':
        cap();
        h.add(box(hair, 0.16, 0.14, 0.16, 0.05, t + 0.1, 0.16).rotateZ(0.4));
        break;
      case 'afro':
        h.add(box(hair, s + 0.26, s * 0.62, s + 0.22, 0, t + 0.08, -0.06));
        sides(0.4);
        break;
      case 'curlyshort':
        cap();
        for (const x of [-0.2, 0, 0.2]) h.add(box(hair, 0.16, 0.12, 0.16, x, t + 0.08, 0.12));
        break;
      case 'bowl':
        cap();
        fringe(0.16);
        sides(0.34);
        break;
      case 'curtain':
        cap();
        for (const x of [-1, 1])
          h.add(box(hair, s * 0.42, 0.12, 0.06, x * 0.17, t - 0.08, t + 0.01).rotateZ(x * 0.25));
        sides(0.3);
        break;
      case 'bob':
        cap(0.12);
        fringe();
        sides(0.5);
        break;
      case 'wavy':
        cap(0.14);
        fringe(0.08);
        sides(0.62);
        h.add(box(dark, s + 0.08, 0.36, 0.14, 0, -t - 0.12, -t + 0.02));
        break;
      case 'braids':
        cap();
        fringe(0.08);
        for (const x of [-1, 1]) h.add(box(dark, 0.12, 0.62, 0.12, x * (t + 0.02), -t + 0.02, -0.04));
        break;
      case 'pony':
        cap();
        fringe(0.08);
        h.add(box(dark, 0.16, 0.44, 0.16, 0, t - 0.2, -t - 0.14).rotateX(0.35));
        break;
      case 'pigtails':
        cap();
        fringe(0.08);
        for (const x of [-1, 1]) h.add(box(dark, 0.16, 0.34, 0.16, x * (t + 0.12), -0.02, -0.04));
        break;
      case 'twinbuns':
        cap();
        fringe(0.08);
        for (const x of [-1, 1]) h.add(box(hair, 0.2, 0.2, 0.2, x * 0.2, t + 0.12, -0.04));
        break;
      case 'grandbun':
      case 'messybun':
      case 'manbun':
      case 'puff':
        cap();
        if (p.hair !== 'manbun') fringe(0.08);
        h.add(
          box(
            hair,
            p.hair === 'puff' ? 0.36 : 0.24,
            p.hair === 'puff' ? 0.3 : 0.22,
            0.24,
            0,
            t + 0.14,
            -0.08,
          ),
        );
        break;
      case 'hijab': {
        // A veil around the head and down to the shoulders, the face open at the front.
        h.add(box(hair, s + 0.1, 0.1, s + 0.1, 0, t + 0.04, 0));
        h.add(box(hair, s + 0.1, s + 0.3, 0.1, 0, -0.1, -t - 0.04));
        for (const x of [-1, 1]) h.add(box(hair, 0.08, s + 0.3, s + 0.1, x * (t + 0.04), -0.1, 0));
        h.add(box(dark, s + 0.12, 0.12, s * 0.5, 0, -t - 0.16, 0.06));
        break;
      }
      case 'turban':
        h.add(box(hair, s + 0.1, 0.26, s + 0.1, 0, t + 0.08, 0));
        h.add(box(dark, 0.16, 0.16, 0.06, 0, t + 0.06, t + 0.06));
        break;
      case 'beanie': {
        const hat = stage.material(p.hat ?? p.hairColor, { rough: 0.8 });
        h.add(box(hat, s + 0.08, 0.24, s + 0.08, 0, t + 0.04, 0));
        h.add(
          box(
            stage.material(shade(p.hat ?? p.hairColor, 0.8), { rough: 0.8 }),
            s + 0.1,
            0.08,
            s + 0.1,
            0,
            t - 0.08,
            0,
          ),
        );
        break;
      }
      case 'cap': {
        const hat = stage.material(p.hat ?? p.hairColor, { rough: 0.7 });
        h.add(box(hat, s + 0.06, 0.14, s + 0.06, 0, t + 0.04, 0));
        h.add(box(hat, s * 0.8, 0.04, 0.24, 0, t - 0.01, t + 0.12));
        sides(0.16);
        break;
      }
    }
  }

  /** Scene parts to add (the blob shadow lives outside the root so it stays on the ground). */
  get objects(): THREE.Object3D[] {
    return this.shadow ? [this.root, this.shadow] : [this.root];
  }

  /** The player colour: the ring under the feet and the badge on the chest. */
  setColor(color: string): void {
    this.badgeMat.color.set(color);
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
