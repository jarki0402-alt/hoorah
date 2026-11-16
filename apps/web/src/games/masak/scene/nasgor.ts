/**
 * Nasi goreng on one station: shallots and garlic get sliced on the board, chillies pounded into
 * sambal in the cobek, the paste sizzles in the wok, rice is tossed until it browns, an egg goes
 * raw -> golden -> burnt in the pan, and everything is plated with garnish.
 */
import * as THREE from 'three';
import { Flames } from './fx';
import {
  approach,
  bump,
  clamp01,
  isLowDetail,
  lerp,
  mixColor,
  ownToon,
  PAL,
  ramp,
  rand,
  smooth,
  toon,
  vcToon,
} from './kit';
import type { ActorFrame, DishActor, RigHooks } from './model';
import {
  blobGeo,
  chiliGeo,
  discPoint,
  domeGeo,
  eggEdgeGeo,
  eggWhiteGeo,
  garlicGeo,
  grainGeo,
  instanced,
  knife,
  paddle,
  pestle,
  setInstance,
  shallotGeo,
  sliceGeo,
  spatula,
} from './props';
import { ON_STOVE, SPOT, STOVE } from './spots';

const S_CHOP = 0;
const S_POUND = 1;
const S_SAUTE = 2;
const S_TOSS = 3;
const S_EGG = 4;
const S_PLATE = 5;

const EGG_WHITE: [number, number][] = [
  [0, 0xd5d6cb],
  [0.22, 0xf1efe6],
  [0.42, 0xfffdf6],
  [0.8, 0xfff4dc],
  [0.9, 0xf0cf98],
  [1, 0x5e4130],
];
const EGG_EDGE: [number, number][] = [
  [0, 0xdcdcd0],
  [0.38, 0xfffaf0],
  [0.58, 0xf4c873],
  [0.71, 0xe7a23a],
  [0.82, 0xc6772a],
  [0.92, 0x7a4418],
  [1, 0x2b211c],
];
const EGG_YOLK: [number, number][] = [
  [0, 0xffb300],
  [0.7, 0xffa000],
  [0.9, 0xe07f00],
  [1, 0x4f2e12],
];

/** Height of the wok's inner surface at radius r (wok-local). */
function wokY(r: number): number {
  const a = Math.asin(Math.min(0.99, r / 0.194));
  return 0.004 + 0.16 * (1 - Math.cos(a));
}

interface Item {
  mesh: THREE.Mesh;
  /** Left end x (board-local) that stays put while slices come off the right. */
  left: number;
  len: number;
  slices: number;
  /** First slice index belonging to this item (in cut order). */
  first: number;
  garlic: boolean;
}

const RICE = 560;
/** Share of the grains drawn on weak devices: thousands of tiny triangles per station view. */
const LOW_GRAINS = 0.4;
/** Rice mound in the wok (wok-local): base height, radius, dome height. */
const MOUND_Y = 0.006;
const MOUND_R = 0.104;
const MOUND_H = 0.052;
const BITS = 36;
const PLATE_GRAINS = 260;
const FLAKES = 40;

export class NasgorActor implements DishActor {
  readonly group = new THREE.Group();
  private readonly hooks: RigHooks;
  private readonly c = new THREE.Color();

  // Board
  private readonly board = new THREE.Group();
  private readonly items: Item[] = [];
  private readonly shallotSlices: THREE.InstancedMesh;
  private readonly garlicSlices: THREE.InstancedMesh;
  private readonly sliceBorn: number[] = [];
  private readonly knife: THREE.Group;
  private chopAt = -10;

  // Cobek
  private readonly cobek = new THREE.Group();
  private readonly pieces: { o: THREE.Object3D; th: number; base: THREE.Vector3; slice: boolean }[] = [];
  private readonly paste: THREE.Mesh;
  private readonly pasteMat = ownToon(PAL.paste);
  private readonly pestle: THREE.Group;
  private poundAt = -10;

  // Wok
  private readonly wok = new THREE.Group();
  private readonly flamesWok: Flames;
  /** Wok hei: tongues licking up the outside of the wok on a big flare. */
  private readonly flamesHei: Flames;
  private readonly oil: THREE.Mesh;
  private readonly wokPaste: THREE.Mesh;
  private readonly wokPasteMat = ownToon(PAL.paste);
  private readonly rice: THREE.InstancedMesh;
  private readonly riceMass: THREE.Mesh;
  private readonly riceMassMat = ownToon(PAL.rice);
  private readonly riceBits: THREE.InstancedMesh;
  private readonly riceBase: Float32Array;
  private readonly riceTh: Float32Array;
  private readonly riceHop: Float32Array;
  private readonly riceHopH: Float32Array;
  private hopCursor = 0;
  /** Grains in the wok and on the plate actually drawn (fewer on weak devices). */
  private readonly riceMax = isLowDetail() ? Math.round(RICE * LOW_GRAINS) : RICE;
  private readonly plateMax = isLowDetail() ? Math.round(PLATE_GRAINS * LOW_GRAINS) : PLATE_GRAINS;
  private riceColorP = -1;
  private readonly spatulaPivot = new THREE.Group();
  private readonly spatula: THREE.Group;
  private stirAngle = 0;
  private stirAt = -10;
  private steamAcc = 0;

