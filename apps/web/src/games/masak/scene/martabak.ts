/**
 * Martabak manis on one station: flour, eggs and milk are whisked into batter, poured into the
 * heavy loyang (too much overflows), honeycomb holes bloom as it cooks, butter is spread,
 * chocolate sprinkles and cheese rain down, the cake is folded in half and finally cut into
 * strips on the board.
 */
import * as THREE from 'three';
import { Flames } from './fx';
import { Batch, bump, clamp01, lerp, mixColor, ownToon, PAL, rand, smooth, toon } from './kit';
import type { ActorFrame, DishActor, RigHooks } from './model';
import { discPoint, domeGeo, instanced, jug, knife, setInstance, shaker, spreader, whisk } from './props';
import { ON_STOVE, SPOT, STOVE } from './spots';

const S_MIX = 0;
const S_POUR = 1;
const S_BUTTER = 2;
const S_SPRINKLE = 3;
const S_FOLD = 4;
const S_CUT = 5;

/** Loyang inner radius and rim height (local). */
const R = 0.128;
const FLOOR = 0.0055;
const RIM = 0.046;
const HOLES = 46;
const MESES = 220;
const CHEESE = 90;
const STRIPS = 9;
const LUMPS = 22;

const TOP = 0xf2cf7e;
const SIDE = 0xd9a050;
const UNDER = 0x9a5a22;

/** Height of batter in the loyang for a pour amount (0..1). */
const level = (a: number) => FLOOR + 0.002 + clamp01(a) * (RIM - 0.004);

function halfDisc(side: 1 | -1): THREE.BufferGeometry {
  // Unit-height half cylinder: top cream, sides golden, underside brown.
  const g = new THREE.CylinderGeometry(
    R - 0.002,
    R - 0.002,
    1,
    36,
    1,
    false,
    side > 0 ? 0 : Math.PI,
    Math.PI,
  );
  g.translate(0, 0.5, 0);
  const b = new Batch();
  b.add(g, [SIDE, TOP, UNDER]);
  // Close the flat cut face so the fold line never shows a hole.
  b.add(new THREE.PlaneGeometry(2 * (R - 0.002), 1), SIDE, { p: [0, 0.5, 0], r: [0, Math.PI / 2, 0] });
  return b.geometry();
}

/** One strip of the folded half-moon, between x0 and x1, on the board. */
function stripGeometry(x0: number, x1: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const r = R - 0.002;
  const arc = (x: number) => Math.sqrt(Math.max(0, r * r - x * x));
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const x = x1 + ((x0 - x1) * i) / steps;
    s.lineTo(x, arc(x));
  }
  s.lineTo(x0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  // Shape is in XY: lay it flat so the half-moon's straight edge runs along X.
  g.rotateX(Math.PI / 2);
  g.translate(0, h, 0);
  const b = new Batch();
  b.add(g, [UNDER, TOP]);
  // The filling peeks out of the cut faces as a dark line.
  const f = new THREE.ExtrudeGeometry(s, { depth: h * 0.18, bevelEnabled: false });
  f.rotateX(Math.PI / 2);
  f.scale(1.004, 1, 1.004);
  f.translate(0, h * 0.58, 0);
  b.add(f, [0x5a3420, 0x5a3420]);
  return b.geometry();
}

export class MartabakActor implements DishActor {
  readonly group = new THREE.Group();
  private readonly hooks: RigHooks;
  private readonly c = new THREE.Color();

  // Bowl
  private readonly bowl = new THREE.Group();
  private readonly flour: THREE.Mesh;
  private readonly yolks: THREE.Mesh[] = [];
  private readonly batterTop: THREE.Mesh;
  private readonly batterMat = ownToon(0xfff3dc);
  private readonly ripple: THREE.Mesh;
  private readonly lumps: THREE.InstancedMesh;
  private readonly whiskPivot = new THREE.Group();
  private readonly whisk: THREE.Group;
  private stirAngle = 0;

