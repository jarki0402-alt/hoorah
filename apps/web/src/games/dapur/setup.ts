/**
 * The in-game setup on the main screen, driven from the Host's phone: kitchen, difficulty and
 * (split kitchens) who works which side. Pure state; the director mirrors it on the screen and in
 * the phone menus.
 */
import {
  DIFFICULTIES,
  type Difficulty,
  KITCHEN_DEFS,
  KITCHENS,
  type KitchenId,
  recommended,
  type Side,
} from './kitchens';

export type SetupStep = 'kitchen' | 'level' | 'sides';

/** Sisi Persiapan gets ceil(n/2) by join order, Sisi Masak the rest. */
export function assignSides(ids: readonly number[]): Map<number, Side> {
  const prep = Math.ceil(ids.length / 2);
  const out = new Map<number, Side>();
  ids.forEach((id, i) => {
    out.set(id, i < prep ? 0 : 1);
  });
  return out;
}

export type SetupAction =
  | { kind: 'none' }
  | { kind: 'changed' }
  | { kind: 'start' }
  /** Not allowed (e.g. a swap that would empty a side). */
  | { kind: 'refused' };

export class Setup {
  kitchen: KitchenId;
  difficulty: Difficulty;
  step: SetupStep = 'kitchen';
  /** Cooks in join order (humans, then the computer helper when playing alone). */
  order: number[] = [];
  readonly sides = new Map<number, Side>();
  private touched: boolean;

  constructor(defaults: { kitchen?: KitchenId | null; difficulty?: Difficulty | null; humans: number }) {
    this.touched = !!defaults.kitchen;
    this.kitchen = defaults.kitchen ?? recommended(defaults.humans);
    this.difficulty = defaults.difficulty ?? 'normal';
  }

  get split(): boolean {
    return KITCHEN_DEFS[this.kitchen].split;
  }

  /**
   * The lineup changed. Everyone keeps their side; newcomers join the smaller side (Persiapan on
   * a tie); if a side ran empty, the last cook of the other side moves over. The suggested
   * kitchen follows the head count until the Host picks one.
   */
  sync(ids: readonly number[], humans: number): void {
    const fresh = this.order.length === 0;
    this.order = [...ids];
    for (const id of [...this.sides.keys()]) if (!ids.includes(id)) this.sides.delete(id);
    if (fresh) {
      for (const [id, s] of assignSides(ids)) this.sides.set(id, s);
    } else {
      for (const id of ids) {
        if (this.sides.has(id)) continue;
        this.sides.set(id, this.count(1) < this.count(0) ? 1 : 0);
      }
      this.rebalance();
    }
    if (!this.touched) this.kitchen = recommended(humans);
  }

  count(side: Side): number {
    let n = 0;
    for (const s of this.sides.values()) if (s === side) n++;
    return n;
  }

  sideOf(id: number): Side {
    return this.sides.get(id) ?? 0;
  }

  members(side: Side): number[] {
    return this.order.filter((id) => this.sideOf(id) === side);
  }

  private rebalance(): void {
    if (this.order.length < 2) return;
    for (const side of [0, 1] as const) {
      if (this.count(side) > 0) continue;
      const other = this.members(side === 0 ? 1 : 0);
      const last = other[other.length - 1];
      if (last !== undefined) this.sides.set(last, side);
    }
  }

  /** Move a cook to the other side; when that would empty their side, trade with the last cook there. */
  swap(id: number): SetupAction {
    if (!this.sides.has(id) || this.order.length < 2) return { kind: 'refused' };
    const from = this.sideOf(id);
    const to: Side = from === 0 ? 1 : 0;
    this.sides.set(id, to);
    if (this.count(from) === 0) {
      const others = this.members(to).filter((x) => x !== id);
      const back = others[others.length - 1];
      if (back === undefined) {
        this.sides.set(id, from);
        return { kind: 'refused' };
      }
      this.sides.set(back, from);
    }
    return { kind: 'changed' };
  }

  /** A phone menu action from the Host. */
  act(id: string, value: string | undefined): SetupAction {
    switch (this.step) {
      case 'kitchen':
        if (id === 'pick' && value && (KITCHENS as readonly string[]).includes(value)) {
          if (this.kitchen === value) return { kind: 'none' };
          this.kitchen = value as KitchenId;
          this.touched = true;
          return { kind: 'changed' };
        }
        if (id === 'next') {
          this.touched = true;
          this.step = 'level';
          return { kind: 'changed' };
        }
        return { kind: 'none' };
      case 'level':
        if (id === 'pick' && value && (DIFFICULTIES as readonly string[]).includes(value)) {
          if (this.difficulty === value) return { kind: 'none' };
          this.difficulty = value as Difficulty;
          return { kind: 'changed' };
        }
        if (id === 'back') {
          this.step = 'kitchen';
          return { kind: 'changed' };
        }
        if (id === 'next') {
          this.step = 'sides';
          return { kind: 'changed' };
        }
        if (id === 'start') return { kind: 'start' };
        return { kind: 'none' };
      case 'sides':
        if (id === 'pick' && value) {
          const pid = Number(value);
          return Number.isInteger(pid) ? this.swap(pid) : { kind: 'none' };
        }
        if (id === 'back') {
          this.step = 'level';
          return { kind: 'changed' };
        }
        if (id === 'start') return { kind: 'start' };
        return { kind: 'none' };
    }
  }
}