  // Pan + egg
  private readonly pan = new THREE.Group();
  private readonly flamesPan: Flames;
  private readonly egg = new THREE.Group();
  private readonly whiteMat = ownToon(0xffffff);
  private readonly edgeMat = ownToon(0xffffff);
  private readonly yolkMat = ownToon(PAL.yolk);
  private sizzleAcc = 0;

  // Plate
  private readonly plate = new THREE.Group();
  private readonly mound: THREE.Mesh;
  private readonly moundMat = ownToon(PAL.nasgor);
  private readonly plateGrains: THREE.InstancedMesh;
  private readonly plateEgg = new THREE.Group();
  private readonly garnish = new THREE.Group();
  private readonly flakes: THREE.InstancedMesh;
  private readonly scoop: THREE.Group;
  private scoopAt = -10;
  private garnishAt = -10;

  private lastGrade: string | null = null;

  constructor(hooks: RigHooks) {
    this.hooks = hooks;
    this.group.add(this.board, this.cobek, this.wok, this.pan, this.plate);

    /* ---------------- board ---------------- */
    this.board.position.set(SPOT.board[0], 0.03, SPOT.board[2]);
    const shallotMat = vcToon();
    const defs: [number, boolean, number][] = [
      [-0.13, false, 5],
      [-0.055, false, 5],
      [0.035, true, 4],
    ];
    // Cut order is right to left: garlic first.
    let first = 0;
    const order = [...defs].reverse();
    const firstOf = new Map<number, number>();
    for (const [x, , n] of order) {
      firstOf.set(x, first);
      first += n;
    }
    for (const [x, garlic, n] of defs) {
      const mesh = new THREE.Mesh(garlic ? garlicGeo() : shallotGeo(), shallotMat);
      mesh.castShadow = true;
      if (garlic) {
        mesh.position.set(x + 0.022, 0.02, -0.03);
      } else {
        mesh.rotation.set(0.2, 0.15, -Math.PI / 2);
        mesh.position.set(x, 0.021, -0.03);
      }
      this.board.add(mesh);
      this.items.push({
        mesh,
        left: x,
        len: garlic ? 0.044 : 0.062,
        slices: n,
        first: firstOf.get(x)!,
        garlic,
      });
    }
    // Two spare chillies and a spring onion for colour.
    const ch = new THREE.Mesh(chiliGeo(), vcToon());
    ch.position.set(0.13, 0.008, -0.09);
    ch.rotation.set(0, 2.6, 0);
    ch.castShadow = true;
    const ch2 = new THREE.Mesh(chiliGeo(true), vcToon());
    ch2.position.set(0.16, 0.006, -0.06);
    ch2.rotation.set(0, 2.2, 0);
    this.board.add(ch, ch2);
    this.shallotSlices = instanced(
      sliceGeo('shallot', 0.019, PAL.shallot, PAL.shallotIn),
      vcToon(),
      10,
      true,
    );
    this.garlicSlices = instanced(sliceGeo('garlic', 0.013, 0xe7d8b8, 0xfbf3e2), vcToon(), 4, true);
    this.board.add(this.shallotSlices, this.garlicSlices);
    for (let i = 0; i < 14; i++) this.sliceBorn.push(-10);
    this.knife = knife();
    this.board.add(this.knife);

    /* ---------------- cobek ---------------- */
    this.cobek.position.set(SPOT.cobek[0], 0, SPOT.cobek[2]);
    this.cobek.scale.setScalar(1.15);
    const chiliPos: [number, number, number, boolean][] = [
      [-0.03, 0.022, 0.5, false],
      [0.02, 0.026, 2.4, false],
      [-0.005, 0.03, 1.4, false],
      [0.04, 0.022, -0.6, true],
      [-0.045, 0.02, 3.4, true],
    ];
    chiliPos.forEach(([x, y, ry, small], i) => {
      const m = new THREE.Mesh(chiliGeo(small), vcToon());
      m.castShadow = true;
      m.position.set(x, y, (i % 2 ? 1 : -1) * 0.015);
      m.rotation.set(0.15, ry, 0.12);
      this.cobek.add(m);
      this.pieces.push({ o: m, th: 0.35 + i * 0.12, base: m.position.clone(), slice: false });
    });
    for (let i = 0; i < 6; i++) {
      const garlic = i >= 4;
      const m = new THREE.Mesh(
        garlic
          ? sliceGeo('garlic', 0.013, 0xe7d8b8, 0xfbf3e2)
          : sliceGeo('shallot', 0.019, PAL.shallot, PAL.shallotIn),
        vcToon(),
      );
      const [x, z] = discPoint(i * 13 + 5, 0.05);
      m.position.set(x, 0.03 + i * 0.002, z);
      m.rotation.set(rand(i + 3) - 0.5, rand(i) * 6, rand(i + 9) - 0.5);
      m.visible = false;
      this.cobek.add(m);
      this.pieces.push({ o: m, th: 0.2 + i * 0.1, base: m.position.clone(), slice: true });
    }
    this.paste = new THREE.Mesh(blobGeo(2), this.pasteMat);
    this.paste.position.set(0, 0.012, 0);
    this.cobek.add(this.paste);
    this.pestle = pestle();
    this.pestle.scale.setScalar(0.8);
    this.cobek.add(this.pestle);

    /* ---------------- wok ---------------- */
    this.wok.position.set(SPOT.wok[0], ON_STOVE, SPOT.wok[2]);
    this.flamesWok = new Flames(14, 'ring', 0.04, 0.07);
    this.flamesWok.group.position.set(SPOT.wok[0], STOVE.top + 0.02, SPOT.wok[2]);
    this.group.add(this.flamesWok.group);
    this.flamesHei = new Flames(22, 'ring', 0.16, 0.15, 0.24, 0.3);
    this.flamesHei.group.position.set(SPOT.wok[0], STOVE.top + 0.03, SPOT.wok[2]);
    this.group.add(this.flamesHei.group);
    this.oil = new THREE.Mesh(new THREE.CircleGeometry(0.075, 28), toon(0x5a4626));
    this.oil.rotation.x = -Math.PI / 2;
    this.oil.position.y = wokY(0) + 0.0015;
    this.wok.add(this.oil);
    this.wokPaste = new THREE.Mesh(blobGeo(5), this.wokPasteMat);
    this.wokPaste.position.y = wokY(0);
    this.wok.add(this.wokPaste);
    this.rice = instanced(grainGeo(), toon(0xffffff), RICE, false);
    this.riceBits = instanced(new THREE.BoxGeometry(0.0055, 0.0048, 0.0055), toon(0xffffff), BITS, false);
    this.riceBase = new Float32Array(RICE * 3);
    this.riceTh = new Float32Array(RICE);
    this.riceHop = new Float32Array(RICE).fill(-10);
    this.riceHopH = new Float32Array(RICE);
    for (let i = 0; i < RICE; i++) {
      const [x, z] = discPoint(i * 3 + 1, MOUND_R * 0.97);
      const u = Math.hypot(x, z) / MOUND_R;
      this.riceBase[i * 3] = x;
      this.riceBase[i * 3 + 1] =
        MOUND_Y + MOUND_H * Math.sqrt(Math.max(0, 1 - u * u)) + 0.0012 + rand(i + 500) * 0.002;
      this.riceBase[i * 3 + 2] = z;
      this.riceTh[i] = 0.12 + 0.82 * rand(i + 900);
    }
    this.riceMass = new THREE.Mesh(domeGeo(), this.riceMassMat);
    this.riceMass.position.y = MOUND_Y;
    this.riceMass.castShadow = true;
    this.wok.add(this.riceMass);
    for (let i = 0; i < BITS; i++) {
      this.riceBits.setColorAt(i, this.c.setHex([0xff7a1a, 0x4caf3c, 0xe0261b, 0x6fbf45][i % 4]!));
    }
    this.rice.count = RICE;
    this.riceBits.count = BITS;
    this.wok.add(this.rice, this.riceBits);
    this.spatulaPivot.position.set(0, 0, 0);
    this.spatula = spatula();
    this.spatulaPivot.add(this.spatula);
    this.wok.add(this.spatulaPivot);

    /* ---------------- pan + egg ---------------- */
    this.pan.position.set(SPOT.pan[0], ON_STOVE, SPOT.pan[2]);
    this.flamesPan = new Flames(12, 'ring', 0.035, 0.05);
    this.flamesPan.group.position.set(SPOT.pan[0], STOVE.top + 0.02, STOVE.z);
    this.group.add(this.flamesPan.group);
    const panOil = new THREE.Mesh(new THREE.CircleGeometry(0.088, 28), toon(0x3d3528));
    panOil.rotation.x = -Math.PI / 2;
    panOil.position.y = 0.0075;
    this.pan.add(panOil);
    this.buildEgg(this.egg);
    this.egg.position.set(0, 0.008, 0);
    this.pan.add(this.egg);

    /* ---------------- plate ---------------- */
    this.plate.position.set(SPOT.plate[0], 0.011, SPOT.plate[2]);
    this.mound = new THREE.Mesh(domeGeo(), this.moundMat);
    this.mound.castShadow = true;
    this.plate.add(this.mound);
    this.plateGrains = instanced(grainGeo(), toon(0xffffff), PLATE_GRAINS, false);
    this.plate.add(this.plateGrains);
    this.buildEgg(this.plateEgg);
    this.plate.add(this.plateEgg);
    this.buildGarnish();
    this.plate.add(this.garnish);
    this.flakes = instanced(new THREE.BoxGeometry(0.006, 0.0025, 0.004), toon(0x9a5520), FLAKES, false);
    this.plate.add(this.flakes);
    this.scoop = paddle();
    this.plate.add(this.scoop);
  }