  // Loyang
  private readonly loyang = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly fillMat = ownToon(TOP);
  private readonly overflow: THREE.Mesh;
  private readonly flames: Flames;
  private readonly jug: THREE.Group;
  private readonly stream: THREE.Mesh;
  private readonly cake = new THREE.Group();
  private readonly hinge = new THREE.Group();
  private readonly halfL: THREE.Mesh;
  private readonly halfR: THREE.Mesh;
  private readonly holes: [THREE.InstancedMesh, THREE.InstancedMesh];
  private readonly butterL: THREE.Mesh;
  private readonly butterR: THREE.Mesh;
  private readonly butterMat = ownToon(PAL.butter, { transparent: true, opacity: 0.78 });
  private readonly pat: THREE.Mesh;
  private readonly meses: [THREE.InstancedMesh, THREE.InstancedMesh];
  private readonly cheese: [THREE.InstancedMesh, THREE.InstancedMesh];
  private readonly spreaderPivot = new THREE.Group();
  private readonly spreader: THREE.Group;
  private readonly shaker: THREE.Group;
  private readonly topBorn = new Float32Array(MESES + CHEESE).fill(-10);
  private topCursor = 0;
  private shakeAt = -10;
  private foldAt = -10;
  private steamAcc = 0;

  // Board
  private readonly strips: THREE.Mesh[] = [];
  private readonly knife: THREE.Group;
  private chopAt = -10;

  private lastGrade: string | null = null;

