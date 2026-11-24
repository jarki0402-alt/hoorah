/**
 * Stage flourishes shared by the Host's driver and a far-away mirror screen: the world effect plus
 * the floating HUD text, and the name tags over the runners. No sounds, no vibration, no rules.
 */
import type { Hud } from './hud';
import type { DeathKind, Dir, Mode } from './logic';
import { TUNING } from './logic';
import type { NyebrangScene, StageModel } from './scene';
import { STR } from './strings';

/** Name, ring colour and dimming (phone dropped) of a runner's tag; null hides it. */
export type TagInfo = (id: number) => { name: string; color: string; dim: boolean } | null;

export class StageEffects {
  private readonly pt = { x: 0, y: 0 };

  constructor(
    private readonly scene: NyebrangScene,
    private readonly hud: Hud,
  ) {}

  /** A hop started from (x, row): a puff of dust behind it. */
  hop(id: number, x: number, row: number): void {
    this.scene.fxDust(x, row);
    this.scene.landed(id);
  }

  /** The Host's dust position for a hop event: the target column on the row it left. */
  static dustRow(row: number, dir: Dir): number {
    return row - (dir === 'up' ? 1 : dir === 'down' ? -1 : 0);
  }

  death(kind: DeathKind, x: number, row: number, mode: Mode): void {
    if (kind === 'water' || kind === 'drift') this.scene.fxSplash(x, row);
    else if (kind !== 'edge') this.scene.fxHit(x, row);
    this.scene.toStage(x, row + 0.6, this.pt);
    this.hud.pop(mode === 'balapan' ? STR.outBack(TUNING.respawnS) : STR.out, this.pt.x, this.pt.y, 'red');
  }

  near(x: number, row: number): void {
    this.scene.toStage(x, row + 0.7, this.pt);
    this.hud.pop(`${STR.near} ${STR.nearPts(TUNING.nearPoints)}`, this.pt.x, this.pt.y, 'yellow');
  }

  finish(place: number, x: number, row: number): void {
    this.scene.fxFinish(x, row);
    this.scene.toStage(x, row + 0.7, this.pt);
    this.hud.pop(STR.finish(place), this.pt.x, this.pt.y, 'green');
  }

  respawn(id: number): void {
    this.scene.respawned(id);
  }

  /** Name tags over the runners still on the field. */
  tags(m: StageModel, info: TagInfo): void {
    if (m.phase === 'setup' || m.phase === 'roundEnd' || m.phase === 'final' || m.phase === 'ended') {
      this.hud.tags([]);
      return;
    }
    const list: { name: string; color: string; x: number; y: number; dim: boolean }[] = [];
    for (const r of m.roster) {
      if (r.state === 'out' || r.state === 'dead') continue;
      const tag = info(r.id);
      if (!tag) continue;
      const p = m.pose(r);
      this.scene.toStage(p.x, p.row + 1.05 + p.lift * 0.55, this.pt);
      list.push({ name: tag.name, color: tag.color, x: this.pt.x, y: this.pt.y, dim: tag.dim });
    }
    this.hud.tags(list);
  }
}
