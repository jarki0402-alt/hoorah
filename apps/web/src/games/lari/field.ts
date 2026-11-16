/**
 * Obstacles and coins on the roofs, drawn from instanced pools of the props pack models: one
 * pool set per obstacle model and level of detail, filled as obstacles come into range and
 * released behind the camera. Obstacles switch to their full model once they are within
 * `NEAR_LOD` metres (weak GPUs keep the light ones). Coins spin and bob; taken coins vanish
 * (the sparkle is in fx.ts).
 */
import * as THREE from 'three';
import { type LariAssets, model, type Part } from './assets';
import type { LariRun } from './logic';
import { LARI_MAT } from './materials';
import { AC_ROW_STEP, OBSTACLE_MODELS, obstacleModel } from './models';
import { lowerBound, type Obstacle } from './track';
import { ModelPool, NEAR_LOD } from './world';

const AHEAD = 330;
const BEHIND = 25;

interface PlacedObstacle {
  key: string;
  lod: 0 | 1;
  pools: ModelPool[];
  handles: number[];
}

export class ObstacleField {
  readonly root = new THREE.Group();
  /** Model name -> [full, light] pools. */
  private readonly pools = new Map<string, [ModelPool, ModelPool]>();
  private readonly placed = new Map<number, PlacedObstacle>();
  /** Coins close to the camera (full model) and farther away (light model). */
  private readonly coins: THREE.InstancedMesh;
  private readonly farCoins: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor(assets: LariAssets, lowDetail: boolean) {
    const reflect = lowDetail ? 0 : 0.5;
    const materialFor = (p: Part): THREE.Material => {
      if (p.material === 'cloth') return LARI_MAT.fabric();
      if (p.material === 'duck') return LARI_MAT.duck();
      return LARI_MAT.surface(reflect);
    };
    const caps: Record<string, number> = { block3: 120, low2: 12, high2: 12 };
    for (const name of OBSTACLE_MODELS) {
      const cap = caps[name] ?? 24;
      const full = new ModelPool(model(assets, lowDetail ? `${name}@1` : name), cap, materialFor, this.root);
      const light = new ModelPool(model(assets, `${name}@1`), cap, materialFor, this.root);
      this.pools.set(name, [full, light]);
    }
    const coinMesh = (name: string, cap: number) => {
      const m = new THREE.InstancedMesh(model(assets, name)[0]!.geometry, LARI_MAT.gold(lowDetail), cap);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
      return m;
    };
    this.coins = coinMesh(lowDetail ? 'coin@1' : 'coin', 80);
    this.farCoins = coinMesh('coin@1', 220);
  }

  private syncedAt = Number.NaN;

  /** Sync obstacles with the track around `camD` and pose the coins (`time` in seconds). */
  update(run: LariRun, camD: number, time: number): void {
    const W = run.tuning.laneW;
    // Obstacles only change every few metres; coins move every frame.
    if (!(Math.abs(camD - this.syncedAt) < 2)) {
      this.syncedAt = camD;
      this.syncObstacles(run, camD, W);
    }
    this.poseCoins(run, camD, time, W);
  }

  private syncObstacles(run: LariRun, camD: number, W: number): void {
    const obs = run.track.obstacles;
    const live = new Set<number>();
    for (let i = Math.max(0, lowerBound(obs, camD - BEHIND - 12)); i < obs.length; i++) {
      const o = obs[i]!;
      if (o.d - o.len / 2 > camD + AHEAD) break;
      if (o.kind === 'gap' || o.d + o.len / 2 < camD - BEHIND) continue;
      live.add(o.id);
      const lod: 0 | 1 = o.d - camD > NEAR_LOD || o.d - camD < -12 ? 1 : 0;
      const had = this.placed.get(o.id);
      if (had && had.lod === lod) continue;
      if (had) this.release(had);
      const key = obstacleModel(o);
      const pair = this.pools.get(key);
      if (!pair) continue;
      this.placed.set(o.id, this.place(o, key, pair[lod], lod, W));
    }
    for (const [id, p] of this.placed) {
      if (live.has(id)) continue;
      this.release(p);
      this.placed.delete(id);
    }
    for (const pair of this.pools.values()) for (const pool of pair) pool.flush();
  }

  private place(o: Obstacle, key: string, pool: ModelPool, lod: 0 | 1, W: number): PlacedObstacle {
    const x = o.span === 3 ? 0 : o.lane * W;
    const out: PlacedObstacle = { key, lod, pools: [], handles: [] };
    if (o.kind === 'block' && o.variant === 3) {
      const n = Math.max(1, Math.round(o.len / AC_ROW_STEP));
      const step = o.len / n;
      for (let k = 0; k < n; k++) {
        this.m.makeTranslation(x, 0, -(o.d - o.len / 2 + step * (k + 0.5)));
        out.pools.push(pool);
        out.handles.push(pool.add(this.m));
      }
    } else {
      this.m.makeTranslation(x, 0, -o.d);
      out.pools.push(pool);
      out.handles.push(pool.add(this.m));
    }
    return out;
  }

  private release(p: PlacedObstacle): void {
    p.pools.forEach((pool, k) => {
      const h = p.handles[k]!;
      if (h >= 0) pool.remove(h);
    });
  }

  private poseCoins(run: LariRun, camD: number, time: number, W: number): void {
    const coins = run.track.coins;
    let n = 0;
    let f = 0;
    const nearCap = this.coins.instanceMatrix.count;
    const farCap = this.farCoins.instanceMatrix.count;
    for (let i = Math.max(0, lowerBound(coins, camD - 12)); i < coins.length; i++) {
      const c = coins[i]!;
      if (c.d > camD + 220) break;
      if (c.taken) continue;
      const near = c.d - camD < NEAR_LOD;
      if (near ? n >= nearCap : f >= farCap) continue;
      this.e.set(0, time * 3.2 + c.d * 0.35, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(c.lane * W, c.y + Math.sin(time * 4 + c.d) * 0.06, -c.d), this.q, this.s);
      if (near) this.coins.setMatrixAt(n++, this.m);
      else this.farCoins.setMatrixAt(f++, this.m);
    }
    this.coins.count = n;
    this.farCoins.count = f;
    this.coins.instanceMatrix.needsUpdate = true;
    this.farCoins.instanceMatrix.needsUpdate = true;
  }
}