  private buildEgg(g: THREE.Group): void {
    const white = new THREE.Mesh(eggWhiteGeo(), this.whiteMat);
    white.scale.set(0.068, 0.09, 0.068);
    white.castShadow = true;
    const edge = new THREE.Mesh(eggEdgeGeo(), this.edgeMat);
    edge.scale.set(0.068, 0.09, 0.068);
    const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), this.yolkMat);
    yolk.scale.set(1, 0.62, 1);
    yolk.position.set(0.008, 0.009, -0.004);
    yolk.castShadow = true;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), toon(0xffffff));
    shine.position.set(0.0, 0.021, -0.012);
    shine.scale.set(1.4, 0.5, 1);
    yolk.add(shine);
    shine.position.set(-0.008, 0.017, -0.006);
    g.add(white, edge, yolk);
  }

  private buildGarnish(): void {
    const cuc = sliceGeo('cucumber', 0.021, 0x3f9e3a, 0xe9f5c8);
    const tom = sliceGeo('tomato', 0.019, 0xe0261b, 0xff6a5a);
    const place: [THREE.BufferGeometry, number, number, number, number][] = [
      [cuc, 0.085, 0.045, 0.2, 0.5],
      [cuc, 0.098, 0.005, 0.25, 0.2],
      [cuc, 0.088, -0.035, 0.3, 0.8],
      [tom, -0.07, 0.07, -0.3, 0.1],
      [tom, -0.045, 0.092, -0.25, 1.4],
    ];
    for (const [geo, x, z, tilt, ry] of place) {
      const m = new THREE.Mesh(geo, vcToon());
      m.position.set(x, 0.006, z);
      m.rotation.set(tilt * 0.4, ry, tilt);
      m.castShadow = true;
      this.garnish.add(m);
    }
    // Kerupuk leaning on the rice.
    const kgeo = new THREE.CylinderGeometry(0.045, 0.045, 0.004, 20);
    const kpos = kgeo.getAttribute('position');
    for (let i = 0; i < kpos.count; i++) {
      const x = kpos.getX(i);
      const z = kpos.getZ(i);
      const a = Math.atan2(z, x);
      kpos.setY(i, kpos.getY(i) + Math.sin(a * 6) * 0.003 * Math.hypot(x, z) * 20);
    }
    kgeo.computeVertexNormals();
    for (const [x, z, rx, rz] of [
      [-0.07, -0.05, 0.9, 0.3],
      [-0.035, -0.08, 1.1, -0.2],
    ] as const) {
      const k = new THREE.Mesh(kgeo, toon(0xfff0c8));
      k.position.set(x, 0.035, z);
      k.rotation.set(rx, 0, rz);
      k.castShadow = true;
      this.garnish.add(k);
    }
    const sprig = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), toon(PAL.leaf));
    sprig.scale.set(1.6, 0.4, 0.8);
    sprig.position.set(0.02, 0.065, 0.015);
    this.garnish.add(sprig);
  }

  reset(stepIndex: number, _t: number): void {
    this.lastGrade = null;
    if (stepIndex === S_TOSS) this.riceHop.fill(-10);
  }

  pulse(stepIndex: number, f: ActorFrame): void {
    const { t } = f;
    const fx = this.hooks.fx;
    switch (stepIndex) {
      case S_CHOP: {
        this.chopAt = t;
        const k = Math.min(13, Math.round(f.m.progress * 14) - 1);
        if (k >= 0) this.sliceBorn[k] = t;
        const kx = this.board.position.x + this.knife.position.x;
        fx.bits(kx, 0.05, this.board.position.z - 0.03, PAL.shallotIn, 3, 0.033, PAL.shallot);
        this.hooks.kick(0.004);
        return;
      }
      case S_POUND:
        this.poundAt = t;
        fx.bits(this.cobek.position.x, 0.05, this.cobek.position.z, PAL.paste, 3, 0.03, 0xff7a3d);
        this.hooks.kick(0.006);
        return;
      case S_SAUTE:
      case S_TOSS: {
        this.stirAt = t;
        const wx = this.wok.position.x;
        const wz = this.wok.position.z;
        fx.sizzle(wx, ON_STOVE + 0.05, wz, 0.08, 4);
        if (stepIndex === S_TOSS) {
          for (let k = 0; k < 26; k++) {
            this.hopCursor = (this.hopCursor + 37) % this.riceMax;
            const i = this.hopCursor;
            this.riceHop[i] = t + rand(i + k) * 0.08;
            this.riceHopH[i] = 0.025 + rand(i * 3 + k) * 0.05;
          }
        }
        return;
      }
      case S_EGG:
        fx.sizzle(this.pan.position.x, ON_STOVE + 0.03, this.pan.position.z, 0.07, 8);
        return;
      case S_PLATE:
        this.scoopAt = t;
        fx.bits(this.plate.position.x, 0.08, this.plate.position.z, PAL.nasgor, 6, 0.03, 0xe8c08a);
        this.hooks.kick(0.004);
        return;
      default:
        return;
    }
  }

  update(f: ActorFrame): void {
    const { m, t, dt } = f;
    const fx = this.hooks.fx;
    if (m.grade !== this.lastGrade) {
      this.lastGrade = m.grade;
      if (m.grade === 'gagal' && m.reason === 'burnt') {
        for (let i = 0; i < 6; i++) fx.smoke(this.pan.position.x, ON_STOVE + 0.03, this.pan.position.z, 0.9);
      }
    }

    /* ---------------- board ---------------- */
    const P = m.poster === true;
    const chopP = P ? 0 : f.stepP(S_CHOP);
    const cut = m.plated ? 14 : Math.round(chopP * 14);
    let cutX = 0.06;
    for (const it of this.items) {
      const done = clamp01((cut - it.first) / it.slices);
      const rem = 1 - done;
      it.mesh.visible = rem > 0.02 && (P || this.stepIndexAtMost(m, S_CHOP));
      if (it.garlic) {
        it.mesh.scale.set(Math.max(0.05, rem), 1, 1);
        it.mesh.position.x = it.left + 0.022 * Math.max(0.05, rem);
      } else {
        it.mesh.scale.set(1, Math.max(0.05, rem), 1);
      }
      if (done > 0 && done < 1) cutX = it.left + it.len * rem;
      else if (done === 0 && cut <= it.first) cutX = Math.min(cutX, it.left + it.len);
    }
    if (cut >= 14) cutX = -0.15;
    // Slices pile up in front of the board's middle.
    let ns = 0;
    let ng = 0;
    const showSlices = this.stepIndexAtMost(m, S_CHOP);
    for (let k = 0; k < 14; k++) {
      if (k >= cut || !showSlices) continue;
      const garlic = k < 4;
      const im = garlic ? this.garlicSlices : this.shallotSlices;
      const idx = garlic ? ng++ : ns++;
      const [px, pz] = discPoint(k * 11 + 3, 0.045);
      const tx = 0.05 + px;
      const tz = 0.07 + pz * 0.7;
      const s = clamp01((t - this.sliceBorn[k]!) / 0.24);
      const from = 0.06 - k * 0.012;
      const x = lerp(from, tx, s);
      const z = lerp(-0.03, tz, s);
      const y = 0.003 + (k % 3) * 0.002 + bump(s) * 0.04;
      setInstance(im, idx, x, y, z, (rand(k) - 0.5) * 0.3, rand(k + 5) * 6, (rand(k + 2) - 0.5) * 0.3);
    }
    this.shallotSlices.count = ns;
    this.garlicSlices.count = ng;
    this.shallotSlices.instanceMatrix.needsUpdate = true;
    this.garlicSlices.instanceMatrix.needsUpdate = true;
    // Knife: hovers over the cut, chops on each tap; rests flat when not in use.
    const chopping = f.active(S_CHOP) || (m.stepIndex === S_CHOP && m.phase === 'ready');
    const ks = clamp01((t - this.chopAt) / 0.16);
    const down = ks < 0.35 ? ks / 0.35 : 1 - (ks - 0.35) / 0.65;
    if (chopping) {
      this.knife.visible = true;
      const hover = 0.045 + Math.sin(t * 5) * 0.004;
      // Blade face turned toward the camera, edge chopping down across the bulb.
      this.knife.position.set(cutX + 0.022, lerp(hover, 0.0, down * (ks < 1 ? 1 : 0)), -0.004);
      this.knife.rotation.set(0, -0.85, 0.06 * down);
    } else {
      this.knife.position.set(0.02, 0.003, 0.11);
      this.knife.rotation.set(-Math.PI / 2, 0, 0.12);
    }

    /* ---------------- cobek ---------------- */
    const poundP = P ? 0 : f.stepP(S_POUND);
    const hasSlices = !P && (m.stepIndex >= S_POUND || m.plated);
    for (const pc of this.pieces) {
      const k = smooth(pc.th - 0.3, pc.th, poundP);
      pc.o.visible = k < 0.98 && (!pc.slice || hasSlices) && ((m.stepIndex <= S_POUND && !m.plated) || P);
      pc.o.scale.set(1 - k * 0.7, 1 - k * 0.85, 1 - k * 0.7);
      pc.o.position.set(pc.base.x * (1 - k * 0.6), pc.base.y - k * 0.012, pc.base.z * (1 - k * 0.6));
    }
    const pasteGone = !P && (m.stepIndex >= S_SAUTE || m.plated);
    const pg = pasteGone ? 0.35 : 0.25 + poundP * 0.85;
    this.paste.visible = poundP > 0.02 || pasteGone;
    this.paste.scale.set(
      0.055 * pg,
      (pasteGone ? 0.006 : 0.02 + poundP * 0.012) * (pasteGone ? 1 : 1),
      0.055 * pg,
    );
    mixColor(this.c, 0xf06a2a, 0xc22a18, poundP);
    this.pasteMat.color.copy(this.c);
    const pounding = P || f.active(S_POUND) || (m.stepIndex === S_POUND && m.phase === 'ready');
    this.pestle.visible = !P;
    if (pounding) {
      const ps = clamp01((t - this.poundAt) / 0.18);
      const pd = ps < 0.3 ? ps / 0.3 : 1 - (ps - 0.3) / 0.7;
      const hit = ps < 1 ? pd : 0;
      this.pestle.position.set(0.006, lerp(0.075, 0.018 + poundP * 0.006, hit), 0.004);
      this.pestle.rotation.set(0.15, 0.4, -0.2 + hit * 0.12 + Math.sin(t * 3) * 0.04);
    } else {
      // Resting in the bowl, leaning on the rim.
      this.pestle.position.set(0.05, 0.02, -0.02);
      this.pestle.rotation.set(0.1, 0.5, -0.75);
    }

    /* ---------------- wok ---------------- */
    const sauteP = f.stepP(S_SAUTE);
    const tossP = f.stepP(S_TOSS);
    const plateP = f.stepP(S_PLATE);
    const wokOn = !m.plated && m.stepIndex >= S_SAUTE && m.stepIndex <= S_TOSS;
    const flare = Math.exp(-(t - this.stirAt) * 6);
    let wokHeat = 0;
    if (m.plated) wokHeat = 0;
    else if (P) wokHeat = 1.7 + flare * 0.4;
    else if (m.stepIndex === S_SAUTE || m.stepIndex === S_TOSS) wokHeat = 0.9 + flare * 0.9;
    else if (m.stepIndex === S_EGG) wokHeat = 0.25;
    this.flamesWok.update(t, wokHeat);
    const hei = P ? 1.25 : m.stepIndex === S_TOSS && !m.plated ? flare * 1.1 : 0;
    this.flamesHei.update(t, hei);
    this.oil.visible = m.stepIndex <= S_TOSS && !m.plated;
    const pasteInWok = m.stepIndex >= S_SAUTE && !m.plated && m.stepIndex <= S_TOSS;
    this.wokPaste.visible = pasteInWok && tossP < 0.9;
    const spread = 1 + sauteP * 0.9;
    const under = 1 - smooth(0, 0.6, tossP);
    this.wokPaste.scale.set(
      0.045 * spread * under + 0.001,
      0.016 * (1 - sauteP * 0.45),
      0.045 * spread * under + 0.001,
    );
    this.wokPaste.rotation.y = this.stirAngle * 0.3;
    mixColor(this.c, 0xd23a1e, 0x8e3216, sauteP);
    this.wokPasteMat.color.copy(this.c);

    // Rice: drops in at the toss step, browns with stirring, hops on every quarter turn.
    const riceIn = m.plated ? 0 : m.stepIndex >= S_TOSS ? 1 : 0;
    const left = m.stepIndex >= S_PLATE ? 1 - plateP * 0.88 : 1;
    const riceN = Math.round(this.riceMax * riceIn * left);
    this.rice.visible = riceN > 0;
    this.riceBits.visible = riceN > 0;
    this.riceMass.visible = riceN > 0;
    if (riceN > 0) {
      const drop0 = m.stepIndex === S_TOSS ? clamp01(f.since / 0.5) : 1;
      const k = left < 1 ? 0.35 + 0.65 * left : 1;
      this.riceMass.scale.set(
        MOUND_R * (0.8 + 0.2 * k),
        (MOUND_H / 0.62) * k * (1 + flare * 0.08),
        MOUND_R * (0.8 + 0.2 * k),
      );
      this.riceMass.position.y = MOUND_Y + (1 - drop0) * 0.12;
      this.riceMass.rotation.y = this.stirAngle * 0.18;
      mixColor(this.c, 0xf6ecd8, PAL.nasgor, smooth(0.05, 0.95, tossP));
      this.riceMassMat.color.copy(this.c);
      const drop = m.stepIndex === S_TOSS ? clamp01(f.since / 0.5) : 1;
      const swirl = this.stirAngle * 0.18;
      const cs = Math.cos(swirl);
      const sn = Math.sin(swirl);
      for (let i = 0; i < this.riceMax; i++) {
        const bx = this.riceBase[i * 3]!;
        const bz = this.riceBase[i * 3 + 2]!;
        const x = bx * cs - bz * sn;
        const z = bx * sn + bz * cs;
        const hs = (t - this.riceHop[i]!) / 0.38;
        let hop = hs > 0 && hs < 1 ? this.riceHopH[i]! * 4 * hs * (1 - hs) : 0;
        let ox = 0;
        if (P && i % 3 === 0) {
          // Key art: a wok-toss fountain of rice above the rim.
          const ph = (t * 0.9 + rand(i + 31)) % 1;
          hop = (0.1 + rand(i + 7) * 0.16) * 4 * ph * (1 - ph);
          ox = (ph - 0.5) * 0.06;
        }
        const by = this.riceBase[i * 3 + 1]!;
        const y = MOUND_Y + (by - MOUND_Y) * k + hop + (1 - drop) * (0.12 + rand(i) * 0.05);
        const sc = P && i % 3 === 0 ? 1.45 : 1;
        setInstance(this.rice, i, x + ox, y, z, rand(i) * 3, rand(i + 1) * 6 + hop * 40, rand(i + 2) * 3, sc);
      }
      this.rice.count = riceN;
      this.rice.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < BITS; i++) {
        const j = (i * 9) % this.riceMax;
        const bx = this.riceBase[j * 3]!;
        const bz = this.riceBase[j * 3 + 2]!;
        const hs = (t - this.riceHop[j]!) / 0.38;
        const hop = hs > 0 && hs < 1 ? this.riceHopH[j]! * 4 * hs * (1 - hs) : 0;
        setInstance(
          this.riceBits,
          i,
          bx * cs - bz * sn,
          this.riceBase[j * 3 + 1]! + 0.002 + hop + (1 - drop) * 0.15,
          bx * sn + bz * cs,
          rand(i) * 3,
          rand(i + 4) * 3,
          0,
          0.9 + rand(i + 8) * 0.5,
        );
      }
      this.riceBits.count = Math.min(BITS, Math.round(BITS * left));
      this.riceBits.instanceMatrix.needsUpdate = true;
      if (Math.abs(tossP - this.riceColorP) > 0.004) {
        this.riceColorP = tossP;
        for (let i = 0; i < this.riceMax; i++) {
          const th = this.riceTh[i]!;
          const k = smooth(th - 0.3, th, tossP);
          if (i % 7 === 0) mixColor(this.c, PAL.rice, 0x8a4520, k);
          else mixColor(this.c, PAL.rice, PAL.nasgor, k);
          this.rice.setColorAt(i, this.c);
        }
        if (this.rice.instanceColor) this.rice.instanceColor.needsUpdate = true;
      }
    }
    // Spatula follows the quarter turns.
    const stirring = (m.stepIndex === S_SAUTE || m.stepIndex === S_TOSS) && !m.plated;
    const target = (m.stepIndex === S_TOSS ? 12 + f.sp * 20 : f.sp * 12) * (Math.PI / 2);
    if (stirring) this.stirAngle = approach(this.stirAngle, target, 10, dt);
    this.spatula.visible = wokOn || m.stepIndex === S_EGG;
    if (stirring) {
      const r = 0.07;
      this.spatulaPivot.rotation.y = -this.stirAngle;
      this.spatula.position.set(r, wokY(r) + 0.012 + flare * 0.012, 0);
      this.spatula.rotation.set(0.0, -Math.PI / 2, -0.35);
    } else {
      this.spatulaPivot.rotation.y = 2.3;
      this.spatula.position.set(0.15, 0.09, 0);
      this.spatula.rotation.set(0, -Math.PI / 2, -0.95);
    }
    // Steam and sizzle while the wok is hot.
    if (wokHeat > 0.5) {
      this.steamAcc += dt * (wokOn ? 7 : 3);
      while (this.steamAcc > 1) {
        this.steamAcc -= 1;
        fx.steam(
          this.wok.position.x,
          ON_STOVE + 0.1,
          this.wok.position.z,
          0.07,
          P ? 1.6 : m.stepIndex === S_TOSS ? 1.1 : 0.85,
        );
      }
      if (rand(Math.floor(t * 60)) < dt * 10)
        fx.sizzle(this.wok.position.x, ON_STOVE + 0.04, this.wok.position.z, 0.07, 1);
    }

    /* ---------------- egg ---------------- */
    const eggA = P
      ? 0.7
      : m.plated
        ? this.final(m, S_EGG, 0.71)
        : m.stepIndex === S_EGG
          ? m.amount
          : this.final(m, S_EGG, 0);
    const eggVisible = P || m.plated || m.stepIndex >= S_EGG;
    const eggOnPlate = P || m.plated || (m.stepIndex === S_PLATE && plateP >= 0.999);
    this.egg.visible = eggVisible && !eggOnPlate;
    this.plateEgg.visible = eggOnPlate;
    if (eggVisible) {
      ramp(this.c, EGG_WHITE, eggA);
      this.whiteMat.color.copy(this.c);
      ramp(this.c, EGG_EDGE, eggA);
      this.edgeMat.color.copy(this.c);
      ramp(this.c, EGG_YOLK, eggA);
      this.yolkMat.color.copy(this.c);
    }
    if (m.stepIndex === S_EGG && !m.plated) {
      const crack = clamp01((f.since - 0.25) / 0.35);
      const s = 0.25 + 0.75 * crack;
      this.egg.scale.set(s, 1, s);
      this.egg.position.y = 0.008 + (1 - crack) * 0.05;
      this.egg.visible = f.since > 0.25;
    } else {
      this.egg.scale.set(1, 1, 1);
      this.egg.position.y = 0.008;
    }
    const egging = m.stepIndex === S_EGG && !m.plated;
    const panHeat = egging ? (m.held ? 1.25 : m.phase === 'cook' ? 0.35 : 0.2) : 0;
    this.flamesPan.update(t, panHeat);
    if (egging && m.phase === 'cook') {
      this.sizzleAcc += dt * (m.held ? 30 : 4);
      while (this.sizzleAcc > 1) {
        this.sizzleAcc -= 1;
        fx.sizzle(this.pan.position.x, ON_STOVE + 0.02, this.pan.position.z, 0.07, 1);
      }
      if (m.held && rand(Math.floor(t * 30) + 3) < dt * 6)
        fx.steam(this.pan.position.x, ON_STOVE + 0.03, this.pan.position.z, 0.05, 0.7);
      if (eggA > 0.82 && rand(Math.floor(t * 40) + 7) < dt * (eggA > 0.92 ? 14 : 5)) {
        fx.smoke(this.pan.position.x, ON_STOVE + 0.03, this.pan.position.z, eggA);
      }
    }

    /* ---------------- plate ---------------- */
    // Showcase: as much rice as was actually scooped (a little is always there to look at).
    const plating = P
      ? 1
      : m.plated
        ? Math.max(0.2, this.final(m, S_PLATE, 1))
        : m.stepIndex === S_PLATE
          ? plateP
          : 0;
    const scoopS = clamp01((t - this.scoopAt) / 0.3);
    const grow = plating > 0 ? Math.sqrt(plating) : 0;
    const pop = bump(scoopS) * 0.08;
    const tossFinal = P ? 0.95 : m.plated ? this.final(m, S_TOSS, 1) : tossP;
    this.mound.visible = grow > 0.01;
    this.mound.scale.set(0.088 * grow * (1 + pop), 0.088 * grow * (1 - pop * 0.5), 0.088 * grow * (1 + pop));
    mixColor(this.c, 0xf3e7cf, PAL.nasgor, 0.25 + 0.75 * tossFinal);
    this.moundMat.color.copy(this.c);
    const pgN = Math.round(this.plateMax * grow);
    for (let i = 0; i < pgN; i++) {
      const a = rand(i + 70) * Math.PI * 2;
      const u = Math.sqrt(rand(i + 170));
      const r = 0.088 * grow * u * 0.98;
      const y = 0.088 * grow * 0.62 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.001;
      setInstance(
        this.plateGrains,
        i,
        Math.cos(a) * r,
        y,
        Math.sin(a) * r,
        rand(i) * 3,
        rand(i + 2) * 6,
        rand(i + 3) * 3,
      );
      if (i % 5 === 0) mixColor(this.c, PAL.rice, 0x8a4520, tossFinal);
      else mixColor(this.c, PAL.rice, PAL.nasgor, tossFinal * (0.6 + 0.4 * rand(i + 9)));
      this.plateGrains.setColorAt(i, this.c);
    }
    this.plateGrains.count = pgN;
    this.plateGrains.instanceMatrix.needsUpdate = true;
    if (this.plateGrains.instanceColor) this.plateGrains.instanceColor.needsUpdate = true;
    if (eggOnPlate) {
      const top = 0.088 * grow * 0.62;
      this.plateEgg.position.set(0.004, top - 0.004, 0.006);
      this.plateEgg.rotation.set(-0.2, 0.4, 0.12);
      this.plateEgg.scale.setScalar(0.92);
    }
    const garnishOn = P || m.plated || (m.stepIndex === S_PLATE && plateP >= 0.999);
    if (garnishOn && this.garnishAt < 0) this.garnishAt = t;
    if (!garnishOn) this.garnishAt = -10;
    const gs = garnishOn ? (m.plated ? 1 : clamp01((t - this.garnishAt) / 0.35)) : 0;
    this.garnish.visible = gs > 0.01;
    this.garnish.scale.setScalar(0.4 + 0.6 * gs + bump(gs) * 0.15);
    this.flakes.count = garnishOn ? FLAKES : 0;
    if (garnishOn) {
      const top = 0.088 * grow * 0.62;
      for (let i = 0; i < FLAKES; i++) {
        const [x, z] = discPoint(i + 300, 0.055);
        const r = Math.hypot(x, z) / 0.088;
        setInstance(
          this.flakes,
          i,
          x,
          top * Math.sqrt(Math.max(0, 1 - r * r)) + 0.003,
          z,
          rand(i) * 2,
          rand(i + 1) * 6,
          0,
        );
      }
      this.flakes.instanceMatrix.needsUpdate = true;
    }
    const scooping = m.stepIndex === S_PLATE && !m.plated && (m.phase === 'cook' || m.phase === 'ready');
    this.scoop.visible = scooping && plateP < 0.999;
    if (this.scoop.visible) {
      const sw = Math.min(1, scoopS);
      const dip = bump(sw);
      this.scoop.position.set(-0.04 + sw * 0.02, 0.12 - dip * 0.06, -0.06 + dip * 0.04);
      this.scoop.rotation.set(0.5 - dip * 0.8, 0.3, 0.2);
    }
  }

  /** Steps up to and including `i` are still on screen as the "current" stage. */
  private stepIndexAtMost(m: ActorFrame['m'], i: number): boolean {
    return !m.plated && m.stepIndex <= i;
  }

  private final(m: ActorFrame['m'], i: number, fallback: number): number {
    const v = m.finals[i];
    return v === undefined || Number.isNaN(v) ? fallback : v;
  }
}
