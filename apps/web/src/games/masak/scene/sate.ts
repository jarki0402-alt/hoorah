/**
 * Sate ayam on one station: chicken breast is cut into cubes on the board, pushed onto bamboo
 * skewers on a leaf-lined tray, grilled over charcoal (fan the coals, flip the skewers), then
 * plated with lontong and lime, smothered in peanut sauce and sprinkled with fried shallots.
 * The same twenty cubes travel tray -> grill -> plate.
 */
import * as THREE from 'three';
import { Flames } from './fx';
import { bump, clamp01, lerp, ownToon, PAL, ramp, rand, rbox, smooth, toon, vcToon } from './kit';
import type { ActorFrame, DishActor, RigHooks } from './model';
import {
  blobGeo,
  cubeGeo,
  discPoint,
  fan,
  instanced,
  knife,
  ladle,
  setInstance,
  shaker,
  skewerGeo,
} from './props';
import { SPOT } from './spots';

const S_CUT = 0;
const S_SKEWER = 1;
const S_FAN = 2;
const S_FLIP = 3;
const S_SAUCE = 4;
const S_SPRINKLE = 5;

const STICKS = 5;
const PER = 4;
const CUBES = STICKS * PER;
const BOARD_CUBES = 14;
const FLAKES = 130;

const MEAT: [number, number][] = [
  [0, PAL.chicken],
  [0.3, 0xebb98e],
  [0.55, 0xd2924f],
  [0.8, 0xab652d],
  [1, 0x80461f],
];