  constructor(hooks: RigHooks) {
    this.hooks = hooks;

    /* ---------------- bowl ---------------- */
    this.bowl.position.set(SPOT.bowl[0], 0, SPOT.bowl[2]);
    this.flour = new THREE.Mesh(domeGeo(), toon(0xfffcf4));
    this.flour.position.set(-0.025, 0.012, -0.01);
    this.flour.castShadow = true;
    for (const [x, z] of [
      [0.04, 0.02],
      [0.02, -0.04],
    ] as const) {
      const y = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        toon(0xffb300),
      );
      y.scale.set(1, 0.7, 1);
      y.position.set(x, 0.022, z);
      this.bowl.add(y);
      this.yolks.push(y);
    }
    this.batterTop = new THREE.Mesh(new THREE.CircleGeometry(1, 36), this.batterMat);
    this.batterTop.rotation.x = -Math.PI / 2;
    this.ripple = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.003, 4, 40, Math.PI * 1.3), toon(0xe9bf62));
    this.ripple.rotation.x = -Math.PI / 2;
    this.lumps = instanced(new THREE.SphereGeometry(0.006, 6, 5), toon(0xfffcf4), LUMPS, false);
    this.whisk = whisk();
    this.whiskPivot.add(this.whisk);
    this.bowl.add(this.flour, this.batterTop, this.ripple, this.lumps, this.whiskPivot);
    this.group.add(this.bowl);

    /* ---------------- loyang ---------------- */
    this.loyang.position.set(SPOT.loyang[0], ON_STOVE, SPOT.loyang[2]);
    this.flames = new Flames(14, 'ring', 0.05, 0.05);
    this.flames.group.position.set(SPOT.loyang[0], STOVE.top + 0.02, SPOT.loyang[2]);
    this.group.add(this.flames.group);
    this.fill = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.002, R - 0.002, 1, 40), this.fillMat);
    this.fill.castShadow = false;
    this.overflow = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.022, 6, 40), toon(TOP));
    this.overflow.rotation.x = -Math.PI / 2;
    this.overflow.scale.set(1, 1, 0.18);
    this.jug = jug(TOP);
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 1, 10), toon(TOP));
    this.loyang.add(this.fill, this.overflow, this.jug, this.stream);

    this.halfL = new THREE.Mesh(halfDisc(-1), toon(0xffffff, { vertexColors: true }));
    this.halfR = new THREE.Mesh(halfDisc(1), toon(0xffffff, { vertexColors: true }));
    this.hinge.add(this.halfR);
    this.cake.add(this.halfL, this.hinge);
    const holeGeo = new THREE.CircleGeometry(0.0045, 10);
    holeGeo.rotateX(-Math.PI / 2);
    const holeMat = toon(0xd9a24e);
    this.holes = [instanced(holeGeo, holeMat, HOLES, false), instanced(holeGeo, holeMat, HOLES, false)];
    const butterGeo = (side: 1 | -1) =>
      new THREE.CircleGeometry(1, 36, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
    this.butterL = new THREE.Mesh(butterGeo(-1), this.butterMat);
    this.butterR = new THREE.Mesh(butterGeo(1), this.butterMat);
    this.pat = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.028), toon(PAL.butter));
    this.pat.castShadow = true;
    const mesesGeo = new THREE.CapsuleGeometry(0.0011, 0.0048, 2, 4);
    mesesGeo.rotateZ(Math.PI / 2);
    const cheeseGeo = new THREE.BoxGeometry(0.012, 0.0024, 0.003);
    this.meses = [
      instanced(mesesGeo, toon(PAL.choco), MESES, false),
      instanced(mesesGeo, toon(PAL.choco), MESES, false),
    ];
    this.cheese = [
      instanced(cheeseGeo, toon(0xfff08a), CHEESE, false),
      instanced(cheeseGeo, toon(0xfff08a), CHEESE, false),
    ];
    this.halfL.add(this.holes[0], this.butterL, this.meses[0], this.cheese[0]);
    this.halfR.add(this.holes[1], this.butterR, this.meses[1], this.cheese[1]);
    this.loyang.add(this.cake, this.pat);
    this.spreader = spreader();
    this.spreaderPivot.add(this.spreader);
    this.shaker = shaker(0x5a3420);
    this.loyang.add(this.spreaderPivot, this.shaker);
    this.group.add(this.loyang);

    /* ---------------- board ---------------- */
    const bx = SPOT.board[0];
    const bz = SPOT.board[2];
    const w = (2 * R) / STRIPS;
    for (let i = 0; i < STRIPS; i++) {
      const x0 = -R + i * w;
      const geo = stripGeometry(x0 + 0.0008, x0 + w - 0.0008, 0.042);
      const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
      m.castShadow = true;
      m.position.set(bx, 0.03, bz - 0.06);
      this.strips.push(m);
      this.group.add(m);
    }
    this.knife = knife();
    this.knife.position.set(bx, 0.03, bz);
    this.group.add(this.knife);
  }

  reset(stepIndex: number, _t: number): void {
    this.lastGrade = null;
    if (stepIndex === S_SPRINKLE) {
      this.topBorn.fill(-10);
      this.topCursor = 0;
    }
    if (stepIndex === S_FOLD) this.foldAt = -10;
  }

  pulse(stepIndex: number, f: ActorFrame): void {
    const { t } = f;
    const fx = this.hooks.fx;
    switch (stepIndex) {
      case S_MIX:
      case S_BUTTER:
        if (stepIndex === S_MIX)
          fx.bits(this.bowl.position.x, 0.06, this.bowl.position.z, 0xf6dfa6, 2, 0.035);
        return;
      case S_SPRINKLE:
        this.shakeAt = t;
        for (let k = 0; k < 16; k++) {
          const i = this.topCursor;
          this.topCursor = (this.topCursor + 1) % (MESES + CHEESE);
          this.topBorn[i] = t + k * 0.01;
        }
        return;
      case S_FOLD:
        this.foldAt = t;
        this.hooks.kick(0.003);
        return;
      case S_CUT:
        this.chopAt = t;
        fx.bits(SPOT.board[0], 0.07, SPOT.board[2], 0xf2cf7e, 3, 0.04, 0x5a3420);
        this.hooks.kick(0.004);
        return;
      default:
        return;
    }
  }

  update(f: ActorFrame): void {
    const { m, t, dt } = f;
    const fx = this.hooks.fx;
    const plated = m.plated || m.poster === true;
    if (m.grade !== this.lastGrade) {
      this.lastGrade = m.grade;
      if (m.grade === 'gagal' && m.reason === 'burnt' && m.stepIndex === S_POUR) {
        for (let i = 0; i < 8; i++)
          fx.bits(this.loyang.position.x, ON_STOVE + 0.05, this.loyang.position.z, TOP, 2, ON_STOVE);
      }
    }
    const mixP = f.stepP(S_MIX);
    const pourA = plated
      ? this.final(m, S_POUR, 0.71)
      : m.stepIndex === S_POUR
        ? m.amount
        : this.final(m, S_POUR, m.stepIndex > S_POUR ? 0.71 : 0);
    const butterP = f.stepP(S_BUTTER);
    const sprinkleP = f.stepP(S_SPRINKLE);
    const foldP = f.stepP(S_FOLD);
    const cutP = f.stepP(S_CUT);

    /* ---------------- bowl ---------------- */
    const mixing = !plated && m.stepIndex === S_MIX;
    const inBowl = !plated && m.stepIndex <= S_MIX;
    this.flour.visible = inBowl && mixP < 0.95;
    this.flour.scale.set(0.05 * (1 - mixP * 0.5), 0.05 * (1 - mixP), 0.05 * (1 - mixP * 0.5));
    for (const y of this.yolks) {
      y.visible = inBowl && mixP < 0.6;
      y.scale.set(1 - mixP, (1 - mixP) * 0.7, 1 - mixP);
    }
    const fillY = inBowl ? lerp(0.016, 0.034, mixP) : 0.012;
    const fillR = inBowl ? lerp(0.098, 0.12, mixP) : 0.088;
    this.batterTop.position.y = fillY;
    this.batterTop.scale.setScalar(fillR);
    mixColor(this.c, 0xf3e3c4, 0xf4d38c, inBowl ? mixP : 1);
    this.batterMat.color.copy(this.c);
    const target = f.sp * 20 * (Math.PI / 2);
    if (mixing) this.stirAngle = lerp(this.stirAngle, target, 1 - Math.exp(-10 * dt));
    this.ripple.visible = mixing && mixP > 0.1;
    this.ripple.position.y = fillY + 0.001;
    this.ripple.rotation.z = -this.stirAngle * 0.5;
    for (let i = 0; i < LUMPS; i++) {
      const [x, z] = discPoint(i * 3 + 8, 0.085);
      const k = smooth(0.1 + (i % 7) * 0.1, 0.4 + (i % 7) * 0.1, mixP);
      const a = -this.stirAngle * 0.2;
      setInstance(
        this.lumps,
        i,
        x * Math.cos(a) - z * Math.sin(a),
        fillY + 0.002,
        x * Math.sin(a) + z * Math.cos(a),
        0,
        0,
        0,
        (1 - k) * (0.8 + rand(i) * 0.6),
      );
    }
    this.lumps.count = inBowl ? LUMPS : 0;
    this.lumps.instanceMatrix.needsUpdate = true;
    this.whisk.visible = mixing;
    if (mixing) {
      this.whiskPivot.rotation.y = -this.stirAngle;
      this.whisk.position.set(0.05, fillY - 0.005, 0);
      this.whisk.rotation.set(0.0, 0, -0.45);
    }

    /* ---------------- loyang: pour ---------------- */
    const pouring = !plated && m.stepIndex === S_POUR;
    const poured = plated || m.stepIndex > S_POUR || (pouring && pourA > 0.001);
    const lv = level(Math.min(pourA, 1));
    const asCake = plated || m.stepIndex > S_POUR;
    this.fill.visible = pouring && pourA > 0.002;
    this.fill.scale.set(
      lerp(0.75, 1, smooth(0, 0.2, pourA)),
      lv - FLOOR,
      lerp(0.75, 1, smooth(0, 0.2, pourA)),
    );
    this.fill.position.y = FLOOR + (lv - FLOOR) / 2;
    this.fillMat.color.setHex(TOP);
    const over = smooth(0.95, 1.0, pourA);
    this.overflow.visible = (pouring || asCake) && over > 0.01 && !(m.plated || m.stepIndex >= S_CUT);
    this.overflow.scale.set(0.85 + 0.15 * over, 0.85 + 0.15 * over, 0.18);
    this.overflow.position.y = -0.03;
    this.jug.visible = pouring && (m.phase === 'cook' || m.phase === 'ready');
    const tilt = pouring && m.held ? 1 : 0;
    this.jug.position.set(0.05, 0.16, -0.02);
    this.jug.rotation.set(0, 0.5, lerp(0.2, -0.95, tilt));
    this.stream.visible = pouring && m.held;
    if (this.stream.visible) {
      const top = 0.15;
      this.stream.scale.set(1, top - lv, 1);
      this.stream.position.set(0.02, (top + lv) / 2, 0.0);
    }

    /* ---------------- loyang: the cooked cake ---------------- */
    this.cake.visible = asCake && !(m.plated || m.stepIndex >= S_CUT);
    const thick = lv - FLOOR;
    this.halfL.scale.set(1, thick, 1);
    this.halfR.scale.set(1, thick, 1);
    this.cake.position.y = FLOOR;
    // Children of the halves are scaled by `thick` in Y: place them in unit space.
    const ky = 1 / Math.max(0.004, thick);
    const since = pouring || m.stepIndex === S_POUR ? 0 : f.since + (m.stepIndex - S_POUR) * 6;
    const holeK = asCake ? smooth(0, 2.5, since + 2) : 0;
    for (let s = 0; s < 2; s++) {
      const im = this.holes[s]!;
      let n = 0;
      for (let i = 0; i < HOLES; i++) {
        const [x, z] = discPoint(i * 13 + s * 997, R * 0.92);
        const xs = Math.abs(x) * (s === 0 ? -1 : 1);
        if (rand(i + 50) > holeK) continue;
        setInstance(im, n++, xs, 1 + 0.002 * ky, z, 0, 0, 0, [0.7 + rand(i) * 0.8, ky, 0.7 + rand(i) * 0.8]);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
    // Butter: a pat melts and spreads with the spreader.
    const buttering = !plated && m.stepIndex === S_BUTTER;
    const bp = m.stepIndex > S_BUTTER || plated ? 1 : buttering ? butterP : 0;
    for (const b of [this.butterL, this.butterR]) {
      b.visible = bp > 0.02;
      const r = 0.03 + 0.09 * bp;
      b.scale.set(r, 1, r);
      b.position.y = 1 + 0.004 * ky;
    }
    this.pat.visible = buttering && bp < 0.97;
    this.pat.position.set(0, lv + 0.005, 0);
    this.pat.scale.set(1 - bp * 0.8, 1 - bp * 0.9, 1 - bp * 0.8);
    const spreading = buttering && (m.phase === 'cook' || m.phase === 'ready' || m.phase === 'reveal');
    this.spreader.visible = spreading;
    if (spreading) {
      const tgt = f.sp * 12 * (Math.PI / 2);
      this.stirAngle = lerp(this.stirAngle, tgt, 1 - Math.exp(-10 * dt));
      this.spreaderPivot.rotation.y = -this.stirAngle;
      this.spreader.position.set(0.055, lv + 0.004, 0);
      this.spreader.rotation.set(0, 0, 0.1);
    }
    // Sprinkles: chocolate and cheese rain down on each tap.
    const sprinkling = !plated && m.stepIndex === S_SPRINKLE;
    this.shaker.visible = sprinkling && (m.phase === 'cook' || m.phase === 'ready');
    const sh = clamp01((t - this.shakeAt) / 0.18);
    this.shaker.position.set(0.0, lv + 0.17 + bump(sh) * 0.02, 0.0);
    this.shaker.rotation.set(0, 0, Math.PI - 0.35 + bump(sh) * 0.5);
    const settledAll = plated || m.stepIndex > S_SPRINKLE;
    const fullCount = Math.round((settledAll ? this.final(m, S_SPRINKLE, 1) : sprinkleP) * (MESES + CHEESE));
    const counts = [
      [0, 0],
      [0, 0],
    ];
    for (let i = 0; i < MESES + CHEESE; i++) {
      const born = settledAll ? -10 : this.topBorn[i]!;
      if (!(sprinkling || settledAll)) break;
      if (born < 0 && i >= fullCount) continue;
      const cheese = i % 7 >= 5;
      const [x, z] = discPoint(i * 7 + 3, R * 0.9);
      const s = x < 0 ? 0 : 1;
      const fs = born < 0 ? 1 : clamp01((t - born) / 0.32);
      const y = lerp(0.17 / Math.max(0.004, thick), 1 + 0.006 * ky, fs * fs);
      const im = cheese ? this.cheese[s]! : this.meses[s]!;
      const row = counts[s]!;
      const idx = cheese ? row[1]!++ : row[0]!++;
      setInstance(im, idx, x * lerp(0.2, 1, fs), y, z * lerp(0.2, 1, fs), rand(i) * 0.4, rand(i + 1) * 6, 0, [
        1,
        ky,
        1,
      ]);
    }
    for (let s = 0; s < 2; s++) {
      this.meses[s]!.count = counts[s]![0]!;
      this.cheese[s]!.count = counts[s]![1]!;
      this.meses[s]!.instanceMatrix.needsUpdate = true;
      this.cheese[s]!.instanceMatrix.needsUpdate = true;
    }
    // Fold: the right half swings over onto the left.
    const folding = !plated && m.stepIndex === S_FOLD;
    const fp = m.stepIndex > S_FOLD || plated ? 1 : folding ? foldP : 0;
    const fs2 = clamp01((t - this.foldAt) / 0.3);
    this.hinge.rotation.z = Math.PI * fp + (folding && fs2 < 1 ? bump(fs2) * 0.15 : 0);
    // The hinge sits on the cake's top surface at the center line, so the right half swings up
    // and lands upside down on the left half.
    this.hinge.position.y = thick;
    this.halfR.position.y = -thick;
    // Heat under the loyang while it cooks.
    const cooking = !plated && m.stepIndex >= S_POUR && m.stepIndex <= S_FOLD;
    this.flames.update(t, cooking ? 0.55 : 0);
    if (cooking && poured) {
      this.steamAcc += dt * 3;
      while (this.steamAcc > 1) {
        this.steamAcc -= 1;
        fx.steam(this.loyang.position.x, ON_STOVE + 0.08, this.loyang.position.z, 0.1, 0.8);
      }
    }
    if (pouring && m.held && rand(Math.floor(t * 30)) < dt * 10)
      fx.bits(
        this.loyang.position.x + 0.02,
        ON_STOVE + lv + 0.01,
        this.loyang.position.z,
        TOP,
        1,
        ON_STOVE + lv,
      );

    /* ---------------- board: cut strips ---------------- */
    const onBoard = plated || m.stepIndex >= S_CUT;
    const cuts = m.poster ? STRIPS - 1 : Math.round(cutP * (STRIPS - 1));
    // A thin pour makes a thin cake.
    const cakeK = Math.min(1.25, Math.max(0.3, pourA / 0.71));
    const ks = clamp01((t - this.chopAt) / 0.16);
    const down = ks < 1 ? (ks < 0.35 ? ks / 0.35 : 1 - (ks - 0.35) / 0.65) : 0;
    const bx = SPOT.board[0];
    for (let i = 0; i < STRIPS; i++) {
      const st = this.strips[i]!;
      st.visible = onBoard;
      st.scale.y = cakeK;
      // Pieces left of a cut slide apart a little.
      st.position.x = bx + Math.min(i, cuts) * 0.006 - (cuts * 0.006) / 2;
      st.rotation.y = plated ? (i - STRIPS / 2) * 0.02 : 0;
    }
    const cutting =
      !plated && m.stepIndex === S_CUT && (m.phase === 'cook' || m.phase === 'ready' || m.phase === 'reveal');
    this.knife.visible = cutting;
    if (cutting) {
      const w = (2 * R) / STRIPS;
      const line = Math.min(cuts + 1, STRIPS - 1);
      const cx = -R + line * w + cuts * 0.006 - (cuts * 0.006) / 2;
      this.knife.position.set(
        bx + cx + 0.022,
        0.03 + lerp(0.09 + Math.sin(t * 5) * 0.004, 0.0, down),
        SPOT.board[2] - 0.01,
      );
      this.knife.rotation.set(0, -0.85, 0.06 * down);
    } else {
      this.knife.position.set(bx + 0.02, 0.033, SPOT.board[2] + 0.11);
      this.knife.rotation.set(-Math.PI / 2, 0, 0.12);
    }
  }

  private final(m: ActorFrame['m'], i: number, fallback: number): number {
    const v = m.finals[i];
    return v === undefined || Number.isNaN(v) ? fallback : v;
  }
}
