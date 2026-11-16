/**
 * Chef Mangga: an original host, a cheerful mango in a chef hat. Built from code (no model
 * files): a deformed sphere with a green-to-orange mango gradient, a face with swappable parts
 * per mood, little arms with white gloves, a puffy toque and a neckerchief.
 */
import * as THREE from 'three';
import { Batch, clamp01, lerp, PAL, ramp, smooth, toon, vcToon } from './kit';

export type Mood = 'idle' | 'talk' | 'cheer' | 'happy' | 'wow' | 'sad';

const RX = 0.2;
const RY = 0.26;
const RZ = 0.18;
const CY = 0.24;

/** Point on the (undeformed) front of the body, slightly outside it. */
function onFront(x: number, y: number, lift = 0.004): [number, number, number] {
  const nx = x / RX;
  const ny = (y - CY) / RY;
  const zz = Math.max(0, 1 - nx * nx - ny * ny);
  return [x, y, RZ * Math.sqrt(zz) * (1 - 0.1 * Math.max(0, ny)) + lift];
}

function bodyGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 48, 36);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);
    const k = 1 - 0.1 * Math.max(0, y);
    x *= k;
    z *= k;
    // Mango lean: the top bends to one side, the belly bulges a little.
    x += 0.12 * Math.max(0, y) ** 2 + 0.04 * (1 - y * y);
    pos.setXYZ(i, x * RX, CY + y * RY, z * RZ);
  }
  g.computeVertexNormals();
  const out = new Batch();
  const c = new THREE.Color();
  const stops: [number, number][] = [
    [0, 0xff7a24],
    [0.3, 0xffa51c],
    [0.62, 0xffc928],
    [0.86, 0xd6d23a],
    [1, 0x9fca3c],
  ];
  out.addShaded(g, (x, y) => {
    const t = clamp01((y - (CY - RY)) / (2 * RY));
    ramp(c, stops, t);
    // Sun blush on one cheek of the fruit.
    const blush = smooth(0.0, 0.2, x) * (1 - smooth(0.35, 0.8, t)) * 0.55;
    c.lerp(new THREE.Color(0xf2552c), blush);
    return c.getHex();
  });
  return out.geometry();
}

function tube(points: THREE.Vector3[], r: number): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, r, 6, false);
}

