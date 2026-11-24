/**
 * Stage flourishes shared by the Host's director and a far-away mirror screen: the world action
 * plus the floating HUD text over the racer's head. No sounds and no rules here.
 */
import type { Hud } from './hud';
import type { KarungScene } from './scene';
import { STR } from './strings';

export class StageEffects {
  private readonly anchor = { x: 0, y: 0 };

  constructor(
    private readonly scene: KarungScene,
    private readonly hud: Hud,
  ) {}

  /** A racer tripped: fall over and 'GUBRAK!'. */
  stumble(id: number, durMs: number): void {
    this.scene.stumble(id, durMs);
    const a = this.scene.headAnchor(id, this.anchor);
    if (a)
      this.hud.float(STR.stumbleFloat, a.x, a.y - 26, {
        kind: 'stumble',
        size: 30,
        color: '#F2453D',
        rotate: 8,
      });
  }

  /** 'SUPER!' over a racer that just made a super hop, and the beat ring flashes in its colour. */
  superHop(id: number, color: string | null): void {
    const a = this.scene.headAnchor(id, this.anchor);
    if (a)
      this.hud.float(STR.superFloat, a.x + 20, a.y - 40, {
        kind: 'super',
        size: 34,
        color: '#FFC928',
        rotate: -6,
        rise: 60,
      });
    if (color) this.hud.flashRing(color);
  }

  /** A racer crossed the line in `place`; `first` breaks the ribbon. */
  finish(id: number, place: number, first: boolean): void {
    this.scene.finish(id, first);
    const a = this.scene.headAnchor(id, this.anchor);
    if (a)
      this.hud.float(STR.finishedFloat(place), a.x, a.y - 30, {
        kind: 'super',
        size: 40,
        color: first ? '#FFC928' : '#FFFFFF',
        rise: 40,
        duration: 1300,
      });
  }
}