const _stick = new THREE.Object3D();
const _cube = new THREE.Object3D();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class SateActor implements DishActor {
  readonly group = new THREE.Group();
  private readonly hooks: RigHooks;

  // Board
  private readonly board = new THREE.Group();
  private readonly breast: THREE.Mesh;
  private readonly boardCubes: THREE.InstancedMesh;
  private readonly cubeBorn: number[] = Array(BOARD_CUBES).fill(-10);
  private readonly knife: THREE.Group;
  private chopAt = -10;

  // Skewers (travel between tray, grill and plate)
  private readonly sticks: THREE.InstancedMesh;
  private readonly cubes: THREE.InstancedMesh;
  private readonly chars: THREE.InstancedMesh;
  private readonly skewerAt: number[] = Array(STICKS).fill(-10);
  private flipAt = -10;
  private flips = 0;
  private meatP = -1;

  // Grill
  private readonly coals: THREE.InstancedMesh;
  private readonly embers: THREE.InstancedMesh;
  private readonly flames: Flames;
  private readonly fan: THREE.Group;
  private fanAt = -10;
  private smokeAcc = 0;

  // Plate
  private readonly plate = new THREE.Group();
  private readonly sauce: THREE.Mesh;
  private readonly sauceMat = ownToon(PAL.peanut);
  private readonly swirl: THREE.Mesh;
  private readonly spill: THREE.Mesh;
  private readonly stream: THREE.Mesh;
  private readonly pan: THREE.Group;
  private readonly sides = new THREE.Group();
  private readonly flakes: THREE.InstancedMesh;
  private readonly nuts: THREE.InstancedMesh;
  private readonly flakeBorn: Float32Array = new Float32Array(FLAKES).fill(-10);
  private readonly shaker: THREE.Group;
  private shakeAt = -10;
  private flakeCursor = 0;

  private lastGrade: string | null = null;

  constructor(hooks: RigHooks) {
    this.hooks = hooks;
    const meatMat = toon(0xffffff);

    /* ---------------- board ---------------- */
    this.board.position.set(SPOT.board[0], 0.03, SPOT.board[2]);
    const breastGeo = (() => {
      const g = rbox(0.15, 0.036, 0.085, 0.016, 3);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        // Taper one end like a real fillet.
        const k = 1 - 0.35 * Math.max(0, x / 0.075);
        pos.setZ(i, z * k);
        pos.setY(i, pos.getY(i) * (0.8 + 0.2 * k));
      }
      g.computeVertexNormals();
      g.translate(0.075, 0.018, 0);
      return g;
    })();
    this.breast = new THREE.Mesh(breastGeo, toon(PAL.chicken));
    this.breast.position.set(-0.11, 0, -0.03);
    this.breast.castShadow = true;
    const fat = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.11, 3, 6), toon(0xf8d8cc));
    fat.rotation.z = Math.PI / 2;
    fat.position.set(0.07, 0.03, 0.012);
    this.breast.add(fat);
    this.board.add(this.breast);
    this.boardCubes = instanced(cubeGeo(), toon(PAL.chicken), BOARD_CUBES, true);
    this.board.add(this.boardCubes);
    this.knife = knife();
    this.board.add(this.knife);
    // A clove of garlic and a little bowl of salt on the board for life.
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.018, 18), toon(0xfff6e8));
    bowl.position.set(0.16, 0.009, -0.09);
    const salt = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), toon(0xffffff));
    salt.scale.set(1, 0.3, 1);
    salt.position.set(0.16, 0.018, -0.09);
    this.board.add(bowl, salt);
    this.group.add(this.board);

    /* ---------------- skewers ---------------- */
    this.sticks = instanced(skewerGeo(), vcToon(), STICKS, true);
    this.cubes = instanced(cubeGeo(), meatMat, CUBES, true);
    this.chars = instanced(new THREE.BoxGeometry(0.023, 0.002, 0.004), toon(0x3a2416), CUBES * 2, false);
    this.sticks.count = STICKS;
    this.cubes.count = CUBES;
    this.group.add(this.sticks, this.cubes, this.chars);

    /* ---------------- grill ---------------- */
    const [gx, , gz] = SPOT.grill;
    this.coals = instanced(new THREE.IcosahedronGeometry(0.016, 0), toon(0xffffff), 46, false);
    this.embers = instanced(
      new THREE.IcosahedronGeometry(0.009, 0),
      toon(0xff6a14, { emissive: 0xff3c00 }),
      46,
      false,
    );
    for (let i = 0; i < 46; i++) {
      const x = gx - 0.25 + rand(i + 3) * 0.5;
      const z = gz - 0.075 + rand(i + 9) * 0.15;
      const s = 0.7 + rand(i + 4) * 0.6;
      setInstance(
        this.coals,
        i,
        x,
        0.092 + rand(i + 5) * 0.012,
        z,
        rand(i) * 3,
        rand(i + 1) * 3,
        rand(i + 2) * 3,
        s,
      );
      setInstance(this.embers, i, x + 0.006, 0.1 + rand(i + 5) * 0.012, z, rand(i) * 3, 0, 0, s);
    }
    this.coals.count = 46;
    this.embers.count = 46;
    this.flames = new Flames(9, 'line', 0.46, 0.05);
    this.flames.group.position.set(gx, 0.1, gz);
    this.group.add(this.coals, this.embers, this.flames.group);
    this.fan = fan();
    this.fan.position.set(gx - 0.31, 0.06, gz + 0.13);
    this.group.add(this.fan);

    /* ---------------- plate ---------------- */
    this.plate.position.set(SPOT.plate[0], 0.012, SPOT.plate[2]);
    this.sauce = new THREE.Mesh(blobGeo(7), this.sauceMat);
    this.sauce.castShadow = true;
    // A pool of sweet soy sauce on top of the peanut sauce.
    this.swirl = new THREE.Mesh(blobGeo(3), toon(0x4a2412));
    this.spill = new THREE.Mesh(blobGeo(9), this.sauceMat);
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 1, 10), this.sauceMat);
    this.pan = ladle(PAL.peanut);
    this.shaker = shaker(0xc0632a);
    this.flakes = instanced(new THREE.BoxGeometry(0.007, 0.002, 0.004), toon(0xffffff), FLAKES, false);
    for (let i = 0; i < FLAKES; i++) {
      this.flakes.setColorAt(i, _c.setHex(i % 9 === 0 ? 0xd8432a : i % 2 ? 0xa0561f : 0xc27a35));
    }
    this.nuts = instanced(new THREE.IcosahedronGeometry(0.0035, 0), toon(0xc98f52), 34, false);
    this.buildSides();
    this.plate.add(
      this.nuts,
      this.sides,
      this.sauce,
      this.swirl,
      this.spill,
      this.stream,
      this.pan,
      this.flakes,
      this.shaker,
    );
    this.group.add(this.plate);
  }

  private buildSides(): void {
    // Lontong (pressed rice cake) with a leaf edge, and a lime wedge.
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const rice = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.026, 16), toon(0xfbf7ec));
      const leaf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0175, 0.0175, 0.018, 16, 1, true),
        toon(PAL.leaf),
      );
      g.add(rice, leaf);
      g.rotation.set(Math.PI / 2, 0, 0.3 + i * 0.2);
      g.position.set(-0.075 + (i % 2) * 0.03, 0.017, -0.05 - Math.floor(i / 2) * 0.034);
      for (const m of [rice, leaf]) m.castShadow = true;
      this.sides.add(g);
    }
    const lime = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10, 0, Math.PI), toon(0x7cc242));
    lime.rotation.set(-Math.PI / 2, 0, 0.4);
    lime.position.set(0.085, 0.008, -0.06);
    const flesh = new THREE.Mesh(new THREE.CircleGeometry(0.0185, 16), toon(0xd9ef9a));
    flesh.position.copy(lime.position);
    flesh.position.y += 0.0005;
    flesh.rotation.x = -Math.PI / 2;
    const cuc = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.005, 16), toon(0xe9f5c8));
    cuc.position.set(0.09, 0.004, -0.02);
    const shallot = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.004, 6, 14), toon(0xe8a6b0));
    shallot.rotation.x = -Math.PI / 2;
    shallot.position.set(0.075, 0.006, 0.0);
    this.sides.add(lime, flesh, cuc, shallot);
  }

  reset(stepIndex: number, _t: number): void {
    this.lastGrade = null;
    if (stepIndex === S_FLIP) this.flips = 0;
    if (stepIndex === S_SPRINKLE) {
      this.flakeBorn.fill(-10);
      this.flakeCursor = 0;
    }
  }

  pulse(stepIndex: number, f: ActorFrame): void {
    const { t, m } = f;
    const fx = this.hooks.fx;
    switch (stepIndex) {
      case S_CUT: {
        this.chopAt = t;
        const k = Math.min(BOARD_CUBES - 1, Math.round(m.progress * BOARD_CUBES) - 1);
        if (k >= 0) this.cubeBorn[k] = t;
        fx.bits(
          this.board.position.x + this.knife.position.x,
          0.05,
          this.board.position.z,
          0xf6c7b8,
          3,
          0.033,
        );
        this.hooks.kick(0.004);
        return;
      }
      case S_SKEWER: {
        const k = Math.min(STICKS - 1, Math.round(m.progress * STICKS) - 1);
        if (k >= 0) this.skewerAt[k] = t;
        this.hooks.kick(0.003);
        return;
      }
      case S_FAN: {
        this.fanAt = t;
        const [gx, , gz] = SPOT.grill;
        fx.embers(gx, 0.13, gz, 0.2, 8);
        fx.smoke(gx - 0.1 + rand(Math.floor(t * 10)) * 0.2, 0.15, gz, 0.4);
        return;
      }
      case S_FLIP: {
        this.flipAt = t;
        this.flips++;
        const [gx, , gz] = SPOT.grill;
        fx.sizzle(gx, 0.14, gz, 0.2, 8);
        fx.smoke(gx, 0.16, gz, 0.5);
        this.hooks.kick(0.003);
        return;
      }
      case S_SAUCE:
        return;
      case S_SPRINKLE: {
        this.shakeAt = t;
        for (let k = 0; k < 10; k++) {
          const i = this.flakeCursor;
          this.flakeCursor = (this.flakeCursor + 1) % FLAKES;
          this.flakeBorn[i] = t + k * 0.012;
        }
        return;
      }
      default:
        return;
    }
  }

  update(f: ActorFrame): void {
    const { m, t, dt } = f;
    const fx = this.hooks.fx;
    const P = m.poster === true;
    if (m.grade !== this.lastGrade) {
      this.lastGrade = m.grade;
      if (m.grade === 'gagal' && m.reason === 'burnt') {
        fx.bits(this.plate.position.x, 0.05, this.plate.position.z, PAL.peanut, 10, 0.0, 0xb8783a);
      }
    }

    /* ---------------- board ---------------- */
    const cutP = f.stepP(S_CUT);
    const cut = Math.round(cutP * BOARD_CUBES);
    const onBoard = !m.plated && m.stepIndex <= S_CUT;
    const rem = 1 - cut / BOARD_CUBES;
    this.breast.visible = onBoard && rem > 0.02;
    this.breast.scale.set(Math.max(0.05, rem), 1, 1);
    let n = 0;
    for (let k = 0; k < BOARD_CUBES && onBoard; k++) {
      if (k >= cut) continue;
      const [px, pz] = discPoint(k * 7 + 5, 0.05);
      const s = clamp01((t - this.cubeBorn[k]!) / 0.22);
      const from = -0.11 + 0.15 * (1 - (k + 1) / BOARD_CUBES);
      const x = lerp(from, 0.06 + px, s);
      const z = lerp(-0.03, 0.065 + pz * 0.6, s);
      const y = 0.0095 + (k % 4 === 3 ? 0.015 : 0) + bump(s) * 0.035;
      setInstance(this.boardCubes, n++, x, y, z, 0, rand(k) * 3, (rand(k + 1) - 0.5) * 0.4);
    }
    this.boardCubes.count = n;
    this.boardCubes.instanceMatrix.needsUpdate = true;
    const chopping =
      !m.plated &&
      m.stepIndex === S_CUT &&
      (m.phase === 'cook' || m.phase === 'ready' || m.phase === 'reveal');
    const ks = clamp01((t - this.chopAt) / 0.16);
    const down = ks < 1 ? (ks < 0.35 ? ks / 0.35 : 1 - (ks - 0.35) / 0.65) : 0;
    if (chopping) {
      const cutX = -0.11 + 0.15 * rem;
      this.knife.position.set(cutX + 0.022, lerp(0.06 + Math.sin(t * 5) * 0.004, 0.0, down), 0.0);
      this.knife.rotation.set(0, -0.85, 0.06 * down);
    } else {
      this.knife.position.set(0.02, 0.003, 0.11);
      this.knife.rotation.set(-Math.PI / 2, 0, 0.12);
    }

    /* ---------------- skewers ---------------- */
    const skewerP = f.stepP(S_SKEWER);
    const fanP = f.stepP(S_FAN);
    const flipP = f.stepP(S_FLIP);
    const sauceA = P
      ? 0.68
      : m.stepIndex === S_SAUCE && !m.plated
        ? m.amount
        : this.final(m, S_SAUCE, m.stepIndex > S_SAUCE || m.plated ? 0.68 : 0);
    const sprinkleP = P ? 1 : f.stepP(S_SPRINKLE);
    let stage: 'tray' | 'grill' | 'plate' | 'hidden' = 'hidden';
    if (P || m.plated || m.stepIndex >= S_SAUCE) stage = 'plate';
    else if (m.stepIndex >= S_FAN) stage = 'grill';
    else if (m.stepIndex === S_SKEWER) stage = 'tray';
    this.sticks.visible = stage !== 'hidden';
    this.cubes.visible = stage !== 'hidden';
    const done = Math.round(skewerP * STICKS);
    const cook = clamp01(fanP * 0.3 + flipP * 0.7);
    if (Math.abs(cook - this.meatP) > 0.003) {
      this.meatP = cook;
      for (let i = 0; i < CUBES; i++) {
        ramp(_c, MEAT, clamp01(cook * (0.85 + 0.3 * rand(i + 40))));
        this.cubes.setColorAt(i, _c);
      }
      if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
    }
    const flipS = clamp01((t - this.flipAt) / 0.32);
    let nc = 0;
    for (let i = 0; i < STICKS && stage !== 'hidden'; i++) {
      let roll = 0;
      let slide = 0;
      if (stage === 'tray') {
        const [tx, , tz] = SPOT.tray;
        const ss = i < done ? clamp01((t - this.skewerAt[i]!) / 0.26) : 0;
        slide = i < done ? (this.skewerAt[i]! < 0 ? 1 : ss) : 0;
        _stick.position.set(tx - 0.16 * (1 - slide) + 0.01, 0.026, tz + (i - 2) * 0.046);
        _stick.rotation.set(0, 0, 0);
      } else if (stage === 'grill') {
        const [gx, , gz] = SPOT.grill;
        const hop = m.stepIndex === S_FLIP ? bump(flipS) * 0.03 : 0;
        roll = (this.flips - 1 + (m.stepIndex === S_FLIP ? flipS : 1)) * Math.PI;
        if (m.stepIndex !== S_FLIP) roll = 0;
        _stick.position.set(gx + (i - 2) * 0.095, 0.124 + hop, gz + 0.02);
        _stick.rotation.set(0, Math.PI / 2, 0);
      } else {
        const [px, , pz] = SPOT.plate;
        _stick.position.set(px + 0.005 + i * 0.004, 0.032 + i * 0.002, pz + 0.02 + (i - 2) * 0.024);
        _stick.rotation.set(0, 0.32 - i * 0.12, 0);
      }
      _stick.updateMatrix();
      this.sticks.setMatrixAt(i, _stick.matrix);
      for (let k = 0; k < PER; k++) {
        const along = stage === 'plate' ? -0.06 + k * 0.026 : -0.04 + k * 0.026;
        if (stage === 'tray' && i >= done) {
          // Waiting cubes sit in a row, not yet pierced.
          _cube.position.set(along + 0.16 * (1 - slide), 0, 0);
        } else {
          _cube.position.set(along, 0, 0);
        }
        _cube.rotation.set(roll + rand(i * 9 + k) * 0.4, rand(i * 7 + k) * 0.6, 0);
        _cube.updateMatrix();
        _m.multiplyMatrices(_stick.matrix, _cube.matrix);
        this.cubes.setMatrixAt(nc++, _m);
      }
    }
    this.cubes.count = nc;
    this.sticks.instanceMatrix.needsUpdate = true;
    this.cubes.instanceMatrix.needsUpdate = true;
    // Grill marks once the skewers have been flipped.
    const charK = stage === 'grill' ? smooth(0.2, 0.9, flipP) : 0;
    this.chars.visible = charK > 0.01;
    if (this.chars.visible) {
      let nk = 0;
      for (let i = 0; i < nc; i++) {
        this.cubes.getMatrixAt(i, _m);
        for (let s = 0; s < 2; s++) {
          _cube.position.set(0, 0.0098, (s - 0.5) * 0.009);
          _cube.rotation.set(0, 0.4, 0);
          _cube.scale.set(charK, 1, 1);
          _cube.updateMatrix();
          this.chars.setMatrixAt(nk++, _m.clone().multiply(_cube.matrix));
        }
      }
      _cube.scale.set(1, 1, 1);
      this.chars.count = nk;
      this.chars.instanceMatrix.needsUpdate = true;
    }

    /* ---------------- grill fire ---------------- */
    const grilling = !m.plated && !P && (m.stepIndex === S_FAN || m.stepIndex === S_FLIP);
    const fanFlare = Math.exp(-(t - this.fanAt) * 4);
    const heat = grilling
      ? m.stepIndex === S_FAN
        ? 0.25 + fanP * 0.75 + fanFlare * 0.3
        : 0.9
      : m.stepIndex < S_FAN
        ? 0.15
        : 0.1;
    for (let i = 0; i < 46; i++) {
      const glow = clamp01(heat * (0.6 + 0.6 * rand(i + 17)) + 0.15 * Math.sin(t * 3 + i));
      this.coals.setColorAt(i, _c.setHex(0x2a2523).lerp(new THREE.Color(0x7a2a12), glow * 0.8));
    }
    if (this.coals.instanceColor) this.coals.instanceColor.needsUpdate = true;
    this.embers.visible = heat > 0.12;
    this.embers.scale.setScalar(1);
    const em = this.embers.material as THREE.MeshToonMaterial;
    em.emissiveIntensity = 0.5 + heat * 1.6;
    this.flames.update(t, grilling ? heat * 1.2 : 0);
    if (grilling) {
      this.smokeAcc += dt * (1.5 + heat * 3);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        const [gx, , gz] = SPOT.grill;
        fx.smoke(gx + (rand(Math.floor(t * 50)) - 0.5) * 0.4, 0.15, gz, 0.15);
      }
    }
    // Fan: a big wave on each swipe.
    const fs = clamp01((t - this.fanAt) / 0.35);
    const fanning = !m.plated && !P && m.stepIndex === S_FAN;
    this.fan.visible = fanning || (!m.plated && m.stepIndex === S_FLIP);
    this.fan.rotation.set(-0.5, 0.5, (fanning ? bump(fs) * -0.9 : 0) + Math.sin(t * 2) * 0.05 + 0.5);

    /* ---------------- plate: sauce + sprinkles ---------------- */
    const onPlate = stage === 'plate';
    this.plate.visible = true;
    this.sides.visible = onPlate;
    const pouring = !P && !m.plated && m.stepIndex === S_SAUCE && m.held;
    const a = clamp01(sauceA);
    this.sauce.visible = onPlate && a > 0.01;
    const r = 0.025 + 0.06 * Math.sqrt(a);
    this.sauce.scale.set(r * 1.25, 0.016 + 0.01 * a, r);
    this.sauce.position.set(-0.02, 0.03, 0.02);
    ramp(
      _c,
      [
        [0, 0xb8783a],
        [1, PAL.peanut],
      ],
      a,
    );
    this.sauceMat.color.copy(_c);
    this.swirl.visible = this.sauce.visible && a > 0.3;
    this.swirl.position.set(-0.03, 0.03 + (0.016 + 0.01 * a) * 0.5 - 0.001, 0.025);
    this.swirl.scale.set(0.022 * a, 0.006, 0.016 * a);
    // Crushed peanuts in the sauce.
    let nn = 0;
    if (this.sauce.visible) {
      for (let i = 0; i < 34; i++) {
        const [x, z] = discPoint(i * 3 + 400, 0.95);
        const sy = (0.016 + 0.01 * a) * 0.5;
        setInstance(
          this.nuts,
          nn++,
          -0.02 + x * r * 1.2,
          0.03 + sy * 0.9,
          0.02 + z * r * 0.95,
          rand(i),
          rand(i + 1),
          0,
          0.8 + rand(i + 2) * 0.6,
        );
      }
    }
    this.nuts.count = nn;
    this.nuts.instanceMatrix.needsUpdate = true;
    // Overpouring spills over the rim.
    const spilled = smooth(0.84, 1, a);
    this.spill.visible = onPlate && spilled > 0.01;
    this.spill.scale.set(0.15 * (0.85 + 0.25 * spilled), 0.008, 0.13 * (0.85 + 0.25 * spilled));
    this.spill.position.set(0.0, -0.004, 0.02);
    this.pan.visible =
      !P && !m.plated && m.stepIndex === S_SAUCE && (m.phase === 'cook' || m.phase === 'ready');
    const tilt = pouring ? 1 : 0;
    this.pan.position.set(0.05, 0.12, 0.0);
    this.pan.rotation.set(0, 0.5, lerp(0.1, -0.9, tilt));
    this.stream.visible = pouring;
    if (pouring) {
      const top = 0.115;
      const bottom = 0.04;
      this.stream.scale.set(1, top - bottom, 1);
      this.stream.position.set(0.03, (top + bottom) / 2, 0.012);
      if (rand(Math.floor(t * 40)) < dt * 15)
        fx.bits(this.plate.position.x + 0.03, 0.06, this.plate.position.z, 0xb8783a, 1, 0.04);
    }
    // Fried shallots: each tap drops a pinch that falls onto the sauce.
    this.shaker.visible =
      !P && !m.plated && m.stepIndex === S_SPRINKLE && (m.phase === 'cook' || m.phase === 'ready');
    const sh = clamp01((t - this.shakeAt) / 0.18);
    this.shaker.position.set(0.0, 0.2 + bump(sh) * 0.02, 0.0);
    this.shaker.rotation.set(0, 0, Math.PI - 0.4 + bump(sh) * 0.5);
    const shown = P
      ? FLAKES
      : m.plated
        ? Math.round(FLAKES * sprinkleP)
        : m.stepIndex === S_SPRINKLE
          ? FLAKES
          : 0;
    let nf = 0;
    if (onPlate && shown > 0) {
      const fullCount = Math.round(sprinkleP * FLAKES);
      for (let i = 0; i < FLAKES && nf < shown; i++) {
        const settled = m.plated || P;
        const born = settled ? -10 : this.flakeBorn[i]!;
        if (!settled && born < 0 && i >= fullCount) continue;
        const [x, z] = discPoint(i * 5 + 11, 0.07);
        const fs2 = born < 0 ? 1 : clamp01((t - born) / 0.35);
        const yTop = 0.03 + (0.016 + 0.01 * a) * 0.5 + 0.003;
        const y = lerp(0.18, yTop, fs2 * fs2);
        setInstance(
          this.flakes,
          nf++,
          x * fs2,
          y,
          z * fs2 + 0.02,
          rand(i) * 3,
          rand(i + 1) * 6,
          rand(i + 2) * 3,
          0.9 + rand(i + 3) * 0.5,
        );
      }
    }
    this.flakes.count = nf;
    this.flakes.instanceMatrix.needsUpdate = true;
    if (this.flakes.instanceColor) this.flakes.instanceColor.needsUpdate = true;
  }

  private final(m: ActorFrame['m'], i: number, fallback: number): number {
    const v = m.finals[i];
    return v === undefined || Number.isNaN(v) ? fallback : v;
  }
}