export class Chef {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly face = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly hat = new THREE.Group();
  private readonly eyesOpen: THREE.Object3D[] = [];
  private readonly eyesHappy: THREE.Object3D[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private readonly mouths: Record<'smile' | 'open' | 'o' | 'wavy', THREE.Object3D>;
  private readonly spoon: THREE.Object3D;
  private mood: Mood = 'idle';
  private moodAt = 0;
  private moodUntil = 0;
  private nextBlink = 2;

  constructor() {
    this.root.add(this.body);
    const bodyMesh = new THREE.Mesh(bodyGeometry(), vcToon());
    bodyMesh.castShadow = true;
    this.body.add(bodyMesh);
    this.body.add(this.face);

    const ink = toon(0x2a1a14);
    const white = toon(0xffffff);
    // Eyes: open ovals with a highlight, and happy ^ arcs.
    for (const s of [-1, 1]) {
      const [x, y, z] = onFront(s * 0.062 + 0.02, 0.31, 0.0);
      const eye = new THREE.Group();
      eye.position.set(x, y, z);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), ink);
      ball.scale.set(0.82, 1.18, 0.5);
      const hi = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 6), white);
      hi.position.set(-0.006, 0.01, 0.011);
      const hi2 = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 4), white);
      hi2.position.set(0.006, -0.008, 0.011);
      eye.add(ball, hi, hi2);
      this.face.add(eye);
      this.eyesOpen.push(eye);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0055, 6, 14, Math.PI), ink);
      arc.position.set(x, y - 0.006, z + 0.002);
      arc.visible = false;
      this.face.add(arc);
      this.eyesHappy.push(arc);
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.03, 3, 6), ink);
      const [bx, by, bz] = onFront(s * 0.064 + 0.02, 0.37, 0.004);
      brow.position.set(bx, by, bz);
      brow.rotation.z = Math.PI / 2;
      this.face.add(brow);
      this.brows.push(brow);
      // Blush.
      const [cx, cy, cz] = onFront(s * 0.11 + 0.02, 0.26, 0.003);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.024, 18), toon(0xff7a6a));
      cheek.position.set(cx, cy, cz);
      cheek.lookAt(cx * 2.2, cy, cz * 3);
      cheek.scale.set(1.2, 0.8, 1);
      this.face.add(cheek);
    }

    // Mouths.
    const [mx, my, mz] = onFront(0.02, 0.245, 0.002);
    const smile = new THREE.Mesh(
      tube(
        [
          new THREE.Vector3(-0.03, 0.008, 0),
          new THREE.Vector3(-0.012, -0.01, 0.004),
          new THREE.Vector3(0.012, -0.01, 0.004),
          new THREE.Vector3(0.03, 0.008, 0),
        ],
        0.0045,
      ),
      ink,
    );
    const open = new THREE.Group();
    const lip = new THREE.Mesh(new THREE.CircleGeometry(0.034, 20, Math.PI, Math.PI), toon(0x7a1f1f));
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.018, 14, Math.PI, Math.PI), toon(0xff7a7a));
    tongue.position.set(0.004, -0.014, 0.001);
    tongue.scale.set(1, 0.6, 1);
    open.add(lip, tongue);
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 10), toon(0x7a1f1f));
    o.scale.set(0.85, 1.15, 0.35);
    const wpts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++)
      wpts.push(new THREE.Vector3(-0.028 + i * 0.0093, Math.sin(i * 1.6) * 0.004 - 0.004, 0));
    const wavy = new THREE.Mesh(tube(wpts, 0.004), ink);
    this.mouths = { smile, open, o, wavy };
    for (const m of [smile, open, o, wavy]) {
      m.position.set(mx, my, mz);
      m.visible = false;
      this.face.add(m);
    }
    smile.visible = true;

    // Neckerchief.
    const scarf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), toon(PAL.red));
    const [sx, sy, sz] = onFront(0.02, 0.1, 0.0);
    scarf.position.set(sx, sy, sz + 0.004);
    scarf.rotation.set(-0.35, Math.PI / 6 + Math.PI, Math.PI);
    scarf.scale.set(1, 1, 0.4);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), toon(PAL.red));
    knot.position.set(sx, sy + 0.04, sz + 0.012);
    for (const m of [scarf, knot]) m.castShadow = true;
    this.body.add(scarf, knot);

    // Arms with white gloves; the right hand holds a wooden spoon when cheering.
    const armMat = toon(0xffb21e);
    const glove = toon(0xffffff);
    for (const [arm, s] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(s * 0.19 + 0.03, 0.2, 0.02);
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.08, 4, 8), armMat);
      limb.position.y = -0.055;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), glove);
      hand.position.y = -0.12;
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.02, 3, 6), glove);
      thumb.position.set(-s * 0.03, -0.105, 0.012);
      thumb.rotation.z = s * 0.8;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.009, 6, 14), glove);
      cuff.position.y = -0.088;
      cuff.rotation.x = Math.PI / 2;
      for (const m of [limb, hand, thumb, cuff]) m.castShadow = true;
      arm.add(limb, hand, thumb, cuff);
      this.body.add(arm);
    }
    const spoon = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), toon(PAL.wood2));
    stick.position.y = 0.08;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), toon(PAL.wood2));
    bowl.scale.set(0.8, 1.2, 0.3);
    bowl.position.y = 0.19;
    spoon.add(stick, bowl);
    spoon.position.set(0, -0.12, 0.03);
    spoon.visible = false;
    this.armR.add(spoon);
    this.spoon = spoon;

    // Chef hat (toque) with a mango leaf poking out.
    const hatMat = toon(0xffffff);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.12, 0.075, 28), hatMat);
    band.position.y = 0.04;
    this.hat.add(band);
    const puffs: [number, number, number, number][] = [
      [0, 0.15, 0, 0.11],
      [0.09, 0.12, 0, 0.08],
      [-0.09, 0.12, 0, 0.08],
      [0, 0.12, 0.08, 0.08],
      [0, 0.12, -0.08, 0.08],
      [0.06, 0.18, 0.04, 0.07],
      [-0.05, 0.19, -0.03, 0.07],
    ];
    for (const [x, y, z, r] of puffs) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), hatMat);
      p.position.set(x, y, z);
      p.castShadow = true;
      this.hat.add(p);
    }
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.127, 0.122, 0.012, 28), toon(PAL.orange));
    stripe.position.y = 0.012;
    this.hat.add(stripe);
    this.hat.position.set(0.075, CY + RY - 0.035, 0.0);
    this.hat.rotation.set(-0.05, 0, -0.16);
    band.castShadow = true;
    this.body.add(this.hat);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), toon(PAL.leaf));
    leaf.scale.set(1.3, 0.22, 0.55);
    leaf.position.set(-0.07, CY + RY - 0.02, 0.02);
    leaf.rotation.set(0.2, 0.3, 0.5);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.04, 6), toon(0x6b4423));
    stem.position.set(-0.03, CY + RY - 0.01, 0.0);
    stem.rotation.z = 0.6;
    this.body.add(leaf, stem);
  }

  /** Show a reaction for `ms`, then return to idle. */
  react(mood: Mood, t: number, ms = 1600): void {
    this.mood = mood;
    this.moodAt = t;
    this.moodUntil = t + ms / 1000;
  }

  get current(): Mood {
    return this.mood;
  }

  /** `t` in seconds. */
  update(t: number): void {
    if (this.mood !== 'idle' && t > this.moodUntil) this.mood = 'idle';
    const m = this.mood;
    const k = t - this.moodAt;
    const breathe = 1 + 0.022 * Math.sin(t * Math.PI * 1.6);
    let sx = 1 / Math.sqrt(breathe);
    let sy = breathe;
    let rotX = 0;
    let rotY = 0.04 * Math.sin(t * 0.7);
    const rotZ = 0.03 * Math.sin(t * Math.PI * 0.7);
    let hop = 0;
    let armL = -0.35 - 0.05 * Math.sin(t * 2.1);
    let armR = 0.35 + 0.05 * Math.sin(t * 2.1 + 1);
    let armLx = 0;
    let armRx = 0;
    let eyes: 'open' | 'happy' = 'open';
    let mouth: keyof Chef['mouths'] = 'smile';
    let brow = 0;
    let browTilt = 0;
    let spoon = false;

    switch (m) {
      case 'cheer': {
        hop = 0.07 * Math.abs(Math.sin(k * Math.PI * 2.6)) * (1 - smooth(1.2, 1.6, k));
        const sq = Math.sin(k * Math.PI * 5.2);
        sy *= 1 + 0.05 * sq;
        sx *= 1 - 0.03 * sq;
        armL = -2.5 - 0.3 * Math.sin(k * 14);
        armR = 2.5 + 0.3 * Math.sin(k * 14 + 1);
        eyes = 'happy';
        mouth = 'open';
        brow = 0.012;
        spoon = true;
        break;
      }
      case 'happy':
        rotX = 0.08 * Math.sin(k * 9) * (1 - smooth(0.6, 1.2, k));
        armR = 2.3 + 0.1 * Math.sin(k * 6);
        armRx = -0.4;
        eyes = 'happy';
        mouth = 'open';
        brow = 0.006;
        break;
      case 'wow':
        rotX = -0.12 * smooth(0, 0.2, k);
        armL = -1.4;
        armR = 1.4;
        mouth = 'o';
        brow = 0.016;
        sy *= 1.04;
        break;
      case 'sad': {
        rotX = 0.13 * smooth(0, 0.3, k);
        sy *= 0.95;
        sx *= 1.03;
        rotY += 0.09 * Math.sin(k * 26) * Math.max(0, 1 - k * 1.4);
        armL = -2.55;
        armR = 2.55;
        armLx = -0.9;
        armRx = -0.9;
        mouth = 'wavy';
        brow = 0.004;
        browTilt = 0.45;
        break;
      }
      case 'talk':
        mouth = Math.sin(k * 44) > 0 ? 'open' : 'smile';
        hop = 0.01 * Math.abs(Math.sin(k * 8));
        armR = 0.9 + 0.3 * Math.sin(k * 7);
        brow = 0.004;
        break;
      default:
        break;
    }

    // Blink while the eyes are open.
    if (t > this.nextBlink + 0.13) this.nextBlink = t + 2.2 + ((t * 7.31) % 2.4);
    const blink = t > this.nextBlink && t < this.nextBlink + 0.13 ? 0.12 : 1;

    this.body.scale.set(sx, sy, sx);
    this.body.rotation.set(rotX, rotY, rotZ);
    this.body.position.y = hop;
    const ease = (o: THREE.Object3D, target: number, axis: 'x' | 'z') => {
      o.rotation[axis] = lerp(o.rotation[axis], target, 0.25);
    };
    ease(this.armL, armL, 'z');
    ease(this.armR, armR, 'z');
    ease(this.armL, armLx, 'x');
    ease(this.armR, armRx, 'x');
    for (const e of this.eyesOpen) {
      e.visible = eyes === 'open';
      e.scale.y = blink;
    }
    for (const e of this.eyesHappy) e.visible = eyes === 'happy';
    for (const [name, o] of Object.entries(this.mouths)) o.visible = name === mouth;
    this.brows.forEach((b, i) => {
      const s = i === 0 ? -1 : 1;
      b.position.y = onFront(s * 0.064 + 0.02, 0.37)[1] + brow;
      b.rotation.z = Math.PI / 2 + s * browTilt * -1;
    });
    this.spoon.visible = spoon;
    this.hat.rotation.z = -0.16 + 0.04 * Math.sin(t * 1.3) + (m === 'cheer' ? 0.1 * Math.sin(k * 16) : 0);
  }
}
