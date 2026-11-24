/**
 * Stage flourishes for taps and super pulls (puller bobs, '+N' floaters, SUPER! and combo text,
 * ring flash). The Host's director and a far-away mirror screen drive the same effects, so both
 * stages look alike.
 */
import type { Hud } from './hud';
import { TEAMS, type Team } from './logic';
import type { TarikScene } from './scene';
import { STR } from './strings';
import { TEAM_COLOR } from './views';

/** '+N' floaters are emitted at most this often. */
export const FLOAT_MS = 500;

export class StageEffects {
  private readonly floatTaps: Record<Team, number> = { red: 0, blue: 0 };
  private floatTurn = 0;
  private lastFloat = Number.NEGATIVE_INFINITY;
  private readonly anchor = { x: 0, y: 0 };

  constructor(
    private readonly scene: TarikScene,
    private readonly hud: Hud,
  ) {}

  /** Counted taps landed for a team: pullers dig in and the next floater grows. */
  taps(team: Team, n: number): void {
    if (n <= 0) return;
    this.floatTaps[team] += n;
    this.scene.teamTap(team, n);
  }

  /** A new pull starts: forget taps of the last round and wait a full interval for the first floater. */
  resetFloats(t: number): void {
    this.floatTaps.red = 0;
    this.floatTaps.blue = 0;
    this.lastFloat = t;
  }

  /** '+N' floaters near each team for the taps since the last ones, bigger for the stronger side. */
  floats(t: number, stronger: Team): void {
    if (t - this.lastFloat < FLOAT_MS) return;
    this.lastFloat = t;
    for (const team of TEAMS) {
      const n = this.floatTaps[team];
      this.floatTaps[team] = 0;
      if (n <= 0) continue;
      const strong = team === stronger;
      const a = this.scene.headAnchor(team, this.anchor);
      this.floatTurn = (this.floatTurn + 1) % 3;
      const side = team === 'red' ? -1 : 1;
      this.hud.float(STR.plus(n), a.x - side * 10 + (this.floatTurn - 1) * 22, a.y - 140, {
        kind: 'plus',
        size: strong ? 40 : 30,
        rotate: side * 7,
        rise: strong ? 50 : 40,
      });
    }
  }

  /** A super pull: the world lurches, the ring flashes and SUPER! (plus the combo) pops up. */
  superPull(team: Team, combo: number): void {
    this.scene.superPull(team);
    this.hud.flashRing(TEAM_COLOR[team]);
    const a = this.scene.headAnchor(team, this.anchor);
    const side = team === 'red' ? -1 : 1;
    this.hud.float(STR.superFloat, a.x + side * 16, a.y - 215, {
      kind: 'super',
      size: 46,
      color: '#FFC928',
      rotate: side * 6,
      rise: 60,
    });
    if (combo >= 2) {
      this.hud.float(STR.combo(combo), a.x + side * 30, a.y - 92, {
        kind: 'combo',
        rotate: side * 6,
        rise: 26,
        duration: 1300,
      });
    }
  }
}
